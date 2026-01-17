// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RiskLevel, getTargetAllocations} from "./RiskPresets.sol";

/**
 * @title MeezanVault
 * @notice A non-custodial, single-owner vault for holding a two-token portfolio.
 * @dev Designed for long-term holding with rule-based rebalancing. One vault per user.
 *
 * Architecture notes:
 * - Owner is immutable and set at deployment (msg.sender)
 * - Token addresses are immutable (WBTC as tokenA, stablecoin as tokenB)
 * - Risk level and target allocations are set at construction and immutable
 * - No internal balance tracking; uses on-chain balanceOf() directly
 * - Rebalancing is triggered by % drift only; time is a safety cooldown, not a trigger
 * - Withdrawals are always instant and unrestricted for the owner
 */
contract MeezanVault {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Minimum allowed drift threshold (3%)
    uint16 public constant MIN_DRIFT_BPS = 300;

    /// @notice Default drift threshold to trigger rebalance (5%)
    uint16 public constant DEFAULT_DRIFT_BPS = 500;

    /// @notice Minimum time between rebalances (12 hours)
    uint32 public constant COOLDOWN_SECONDS = 43200;

    // ─────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────

    error OnlyOwner();
    error OnlyOwnerOrExecutor();
    error ZeroAmount();
    error ZeroAddress();
    error IdenticalTokens();
    error InsufficientBalance();
    error DriftTooLow();
    error CooldownNotElapsed();

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    event Deposit(address indexed owner, address indexed token, uint256 amount);
    event Withdraw(address indexed owner, address indexed token, uint256 amount);
    event ExecutorSet(address indexed previousExecutor, address indexed newExecutor);
    event AutoRebalanceToggled(bool enabled);
    event RebalancePlanned(
        address indexed caller,
        address indexed sellToken,
        address indexed buyToken,
        uint16 driftBps,
        uint16 currentPctA,
        uint16 targetPctA,
        uint64 timestamp
    );

    // ─────────────────────────────────────────────────────────────────────
    // Immutable State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice The owner of this vault (set at deployment, cannot be changed)
    address public immutable owner;

    /// @notice Token A (e.g., WBTC)
    IERC20 public immutable tokenA;

    /// @notice Token B (e.g., USDC)
    IERC20 public immutable tokenB;

    /// @notice The selected risk level for this vault
    RiskLevel public immutable riskLevel;

    /// @notice Target allocation for token A in basis points (0-10000)
    uint16 public immutable targetPctA;

    /// @notice Target allocation for token B in basis points (0-10000)
    uint16 public immutable targetPctB;

    // ─────────────────────────────────────────────────────────────────────
    // Mutable State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Timestamp of last rebalance
    uint64 public lastRebalanceAt;

    /// @notice Whether automatic rebalancing by executor is enabled
    bool public autoRebalanceEnabled;

    /// @notice Address authorized to call rebalance when auto-rebalance is enabled
    address public executor;

    // ─────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyOwnerOrExecutor() {
        if (msg.sender == owner) {
            _;
        } else if (autoRebalanceEnabled && executor != address(0) && msg.sender == executor) {
            _;
        } else {
            revert OnlyOwnerOrExecutor();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Creates a new vault for the caller with a predefined risk level
     * @param _tokenA Address of token A (e.g., WBTC)
     * @param _tokenB Address of token B (e.g., USDC)
     * @param _riskLevel The risk level determining target allocations
     */
    constructor(
        address _tokenA,
        address _tokenB,
        RiskLevel _riskLevel
    ) {
        if (_tokenA == address(0) || _tokenB == address(0)) revert ZeroAddress();
        if (_tokenA == _tokenB) revert IdenticalTokens();

        owner = msg.sender;
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        riskLevel = _riskLevel;

        (uint16 pctA, uint16 pctB) = getTargetAllocations(_riskLevel);
        targetPctA = pctA;
        targetPctB = pctB;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Owner Configuration
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Set the executor address for automated rebalancing
     * @param newExecutor The new executor address (can be address(0) to disable)
     */
    function setExecutor(address newExecutor) external onlyOwner {
        address previousExecutor = executor;
        executor = newExecutor;
        emit ExecutorSet(previousExecutor, newExecutor);
    }

    /**
     * @notice Enable or disable automatic rebalancing by executor
     * @param enabled Whether to enable auto-rebalance
     */
    function setAutoRebalanceEnabled(bool enabled) external onlyOwner {
        autoRebalanceEnabled = enabled;
        emit AutoRebalanceToggled(enabled);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Deposit Functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Deposit token A into the vault
     * @param amount Amount of token A to deposit
     */
    function depositTokenA(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        tokenA.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, address(tokenA), amount);
    }

    /**
     * @notice Deposit token B into the vault
     * @param amount Amount of token B to deposit
     */
    function depositTokenB(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        tokenB.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, address(tokenB), amount);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Withdraw Functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw token A from the vault
     * @param amount Amount of token A to withdraw
     */
    function withdrawTokenA(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (tokenA.balanceOf(address(this)) < amount) revert InsufficientBalance();
        tokenA.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, address(tokenA), amount);
    }

    /**
     * @notice Withdraw token B from the vault
     * @param amount Amount of token B to withdraw
     */
    function withdrawTokenB(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (tokenB.balanceOf(address(this)) < amount) revert InsufficientBalance();
        tokenB.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, address(tokenB), amount);
    }

    /**
     * @notice Withdraw all tokens from the vault
     * @return amountA Amount of token A withdrawn
     * @return amountB Amount of token B withdrawn
     */
    function withdrawAll() external onlyOwner returns (uint256 amountA, uint256 amountB) {
        amountA = tokenA.balanceOf(address(this));
        amountB = tokenB.balanceOf(address(this));

        if (amountA > 0) {
            tokenA.safeTransfer(msg.sender, amountA);
            emit Withdraw(msg.sender, address(tokenA), amountA);
        }
        if (amountB > 0) {
            tokenB.safeTransfer(msg.sender, amountB);
            emit Withdraw(msg.sender, address(tokenB), amountB);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Rebalancing
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Plan a rebalance operation (no swap executed yet)
     * @dev Callable by owner always, or by executor if auto-rebalance is enabled.
     *      Enforces drift threshold and cooldown period.
     *      Emits RebalancePlanned with direction info for off-chain execution.
     */
    function rebalance() external onlyOwnerOrExecutor {
        uint16 drift = driftBps();
        if (drift < DEFAULT_DRIFT_BPS) revert DriftTooLow();

        // Allow first rebalance (lastRebalanceAt == 0), otherwise enforce cooldown
        if (lastRebalanceAt != 0 && block.timestamp - lastRebalanceAt < COOLDOWN_SECONDS) {
            revert CooldownNotElapsed();
        }

        (uint16 currentPctA,) = currentAllocationsBps();

        // Determine direction
        address sellToken;
        address buyToken;
        if (currentPctA > targetPctA) {
            // Over-allocated to A, sell A for B
            sellToken = address(tokenA);
            buyToken = address(tokenB);
        } else {
            // Under-allocated to A, sell B for A
            sellToken = address(tokenB);
            buyToken = address(tokenA);
        }

        lastRebalanceAt = uint64(block.timestamp);

        emit RebalancePlanned(
            msg.sender,
            sellToken,
            buyToken,
            drift,
            currentPctA,
            targetPctA,
            uint64(block.timestamp)
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns current holdings in the vault
     * @return balA Balance of token A
     * @return balB Balance of token B
     */
    function holdings() external view returns (uint256 balA, uint256 balB) {
        return (tokenA.balanceOf(address(this)), tokenB.balanceOf(address(this)));
    }

    /**
     * @notice Returns target allocation percentages
     * @return pctA Target percentage for token A (basis points)
     * @return pctB Target percentage for token B (basis points)
     */
    function targetAllocations() external view returns (uint16 pctA, uint16 pctB) {
        return (targetPctA, targetPctB);
    }

    /**
     * @notice Returns current allocation percentages based on actual balances
     * @dev Uses raw balance comparison. For value-based allocation, a price oracle would be needed.
     * @return pctA Current percentage for token A (basis points)
     * @return pctB Current percentage for token B (basis points)
     */
    function currentAllocationsBps() public view returns (uint16 pctA, uint16 pctB) {
        uint256 balA = tokenA.balanceOf(address(this));
        uint256 balB = tokenB.balanceOf(address(this));
        uint256 total = balA + balB;

        if (total == 0) {
            return (0, 0);
        }

        pctA = uint16((balA * 10000) / total);
        pctB = uint16(10000 - pctA);
    }

    /**
     * @notice Returns the current drift from target allocation
     * @dev Drift = |currentPctA - targetPctA|
     * @return drift The absolute drift in basis points
     */
    function driftBps() public view returns (uint16) {
        (uint16 currentPctA,) = currentAllocationsBps();

        if (currentPctA >= targetPctA) {
            return currentPctA - targetPctA;
        } else {
            return targetPctA - currentPctA;
        }
    }
}
