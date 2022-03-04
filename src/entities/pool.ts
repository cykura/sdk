import { BigintIsh, Price, Token, CurrencyAmount } from '@cykura/sdk-core'
import { web3 } from '@project-serum/anchor'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { FACTORY_ADDRESS, FeeAmount, TICK_SPACINGS } from '../constants'
import { NEGATIVE_ONE, ONE, Q64, ZERO } from '../internalConstants'
import { computePoolAddress } from '../utils/computePoolAddress'
import { LiquidityMath } from '../utils/liquidityMath'
import { SwapMath } from '../utils/swapMath'
import { TickMath } from '../utils/tickMath'
import { Tick, TickConstructorArgs } from './tick'
import { NoTickDataProvider, TickDataProvider } from './tickDataProvider'
import { tickPosition } from '.'
import { TICK_SEED } from '../utils/seeds'

interface StepComputations {
  sqrtPriceStartX32: JSBI
  tickNext: number
  initialized: boolean
  sqrtPriceNextX32: JSBI
  amountIn: JSBI
  amountOut: JSBI
  feeAmount: JSBI
}

interface SwapAccount {
  pubkey: web3.PublicKey
  isSigner: boolean
  isWritable: boolean
}

/**
 * By default, pools will not allow operations that require ticks.
 */
const NO_TICK_DATA_PROVIDER_DEFAULT = new NoTickDataProvider()

/**
 * Represents a V3 pool
 */
export class Pool {
  public readonly token0: Token
  public readonly token1: Token
  public readonly fee: FeeAmount
  public readonly sqrtRatioX32: JSBI
  public readonly liquidity: JSBI
  public readonly tickCurrent: number
  public readonly tickDataProvider: TickDataProvider

  private _token0Price?: Price<Token, Token>
  private _token1Price?: Price<Token, Token>

  public static getAddress(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    initCodeHashManualOverride?: string
  ): Promise<string> {
    return computePoolAddress({ factoryAddress: FACTORY_ADDRESS, fee, tokenA, tokenB, initCodeHashManualOverride })
  }

