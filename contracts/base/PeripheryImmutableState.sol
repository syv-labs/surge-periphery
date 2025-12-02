// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import '../interfaces/IPeripheryImmutableState.sol';

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

/// @title Immutable state
/// @notice Immutable state used by periphery contracts
abstract contract PeripheryImmutableState is IPeripheryImmutableState, Initializable {
    /// @inheritdoc IPeripheryImmutableState
    address public override factory;
    /// @inheritdoc IPeripheryImmutableState
    address public override WETH9;

    function __PeripheryImmutableState_init(
        address _factory,
        address _WETH9
    ) internal initializer {
        factory = _factory;
        WETH9 = _WETH9;
    }
    
}
