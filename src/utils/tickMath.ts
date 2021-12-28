import { MaxUint128 } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { ONE, ZERO } from '../internalConstants'
import { mostSignificantBit } from './mostSignificantBit'

function mulShift(val: JSBI, mulBy: string): JSBI {
  return JSBI.signedRightShift(JSBI.multiply(val, JSBI.BigInt(mulBy)), JSBI.BigInt(128))
}

const Q32 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(32))

export abstract class TickMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  /**
   * The minimum tick that can be used on any pool.
   */
  public static MIN_TICK: number = -221818
  /**
   * The maximum tick that can be used on any pool.
   */
  public static MAX_TICK: number = -TickMath.MIN_TICK

  /**
   * The sqrt ratio corresponding to the minimum tick that could be used on any pool.
   */
  public static MIN_SQRT_RATIO: JSBI = JSBI.BigInt('65536')
  /**
   * The sqrt ratio corresponding to the maximum tick that could be used on any pool.
   */
  public static MAX_SQRT_RATIO: JSBI = JSBI.BigInt('281474976710656')

  /**
   * Returns the sqrt ratio as a Q32.32 for the given tick. The sqrt ratio is computed as sqrt(1.0001)^tick
   * @param tick the tick for which to compute the sqrt ratio
   */
  public static getSqrtRatioAtTick(tick: number): JSBI {
    invariant(tick >= TickMath.MIN_TICK && tick <= TickMath.MAX_TICK && Number.isInteger(tick), 'TICK')
    const absTick: number = tick < 0 ? tick * -1 : tick

    let ratio: JSBI =
      (absTick & 0x1) != 0
        ? JSBI.BigInt('0xfffcb933bd6fb800')
        : JSBI.BigInt('0x10000000000000000')
    if ((absTick & 0x2) != 0) ratio = mulShift(ratio, '0xfff97272373d4000')
    if ((absTick & 0x4) != 0) ratio = mulShift(ratio, '0xfff2e50f5f657000')
    if ((absTick & 0x8) != 0) ratio = mulShift(ratio, '0xffe5caca7e10f000')
    if ((absTick & 0x10) != 0) ratio = mulShift(ratio, '0xffcb9843d60f7000')
    if ((absTick & 0x20) != 0) ratio = mulShift(ratio, '0xff973b41fa98e800')
    if ((absTick & 0x40) != 0) ratio = mulShift(ratio, '0xff2ea16466c9b000')
    if ((absTick & 0x80) != 0) ratio = mulShift(ratio, '0xfe5dee046a9a3800')
    if ((absTick & 0x100) != 0) ratio = mulShift(ratio, '0xfcbe86c7900bb000')
    if ((absTick & 0x200) != 0) ratio = mulShift(ratio, '0xf987a7253ac65800')
    if ((absTick & 0x400) != 0) ratio = mulShift(ratio, '0xf3392b0822bb6000')
    if ((absTick & 0x800) != 0) ratio = mulShift(ratio, '0xe7159475a2caf000')
    if ((absTick & 0x1000) != 0) ratio = mulShift(ratio, '0xd097f3bdfd2f2000')
    if ((absTick & 0x2000) != 0) ratio = mulShift(ratio, '0xa9f746462d9f8000')
    if ((absTick & 0x4000) != 0) ratio = mulShift(ratio, '0x70d869a156f31c00')
    if ((absTick & 0x8000) != 0) ratio = mulShift(ratio, '0x31be135f97ed3200')
    if ((absTick & 0x10000) != 0) ratio = mulShift(ratio, '0x9aa508b5b85a500')
    if ((absTick & 0x20000) != 0) ratio = mulShift(ratio, '0x5d6af8dedc582c')
    
    if (tick > 0) ratio = JSBI.divide(MaxUint128, ratio)

    // back to Q32
    return JSBI.greaterThan(JSBI.remainder(ratio, Q32), ZERO)
      ? JSBI.add(JSBI.divide(ratio, Q32), ONE)
      : JSBI.divide(ratio, Q32)
  }

  /**
   * Returns the tick corresponding to a given sqrt ratio, s.t. #getSqrtRatioAtTick(tick) <= sqrtRatioX32
   * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX32
   * @param sqrtRatioX32 the sqrt ratio as a Q32.32 for which to compute the tick
   */
  public static getTickAtSqrtRatio(sqrtRatioX32: JSBI): number {
    invariant(
      JSBI.greaterThanOrEqual(sqrtRatioX32, TickMath.MIN_SQRT_RATIO) &&
        JSBI.lessThan(sqrtRatioX32, TickMath.MAX_SQRT_RATIO),
      'SQRT_RATIO'
    )

    const sqrtRatioX64 = JSBI.leftShift(sqrtRatioX32, JSBI.BigInt(32))

    const msb = mostSignificantBit(sqrtRatioX64)

    let r: JSBI
    if (JSBI.greaterThanOrEqual(JSBI.BigInt(msb), JSBI.BigInt(64))) {
      r = JSBI.signedRightShift(sqrtRatioX64, JSBI.BigInt(msb - 63))
    } else {
      r = JSBI.leftShift(sqrtRatioX64, JSBI.BigInt(63 - msb))
    }

    let log_2: JSBI = JSBI.leftShift(JSBI.subtract(JSBI.BigInt(msb), JSBI.BigInt(64)), JSBI.BigInt(64))

    for (let i = 0; i < 14; i++) {
      r = JSBI.signedRightShift(JSBI.multiply(r, r), JSBI.BigInt(63))
      const f = JSBI.signedRightShift(r, JSBI.BigInt(64))
      log_2 = JSBI.bitwiseOr(log_2, JSBI.leftShift(f, JSBI.BigInt(31 - i)))
      r = JSBI.signedRightShift(r, f)
    }

    const log_sqrt10001 = JSBI.multiply(log_2, JSBI.BigInt('908567298'))

    const tickLow = JSBI.toNumber(
      JSBI.signedRightShift(
        JSBI.subtract(log_sqrt10001, JSBI.BigInt('42949672')),
        JSBI.BigInt(32)
      )
    )
    const tickHigh = JSBI.toNumber(
      JSBI.signedRightShift(
        JSBI.add(log_sqrt10001, JSBI.BigInt('3677218864')),
        JSBI.BigInt(32)
      )
    )

    return tickLow === tickHigh
      ? tickLow
      : JSBI.lessThanOrEqual(TickMath.getSqrtRatioAtTick(tickHigh), sqrtRatioX32)
      ? tickHigh
      : tickLow
  }
}
