// SPDX-License-Identifier: GPL-2.0-or-later
import '@syvlabs/surge-core/contracts/interfaces/IPool.sol';

pragma solidity >=0.6.0;

import '../libraries/PoolTicksCounter.sol';

contract PoolTicksCounterTest {
    using PoolTicksCounter for IPool;

    function countInitializedTicksCrossed(
        IPool pool,
        int24 tickBefore,
        int24 tickAfter
    ) external view returns (uint32 initializedTicksCrossed) {
        return pool.countInitializedTicksCrossed(tickBefore, tickAfter);
    }
}
