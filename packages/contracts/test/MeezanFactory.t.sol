// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MeezanFactory} from "../src/MeezanFactory.sol";
import {MeezanVault} from "../src/MeezanVault.sol";
import {AllocationPreset} from "../src/AllocationPresets.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceFeed} from "./mocks/MockPriceFeed.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";

contract MeezanFactoryTest is Test {
    MeezanFactory factory;
    MockERC20 tokenA;
    MockERC20 tokenB;
    MockPriceFeed feedA;
    MockPriceFeed feedB;
    MockSwapRouter router;

    address user1 = address(0x1111);
    address user2 = address(0x2222);

    uint24 constant POOL_FEE = 3000;

    function setUp() public {
        // Deploy mocks
        tokenA = new MockERC20("Mock WBTC", "mWBTC", 8);
        tokenB = new MockERC20("Mock USDC", "mUSDC", 6);
        feedA = new MockPriceFeed(8, 100000e8, "BTC / USD");
        feedB = new MockPriceFeed(8, 1e8, "USDC / USD");
        router = new MockSwapRouter(100000e18, address(tokenA), address(tokenB));

        // Deploy factory
        factory = new MeezanFactory(
            address(tokenA),
            address(tokenB),
            address(feedA),
            address(feedB),
            address(router),
            POOL_FEE
        );
    }

    // ========== Constructor Tests ==========

    function test_ConstructorSetsImmutables() public view {
        assertEq(factory.tokenA(), address(tokenA));
        assertEq(factory.tokenB(), address(tokenB));
        assertEq(factory.priceFeedA(), address(feedA));
        assertEq(factory.priceFeedB(), address(feedB));
        assertEq(factory.swapRouter(), address(router));
        assertEq(factory.poolFee(), POOL_FEE);
    }

    // ========== createVault Tests ==========

    function test_CreateVaultDeploysNewVault() public {
        vm.prank(user1);
        address vault = factory.createVault(AllocationPreset.Split50_50);

        assertTrue(vault != address(0));
        assertEq(factory.getVault(user1, AllocationPreset.Split50_50), vault);
    }

    function test_CreateVaultSetsPendingOwner() public {
        vm.prank(user1);
        address vault = factory.createVault(AllocationPreset.Split50_50);

        MeezanVault v = MeezanVault(vault);
        // Factory is initial owner, user1 is pending owner
        assertEq(v.pendingOwner(), user1);
    }

    function test_CreateVaultUserCanAcceptOwnership() public {
        vm.prank(user1);
        address vault = factory.createVault(AllocationPreset.Split50_50);

        MeezanVault v = MeezanVault(vault);

        // User accepts ownership
        vm.prank(user1);
        v.acceptOwnership();

        assertEq(v.owner(), user1);
        assertEq(v.pendingOwner(), address(0));
    }

    function test_CreateVaultEmitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(true, false, false, true);
        emit MeezanFactory.VaultDeployed(user1, address(0), AllocationPreset.Split50_50);
        factory.createVault(AllocationPreset.Split50_50);
    }

    function test_CreateVaultWithDifferentAllocations() public {
        vm.startPrank(user1);

        address vault1 = factory.createVault(AllocationPreset.Split10_90);
        address vault2 = factory.createVault(AllocationPreset.Split25_75);
        address vault3 = factory.createVault(AllocationPreset.Split50_50);
        address vault4 = factory.createVault(AllocationPreset.Split75_25);
        address vault5 = factory.createVault(AllocationPreset.Split90_10);

        vm.stopPrank();

        // All vaults should be different
        assertTrue(vault1 != vault2);
        assertTrue(vault2 != vault3);
        assertTrue(vault3 != vault4);
        assertTrue(vault4 != vault5);

        // All should be tracked
        assertEq(factory.getVault(user1, AllocationPreset.Split10_90), vault1);
        assertEq(factory.getVault(user1, AllocationPreset.Split25_75), vault2);
        assertEq(factory.getVault(user1, AllocationPreset.Split50_50), vault3);
        assertEq(factory.getVault(user1, AllocationPreset.Split75_25), vault4);
        assertEq(factory.getVault(user1, AllocationPreset.Split90_10), vault5);
    }

    function test_CreateVaultRevertsIfAlreadyExists() public {
        vm.startPrank(user1);

        factory.createVault(AllocationPreset.Split50_50);

        vm.expectRevert(MeezanFactory.VaultAlreadyExists.selector);
        factory.createVault(AllocationPreset.Split50_50);

        vm.stopPrank();
    }

    function test_DifferentUsersCanCreateSameAllocation() public {
        vm.prank(user1);
        address vault1 = factory.createVault(AllocationPreset.Split50_50);

        vm.prank(user2);
        address vault2 = factory.createVault(AllocationPreset.Split50_50);

        assertTrue(vault1 != vault2);
        assertEq(factory.getVault(user1, AllocationPreset.Split50_50), vault1);
        assertEq(factory.getVault(user2, AllocationPreset.Split50_50), vault2);
    }

    // ========== getVault Tests ==========

    function test_GetVaultReturnsZeroIfNoVault() public view {
        address vault = factory.getVault(user1, AllocationPreset.Split50_50);
        assertEq(vault, address(0));
    }

    function test_GetVaultReturnsCorrectVault() public {
        vm.prank(user1);
        address created = factory.createVault(AllocationPreset.Split75_25);

        address retrieved = factory.getVault(user1, AllocationPreset.Split75_25);
        assertEq(retrieved, created);
    }

    // ========== Vault Configuration Tests ==========

    function test_CreatedVaultHasCorrectConfig() public {
        vm.prank(user1);
        address vault = factory.createVault(AllocationPreset.Split50_50);

        MeezanVault v = MeezanVault(vault);

        assertEq(address(v.tokenA()), address(tokenA));
        assertEq(address(v.tokenB()), address(tokenB));
        assertEq(address(v.priceFeedA()), address(feedA));
        assertEq(address(v.priceFeedB()), address(feedB));
        assertEq(address(v.swapRouter()), address(router));
        assertEq(v.poolFee(), POOL_FEE);
    }

    function test_CreatedVaultHasCorrectAllocation() public {
        vm.prank(user1);
        address vault = factory.createVault(AllocationPreset.Split90_10);

        MeezanVault v = MeezanVault(vault);
        assertEq(uint8(v.allocation()), uint8(AllocationPreset.Split90_10));
    }

    // ========== Fuzz Tests ==========

    function testFuzz_CreateVaultForAnyUser(address user) public {
        vm.assume(user != address(0));

        vm.prank(user);
        address vault = factory.createVault(AllocationPreset.Split50_50);

        assertTrue(vault != address(0));
        assertEq(factory.getVault(user, AllocationPreset.Split50_50), vault);
    }

    function testFuzz_CreateVaultForAnyAllocation(uint8 allocationRaw) public {
        // Bound to valid allocations (0-4)
        uint8 allocationBounded = uint8(bound(allocationRaw, 0, 4));
        AllocationPreset preset = AllocationPreset(allocationBounded);

        vm.prank(user1);
        address vault = factory.createVault(preset);

        assertTrue(vault != address(0));
        assertEq(factory.getVault(user1, preset), vault);
    }
}
