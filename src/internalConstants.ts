import JSBI from 'jsbi'

// constants used internally but not expected to be used externally
export const NEGATIVE_ONE = JSBI.BigInt(-1)
export const ZERO = JSBI.BigInt(0)
export const ONE = JSBI.BigInt(1)

// used in liquidity amount math
export const Q32 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(32))
export const Q64 = JSBI.exponentiate(Q32, JSBI.BigInt(2))
