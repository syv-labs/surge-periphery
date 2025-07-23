import { Fixture } from 'ethereum-waffle'
import { ethers, upgrades } from 'hardhat'
import { waffle } from 'hardhat'
import { v3RouterFixture } from './externalFixtures'
import { constants } from 'ethers'
import poolABi from '../contracts/Pool.json'
import {
  IWETH9,
  MockTimeNonfungiblePositionManager,
  MockTimeSwapRouter,
  NonfungibleTokenPositionDescriptor,
  TestERC20,
  IFactory,
} from '../../typechain'

const completeFixture: Fixture<{
  weth9: IWETH9
  factory: IFactory
  router: MockTimeSwapRouter
  nft: MockTimeNonfungiblePositionManager
  nftDescriptor: NonfungibleTokenPositionDescriptor
  tokens: [TestERC20, TestERC20, TestERC20]
}> = async ([wallet], provider) => {
  const { weth9, factory, router } = await v3RouterFixture([wallet], provider)

  // Deploy proxy admin
  const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin')
  const proxyAdmin = await proxyAdminFactory.deploy()

  // Deploy pool implementation using bytecode and ABI
  const poolImplementation = await waffle.deployContract(wallet, {
    bytecode: poolABi.bytecode,
    abi: poolABi.abi,
  })

  // Initialize factory with deployed addresses
  await factory.initialize(
    poolImplementation.address,
    proxyAdmin.address
  )

  const tokenFactory = await ethers.getContractFactory('TestERC20')
  const tokens: [TestERC20, TestERC20, TestERC20] = [
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20, // do not use maxu256 to avoid overflowing
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
  ]

  const nftDescriptorLibraryFactory = await ethers.getContractFactory('NFTDescriptor')
  const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy()
  const positionDescriptorFactory = await ethers.getContractFactory('NonfungibleTokenPositionDescriptor', {
    libraries: {
      NFTDescriptor: nftDescriptorLibrary.address,
    },
  })
  const nftDescriptor = (await upgrades.deployProxy(positionDescriptorFactory, [
    tokens[0].address,
    // 'ETH' as a bytes32 string
    '0x4554480000000000000000000000000000000000000000000000000000000000'
  ], {
    unsafeAllowLinkedLibraries: true
  })) as NonfungibleTokenPositionDescriptor

  const positionManagerFactory = await ethers.getContractFactory('MockTimeNonfungiblePositionManager')
  const nft = (await positionManagerFactory.deploy(
    factory.address,
    weth9.address,
    nftDescriptor.address
  )) as MockTimeNonfungiblePositionManager

  tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))

  return {
    weth9,
    factory,
    router,
    tokens,
    nft,
    nftDescriptor,
  }
}

export default completeFixture
