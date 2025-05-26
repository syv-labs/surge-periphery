import {
    abi as FACTORY_ABI,
    bytecode as FACTORY_BYTECODE,
  } from '../contracts/Factory.json'
  import { Fixture } from 'ethereum-waffle'
  import { ethers, waffle } from 'hardhat'
  import { IFactory, IWETH9, MockTimeSwapRouter } from '../../typechain'
  
  import WETH9 from '../contracts/WETH9.json'
  import { Contract } from '@ethersproject/contracts'
  import { constants } from 'ethers'
  
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
  
  export const v3RouterFixture: Fixture<{
    weth9: IWETH9
    factory: IFactory
    router: MockTimeSwapRouter
  }> = async ([wallet], provider) => {
    const { weth9 } = await wethFixture([wallet], provider)
    const factory = await v3CoreFactoryFixture([wallet], provider)
  
    const router = (await (await ethers.getContractFactory('MockTimeSwapRouter')).deploy(
      factory.address,
      weth9.address
    )) as MockTimeSwapRouter
  
    return { factory, weth9, router }
  }