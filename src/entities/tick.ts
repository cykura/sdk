import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { BigintIsh } from '@uniswap/sdk-core'
import { TickMath } from '../utils'

export interface TickConstructorArgs {
  index: number
  liquidityGross: BigintIsh
  liquidityNet: BigintIsh
}

export class Tick {
  public readonly index: number
  public readonly liquidityGross: JSBI
  public readonly liquidityNet: JSBI

  constructor({ index, liquidityGross, liquidityNet }: TickConstructorArgs) {
    invariant(index >= TickMath.MIN_TICK && index <= TickMath.MAX_TICK, 'TICK')
    this.index = index
    this.liquidityGross = JSBI.BigInt(liquidityGross)
    this.liquidityNet = JSBI.BigInt(liquidityNet)
  }
}

export type TickPosition = {
  wordPos: number
  bitPos: number
}

/**
 * Computes the bitmap position for a bit.
 * @param tickBySpacing Tick divided by spacing
 * @returns the word and bit position for the given tick
 */
export function tickPosition(tickBySpacing: number): TickPosition {
  return {
    wordPos: tickBySpacing >> 8,
    bitPos: tickBySpacing % 256 & 255 // mask with 255 to get the output
  }
}
