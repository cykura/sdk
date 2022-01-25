import { BigintIsh } from '@uniswap/sdk-core'
import * as anchor from  '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'
import { u16ToSeed, u32ToSeed } from '../utils/computePoolAddress'
import { BITMAP_SEED, TICK_SEED } from '../utils/seeds'
import { tickPosition } from '.'
import { generateBitmapWord, nextInitializedBit } from './bitmap'
import { CyclosCore } from '../anchor/types/cyclos_core'
// import { CyclosCore } from '../anchor/idl/cyclos_core.json'
/**
 * Provides information about ticks
 */
export interface TickDataProvider {
  /**
   * Return information corresponding to a specific tick
   * @param tick the tick to load
   */
  getTick(tick: number): Promise<{ liquidityNet: BigintIsh }>

  /**
   * Return the PDA corresponding to a specific tick
   * @param tick get PDA for this tick
   */
  getTickAddress(tick: number): Promise<anchor.web3.PublicKey>

  /**
   * Return the next tick that is initialized within a single word
   * @param tick The current tick
   * @param lte Whether the next tick should be lte the current tick
   * @param tickSpacing The tick spacing of the pool
   */
  nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number)
    : Promise<[number, boolean, number, number, PublicKey]>
}

/**
 * This tick data provider does not know how to fetch any tick data. It throws whenever it is required. Useful if you
 * do not need to load tick data for your use case.
 */
export class NoTickDataProvider implements TickDataProvider {
  getTickAddress(tick: number): Promise<anchor.web3.PublicKey> {
    throw new Error('Method not implemented.')
  }
  private static ERROR_MESSAGE = 'No tick data provider was given'
  async getTick(_tick: number): Promise<{ liquidityNet: BigintIsh }> {
    throw new Error(NoTickDataProvider.ERROR_MESSAGE)
  }

  async nextInitializedTickWithinOneWord(
    _tick: number,
    _lte: boolean,
    _tickSpacing: number
  ): Promise<[number, boolean, number, number, PublicKey]> {
    throw new Error(NoTickDataProvider.ERROR_MESSAGE)
  }
}

export type PoolVars = {
  token0: PublicKey,
  token1: PublicKey,
  fee: number,
}
export class SolanaTickDataProvider implements TickDataProvider {
  program: anchor.Program<CyclosCore>
  pool: PoolVars

  constructor(program: anchor.Program<CyclosCore>, pool: PoolVars) {
    this.program = program
    this.pool = pool
  }

  async getTick(tick: number): Promise<{ liquidityNet: BigintIsh; }> {
    const tickState = (await PublicKey.findProgramAddress([
      TICK_SEED,
      this.pool.token0.toBuffer(),
      this.pool.token1.toBuffer(),
      u32ToSeed(this.pool.fee),
      u32ToSeed(tick)
    ],
      this.program.programId
    ))[0]

    const { liquidityNet } = await this.program.account.tickState.fetch(tickState)
    return {
      liquidityNet: liquidityNet.toString(),
    }
  }

  async getTickAddress(tick: number): Promise<anchor.web3.PublicKey> {
    return (await PublicKey.findProgramAddress([
      TICK_SEED,
      this.pool.token0.toBuffer(),
      this.pool.token1.toBuffer(),
      u32ToSeed(this.pool.fee),
      u32ToSeed(tick)
    ], this.program.programId))[0]
  }

  async nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number)
    : Promise<[number, boolean, number, number, PublicKey]> {
    // TODO optimize function. Currently bitmaps are repeatedly fetched, even if two ticks are on the same bitmap
    let compressed = Math.floor(tick / tickSpacing)
    if (!lte) {
      compressed += 1
    }

    const { wordPos, bitPos } = tickPosition(compressed)

    const bitmapState = (await PublicKey.findProgramAddress([
      BITMAP_SEED,
      this.pool.token0.toBuffer(),
      this.pool.token1.toBuffer(),
      u32ToSeed(this.pool.fee),
      u16ToSeed(wordPos),
    ], this.program.programId))[0]

    let nextBit = lte ? 0 : 255
    let initialized = false
    try {
      const { word: wordArray } = await this.program.account.tickBitmapState.fetch(bitmapState)
      const word = generateBitmapWord(wordArray)
      const nextInitBit = nextInitializedBit(word, bitPos, lte)
      nextBit = nextInitBit.next
      initialized = nextInitBit.initialized
    } catch(error) {
      console.log('bitmap account doesnt exist, using defaults')
    }
    const nextTick = (wordPos * 256 + nextBit) * tickSpacing
    return [nextTick, initialized, wordPos, bitPos, bitmapState]
    
  }
}
