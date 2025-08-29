import { Fixture } from 'ethereum-waffle'
import { BigNumber, constants, Contract, ContractTransaction, Wallet } from 'ethers'
import { waffle, ethers } from 'hardhat'
import { IWETH9, MockTimeNonfungiblePositionManager, MockTimeSwapRouter, SwapRouter, TestERC20 } from '../typechain'
import completeFixture from './shared/completeFixturePayableRouter'
import { FeeAmount, TICK_SPACINGS } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'
import { getMaxTick, getMinTick } from './shared/ticks'

describe('SwapRouterNativePayment', function () {
  this.timeout(40000)
  let wallet: Wallet
  let trader: Wallet

  const swapRouterFixture: Fixture<{
    weth9: IWETH9
    factory: Contract
    router: MockTimeSwapRouter
    nft: MockTimeNonfungiblePositionManager
    tokens: [TestERC20, TestERC20, TestERC20, TestERC20]
  }> = async (wallets, provider) => {
    const { weth9, factory, router, tokens, nft } = await completeFixture(wallets, provider)

    // approve & fund wallets
    for (const token of tokens) {
      if(token === tokens[3]){
        await token.transfer(trader.address, "5")
        continue
      }
      await token.approve(router.address, constants.MaxUint256)
      await token.approve(nft.address, constants.MaxUint256)
      await token.connect(trader).approve(router.address, constants.MaxUint256)
      await token.transfer(trader.address, expandTo18Decimals(1_000_000))
    }

    return {
      weth9,
      factory,
      router,
      tokens,
      nft,
    }
  }

  let factory: Contract
  let weth9: IWETH9
  let router: MockTimeSwapRouter
  let nft: MockTimeNonfungiblePositionManager
  let tokens: [TestERC20, TestERC20, TestERC20, TestERC20]
  let getBalances: (
    who: string
  ) => Promise<{
    weth9: BigNumber
    token0: BigNumber
    token1: BigNumber
    token2: BigNumber
    token3: BigNumber
  }>

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  before('create fixture loader', async () => {
    ;[wallet, trader] = await (ethers as any).getSigners()
    loadFixture = waffle.createFixtureLoader([wallet, trader])
  })

  // helper for getting weth and token balances
  beforeEach('load fixture', async () => {
    ;({ router, weth9, factory, tokens, nft } = await loadFixture(swapRouterFixture))

    getBalances = async (who: string) => {
      const balances = await Promise.all([
        tokens[3].balanceOf(who),
        tokens[0].balanceOf(who),
        tokens[1].balanceOf(who),
        tokens[2].balanceOf(who),
        tokens[3].balanceOf(who),
      ])
      return {
        weth9: balances[0],
        token0: balances[1],
        token1: balances[2],
        token2: balances[3],
        token3: balances[4],
      }
    }
  })

  describe('swaps', () => {
    const liquidity = 1000000
    async function createPool(tokenAddressA: string, tokenAddressB: string) {
      if (tokenAddressA.toLowerCase() > tokenAddressB.toLowerCase())
        [tokenAddressA, tokenAddressB] = [tokenAddressB, tokenAddressA]

      await nft.createAndInitializePoolIfNecessary(
        tokenAddressA,
        tokenAddressB,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      const liquidityParams = {
        token0: tokenAddressA,
        token1: tokenAddressB,
        fee: FeeAmount.MEDIUM,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallet.address,
        amount0Desired: 1000000,
        amount1Desired: 1000000,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 1,
      }

      return nft.mint(liquidityParams)
    }

    describe('#exactInput', () => {
      async function exactInput(
        tokens: string[],
        amountIn: number = 3,
        amountOutMinimum: number = 1
      ): Promise<ContractTransaction> {

        const value = amountIn 
        const params = {
          path: encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM)),
          recipient: trader.address,
          deadline: 1,
          amountIn,
          amountOutMinimum,
        }
        
        const data = [router.interface.encodeFunctionData('exactInput', [params])]

        /// ensure that the swap fails if the limit is any tighter
        params.amountOutMinimum += 1
        await expect(router.connect(trader).exactInput(params, { value })).to.be.revertedWith('Too little received')
        params.amountOutMinimum -= 1

        // optimized for the gas test
        return router.connect(trader).exactInput(params, { value })
      }

      describe('single-pool', () => {
        it('native -> 2', async () => {
          await tokens[3].approve(nft.address,"1000000")
          await createPool(tokens[2].address,tokens[3].address);

          const traderBefore = await getBalances(trader.address)

          await tokens[3].connect(trader).transfer(router.address,"3")
          
          await exactInput([tokens[3].address, tokens[2].address])

          const traderAfter = await getBalances(trader.address)

         expect(traderAfter.token3).to.be.eq(traderBefore.token3.sub(3))
         expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))

        })

        it('1 -> native', async () => {
          await tokens[3].approve(nft.address,"1000000")
          await createPool(tokens[1].address,tokens[3].address);

          const traderBefore = await getBalances(trader.address)
          
          await exactInput([tokens[1].address, tokens[3].address])

          const traderAfter = await getBalances(trader.address)

         expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(3))
         expect(traderAfter.token3).to.be.eq(traderBefore.token3.add(1))

        })
      })

      describe('multi-pool', () => {
        it('native -> 0 -> 1', async () => {
          await tokens[3].approve(nft.address,"1000000")
          await createPool(tokens[3].address,tokens[0].address);
          await createPool(tokens[1].address,tokens[0].address);

          const traderBefore = await getBalances(trader.address)

          await tokens[3].connect(trader).transfer(router.address,"5")
          
          await exactInput([tokens[3].address,tokens[0].address,tokens[1].address],5,1)

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token3).to.be.eq(traderBefore.token3.sub(5))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
        })

        it('0 -> 1 -> native', async () => {
          await tokens[3].approve(nft.address,"1000000")
          await createPool(tokens[3].address,tokens[1].address);
          await createPool(tokens[1].address,tokens[0].address);

          const traderBefore = await getBalances(trader.address)
          
          await exactInput([tokens[0].address,tokens[1].address,tokens[3].address],5,1)

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
          expect(traderAfter.token3).to.be.eq(traderBefore.token3.add(1))
        })

        it('0 -> native -> 1', async () => {
          await tokens[3].approve(nft.address,"1000000")
          await createPool(tokens[3].address,tokens[1].address);
          await tokens[3].approve(nft.address,"1000000")
          await createPool(tokens[3].address,tokens[0].address);

          const traderBefore = await getBalances(trader.address)

          await tokens[3].connect(trader).transfer(router.address,"5")
          
          await exactInput([tokens[0].address,tokens[3].address,tokens[1].address],5,1)

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
        })

      })

    })

    describe('#exactInputSingle', () => {
      async function exactInputSingle(
        tokenIn: string,
        tokenOut: string,
        amountIn: number = 3,
        amountOutMinimum: number = 1,
        sqrtPriceLimitX96?: BigNumber
      ): Promise<ContractTransaction> {

        const value = amountIn

        const params = {
          tokenIn,
          tokenOut,
          fee: FeeAmount.MEDIUM,
          sqrtPriceLimitX96:
            sqrtPriceLimitX96 ?? tokenIn.toLowerCase() < tokenOut.toLowerCase()
              ? BigNumber.from('4295128740')
              : BigNumber.from('1461446703485210103287273052203988822378723970341'),
          recipient: trader.address,
          deadline: 1,
          amountIn,
          amountOutMinimum,
        }

        // ensure that the swap fails if the limit is any tighter
        params.amountOutMinimum += 1
        await expect(router.connect(trader).exactInputSingle(params, { value })).to.be.revertedWith(
          'Too little received'
        )
        params.amountOutMinimum -= 1

        // optimized for the gas test
        return router.connect(trader).exactInputSingle(params, { value })
      }

      it('0 -> native', async () => { 
        await tokens[3].approve(nft.address,"10000000000000");
        await createPool(tokens[0].address,tokens[3].address);
        const pool = await factory.getPool(tokens[0].address, tokens[3].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await exactInputSingle(tokens[0].address, tokens[3].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
        expect(traderAfter.token3).to.be.eq(traderBefore.token3.add(1))
        expect(poolAfter.token3).to.be.eq(poolBefore.token3.sub(1))
        expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
      })

      it('native -> 1', async () => { 
        await tokens[3].approve(nft.address,"10000000000000");
        await createPool(tokens[1].address,tokens[3].address)
        const pool = await factory.getPool(tokens[1].address, tokens[3].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await tokens[3].connect(trader).transfer(router.address,"3")

        await exactInputSingle(tokens[3].address, tokens[1].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
        expect(traderAfter.token3).to.be.eq(traderBefore.token3.sub(3))
        expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        expect(poolAfter.token3).to.be.eq(poolBefore.token3.add(3))
      })
    })

    describe('#exactOutput', () => {
      async function exactOutput(
        tokens: string[],
        amountOut: number = 1,
        amountInMaximum: number = 3
      ): Promise<ContractTransaction> {

        const value = amountInMaximum

        const params = {
          path: encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM)),
          recipient: trader.address,
          deadline: 1,
          amountOut,
          amountInMaximum,
        }

        const data = [router.interface.encodeFunctionData('exactOutput', [params])]

        // ensure that the swap fails if the limit is any tighter
        params.amountInMaximum -= 1
        await expect(router.connect(trader).exactOutput(params, { value })).to.be.revertedWith('Too much requested')
        params.amountInMaximum += 1

        return router.connect(trader).multicall(data, { value })
      }

      describe('single-pool', () => {
        it('2 -> native', async () => {
          await tokens[3].approve(nft.address,"100000000000");
          await createPool(tokens[3].address, tokens[2].address);
          const pool = await factory.getPool(tokens[3].address, tokens[2].address, FeeAmount.MEDIUM)

          // get balances before
          const poolBefore = await getBalances(pool)
          const traderBefore = await getBalances(trader.address)


          await exactOutput(tokens.slice(2, 4).map((token) => token.address))

          // get balances after
          const poolAfter = await getBalances(pool)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token2).to.be.eq(traderBefore.token2.sub(3))
          expect(traderAfter.token3).to.be.eq(traderBefore.token3.add(1))
          expect(poolAfter.token2).to.be.eq(poolBefore.token2.add(3))
          expect(poolAfter.token3).to.be.eq(poolBefore.token3.sub(1))
        })

        it('native -> 1', async () => {
          await tokens[3].approve(nft.address,"100000000000");
          await createPool(tokens[3].address, tokens[1].address);
          const pool = await factory.getPool(tokens[3].address, tokens[1].address, FeeAmount.MEDIUM)

          // get balances before
          const poolBefore = await getBalances(pool)
          const traderBefore = await getBalances(trader.address)

          await tokens[3].connect(trader).transfer(router.address,"3")

          await exactOutput([tokens[3].address,tokens[1].address])

          // get balances after
          const poolAfter = await getBalances(pool)
          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token3).to.be.eq(traderBefore.token3.sub(3))
          expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
          expect(poolAfter.token3).to.be.eq(poolBefore.token3.add(3))
          expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        })

      })

      describe('multi-pool', () => {
        it('1 -> 2 -> native', async () => {
          await tokens[3].approve(nft.address,"10000000000000");
          await createPool(tokens[2].address,tokens[3].address);
          await createPool(tokens[2].address,tokens[1].address);
          const traderBefore = await getBalances(trader.address)

          await exactOutput(
            [tokens[1].address,tokens[2].address,tokens[3].address],
            1,
            5
          )

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(5))
          expect(traderAfter.token3).to.be.eq(traderBefore.token3.add(1))
        })

        it('native -> 1 -> 2', async () => {
          await tokens[3].approve(nft.address,"10000000000000");
          await createPool(tokens[1].address,tokens[3].address);
          await createPool(tokens[2].address,tokens[1].address);
          const traderBefore = await getBalances(trader.address)

          await tokens[3].connect(trader).transfer(router.address,"5")

          await exactOutput(
            [tokens[3].address,tokens[1].address,tokens[2].address],
            1,
            5
          )

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token3).to.be.eq(traderBefore.token3.sub(5))
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))
        })

        it('1 -> native -> 2', async () => {
          await tokens[3].approve(nft.address,"10000000000000");
          await createPool(tokens[1].address,tokens[3].address);
          await createPool(tokens[3].address,tokens[2].address);
          const traderBefore = await getBalances(trader.address)

          await tokens[3].connect(trader).transfer(router.address,"5")

          await exactOutput(
            [tokens[1].address,tokens[3].address,tokens[2].address],
            1,
            5
          )

          const traderAfter = await getBalances(trader.address)

          expect(traderAfter.token1).to.be.eq(traderBefore.token1.sub(5))
          expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))
        })

      })
    })
      
    describe('#exactOutputSingle', () => {
      async function exactOutputSingle(
        tokenIn: string,
        tokenOut: string,
        amountOut: number = 1,
        amountInMaximum: number = 3,
        sqrtPriceLimitX96?: BigNumber
      ): Promise<ContractTransaction> {

        const value = amountInMaximum

        const params = {
          tokenIn,
          tokenOut,
          fee: FeeAmount.MEDIUM,
          recipient: trader.address,
          deadline: 1,
          amountOut,
          amountInMaximum,
          sqrtPriceLimitX96:
            sqrtPriceLimitX96 ?? tokenIn.toLowerCase() < tokenOut.toLowerCase()
              ? BigNumber.from('4295128740')
              : BigNumber.from('1461446703485210103287273052203988822378723970341'),
        }

        const data = [router.interface.encodeFunctionData('exactOutputSingle', [params])]

        // ensure that the swap fails if the limit is any tighter
        params.amountInMaximum -= 1
        await expect(router.connect(trader).exactOutputSingle(params, { value })).to.be.revertedWith(
          'Too much requested'
        )
        params.amountInMaximum += 1

        return router.connect(trader).multicall(data, { value })
      }

      it('0 -> native', async () => {
        await tokens[3].approve(nft.address,"1000000000");
        await createPool(tokens[0].address,tokens[3].address)
        const pool = await factory.getPool(tokens[0].address, tokens[3].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await exactOutputSingle(tokens[0].address, tokens[3].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
        expect(traderAfter.token3).to.be.eq(traderBefore.token3.add(1))
        expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
        expect(poolAfter.token3).to.be.eq(poolBefore.token3.sub(1))
      })

      it('native -> 1', async () => {
        await tokens[3].approve(nft.address,"1000000000000000000");
        await createPool(tokens[1].address,tokens[3].address);
        const pool = await factory.getPool(tokens[1].address, tokens[3].address, FeeAmount.MEDIUM)

        // get balances before
        const poolBefore = await getBalances(pool)
        const traderBefore = await getBalances(trader.address)

        await tokens[3].connect(trader).transfer(router.address,"3")

        await exactOutputSingle(tokens[3].address, tokens[1].address)

        // get balances after
        const poolAfter = await getBalances(pool)
        const traderAfter = await getBalances(trader.address)

        expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
        expect(traderAfter.token3).to.be.eq(traderBefore.token3.sub(3))
        expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        expect(poolAfter.token3).to.be.eq(poolBefore.token3.add(3))
      })

    })

    
  })
})
