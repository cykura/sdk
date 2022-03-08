// import {
//   TickDataProvider,
//   PoolVars,
//   u32ToSeed,
//   BITMAP_SEED,
//   u16ToSeed,
//   generateBitmapWord,
//   nextInitializedBit,
//   tickPosition,
//   TICK_SEED
// } from '@cykura/sdk'
import { BigintIsh } from '@cykura/sdk-core'
import { CyclosCore } from './cykura-core'
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

  // @ts-ignore
  constructor(program: anchor.Program<CyclosCore>, pool: PoolVars) {
    this.program = program
    this.pool = pool
  }

  async getTick(tick: number): Promise<{ liquidityNet: BigintIsh }> {
    try {
      const tickState = await this.getTickAddress(tick)

      const { liquidityNet } = await this.program.account.tickState.fetch(tickState)
      return {
        liquidityNet: liquidityNet.toString()
      }
    } catch (e) {
      console.log('Fetching tick state fails', e)
      return Promise.resolve({
        liquidityNet: JSBI.BigInt(0)
      })
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

    const bitmapState = (
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

    let nextBit = lte ? 0 : 255
    let initialized = false
    try {
      const { word: wordArray } = await this.program.account.tickBitmapState.fetch(bitmapState)
      const word = generateBitmapWord(wordArray)
      const nextInitBit = nextInitializedBit(word, bitPos, lte)
      nextBit = nextInitBit.next
      initialized = nextInitBit.initialized
    } catch (error) {
      console.log(error)
    }
    const nextTick = (wordPos * 256 + nextBit) * tickSpacing

    return [nextTick, initialized, wordPos, bitPos, bitmapState]
  }
}
