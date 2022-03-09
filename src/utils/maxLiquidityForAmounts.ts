import { BigintIsh } from '@cykura/sdk-core'
import JSBI from 'jsbi'
import { FullMath } from './fullMath'
import { Q64, Q32, MaxUint32 } from '../internalConstants'

/**
 * Returns an imprecise maximum amount of liquidity received for a given amount of token 0.
 * This function is available to accommodate LiquidityAmounts#getLiquidityForAmount0 in the v3 periphery,
 * which could be more precise by at least 32 bits by dividing by Q64 instead of Q96 in the intermediate step,
 * and shifting the subtracted ratio left by 32 bits. This imprecise calculation will likely be replaced in a future
 * v3 router contract.
 * @param sqrtRatioAX32 The price at the lower boundary
 * @param sqrtRatioBX32 The price at the upper boundary
 * @param amount0 The token0 amount
 * @returns liquidity for amount0, imprecise
 */
function maxLiquidityForAmount0Imprecise(sqrtRatioAX32: JSBI, sqrtRatioBX32: JSBI, amount0: BigintIsh): JSBI {
  if (JSBI.greaterThan(sqrtRatioAX32, sqrtRatioBX32)) {
    ;[sqrtRatioAX32, sqrtRatioBX32] = [sqrtRatioBX32, sqrtRatioAX32]
  }
  const intermediate = FullMath.mulDivFloor(sqrtRatioAX32, sqrtRatioBX32, MaxUint32)
  return FullMath.mulDivFloor(JSBI.BigInt(amount0), intermediate, JSBI.subtract(sqrtRatioBX32, sqrtRatioAX32))
}

/**
 * Returns a precise maximum amount of liquidity received for a given amount of token 0 by dividing by Q64 instead of Q96 in the intermediate step,
 * and shifting the subtracted ratio left by 32 bits.
 * @param sqrtRatioAX32 The price at the lower boundary
 * @param sqrtRatioBX32 The price at the upper boundary
 * @param amount0 The token0 amount
 * @returns liquidity for amount0, precise
 */
function maxLiquidityForAmount0Precise(sqrtRatioAX32: JSBI, sqrtRatioBX32: JSBI, amount0: BigintIsh): JSBI {
  if (JSBI.greaterThan(sqrtRatioAX32, sqrtRatioBX32)) {
    ;[sqrtRatioAX32, sqrtRatioBX32] = [sqrtRatioBX32, sqrtRatioAX32]
  }

  const numerator = JSBI.multiply(JSBI.multiply(JSBI.BigInt(amount0), sqrtRatioAX32), sqrtRatioBX32)
  const denominator = JSBI.multiply(MaxUint32, JSBI.subtract(sqrtRatioBX32, sqrtRatioAX32))

  return JSBI.divide(numerator, denominator)
}

/**
 * Computes the maximum amount of liquidity received for a given amount of token1
 * @param sqrtRatioAX32 The price at the lower tick boundary
 * @param sqrtRatioBX32 The price at the upper tick boundary
 * @param amount1 The token1 amount
 * @returns liquidity for amount1
 */
function maxLiquidityForAmount1(sqrtRatioAX32: JSBI, sqrtRatioBX32: JSBI, amount1: BigintIsh): JSBI {
  if (JSBI.greaterThan(sqrtRatioAX32, sqrtRatioBX32)) {
    ;[sqrtRatioAX32, sqrtRatioBX32] = [sqrtRatioBX32, sqrtRatioAX32]
  }
  return FullMath.mulDivFloor(JSBI.BigInt(amount1), MaxUint32, JSBI.subtract(sqrtRatioBX32, sqrtRatioAX32))
}

/**
 * Computes the maximum amount of liquidity received for a given amount of token0, token1,
 * and the prices at the tick boundaries.
 * @param sqrtRatioCurrentX32 the current price
 * @param sqrtRatioAX32 price at lower boundary
 * @param sqrtRatioBX32 price at upper boundary
 * @param amount0 token0 amount
 * @param amount1 token1 amount
 * @param useFullPrecision if false, liquidity will be maximized according to what the router can calculate,
 * not what core can theoretically support
 */
export function maxLiquidityForAmounts(
  sqrtRatioCurrentX32: JSBI,
  sqrtRatioAX32: JSBI,
  sqrtRatioBX32: JSBI,
  amount0: BigintIsh,
  amount1: BigintIsh,
  useFullPrecision: boolean
): JSBI {
  if (JSBI.greaterThan(sqrtRatioAX32, sqrtRatioBX32)) {
    ;[sqrtRatioAX32, sqrtRatioBX32] = [sqrtRatioBX32, sqrtRatioAX32]
  }

  // trying this out?
  useFullPrecision = false
  const maxLiquidityForAmount0 = maxLiquidityForAmount0Imprecise

  if (JSBI.lessThanOrEqual(sqrtRatioCurrentX32, sqrtRatioAX32)) {
    return maxLiquidityForAmount0(sqrtRatioAX32, sqrtRatioBX32, amount0)
  } else if (JSBI.lessThan(sqrtRatioCurrentX32, sqrtRatioBX32)) {
    const liquidity0 = maxLiquidityForAmount0(sqrtRatioCurrentX32, sqrtRatioBX32, amount0)
    const liquidity1 = maxLiquidityForAmount1(sqrtRatioAX32, sqrtRatioCurrentX32, amount1)
    return JSBI.lessThan(liquidity0, liquidity1) ? liquidity0 : liquidity1
  } else {
    return maxLiquidityForAmount1(sqrtRatioAX32, sqrtRatioBX32, amount1)
  }
}
