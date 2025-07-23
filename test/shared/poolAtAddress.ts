import { abi as POOL_ABI } from '../contracts/Pool.json'
import { Contract, Wallet } from 'ethers'
import { IPool } from '../../typechain'

export default function poolAtAddress(address: string, wallet: Wallet): IPool {
  return new Contract(address, POOL_ABI, wallet) as IPool
}
