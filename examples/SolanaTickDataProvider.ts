import { CyclosCore } from '../src/anchor/types/cyclos_core'
import * as anchor from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'
import JSBI from 'jsbi'
import { generateBitmapWord, nextInitializedBit } from '../src/entities/bitmap'
import { tickPosition } from '../src/entities/tick'
import { TickDataProvider, PoolVars } from '../src/entities/tickDataProvider'
import { TICK_SEED, u32ToSeed, BITMAP_SEED, u16ToSeed } from '../src/utils'

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

  /**
   *
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

    if (!this.bitmapCache.has(wordPos)) {
      const bitmapAddress = (
        await PublicKey.findProgramAddress(
          [
            BITMAP_SEED,
            this.pool.token0.toBuffer(),
            this.pool.token1.toBuffer(),
            u32ToSeed(this.pool.fee),
            u16ToSeed(wordPos)
          ],
          this.program.programId
        )
      )[0]

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

    let cachedState = this.bitmapCache.get(wordPos)
    const { next: nextBit, initialized } = nextInitializedBit(cachedState.word, bitPos, lte)

    const nextTick = (wordPos * 256 + nextBit) * tickSpacing
    return [nextTick, initialized, wordPos, bitPos, cachedState.address]
  }
}
