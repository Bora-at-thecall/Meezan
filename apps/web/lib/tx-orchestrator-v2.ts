/**
 * Transaction Orchestrator for MeezanVault Setup Flow
 *
 * SIMPLIFIED 3-STEP FLOW:
 * 1. Create vault via Factory (V3 preferred if available, otherwise V2)
 * 2. Approve USDC spending
 * 3. Fund portfolio (depositAndRebalance - single tx for deposit + allocation)
 *
 * V3 UPGRADE (2026-01-26):
 * - On Base mainnet, V3 factory is now REQUIRED (V2 creation forbidden)
 * - V3 vaults have convertAndWithdraw for atomic USDC conversion
 *
 * Source of Truth Priority:
 * 1. bytecode exists at vault address (eth_getCode)
 * 2. vault.owner() == user
 * 3. allowance sufficient
 * 4. balances updated
 * Factory used for address lookup only; localStorage is cache only and always verified.
 *
 * Phantom Vault Handling:
 * - If factory/cache points to address with no bytecode:
 *   purge cache and proceed with fresh create.
 */

import { createPublicClient, http, fallback, parseUnits, formatUnits, type Address, type Hash, decodeEventLog } from 'viem'
import { base } from 'viem/chains'
import {
  CONTRACTS_V2,
  FACTORY_V2_ABI,
  VAULT_V2_ABI,
  buildAssetConfig,
  storeVaultV2,
  clearAllVaultsV2,
  hasContractBytecode,
  type AssetConfigV2,
} from './contracts-v2'
import {
  getV3FactoryAddress,
  FACTORY_V3_ABI,
  VAULT_V3_ABI,
  CONTRACTS_V3_MAINNET,
} from './contracts-v3'
import { storeV3Vault } from './vault-detection'
import { ERC20_ABI } from './contracts'
import { type AssetId } from './assets'

// ═══════════════════════════════════════════════════════════════════════════════
// V3 FACTORY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the active factory address for vault creation
 * V3 is REQUIRED on Base mainnet - V2 creation is forbidden
 */
