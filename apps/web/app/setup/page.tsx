'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useWriteContract, useChainId, useSwitchChain } from 'wagmi'
import { base } from 'wagmi/chains'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ALLOCATION_PRESETS, type AllocationPresetType, CONTRACTS, FACTORY_ABI, VAULT_ABI, ERC20_ABI } from '@/lib/contracts'
import { useUsdcBalance } from '@/lib/hooks'
import { storeVault, getStoredVault } from '@/lib/store'
import {
  type OrchestratorState,
  type TxStep,
  INITIAL_STATE,
  getStateMessage,
  extractVaultAddressFromReceipt,
  verifyVaultExists,
  verifyAdvancedVaultExists,
  verifyAllowance,
  waitForReceipt,
  verifyVaultHasHoldings,
  parseTransactionError,
  publicClient,
} from '@/lib/tx-orchestrator'
import { parseUnits, type Address, type Hash } from 'viem'

// UI step before processing
type SetupStep = 'allocation' | 'explicit-rules' | 'amount' | 'review' | 'processing'

// Threshold presets with trade-off labels
const THRESHOLD_PRESETS = [
  { value: 3, label: 'Tight', description: 'Rebalances often, higher fees' },
  { value: 5, label: 'Standard', description: 'Balanced approach' },
  { value: 10, label: 'Relaxed', description: 'Rebalances rarely, lower fees' },
] as const

// Allocation steps for explicit rules (5% increments)
const ALLOCATION_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95] as const

