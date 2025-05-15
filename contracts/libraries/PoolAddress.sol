// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@syvlabs/surge-core/contracts/interfaces/IFactory.sol';

/// @title Provides functions for deriving a pool address from the factory, tokens, and the fee
library PoolAddress {
    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    /// @notice Returns PoolKey: the ordered tokens with the matched fee levels
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @param fee The fee level of the pool
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(address tokenA, address tokenB, uint24 fee) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);
        return PoolKey({token0: tokenA, token1: tokenB, fee: fee});
    }

    /// @notice Get pool address from the factory and PoolKey
    /// @param factory The factory contract address
    /// @param key The PoolKey
    /// @return pool The contract address of the pool
    function computeAddress(address factory, PoolKey memory key) internal view returns (address pool) {
        require(key.token0 < key.token1);

        return IFactory(factory).getPool(key.token0, key.token1, key.fee);
    }
}
