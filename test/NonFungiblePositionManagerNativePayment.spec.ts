import { abi as IPoolABI } from './contracts/Pool.json'
import { Fixture } from 'ethereum-waffle'
import { BigNumberish, constants, Wallet } from 'ethers'
import { ethers, waffle } from 'hardhat'
import {
  IFactory,
  IWETH9,
  MockTimeNonfungiblePositionManager,
  NonfungiblePositionManagerPositionsGasTest,
  SwapRouter,
  TestERC20,
  TestPositionNFTOwner,
} from '../typechain'
import completeFixture from './shared/completeFixtureNativePayment'
import { computePoolAddress } from './shared/computePoolAddress'
import { FeeAmount, MaxUint128, TICK_SPACINGS } from './shared/constants'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import { expect } from './shared/expect'
import { extractJSONFromURI } from './shared/extractJSONFromURI'
import getPermitNFTSignature from './shared/getPermitNFTSignature'
import { encodePath } from './shared/path'
import poolAtAddress from './shared/poolAtAddress'
import snapshotGasCost from './shared/snapshotGasCost'
import { getMaxTick, getMinTick } from './shared/ticks'
import { sortedTokens } from './shared/tokenSort'

describe('NonfungiblePositionManagerNativePayment', () => {
  let wallets: Wallet[]
  let wallet: Wallet, other: Wallet

  const nftFixture: Fixture<{
    nft: MockTimeNonfungiblePositionManager
    factory: IFactory
    tokens: [TestERC20, TestERC20, TestERC20]
    weth9: IWETH9
    router: SwapRouter
  }> = async (wallets, provider) => {
    const { weth9, factory, tokens, nft, router } = await completeFixture(wallets, provider)

    // approve & fund wallets
    for (const token of tokens) {
      await token.approve(nft.address, constants.MaxUint256)
      await token.connect(other).approve(nft.address, constants.MaxUint256)
      await token.transfer(other.address, expandTo18Decimals(1_000_000))
    }

    return {
      nft,
      factory,
      tokens,
      weth9,
      router,
    }
  }

  let factory: IFactory
  let nft: MockTimeNonfungiblePositionManager
  let tokens: [TestERC20, TestERC20, TestERC20]
  let weth9: IWETH9
  let router: SwapRouter

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  before('create fixture loader', async () => {
    wallets = await (ethers as any).getSigners()
    ;[wallet, other] = wallets

    loadFixture = waffle.createFixtureLoader(wallets)
  })

  beforeEach('load fixture', async () => {
    ;({ nft, factory, tokens, weth9, router } = await loadFixture(nftFixture))
  })

  it('bytecode size', async () => {
    expect(((await nft.provider.getCode(nft.address)).length - 2) / 2).to.matchSnapshot()
  })

  describe('#mint', () => {

    it('creates a token', async () => {
      await nft.createAndInitializePoolIfNecessary(
        tokens[0].address,
        tokens[2].address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      await tokens[2].transfer(nft.address,"15");
      
      await nft.mint({
        token0: tokens[0].address,
        token1: tokens[2].address,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        fee: FeeAmount.MEDIUM,
        recipient: other.address,
        amount0Desired: 15,
        amount1Desired: 15,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 10,
      },{value: 15})
      expect(await nft.balanceOf(other.address)).to.eq(1)
      expect(await nft.tokenOfOwnerByIndex(other.address, 0)).to.eq(1)
      const {
        fee,
        token0,
        token1,
        tickLower,
        tickUpper,
        liquidity,
        tokensOwed0,
        tokensOwed1,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
      } = await nft.positions(1)
      expect(token0).to.eq(tokens[0].address)
      expect(token1).to.eq(tokens[2].address)
      expect(fee).to.eq(FeeAmount.MEDIUM)
      expect(tickLower).to.eq(getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]))
      expect(tickUpper).to.eq(getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]))
      expect(liquidity).to.eq(15)
      expect(tokensOwed0).to.eq(0)
      expect(tokensOwed1).to.eq(0)
      expect(feeGrowthInside0LastX128).to.eq(0)
      expect(feeGrowthInside1LastX128).to.eq(0)
    })

    it('can use eth via multicall', async () => {
      const [token0, token1] = sortedTokens(tokens[2], tokens[0])

      await tokens[2].transfer(nft.address, "100");

      const createAndInitializeData = nft.interface.encodeFunctionData('createAndInitializePoolIfNecessary', [
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1),
      ])


      const mintData = nft.interface.encodeFunctionData('mint', [
        {
          token0: token0.address,
          token1: token1.address,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          fee: FeeAmount.MEDIUM,
          recipient: other.address,
          amount0Desired: 100,
          amount1Desired: 100,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 1,
        }
      ])

      const refundETHData = nft.interface.encodeFunctionData('refundETH')

      const balanceBefore = await wallet.getBalance()
      const tx = await nft.multicall([createAndInitializeData, mintData, refundETHData], {
        value: 100,
      })
      const receipt = await tx.wait()
      const balanceAfter = await wallet.getBalance()
      expect(balanceBefore).to.eq(balanceAfter.add(receipt.gasUsed.mul(tx.gasPrice)))
    })

    it('emits an event')

    it('gas first mint for pool', async () => {
      await nft.createAndInitializePoolIfNecessary(
        tokens[1].address,
        tokens[2].address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      await tokens[2].transfer(nft.address, "100")

      await snapshotGasCost(
        nft.mint({
          token0: tokens[1].address,
          token1: tokens[2].address,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          fee: FeeAmount.MEDIUM,
          recipient: wallet.address,
          amount0Desired: 100,
          amount1Desired: 100,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 10,
        },{value: 100})
      )
    })

    it('gas first mint for pool using eth with zero refund', async () => {
      const [token0, token1] = sortedTokens(tokens[2], tokens[0])
      await nft.createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      await tokens[2].transfer(nft.address, "100")

      await snapshotGasCost(
        nft.multicall(
          [
            nft.interface.encodeFunctionData('mint', [
              {
                token0: token0.address,
                token1: token1.address,
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                fee: FeeAmount.MEDIUM,
                recipient: wallet.address,
                amount0Desired: 100,
                amount1Desired: 100,
                amount0Min: 0,
                amount1Min: 0,
                deadline: 10,
              },
            ]),
            nft.interface.encodeFunctionData('refundETH'),
          ],
          { value: 100 }
        )
      )
    })

    it('gas first mint for pool using eth with non-zero refund', async () => {
      const [token0, token1] = sortedTokens(tokens[2], tokens[0])
      await nft.createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      await tokens[2].transfer(nft.address, "100")

      await snapshotGasCost(
        nft.multicall(
          [
            nft.interface.encodeFunctionData('mint', [
              {
                token0: token0.address,
                token1: token1.address,
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                fee: FeeAmount.MEDIUM,
                recipient: wallet.address,
                amount0Desired: 100,
                amount1Desired: 100,
                amount0Min: 0,
                amount1Min: 0,
                deadline: 10,
              },
            ]),
            nft.interface.encodeFunctionData('refundETH'),
          ],
          { value: 1000 }
        )
      )
    })

    it('gas mint on same ticks', async () => {
      const [token0, token1] = sortedTokens(tokens[2], tokens[1])

      await nft.createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      await tokens[2].transfer(nft.address,"100")

      await nft.mint({
        token0: token0.address,
        token1: token1.address,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        fee: FeeAmount.MEDIUM,
        recipient: other.address,
        amount0Desired: 100,
        amount1Desired: 100,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 10,
      })

      await snapshotGasCost(
        nft.mint({
          token0: token0.address,
          token1: token1.address,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          fee: FeeAmount.MEDIUM,
          recipient: wallet.address,
          amount0Desired: 100,
          amount1Desired: 100,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 10,
        })
      )
    })

    it('gas mint for same pool, different ticks', async () => {
      const [token0, token1] = sortedTokens(tokens[2], tokens[0])
      await nft.createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      await tokens[2].transfer(nft.address, "200")

      await nft.mint({
        token0: token0.address,
        token1: token1.address,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        fee: FeeAmount.MEDIUM,
        recipient: other.address,
        amount0Desired: 100,
        amount1Desired: 100,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 10,
      })

      await snapshotGasCost(
        nft.mint({
          token0: token0.address,
          token1: token1.address,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]) + TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]) - TICK_SPACINGS[FeeAmount.MEDIUM],
          fee: FeeAmount.MEDIUM,
          recipient: wallet.address,
          amount0Desired: 100,
          amount1Desired: 100,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 10,
        })
      )
    })
  })

  describe('#increaseLiquidity', () => {
    let tokenId = 0
    beforeEach('create a position', async () => {
      const [token0, token1] = sortedTokens(tokens[2], tokens[0])
      await tokens[2].transfer(nft.address,"1000");

      await nft.createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      if(token1 === tokens[2])
        tokenId = 1;

      await nft.mint({
        token0: token0.address,
        token1: token1.address,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        fee: FeeAmount.MEDIUM,
        recipient: other.address,
        amount0Desired: 1000,
        amount1Desired: 1000,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 1,
      },{value:1000})
    })

    it('increases position liquidity', async () => {
      await tokens[2].transfer(nft.address,"100");
      await nft.increaseLiquidity({
        tokenId: tokenId,
        amount0Desired: 100,
        amount1Desired: 100,
        amount0Min: 0,
        amount1Min: 0,
        deadline: 1,
      },{value: 100})
      const { liquidity } = await nft.positions(tokenId)
      expect(liquidity).to.eq(1100)
    })

    it('emits an event')

    it('can be paid with ETH', async () => {
      const [token0, token1] = sortedTokens(tokens[1], tokens[2])

      let tokenId = 0
      if(token1 === tokens[2])
        tokenId = 1

      await tokens[2].transfer(nft.address, "300")

      await nft.createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )
      const mintData = nft.interface.encodeFunctionData('mint', [
        {
          token0: token0.address,
          token1: token1.address,
          fee: FeeAmount.MEDIUM,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          recipient: other.address,
          amount0Desired: 100,
          amount1Desired: 100,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 1,
        },
      ])
      //const refundETHData = nft.interface.encodeFunctionData('unwrapWETH9', [0, other.address])
      await nft.multicall([mintData], { value: (100) })

      const increaseLiquidityData = nft.interface.encodeFunctionData('increaseLiquidity', [
        {
          tokenId: tokenId,
          amount0Desired: 100,
          amount1Desired: 100,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 1,
        },
      ])
      await nft.multicall([increaseLiquidityData], { value: 100 })
    })

  })

})
