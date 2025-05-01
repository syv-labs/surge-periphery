import { abi as POOL_ABI } from '@syvlabs/surge-core/artifacts/contracts/Pool.sol/Pool.json'
import { Contract, Wallet } from 'ethers'
import { IPool } from '../../typechain'

export default function poolAtAddress(address: string, wallet: Wallet): IPool {
  return new Contract(address, POOL_ABI, wallet) as IPool
}
