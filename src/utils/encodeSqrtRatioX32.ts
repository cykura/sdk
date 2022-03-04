import JSBI from 'jsbi'
import { BigintIsh, sqrt } from '@cykura/sdk-core'

/**
 * Returns the sqrt ratio as a Q32.32 corresponding to a given ratio of amount1 and amount0
 * @param amount1 The numerator amount i.e., the amount of token1
 * @param amount0 The denominator amount i.e., the amount of token0
 * @returns The sqrt ratio
 */

export function encodeSqrtRatioX32(amount1: BigintIsh, amount0: BigintIsh): JSBI {
  const numerator = JSBI.leftShift(JSBI.BigInt(amount1), JSBI.BigInt(64))
  const denominator = JSBI.BigInt(amount0)
  const ratioX64 = JSBI.divide(numerator, denominator)
  return sqrt(ratioX64)
}
