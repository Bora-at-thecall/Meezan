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
  verifyAllowance,
  waitForReceipt,
  verifyVaultHasHoldings,
  parseTransactionError,
  publicClient,
} from '@/lib/tx-orchestrator'
import { parseUnits, type Address, type Hash } from 'viem'

// UI step before processing
type SetupStep = 'allocation' | 'amount' | 'review' | 'processing'

export default function SetupPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()

  // UI state
  const [setupStep, setSetupStep] = useState<SetupStep>('allocation')
  const [selectedAllocation, setSelectedAllocation] = useState<AllocationPresetType | null>(null)
  const [amount, setAmount] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  // Transaction orchestrator state
  const [txState, setTxState] = useState<OrchestratorState>(INITIAL_STATE)

  // Track if we're currently orchestrating to prevent double-execution
  const orchestratingRef = useRef(false)

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

  // ============================================
  // CHAIN-VERIFIED TRANSACTION ORCHESTRATION
  // ============================================

  const runOrchestration = useCallback(async () => {
    if (!address || !selectedAllocation || orchestratingRef.current) return
    orchestratingRef.current = true

    const allocation = selectedAllocation.id
    let currentVaultAddress = existingVaultAddress

    console.log('=== ORCHESTRATION START ===')
    console.log('Address:', address)
    console.log('Chain ID:', chainId, '(expected:', base.id, ')')
    console.log('Allocation:', allocation)
    console.log('Deposit amount (wei):', depositAmountWei.toString())
    console.log('Existing vault:', existingVaultAddress)

    // Always force switch to Base - wagmi state may be stale
    console.log('Ensuring wallet is on Base network...')
    try {
      await switchChain({ chainId: base.id })
      console.log('Chain switch completed or already on Base')
      // Wait for the switch to propagate
      await new Promise(r => setTimeout(r, 500))
    } catch (switchError) {
      // If user rejects or switch fails, abort
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
        // Check if vault already exists on-chain (in case of page refresh)
        console.log('Checking if vault already exists...')
        const existingVault = await verifyVaultExists(address, allocation)
        if (existingVault) {
          console.log('Found existing vault on-chain:', existingVault)
          currentVaultAddress = existingVault
          setTxState(prev => ({
            ...prev,
            vaultAddress: existingVault,
            vaultVerified: true,
          }))
        } else {
          // Need to create vault
          setTxState(prev => ({
            ...prev,
            step: 'create_vault',
            subState: 'awaiting_wallet',
            error: null,
          }))

          console.log('Creating vault...')
          let createHash: Hash

          try {
            console.log('Calling createVault with allocation:', allocation)
            console.log('Factory address:', CONTRACTS.factory)
            console.log('Forcing chain ID:', base.id)
            createHash = await writeContractAsync({
              address: CONTRACTS.factory,
              abi: FACTORY_ABI,
              functionName: 'createVault',
              args: [allocation],
              chainId: base.id, // Force Base chain
            })
            console.log('createVault tx hash:', createHash)
          } catch (error) {
            console.error('=== CREATE VAULT ERROR ===')
            console.error('Error type:', (error as Error)?.name)
            console.error('Error message:', (error as Error)?.message)
            console.error('Full error:', error)
            const parsed = parseTransactionError(error)
            setTxState(prev => ({
              ...prev,
              subState: 'error',
              error: parsed,
            }))
            orchestratingRef.current = false
            return
          }

          setTxState(prev => ({
            ...prev,
            subState: 'tx_submitted',
            txHash: createHash,
          }))

          console.log('Waiting for vault creation receipt...')
          setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))

          // Try to extract vault address from event logs
          const extractedVault = await extractVaultAddressFromReceipt(createHash)

          // If we extracted from event logs, the vault definitely exists
          // (the event was emitted in a successful transaction)
          if (extractedVault) {
            console.log('Vault address confirmed from event logs:', extractedVault)
            currentVaultAddress = extractedVault
          } else {
            // Receipt extraction failed - fall back to on-chain check with delays
            console.log('Receipt extraction failed, falling back to on-chain check...')

            // Try with increasing delays to avoid rate limits
            let fallbackVault: Address | null = null
            for (const delay of [3000, 8000, 15000]) {
              console.log(`Waiting ${delay}ms before checking on-chain...`)
              await new Promise(r => setTimeout(r, delay))

              try {
                fallbackVault = await verifyVaultExists(address, allocation)
                if (fallbackVault) {
                  console.log('Found vault on-chain:', fallbackVault)
                  break
                }
              } catch (rpcError) {
                console.warn('RPC error during fallback check:', rpcError)
                // Continue to next retry
              }
            }

            if (!fallbackVault) {
              setTxState(prev => ({
                ...prev,
                subState: 'error',
                error: {
                  title: 'Vault Creation Pending',
                  message: 'Transaction submitted but confirmation is taking longer than expected. Check Basescan and try again.',
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
          // Longer delay to let RPC sync the new contract
          await new Promise(r => setTimeout(r, 3000))
        }
      }

      // At this point we must have a vault address
      if (!currentVaultAddress) {
        setTxState(prev => ({
          ...prev,
          subState: 'error',
          error: {
            title: 'No Vault',
            message: 'Vault address not available.',
            action: 'Please try again.',
          },
        }))
        orchestratingRef.current = false
        return
      }

      // ============================================
      // STEP 1.5: ACCEPT OWNERSHIP (if needed)
      // The vault uses two-step ownership transfer
      // ============================================
      console.log('Checking vault ownership...')
      try {
        const currentOwner = await publicClient.readContract({
          address: currentVaultAddress,
          abi: VAULT_ABI,
          functionName: 'owner',
        })
        console.log('Current vault owner:', currentOwner)
        console.log('Expected owner:', address)

        if (currentOwner.toLowerCase() !== address.toLowerCase()) {
          // Check if we're the pending owner
          const pendingOwner = await publicClient.readContract({
            address: currentVaultAddress,
            abi: VAULT_ABI,
            functionName: 'pendingOwner',
          })
          console.log('Pending owner:', pendingOwner)

          if (pendingOwner.toLowerCase() === address.toLowerCase()) {
            // We need to accept ownership
            console.log('Accepting vault ownership...')
            setTxState(prev => ({
              ...prev,
              step: 'create_vault',
              subState: 'awaiting_wallet',
            }))

            try {
              const acceptHash = await writeContractAsync({
                address: currentVaultAddress,
                abi: VAULT_ABI,
                functionName: 'acceptOwnership',
                chainId: base.id,
              })
              console.log('acceptOwnership tx hash:', acceptHash)

              setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))
              const acceptSuccess = await waitForReceipt(acceptHash)
              if (!acceptSuccess) {
                throw new Error('Accept ownership transaction failed')
              }
              console.log('Ownership accepted!')
            } catch (acceptError) {
              console.error('Failed to accept ownership:', acceptError)
              const parsed = parseTransactionError(acceptError)
              setTxState(prev => ({
                ...prev,
                subState: 'error',
                error: parsed,
              }))
              orchestratingRef.current = false
              return
            }
          } else {
            // Not the pending owner - something is wrong
            console.error('Not the vault owner or pending owner!')
            setTxState(prev => ({
              ...prev,
              subState: 'error',
              error: {
                title: 'Ownership Error',
                message: 'You are not the owner of this vault.',
                action: 'Please create a new vault.',
              },
            }))
            orchestratingRef.current = false
            return
          }
        }
      } catch (ownerError) {
        console.error('Error checking ownership:', ownerError)
        // Continue anyway - might work
      }

      // ============================================
      // STEP 2: APPROVE USDC (if needed)
      // ============================================

      // Check current allowance on-chain
      console.log('Checking USDC allowance...')
      const hasAllowance = await verifyAllowance(address, currentVaultAddress, depositAmountWei)

      if (!hasAllowance) {
        setTxState(prev => ({
          ...prev,
          step: 'approve_usdc',
          subState: 'awaiting_wallet',
          error: null,
        }))

        console.log('Approving USDC...')
        console.log('Vault address for approval:', currentVaultAddress)
        console.log('Amount to approve:', depositAmountWei.toString())
        let approveHash: Hash

        try {
          approveHash = await writeContractAsync({
            address: CONTRACTS.usdc,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [currentVaultAddress, depositAmountWei],
            chainId: base.id, // Force Base chain
          })
          console.log('approve tx hash:', approveHash)
        } catch (error) {
          console.error('=== APPROVE ERROR ===')
          console.error('Error type:', (error as Error)?.name)
          console.error('Error message:', (error as Error)?.message)
          console.error('Full error:', error)
          const parsed = parseTransactionError(error)
          setTxState(prev => ({
            ...prev,
            subState: 'error',
            error: parsed,
          }))
          orchestratingRef.current = false
          return
        }

        setTxState(prev => ({
          ...prev,
          subState: 'tx_submitted',
          txHash: approveHash,
        }))

        console.log('Waiting for approval receipt...')
        setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))

        const approveSuccess = await waitForReceipt(approveHash)
        if (!approveSuccess) {
          setTxState(prev => ({
            ...prev,
            subState: 'error',
            error: {
              title: 'Approval Failed',
              message: 'USDC approval transaction failed.',
              action: 'Please try again.',
            },
          }))
          orchestratingRef.current = false
          return
        }

        // Verify allowance on-chain (with retry for RPC sync delay)
        console.log('Verifying allowance on-chain...')
        let allowanceVerified = false
        for (let attempt = 0; attempt < 3; attempt++) {
          // Wait for RPC to sync
          await new Promise(r => setTimeout(r, 2000))
          allowanceVerified = await verifyAllowance(address, currentVaultAddress, depositAmountWei)
          if (allowanceVerified) break
          console.log(`Allowance not yet visible, retry ${attempt + 1}/3...`)
        }
        if (!allowanceVerified) {
          setTxState(prev => ({
            ...prev,
            subState: 'error',
            error: {
              title: 'Verification Failed',
              message: 'Could not verify USDC allowance.',
              action: 'Please try again.',
            },
          }))
          orchestratingRef.current = false
          return
        }

        setTxState(prev => ({
          ...prev,
          allowanceVerified: true,
          subState: 'confirmed',
        }))

        console.log('Allowance verified')
        await new Promise(r => setTimeout(r, 500))
      } else {
        console.log('Sufficient allowance already exists')
        setTxState(prev => ({
          ...prev,
          allowanceVerified: true,
        }))
      }

      // ============================================
      // STEP 3: DEPOSIT
      // ============================================

      setTxState(prev => ({
        ...prev,
        step: 'deposit',
        subState: 'awaiting_wallet',
        error: null,
      }))

      console.log('Depositing USDC...')
      console.log('Vault address for deposit:', currentVaultAddress)
      console.log('Deposit amount:', depositAmountWei.toString())
      let depositHash: Hash

      try {
        depositHash = await writeContractAsync({
          address: currentVaultAddress,
          abi: VAULT_ABI,
          functionName: 'depositUSDC',
          args: [depositAmountWei],
          chainId: base.id, // Force Base chain
        })
        console.log('depositUSDC tx hash:', depositHash)
      } catch (error) {
        console.error('=== DEPOSIT ERROR ===')
        console.error('Error type:', (error as Error)?.name)
        console.error('Error message:', (error as Error)?.message)
        console.error('Full error:', error)
        const parsed = parseTransactionError(error)
        setTxState(prev => ({
          ...prev,
          subState: 'error',
          error: parsed,
        }))
        orchestratingRef.current = false
        return
      }

      setTxState(prev => ({
        ...prev,
        subState: 'tx_submitted',
        txHash: depositHash,
      }))

      console.log('Waiting for deposit receipt...')
      setTxState(prev => ({ ...prev, subState: 'confirming_onchain' }))

      const depositSuccess = await waitForReceipt(depositHash)
      if (!depositSuccess) {
        setTxState(prev => ({
          ...prev,
          subState: 'error',
          error: {
            title: 'Deposit Failed',
            message: 'Deposit transaction failed.',
            action: 'Please try again.',
          },
        }))
        orchestratingRef.current = false
        return
      }

      // Verify vault has holdings
      console.log('Verifying deposit on-chain...')
      const hasHoldings = await verifyVaultHasHoldings(currentVaultAddress)
      if (!hasHoldings) {
        setTxState(prev => ({
          ...prev,
          subState: 'error',
          error: {
            title: 'Verification Failed',
            message: 'Could not verify deposit completed.',
            action: 'Check your vault on Basescan.',
          },
        }))
        orchestratingRef.current = false
        return
      }

      // ============================================
      // SUCCESS - All steps verified on-chain
      // ============================================

      setTxState(prev => ({
        ...prev,
        step: 'complete',
        subState: 'confirmed',
        depositVerified: true,
      }))

      // Store vault in localStorage
      storeVault(address, allocation, currentVaultAddress)

      console.log('Deposit complete and verified!')

      // Redirect to portfolio after brief delay
      setTimeout(() => {
        router.push('/portfolio')
      }, 2000)

    } catch (error) {
      console.error('Orchestration error:', error)
      const parsed = parseTransactionError(error)
      setTxState(prev => ({
        ...prev,
        subState: 'error',
        error: parsed,
      }))
    } finally {
      orchestratingRef.current = false
    }
  }, [address, selectedAllocation, existingVaultAddress, depositAmountWei, writeContractAsync, router, chainId, switchChain])

  // ============================================
  // UI HANDLERS
  // ============================================

  const handleAllocationSelect = useCallback(async (allocation: AllocationPresetType) => {
    setSelectedAllocation(allocation)
    setInputError(null)

    if (address) {
      // Check localStorage first (fast)
      const storedVault = getStoredVault(address, allocation.id)
      if (storedVault) {
        setExistingVaultAddress(storedVault)
      } else {
        // Check on-chain (slower but authoritative)
        const onChainVault = await verifyVaultExists(address, allocation.id)
        if (onChainVault) {
          setExistingVaultAddress(onChainVault)
          storeVault(address, allocation.id, onChainVault) // sync localStorage
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

  const goToAmount = () => {
    if (selectedAllocation) {
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
    if (setupStep === 'amount') setSetupStep('allocation')
    if (setupStep === 'review') setSetupStep('amount')
  }

  const handleConfirm = () => {
    if (!selectedAllocation || !factoryConfigured) return
    setSetupStep('processing')
    setTxState(INITIAL_STATE)
    // Start orchestration
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

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted || !isConnected) return null

  // ============================================
  // RENDER: Allocation Selection
  // ============================================
  if (setupStep === 'allocation') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={() => router.push('/')}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
        </div>

        <h1 className="text-3xl font-semibold mb-2">Choose allocation</h1>
        <p className="text-[var(--muted)] mb-8">
          How much of your deposit should be in Bitcoin?
        </p>

        <div className="space-y-3 flex-1">
          {ALLOCATION_PRESETS.map((allocation) => (
            <button
              key={allocation.id}
              onClick={() => handleAllocationSelect(allocation)}
              className={`w-full p-5 rounded-2xl text-left transition-all ${
                selectedAllocation?.id === allocation.id
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)]'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-lg">{allocation.name}</div>
                  <div className={`text-sm ${selectedAllocation?.id === allocation.id ? 'text-white/70' : 'text-[var(--muted)]'}`}>
                    {allocation.btcPct}% BTC · {100 - allocation.btcPct}% USDC
                  </div>
                </div>
                {selectedAllocation?.id === allocation.id && (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        <Button size="large" onClick={goToAmount} disabled={!selectedAllocation} className="mt-6">
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
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--border)]" />
        </div>

        <h1 className="text-3xl font-semibold mb-2">Enter amount</h1>
        <p className="text-[var(--muted)] mb-8">How much USDC to deposit?</p>

        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="inline-flex items-baseline">
              <span className="text-4xl text-[var(--muted)] mr-1">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="text-6xl font-semibold bg-transparent text-center w-48 focus:outline-none"
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
    const btcAmount = (parseFloat(amount) * (selectedAllocation?.btcPct ?? 0) / 100)
    const usdcAmount = (parseFloat(amount) * (100 - (selectedAllocation?.btcPct ?? 0)) / 100)

    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={goBack}
          className="text-[var(--primary)] text-sm mb-8 text-left hover:opacity-70 font-medium"
        >
          ← Back
        </button>

        <div className="flex gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
          <div className="h-1 flex-1 rounded-full bg-[var(--primary)]" />
        </div>

        <h1 className="text-3xl font-semibold mb-8">Review</h1>

        <div className="flex-1 space-y-4">
          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-1">Depositing</div>
            <div className="font-semibold text-3xl">${parseFloat(amount).toLocaleString()}</div>
          </Card>

          <Card variant="elevated" padding="large">
            <div className="text-sm text-[var(--muted)] mb-3">Will be split into</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span>BTC</span>
                </div>
                <span className="font-medium">~${btcAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span>USDC</span>
                </div>
                <span className="font-medium">~${usdcAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-[var(--border)] flex mt-4">
              <div className="bg-orange-500" style={{ width: `${selectedAllocation?.btcPct}%` }} />
              <div className="bg-blue-500" style={{ width: `${100 - (selectedAllocation?.btcPct ?? 0)}%` }} />
            </div>
          </Card>

          <Card variant="default" padding="default">
            <p className="text-xs text-[var(--muted)]">
              {existingVaultAddress
                ? 'You will approve USDC spending, then confirm the deposit. Each step requires wallet confirmation.'
                : 'You will create your vault, approve USDC spending, then confirm the deposit. Each step requires wallet confirmation.'}
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

        <div className="mt-8 space-y-3">
          <Button size="large" onClick={handleConfirm} disabled={!factoryConfigured || isWrongChain}>
            {existingVaultAddress ? 'Deposit' : 'Create Vault & Deposit'}
          </Button>
        </div>
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
        {/* Status indicator */}
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

        {/* Error action */}
        {isError && txState.error?.action && (
          <p className="text-sm text-[var(--muted)] mt-4">{txState.error.action}</p>
        )}

        {/* Show raw error in development */}
        {isError && process.env.NODE_ENV === 'development' && (
          <p className="text-xs text-red-400 mt-4 max-w-xs break-all">
            Check browser console for details
          </p>
        )}

        {/* Progress steps - only show when not in error or complete */}
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

        {/* Action buttons */}
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
