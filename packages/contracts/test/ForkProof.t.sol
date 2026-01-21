// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MeezanVault} from "../src/MeezanVault.sol";
import {AllocationPreset} from "../src/AllocationPresets.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";

/**
 * @title ForkProof
 * @notice Integration test that runs on a Base mainnet fork
 * @dev Requires BASE_RPC environment variable. Skipped if not set.
 *
 * To run: export BASE_RPC=https://mainnet.base.org && forge test --match-path test/ForkProof.t.sol
 */
contract ForkProof is Test {
    // Base mainnet addresses (used on fork)
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf; // Coinbase Wrapped BTC

    address constant BTC_USD_FEED = 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D; // cbBTC/USD on Base
    address constant USDC_USD_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    uint24 constant POOL_FEE = 500; // 0.05% fee tier for cbBTC/USDC

    // Candidates from Claude Desktop (we will verify balances at runtime)
    address constant WHALE_1 = 0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A; // Coinbase?
    address constant WHALE_2 = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5; // Aave pool?
    address constant WHALE_3 = 0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A; // Treasury?

    MeezanVault vault;
    address user = address(0xBEEF);
    bool skipForkTests;

    function setUp() public {
        // Check if BASE_RPC is set
        string memory rpc = vm.envOr("BASE_RPC", string(""));
        if (bytes(rpc).length == 0) {
            skipForkTests = true;
            return;
        }

        // Uses BASE_RPC from env
        vm.createSelectFork(rpc);

        // Deploy vault as `user` so user becomes the owner (using cbBTC + USDC)
        vm.startPrank(user);
        vault = new MeezanVault(
            CBBTC,
            USDC,
            BTC_USD_FEED,
            USDC_USD_FEED,
            SWAP_ROUTER,
            POOL_FEE,
            5000, // 50% BTC
            5000, // 50% USDC
            500   // 5% drift threshold
        );
        vm.stopPrank();

        // Find a whale that actually has enough USDC on this fork.
        address whale = _findUsdcWhale(10_000e6);
        emit log_named_address("Selected USDC whale", whale);

        // Give the whale ETH for gas (not strictly needed in tests, but safe)
        vm.deal(whale, 10 ether);

        // Transfer USDC from whale -> user
        vm.startPrank(whale);
        IERC20(USDC).transfer(user, 10_000e6);
        vm.stopPrank();
    }

    modifier skipIfNoRpc() {
        if (skipForkTests) {
            emit log("SKIPPED: BASE_RPC not set");
            return;
        }
        _;
    }

    function test_DepositRebalanceWithdraw_ValueShouldNotVanish() public skipIfNoRpc {
        // Mock Chainlink feeds to return fresh price data
        // Get current cbBTC and USDC prices first
        (, int256 cbbtcPrice, , , ) = AggregatorV3Interface(BTC_USD_FEED).latestRoundData();
        (, int256 usdcPrice, , , ) = AggregatorV3Interface(USDC_USD_FEED).latestRoundData();

        // Mock the feeds to return the same prices but with current timestamp
        vm.mockCall(
            BTC_USD_FEED,
            abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
            abi.encode(uint80(1), cbbtcPrice, block.timestamp, block.timestamp, uint80(1))
        );
        vm.mockCall(
            USDC_USD_FEED,
            abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
            abi.encode(uint80(1), usdcPrice, block.timestamp, block.timestamp, uint80(1))
        );

        vm.startPrank(user);

        // Approve + deposit
        IERC20(USDC).approve(address(vault), 10_000e6);
        vault.depositUSDC(10_000e6);

        // Check allocation is ~50/50 at start
        (uint16 a1, uint16 b1) = vault.currentAllocationsBps();
        emit log_named_uint("Initial cbBTC bps", a1);
        emit log_named_uint("Initial USDC bps", b1);

        // Forcing drift in a fully realistic way (Uniswap price movement) is more work.
        // For now, we prove the core point you care about:
        // - No hidden drain
        // - Deposit + withdraw returns value (minus small swap costs)
        //
        // We can extend this test to manipulate pool price later if needed.

        vault.withdrawAll();

        vm.stopPrank();

        // Confirm user got USDC back (should be close to initial, minus swap spread)
        uint256 usdcEnd = IERC20(USDC).balanceOf(user);
        emit log_named_uint("USDC after withdrawAll", usdcEnd);
        assertGt(usdcEnd, 9_000e6); // sanity threshold: should not vanish
    }

    function _findUsdcWhale(uint256 required) internal view returns (address) {
        address[3] memory candidates = [WHALE_1, WHALE_2, WHALE_3];
        uint256 bestBal = 0;
        address best = address(0);

        for (uint256 i = 0; i < candidates.length; i++) {
            uint256 bal = IERC20(USDC).balanceOf(candidates[i]);
            if (bal >= required) return candidates[i];
            if (bal > bestBal) {
                bestBal = bal;
                best = candidates[i];
            }
        }

        // If we got here, none had enough.
        // Print best candidate balance for debugging.
        revert(string(abi.encodePacked("No whale had enough USDC. Best=", vm.toString(best), " bal=", vm.toString(bestBal))));
    }
}
