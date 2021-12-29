// import { defaultAbiCoder } from '@ethersproject/abi'
// import { getCreate2Address } from '@ethersproject/address'
// import { keccak256 } from '@ethersproject/solidity'
import { Token } from '@uniswap/sdk-core'
import * as anchor from '@project-serum/anchor'
import { FeeAmount } from '../constants'

const { PublicKey, Keypair, SystemProgram } = anchor.web3
const POOL_SEED = Buffer.from('p')

// Export to commons later?
// Generate seed buffer from a u32 number
export function u32ToSeed(num: number) {
  const arr = new ArrayBuffer(4)
  const view = new DataView(arr)
  view.setUint32(0, num, false)
  return new Uint8Array(arr)
}

export const LOCAL_PROGRAM_ID = '37kn8WUzihQoAnhYxueA2BnqCA7VRnrVvYoHy1hQ6Veu'

/**
 * Computes a pool address
 * @param factoryAddress The Uniswap V3 factory address
 * @param tokenA The first token of the pair, irrespective of sort order
 * @param tokenB The second token of the pair, irrespective of sort order
 * @param fee The fee tier of the pool
 * @param initCodeHashManualOverride Override the init code hash used to compute the pool address if necessary
 * @returns The pool address
 */
export function computePoolAddress({
  factoryAddress,
  tokenA,
  tokenB,
  fee,
  initCodeHashManualOverride
}: {
  factoryAddress: string
  tokenA: Token
  tokenB: Token
  fee: FeeAmount
  initCodeHashManualOverride?: string
}): Promise<string> {
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA] // does safety checks

  const tk0 = new PublicKey(token0.address)
  const tk1 = new PublicKey(token1.address)

  const pda = PublicKey.findProgramAddress(
    [POOL_SEED, tk0.toBuffer(), tk1.toBuffer(), u32ToSeed(fee)],
    new PublicKey(LOCAL_PROGRAM_ID)
  ).then(([poolState, poolStateBump]) => {
    return poolState.toString()
  })
  return pda

  // return getCreate2Address(
  //   factoryAddress,
  //   keccak256(
  //     ['bytes'],
  //     [defaultAbiCoder.encode(['address', 'address', 'uint24'], [token0.address, token1.address, fee])]
  //   ),
  //   initCodeHashManualOverride ?? POOL_INIT_CODE_HASH
  // )

  /// Should return the hash of 'Factory + (Fee + token0 + token1) + Defaulthash
  // return poolState.toString()
  // return 'asdfasdfasdf'
}
