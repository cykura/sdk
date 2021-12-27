import { BigintIsh } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
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
export declare function maxLiquidityForAmounts(sqrtRatioCurrentX32: JSBI, sqrtRatioAX32: JSBI, sqrtRatioBX32: JSBI, amount0: BigintIsh, amount1: BigintIsh, useFullPrecision: boolean): JSBI;
