// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {MeezanVaultV2} from "../src/MeezanVaultV2.sol";
import {MeezanFactoryV2} from "../src/MeezanFactoryV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";

/**
 * @title ForkProofV2
 * @notice Integration tests for MeezanVaultV2 on Base mainnet fork
 * @dev Requires BASE_RPC environment variable. Skipped if not set.
 *
 * Tests validate:
 * - Multi-asset vault deployment
 * - Deposit and withdrawal safety
 * - Rebalance execution under normal conditions
 * - Gas consumption bounds
 * - Slippage is within tolerance
 *
 * NOTE: Does NOT assert profit. Only asserts safety and bounded costs.
 *
 * To run: export BASE_RPC=https://mainnet.base.org && forge test --match-path test/ForkProofV2.t.sol -vvv
 */
contract ForkProofV2 is Test {
    // ============ Base Mainnet Addresses ============

    // Tokens
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    // Chainlink Price Feeds on Base
    address constant BTC_USD_FEED = 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D;
    address constant ETH_USD_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    address constant USDC_USD_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;

    // Uniswap V3 SwapRouter
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    // Pool fees
    uint24 constant POOL_FEE_500 = 500;   // 0.05%
    uint24 constant POOL_FEE_3000 = 3000; // 0.3%

    // Known whales for testing
    address constant USDC_WHALE = 0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A;

    // ============ Test State ============

    MeezanFactoryV2 factory;
    MeezanVaultV2 vault;
    address user = address(0xBEEF);
    bool skipForkTests;

    // ============ Setup ============

    function setUp() public {
        // Check if BASE_RPC is set
        string memory rpc = vm.envOr("BASE_RPC", string(""));
        if (bytes(rpc).length == 0) {
            skipForkTests = true;
            return;
        }

        // Create fork
        vm.createSelectFork(rpc);

        // Deploy factory
        factory = new MeezanFactoryV2(SWAP_ROUTER);

        // Give user ETH for gas
        vm.deal(user, 10 ether);
    }

    modifier skipIfNoRpc() {
        if (skipForkTests) {
            emit log("SKIPPED: BASE_RPC not set");
            return;
        }
        _;
    }

    // ============ Helper Functions ============

    function _createThreeAssetConfig() internal pure returns (MeezanVaultV2.AssetConfig[] memory) {
        MeezanVaultV2.AssetConfig[] memory assets = new MeezanVaultV2.AssetConfig[](3);

        // cbBTC - 40%
        assets[0] = MeezanVaultV2.AssetConfig({
            token: CBBTC,
            priceFeed: BTC_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 4000
        });

        // WETH - 40%
        assets[1] = MeezanVaultV2.AssetConfig({
            token: WETH,
            priceFeed: ETH_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 4000
        });

        // USDC - 20%
        assets[2] = MeezanVaultV2.AssetConfig({
            token: USDC,
            priceFeed: USDC_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 2000
        });

        return assets;
    }

    function _createTwoAssetConfig() internal pure returns (MeezanVaultV2.AssetConfig[] memory) {
        MeezanVaultV2.AssetConfig[] memory assets = new MeezanVaultV2.AssetConfig[](2);

        // cbBTC - 50%
        assets[0] = MeezanVaultV2.AssetConfig({
            token: CBBTC,
            priceFeed: BTC_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 5000
        });

        // USDC - 50%
        assets[1] = MeezanVaultV2.AssetConfig({
            token: USDC,
            priceFeed: USDC_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 5000
        });

        return assets;
    }

    function _mockFreshOracles() internal {
        // Get current prices
        (, int256 btcPrice, , , ) = AggregatorV3Interface(BTC_USD_FEED).latestRoundData();
        (, int256 ethPrice, , , ) = AggregatorV3Interface(ETH_USD_FEED).latestRoundData();
        (, int256 usdcPrice, , , ) = AggregatorV3Interface(USDC_USD_FEED).latestRoundData();

        // Mock all feeds with fresh timestamps
        vm.mockCall(
            BTC_USD_FEED,
            abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
            abi.encode(uint80(1), btcPrice, block.timestamp, block.timestamp, uint80(1))
        );
        vm.mockCall(
            ETH_USD_FEED,
            abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
            abi.encode(uint80(1), ethPrice, block.timestamp, block.timestamp, uint80(1))
        );
        vm.mockCall(
            USDC_USD_FEED,
            abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
            abi.encode(uint80(1), usdcPrice, block.timestamp, block.timestamp, uint80(1))
        );
    }

    function _fundUserWithUsdc(uint256 amount) internal {
        // Try to get USDC from whale
        uint256 whaleBalance = IERC20(USDC).balanceOf(USDC_WHALE);
        if (whaleBalance < amount) {
            // Deal directly if whale doesn't have enough
            deal(USDC, user, amount);
        } else {
            vm.prank(USDC_WHALE);
            IERC20(USDC).transfer(user, amount);
        }
    }

    // ============ Test: Vault Deployment ============

    function test_Fork_DeployVaultViaFactory() public skipIfNoRpc {
        MeezanVaultV2.AssetConfig[] memory assets = _createThreeAssetConfig();

        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        assertTrue(vaultAddr != address(0), "Vault should be deployed");

        MeezanVaultV2 v = MeezanVaultV2(vaultAddr);
        assertEq(v.assetCount(), 3);
        assertEq(v.driftThresholdBps(), 500);

        console2.log("Vault deployed at:", vaultAddr);
    }

    // ============ Test: Deposit and Withdraw Safety ============

    function test_Fork_DepositWithdrawSafety() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV2.AssetConfig[] memory assets = _createTwoAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        MeezanVaultV2 v = MeezanVaultV2(vaultAddr);

        // Owner is set immediately - no acceptance needed in v2

        // Fund user
        uint256 depositAmount = 10_000e6; // $10,000 USDC
        _fundUserWithUsdc(depositAmount);

        uint256 usdcBefore = IERC20(USDC).balanceOf(user);
        console2.log("USDC before deposit:", usdcBefore / 1e6);

        // Deposit
        vm.startPrank(user);
        IERC20(USDC).approve(vaultAddr, depositAmount);
        v.deposit(1, depositAmount); // USDC is index 1
        vm.stopPrank();

        // Check vault has USDC
        uint256[] memory holdings = v.holdings();
        assertEq(holdings[1], depositAmount, "Vault should hold deposited USDC");
        console2.log("Vault USDC holdings:", holdings[1] / 1e6);

        // Withdraw all
        vm.prank(user);
        v.withdrawAll();

        // Check user got USDC back
        uint256 usdcAfter = IERC20(USDC).balanceOf(user);
        console2.log("USDC after withdraw:", usdcAfter / 1e6);

        assertEq(usdcAfter, usdcBefore, "User should receive full USDC back");
    }

    // ============ Test: Multi-Asset Deposit ============

    function test_Fork_MultiAssetDeposit() public skipIfNoRpc {
        _mockFreshOracles();

        // Create 3-asset vault
        MeezanVaultV2.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        MeezanVaultV2 v = MeezanVaultV2(vaultAddr);

        // Owner is set immediately - no acceptance needed in v2

        // Fund user with USDC
        uint256 usdcAmount = 5_000e6;
        _fundUserWithUsdc(usdcAmount);

        // Also get some WETH via deal
        uint256 wethAmount = 1e18; // 1 ETH
        deal(WETH, user, wethAmount);

        // Deposit USDC and WETH
        vm.startPrank(user);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        IERC20(WETH).approve(vaultAddr, wethAmount);

        v.deposit(2, usdcAmount); // USDC is index 2
        v.deposit(1, wethAmount); // WETH is index 1
        vm.stopPrank();

        // Verify holdings
        uint256[] memory holdings = v.holdings();
        assertEq(holdings[2], usdcAmount, "USDC holdings");
        assertEq(holdings[1], wethAmount, "WETH holdings");

        console2.log("USDC holdings:", holdings[2] / 1e6);
        console2.log("WETH holdings:", holdings[1] / 1e18);

        // Check total value
        uint256 totalValue = v.totalUsdValue();
        console2.log("Total USD value:", totalValue / 1e18);
        assertTrue(totalValue > 0, "Total value should be positive");
    }

    // ============ Test: Rebalance Execution (Normal Conditions) ============

    function test_Fork_RebalanceExecution_NormalConditions() public skipIfNoRpc {
        _mockFreshOracles();

        // Create 2-asset vault (BTC/USDC 50/50)
        MeezanVaultV2.AssetConfig[] memory assets = _createTwoAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        MeezanVaultV2 v = MeezanVaultV2(vaultAddr);

        // Owner is set immediately - no acceptance needed in v2

        // Deposit only USDC (creates 100% USDC, 0% BTC - max drift)
        uint256 usdcAmount = 10_000e6;
        _fundUserWithUsdc(usdcAmount);

        vm.startPrank(user);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        v.deposit(1, usdcAmount);
        vm.stopPrank();

        // Check drift is high
        uint16 driftBefore = v.portfolioDriftBps();
        console2.log("Drift before rebalance (bps):", driftBefore);
        assertTrue(driftBefore >= 500, "Drift should exceed threshold");

        // Preview rebalance
        (int256[] memory deltas, ) = v.previewRebalance();
        console2.log("BTC delta (USD):", deltas[0] / 1e18);
        console2.log("USDC delta (USD):", deltas[1] / 1e18);

        // Record gas
        uint256 gasBefore = gasleft();

        // Execute rebalance
        vm.prank(user);
        v.rebalance();

        uint256 gasUsed = gasBefore - gasleft();
        console2.log("Gas used for rebalance:", gasUsed);

        // Check drift reduced
        uint16 driftAfter = v.portfolioDriftBps();
        console2.log("Drift after rebalance (bps):", driftAfter);
        assertTrue(driftAfter < driftBefore, "Drift should be reduced");

        // Check we have both assets now
        uint256[] memory holdings = v.holdings();
        console2.log("BTC holdings after:", holdings[0]);
        console2.log("USDC holdings after:", holdings[1] / 1e6);

        assertTrue(holdings[0] > 0, "Should have acquired BTC");

        // Verify total value didn't drastically change (within 5% for slippage + fees)
        uint256 totalValueAfter = v.totalUsdValue();
        console2.log("Total value after (USD):", totalValueAfter / 1e18);

        // Allow up to 5% value loss from swap costs
        assertTrue(
            totalValueAfter >= (usdcAmount * 1e12 * 95) / 100,
            "Value loss should be bounded"
        );
    }

    // ============ Test: Rebalance Gas Measurement ============

    function test_Fork_RebalanceGasMeasurement() public skipIfNoRpc {
        _mockFreshOracles();

        // Create 3-asset vault
        MeezanVaultV2.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        MeezanVaultV2 v = MeezanVaultV2(vaultAddr);

        // Owner is set immediately - no acceptance needed in v2

        // Deposit only USDC to create maximum drift
        uint256 usdcAmount = 20_000e6;
        _fundUserWithUsdc(usdcAmount);

        vm.startPrank(user);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        v.deposit(2, usdcAmount);
        vm.stopPrank();

        // Measure rebalance gas
        uint256 gasBefore = gasleft();

        vm.prank(user);
        v.rebalance();

        uint256 gasUsed = gasBefore - gasleft();

        console2.log("=== GAS MEASUREMENT ===");
        console2.log("Assets:", v.assetCount());
        console2.log("Gas used:", gasUsed);
        console2.log("Gas per asset (approx):", gasUsed / v.assetCount());

        // Gas should be bounded (under 1M for 3 assets)
        assertTrue(gasUsed < 1_000_000, "Gas should be reasonable");
    }

    // ============ Test: Withdrawal Always Works ============

    function test_Fork_WithdrawalAlwaysWorks() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV2.AssetConfig[] memory assets = _createTwoAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        MeezanVaultV2 v = MeezanVaultV2(vaultAddr);

        // Owner is set immediately - no acceptance needed in v2

        // Deposit
        uint256 usdcAmount = 5_000e6;
        _fundUserWithUsdc(usdcAmount);

        vm.startPrank(user);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        v.deposit(1, usdcAmount);
        vm.stopPrank();

        // Pause the vault
        vm.prank(user);
        v.pause();

        // Withdrawal should still work when paused
        vm.prank(user);
        v.withdrawAll();

        uint256[] memory holdings = v.holdings();
        assertEq(holdings[0], 0, "BTC should be withdrawn");
        assertEq(holdings[1], 0, "USDC should be withdrawn");
    }

    // ============ Test: No Residual Approvals After Rebalance ============

    function test_Fork_NoResidualApprovals() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV2.AssetConfig[] memory assets = _createTwoAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        MeezanVaultV2 v = MeezanVaultV2(vaultAddr);

        // Owner is set immediately - no acceptance needed in v2

        // Deposit USDC to create drift
        uint256 usdcAmount = 10_000e6;
        _fundUserWithUsdc(usdcAmount);

        vm.startPrank(user);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        v.deposit(1, usdcAmount);
        vm.stopPrank();

        // Rebalance
        vm.prank(user);
        v.rebalance();

        // Check no residual approvals
        uint256 btcAllowance = IERC20(CBBTC).allowance(vaultAddr, SWAP_ROUTER);
        uint256 usdcAllowance = IERC20(USDC).allowance(vaultAddr, SWAP_ROUTER);

        assertEq(btcAllowance, 0, "BTC approval should be zero");
        assertEq(usdcAllowance, 0, "USDC approval should be zero");
    }
}
