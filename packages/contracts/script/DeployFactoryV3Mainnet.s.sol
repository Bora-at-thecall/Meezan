// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MeezanFactoryV3} from "../src/MeezanFactoryV3.sol";

/**
 * @title DeployFactoryV3Mainnet
 * @notice Deployment script for MeezanFactoryV3 on Base mainnet
 * @dev PRODUCTION DEPLOYMENT - Uses real addresses only
 *
 * Pre-deployment Checklist:
 * -------------------------
 * [ ] Audit complete and findings resolved
 * [ ] Fork tests pass against mainnet state
 * [ ] Executor wallet funded and secured
 * [ ] Environment variables set correctly
 * [ ] Deployer wallet has sufficient ETH for gas
 * [ ] Double-check all addresses match verified contracts
 *
 * Required Environment Variables:
 * -------------------------------
 *   DEPLOYER_PRIVATE_KEY - Private key of deployer (secure cold wallet recommended)
 *   V3_EXECUTOR_ADDRESS  - Protocol executor for background conversions (multisig recommended)
 *
 * Usage:
 * ------
 *   # Set required env vars (use .env file, not command line for keys)
 *   source .env.mainnet
 *
 *   # Dry run (simulation)
 *   forge script script/DeployFactoryV3Mainnet.s.sol \
 *     --rpc-url https://mainnet.base.org \
 *     -vvvv
 *
 *   # Broadcast (REAL DEPLOYMENT)
 *   forge script script/DeployFactoryV3Mainnet.s.sol \
 *     --rpc-url https://mainnet.base.org \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY \
 *     -vvvv
 *
 * Post-deployment:
 * ----------------
 *   1. Verify contract on Basescan (auto if --verify flag used)
 *   2. Run sanity checks (see LAUNCH_CHECKLIST_V3.md)
 *   3. Update frontend with new addresses
 *   4. Create announcement
 */
