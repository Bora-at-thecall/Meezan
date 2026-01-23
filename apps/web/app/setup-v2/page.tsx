'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi'
import { type Hash, type Address } from 'viem'
import { base } from 'wagmi/chains'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import {
  ASSETS,
  ASSET_LIST,
  PORTFOLIO_TEMPLATES,
  DRIFT_PRESETS,
  getAsset,
  isAssetAvailable,
  getActiveAllocations,
  validateAllocations,
  formatDriftThreshold,
  type AssetId,
  type PortfolioTemplate,
} from '@/lib/assets'
import { useUsdcBalance, useGasEstimate } from '@/lib/hooks'
import { checkExistingVaultV2, CONTRACTS_V2, getLatestVaultV2 } from '@/lib/contracts-v2'
import {
  setupOrchestratorV2,
  STEP_DESCRIPTIONS,
  type SetupStateV2,
  type SetupStepV2,
  publicClientV2,
  estimateSetupGasV2,
} from '@/lib/tx-orchestrator-v2'
import { getBasescanTxLink } from '@/lib/security'

// Setup steps
type SetupStep =
  | 'choose-structure'  // Screen 1: Template or Custom
  | 'select-assets'     // Screen 2: Choose which assets (custom only)
  | 'assign-weights'    // Screen 3: Set percentages
  | 'rebalance-rules'   // Screen 4: Drift threshold
  | 'review'            // Screen 5: Confirm
  | 'processing'        // Transaction flow

