import JSBI from 'jsbi';
import { BigintIsh } from '@uniswap/sdk-core';
export interface TickConstructorArgs {
    index: number;
    liquidityGross: BigintIsh;
    liquidityNet: BigintIsh;
}
export declare class Tick {
    readonly index: number;
    readonly liquidityGross: JSBI;
    readonly liquidityNet: JSBI;
    constructor({ index, liquidityGross, liquidityNet }: TickConstructorArgs);
}
export declare type TickPosition = {
    wordPos: number;
    bitPos: number;
};
/**
 * Computes the bitmap position for a bit.
 * @param tickBySpacing Tick divided by spacing
 * @returns the word and bit position for the given tick
 */
export declare function tickPosition(tickBySpacing: number): TickPosition;
