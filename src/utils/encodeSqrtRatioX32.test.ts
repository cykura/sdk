import JSBI from 'jsbi'
import { Q32 } from '../internalConstants'
import { encodeSqrtRatioX32 } from './encodeSqrtRatioX32'

describe('#encodeSqrtRatioX32', () => {
  it('1/1', () => {
    expect(encodeSqrtRatioX32(1, 1)).toEqual(Q32)
  })

  it('100/1', () => {
    expect(encodeSqrtRatioX32(100, 1)).toEqual(JSBI.BigInt('42949672960'))
  })

  it('1/100', () => {
    expect(encodeSqrtRatioX32(1, 100)).toEqual(JSBI.BigInt('429496729'))
  })

  it('111/333', () => {
    expect(encodeSqrtRatioX32(111, 333)).toEqual(JSBI.BigInt('2479700524'))
  })

  it('333/111', () => {
    expect(encodeSqrtRatioX32(333, 111)).toEqual(JSBI.BigInt('7439101573'))
  })
})
