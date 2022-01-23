import JSBI from 'jsbi'
import { FeeAmount } from '../constants'
import { NEGATIVE_ONE, ZERO } from '../internalConstants'
import { FullMath } from './fullMath'
import { SqrtPriceMath } from './sqrtPriceMath'

const MAX_FEE = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(6))

export abstract class SwapMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static computeSwapStep(
    sqrtRatioCurrentX32: JSBI,
    sqrtRatioTargetX32: JSBI,
    liquidity: JSBI,
    amountRemaining: JSBI,
    feePips: FeeAmount
  ): [JSBI, JSBI, JSBI, JSBI] {
    const returnValues: Partial<{
      sqrtRatioNextX32: JSBI
      amountIn: JSBI
      amountOut: JSBI
      feeAmount: JSBI
    }> = {}

    const zeroForOne = JSBI.greaterThanOrEqual(sqrtRatioCurrentX32, sqrtRatioTargetX32)
    const exactIn = JSBI.greaterThanOrEqual(amountRemaining, ZERO)

    if (exactIn) {
      const amountRemainingLessFee = JSBI.divide(
        JSBI.multiply(amountRemaining, JSBI.subtract(MAX_FEE, JSBI.BigInt(feePips))),
        MAX_FEE
      )
      returnValues.amountIn = zeroForOne
        ? SqrtPriceMath.getAmount0Delta(sqrtRatioTargetX32, sqrtRatioCurrentX32, liquidity, true)
        : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX32, sqrtRatioTargetX32, liquidity, true)
      if (JSBI.greaterThanOrEqual(amountRemainingLessFee, returnValues.amountIn!)) {
        returnValues.sqrtRatioNextX32 = sqrtRatioTargetX32
      } else {
        returnValues.sqrtRatioNextX32 = SqrtPriceMath.getNextSqrtPriceFromInput(
          sqrtRatioCurrentX32,
          liquidity,
          amountRemainingLessFee,
          zeroForOne
        )
      }
    } else {
      returnValues.amountOut = zeroForOne
        ? SqrtPriceMath.getAmount1Delta(sqrtRatioTargetX32, sqrtRatioCurrentX32, liquidity, false)
        : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX32, sqrtRatioTargetX32, liquidity, false)
      if (JSBI.greaterThanOrEqual(JSBI.multiply(amountRemaining, NEGATIVE_ONE), returnValues.amountOut)) {
        returnValues.sqrtRatioNextX32 = sqrtRatioTargetX32
      } else {
        returnValues.sqrtRatioNextX32 = SqrtPriceMath.getNextSqrtPriceFromOutput(
          sqrtRatioCurrentX32,
          liquidity,
          JSBI.multiply(amountRemaining, NEGATIVE_ONE),
          zeroForOne
        )
      }
    }

    const max = JSBI.equal(sqrtRatioTargetX32, returnValues.sqrtRatioNextX32)

    if (zeroForOne) {
      returnValues.amountIn =
        max && exactIn
          ? returnValues.amountIn
          : SqrtPriceMath.getAmount0Delta(returnValues.sqrtRatioNextX32, sqrtRatioCurrentX32, liquidity, true)
      returnValues.amountOut =
        max && !exactIn
          ? returnValues.amountOut
          : SqrtPriceMath.getAmount1Delta(returnValues.sqrtRatioNextX32, sqrtRatioCurrentX32, liquidity, false)
    } else {
      returnValues.amountIn =
        max && exactIn
          ? returnValues.amountIn
          : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX32, returnValues.sqrtRatioNextX32, liquidity, true)
      returnValues.amountOut =
        max && !exactIn
          ? returnValues.amountOut
          : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX32, returnValues.sqrtRatioNextX32, liquidity, false)
    }

    if (!exactIn && JSBI.greaterThan(returnValues.amountOut!, JSBI.multiply(amountRemaining, NEGATIVE_ONE))) {
      returnValues.amountOut = JSBI.multiply(amountRemaining, NEGATIVE_ONE)
    }

    if (exactIn && JSBI.notEqual(returnValues.sqrtRatioNextX32, sqrtRatioTargetX32)) {
      // we didn't reach the target, so take the remainder of the maximum input as fee
      returnValues.feeAmount = JSBI.subtract(amountRemaining, returnValues.amountIn!)
    } else {
      returnValues.feeAmount = FullMath.mulDivRoundingUp(
        returnValues.amountIn!,
        JSBI.BigInt(feePips),
        JSBI.subtract(MAX_FEE, JSBI.BigInt(feePips))
      )
    }

    return [returnValues.sqrtRatioNextX32!, returnValues.amountIn!, returnValues.amountOut!, returnValues.feeAmount!]
  }
}
