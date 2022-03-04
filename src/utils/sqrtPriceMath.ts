import { MaxUint128 } from '@cykura/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { ONE, ZERO, Q32, MaxUint32, U32Resolution } from '../internalConstants'
import { FullMath } from './fullMath'

function multiplyIn128(x: JSBI, y: JSBI): JSBI {
  const product = JSBI.multiply(x, y)
  return JSBI.bitwiseAnd(product, MaxUint128)
}

function addIn128(x: JSBI, y: JSBI): JSBI {
  const sum = JSBI.add(x, y)
  return JSBI.bitwiseAnd(sum, MaxUint128)
}

export abstract class SqrtPriceMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static getAmount0Delta(sqrtRatioAX32: JSBI, sqrtRatioBX32: JSBI, liquidity: JSBI, roundUp: boolean): JSBI {
    if (JSBI.greaterThan(sqrtRatioAX32, sqrtRatioBX32)) {
      ;[sqrtRatioAX32, sqrtRatioBX32] = [sqrtRatioBX32, sqrtRatioAX32]
    }

    const numerator1 = JSBI.leftShift(liquidity, U32Resolution)
    const numerator2 = JSBI.subtract(sqrtRatioBX32, sqrtRatioAX32)

    invariant(JSBI.greaterThan(sqrtRatioAX32, ZERO), 'SQRTA32_GT_0')

    return roundUp
      ? FullMath.mulDivRoundingUp(FullMath.mulDivCeil(numerator1, numerator2, sqrtRatioBX32), ONE, sqrtRatioAX32)
      : JSBI.divide(FullMath.mulDivFloor(numerator1, numerator2, sqrtRatioBX32), sqrtRatioAX32)
  }

  public static getAmount1Delta(sqrtRatioAX32: JSBI, sqrtRatioBX32: JSBI, liquidity: JSBI, roundUp: boolean): JSBI {
    if (JSBI.greaterThan(sqrtRatioAX32, sqrtRatioBX32)) {
      ;[sqrtRatioAX32, sqrtRatioBX32] = [sqrtRatioBX32, sqrtRatioAX32]
    }

    return roundUp
      ? FullMath.mulDivCeil(liquidity, JSBI.subtract(sqrtRatioBX32, sqrtRatioAX32), Q32)
      : FullMath.mulDivFloor(liquidity, JSBI.subtract(sqrtRatioBX32, sqrtRatioAX32), Q32)
  }

  public static getNextSqrtPriceFromInput(sqrtPX32: JSBI, liquidity: JSBI, amountIn: JSBI, zeroForOne: boolean): JSBI {
    invariant(JSBI.greaterThan(sqrtPX32, ZERO))
    invariant(JSBI.greaterThan(liquidity, ZERO))

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX32, liquidity, amountIn, true)
      : this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX32, liquidity, amountIn, true)
  }

  public static getNextSqrtPriceFromOutput(
    sqrtPX32: JSBI,
    liquidity: JSBI,
    amountOut: JSBI,
    zeroForOne: boolean
  ): JSBI {
    invariant(JSBI.greaterThan(sqrtPX32, ZERO))
    invariant(JSBI.greaterThan(liquidity, ZERO))

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX32, liquidity, amountOut, false)
      : this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX32, liquidity, amountOut, false)
  }

  private static getNextSqrtPriceFromAmount0RoundingUp(
    sqrtPX32: JSBI,
    liquidity: JSBI,
    amount: JSBI,
    add: boolean
  ): JSBI {
    if (JSBI.equal(amount, ZERO)) return sqrtPX32
    const numerator1 = JSBI.leftShift(liquidity, U32Resolution)

    if (add) {
      let product = multiplyIn128(amount, sqrtPX32)
      const denominator = addIn128(numerator1, product)
      if (JSBI.greaterThanOrEqual(denominator, numerator1)) {
        return FullMath.mulDivCeil(numerator1, sqrtPX32, denominator)
      }

      return FullMath.mulDivRoundingUp(numerator1, ONE, JSBI.add(JSBI.divide(numerator1, sqrtPX32), amount))
    } else {
      let product = multiplyIn128(amount, sqrtPX32)

      // invariant(JSBI.equal(JSBI.divide(product, amount), sqrtPX32))
      invariant(JSBI.greaterThan(numerator1, product))
      const denominator = JSBI.subtract(numerator1, product)
      return FullMath.mulDivCeil(numerator1, sqrtPX32, denominator)
    }
  }

  private static getNextSqrtPriceFromAmount1RoundingDown(
    sqrtPX32: JSBI,
    liquidity: JSBI,
    amount: JSBI,
    add: boolean
  ): JSBI {
    if (add) {
      const quotient = JSBI.lessThanOrEqual(amount, MaxUint32)
        ? JSBI.divide(JSBI.leftShift(amount, U32Resolution), liquidity)
        : FullMath.mulDivFloor(amount, Q32, liquidity)

      return JSBI.add(sqrtPX32, quotient)
    } else {
      const quotient = JSBI.lessThanOrEqual(amount, MaxUint32)
        ? FullMath.mulDivRoundingUp(JSBI.leftShift(amount, U32Resolution), ONE, liquidity)
        : FullMath.mulDivCeil(amount, Q32, liquidity)

      invariant(JSBI.greaterThan(sqrtPX32, quotient))
      return JSBI.subtract(sqrtPX32, quotient)
    }
  }
}
