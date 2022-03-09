import { CyclosCore } from '../src/anchor/types/cyclos_core'
import * as anchor from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'
import JSBI from 'jsbi'
import { buildTick, generateBitmapWord, nextInitializedBit } from '../src/entities/bitmap'
import { tickPosition } from '../src/entities/tick'
import { TickDataProvider, PoolVars } from '../src/entities/tickDataProvider'
import { TICK_SEED, u32ToSeed, BITMAP_SEED, u16ToSeed, TickMath } from '../src/utils'

export class SolanaTickDataProvider implements TickDataProvider {
  // @ts-ignore
  program: anchor.Program<CyclosCore>
  pool: PoolVars

  bitmapCache: Map<number, {
    address: PublicKey,
    word: anchor.BN,
  } | undefined>

  tickCache: Map<number, {
    address: PublicKey,
    liquidityNet: JSBI,
  } | undefined>

  // @ts-ignore
  constructor(program: anchor.Program<CyclosCore>, pool: PoolVars) {
    this.program = program
    this.pool = pool
    this.bitmapCache = new Map()
    this.tickCache = new Map()
  }

  /**
   * Caches ticks and bitmap accounts near the current price
   * @param tickCurrent The current pool tick
   * @param tickSpacing The pool tick spacing
   */
  async eagerLoadCache(tickCurrent: number, tickSpacing: number) {
    let compressed = JSBI.toNumber(JSBI.divide(JSBI.BigInt(tickCurrent), JSBI.BigInt(tickSpacing)))
    let { wordPos, bitPos } = tickPosition(compressed)
    const bitmapData = await this.getBitmap(wordPos)

    const ticksToFetch = [] as number[]

    let bitPosForBehind = bitPos
    for (let i = 0; i < 3; i++) {
      const { next: nextBitBehind, initialized } = nextInitializedBit(bitmapData.word, bitPosForBehind, true)
      const tick = buildTick(wordPos, nextBitBehind, tickSpacing)

      if (initialized) {
        ticksToFetch.push(tick)
      }
      if (nextBitBehind === 0 || tick === TickMath.MIN_TICK) {
        break
      }
      --bitPosForBehind
    }

    let bitPosForAhead = bitPos + 1
    for (let i = 0; i < 3; i++) {
      const { next: nextBitAhead, initialized } = nextInitializedBit(bitmapData.word, bitPosForAhead, false)
      const tick = buildTick(wordPos, nextBitAhead, tickSpacing)

      if (initialized) {
        ticksToFetch.push(tick)
      }
      if (nextBitAhead === 255 || tick === TickMath.MAX_TICK) {
        break
      }
      ++bitPosForAhead
    }

    const tickAddresses = [] as PublicKey[]
    for (const tick of ticksToFetch) {
      tickAddresses.push(await this.getTickAddress(tick))
    }
    const fetchedTicks = await this.program.account.tickState.fetchMultiple(tickAddresses)

    for (let index = 0; index < fetchedTicks.length; index++) {
      const { tick, liquidityNet } = fetchedTicks[index] as { tick: number, liquidityNet: anchor.BN }
      this.tickCache.set(tick, {
        address: tickAddresses[index],
        liquidityNet: JSBI.BigInt(liquidityNet),
      })
    }
  }

  async getTick(tick: number): Promise<{ liquidityNet: JSBI }> {
    let savedTick = this.tickCache.get(tick)

    if (!savedTick) {
      const tickState = await this.getTickAddress(tick)
      const { liquidityNet } = await this.program.account.tickState.fetch(tickState)
      savedTick = {
        address: tickState,
        liquidityNet: JSBI.BigInt(liquidityNet),
      }
      this.tickCache.set(tick, savedTick)
    }

    return {
      liquidityNet: JSBI.BigInt(savedTick.liquidityNet),
    }
  }

  async getTickAddress(tick: number): Promise<anchor.web3.PublicKey> {
    return (
      await PublicKey.findProgramAddress(
        [
          TICK_SEED,
          this.pool.token0.toBuffer(),
          this.pool.token1.toBuffer(),
          u32ToSeed(this.pool.fee),
          u32ToSeed(tick)
        ],
        this.program.programId
      )
    )[0]
  }

  async getBitmapAddress(wordPos: number): Promise<anchor.web3.PublicKey> {
    return (
      await PublicKey.findProgramAddress(
        [
          BITMAP_SEED,
          this.pool.token0.toBuffer(),
          this.pool.token1.toBuffer(),
          u32ToSeed(this.pool.fee),
          u32ToSeed(wordPos)
        ],
        this.program.programId
      )
    )[0]
  }

  /**
   * Fetches bitmap for the word. Bitmaps are cached locally after each RPC call
   * @param wordPos
   */
  async getBitmap(wordPos: number) {
    if (!this.bitmapCache.has(wordPos)) {
      const bitmapAddress = await this.getBitmapAddress(wordPos)

      let word: anchor.BN
      try {
        const { word: wordArray } = await this.program.account.tickBitmapState.fetch(bitmapAddress)
        word = generateBitmapWord(wordArray)
      } catch(error) {
        // An uninitialized bitmap will have no initialized ticks, i.e. the bitmap will be empty
        word = new anchor.BN(0)
      }

      this.bitmapCache.set(wordPos, {
        address: bitmapAddress,
        word,
      })
    }

    return this.bitmapCache.get(wordPos)
  }

  /**
   * Finds the next initialized tick in the given word. Fetched bitmaps are saved in a
   * cache for quicker lookups in future.
   * @param tick The current tick
   * @param lte Whether to look for a tick less than or equal to the current one, or a tick greater than or equal to
   * @param tickSpacing The tick spacing for the pool
   * @returns
   */
  async nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): Promise<[number, boolean, number, number, PublicKey]> {
    let compressed = JSBI.toNumber(JSBI.divide(JSBI.BigInt(tick), JSBI.BigInt(tickSpacing)))
    if (tick < 0 && tick % tickSpacing !== 0) {
      compressed -= 1
    }
    if (!lte) {
      compressed += 1
    }

    const { wordPos, bitPos } = tickPosition(compressed)
    const cachedState = await this.getBitmap(wordPos)

    const { next: nextBit, initialized } = nextInitializedBit(cachedState.word, bitPos, lte)
    const nextTick = buildTick(wordPos, nextBit, tickSpacing)
    return [nextTick, initialized, wordPos, bitPos, cachedState.address]
  }
}
