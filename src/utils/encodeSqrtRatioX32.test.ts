import JSBI from 'jsbi'
import { Q64 } from '../internalConstants'
import { encodeSqrtRatioX32 } from './encodeSqrtRatioX32'

describe('#encodeSqrtRatioX96', () => {
  it('1/1', () => {
    expect(encodeSqrtRatioX32(1, 1)).toEqual(Q64)
  })

  it('100/1', () => {
    expect(encodeSqrtRatioX32(100, 1)).toEqual(JSBI.BigInt('792281625142643375935439503360'))
  })

  it('1/100', () => {
    expect(encodeSqrtRatioX32(1, 100)).toEqual(JSBI.BigInt('7922816251426433759354395033'))
  })

  it('111/333', () => {
    expect(encodeSqrtRatioX32(111, 333)).toEqual(JSBI.BigInt('45742400955009932534161870629'))
  })

  it('333/111', () => {
    expect(encodeSqrtRatioX32(333, 111)).toEqual(JSBI.BigInt('137227202865029797602485611888'))
  })
})
