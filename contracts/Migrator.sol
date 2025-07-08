// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@syvlabs/surge-core/contracts/libraries/LowGasSafeMath.sol';
import './interfaces/IPair.sol';

import '@openzeppelin/contracts-upgradeable/proxy/Initializable.sol';

import './interfaces/INonfungiblePositionManager.sol';

import './libraries/TransferHelper.sol';

import './interfaces/IMigrator.sol';
import './base/PeripheryImmutableState.sol';
import './base/Multicall.sol';
import './base/SelfPermit.sol';
import './base/PoolInitializer.sol';

/// @title Migrator
contract Migrator is Initializable, IMigrator, PeripheryImmutableState, PoolInitializer, Multicall, SelfPermit {
    using LowGasSafeMath for uint256;

    address public nonfungiblePositionManager;

    function initialize(address _factory, address _nonfungiblePositionManager) external initializer {
        nonfungiblePositionManager = _nonfungiblePositionManager;

        __PeripheryImmutableState_init(_factory);
    }

    function migrate(MigrateParams calldata params) external override {
        require(params.percentageToMigrate > 0, 'Percentage too small');
        require(params.percentageToMigrate <= 100, 'Percentage too large');

        // burn v2 liquidity to this address
        IPair(params.pair).transferFrom(msg.sender, params.pair, params.liquidityToMigrate);
        (uint256 amount0V2, uint256 amount1V2) = IPair(params.pair).burn(address(this));

        // calculate the amounts to migrate
        uint256 amount0V2ToMigrate = amount0V2.mul(params.percentageToMigrate) / 100;
        uint256 amount1V2ToMigrate = amount1V2.mul(params.percentageToMigrate) / 100;

        // approve the position manager up to the maximum token amounts
        TransferHelper.safeApprove(params.token0, nonfungiblePositionManager, amount0V2ToMigrate);
        TransferHelper.safeApprove(params.token1, nonfungiblePositionManager, amount1V2ToMigrate);

        // mint position
        (, , uint256 amount0V3, uint256 amount1V3) = INonfungiblePositionManager(nonfungiblePositionManager).mint(
            INonfungiblePositionManager.MintParams({
                token0: params.token0,
                token1: params.token1,
                fee: params.fee,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                amount0Desired: amount0V2ToMigrate,
                amount1Desired: amount1V2ToMigrate,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min,
                recipient: params.recipient,
                deadline: params.deadline
            })
        );

        // if necessary, clear allowance and refund dust
        if (amount0V3 < amount0V2) {
            if (amount0V3 < amount0V2ToMigrate) {
                TransferHelper.safeApprove(params.token0, nonfungiblePositionManager, 0);
            }

            uint256 refund0 = amount0V2 - amount0V3;
            TransferHelper.safeTransfer(params.token0, msg.sender, refund0);
        }
        if (amount1V3 < amount1V2) {
            if (amount1V3 < amount1V2ToMigrate) {
                TransferHelper.safeApprove(params.token1, nonfungiblePositionManager, 0);
            }

            uint256 refund1 = amount1V2 - amount1V3;
            TransferHelper.safeTransfer(params.token1, msg.sender, refund1);
        }
    }
}
