import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { NEGATIVE_ONE, ZERO } from '../internalConstants'

export abstract class LiquidityMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static addDelta(x: JSBI, y: JSBI): JSBI {
    let z: JSBI
    if (JSBI.lessThan(y, ZERO)) {
      z = JSBI.subtract(x, JSBI.multiply(y, NEGATIVE_ONE))
      // invariant(z < x, 'LIQUIDITY_SUB')
    } else {
      z = JSBI.add(x, y)
      // invariant(z >= x, 'LIQUIDITY_ADD')
    }
    return z
  }
}