export default function SetupPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()

  // UI state
  const [setupStep, setSetupStep] = useState<SetupStep>('allocation')
  const [selectedAllocation, setSelectedAllocation] = useState<AllocationPresetType | null>(null)
  const [amount, setAmount] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  // Explicit rules state (custom mode)
  const [customBtcPct, setCustomBtcPct] = useState(50)
  const [customThresholdIndex, setCustomThresholdIndex] = useState(1) // Standard by default

  // Transaction orchestrator state
  const [txState, setTxState] = useState<OrchestratorState>(INITIAL_STATE)

  // Track if we're currently orchestrating to prevent double-execution
  const orchestratingRef = useRef(false)

  // Determine if we're in explicit rules mode
  const isExplicitRulesMode = setupStep === 'explicit-rules' || (setupStep !== 'allocation' && selectedAllocation === null)

  // Amount in wei for contract calls
  const depositAmountWei = amount ? parseUnits(amount, 6) : BigInt(0)

  // Contract hooks
  const { formatted: usdcBalance } = useUsdcBalance()

  // Chain check
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isWrongChain = chainId !== base.id

  // Write contract hooks - we'll use these imperatively
  const { writeContractAsync } = useWriteContract()

  const factoryConfigured = CONTRACTS.factory !== '0x0000000000000000000000000000000000000000'

  // Check for existing vault on allocation select
  const [existingVaultAddress, setExistingVaultAddress] = useState<Address | null>(null)

  // Wait for hydration before checking connection state
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect if not connected (only after mount to avoid hydration mismatch)
  useEffect(() => {
    if (mounted && !isConnected) {
      router.push('/')
    }
  }, [mounted, isConnected, router])

  // Get current threshold value
  const currentThreshold = THRESHOLD_PRESETS[customThresholdIndex].value

  // ============================================
  // CHAIN-VERIFIED TRANSACTION ORCHESTRATION
  // ============================================

  const runOrchestration = useCallback(async () => {
    if (!address || orchestratingRef.current) return
    if (!isExplicitRulesMode && !selectedAllocation) return
    orchestratingRef.current = true

    const allocation = selectedAllocation?.id ?? 0
    const btcBps = isExplicitRulesMode ? customBtcPct * 100 : (selectedAllocation?.btcPct ?? 50) * 100
    const usdcBps = 10000 - btcBps
    const driftBps = isExplicitRulesMode ? currentThreshold * 100 : 500 // 5% default for simple mode
    let currentVaultAddress = existingVaultAddress

    console.log('=== ORCHESTRATION START ===')
    console.log('Address:', address)
    console.log('Chain ID:', chainId, '(expected:', base.id, ')')
    console.log('Mode:', isExplicitRulesMode ? 'Explicit Rules' : 'Preset')
    console.log('Allocation:', isExplicitRulesMode ? `${customBtcPct}/${100 - customBtcPct} (BPS: ${btcBps}/${usdcBps})` : allocation)
    console.log('Drift threshold:', driftBps, 'bps')
    console.log('Deposit amount (wei):', depositAmountWei.toString())
    console.log('Existing vault:', existingVaultAddress)

    // Always force switch to Base - wagmi state may be stale
    console.log('Ensuring wallet is on Base network...')
    try {
      await switchChain({ chainId: base.id })
      console.log('Chain switch completed or already on Base')
      await new Promise(r => setTimeout(r, 500))
    } catch (switchError) {
      console.error('Failed to switch/confirm chain:', switchError)
      setTxState(prev => ({
        ...prev,
        subState: 'error',
        error: {
          title: 'Wrong Network',
          message: 'Please switch to Base network in your wallet.',
          action: 'Approve the network switch and try again.',
        },
      }))
      orchestratingRef.current = false
      return
    }

    try {
      // ============================================
      // STEP 1: CREATE VAULT (if needed)
      // ============================================
      if (!currentVaultAddress) {
        console.log('Checking if vault already exists...')
        let existingVault: Address | null = null
        if (isExplicitRulesMode) {
          existingVault = await verifyAdvancedVaultExists(address, btcBps, usdcBps, driftBps)
        } else {
          existingVault = await verifyVaultExists(address, allocation)
        }
        if (existingVault) {
          console.log('Found existing vault on-chain:', existingVault)
          currentVaultAddress = existingVault
          setTxState(prev => ({
            ...prev,
            vaultAddress: existingVault,
            vaultVerified: true,
          }))
        } else {
          setTxState(prev => ({
            ...prev,
            step: 'create_vault',
            subState: 'awaiting_wallet',
            error: null,
          }))

          console.log('Creating vault...')
          let createHash: Hash

          try {
            if (isExplicitRulesMode) {
              console.log('Calling createAdvancedVault with:', btcBps, usdcBps, driftBps)
              createHash = await writeContractAsync({
                address: CONTRACTS.factory,
                abi: FACTORY_ABI,
                functionName: 'createAdvancedVault',
                args: [btcBps, usdcBps, driftBps],
                chainId: base.id,
              })
            } else {
              console.log('Calling createVault with allocation:', allocation)
              createHash = await writeContractAsync({
                address: CONTRACTS.factory,
                abi: FACTORY_ABI,
                functionName: 'createVault',
                args: [allocation],
                chainId: base.id,
              })
            }
            console.log('createVault tx hash:', createHash)
          } catch (error) {
            console.error('=== CREATE VAULT ERROR ===', error)
            const parsed = parseTransactionError(error)
            setTxState(prev => ({ ...prev, subState: 'error', error: parsed }))
            orchestratingRef.current = false
            return
          }

          setTxState(prev => ({ ...prev, subState: 'tx_submitted', txHash: createHash }))

          console.log('Waiting for vault creation receipt...')
          setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))

          const extractedVault = await extractVaultAddressFromReceipt(createHash)

          if (extractedVault) {
            console.log('Vault address confirmed from event logs:', extractedVault)
            currentVaultAddress = extractedVault
          } else {
            console.log('Receipt extraction failed, falling back to on-chain check...')
            let fallbackVault: Address | null = null
            for (const delay of [3000, 8000, 15000]) {
              console.log(`Waiting ${delay}ms before checking on-chain...`)
              await new Promise(r => setTimeout(r, delay))

              try {
                if (isExplicitRulesMode) {
                  fallbackVault = await verifyAdvancedVaultExists(address, btcBps, usdcBps, driftBps)
                } else {
                  fallbackVault = await verifyVaultExists(address, allocation)
                }
                if (fallbackVault) {
                  console.log('Found vault on-chain:', fallbackVault)
                  break
                }
              } catch (rpcError) {
                console.warn('RPC error during fallback check:', rpcError)
              }
            }

            if (!fallbackVault) {
              setTxState(prev => ({
                ...prev,
                subState: 'error',
                error: {
                  title: 'Vault Creation Pending',
                  message: 'Transaction submitted but confirmation is taking longer than expected.',
                  action: 'Wait a moment and retry.',
                },
              }))
              orchestratingRef.current = false
              return
            }

            currentVaultAddress = fallbackVault
          }
          setTxState(prev => ({
            ...prev,
            vaultAddress: currentVaultAddress,
            vaultVerified: true,
            subState: 'confirmed',
          }))

          console.log('Vault created and verified:', currentVaultAddress)
          await new Promise(r => setTimeout(r, 3000))
        }
      }

      if (!currentVaultAddress) {
        setTxState(prev => ({
          ...prev,
          subState: 'error',
          error: { title: 'No Vault', message: 'Vault address not available.', action: 'Please try again.' },
        }))
        orchestratingRef.current = false
        return
      }

      // ============================================
      // STEP 1.5: ACCEPT OWNERSHIP (if needed)
      // ============================================
      console.log('Checking vault ownership...')
      try {
        const currentOwner = await publicClient.readContract({
          address: currentVaultAddress,
          abi: VAULT_ABI,
          functionName: 'owner',
        })

        if (currentOwner.toLowerCase() !== address.toLowerCase()) {
          const pendingOwner = await publicClient.readContract({
            address: currentVaultAddress,
            abi: VAULT_ABI,
            functionName: 'pendingOwner',
          })

          if (pendingOwner.toLowerCase() === address.toLowerCase()) {
            console.log('Accepting vault ownership...')
            setTxState(prev => ({ ...prev, step: 'create_vault', subState: 'awaiting_wallet' }))

            try {
              const acceptHash = await writeContractAsync({
                address: currentVaultAddress,
                abi: VAULT_ABI,
                functionName: 'acceptOwnership',
                chainId: base.id,
              })

              setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))
              const acceptSuccess = await waitForReceipt(acceptHash)
              if (!acceptSuccess) throw new Error('Accept ownership transaction failed')
              console.log('Ownership accepted!')
            } catch (acceptError) {
              console.error('Failed to accept ownership:', acceptError)
              const parsed = parseTransactionError(acceptError)
              setTxState(prev => ({ ...prev, subState: 'error', error: parsed }))
              orchestratingRef.current = false
              return
            }
          } else {
            setTxState(prev => ({
              ...prev,
              subState: 'error',
              error: { title: 'Ownership Error', message: 'You are not the owner of this vault.', action: 'Please create a new vault.' },
            }))
            orchestratingRef.current = false
            return
          }
        }
      } catch (ownerError) {
        console.error('Error checking ownership:', ownerError)
      }

      // ============================================
      // STEP 2: APPROVE USDC (if needed)
      // ============================================
      console.log('Checking USDC allowance...')
      const hasAllowance = await verifyAllowance(address, currentVaultAddress, depositAmountWei)

      if (!hasAllowance) {
        setTxState(prev => ({ ...prev, step: 'approve_usdc', subState: 'awaiting_wallet', error: null }))

        console.log('Approving USDC...')
        let approveHash: Hash

        try {
          approveHash = await writeContractAsync({
            address: CONTRACTS.usdc,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [currentVaultAddress, depositAmountWei],
            chainId: base.id,
          })
        } catch (error) {
          console.error('=== APPROVE ERROR ===', error)
          const parsed = parseTransactionError(error)
          setTxState(prev => ({ ...prev, subState: 'error', error: parsed }))
          orchestratingRef.current = false
          return
        }

        setTxState(prev => ({ ...prev, subState: 'tx_submitted', txHash: approveHash }))

        setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))
        const approveSuccess = await waitForReceipt(approveHash)
        if (!approveSuccess) {
          setTxState(prev => ({
            ...prev,
            subState: 'error',
            error: { title: 'Approval Failed', message: 'USDC approval transaction failed.', action: 'Please try again.' },
          }))
          orchestratingRef.current = false
          return
        }

        console.log('Verifying allowance on-chain...')
        let allowanceVerified = false
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(r => setTimeout(r, 2000))
          allowanceVerified = await verifyAllowance(address, currentVaultAddress, depositAmountWei)
          if (allowanceVerified) break
        }
        if (!allowanceVerified) {
          setTxState(prev => ({
            ...prev,
            subState: 'error',
            error: { title: 'Verification Failed', message: 'Could not verify USDC allowance.', action: 'Please try again.' },
          }))
          orchestratingRef.current = false
          return
        }

        setTxState(prev => ({ ...prev, allowanceVerified: true, subState: 'confirmed' }))
        await new Promise(r => setTimeout(r, 500))
      } else {
        setTxState(prev => ({ ...prev, allowanceVerified: true }))
      }

      // ============================================
      // STEP 3: DEPOSIT
      // ============================================
      setTxState(prev => ({ ...prev, step: 'deposit', subState: 'awaiting_wallet', error: null }))

      console.log('Depositing USDC...')
      let depositHash: Hash

      try {
        depositHash = await writeContractAsync({
          address: currentVaultAddress,
          abi: VAULT_ABI,
          functionName: 'depositUSDC',
          args: [depositAmountWei],
          chainId: base.id,
        })
      } catch (error) {
        console.error('=== DEPOSIT ERROR ===', error)
        const parsed = parseTransactionError(error)
        setTxState(prev => ({ ...prev, subState: 'error', error: parsed }))
        orchestratingRef.current = false
        return
      }

      setTxState(prev => ({ ...prev, subState: 'tx_submitted', txHash: depositHash }))

      setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))
      const depositSuccess = await waitForReceipt(depositHash)
      if (!depositSuccess) {
        setTxState(prev => ({
          ...prev,
          subState: 'error',
          error: { title: 'Deposit Failed', message: 'Deposit transaction failed.', action: 'Please try again.' },
        }))
        orchestratingRef.current = false
        return
      }

      const hasHoldings = await verifyVaultHasHoldings(currentVaultAddress)
      if (!hasHoldings) {
        setTxState(prev => ({
          ...prev,
          subState: 'error',
          error: { title: 'Verification Failed', message: 'Could not verify deposit completed.', action: 'Check your vault on Basescan.' },
        }))
        orchestratingRef.current = false
        return
      }

      // ============================================
      // SUCCESS
      // ============================================
      setTxState(prev => ({ ...prev, step: 'complete', subState: 'confirmed', depositVerified: true }))

      if (isExplicitRulesMode) {
        storeVault(address, 100 + customBtcPct, currentVaultAddress)
      } else {
        storeVault(address, allocation, currentVaultAddress)
      }

      console.log('Deposit complete and verified!')
      setTimeout(() => router.push('/portfolio'), 2000)

    } catch (error) {
      console.error('Orchestration error:', error)
      const parsed = parseTransactionError(error)
      setTxState(prev => ({ ...prev, subState: 'error', error: parsed }))
    } finally {
      orchestratingRef.current = false
    }
  }, [address, selectedAllocation, existingVaultAddress, depositAmountWei, writeContractAsync, router, chainId, switchChain, isExplicitRulesMode, customBtcPct, currentThreshold])

  // ============================================
  // UI HANDLERS
  // ============================================

  const handleAllocationSelect = useCallback(async (allocation: AllocationPresetType) => {
    setSelectedAllocation(allocation)
    setInputError(null)

    if (address) {
      const storedVault = getStoredVault(address, allocation.id)
      if (storedVault) {
        setExistingVaultAddress(storedVault)
      } else {
        const onChainVault = await verifyVaultExists(address, allocation.id)
        if (onChainVault) {
          setExistingVaultAddress(onChainVault)
          storeVault(address, allocation.id, onChainVault)
        } else {
          setExistingVaultAddress(null)
        }
      }
    }
  }, [address])

  const handleAmountChange = (value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value)
      setInputError(null)
    }
  }

  const goToExplicitRules = () => {
    setSelectedAllocation(null)
    setSetupStep('explicit-rules')
  }

  const goToAmount = () => {
    if (setupStep === 'explicit-rules' || selectedAllocation) {
      setSetupStep('amount')
    }
  }

  const goToReview = () => {
    const depositAmount = parseFloat(amount)
    if (depositAmount <= 0) {
      setInputError('Please enter an amount')
      return
    }
    if (depositAmount > parseFloat(usdcBalance)) {
      setInputError(`You have ${parseFloat(usdcBalance).toLocaleString()} USDC available`)
      return
    }
    setInputError(null)
    setSetupStep('review')
  }

  const goBack = () => {
    setInputError(null)
    if (setupStep === 'amount') {
      if (isExplicitRulesMode) {
        setSetupStep('explicit-rules')
      } else {
        setSetupStep('allocation')
      }
    }
    if (setupStep === 'review') setSetupStep('amount')
    if (setupStep === 'explicit-rules') {
      setSetupStep('allocation')
      setSelectedAllocation(null)
    }
  }

  const handleConfirm = () => {
    if (!isExplicitRulesMode && !selectedAllocation) return
    if (!factoryConfigured) return
    setSetupStep('processing')
    setTxState(INITIAL_STATE)
    runOrchestration()
  }

  const handleRetry = () => {
    setTxState(INITIAL_STATE)
    runOrchestration()
  }

  const handleCancel = () => {
    setTxState(INITIAL_STATE)
    setSetupStep('review')
  }

  if (!mounted || !isConnected) return null

  // ============================================
  // RENDER: Allocation Selection (Presets)
  // ============================================
  if (setupStep === 'allocation') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={() => router.push('/')}
          className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]"
        >
          Back
        </button>

        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
        </div>

        <h1 className="text-2xl font-semibold mb-2">Choose your ratio</h1>
        <p className="text-[var(--muted)] text-sm mb-8">
          What portion stays in Bitcoin vs dollars?
        </p>

        <div className="space-y-3 flex-1">
          {ALLOCATION_PRESETS.map((allocation) => (
            <button
              key={allocation.id}
              onClick={() => handleAllocationSelect(allocation)}
              className={`w-full p-4 rounded-xl text-left transition-all border ${
                selectedAllocation?.id === allocation.id
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                  : 'border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--muted)]'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{allocation.btcPct}% Bitcoin</div>
                  <div className="text-sm text-[var(--muted)]">
                    {100 - allocation.btcPct}% USDC
                  </div>
                </div>
                {selectedAllocation?.id === allocation.id && (
                  <div className="w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}

          {/* Explicit Rules entry - separate from presets */}
          <div className="pt-4 border-t border-[var(--border)] mt-4">
            <button
              onClick={goToExplicitRules}
              className="w-full p-4 rounded-xl text-left border border-dashed border-[var(--border)] hover:border-[var(--muted)] transition-all"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-[var(--muted)]">Explicit rules</div>
                  <div className="text-sm text-[var(--muted)] opacity-70">
                    Custom allocation and threshold
                  </div>
                </div>
                <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        <Button size="large" onClick={goToAmount} disabled={!selectedAllocation} className="mt-6">
          Continue
        </Button>
      </div>
    )
  }

  // ============================================
  // RENDER: Explicit Rules Mode
  // ============================================
  if (setupStep === 'explicit-rules') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]"
        >
          Back
        </button>

        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
        </div>

        <h1 className="text-2xl font-semibold mb-2">Define your rules</h1>
        <p className="text-[var(--muted)] text-sm mb-2">
          You are setting explicit parameters for your vault.
        </p>
        <p className="text-xs text-[var(--muted)] opacity-70 mb-8">
          These values are immutable once the vault is created.
        </p>

        <div className="space-y-8 flex-1">
          {/* Rule 1: Allocation */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium">Allocation rule</span>
              <span className="text-sm text-[var(--muted)]">BTC / USDC</span>
            </div>

            {/* Allocation selector - constrained steps */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {[10, 25, 50, 75, 90].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setCustomBtcPct(pct)}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                    customBtcPct === pct
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--background-secondary)] text-[var(--muted)] hover:bg-[var(--background-tertiary)]'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* Fine-tune with other values */}
            <select
              value={customBtcPct}
              onChange={(e) => setCustomBtcPct(parseInt(e.target.value))}
              className="w-full p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-sm"
            >
              {ALLOCATION_STEPS.map((pct) => (
                <option key={pct} value={pct}>
                  {pct}% Bitcoin / {100 - pct}% USDC
                </option>
              ))}
            </select>

            {/* Visual bar */}
            <div className="h-2 rounded-full overflow-hidden bg-[var(--border)] flex mt-3">
              <div className="bg-orange-500 transition-all" style={{ width: `${customBtcPct}%` }} />
              <div className="bg-blue-500 transition-all" style={{ width: `${100 - customBtcPct}%` }} />
            </div>
          </div>

          {/* Rule 2: Threshold */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium">Rebalance threshold</span>
              <span className="text-sm text-[var(--muted)]">{currentThreshold}% drift</span>
            </div>

            <p className="text-xs text-[var(--muted)] mb-4">
              Rebalancing triggers when allocation drifts this far from target.
            </p>

            {/* Threshold selector with labels */}
            <div className="space-y-2">
              {THRESHOLD_PRESETS.map((preset, index) => (
                <button
                  key={preset.value}
                  onClick={() => setCustomThresholdIndex(index)}
                  className={`w-full p-3 rounded-lg text-left transition-all border ${
                    customThresholdIndex === index
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                      : 'border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--muted)]'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{preset.label}</span>
                      <span className="text-[var(--muted)] ml-2">({preset.value}%)</span>
                    </div>
                    <span className="text-xs text-[var(--muted)]">{preset.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button size="large" onClick={goToAmount} className="mt-6">
          Continue
        </Button>
      </div>
    )
  }

  // ============================================
  // RENDER: Amount Input
  // ============================================
  if (setupStep === 'amount') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]"
        >
          Back
        </button>

        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
        </div>

        <h1 className="text-2xl font-semibold mb-2">Enter amount</h1>
        <p className="text-[var(--muted)] text-sm mb-8">How much USDC to deposit?</p>

        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="inline-flex items-baseline">
              <span className="text-3xl text-[var(--muted)] mr-1">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="text-5xl font-semibold bg-transparent text-center w-40 focus:outline-none"
                style={{ caretColor: 'var(--primary)' }}
                autoFocus
              />
            </div>
          </div>

          <button onClick={() => setAmount(usdcBalance)} className="mx-auto mb-4">
            <Card variant="default" className="text-center px-6 py-3 hover:bg-[var(--background-tertiary)] transition-colors">
              <p className="text-sm text-[var(--muted)]">
                Available: <span className="text-[var(--foreground)] font-medium">${parseFloat(usdcBalance).toLocaleString()}</span>
              </p>
            </Card>
          </button>

          {inputError && (
            <Card variant="default" className="bg-red-500/10 border border-red-500/20 mt-3">
              <p className="text-sm text-red-400 text-center">{inputError}</p>
            </Card>
          )}
        </div>

        <Button size="large" onClick={goToReview} disabled={!amount || parseFloat(amount) <= 0} className="mt-6">
          Continue
        </Button>
      </div>
    )
  }

  // ============================================
  // RENDER: Review
  // ============================================
  if (setupStep === 'review') {
    const btcPct = isExplicitRulesMode ? customBtcPct : (selectedAllocation?.btcPct ?? 0)
    const btcAmount = (parseFloat(amount) * btcPct / 100)
    const usdcAmount = (parseFloat(amount) * (100 - btcPct) / 100)
    const allocationLabel = isExplicitRulesMode
      ? `Custom: ${customBtcPct}% / ${100 - customBtcPct}%`
      : `${btcPct}% / ${100 - btcPct}%`

    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]"
        >
          Back
        </button>

        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
        </div>

        <h1 className="text-2xl font-semibold mb-8">Review</h1>

        <div className="flex-1 space-y-4">
          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-1">Depositing</div>
            <div className="font-semibold text-2xl">${parseFloat(amount).toLocaleString()}</div>
          </Card>

          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-3">
              {isExplicitRulesMode ? 'Custom allocation' : 'Allocation'}: {allocationLabel}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>Bitcoin</span>
                </div>
                <span className="font-medium">~${btcAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>USDC</span>
                </div>
                <span className="font-medium">~${usdcAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-[var(--border)] flex mt-3">
              <div className="bg-orange-500" style={{ width: `${btcPct}%` }} />
              <div className="bg-blue-500" style={{ width: `${100 - btcPct}%` }} />
            </div>
          </Card>

          {isExplicitRulesMode && (
            <Card variant="default" padding="default">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--muted)]">Rebalance threshold</span>
                <span className="font-medium">
                  {THRESHOLD_PRESETS[customThresholdIndex].label} ({currentThreshold}%)
                </span>
              </div>
            </Card>
          )}

          <Card variant="default" padding="default">
            <p className="text-xs text-[var(--muted)]">
              {existingVaultAddress
                ? 'You will approve USDC spending, then confirm the deposit.'
                : 'You will create your vault, approve USDC spending, then confirm the deposit.'}
              {' '}Each step requires wallet confirmation.
            </p>
          </Card>

          {isWrongChain && (
            <Card variant="default" className="bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-400 mb-3">
                Please switch to Base network to continue.
              </p>
              <Button
                size="default"
                variant="secondary"
                onClick={() => switchChain({ chainId: base.id })}
              >
                Switch to Base
              </Button>
            </Card>
          )}
        </div>

        <Button size="large" onClick={handleConfirm} disabled={!factoryConfigured || isWrongChain} className="mt-8">
          {existingVaultAddress ? 'Deposit' : 'Create Vault & Deposit'}
        </Button>
      </div>
    )
  }

  // ============================================
  // RENDER: Processing
  // ============================================
  const message = getStateMessage(txState)
  const isError = txState.subState === 'error'
  const isComplete = txState.step === 'complete' && txState.subState === 'confirmed'

  return (
    <div className="flex flex-col min-h-[85vh] items-center justify-center">
      <div className="text-center max-w-xs">
        <div className="mb-8">
          {isComplete ? (
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : isError ? (
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 mx-auto rounded-full border-4 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
          )}
        </div>

        <h2 className="text-xl font-semibold mb-2">{message.title}</h2>
        <p className="text-[var(--muted)]">{message.subtitle}</p>

        {isError && txState.error?.action && (
          <p className="text-sm text-[var(--muted)] mt-4">{txState.error.action}</p>
        )}

        {!isError && !isComplete && (
          <div className="mt-8 space-y-3 text-left">
            <StepIndicator
              label="Create vault"
              status={getIndicatorStatus('create_vault', txState)}
              show={!existingVaultAddress}
            />
            <StepIndicator
              label="Approve USDC"
              status={getIndicatorStatus('approve_usdc', txState)}
              show={true}
            />
            <StepIndicator
              label="Deposit funds"
              status={getIndicatorStatus('deposit', txState)}
              show={true}
            />
          </div>
        )}

        {isError && (
          <div className="mt-8 space-y-3">
            <Button size="large" onClick={handleRetry}>
              Try Again
            </Button>
            <button
              onClick={handleCancel}
              className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-3"
            >
              Cancel
            </button>
          </div>
        )}

        {isComplete && (
          <div className="mt-8">
            <Button size="large" onClick={() => router.push('/portfolio')}>
              View Portfolio
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// HELPER COMPONENTS
// ============================================

function StepIndicator({
  label,
  status,
  show,
}: {
  label: string
  status: 'pending' | 'active' | 'complete'
  show: boolean
}) {
  if (!show) return null

  return (
    <div className="flex items-center gap-3 text-sm">
      {status === 'complete' && (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
      {status === 'active' && (
        <div className="w-5 h-5 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin flex-shrink-0" />
      )}
      {status === 'pending' && (
        <div className="w-5 h-5 rounded-full border-2 border-[var(--border)] flex-shrink-0" />
      )}
      <span className={status === 'pending' ? 'text-[var(--muted)]' : ''}>{label}</span>
    </div>
  )
}

function getIndicatorStatus(
  step: TxStep,
  state: OrchestratorState,
): 'pending' | 'active' | 'complete' {
  const { step: currentStep, subState, vaultVerified, allowanceVerified, depositVerified } = state

  if (step === 'create_vault') {
    if (vaultVerified) return 'complete'
    if (currentStep === 'create_vault') return 'active'
    return 'pending'
  }

  if (step === 'approve_usdc') {
    if (allowanceVerified) return 'complete'
    if (currentStep === 'approve_usdc') return 'active'
    if (vaultVerified && currentStep === 'create_vault' && subState === 'confirmed') return 'pending'
    return 'pending'
  }

  if (step === 'deposit') {
    if (depositVerified) return 'complete'
    if (currentStep === 'deposit') return 'active'
    return 'pending'
  }

  return 'pending'
}
