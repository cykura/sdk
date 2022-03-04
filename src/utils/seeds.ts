export const BITMAP_SEED = Buffer.from('b')
export const POOL_SEED = Buffer.from('p')
export const POSITION_SEED = Buffer.from('ps')
export const OBSERVATION_SEED = Buffer.from('o')
export const TICK_SEED = Buffer.from('t')
export const FEE_SEED = Buffer.from('f')

export function u16ToSeed(num: number) {
    const arr = new ArrayBuffer(2)
    const view = new DataView(arr)
    view.setUint16(0, num, false)
    return new Uint8Array(arr)
}

export function i16ToSeed(num: number) {
    const arr = new ArrayBuffer(2)
    const view = new DataView(arr)
    view.setInt16(0, num, false)
    return new Uint8Array(arr)
}

// Export to commons later?
// Generate seed buffer from a u32 number
export function u32ToSeed(num: number) {
    const arr = new ArrayBuffer(4)
    const view = new DataView(arr)
    view.setUint32(0, num, false)
    return new Uint8Array(arr)
}

export function i32ToSeed(num: number) {
    const arr = new ArrayBuffer(4)
    const view = new DataView(arr)
    view.setInt32(0, num, false)
    return new Uint8Array(arr)
}