export default function SetupV2Page() {
  const router = useRouter()
  const { address, isConnected } = useAccount()

  // UI state
  const [setupStep, setSetupStep] = useState<SetupStep>('choose-structure')
  const [selectedTemplate, setSelectedTemplate] = useState<PortfolioTemplate | null>(null)
  const [isCustomPath, setIsCustomPath] = useState(false)

  // Asset selection state (for custom path)
  const [selectedAssets, setSelectedAssets] = useState<Set<AssetId>>(new Set())

  // Weight state
  const [allocations, setAllocations] = useState<Record<AssetId, number>>({
    BTC: 0,
    ETH: 0,
    USDC: 0,
  })

  // Drift threshold state
  const [driftThresholdBps, setDriftThresholdBps] = useState(500) // 5% default

  // Deposit amount
  const [depositAmount, setDepositAmount] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  // Transaction orchestrator state
  const [txState, setTxState] = useState<SetupStateV2 | null>(null)
  const [existingVault, setExistingVault] = useState<Address | null>(null)
  const [isDepositOnly, setIsDepositOnly] = useState(false) // True when depositing into existing vault

  // Write contract hook
  const { writeContractAsync } = useWriteContract()
  const { estimateUsd } = useGasEstimate()

  // Hydration guard
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect if not connected
  useEffect(() => {
    if (mounted && !isConnected) {
      router.push('/')
    }
  }, [mounted, isConnected, router])

  // Check for existing v2 vault when user connects or changes config
  useEffect(() => {
    if (!mounted || !address) return

    // Check localStorage first for quick lookup
    const storedVault = getLatestVaultV2(address)
    if (storedVault) {
      setExistingVault(storedVault)
    }
  }, [mounted, address])

  // Initialize orchestrator when processing starts
  useEffect(() => {
    if (setupStep !== 'processing' || !address) return

    const waitForReceipt = async (hash: Hash) => {
      console.log('[waitForReceipt] Waiting for tx:', hash)
      const maxAttempts = 60 // 2 minutes max with 2s intervals
      let attempts = 0

      // Poll for receipt with timeout and fallback
      while (attempts < maxAttempts) {
        attempts++

        // Try viem client first
        try {
          const receipt = await publicClientV2.waitForTransactionReceipt({
            hash,
            timeout: 5_000, // 5 second timeout per attempt
          })
          console.log('[waitForReceipt] Got receipt via viem:', receipt.status)
          return receipt
        } catch (e) {
          console.log('[waitForReceipt] viem attempt', attempts, 'failed:', (e as Error).message?.slice(0, 100))
        }

        // Fallback: try direct RPC calls (mainnet.base.org first for reliability)
        const rpcs = ['https://mainnet.base.org', 'https://base.llamarpc.com']
        for (const rpc of rpcs) {
          try {
            const response = await fetch(rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getTransactionReceipt',
                params: [hash]
              })
            })
            const data = await response.json()
            if (data.result && data.result.blockNumber) {
              console.log('[waitForReceipt] Got receipt via direct RPC:', rpc, data.result.status)
              // Convert to viem-like format
              return {
                ...data.result,
                status: data.result.status === '0x1' ? 'success' : 'reverted',
                logs: data.result.logs || [],
              }
            }
          } catch (e) {
            // Continue to next RPC
          }
        }

        // Wait before next attempt
        await new Promise(r => setTimeout(r, 2000))
      }

      // Timeout - but transaction may still be pending
      console.error('[waitForReceipt] Timeout waiting for receipt')
      throw new Error('Transaction is taking longer than expected. Check Basescan for status.')
    }

    setupOrchestratorV2.initialize(
      setTxState,
      writeContractAsync,
      waitForReceipt,
      address
    )
  }, [setupStep, address, writeContractAsync])

  // Handle completion - redirect to portfolio
  // NOTE: This hook must be at the top level, not inside conditional returns
  useEffect(() => {
    if (txState?.step === 'complete' && txState.vaultAddress) {
      setTimeout(() => {
        router.push(`/portfolio-v2?vault=${txState.vaultAddress}`)
      }, 1500)
    }
  }, [txState, router])

  // Get available assets
  const availableAssets = useMemo(() =>
    ASSET_LIST.filter(isAssetAvailable),
    []
  )

  // Validation
  const allocationValidation = useMemo(() =>
    validateAllocations(allocations),
    [allocations]
  )

  const activeAllocations = useMemo(() =>
    getActiveAllocations(allocations),
    [allocations]
  )

  // Balance check
  const { formatted: usdcBalance, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalance } = useUsdcBalance()

  // ============================================
  // HANDLERS
  // ============================================

  const handleSelectTemplate = (template: PortfolioTemplate) => {
    setSelectedTemplate(template)
    setIsCustomPath(false)
    // Pre-fill allocations from template
    setAllocations(template.allocations)
    setDriftThresholdBps(template.driftThreshold)
    // Set selected assets based on template
    const activeAssets = new Set<AssetId>(
      ASSET_LIST.filter(id => template.allocations[id] > 0)
    )
    setSelectedAssets(activeAssets)
  }

  const handleStartCustom = () => {
    setSelectedTemplate(null)
    setIsCustomPath(true)
    // Reset to defaults with all available assets
    setSelectedAssets(new Set(['BTC', 'ETH', 'USDC']))
    setAllocations({ BTC: 40, ETH: 40, USDC: 20 })
    setDriftThresholdBps(500)
    setSetupStep('select-assets')
  }

  const handleToggleAsset = (assetId: AssetId) => {
    const newSelection = new Set(selectedAssets)
    if (newSelection.has(assetId)) {
      // Don't allow less than 2 assets
      if (newSelection.size <= 2) return
      newSelection.delete(assetId)
      // Zero out the allocation
      setAllocations(prev => ({ ...prev, [assetId]: 0 }))
    } else {
      newSelection.add(assetId)
    }
    setSelectedAssets(newSelection)
  }

  const handleWeightChange = (assetId: AssetId, value: number) => {
    const clampedValue = Math.max(0, Math.min(100, value))
    setAllocations(prev => ({ ...prev, [assetId]: clampedValue }))
  }

  const handleEqualWeight = () => {
    const count = selectedAssets.size
    if (count === 0) return
    const equalWeight = Math.floor(100 / count)
    const remainder = 100 - (equalWeight * count)

    const newAllocations = { ...allocations }
    let first = true
    for (const assetId of ASSET_LIST) {
      if (selectedAssets.has(assetId)) {
        newAllocations[assetId] = first ? equalWeight + remainder : equalWeight
        first = false
      } else {
        newAllocations[assetId] = 0
      }
    }
    setAllocations(newAllocations)
  }

  const handleResetToTemplate = () => {
    if (selectedTemplate) {
      setAllocations(selectedTemplate.allocations)
    }
  }

  const handleDepositAmountChange = (value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setDepositAmount(value)
      setInputError(null)
    }
  }

  // Navigation
  const goToSelectAssets = () => setSetupStep('select-assets')
  const goToAssignWeights = () => setSetupStep('assign-weights')
  const goToRebalanceRules = () => setSetupStep('rebalance-rules')
  const goToReview = () => {
    // Validate deposit amount
    const amount = parseFloat(depositAmount)
    if (!depositAmount || amount <= 0) {
      setInputError('Please enter an amount')
      return
    }
    if (amount > parseFloat(usdcBalance)) {
      setInputError(`You have ${parseFloat(usdcBalance).toLocaleString()} USDC available`)
      return
    }
    setInputError(null)
    setSetupStep('review')
  }

  const goBack = () => {
    setInputError(null)
    switch (setupStep) {
      case 'select-assets':
        setSetupStep('choose-structure')
        break
      case 'assign-weights':
        if (isCustomPath) {
          setSetupStep('select-assets')
        } else {
          setSetupStep('choose-structure')
        }
        break
      case 'rebalance-rules':
        setSetupStep('assign-weights')
        break
      case 'review':
        setSetupStep('rebalance-rules')
        break
    }
  }

  const handleConfirm = async () => {
    // Check if vault with this config already exists
    let foundVault: Address | null = null
    if (address) {
      foundVault = await checkExistingVaultV2(
        publicClientV2,
        address,
        allocations,
        driftThresholdBps
      )
      if (foundVault) {
        console.log('[Setup] Found existing vault, will deposit into it:', foundVault)
        // Store in localStorage for future reference
        const { storeVaultV2 } = await import('@/lib/contracts-v2')
        storeVaultV2(address, foundVault, 'existing')
        setIsDepositOnly(true)
      } else {
        setIsDepositOnly(false)
      }
    }

    // Start the setup flow
    setSetupStep('processing')

    // Start orchestrator after state change - wait longer for React to initialize
    // If existing vault found, orchestrator will skip creation and go to deposit
    setTimeout(() => {
      console.log('[Setup] Starting orchestrator with config:', {
        allocations,
        driftThresholdBps,
        depositAmount,
        foundVault,
      })
      setupOrchestratorV2.start({
        allocations,
        driftThresholdBps,
        depositAmountUsdc: depositAmount,
        existingVaultAddress: foundVault || undefined,
      })
    }, 300) // Increased timeout for reliable initialization
  }

  const handleRetry = () => {
    setupOrchestratorV2.retry()
  }

  const handleCancelProcessing = () => {
    setupOrchestratorV2.reset()
    setTxState(null)
    setSetupStep('review')
  }

  if (!mounted || !isConnected) return null

  // ============================================
  // SCREEN 1: Choose Portfolio Structure
  // ============================================
  if (setupStep === 'choose-structure') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button
          onClick={() => router.push('/')}
          className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]"
        >
          Back
        </button>

        <ProgressBar step={1} total={5} />

        <h1 className="text-2xl font-semibold mb-2">Choose a portfolio</h1>
        <p className="text-[var(--muted)] text-sm mb-8">
          Start with a template or build your own allocation
        </p>

        {/* Template Portfolios - 2 column grid on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {PORTFOLIO_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className={`w-full p-4 rounded-xl text-left transition-all border ${
                selectedTemplate?.id === template.id
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                  : 'border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--muted)]'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{template.name}</span>
                    {template.recommended && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)]">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-[var(--muted)] mb-2">
                    {template.description}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {getActiveAllocations(template.allocations).map(({ assetId, weight }) => (
                      <span
                        key={assetId}
                        className="text-xs px-2 py-1 rounded-full bg-[var(--background-tertiary)]"
                        style={{ borderLeft: `3px solid ${ASSETS[assetId].color}` }}
                      >
                        {assetId} {weight}%
                      </span>
                    ))}
                  </div>
                </div>
                {selectedTemplate?.id === template.id && (
                  <div className="w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0 ml-3">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Custom Portfolio Option */}
        <div className="border-t border-[var(--border)] pt-4">
          <button
            onClick={handleStartCustom}
            className="w-full p-4 rounded-xl text-left border border-dashed border-[var(--border)] hover:border-[var(--muted)] transition-all"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium">Build your own</div>
                <div className="text-sm text-[var(--muted)]">
                  Select assets and set custom weights
                </div>
              </div>
              <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        <div className="flex-1" />

        <Button
          size="large"
          onClick={goToAssignWeights}
          disabled={!selectedTemplate}
          className="mt-6"
        >
          Continue with {selectedTemplate?.name || 'template'}
        </Button>
      </div>
    )
  }

  // ============================================
  // SCREEN 2: Select Assets (Custom Path)
  // ============================================
  if (setupStep === 'select-assets') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button onClick={goBack} className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]">
          Back
        </button>

        <ProgressBar step={2} total={5} />

        <h1 className="text-2xl font-semibold mb-2">Select assets</h1>
        <p className="text-[var(--muted)] text-sm mb-8">
          Choose which assets to include
        </p>

        <div className="space-y-3 flex-1">
          {availableAssets.map((assetId) => {
            const asset = getAsset(assetId)
            const isSelected = selectedAssets.has(assetId)
            const canDeselect = isSelected && selectedAssets.size > 2

            return (
              <button
                key={assetId}
                onClick={() => handleToggleAsset(assetId)}
                disabled={isSelected && !canDeselect}
                className={`w-full p-4 rounded-xl text-left transition-all border ${
                  isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--muted)]'
                } ${isSelected && !canDeselect ? 'opacity-70' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: asset.color }}
                  >
                    {asset.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{asset.name}</div>
                    <div className="text-sm text-[var(--muted)]">{asset.description}</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary)]'
                      : 'border-[var(--border)]'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="text-sm text-[var(--muted)] text-center mt-4">
          {selectedAssets.size} of {availableAssets.length} assets selected
        </div>

        <Button
          size="large"
          onClick={goToAssignWeights}
          disabled={selectedAssets.size < 2}
          className="mt-6"
        >
          Continue
        </Button>
      </div>
    )
  }

  // ============================================
  // SCREEN 3: Assign Weights
  // ============================================
  if (setupStep === 'assign-weights') {
    const remaining = 100 - Object.values(allocations).reduce((a, b) => a + b, 0)

    return (
      <div className="flex flex-col min-h-[85vh]">
        <button onClick={goBack} className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]">
          Back
        </button>

        <ProgressBar step={3} total={5} />

        <h1 className="text-2xl font-semibold mb-2">Set allocation weights</h1>
        <p className="text-[var(--muted)] text-sm mb-6">
          Allocations must sum to exactly 100%
        </p>

        {/* Allocation Bar Visualization */}
        <div className="h-4 rounded-full overflow-hidden bg-[var(--border)] flex mb-6">
          {activeAllocations.map(({ assetId, weight }) => (
            <div
              key={assetId}
              className="transition-all duration-300"
              style={{
                width: `${weight}%`,
                backgroundColor: ASSETS[assetId].color,
              }}
            />
          ))}
          {remaining > 0 && (
            <div
              className="bg-[var(--border)]"
              style={{ width: `${remaining}%` }}
            />
          )}
        </div>

        {/* Weight Inputs */}
        <div className="space-y-3 flex-1">
          {ASSET_LIST.filter(id => selectedAssets.has(id)).map((assetId) => {
            const asset = getAsset(assetId)
            return (
              <div
                key={assetId}
                className="flex items-center gap-4 p-4 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)]"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: asset.color }}
                />
                <div className="flex-1 font-medium">{asset.symbol}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleWeightChange(assetId, allocations[assetId] - 5)}
                    className="w-8 h-8 rounded-full bg-[var(--background-tertiary)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                  >
                    <span className="text-lg">−</span>
                  </button>
                  <input
                    type="number"
                    value={allocations[assetId]}
                    onChange={(e) => handleWeightChange(assetId, parseInt(e.target.value) || 0)}
                    className="w-16 text-center bg-transparent font-medium text-lg"
                    min={0}
                    max={100}
                  />
                  <span className="text-[var(--muted)]">%</span>
                  <button
                    onClick={() => handleWeightChange(assetId, allocations[assetId] + 5)}
                    className="w-8 h-8 rounded-full bg-[var(--background-tertiary)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                  >
                    <span className="text-lg">+</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Status */}
        <div className={`text-center py-4 rounded-xl mt-4 ${
          allocationValidation.valid
            ? 'bg-green-500/10 text-green-400'
            : remaining !== 0
              ? 'bg-orange-500/10 text-orange-400'
              : 'bg-red-500/10 text-red-400'
        }`}>
          {allocationValidation.valid
            ? '✓ Allocations sum to 100%'
            : remaining > 0
              ? `${remaining}% remaining to allocate`
              : remaining < 0
                ? `${Math.abs(remaining)}% over allocated`
                : allocationValidation.error}
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mt-4">
          <Button
            variant="secondary"
            onClick={handleEqualWeight}
            className="flex-1"
          >
            Equal weight
          </Button>
          {selectedTemplate && (
            <Button
              variant="secondary"
              onClick={handleResetToTemplate}
              className="flex-1"
            >
              Reset to template
            </Button>
          )}
        </div>

        <Button
          size="large"
          onClick={goToRebalanceRules}
          disabled={!allocationValidation.valid}
          className="mt-6"
        >
          Continue
        </Button>
      </div>
    )
  }

  // ============================================
  // SCREEN 4: Rebalance Rules
  // ============================================
  if (setupStep === 'rebalance-rules') {
    return (
      <div className="flex flex-col min-h-[85vh]">
        <button onClick={goBack} className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]">
          Back
        </button>

        <ProgressBar step={4} total={5} />

        <h1 className="text-2xl font-semibold mb-2">Rebalance settings</h1>
        <p className="text-[var(--muted)] text-sm mb-8">
          Choose when your portfolio should rebalance
        </p>

        {/* Two-column layout on desktop: Drift options | Deposit + Explanation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
          {/* Left column: Drift threshold options */}
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)] mb-4">
              <span className="font-medium text-[var(--foreground)]">Drift threshold</span> determines when rebalancing triggers.
            </p>
            {DRIFT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setDriftThresholdBps(preset.value)}
                className={`w-full p-4 rounded-xl text-left transition-all border ${
                  driftThresholdBps === preset.value
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] bg-[var(--background-secondary)] hover:border-[var(--muted)]'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{preset.name}</span>
                      <span className="text-sm text-[var(--muted)]">
                        ({formatDriftThreshold(preset.value)} drift)
                      </span>
                    </div>
                    <div className="text-sm text-[var(--muted)]">
                      {preset.description}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-1 opacity-70">
                      {preset.frequencyHint}
                    </div>
                  </div>
                  {driftThresholdBps === preset.value && (
                    <div className="w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Right column: Deposit + Explanation */}
          <div className="space-y-6">
            {/* Initial Deposit */}
            <div>
              <h2 className="text-lg font-semibold mb-2">Initial deposit</h2>
              <p className="text-[var(--muted)] text-sm mb-4">
                How much USDC to deposit?
              </p>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositAmount}
                  onChange={(e) => handleDepositAmountChange(e.target.value)}
                  placeholder="0"
                  className="w-full p-4 pl-8 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-lg font-medium focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  onClick={() => {
                    if (balanceLoading) {
                      refetchBalance()
                    } else {
                      setDepositAmount(usdcBalance)
                    }
                  }}
                  disabled={balanceLoading}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--primary)] hover:underline disabled:opacity-50"
                >
                  {balanceLoading ? 'Loading...' : 'Max'}
                </button>
              </div>

              <p className="text-sm text-[var(--muted)] mt-2">
                {balanceLoading ? (
                  'Loading balance...'
                ) : balanceError ? (
                  <span className="text-orange-400">
                    Could not load balance.{' '}
                    <button onClick={() => refetchBalance()} className="underline">Retry</button>
                  </span>
                ) : (
                  `Available: $${parseFloat(usdcBalance).toLocaleString()}`
                )}
              </p>

              {inputError && (
                <p className="text-sm text-red-400 mt-2">{inputError}</p>
              )}
            </div>

            {/* Explanation card */}
            <Card variant="default" className="bg-[var(--background-tertiary)]">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[var(--muted)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-[var(--muted)]">
                  <span className="font-medium text-[var(--foreground)]">Trade-off:</span> Lower thresholds keep your portfolio closer to target but incur more transaction fees. Higher thresholds reduce fees but allow more deviation.
                </p>
              </div>
            </Card>
          </div>
        </div>

        <Button
          size="large"
          onClick={goToReview}
          disabled={!depositAmount || parseFloat(depositAmount) <= 0}
          className="mt-6"
        >
          Review portfolio
        </Button>
      </div>
    )
  }

  // ============================================
  // SCREEN 5: Review & Confirm
  // ============================================
  if (setupStep === 'review') {
    const depositValue = parseFloat(depositAmount)

    return (
      <div className="flex flex-col min-h-[85vh]">
        <button onClick={goBack} className="text-[var(--muted)] text-sm mb-8 text-left hover:text-[var(--foreground)]">
          Back
        </button>

        <ProgressBar step={5} total={5} />

        <h1 className="text-2xl font-semibold mb-2">Review your portfolio</h1>
        <p className="text-[var(--muted)] text-sm mb-8">
          Confirm your allocation before creating the vault
        </p>

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-8">
          {/* Left column: Portfolio summary */}
          <div>
            {/* Deposit amount - prominent */}
            <div className="mb-6">
              <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Initial deposit</p>
              <p className="text-4xl font-light tabular-nums">${depositValue.toLocaleString()}</p>
            </div>

            {/* Allocation breakdown */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-xs text-[var(--muted)] uppercase tracking-wider">Allocation</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="space-y-3 mb-4">
              {activeAllocations.map(({ assetId, weight }) => {
                const asset = getAsset(assetId)
                const value = (depositValue * weight) / 100
                return (
                  <div key={assetId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: asset.color }}
                      />
                      <span>{asset.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg tabular-nums font-medium">{weight}%</span>
                      <span className="text-sm text-[var(--muted)] ml-2 tabular-nums">
                        ~${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Allocation bar */}
            <div className="h-3 rounded-full overflow-hidden flex">
              {activeAllocations.map(({ assetId, weight }) => (
                <div
                  key={assetId}
                  style={{
                    width: `${weight}%`,
                    backgroundColor: ASSETS[assetId].color,
                  }}
                />
              ))}
            </div>

            {/* Rebalance rule */}
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <div className="flex justify-between items-baseline">
                <span className="text-[var(--muted)]">Drift threshold</span>
                <span className="font-medium">{formatDriftThreshold(driftThresholdBps)}</span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1 opacity-70">
                Rebalance triggers when any asset drifts beyond this
              </p>
            </div>
          </div>

          {/* Right column: Technical info */}
          <div>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-xs text-[var(--muted)] uppercase tracking-wider">Details</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Slippage protection</span>
                <span>1% per swap</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Swap routing</span>
                <span>Via USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Price oracles</span>
                <span>Chainlink</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">DEX</span>
                <span>Uniswap V3</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-[var(--border)]">
                <span className="text-[var(--muted)]">Estimated network fee</span>
                <span className="tabular-nums">{estimateUsd(estimateSetupGasV2().total)}</span>
              </div>
            </div>

            {/* What happens */}
            <div className="mt-6 p-4 rounded-xl bg-[var(--background-secondary)] text-sm">
              <p className="text-[var(--muted)]">
                <span className="text-[var(--foreground)] font-medium">How it works:</span> When any asset
                drifts more than {formatDriftThreshold(driftThresholdBps)} from target, the vault swaps
                overweight assets for underweight ones. All swaps are atomic.
              </p>
            </div>

            {/* Existing vault notice - only show if they have a vault with DIFFERENT config */}
            {existingVault && (
              <div className="mt-4 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 text-sm">
                <p className="text-blue-300 mb-1">
                  You have an existing portfolio.
                </p>
                <p className="text-[var(--muted)] mb-2">
                  Depositing will add to your existing vault.
                </p>
                <button
                  onClick={() => router.push(`/portfolio-v2?vault=${existingVault}`)}
                  className="text-blue-400 hover:underline"
                >
                  View portfolio instead
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Confirmation notice */}
        <p className="text-sm text-[var(--muted)] mb-4 text-center">
          Your wallet will prompt you to confirm each step. The last step automatically buys BTC & ETH.
        </p>

        <Button
          size="large"
          onClick={handleConfirm}
        >
          Create portfolio
        </Button>
      </div>
    )
  }

  // ============================================
  // SCREEN 6: Processing
  // ============================================

  // Define processing steps for UI - simplified 3-step flow
  // V2 uses immediate ownership and depositAndRebalance for single-tx funding
  const processingSteps = isDepositOnly
    ? [
        { key: 'approve', label: 'Approve USDC', minProgress: 40, maxProgress: 60 },
        { key: 'fund', label: 'Fund portfolio', minProgress: 60, maxProgress: 100 },
      ]
    : [
        { key: 'create', label: 'Create vault', minProgress: 0, maxProgress: 30 },
        { key: 'approve', label: 'Approve USDC', minProgress: 30, maxProgress: 60 },
        { key: 'fund', label: 'Fund portfolio', minProgress: 60, maxProgress: 100 },
      ]

  const getStepStatus = (step: typeof processingSteps[0]) => {
    if (!txState) return 'pending'
    if (txState.progress >= step.maxProgress) return 'complete'
    if (txState.progress >= step.minProgress) return 'active'
    return 'pending'
  }

  // Processing screen
  if (txState?.step === 'error') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Transaction failed</h2>
          <p className="text-[var(--muted)] mb-6">{txState.error}</p>

          {txState.txHash && (
            <a
              href={getBasescanTxLink(txState.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--primary)] hover:underline block mb-6"
            >
              View on Basescan
            </a>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleCancelProcessing} className="flex-1">
              Back
            </Button>
            <Button onClick={handleRetry} className="flex-1">
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (txState?.step === 'complete') {
    return (
      <div className="flex flex-col min-h-[85vh] items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">
            Portfolio ready!
          </h2>
          <p className="text-[var(--muted)] mb-2">Your assets have been allocated</p>
          <p className="text-sm text-[var(--muted)] opacity-60">Redirecting to portfolio...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[85vh] items-center justify-center">
      <div className="text-center max-w-sm w-full">
        <div className="w-16 h-16 mx-auto rounded-full border-4 border-[var(--border)] border-t-[var(--primary)] animate-spin mb-8" />
        <h2 className="text-xl font-semibold mb-2">
          {txState ? STEP_DESCRIPTIONS[txState.step] : 'Preparing...'}
        </h2>
        <p className="text-[var(--muted)] text-sm mb-8">
          {txState?.step?.includes('waiting')
            ? 'Transaction submitted. Waiting for confirmation...'
            : 'Confirm in your wallet to continue'}
        </p>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden mb-8">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-500"
            style={{ width: `${txState?.progress || 0}%` }}
          />
        </div>

        {/* Step list */}
        <div className="space-y-3 text-left">
          {processingSteps.map((step) => {
            const status = getStepStatus(step)
            return (
              <div key={step.key} className="flex items-center gap-3 text-sm">
                {status === 'complete' ? (
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : status === 'active' ? (
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--border)] flex-shrink-0" />
                )}
                <span className={status === 'pending' ? 'text-[var(--muted)]' : ''}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Transaction link */}
        {txState?.txHash && (
          <a
            href={getBasescanTxLink(txState.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-6 text-sm text-[var(--primary)] hover:underline"
          >
            View transaction on Basescan
          </a>
        )}

        {/* Gas estimate */}
        <p className="text-xs text-[var(--muted)] mt-6">
          Estimated network fee: {estimateUsd(estimateSetupGasV2().total)}
        </p>

        <Button
          variant="secondary"
          onClick={handleCancelProcessing}
          className="mt-6"
          disabled={txState ? (txState.step !== 'idle' && !txState.step.includes('waiting')) : false}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ============================================
// HELPER COMPONENTS
// ============================================

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i < step ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
          }`}
        />
      ))}
    </div>
  )
}
