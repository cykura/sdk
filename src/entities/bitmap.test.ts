import { BN } from '@project-serum/anchor'
import { nextInitializedBit } from './bitmap'

describe('Bitmap', () => {
  it('uninitialized bitmap for lte=true', () => {
    const { next, initialized } = nextInitializedBit(new BN(0), 100, true);
    console.log('next', next)
    expect(!initialized)
    expect(next).toEqual(0)
  })
  it('uninitialized bitmap for lte=false', () => {
    const { next, initialized } = nextInitializedBit(new BN(0), 100, false);
    expect(!initialized)
    expect(next).toEqual(255)
  })
})
