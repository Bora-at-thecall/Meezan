// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {MeezanVaultV3} from "../src/MeezanVaultV3.sol";
import {MeezanFactoryV3} from "../src/MeezanFactoryV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";

/**
 * @title ForkProofV3
 * @notice Integration tests for MeezanVaultV3 convertAndWithdraw() on Base mainnet fork
 * @dev Requires BASE_RPC environment variable. Skipped if not set.
 *
 * Tests validate:
 * - Successful instant conversion to USDC
 * - Slippage-bounded revert behavior
 * - Dust threshold behavior (MIN_SWAP_USD)
 * - Atomicity (no partial state on revert)
 *
 * NOTE: Does NOT test background conversion (Path C) - that requires executor infra.
 *
 * To run: export BASE_RPC=https://mainnet.base.org && forge test --match-path test/ForkProofV3.t.sol -vvv
 */
contract ForkProofV3 is Test {
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
    address constant WETH_WHALE = 0x4200000000000000000000000000000000000006; // WETH contract itself has ETH

    // ============ Test State ============

    MeezanFactoryV3 factory;
    MeezanVaultV3 vault;
    address user = address(0xBEEF);
    address executor = address(0xE1E2E3e4e5e6e7e8E9EAeBEcedEEeff0f1f2F3f4);
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

        // Deploy factory with executor
        factory = new MeezanFactoryV3(SWAP_ROUTER, executor);

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

    function _createThreeAssetConfig() internal pure returns (MeezanVaultV3.AssetConfig[] memory) {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](3);

        // cbBTC - 40%
        assets[0] = MeezanVaultV3.AssetConfig({
            token: CBBTC,
            priceFeed: BTC_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 4000
        });

        // WETH - 40%
        assets[1] = MeezanVaultV3.AssetConfig({
            token: WETH,
            priceFeed: ETH_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 4000
        });

        // USDC - 20%
        assets[2] = MeezanVaultV3.AssetConfig({
            token: USDC,
            priceFeed: USDC_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 2000
        });

        return assets;
    }

    function _createTwoAssetConfig() internal pure returns (MeezanVaultV3.AssetConfig[] memory) {
        MeezanVaultV3.AssetConfig[] memory assets = new MeezanVaultV3.AssetConfig[](2);

        // cbBTC - 50%
        assets[0] = MeezanVaultV3.AssetConfig({
            token: CBBTC,
            priceFeed: BTC_USD_FEED,
            poolFee: POOL_FEE_500,
            targetWeightBps: 5000
        });

        // USDC - 50%
        assets[1] = MeezanVaultV3.AssetConfig({
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

    function _fundUserWithWeth(uint256 amount) internal {
        deal(WETH, user, amount);
    }

    function _fundUserWithCbbtc(uint256 amount) internal {
        deal(CBBTC, user, amount);
    }

    function _getUsdcPrice() internal view returns (uint256) {
        (, int256 price, , , ) = AggregatorV3Interface(USDC_USD_FEED).latestRoundData();
        return uint256(price);
    }

    function _getBtcPrice() internal view returns (uint256) {
        (, int256 price, , , ) = AggregatorV3Interface(BTC_USD_FEED).latestRoundData();
        return uint256(price);
    }

    function _getEthPrice() internal view returns (uint256) {
        (, int256 price, , , ) = AggregatorV3Interface(ETH_USD_FEED).latestRoundData();
        return uint256(price);
    }

    // ============ Test: Vault Deployment ============

    function test_Fork_V3_DeployVaultViaFactory() public skipIfNoRpc {
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();

        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);

        assertTrue(vaultAddr != address(0), "Vault should be deployed");

        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);
        assertEq(v.assetCount(), 3);
        assertEq(v.driftThresholdBps(), 500);
        assertEq(v.conversionExecutor(), executor);

        console2.log("V3 Vault deployed at:", vaultAddr);
        console2.log("Conversion executor:", v.conversionExecutor());
    }

    // ============ Test: Successful Instant Conversion (Path B) ============

    function test_Fork_V3_ConvertAndWithdraw_Success() public skipIfNoRpc {
        _mockFreshOracles();

        // Create 3-asset vault
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);
        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);

        // Fund user with assets
        uint256 wethAmount = 1e18;      // 1 ETH (~$3,500)
        uint256 usdcAmount = 2_000e6;   // $2,000 USDC
        _fundUserWithWeth(wethAmount);
        _fundUserWithUsdc(usdcAmount);

        // Deposit assets
        vm.startPrank(user);
        IERC20(WETH).approve(vaultAddr, wethAmount);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        v.deposit(1, wethAmount);  // WETH is index 1
        v.deposit(2, usdcAmount);  // USDC is index 2
        vm.stopPrank();

        // Log initial state
        uint256 totalValueBefore = v.totalUsdValue();
        console2.log("=== BEFORE CONVERSION ===");
        console2.log("Total USD value:", totalValueBefore / 1e18);
        console2.log("WETH balance:", IERC20(WETH).balanceOf(vaultAddr) / 1e18);
        console2.log("USDC balance:", IERC20(USDC).balanceOf(vaultAddr) / 1e6);

        // Get conversion asset order
        (address[] memory tokens, uint8[] memory indices) = v.getConversionAssetOrder();
        console2.log("Conversion assets count:", tokens.length);

        // Build minAmountsOut with 2% slippage
        uint256[] memory minAmountsOut = new uint256[](2); // 2 non-USDC assets

        // For cbBTC (index 0) - no balance, set to 0
        minAmountsOut[0] = 0;

        // For WETH (index 1) - calculate expected USDC with 2% slippage
        uint256 ethPrice = _getEthPrice();
        uint256 expectedUsdcFromWeth = (wethAmount * ethPrice) / 1e8; // ETH to USD (8 decimals feed)
        expectedUsdcFromWeth = expectedUsdcFromWeth / 1e12; // Convert to USDC decimals (18 - 6 = 12)
        minAmountsOut[1] = (expectedUsdcFromWeth * 98) / 100; // 2% slippage

        console2.log("Expected USDC from WETH:", expectedUsdcFromWeth / 1e6);
        console2.log("Min USDC out (2% slippage):", minAmountsOut[1] / 1e6);

        // Record user USDC balance before
        uint256 userUsdcBefore = IERC20(USDC).balanceOf(user);

        // Execute convertAndWithdraw
        uint256 gasBefore = gasleft();
        vm.prank(user);
        v.convertAndWithdraw(minAmountsOut);
        uint256 gasUsed = gasBefore - gasleft();

        // Log results
        uint256 userUsdcAfter = IERC20(USDC).balanceOf(user);
        uint256 usdcReceived = userUsdcAfter - userUsdcBefore;

        console2.log("=== AFTER CONVERSION ===");
        console2.log("User USDC received:", usdcReceived / 1e6);
        console2.log("Gas used:", gasUsed);
        console2.log("Vault WETH remaining:", IERC20(WETH).balanceOf(vaultAddr));
        console2.log("Vault USDC remaining:", IERC20(USDC).balanceOf(vaultAddr));

        // Assertions
        assertTrue(usdcReceived > 0, "Should receive USDC");
        assertEq(IERC20(USDC).balanceOf(vaultAddr), 0, "Vault should have 0 USDC");
        assertEq(IERC20(WETH).balanceOf(vaultAddr), 0, "Vault should have 0 WETH");

        // Value should be within 5% of original (accounts for slippage + swap fees)
        uint256 minExpectedValue = (totalValueBefore * 95) / 100 / 1e12; // Convert to USDC decimals
        assertTrue(usdcReceived >= minExpectedValue, "Value loss should be bounded");

        console2.log("=== TEST PASSED: Successful instant conversion ===");
    }

    // ============ Test: Slippage-Bounded Revert ============

    function test_Fork_V3_ConvertAndWithdraw_SlippageRevert() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);
        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);

        // Fund and deposit WETH
        uint256 wethAmount = 1e18;
        _fundUserWithWeth(wethAmount);

        vm.startPrank(user);
        IERC20(WETH).approve(vaultAddr, wethAmount);
        v.deposit(1, wethAmount);
        vm.stopPrank();

        console2.log("=== TESTING SLIPPAGE REVERT ===");
        console2.log("WETH deposited:", wethAmount / 1e18);

        // Build minAmountsOut with impossible slippage (expecting 200% of oracle value)
        uint256[] memory minAmountsOut = new uint256[](2);
        minAmountsOut[0] = 0; // cbBTC - no balance

        // Set minOut to 200% of expected - should fail
        uint256 ethPrice = _getEthPrice();
        uint256 expectedUsdc = (wethAmount * ethPrice) / 1e8 / 1e12;
        minAmountsOut[1] = expectedUsdc * 2; // 200% - impossible

        console2.log("Expected USDC:", expectedUsdc / 1e6);
        console2.log("Impossible minOut:", minAmountsOut[1] / 1e6);

        // Should revert due to slippage
        vm.expectRevert(); // Will revert in swap router due to insufficient output
        vm.prank(user);
        v.convertAndWithdraw(minAmountsOut);

        // Verify vault state unchanged (atomicity)
        assertEq(IERC20(WETH).balanceOf(vaultAddr), wethAmount, "WETH should remain in vault");

        console2.log("=== TEST PASSED: Slippage-bounded revert ===");
    }

    // ============ Test: Dust Threshold Behavior ============

    function test_Fork_V3_ConvertAndWithdraw_DustSkipped() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);
        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);

        // Fund with:
        // - 1 WETH (~$3,500) - should be converted
        // - Tiny cbBTC ($0.50 worth) - should be skipped as dust
        // - Some USDC
        uint256 wethAmount = 1e18;
        uint256 usdcAmount = 1_000e6;

        // cbBTC dust: ~$0.50 worth at ~$100,000/BTC = 0.000005 BTC = 500 satoshis
        uint256 cbbtcDust = 500; // 500 satoshis = ~$0.50

        _fundUserWithWeth(wethAmount);
        _fundUserWithUsdc(usdcAmount);
        _fundUserWithCbbtc(cbbtcDust);

        vm.startPrank(user);
        IERC20(WETH).approve(vaultAddr, wethAmount);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        IERC20(CBBTC).approve(vaultAddr, cbbtcDust);
        v.deposit(1, wethAmount);
        v.deposit(2, usdcAmount);
        v.deposit(0, cbbtcDust);
        vm.stopPrank();

        console2.log("=== TESTING DUST THRESHOLD ===");
        console2.log("cbBTC dust deposited (satoshis):", cbbtcDust);
        console2.log("WETH deposited:", wethAmount / 1e18);
        console2.log("USDC deposited:", usdcAmount / 1e6);

        // Check USD values
        uint256[] memory usdValues = v.getUsdValues();
        console2.log("cbBTC USD value:", usdValues[0] / 1e18);
        console2.log("WETH USD value:", usdValues[1] / 1e18);
        console2.log("USDC USD value:", usdValues[2] / 1e18);

        // MIN_SWAP_USD is 1e18 ($1) - cbBTC dust should be below this
        assertTrue(usdValues[0] < 1e18, "cbBTC should be below dust threshold");

        // Build minAmountsOut - set cbBTC to 0 (will be skipped anyway)
        uint256[] memory minAmountsOut = new uint256[](2);
        minAmountsOut[0] = 0; // cbBTC - dust, will be skipped

        uint256 ethPrice = _getEthPrice();
        uint256 expectedUsdcFromWeth = (wethAmount * ethPrice) / 1e8 / 1e12;
        minAmountsOut[1] = (expectedUsdcFromWeth * 98) / 100; // 2% slippage

        // Execute conversion
        vm.prank(user);
        v.convertAndWithdraw(minAmountsOut);

        // Verify:
        // - cbBTC dust remains in vault (not converted)
        // - WETH was converted (now 0)
        // - User received USDC
        uint256 cbbtcRemaining = IERC20(CBBTC).balanceOf(vaultAddr);
        uint256 wethRemaining = IERC20(WETH).balanceOf(vaultAddr);

        console2.log("=== AFTER CONVERSION ===");
        console2.log("cbBTC remaining (dust):", cbbtcRemaining);
        console2.log("WETH remaining:", wethRemaining);

        assertEq(cbbtcRemaining, cbbtcDust, "cbBTC dust should remain (skipped)");
        assertEq(wethRemaining, 0, "WETH should be converted");

        console2.log("=== TEST PASSED: Dust threshold behavior ===");
    }

    // ============ Test: Atomicity (No Partial State) ============

    function test_Fork_V3_ConvertAndWithdraw_Atomicity() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);
        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);

        // Fund with multiple assets
        uint256 wethAmount = 1e18;
        uint256 usdcAmount = 1_000e6;
        uint256 cbbtcAmount = 1e6; // 0.01 BTC (~$1,000)

        _fundUserWithWeth(wethAmount);
        _fundUserWithUsdc(usdcAmount);
        _fundUserWithCbbtc(cbbtcAmount);

        vm.startPrank(user);
        IERC20(WETH).approve(vaultAddr, wethAmount);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        IERC20(CBBTC).approve(vaultAddr, cbbtcAmount);
        v.deposit(1, wethAmount);
        v.deposit(2, usdcAmount);
        v.deposit(0, cbbtcAmount);
        vm.stopPrank();

        console2.log("=== TESTING ATOMICITY ===");

        // Record state before
        uint256 vaultWethBefore = IERC20(WETH).balanceOf(vaultAddr);
        uint256 vaultCbbtcBefore = IERC20(CBBTC).balanceOf(vaultAddr);
        uint256 vaultUsdcBefore = IERC20(USDC).balanceOf(vaultAddr);
        uint256 userUsdcBefore = IERC20(USDC).balanceOf(user);

        console2.log("Before - Vault WETH:", vaultWethBefore / 1e18);
        console2.log("Before - Vault cbBTC:", vaultCbbtcBefore);
        console2.log("Before - Vault USDC:", vaultUsdcBefore / 1e6);

        // Build minAmountsOut that will fail on second swap (cbBTC)
        // First swap (cbBTC) will have impossible minOut
        uint256[] memory minAmountsOut = new uint256[](2);
        minAmountsOut[0] = type(uint256).max; // cbBTC - impossible minOut
        minAmountsOut[1] = 0; // WETH - would succeed if we got here

        // Should revert atomically
        vm.expectRevert();
        vm.prank(user);
        v.convertAndWithdraw(minAmountsOut);

        // Verify ALL state unchanged (no partial conversion)
        uint256 vaultWethAfter = IERC20(WETH).balanceOf(vaultAddr);
        uint256 vaultCbbtcAfter = IERC20(CBBTC).balanceOf(vaultAddr);
        uint256 vaultUsdcAfter = IERC20(USDC).balanceOf(vaultAddr);
        uint256 userUsdcAfter = IERC20(USDC).balanceOf(user);

        console2.log("After - Vault WETH:", vaultWethAfter / 1e18);
        console2.log("After - Vault cbBTC:", vaultCbbtcAfter);
        console2.log("After - Vault USDC:", vaultUsdcAfter / 1e6);

        assertEq(vaultWethAfter, vaultWethBefore, "WETH should be unchanged");
        assertEq(vaultCbbtcAfter, vaultCbbtcBefore, "cbBTC should be unchanged");
        assertEq(vaultUsdcAfter, vaultUsdcBefore, "USDC should be unchanged");
        assertEq(userUsdcAfter, userUsdcBefore, "User USDC should be unchanged");

        console2.log("=== TEST PASSED: Atomicity verified ===");
    }

    // ============ Test: withdrawAll Still Works (Escape Hatch Invariant) ============

    function test_Fork_V3_WithdrawAll_AlwaysWorks() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);
        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);

        // Fund with multiple assets
        uint256 wethAmount = 1e18;
        uint256 usdcAmount = 1_000e6;

        _fundUserWithWeth(wethAmount);
        _fundUserWithUsdc(usdcAmount);

        vm.startPrank(user);
        IERC20(WETH).approve(vaultAddr, wethAmount);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        v.deposit(1, wethAmount);
        v.deposit(2, usdcAmount);
        vm.stopPrank();

        console2.log("=== TESTING ESCAPE HATCH (withdrawAll) ===");

        uint256 userWethBefore = IERC20(WETH).balanceOf(user);
        uint256 userUsdcBefore = IERC20(USDC).balanceOf(user);

        // withdrawAll should work regardless of conversion state
        vm.prank(user);
        v.withdrawAll();

        uint256 userWethAfter = IERC20(WETH).balanceOf(user);
        uint256 userUsdcAfter = IERC20(USDC).balanceOf(user);

        console2.log("User received WETH:", (userWethAfter - userWethBefore) / 1e18);
        console2.log("User received USDC:", (userUsdcAfter - userUsdcBefore) / 1e6);

        // User should receive exact amounts back (no swaps)
        assertEq(userWethAfter - userWethBefore, wethAmount, "Should receive exact WETH");
        assertEq(userUsdcAfter - userUsdcBefore, usdcAmount, "Should receive exact USDC");

        // Vault should be empty
        assertEq(IERC20(WETH).balanceOf(vaultAddr), 0, "Vault WETH should be 0");
        assertEq(IERC20(USDC).balanceOf(vaultAddr), 0, "Vault USDC should be 0");

        console2.log("=== TEST PASSED: Escape hatch works ===");
    }

    // ============ Test: Gas Measurement for Conversion ============

    function test_Fork_V3_ConvertAndWithdraw_GasMeasurement() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);
        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);

        // Fund with all assets
        uint256 wethAmount = 1e18;
        uint256 usdcAmount = 2_000e6;
        uint256 cbbtcAmount = 1e6; // 0.01 BTC

        _fundUserWithWeth(wethAmount);
        _fundUserWithUsdc(usdcAmount);
        _fundUserWithCbbtc(cbbtcAmount);

        vm.startPrank(user);
        IERC20(WETH).approve(vaultAddr, wethAmount);
        IERC20(USDC).approve(vaultAddr, usdcAmount);
        IERC20(CBBTC).approve(vaultAddr, cbbtcAmount);
        v.deposit(1, wethAmount);
        v.deposit(2, usdcAmount);
        v.deposit(0, cbbtcAmount);
        vm.stopPrank();

        console2.log("=== GAS MEASUREMENT ===");

        // Build minAmountsOut with 2% slippage
        uint256[] memory minAmountsOut = new uint256[](2);

        // cbBTC: 8 decimals token * 8 decimals price / 1e10 = 6 decimals USDC
        uint256 btcPrice = _getBtcPrice();
        uint256 expectedUsdcFromBtc = (cbbtcAmount * btcPrice) / 1e10;
        minAmountsOut[0] = (expectedUsdcFromBtc * 98) / 100;

        // WETH: 18 decimals token * 8 decimals price / 1e8 / 1e12 = 6 decimals USDC
        uint256 ethPrice = _getEthPrice();
        uint256 expectedUsdcFromWeth = (wethAmount * ethPrice) / 1e8 / 1e12;
        minAmountsOut[1] = (expectedUsdcFromWeth * 98) / 100;

        // Measure gas
        uint256 gasBefore = gasleft();
        vm.prank(user);
        v.convertAndWithdraw(minAmountsOut);
        uint256 gasUsed = gasBefore - gasleft();

        console2.log("Assets converted: 2 (cbBTC + WETH)");
        console2.log("Gas used:", gasUsed);
        console2.log("Gas per swap (approx):", gasUsed / 2);

        // Gas should be reasonable (under 500k for 2 swaps + transfer)
        assertTrue(gasUsed < 500_000, "Gas should be reasonable");

        console2.log("=== GAS MEASUREMENT COMPLETE ===");
    }

    // ============ Test: No Residual Approvals After Conversion ============

    function test_Fork_V3_NoResidualApprovals() public skipIfNoRpc {
        _mockFreshOracles();

        // Create vault
        MeezanVaultV3.AssetConfig[] memory assets = _createThreeAssetConfig();
        vm.prank(user);
        address vaultAddr = factory.createVault(assets, USDC, 500);
        MeezanVaultV3 v = MeezanVaultV3(vaultAddr);

        // Fund and deposit
        uint256 wethAmount = 1e18;
        _fundUserWithWeth(wethAmount);

        vm.startPrank(user);
        IERC20(WETH).approve(vaultAddr, wethAmount);
        v.deposit(1, wethAmount);
        vm.stopPrank();

        // Build minAmountsOut
        uint256[] memory minAmountsOut = new uint256[](2);
        minAmountsOut[0] = 0;
        uint256 ethPrice = _getEthPrice();
        uint256 expectedUsdcFromWeth = (wethAmount * ethPrice) / 1e8 / 1e12;
        minAmountsOut[1] = (expectedUsdcFromWeth * 98) / 100;

        // Execute conversion
        vm.prank(user);
        v.convertAndWithdraw(minAmountsOut);

        // Check no residual approvals to swap router
        uint256 wethAllowance = IERC20(WETH).allowance(vaultAddr, SWAP_ROUTER);
        uint256 cbbtcAllowance = IERC20(CBBTC).allowance(vaultAddr, SWAP_ROUTER);
        uint256 usdcAllowance = IERC20(USDC).allowance(vaultAddr, SWAP_ROUTER);

        assertEq(wethAllowance, 0, "WETH approval should be zero");
        assertEq(cbbtcAllowance, 0, "cbBTC approval should be zero");
        assertEq(usdcAllowance, 0, "USDC approval should be zero");

        console2.log("=== TEST PASSED: No residual approvals ===");
    }
}
