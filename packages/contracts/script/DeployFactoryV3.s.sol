// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MeezanFactoryV3} from "../src/MeezanFactoryV3.sol";
import {MeezanVaultV3} from "../src/MeezanVaultV3.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockPriceFeed} from "../test/mocks/MockPriceFeed.sol";

/**
 * @title DeployFactoryV3
 * @notice Deployment script for MeezanFactoryV3 on Base Sepolia (testnet)
 * @dev Deploys factory, mock dependencies, and one example vault for integration testing
 *
 * ⚠️  TEST-ONLY DEPLOYMENT ⚠️
 * This script deploys mock tokens and price feeds because:
 * - Chainlink price feeds are NOT available on Base Sepolia
 * - cbBTC is NOT available on Base Sepolia
 * - Swap execution will NOT work (no liquidity pools for mock tokens)
 *
 * Use this deployment to test:
 * ✅ Factory deployment and vault creation
 * ✅ Deposit/withdraw flows (direct transfers)
 * ✅ View functions and state management
 * ✅ Access control and permissions
 * ✅ Event emission
 *
 * NOT testable on Sepolia:
 * ❌ Rebalance swaps (no pools)
 * ❌ convertAndWithdraw() swaps (no pools)
 * ❌ Background conversion execution (no pools)
 *
 * Required environment variables:
 *   DEPLOYER_PRIVATE_KEY - Private key of deployer (also becomes vault owner)
 *   V3_EXECUTOR_ADDRESS  - Protocol executor for background conversions
 *
 * Usage:
 *   # Set required env vars
 *   export DEPLOYER_PRIVATE_KEY=0x...
 *   export V3_EXECUTOR_ADDRESS=0x...  # Can be same as deployer for testing
 *
 *   # Deploy (simulation first)
 *   forge script script/DeployFactoryV3.s.sol --rpc-url https://sepolia.base.org -vvvv
 *
 *   # Deploy (broadcast)
 *   forge script script/DeployFactoryV3.s.sol --rpc-url https://sepolia.base.org --broadcast -vvvv
 */
