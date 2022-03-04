import { Price, Token } from '@cykura/sdk-core'
import { tickToPrice } from './index'
import { priceToClosestTick } from './priceTickConversions'

describe('priceTickConversions', () => {
  /**
   * Creates an example token with a specific sort order
   */
  function token({
    sortOrder,
    decimals = 18,
    chainId = 1
  }: {
    sortOrder: number
    decimals?: number
    chainId?: number
  }): Token {
    if (sortOrder > 9 || sortOrder % 1 !== 0) throw new Error('invalid sort order')
    return new Token(
      chainId,
      `0x${new Array<string>(40).fill(`${sortOrder}`).join('')}`,
      decimals,
      `T${sortOrder}`,
      `token${sortOrder}`
    )
  }

  const token0 = token({ sortOrder: 0 })
  const token1 = token({ sortOrder: 1 })

  describe('#tickToPrice', () => {
    it('1800 t0/1 t1', () => {
      expect(tickToPrice(token1, token0, -74959).toSignificant(5)).toEqual('1800')
    })

    it('1 t1/1800 t0', () => {
      expect(tickToPrice(token0, token1, -74959).toSignificant(5)).toEqual('0.00055556')
    })

    it('1800 t1/1 t0', () => {
      expect(tickToPrice(token0, token1, 74959).toSignificant(5)).toEqual('1800')
    })

    it('1 t0/1800 t1', () => {
      expect(tickToPrice(token1, token0, 74959).toSignificant(5)).toEqual('0.00055556')
    })
  })

  describe('#priceToClosestTick', () => {
    it('1800 t0/1 t1', () => {
      expect(priceToClosestTick(new Price(token1, token0, 1, 1800))).toEqual(-74960)
    })

    it('1 t1/1800 t0', () => {
      expect(priceToClosestTick(new Price(token0, token1, 1800, 1))).toEqual(-74960)
    })

    it('40 t1/1 t0', () => {
      expect(priceToClosestTick(new Price(token0, token1, 1, 40))).toEqual(36890)
    })

    it('50 t1/1 t0', () => {
      expect(priceToClosestTick(new Price(token0, token1, 1, 50))).toEqual(39122)
    })

    it('60 t1/1 t0', () => {
      expect(priceToClosestTick(new Price(token0, token1, 1, 60))).toEqual(40945)
    })

    describe('reciprocal with tickToPrice', () => {
      it('1800 t0/1 t1', () => {
        expect(priceToClosestTick(tickToPrice(token1, token0, -74960))).toEqual(-74960)
      })

      it('1 t0/1800 t1', () => {
        expect(priceToClosestTick(tickToPrice(token1, token0, 74960))).toEqual(74960)
      })

      it('1 t1/1800 t0', () => {
        expect(priceToClosestTick(tickToPrice(token0, token1, -74960))).toEqual(-74960)
      })

      it('1800 t1/1 t0', () => {
        expect(priceToClosestTick(tickToPrice(token0, token1, 74960))).toEqual(74960)
      })
    })
  })
})
