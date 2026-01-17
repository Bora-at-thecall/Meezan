// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockPriceFeed
 * @notice Mock Chainlink price feed for testing
 */
contract MockPriceFeed is AggregatorV3Interface {
    uint8 private _decimals;
    int256 private _price;
    string private _description;
    uint80 private _roundId;
    uint80 private _answeredInRound;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialPrice, string memory description_) {
        _decimals = decimals_;
        _price = initialPrice;
        _description = description_;
        _roundId = 1;
        _answeredInRound = 1;
        _updatedAt = block.timestamp;
    }

    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _roundId++;
        _answeredInRound = _roundId;
        _updatedAt = block.timestamp;
    }

    function setRoundData(uint80 roundId_, int256 price_, uint256 updatedAt_, uint80 answeredInRound_) external {
        _roundId = roundId_;
        _price = price_;
        _updatedAt = updatedAt_;
        _answeredInRound = answeredInRound_;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        _updatedAt = updatedAt_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _price, block.timestamp, _updatedAt, _answeredInRound);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _price, block.timestamp, _updatedAt, _answeredInRound);
    }
}
