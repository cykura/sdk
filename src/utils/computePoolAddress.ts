import { Token } from '@cykura/sdk-core'
import * as anchor from '@project-serum/anchor'
import { web3 } from '@project-serum/anchor'
import { FeeAmount } from '../constants'
import { POOL_SEED, u32ToSeed } from './seeds'

/**
 * Computes a pool address
 * @param factoryAddress The Uniswap V3 factory address
 * @param tokenA The first token of the pair, irrespective of sort order
 * @param tokenB The second token of the pair, irrespective of sort order
 * @param fee The fee tier of the pool
 * @returns The pool address
 */
export function computePoolAddress({
  factoryAddress,
  tokenA,
  tokenB,
  fee,
}: {
  factoryAddress: web3.PublicKey
  tokenA: Token
  tokenB: Token
  fee: FeeAmount
}): Promise<web3.PublicKey> {
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA] // does safety checks

  const token0Key = new web3.PublicKey(token0.address)
  const token1Key = new web3.PublicKey(token1.address)

  return web3.PublicKey.findProgramAddress(
    [POOL_SEED, token0Key.toBuffer(), token1Key.toBuffer(), u32ToSeed(fee)],
    factoryAddress
  ).then(([poolState]) => poolState)
}