contract DeployFactoryV3Mainnet is Script {
    // ═══════════════════════════════════════════════════════════════════════════════
    // BASE MAINNET VERIFIED ADDRESSES
    // ═══════════════════════════════════════════════════════════════════════════════
    // Source: https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments

    /// @notice Uniswap V3 SwapRouter02 on Base mainnet
    /// @dev Verified: https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    /// @notice USDC on Base mainnet (Circle native)
    /// @dev Verified: https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @notice cbBTC on Base mainnet (Coinbase wrapped Bitcoin)
    /// @dev Verified: https://basescan.org/address/0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf
    address constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;

    /// @notice WETH on Base mainnet
    /// @dev Verified: https://basescan.org/address/0x4200000000000000000000000000000000000006
    address constant WETH = 0x4200000000000000000000000000000000000006;

    // ═══════════════════════════════════════════════════════════════════════════════
    // CHAINLINK PRICE FEEDS (Base Mainnet)
    // ═══════════════════════════════════════════════════════════════════════════════
    // Source: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base

    /// @notice BTC/USD price feed
    /// @dev Verified: https://basescan.org/address/0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D
    address constant BTC_USD_FEED = 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D;

    /// @notice ETH/USD price feed
    /// @dev Verified: https://basescan.org/address/0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
    address constant ETH_USD_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;

    /// @notice USDC/USD price feed
    /// @dev Verified: https://basescan.org/address/0x7e860098F58bBFC8648a4311b374B1D669a2bc6B
    address constant USDC_USD_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;

    // ═══════════════════════════════════════════════════════════════════════════════
    // DEPLOYMENT OUTPUT
    // ═══════════════════════════════════════════════════════════════════════════════

    MeezanFactoryV3 public factory;

    function run() external {
        // ═══════════════════════════════════════════════════════════════════════════
        // STEP 0: Load and validate environment
        // ═══════════════════════════════════════════════════════════════════════════

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address executor = vm.envAddress("V3_EXECUTOR_ADDRESS");
        address deployer = vm.addr(deployerKey);

        console2.log("");
        console2.log("================================================================");
        console2.log("     MeezanFactoryV3 - BASE MAINNET DEPLOYMENT");
        console2.log("================================================================");
        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // STEP 1: Pre-flight checks
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- Pre-flight Checks ---");
        console2.log("");

        // Check chain ID
        require(block.chainid == 8453, "WRONG CHAIN: Must be Base mainnet (8453)");
        console2.log("[OK] Chain ID: 8453 (Base mainnet)");

        // Verify deployer has ETH
        uint256 deployerBalance = deployer.balance;
        require(deployerBalance >= 0.01 ether, "Deployer needs at least 0.01 ETH for gas");
        console2.log("[OK] Deployer balance:", deployerBalance / 1e15, "finney");

        // Verify executor is not zero (can be zero but warn)
        if (executor == address(0)) {
            console2.log("[WARN] Executor is address(0) - background conversion DISABLED");
        } else {
            console2.log("[OK] Executor:", executor);
        }

        // Verify SwapRouter has code
        require(SWAP_ROUTER.code.length > 0, "SwapRouter has no code");
        console2.log("[OK] SwapRouter verified:", SWAP_ROUTER);

        // Verify USDC has code
        require(USDC.code.length > 0, "USDC has no code");
        console2.log("[OK] USDC verified:", USDC);

        console2.log("");
        console2.log("--- Configuration ---");
        console2.log("Deployer:", deployer);
        console2.log("Executor:", executor);
        console2.log("SwapRouter:", SWAP_ROUTER);
        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // STEP 2: Deploy MeezanFactoryV3
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- Deploying MeezanFactoryV3 ---");
        console2.log("");

        vm.startBroadcast(deployerKey);

        factory = new MeezanFactoryV3(SWAP_ROUTER, executor);

        vm.stopBroadcast();

        console2.log("[DEPLOYED] MeezanFactoryV3:", address(factory));
        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // STEP 3: Post-deployment verification
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- Post-deployment Verification ---");
        console2.log("");

        // Verify factory configuration
        require(factory.swapRouter() == SWAP_ROUTER, "SwapRouter mismatch");
        console2.log("[OK] factory.swapRouter() =", factory.swapRouter());

        require(factory.conversionExecutor() == executor, "Executor mismatch");
        console2.log("[OK] factory.conversionExecutor() =", factory.conversionExecutor());

        require(factory.vaultCount() == 0, "Vault count should be 0");
        console2.log("[OK] factory.vaultCount() = 0");

        // ═══════════════════════════════════════════════════════════════════════════
        // STEP 4: Output summary
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("");
        console2.log("================================================================");
        console2.log("                    DEPLOYMENT SUCCESSFUL");
        console2.log("================================================================");
        console2.log("");
        console2.log("Network:          Base Mainnet (Chain ID: 8453)");
        console2.log("MeezanFactoryV3:  ", address(factory));
        console2.log("SwapRouter:       ", SWAP_ROUTER);
        console2.log("Executor:         ", executor);
        console2.log("");
        console2.log("--- NEXT STEPS ---");
        console2.log("");
        console2.log("1. Verify on Basescan (if not auto-verified):");
        console2.log("   forge verify-contract \\");
        console2.log("     ", address(factory), " \\");
        console2.log("     MeezanFactoryV3 \\");
        console2.log("     --chain-id 8453 \\");
        console2.log("     --constructor-args $(cast abi-encode 'constructor(address,address)'", SWAP_ROUTER, executor, ")");
        console2.log("");
        console2.log("2. Update frontend:");
        console2.log("   - apps/web/lib/contracts-v3.ts: Set factoryV3 address");
        console2.log("   - apps/web/lib/security.ts: Add to VERIFIED_CONTRACTS");
        console2.log("");
        console2.log("3. Run sanity checks (see LAUNCH_CHECKLIST_V3.md)");
        console2.log("");
        console2.log("4. Create announcement");
        console2.log("");
        console2.log("================================================================");
    }
}
