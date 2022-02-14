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
    const swapStep: Partial<{
      sqrtRatioNextX32: JSBI
      amountIn: JSBI
      amountOut: JSBI
      feeAmount: JSBI
    }> = {}

    const zeroForOne = JSBI.greaterThanOrEqual(sqrtRatioCurrentX32, sqrtRatioTargetX32)
    const exactIn = JSBI.greaterThanOrEqual(amountRemaining, ZERO)

    if (exactIn) {
      const amountRemainingLessFee = FullMath.mulDivFloor(
        amountRemaining,
        JSBI.subtract(MAX_FEE, JSBI.BigInt(feePips)),
        MAX_FEE
      )
      swapStep.amountIn = zeroForOne
        ? SqrtPriceMath.getAmount0Delta(sqrtRatioTargetX32, sqrtRatioCurrentX32, liquidity, true)
        : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX32, sqrtRatioTargetX32, liquidity, true)
      if (JSBI.greaterThanOrEqual(amountRemainingLessFee, swapStep.amountIn!)) {
        swapStep.sqrtRatioNextX32 = sqrtRatioTargetX32
      } else {
        swapStep.sqrtRatioNextX32 = SqrtPriceMath.getNextSqrtPriceFromInput(
          sqrtRatioCurrentX32,
          liquidity,
          amountRemainingLessFee,
          zeroForOne
        )
      }
    } else {
      swapStep.amountOut = zeroForOne
        ? SqrtPriceMath.getAmount1Delta(sqrtRatioTargetX32, sqrtRatioCurrentX32, liquidity, false)
        : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX32, sqrtRatioTargetX32, liquidity, false)
      if (JSBI.greaterThanOrEqual(JSBI.multiply(amountRemaining, NEGATIVE_ONE), swapStep.amountOut)) {
        swapStep.sqrtRatioNextX32 = sqrtRatioTargetX32
      } else {
        swapStep.sqrtRatioNextX32 = SqrtPriceMath.getNextSqrtPriceFromOutput(
          sqrtRatioCurrentX32,
          liquidity,
          JSBI.multiply(amountRemaining, NEGATIVE_ONE),
          zeroForOne
        )
      }
    }

    const max = JSBI.equal(sqrtRatioTargetX32, swapStep.sqrtRatioNextX32)

    if (zeroForOne) {
      swapStep.amountIn =
        max && exactIn
          ? swapStep.amountIn
          : SqrtPriceMath.getAmount0Delta(swapStep.sqrtRatioNextX32, sqrtRatioCurrentX32, liquidity, true)
      swapStep.amountOut =
        max && !exactIn
          ? swapStep.amountOut
          : SqrtPriceMath.getAmount1Delta(swapStep.sqrtRatioNextX32, sqrtRatioCurrentX32, liquidity, false)
    } else {
      swapStep.amountIn =
        max && exactIn
          ? swapStep.amountIn
          : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX32, swapStep.sqrtRatioNextX32, liquidity, true)
      swapStep.amountOut =
        max && !exactIn
          ? swapStep.amountOut
          : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX32, swapStep.sqrtRatioNextX32, liquidity, false)
    }

    if (!exactIn && JSBI.greaterThan(swapStep.amountOut!, JSBI.multiply(amountRemaining, NEGATIVE_ONE))) {
      swapStep.amountOut = JSBI.multiply(amountRemaining, NEGATIVE_ONE)
    }

    if (exactIn && JSBI.notEqual(swapStep.sqrtRatioNextX32, sqrtRatioTargetX32)) {
      // we didn't reach the target, so take the remainder of the maximum input as fee
      swapStep.feeAmount = JSBI.subtract(amountRemaining, swapStep.amountIn!)
    } else {
      swapStep.feeAmount = FullMath.mulDivCeil(
        swapStep.amountIn!,
        JSBI.BigInt(feePips),
        JSBI.subtract(MAX_FEE, JSBI.BigInt(feePips))
      )
    }

    return [swapStep.sqrtRatioNextX32!, swapStep.amountIn!, swapStep.amountOut!, swapStep.feeAmount!]
  }
}