  /**
   * Construct a pool
   * @param tokenA One of the tokens in the pool
   * @param tokenB The other token in the pool
   * @param fee The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
   * @param sqrtRatioX32 The sqrt of the current ratio of amounts of token1 to token0
   * @param liquidity The current value of in range liquidity
   * @param tickCurrent The current tick of the pool
   * @param tickDataProvider The current state of the pool ticks or a data provider that can return tick data
   */
  public constructor(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    sqrtRatioX32: BigintIsh,
    liquidity: BigintIsh,
    tickCurrent: number,
    tickDataProvider: TickDataProvider = NO_TICK_DATA_PROVIDER_DEFAULT
  ) {
    // console.log('tick current in pool constructor', tickCurrent)
    invariant(Number.isInteger(fee) && fee < 1_000_000, 'FEE')

    const tickCurrentSqrtRatioX32 = TickMath.getSqrtRatioAtTick(tickCurrent)
    const nextTickSqrtRatioX32 = TickMath.getSqrtRatioAtTick(tickCurrent + 1)
    invariant(
      JSBI.greaterThanOrEqual(JSBI.BigInt(sqrtRatioX32), tickCurrentSqrtRatioX32) &&
        JSBI.lessThanOrEqual(JSBI.BigInt(sqrtRatioX32), nextTickSqrtRatioX32),
      'PRICE_BOUNDS'
    )
    // always create a copy of the list since we want the pool's tick list to be immutable
    ;[this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    this.fee = fee
    this.sqrtRatioX32 = JSBI.BigInt(sqrtRatioX32)
    this.liquidity = JSBI.BigInt(liquidity)
    this.tickCurrent = tickCurrent
    this.tickDataProvider = tickDataProvider
  }

  /**
   * Returns true if the token is either token0 or token1
   * @param token The token to check
   * @returns True if token is either token0 or token
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1)
  }

  /**
   * Returns the current mid price of the pool in terms of token0, i.e. the ratio of token1 over token0
   */
  public get token0Price(): Price<Token, Token> {
    return (
      this._token0Price ??
      (this._token0Price = new Price(
        this.token0,
        this.token1,
        Q64,
        JSBI.multiply(this.sqrtRatioX32, this.sqrtRatioX32)
      ))
    )
  }

  /**
   * Returns the current mid price of the pool in terms of token1, i.e. the ratio of token0 over token1
   */
  public get token1Price(): Price<Token, Token> {
    return (
      this._token1Price ??
      (this._token1Price = new Price(
        this.token1,
        this.token0,
        JSBI.multiply(this.sqrtRatioX32, this.sqrtRatioX32),
        Q64
      ))
    )
  }

  /**
   * Return the price of the given token in terms of the other token in the pool.
   * @param token The token to return price of
   * @returns The price of the given token, in terms of the other.
   */
  public priceOf(token: Token): Price<Token, Token> {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.token0Price : this.token1Price
  }

  /**
   * Returns the chain ID of the tokens in the pool.
   */
  public get chainId(): number {
    return this.token0.chainId
  }

  /**
   * Given an input amount of a token, return the computed output amount, and a pool with state updated after the trade
   * @param inputAmount The input amount for which to quote the output amount
   * @param sqrtPriceLimitX32 The Q32.32 sqrt price limit
   * @returns The output amount and the pool with updated state
   */
  public async getOutputAmount(
    inputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX32?: JSBI
  ): Promise<[CurrencyAmount<Token>, Pool, SwapAccount[]]> {
    invariant(this.involvesToken(inputAmount.currency), 'TOKEN')

    // console.log('getOutputAMount', inputAmount.currency.name, this.token0.name)
    const zeroForOne = inputAmount.currency.equals(this.token0)

    const { amountCalculated: outputAmount, sqrtRatioX32, liquidity, tickCurrent, accounts } = await this.swap(
      zeroForOne,
      inputAmount.quotient,
      sqrtPriceLimitX32
    )
    // console.log('got tick from swap', tickCurrent)
    const outputToken = zeroForOne ? this.token1 : this.token0
    return [
      CurrencyAmount.fromRawAmount(outputToken, JSBI.multiply(outputAmount, NEGATIVE_ONE)),
      new Pool(this.token0, this.token1, this.fee, sqrtRatioX32, liquidity, tickCurrent, this.tickDataProvider),
      accounts
    ]
  }

  /**
   * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX32 The Q32.32 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  public async getInputAmount(
    outputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX32?: JSBI
  ): Promise<[CurrencyAmount<Token>, Pool]> {
    invariant(outputAmount.currency.isToken && this.involvesToken(outputAmount.currency), 'TOKEN')

    // console.log('getOutputAMount', inputAmount.currency.name, this.token0.name)
    const zeroForOne = outputAmount.currency.equals(this.token1)

    const { amountCalculated: inputAmount, sqrtRatioX32, liquidity, tickCurrent } = await this.swap(
      zeroForOne,
      JSBI.multiply(outputAmount.quotient, NEGATIVE_ONE),
      sqrtPriceLimitX32
    )
    const inputToken = zeroForOne ? this.token0 : this.token1
    return [
      CurrencyAmount.fromRawAmount(inputToken, inputAmount),
      new Pool(this.token0, this.token1, this.fee, sqrtRatioX32, liquidity, tickCurrent, this.tickDataProvider)
    ]
  }

  /**
   * Executes a swap
   * @param zeroForOne Whether the amount in is token0 or token1
   * @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
   * @param sqrtPriceLimitX32 The Q32.32 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns amountCalculated
   * @returns sqrtRatioX32
   * @returns liquidity
   * @returns tickCurrent
   */
  private async swap(
    zeroForOne: boolean,
    amountSpecified: JSBI,
    sqrtPriceLimitX32?: JSBI
  ): Promise<{
    amountCalculated: JSBI
    sqrtRatioX32: JSBI
    liquidity: JSBI
    tickCurrent: number
    accounts: SwapAccount[]
  }> {
    invariant(JSBI.notEqual(amountSpecified, ZERO), 'AMOUNT_LESS_THAN_0')

    if (!sqrtPriceLimitX32)
      sqrtPriceLimitX32 = zeroForOne
        ? JSBI.add(TickMath.MIN_SQRT_RATIO, ONE)
        : JSBI.subtract(TickMath.MAX_SQRT_RATIO, ONE)

    if (zeroForOne) {
      invariant(JSBI.greaterThan(sqrtPriceLimitX32, TickMath.MIN_SQRT_RATIO), 'RATIO_MIN')
      invariant(JSBI.lessThan(sqrtPriceLimitX32, this.sqrtRatioX32), 'RATIO_CURRENT')
    } else {
      invariant(JSBI.lessThan(sqrtPriceLimitX32, TickMath.MAX_SQRT_RATIO), 'RATIO_MAX')
      invariant(JSBI.greaterThan(sqrtPriceLimitX32, this.sqrtRatioX32), 'RATIO_CURRENT')
    }

    const exactInput = JSBI.greaterThanOrEqual(amountSpecified, ZERO)
    // console.log('exact input', exactInput)
    // keep track of swap state

    const state = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: ZERO,
      sqrtPriceX32: this.sqrtRatioX32,
      tick: this.tickCurrent,
      accounts: [] as SwapAccount[], // bitmap and tick accounts which must be traversed
      liquidity: this.liquidity
    }

    let lastSavedWordPos: number | undefined

    // console.log('0for1 outisde while', zeroForOne)
    // start swap while loop
    while (
      JSBI.notEqual(state.amountSpecifiedRemaining, ZERO) &&
      state.sqrtPriceX32 != sqrtPriceLimitX32 &&
      state.tick < TickMath.MAX_TICK &&
      state.tick > TickMath.MIN_TICK
    ) {
      let step: Partial<StepComputations> = {}
      step.sqrtPriceStartX32 = state.sqrtPriceX32

      // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
      // by simply traversing to the next available tick, we instead need to exactly replicate
      // tickBitmap.nextInitializedTickWithinOneWord

      // console.log('SDK', 'tick', state.tick, zeroForOne, ' 0for1')
      // save the bitmap, and the tick account if it is initialized
      const nextInitTick = await this.tickDataProvider.nextInitializedTickWithinOneWord(
        state.tick,
        zeroForOne,
        this.tickSpacing
      )
      step.tickNext = nextInitTick[0]
      step.initialized = nextInitTick[1]
      const wordPos = nextInitTick[2]
      const bitmapAddress = nextInitTick[4]
      // console.log('got next tick', step.tickNext)
      // console.log('last saved word pos', lastSavedWordPos, 'got word pos', wordPos)
      if (lastSavedWordPos !== wordPos) {
        // console.log('pushing bitmap account', wordPos)
        state.accounts.push({
          pubkey: bitmapAddress,
          isWritable: false,
          isSigner: false
        })
        lastSavedWordPos = wordPos
      }

      if (step.tickNext < TickMath.MIN_TICK) {
        step.tickNext = TickMath.MIN_TICK
      } else if (step.tickNext > TickMath.MAX_TICK) {
        step.tickNext = TickMath.MAX_TICK
      }

      step.sqrtPriceNextX32 = TickMath.getSqrtRatioAtTick(step.tickNext)
      ;[state.sqrtPriceX32, step.amountIn, step.amountOut, step.feeAmount] = SwapMath.computeSwapStep(
        state.sqrtPriceX32,
        (zeroForOne
        ? JSBI.lessThan(step.sqrtPriceNextX32, sqrtPriceLimitX32)
        : JSBI.greaterThan(step.sqrtPriceNextX32, sqrtPriceLimitX32))
          ? sqrtPriceLimitX32
          : step.sqrtPriceNextX32,
        state.liquidity,
        state.amountSpecifiedRemaining,
        this.fee
      )

      if (exactInput) {
        state.amountSpecifiedRemaining = JSBI.subtract(
          state.amountSpecifiedRemaining,
          JSBI.add(step.amountIn, step.feeAmount)
        )
        state.amountCalculated = JSBI.subtract(state.amountCalculated, step.amountOut)
      } else {
        state.amountSpecifiedRemaining = JSBI.add(state.amountSpecifiedRemaining, step.amountOut)
        state.amountCalculated = JSBI.add(state.amountCalculated, JSBI.add(step.amountIn, step.feeAmount))
      }

      // protocol Fee calculation is skipped for now
      //   if cache.fee_protocol > 0 {
      //     let delta = step.fee_amount / cache.fee_protocol as u64;
      //     step.fee_amount -= delta;
      //     state.protocol_fee += delta;
      // }

      // TODO
      if (JSBI.equal(state.sqrtPriceX32, step.sqrtPriceNextX32)) {
        // if the tick is initialized, run the tick transition
        if (step.initialized) {
          // push the crossed tick to accounts array
          // console.log('pushing tick account', step.tickNext)
          state.accounts.push({
            pubkey: await this.tickDataProvider.getTickAddress(step.tickNext),
            isWritable: true,
            isSigner: false
          })
          // get the liquidity at this tick
          let liquidityNet = JSBI.BigInt((await this.tickDataProvider.getTick(step.tickNext)).liquidityNet)
          // if we're moving leftward, we interpret liquidityNet as the opposite sign
          // safe because liquidityNet cannot be type(int128).min
          if (zeroForOne) liquidityNet = JSBI.multiply(liquidityNet, NEGATIVE_ONE)

          state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet)
        } else {
          console.log('reached uninitialized tick', step.tickNext)
        }
        // console.log('state.tick', state.tick)
        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext
        // console.log('updated state.tick', state.tick)
      } else if (state.sqrtPriceX32 != step.sqrtPriceStartX32) {
        // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
        state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX32)
      }
    }

    return {
      amountCalculated: state.amountCalculated,
      sqrtRatioX32: state.sqrtPriceX32,
      liquidity: state.liquidity,
      tickCurrent: state.tick,

      // active ticks being flipped, plus each bitmap which is traversed
      accounts: state.accounts
    }
  }

  public get tickSpacing(): number {
    return TICK_SPACINGS[this.fee]
  }
}
