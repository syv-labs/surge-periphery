import {
    abi as FACTORY_ABI,
    bytecode as FACTORY_BYTECODE,
  } from '../contracts/Factory.json'
import { Fixture } from 'ethereum-waffle'
import { ethers, upgrades, waffle } from 'hardhat'
import { constants } from 'ethers'
import poolABi from '../contracts/Pool.json'
import WETH9 from '../contracts/WETH9.json'
import {
  IWETH9,
  MockTimeNonfungiblePositionManager,
  MockTimeSwapRouter,
  NonfungibleTokenPositionDescriptor,
  TestERC20,
  IFactory,
} from '../../typechain'

const wethFixture: Fixture<{ weth9: IWETH9 }> = async ([wallet]) => {
    const weth9 = (await waffle.deployContract(wallet, {
      bytecode: WETH9.bytecode,
      abi: WETH9.abi,
    })) as IWETH9
  
    return { weth9 }
  }
  
  
  const v3CoreFactoryFixture: Fixture<IFactory> = async ([wallet]) => {
    return (await waffle.deployContract(wallet, {
      bytecode: FACTORY_BYTECODE,
      abi: FACTORY_ABI,
    })) as IFactory
  }


  

const completeFixture: Fixture<{
  weth9: IWETH9
  factory: IFactory
  router: MockTimeSwapRouter
  nft: MockTimeNonfungiblePositionManager
  nftDescriptor: NonfungibleTokenPositionDescriptor
  tokens: [TestERC20, TestERC20, TestERC20, TestERC20]
}> = async ([wallet], provider) => {

  const tokenFactory = await ethers.getContractFactory('TestERC20')
  const tokens: [TestERC20, TestERC20, TestERC20, TestERC20] = [
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20, // do not use maxu256 to avoid overflowing
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
    (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
  ]

  tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))

  const { weth9 } = await wethFixture([wallet], provider)
  const factory = await v3CoreFactoryFixture([wallet], provider)

  const router = (await (await ethers.getContractFactory('MockTimeSwapRouter')).deploy(
      factory.address,
      "0x0000000000000000000000000000000000000000",
      tokens[3].address
    )) as MockTimeSwapRouter
  

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
    "0x0000000000000000000000000000000000000000",
    nftDescriptor.address,
    tokens[3].address
  )) as MockTimeNonfungiblePositionManager

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