contract DeployFactoryV3 is Script {
    // ============ Base Sepolia VERIFIED Addresses ============
    // Source: Uniswap docs (https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments)

    address constant SWAP_ROUTER_SEPOLIA = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;
    address constant WETH_SEPOLIA = 0x4200000000000000000000000000000000000006;

    // Source: Circle docs (https://www.circle.com/en/multi-chain-usdc/base)
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // ============ Mock Price Values (8 decimals, Chainlink standard) ============

    int256 constant BTC_PRICE = 100_000 * 1e8;   // $100,000
    int256 constant ETH_PRICE = 3_500 * 1e8;     // $3,500
    int256 constant USDC_PRICE = 1 * 1e8;        // $1.00

    // Pool fees (standard Uniswap tiers)
    uint24 constant POOL_FEE_500 = 500;    // 0.05%
    uint24 constant POOL_FEE_3000 = 3000;  // 0.3%

    // Vault configuration
    uint16 constant DRIFT_THRESHOLD_BPS = 500;  // 5%

    // ============ Deployed Contracts ============

    MeezanFactoryV3 public factory;
    MeezanVaultV3 public exampleVault;

    // Mocks (TEST-ONLY)
    MockERC20 public mockWBTC;
    MockERC20 public mockUSDC;  // Fallback if real USDC not deployed
    MockPriceFeed public mockBtcFeed;
    MockPriceFeed public mockEthFeed;
    MockPriceFeed public mockUsdcFeed;

    // Actual addresses used (may be real or mock)
    address public usdcAddress;
    bool public usingMockUsdc;

    function run() external {
        // Load required env vars
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address executor = vm.envAddress("V3_EXECUTOR_ADDRESS");
        address deployer = vm.addr(deployerKey);

        // ============ Pre-flight: Verify USDC exists ============
        uint256 usdcCodeSize;
        assembly {
            usdcCodeSize := extcodesize(USDC_SEPOLIA)
        }
        usingMockUsdc = (usdcCodeSize == 0);

        console2.log("===========================================");
        console2.log("  MeezanFactoryV3 Deployment (Base Sepolia)");
        console2.log("  *** TEST-ONLY - USES MOCK CONTRACTS ***");
        console2.log("===========================================");
        console2.log("");
        console2.log("Deployer:", deployer);
        console2.log("Executor:", executor);
        console2.log("");

        // Log USDC verification result
        if (usingMockUsdc) {
            console2.log("WARNING: USDC not found at", USDC_SEPOLIA);
            console2.log("         Will deploy MockUSDC instead");
        } else {
            console2.log("USDC verified at:", USDC_SEPOLIA);
        }
        console2.log("");

        vm.startBroadcast(deployerKey);

        // ============ Step 1: Deploy Mock Dependencies ============
        console2.log("--- Step 1: Deploying Mock Dependencies ---");

        // Mock WBTC token (8 decimals like real BTC)
        mockWBTC = new MockERC20("Mock Wrapped BTC", "mWBTC", 8);
        console2.log("MockWBTC deployed:", address(mockWBTC));

        // Deploy MockUSDC if real USDC not available
        if (usingMockUsdc) {
            mockUSDC = new MockERC20("Mock USDC", "mUSDC", 6);
            usdcAddress = address(mockUSDC);
            console2.log("MockUSDC deployed:", usdcAddress);
        } else {
            usdcAddress = USDC_SEPOLIA;
            console2.log("Using real USDC:", usdcAddress);
        }

        // Mock price feeds (8 decimals, Chainlink standard)
        mockBtcFeed = new MockPriceFeed(8, BTC_PRICE, "BTC / USD");
        console2.log("MockBtcFeed deployed:", address(mockBtcFeed));

        mockEthFeed = new MockPriceFeed(8, ETH_PRICE, "ETH / USD");
        console2.log("MockEthFeed deployed:", address(mockEthFeed));

        mockUsdcFeed = new MockPriceFeed(8, USDC_PRICE, "USDC / USD");
        console2.log("MockUsdcFeed deployed:", address(mockUsdcFeed));

        // ============ Step 2: Deploy Factory ============
        console2.log("");
        console2.log("--- Step 2: Deploying Factory ---");

        factory = new MeezanFactoryV3(SWAP_ROUTER_SEPOLIA, executor);
        console2.log("MeezanFactoryV3 deployed:", address(factory));

        // ============ Step 3: Deploy Example Vault ============
        console2.log("");
        console2.log("--- Step 3: Deploying Example Vault ---");

        MeezanVaultV3.AssetConfig[] memory assets = _createTestAssetConfig();
        exampleVault = MeezanVaultV3(
            factory.createVault(assets, usdcAddress, DRIFT_THRESHOLD_BPS)
        );
        console2.log("Example Vault deployed:", address(exampleVault));

        // ============ Step 4: Mint Test Tokens to Deployer ============
        console2.log("");
        console2.log("--- Step 4: Minting Test Tokens ---");

        // Mint mock WBTC to deployer for testing
        mockWBTC.mint(deployer, 10 * 1e8);  // 10 WBTC
        console2.log("Minted 10 mWBTC to deployer");

        // Mint mock USDC if using mock
        if (usingMockUsdc) {
            mockUSDC.mint(deployer, 10_000 * 1e6);  // 10,000 USDC
            console2.log("Minted 10,000 mUSDC to deployer");
        } else {
            console2.log("Get real USDC from faucet: https://faucet.circle.com/");
        }

        vm.stopBroadcast();

        // ============ Log Summary ============
        _logDeploymentSummary(deployer, executor, usingMockUsdc);
    }

    function _createTestAssetConfig() internal view returns (MeezanVaultV3.AssetConfig[] memory) {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](3);

        // Mock WBTC - 40%
        assets[0] = MeezanVaultV3.AssetConfig({
            token: address(mockWBTC),
            priceFeed: address(mockBtcFeed),
            poolFee: POOL_FEE_500,
            targetWeightBps: 4000
        });

        // Real WETH - 40%
        assets[1] = MeezanVaultV3.AssetConfig({
            token: WETH_SEPOLIA,
            priceFeed: address(mockEthFeed),
            poolFee: POOL_FEE_3000,
            targetWeightBps: 4000
        });

        // USDC - 20% (stablecoin) - real or mock depending on availability
        assets[2] = MeezanVaultV3.AssetConfig({
            token: usdcAddress,
            priceFeed: address(mockUsdcFeed),
            poolFee: POOL_FEE_500,
            targetWeightBps: 2000
        });

        return assets;
    }

    function _logDeploymentSummary(address deployer, address executor, bool _usingMockUsdc) internal view {
        console2.log("");
        console2.log("===========================================");
        console2.log("           DEPLOYMENT COMPLETE");
        console2.log("===========================================");
        console2.log("");
        console2.log("Network: Base Sepolia (Chain ID: 84532)");
        console2.log("");
        console2.log("--- Core Contracts ---");
        console2.log("MeezanFactoryV3:", address(factory));
        console2.log("Example Vault:  ", address(exampleVault));
        console2.log("");
        console2.log("--- Mock Contracts (TEST-ONLY) ---");
        console2.log("MockWBTC:       ", address(mockWBTC));
        if (_usingMockUsdc) {
            console2.log("MockUSDC:       ", address(mockUSDC));
        }
        console2.log("MockBtcFeed:    ", address(mockBtcFeed));
        console2.log("MockEthFeed:    ", address(mockEthFeed));
        console2.log("MockUsdcFeed:   ", address(mockUsdcFeed));
        console2.log("");
        console2.log("--- Real Addresses Used ---");
        console2.log("SwapRouter02:   ", SWAP_ROUTER_SEPOLIA);
        console2.log("WETH:           ", WETH_SEPOLIA);
        if (_usingMockUsdc) {
            console2.log("USDC:            MOCK (real not found)");
        } else {
            console2.log("USDC:           ", USDC_SEPOLIA);
        }
        console2.log("");
        console2.log("--- Configuration ---");
        console2.log("Executor:       ", executor);
        console2.log("Vault Owner:    ", deployer);
        console2.log("Drift Threshold:", DRIFT_THRESHOLD_BPS, "bps (5%)");
        console2.log("");
        console2.log("--- Test Token Balances ---");
        console2.log("Deployer mWBTC: 10.00000000 (minted)");
        if (_usingMockUsdc) {
            console2.log("Deployer mUSDC: 10,000.000000 (minted)");
        }
        console2.log("");
        console2.log("===========================================");
        console2.log("  IMPORTANT: WHAT YOU CAN TEST");
        console2.log("===========================================");
        console2.log("");
        console2.log("CAN test on Sepolia:");
        console2.log("  - Factory vault creation");
        console2.log("  - Deposit mWBTC, WETH, USDC to vault");
        console2.log("  - withdrawAll() (direct transfers)");
        console2.log("  - getPortfolio() / getDrift()");
        console2.log("  - Owner/executor permissions");
        console2.log("  - Pause/unpause");
        console2.log("  - requestConversion() / cancelConversion()");
        console2.log("");
        console2.log("CANNOT test (no liquidity pools):");
        console2.log("  - rebalance() swaps");
        console2.log("  - convertAndWithdraw() swaps");
        console2.log("  - executeConversion() swaps");
        console2.log("");
        console2.log("===========================================");
        console2.log("  NEXT STEPS");
        console2.log("===========================================");
        console2.log("");
        console2.log("1. Update docs/DEPLOYMENTS_V3.md with addresses");
        console2.log("2. Get USDC from faucet: https://faucet.circle.com/");
        console2.log("3. Get ETH from faucet for gas");
        console2.log("4. Test deposit/withdraw flows");
        console2.log("5. For swap testing, use Base mainnet fork");
    }
}
