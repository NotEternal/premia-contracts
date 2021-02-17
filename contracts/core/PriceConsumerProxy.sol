pragma solidity ^0.7.0;
//"SPDX-License-Identifier: UNLICENSED"

import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV3Interface.sol";

contract PriceConsumerProxy {
  AggregatorV3Interface internal priceFeed;

  function getLatestPrice(address _feed) public view returns (int) {
        (
            uint80 roundID, 
            int price,
            uint startedAt,
            uint timeStamp,
            uint80 answeredInRound
        ) = AggregatorV3Interface(_feed).latestRoundData();
        return price;
    }

}