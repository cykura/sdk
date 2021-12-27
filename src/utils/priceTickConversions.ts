import { Price, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { Q64 } from '../internalConstants'
import { encodeSqrtRatioX32 } from './encodeSqrtRatioX32'
import { TickMath } from './tickMath'

/**
 * Returns a price object corresponding to the input tick and the base/quote token
 * Inputs must be tokens because the address order is used to interpret the price represented by the tick
 * @param baseToken the base token of the price
 * @param quoteToken the quote token of the price
 * @param tick the tick for which to return the price
 */
export function tickToPrice(baseToken: Token, quoteToken: Token, tick: number): Price<Token, Token> {
  const sqrtRatioX32 = TickMath.getSqrtRatioAtTick(tick)

  const ratioX64 = JSBI.multiply(sqrtRatioX32, sqrtRatioX32)

  return baseToken.sortsBefore(quoteToken)
    ? new Price(baseToken, quoteToken, Q64, ratioX64)
    : new Price(baseToken, quoteToken, ratioX64, Q64)
}

/**
 * Returns the first tick for which the given price is greater than or equal to the tick price
 * @param price for which to return the closest tick that represents a price less than or equal to the input price,
 * i.e. the price of the returned tick is less than or equal to the input price
 */
export function priceToClosestTick(price: Price<Token, Token>): number {
  const sorted = price.baseCurrency.sortsBefore(price.quoteCurrency)

  const sqrtRatioX96 = sorted
    ? encodeSqrtRatioX32(price.numerator, price.denominator)
    : encodeSqrtRatioX32(price.denominator, price.numerator)

  let tick = TickMath.getTickAtSqrtRatio(sqrtRatioX96)
  const nextTickPrice = tickToPrice(price.baseCurrency, price.quoteCurrency, tick + 1)
  if (sorted) {
    if (!price.lessThan(nextTickPrice)) {
      tick++
    }
  } else {
    if (!price.greaterThan(nextTickPrice)) {
      tick++
    }
  }
  return tick
}
