import { CyclosCore } from '../src/anchor/types/cyclos_core'
import * as anchor from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'
import JSBI from 'jsbi'
import { buildTick, generateBitmapWord, nextInitializedBit } from '../src/entities/bitmap'
import { tickPosition } from '../src/entities/tick'
import { TickDataProvider, PoolVars } from '../src/entities/tickDataProvider'
import { TICK_SEED, u32ToSeed, BITMAP_SEED, u16ToSeed, TickMath } from '../src/utils'
import { BN } from '@project-serum/anchor'

interface TickBitmap {
  word: BN[]
}

interface Tick {
  tick: number
  liquidityNet: BN
}

/**
 * Tick and bitmap data provider for a Cykura pool
 */
 export class SolanaTickDataProvider implements TickDataProvider {
  // @ts-ignore
  program: anchor.Program<CyclosCore>
  pool: PoolVars

  bitmapCache: Map<
    number,
    | {
        address: PublicKey
        word: anchor.BN
      }
    | undefined
  >

  tickCache: Map<
    number,
    | {
        address: PublicKey
        liquidityNet: JSBI
      }
    | undefined
  >

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
    // fetch 10 bitmaps on each side in a single fetch. Find active ticks and read them together
    const compressed = JSBI.toNumber(JSBI.divide(JSBI.BigInt(tickCurrent), JSBI.BigInt(tickSpacing)))
    const { wordPos } = tickPosition(compressed)

    try {
      const bitmapsToFetch = []
      const { wordPos: WORD_POS_MIN } = tickPosition(Math.floor(TickMath.MIN_TICK / tickSpacing))
      const { wordPos: WORD_POS_MAX } = tickPosition(Math.floor(TickMath.MAX_TICK / tickSpacing))
      const minWord = Math.max(wordPos - 10, WORD_POS_MIN)
      const maxWord = Math.min(wordPos + 10, WORD_POS_MAX)
      for (let i = minWord; i < maxWord; i++) {
        bitmapsToFetch.push(await this.getBitmapAddress(i))
      }

      const fetchedBitmaps = (await this.program.account.tickBitmapState.fetchMultiple(
        bitmapsToFetch
      )) as (TickBitmap | null)[]

      const tickAddresses = []
      for (let i = 0; i < maxWord - minWord; i++) {
        const currentWordPos = i + minWord
        const wordArray = fetchedBitmaps[i]?.word
        const word = wordArray ? generateBitmapWord(wordArray) : new BN(0)
        this.bitmapCache.set(currentWordPos, {
          address: bitmapsToFetch[i],
          word,
        })
        if (word && !word.eqn(0)) {
          for (let j = 0; j < 256; j++) {
            if (word.shrn(j).and(new BN(1)).eqn(1)) {
              const tick = ((currentWordPos << 8) + j) * tickSpacing
              const tickAddress = await this.getTickAddress(tick)
              tickAddresses.push(tickAddress)
            }
          }
        }
      }

      const fetchedTicks = (await this.program.account.tickState.fetchMultiple(tickAddresses)) as Tick[]
      for (const i in tickAddresses) {
        const { tick, liquidityNet } = fetchedTicks[i]
        this.tickCache.set(tick, {
          address: tickAddresses[i],
          liquidityNet: JSBI.BigInt(liquidityNet),
        })
      }
    } catch (error) {
      console.log(error)
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
          u32ToSeed(tick),
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
          u16ToSeed(wordPos),
        ],
        this.program.programId
      )
    )[0]
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
      } catch (error) {
        // An uninitialized bitmap will have no initialized ticks, i.e. the bitmap will be empty
        word = new anchor.BN(0)
      }

      this.bitmapCache.set(wordPos, {
        address: bitmapAddress,
        word,
      })
    }

    return this.bitmapCache.get(wordPos)!
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

