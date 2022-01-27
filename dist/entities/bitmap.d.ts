/// <reference types="bn.js" />
import { BN } from "@project-serum/anchor";
/**
 * Decodes the 256 bit bitmap stored in a bitmap account
 * @param x Bitmap encoded as [u64; 4]
 * @returns 256 bit word
 */
export declare function generateBitmapWord(x: BN[]): BN;
/**
 * Returns the most significant non-zero bit in the word
 * @param x
 * @returns
 */
export declare function msb(x: BN): number;
/**
 * Returns the least significant non-zero bit in the word
 * @param x
 * @returns
 */
export declare function lsb(x: BN): number;
export declare type NextBit = {
    next: number;
    initialized: boolean;
};
/**
 * Returns the bitmap index (0 - 255) for the next initialized tick.
 *
 * If no initialized tick is available, returns the first bit (index 0) the word in lte case,
 * and the last bit in gte case.
 * @param word The bitmap word as a u256 number
 * @param bitPos The starting bit position
 * @param lte Whether to search for the next initialized tick to the left (less than or equal to the starting tick),
 * or to the right (greater than or equal to)
 * @returns Bit index and whether it is initialized
 */
export declare function nextInitializedBit(word: BN, bitPos: number, lte: boolean): NextBit;