function getActiveFactory(chainId: number): { address: Address; abi: readonly any[]; version: 'v3' | 'v2' } {
  const v3Factory = getV3FactoryAddress(chainId)

  if (v3Factory) {
    console.log('[Factory] Using V3 factory:', v3Factory)
    return { address: v3Factory, abi: FACTORY_V3_ABI, version: 'v3' }
  }

  // Fallback to V2 only if V3 not available (should not happen on mainnet)
  console.warn('[Factory] V3 not available, falling back to V2 (this should not happen on mainnet)')
  return { address: CONTRACTS_V2.factoryV2, abi: FACTORY_V2_ABI, version: 'v2' }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

// IMPORTANT: mainnet.base.org first - more reliable for fresh transaction data
const baseTransportV2 = fallback([
  http('https://mainnet.base.org', { timeout: 15_000 }),
  http('https://base.llamarpc.com', { timeout: 15_000 }),
  http(),
])

export const publicClientV2 = createPublicClient({
  chain: base,
  transport: baseTransportV2,
})

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE TYPES (SIMPLIFIED - 3 STEPS ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

export type SetupStepV2 =
  | 'idle'
  | 'checking_state'          // Verify on-chain state before each step
  | 'creating_vault'
  | 'waiting_vault_confirm'
  | 'approving_usdc'
  | 'waiting_approval_confirm'
  | 'funding'                 // depositAndRebalance in single tx
  | 'waiting_funding_confirm'
  | 'complete'
  | 'error'

export interface SetupStateV2 {
  step: SetupStepV2
  vaultAddress: Address | null
  configHash: string | null
  txHash: Hash | null
  error: string | null
  progress: number // 0-100
  message: string | null // User-friendly status message
}

export interface SetupConfigV2 {
  allocations: Record<AssetId, number>
  driftThresholdBps: number
  depositAmountUsdc: string
  existingVaultAddress?: Address
}

// Step progress percentages (3 steps: create, approve, fund)
const STEP_PROGRESS: Record<SetupStepV2, number> = {
  idle: 0,
  checking_state: 5,
  creating_vault: 15,
  waiting_vault_confirm: 30,
  approving_usdc: 45,
  waiting_approval_confirm: 60,
  funding: 75,
  waiting_funding_confirm: 90,
  complete: 100,
  error: 0,
}

// Human-readable step descriptions
export const STEP_DESCRIPTIONS: Record<SetupStepV2, string> = {
  idle: 'Ready to begin',
  checking_state: 'Checking wallet state...',
  creating_vault: 'Creating vault...',
  waiting_vault_confirm: 'Confirming vault...',
  approving_usdc: 'Approve USDC...',
  waiting_approval_confirm: 'Confirming approval...',
  funding: 'Funding portfolio...',
  waiting_funding_confirm: 'Allocating assets...',
  complete: 'Portfolio ready!',
  error: 'An error occurred',
}

// ═══════════════════════════════════════════════════════════════════════════════
// ON-CHAIN STATE VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

interface ChainState {
  vaultExists: boolean
  vaultAddress: Address | null
  isOwner: boolean
  allowanceSufficient: boolean
  allowance: bigint
  vaultFunded: boolean
  vaultBalance: bigint
}

/**
 * Verify all on-chain state to determine which steps to skip
 * Source of truth priority: bytecode > owner > allowance > balance
 */
async function verifyChainState(
  ownerAddress: Address,
  assetConfigs: AssetConfigV2[],
  driftThresholdBps: number,
  depositAmount: bigint,
  chainId: number = 8453
): Promise<ChainState> {
  console.log('[ChainState] Verifying on-chain state for', ownerAddress)

  const result: ChainState = {
    vaultExists: false,
    vaultAddress: null,
    isOwner: false,
    allowanceSufficient: false,
    allowance: BigInt(0),
    vaultFunded: false,
    vaultBalance: BigInt(0),
  }

  // Get active factory (V3 preferred)
  const factory = getActiveFactory(chainId)
  const stablecoin = factory.version === 'v3' ? CONTRACTS_V3_MAINNET.usdc : CONTRACTS_V2.usdc

  // Step 1: Query factory for vault address
  let vaultAddress: Address | null = null
  try {
    const factoryResult = await publicClientV2.readContract({
      address: factory.address,
      abi: factory.abi,
      functionName: 'getVault',
      args: [ownerAddress, assetConfigs, stablecoin, driftThresholdBps],
    })
    if (factoryResult && factoryResult !== '0x0000000000000000000000000000000000000000') {
      vaultAddress = factoryResult as Address
    }
  } catch (e) {
    console.warn('[ChainState] Factory query failed:', (e as Error).message?.slice(0, 50))
  }

  if (!vaultAddress) {
    console.log('[ChainState] No vault registered in factory')
    return result
  }

  console.log('[ChainState] Factory returned vault:', vaultAddress)
  result.vaultAddress = vaultAddress

  // Step 2: Check bytecode exists (SOURCE OF TRUTH #1)
  const hasBytecode = await hasContractBytecode(vaultAddress)
  if (!hasBytecode) {
    console.warn('[ChainState] PHANTOM VAULT - factory has record but no bytecode')
    return result // vaultExists stays false
  }

  console.log('[ChainState] Vault has bytecode')

  // Step 3: Check owner (SOURCE OF TRUTH #2)
  try {
    const owner = await publicClientV2.readContract({
      address: vaultAddress,
      abi: VAULT_V2_ABI,
      functionName: 'owner',
    })
    result.isOwner = owner.toLowerCase() === ownerAddress.toLowerCase()
    console.log('[ChainState] Vault owner:', owner, 'isOwner:', result.isOwner)

    if (!result.isOwner) {
      console.warn('[ChainState] Vault not owned by user')
      return result
    }
  } catch (e) {
    console.warn('[ChainState] Owner check failed:', (e as Error).message?.slice(0, 50))
    return result
  }

  // Vault exists and is owned by user
  result.vaultExists = true

  // Step 4: Check USDC allowance (SOURCE OF TRUTH #3)
  try {
    const allowance = await publicClientV2.readContract({
      address: CONTRACTS_V2.usdc,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [ownerAddress, vaultAddress],
    })
    result.allowance = allowance as bigint
    result.allowanceSufficient = result.allowance >= depositAmount
    console.log('[ChainState] USDC allowance:', formatUnits(result.allowance, 6), 'sufficient:', result.allowanceSufficient)
  } catch (e) {
    console.warn('[ChainState] Allowance check failed:', (e as Error).message?.slice(0, 50))
  }

  // Step 5: Check vault balance (SOURCE OF TRUTH #4)
  try {
    const holdings = await publicClientV2.readContract({
      address: vaultAddress,
      abi: VAULT_V2_ABI,
      functionName: 'holdings',
    })

    // Sum all holdings to check if funded
    let totalBalance = BigInt(0)
    for (const holding of holdings as bigint[]) {
      totalBalance += holding
    }
    result.vaultBalance = totalBalance
    result.vaultFunded = totalBalance > BigInt(0)
    console.log('[ChainState] Vault funded:', result.vaultFunded, 'total holdings > 0:', totalBalance > 0)
  } catch (e) {
    console.warn('[ChainState] Holdings check failed:', (e as Error).message?.slice(0, 50))
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP ORCHESTRATOR CLASS (SIMPLIFIED 3-STEP)
// ═══════════════════════════════════════════════════════════════════════════════

export class SetupOrchestratorV2 {
  private state: SetupStateV2 = {
    step: 'idle',
    vaultAddress: null,
    configHash: null,
    txHash: null,
    error: null,
    progress: 0,
    message: null,
  }

  private config: SetupConfigV2 | null = null
  private assetConfigs: AssetConfigV2[] = []
  private stablecoinIndex: number = -1
  private ownerAddress: Address | null = null

  private onStateChange: ((state: SetupStateV2) => void) | null = null
  private writeContract: ((args: any) => Promise<Hash>) | null = null
  private waitForReceipt: ((hash: Hash) => Promise<any>) | null = null

  /**
   * Initialize the orchestrator with callbacks
   */
  initialize(
    onStateChange: (state: SetupStateV2) => void,
    writeContract: (args: any) => Promise<Hash>,
    waitForReceipt: (hash: Hash) => Promise<any>,
    ownerAddress: Address
  ): void {
    this.onStateChange = onStateChange
    this.writeContract = writeContract
    this.waitForReceipt = waitForReceipt
    this.ownerAddress = ownerAddress
  }

  /**
   * Get current state
   */
  getState(): SetupStateV2 {
    return { ...this.state }
  }

  /**
   * Update state and notify listeners
   */
  private setState(updates: Partial<SetupStateV2>): void {
    this.state = { ...this.state, ...updates }
    if (updates.step) {
      this.state.progress = STEP_PROGRESS[this.state.step]
    }
    this.onStateChange?.(this.getState())
  }

  /**
   * Start the setup process - IDEMPOTENT
   * Checks on-chain state and skips completed steps
   */
  async start(config: SetupConfigV2): Promise<void> {
    console.log('[Orchestrator] Starting setup with config:', config)

    if (!this.writeContract || !this.waitForReceipt || !this.ownerAddress) {
      this.setState({
        step: 'error',
        error: 'Setup not ready. Please refresh and try again.',
      })
      return
    }

    this.config = config
    this.assetConfigs = buildAssetConfig(config.allocations)

    // Find USDC index
    const usdcAddress = CONTRACTS_V2.usdc.toLowerCase()
    this.stablecoinIndex = this.assetConfigs.findIndex(
      c => c.token.toLowerCase() === usdcAddress
    )

    if (this.stablecoinIndex === -1) {
      this.setState({
        step: 'error',
        error: 'USDC must be included in portfolio',
      })
      return
    }

    const depositAmount = parseUnits(config.depositAmountUsdc, 6)

    // Check on-chain state to determine where to resume
    this.setState({ step: 'checking_state', message: 'Checking wallet state...' })

    const chainState = await verifyChainState(
      this.ownerAddress,
      this.assetConfigs,
      config.driftThresholdBps,
      depositAmount
    )

    console.log('[Orchestrator] Chain state:', chainState)

    // Handle phantom vault - clear cache and start fresh
    if (chainState.vaultAddress && !chainState.vaultExists) {
      console.log('[Orchestrator] Phantom vault detected, clearing cache and starting fresh')
      clearAllVaultsV2(this.ownerAddress)
      this.setState({ message: 'Previous setup interrupted. Starting fresh.' })
      // Proceed to create new vault
      await this.createVault()
      return
    }

    // Determine which step to start from based on chain state
    if (chainState.vaultFunded) {
      // Already complete!
      console.log('[Orchestrator] Vault already funded, setup complete')
      this.setState({
        step: 'complete',
        vaultAddress: chainState.vaultAddress,
        message: 'Portfolio already set up!',
      })
      return
    }

    if (chainState.vaultExists && chainState.allowanceSufficient) {
      // Skip to funding
      console.log('[Orchestrator] Vault exists and approved, skipping to fund')
      this.setState({ vaultAddress: chainState.vaultAddress })
      await this.fundPortfolio()
      return
    }

    if (chainState.vaultExists) {
      // Skip to approve
      console.log('[Orchestrator] Vault exists, skipping to approve')
      this.setState({ vaultAddress: chainState.vaultAddress })
      storeVaultV2(this.ownerAddress, chainState.vaultAddress!, 'existing')
      await this.approveUsdc()
      return
    }

    // No vault - start from beginning
    console.log('[Orchestrator] No valid vault found, creating new one')
    await this.createVault()
  }

  /**
   * Step 1: Create vault via factory (V3 preferred on mainnet)
   */
  private async createVault(): Promise<void> {
    if (!this.writeContract || !this.waitForReceipt || !this.config || !this.ownerAddress) return

    // Get active factory - V3 is REQUIRED on mainnet
    const factory = getActiveFactory(8453) // Base mainnet
    const stablecoin = factory.version === 'v3' ? CONTRACTS_V3_MAINNET.usdc : CONTRACTS_V2.usdc
    const eventName = factory.version === 'v3' ? 'VaultV3Deployed' : 'VaultV2Deployed'

    console.log(`[Orchestrator] Creating ${factory.version.toUpperCase()} vault via factory:`, factory.address)

    try {
      this.setState({ step: 'creating_vault', error: null, message: 'Confirm in wallet...' })

      const hash = await this.writeContract({
        address: factory.address,
        abi: factory.abi,
        functionName: 'createVault',
        args: [this.assetConfigs, stablecoin, this.config.driftThresholdBps],
      })

      this.setState({ step: 'waiting_vault_confirm', txHash: hash, message: 'Creating vault...' })

      const receipt = await this.waitForReceipt(hash)

      if (receipt.status !== 'success') {
        throw new Error('Vault creation failed')
      }

      // Extract vault address from event
      let vaultAddress: Address | null = null
      let configHash: string = 'deployed'

      if (receipt.logs && receipt.logs.length > 0) {
        for (const log of receipt.logs) {
          try {
            const normalizedLog = {
              data: log.data || '0x',
              topics: log.topics || [],
            }

            const decoded = decodeEventLog({
              abi: factory.abi,
              data: normalizedLog.data,
              topics: normalizedLog.topics,
            })

            if (decoded.eventName === eventName) {
              vaultAddress = (decoded.args as any).vault as Address
              configHash = (decoded.args as any).configHash || 'deployed'
              break
            }
          } catch {
            // Continue trying other logs
          }
        }
      }

      // Fallback: query factory
      if (!vaultAddress) {
        const result = await publicClientV2.readContract({
          address: factory.address,
          abi: factory.abi,
          functionName: 'getVault',
          args: [this.ownerAddress, this.assetConfigs, stablecoin, this.config.driftThresholdBps],
        })
        if (result && result !== '0x0000000000000000000000000000000000000000') {
          vaultAddress = result as Address
        }
      }

      if (!vaultAddress) {
        throw new Error('Could not determine vault address')
      }

      // Store in correct localStorage based on version
      this.setState({ vaultAddress, configHash })
      if (factory.version === 'v3') {
        storeV3Vault(this.ownerAddress, vaultAddress)
      } else {
        storeVaultV2(this.ownerAddress, vaultAddress, configHash)
      }

      await this.approveUsdc()
    } catch (error: any) {
      // Handle VaultAlreadyExists - re-check chain state
      const errorMsg = (error?.message || '').toLowerCase()
      if (errorMsg.includes('vaultalreadyexists') || errorMsg.includes('0x04aabf33')) {
        console.log('[Orchestrator] Vault already exists, re-checking state')
        await this.start(this.config!)
        return
      }

      this.setState({
        step: 'error',
        error: parseError(error),
        message: null,
      })
    }
  }

  /**
   * Step 2: Approve USDC spending
   */
  private async approveUsdc(): Promise<void> {
    if (!this.writeContract || !this.waitForReceipt || !this.state.vaultAddress || !this.config) return

    try {
      this.setState({ step: 'approving_usdc', error: null, message: 'Confirm in wallet...' })

      const depositAmount = parseUnits(this.config.depositAmountUsdc, 6)

      const hash = await this.writeContract({
        address: CONTRACTS_V2.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [this.state.vaultAddress, depositAmount],
      })

      this.setState({ step: 'waiting_approval_confirm', txHash: hash, message: 'Approving USDC...' })

      const receipt = await this.waitForReceipt(hash)

      if (receipt.status !== 'success') {
        throw new Error('USDC approval failed')
      }

      await this.fundPortfolio()
    } catch (error: any) {
      this.setState({
        step: 'error',
        error: parseError(error),
        message: null,
      })
    }
  }

  /**
   * Step 3: Fund portfolio (depositAndRebalance - SINGLE TX)
   * This deposits USDC and automatically allocates to BTC/ETH in one transaction
   */
  private async fundPortfolio(): Promise<void> {
    if (!this.writeContract || !this.waitForReceipt || !this.state.vaultAddress || !this.config) return

    try {
      this.setState({ step: 'funding', error: null, message: 'Confirm in wallet...' })

      const depositAmount = parseUnits(this.config.depositAmountUsdc, 6)

      // Use correct ABI based on vault version
      // V3 is preferred on mainnet, but function signature is the same
      const factory = getActiveFactory(8453)
      const vaultAbi = factory.version === 'v3' ? VAULT_V3_ABI : VAULT_V2_ABI

      // Single transaction: deposit USDC + buy BTC & ETH
      const hash = await this.writeContract({
        address: this.state.vaultAddress,
        abi: vaultAbi,
        functionName: 'depositAndRebalance',
        args: [this.stablecoinIndex, depositAmount],
      })

      this.setState({ step: 'waiting_funding_confirm', txHash: hash, message: 'Buying BTC & ETH...' })

      const receipt = await this.waitForReceipt(hash)

      if (receipt.status !== 'success') {
        throw new Error('Funding failed')
      }

      // Setup complete!
      this.setState({ step: 'complete', message: 'Portfolio ready!' })
    } catch (error: any) {
      this.setState({
        step: 'error',
        error: parseError(error),
        message: null,
      })
    }
  }

  /**
   * Retry from current failed step
   * Re-checks on-chain state to ensure idempotency
   */
  async retry(): Promise<void> {
    if (this.state.step !== 'error' || !this.config) return
    await this.start(this.config)
  }

  /**
   * Reset the orchestrator
   */
  reset(): void {
    this.state = {
      step: 'idle',
      vaultAddress: null,
      configHash: null,
      txHash: null,
      error: null,
      progress: 0,
      message: null,
    }
    this.config = null
    this.onStateChange?.(this.getState())
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const setupOrchestratorV2 = new SetupOrchestratorV2()

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR PARSING
// ═══════════════════════════════════════════════════════════════════════════════

function parseError(error: any): string {
  const message = (error?.message || error?.toString() || '').toLowerCase()

  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected the request') ||
    message.includes('user cancelled')
  ) {
    return 'Transaction cancelled'
  }

  if (message.includes('vaultalreadyexists') || message.includes('0x04aabf33')) {
    return 'Vault already exists'
  }

  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient ETH for gas'
  }

  if (message.includes('insufficient') && message.includes('usdc')) {
    return 'Insufficient USDC balance'
  }

  if (message.includes('slippage')) {
    return 'Price moved too much, try again'
  }

  if (message.includes('stale')) {
    return 'Price feed unavailable, try again'
  }

  if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
    return 'Network error, please retry'
  }

  return 'Something went wrong'
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function verifyVaultExistsV2(vaultAddress: Address): Promise<boolean> {
  try {
    const assetCount = await publicClientV2.readContract({
      address: vaultAddress,
      abi: VAULT_V2_ABI,
      functionName: 'assetCount',
    })
    return Number(assetCount) >= 2
  } catch {
    return false
  }
}

export function estimateSetupGasV2(): {
  createVault: number
  approveUsdc: number
  fundPortfolio: number
  total: number
} {
  return {
    createVault: 800_000,
    approveUsdc: 50_000,
    fundPortfolio: 600_000, // deposit + rebalance combined
    total: 1_450_000,
  }
}
