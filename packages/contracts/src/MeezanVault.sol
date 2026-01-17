// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RiskLevel, getTargetAllocations} from "./RiskPresets.sol";

/**
 * @title MeezanVault
 * @notice A non-custodial, single-owner vault for holding a two-token portfolio.
 * @dev Designed for long-term holding with manual rebalancing. One vault per user.
 *      Future versions may add an authorized executor for opt-in automation.
 *
 * Architecture notes:
 * - Owner is immutable and set at deployment (msg.sender)
 * - Token addresses are immutable (WBTC as tokenA, stablecoin as tokenB)
 * - Risk level and target allocations are set at construction and immutable
 * - No internal balance tracking; uses on-chain balanceOf() directly
 * - No swaps in v1; rebalancing logic will be added later
 * - Withdrawals are always instant and unrestricted for the owner
 */
contract MeezanVault {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────

    error OnlyOwner();
    error ZeroAmount();
    error ZeroAddress();
    error IdenticalTokens();
    error InsufficientBalance();

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    event Deposit(address indexed owner, address indexed token, uint256 amount);
    event Withdraw(address indexed owner, address indexed token, uint256 amount);

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
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
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
    constructor(address _tokenA, address _tokenB, RiskLevel _riskLevel) {
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
}
