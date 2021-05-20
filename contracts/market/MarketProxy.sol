// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import '@solidstate/contracts/access/OwnableStorage.sol';
import '@solidstate/contracts/proxy/managed/ManagedProxyOwnable.sol';

import '../core/IProxyManager.sol';
import "./MarketStorage.sol";

contract MarketProxy is ManagedProxyOwnable {
    using MarketStorage for MarketStorage.Layout;

    constructor(address _feeCalculator, address _feeRecipient) ManagedProxy(IProxyManager.getMarketImplementation.selector) {
        OwnableStorage.layout().owner = msg.sender;

        MarketStorage.Layout storage l = MarketStorage.layout();
        l.feeCalculator = _feeCalculator;
        l.feeRecipient = _feeRecipient;
        l.isDelayedWritingEnabled = true;
    }
}
