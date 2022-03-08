import JSBI from 'jsbi'
import { Currency, CurrencyAmount, Token, TradeType } from '@cykura/sdk-core'
import { Pool } from '../src/entities/pool'
import { Route } from '../src/entities/route'
import { Trade } from '../src/entities/trade'
import { POOL_SEED, u32ToSeed } from '../src/utils'
import { FeeAmount } from '../src/constants'
// import { FeeAmount, Pool, POOL_SEED, u32ToSeed, Route, Trade } from '../'
import { AccountMeta, Connection, Keypair, PublicKey } from '@solana/web3.js'
import * as anchor from '@project-serum/anchor'
import { CyclosCore, IDL } from './cykura-core'
import { SolanaTickDataProvider } from './SolanaTickDataProvider'

// CONSTANTS
const SOLUSDC_MAIN = new Token(
  101,
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  6,
  'USDC',
  'USD Coin'
)
const SOLUSDT_MAIN = new Token(101, new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'), 6, 'USDT', 'USDT')
const CYS_MAIN = new Token(101, new PublicKey('BRLsMczKuaR5w9vSubF4j8HwEGGprVAyyVgS4EX7DKEg'), 6, 'CYS', 'Cyclos')
const PROGRAM_ID = new PublicKey('cysPXAjehMpVKUapzbMCCnpFxUFFryEWEaLgnb9NrR8')

interface PState {
  bump: number
  token0: PublicKey
  token1: PublicKey
  fee: number
  tickSpacing: number
  liquidity: anchor.BN
  sqrtPriceX32: anchor.BN
  tick: number
  observationIndex: number
  observationCardinality: number
  observationCardinalityNext: number
  feeGrowthGlobal0X32: anchor.BN
  feeGrowthGlobal1X32: anchor.BN
  protocolFeesToken0: anchor.BN
  protocolFeesToken1: anchor.BN
  unlocked: boolean
}

// Get all possible routes given a pair (This will currently only find the best pair among the different fee tiers)

// 10CYS -> USDC
getAllPossibleOutputs(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'BRLsMczKuaR5w9vSubF4j8HwEGGprVAyyVgS4EX7DKEg',
  10,
  true
)

/**
 * Simulates a swap and returns the expected amount
 * @param mint0 Address of token0
 * @param mint1 Address of token1
 * @param inputAmount The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
 * @param isExactIn The token for which inputAmount was entered

 * @returns
 */
async function getAllPossibleOutputs(mint0: string, mint1: string, inputAmount: number, isExactIn: boolean) {
  // Fetch Tokens
  const token0 = new Token(101, new PublicKey(mint0), 6, 'USDC', 'USD Coin')
  const token1 = new Token(101, new PublicKey(mint1), 6, 'CYS', 'Cykura')

  // get all v3 routes for a given pair
  const bases: Token[] = [SOLUSDC_MAIN, SOLUSDT_MAIN]

  const allPairsCombinations: [Token, Token][] = [
    [token0, token1],
    ...bases.map((base): [Token, Token] => [token0, base]),
    ...bases.map((base): [Token, Token] => [token1, base]),
    [SOLUSDC_MAIN, SOLUSDT_MAIN],
    [SOLUSDT_MAIN, SOLUSDC_MAIN],
  ]

  const allPairCombinationsWithFees: [Token, Token, FeeAmount][] = allPairsCombinations.reduce<
    [Token, Token, FeeAmount][]
  >((list, [tokenA, tokenB]) => {
    return list.concat([
      [tokenA, tokenB, FeeAmount.LOW],
      [tokenA, tokenB, FeeAmount.MEDIUM],
      [tokenA, tokenB, FeeAmount.HIGH],
    ])
  }, [])

  // Fetch pools that exist out of these possible combinations we get
  const pools = await usePools(allPairCombinationsWithFees)

  const existingPools = pools
    .filter((tuple): tuple is [PoolState.EXISTS, Pool] => {
      return tuple[0] === PoolState.EXISTS && tuple[1] !== null
    })
    .map(([, pool]) => pool)

  // isExactIn  -> BestV3TradeExactIn
  // !isExactIn -> BestV3TradeExactOut

  let bestTrade: {
    state: V3TradeState
    trade: Trade<Currency, Currency, TradeType> | null
    accounts: AccountMeta[] | undefined
  }

  if (isExactIn) {
    // Get inputAmount in terms of the corresponding tokens decimals factored in with isExactIn
    // ex. 1USDC = 1 * 10^(decimals in USDC) = 1 * 10^6 = 1_000_000
    const typedValueParsed = inputAmount * Math.pow(10, isExactIn ? token0.decimals : token1.decimals)
    const parsedAmount = CurrencyAmount.fromRawAmount(isExactIn ? token0 : token1, JSBI.BigInt(typedValueParsed))

    bestTrade = await useBestV3TradeExactIn(existingPools, parsedAmount, token1 as Currency)
  } else {
    const typedValueParsed = inputAmount * Math.pow(10, isExactIn ? token0.decimals : token1.decimals)
    const parsedAmount = CurrencyAmount.fromRawAmount(isExactIn ? token0 : token1, JSBI.BigInt(typedValueParsed))

    bestTrade = await useBestV3TradeExactOut(existingPools, token0 as Currency, parsedAmount)
  }
  console.log(bestTrade.trade.outputAmount.toSignificant())
}

function computeAllRoutes(
  currencyIn: Currency,
  currencyOut: Currency,
  pools: Pool[],
  chainId: number,
  currentPath: Pool[] = [],
  allPaths: Route<Currency, Currency>[] = [],
  startCurrencyIn: Currency = currencyIn,
  maxHops = 2
): Route<Currency, Currency>[] {
  const tokenIn = currencyIn?.wrapped
  const tokenOut = currencyOut?.wrapped
  if (!tokenIn || !tokenOut) throw new Error('Missing tokenIn/tokenOut')

  for (const pool of pools) {
    if (currentPath.indexOf(pool) !== -1 || !pool.involvesToken(tokenIn)) continue
    const outputToken = pool.token0.equals(tokenIn) ? pool.token1 : pool.token0
    if (outputToken.equals(tokenOut)) {
      allPaths.push(new Route([...currentPath, pool], startCurrencyIn, currencyOut))
    } else if (maxHops > 1) {
      computeAllRoutes(
        outputToken,
        currencyOut,
        pools,
        chainId,
        [...currentPath, pool],
        allPaths,
        startCurrencyIn,
        maxHops - 1
      )
    }
  }

  return allPaths
}

export enum PoolState {
  LOADING,
  NOT_EXISTS,
  EXISTS,
  INVALID,
}

async function usePools(
  poolKeys: [Token | undefined, Token | undefined, FeeAmount | undefined][]
): Promise<[PoolState, Pool | null][]> {
  const connection = new Connection('https://api.mainnet-beta.solana.com')

  const kp = Keypair.generate()
  const wallet = new anchor.Wallet(kp)

  const provider = new anchor.Provider(connection, wallet, { skipPreflight: false })

  // @ts-ignore
  const cyclosCore = new anchor.Program<CyclosCore>(IDL, PROGRAM_ID, provider)

  const transformed: ([Token, Token, FeeAmount] | null)[] = poolKeys.map(([token0, token1, feeAmount]) => {
    if (!token0 || !token1 || !feeAmount) return null
    if (!token0 || !token1 || token0.equals(token1)) return null

    const [t0, t1] = token0.sortsBefore(token1) ? [token0, token1] : [token1, token0]
    return [t0, t1, feeAmount]
  })

  // Fetch all available pool states
  const poolStates = await cyclosCore.account.poolState.all()

  // Construct the possible pools with a given pair
  const poolList = await Promise.all(
    transformed.map(async (value) => {
      if (!value) return undefined
      try {
        const [tokenA, tokenB, feeAmount] = value

        const tk0 = new PublicKey(tokenA.address)
        const tk1 = new PublicKey(tokenB.address)
        const [poolState] = await PublicKey.findProgramAddress(
          [POOL_SEED, tk0.toBuffer(), tk1.toBuffer(), u32ToSeed(feeAmount)],
          cyclosCore.programId
        )
        return poolState.toString()
      } catch (e) {
        // console.log(value)
        // console.log('ERROR ', e)
        return ''
      }
    })
  )

  const mapPoolStates: { [address: string]: PState } = {}
  poolStates.forEach((pState: { publicKey: PublicKey; account: PState }) => {
    mapPoolStates[pState.publicKey.toString() as string] = pState.account
  })

  if (Object.keys(mapPoolStates).length == 0 && poolList.length == 0) {
    return transformed.map((i) => [PoolState.INVALID, null])
  }

  const allFetchedPublicKeys: string[] = Object.keys(mapPoolStates)

  const existingPools: boolean[] = poolList.map((p: string) => (allFetchedPublicKeys.includes(p) ? true : false))

  return existingPools.map((key, index) => {
    const [token0, token1, fee] = transformed[index] ?? []

    const poolAdd: string | undefined = poolList[index]

    if (!key || !token0 || !token1 || !fee || !poolAdd) {
      return [PoolState.NOT_EXISTS, null]
    }

    const poolState = mapPoolStates[poolAdd]
    if (!poolState) {
      return [PoolState.NOT_EXISTS, null]
    }

    const { token0: token0Add, token1: token1Add, fee: poolFee, sqrtPriceX32, liquidity, tick } = poolState

    if (!sqrtPriceX32.toString() || !liquidity.toString()) {
      console.log('pool doesnt exist')
      return [PoolState.NOT_EXISTS, null]
    }

    try {
      // If can't find public key from constructed list
      const pubkey = poolList[index]
      if (!pubkey || !token0Add || !token1Add || !poolFee) return [PoolState.NOT_EXISTS, null]

      const tickDataProvider = new SolanaTickDataProvider(cyclosCore, {
        token0: new PublicKey(token0Add),
        token1: new PublicKey(token1Add),
        fee: poolFee,
      })
      console.log('constructing pool', JSBI.BigInt(sqrtPriceX32), JSBI.BigInt(liquidity))
      const pool = new Pool(
        token0,
        token1,
        poolFee,
        JSBI.BigInt(sqrtPriceX32),
        JSBI.BigInt(liquidity),
        tick,
        tickDataProvider
      )
      console.log('pool created')
      return [
        PoolState.EXISTS,
        pool,
      ]
    } catch (error) {
      console.error('Error when constructing the pool', error)
      return [PoolState.NOT_EXISTS, null]
    }
  })
}

export enum V3TradeState {
  LOADING,
  INVALID,
  NO_ROUTE_FOUND,
  VALID,
  SYNCING,
}

async function useBestV3TradeExactIn(
  existingPools: Pool[],
  amountIn: CurrencyAmount<Currency>,
  currencyOut: Currency
): Promise<{
  state: V3TradeState
  trade: Trade<Currency, Currency, TradeType.EXACT_INPUT> | null
  accounts: AccountMeta[] | undefined
}> {
  const routes = computeAllRoutes(amountIn.currency, currencyOut, existingPools, 101, [], [], amountIn.currency, 1)

  const result: any = Promise.all(
    routes.map((route, i) => {
      const { pools } = route as any

      const res = Promise.all(
        pools.map(async (_: any, i: any) => {
          const pool = pools[i] as any
          if (!amountIn || !currencyOut) return
          // const amtIn = CurrencyAmount.fromRawAmount(amountIn.currency, amountIn.numerator.toString())
          return await pool.getOutputAmount(amountIn)
        })
      )
      return res
    })
  )

  const d: [CurrencyAmount<Currency>, Pool, any][] = await result
  // Array of expectedAmounts
  // console.log(d.flat().map(d => ` IN ${d[0].toSignificant()}`))

  const absAmouts = d.flat().map((amount: any) => {
    const amt: CurrencyAmount<Currency> = amount[0]

    let absAmt = amt
    // If negative. take abs
    if (+amt.toFixed(2) < 0) {
      const { numerator, denominator } = amt.multiply('-1')
      absAmt = CurrencyAmount.fromFractionalAmount(currencyOut, numerator, denominator)
    }

    return [absAmt, amount[1], amount[2]]
  })

  const { bestRoute, amountOut, swapAccounts } = absAmouts.reduce(
    (
      currentBest: {
        bestRoute: Route<Currency, Currency> | null
        amountOut: CurrencyAmount<typeof currencyOut> | null
        swapAccounts: AccountMeta[] | null
      },
      amount: any,
      i: any
    ) => {
      if (!amount) return currentBest

      if (currentBest.amountOut === null) {
        return {
          bestRoute: routes[i],
          amountOut: amount[0],
          swapAccounts: amount[2],
        }
      } else if (currentBest.amountOut.lessThan(amount[0])) {
        return {
          bestRoute: routes[i],
          amountOut: amount[0],
          swapAccounts: amount[2],
        }
      }

      return currentBest
    },
    {
      bestRoute: null,
      amountOut: null,
      swapAccounts: null,
    }
  )

  if (!bestRoute || !amountOut) {
    return {
      state: V3TradeState.NO_ROUTE_FOUND,
      trade: null,
      accounts: undefined,
    }
  }
  return {
    state: V3TradeState.VALID,
    trade: Trade.createUncheckedTrade({
      route: bestRoute,
      tradeType: TradeType.EXACT_INPUT,
      inputAmount: amountIn,
      outputAmount: amountOut,
    }),
    accounts: swapAccounts, // Figure out how to pass the actual accounts here
  }
}

async function useBestV3TradeExactOut(
  existingPools: Pool[],
  currencyIn: Currency,
  amountOut: CurrencyAmount<Currency>
): Promise<{
  state: V3TradeState
  trade: Trade<Currency, Currency, TradeType.EXACT_OUTPUT> | null
  accounts: AccountMeta[] | undefined
}> {
  const routes = computeAllRoutes(amountOut.currency, currencyIn, existingPools, 101, [], [], amountOut.currency, 1)

  const result: any = Promise.all(
    routes.map((route, i) => {
      const { pools } = route as any

      const res = Promise.all(
        pools.map(async (_: any, i: any) => {
          const pool = pools[i] as any
          if (!amountOut || !currencyIn) return
          return await pool.getOutputAmount(amountOut)
        })
      )
      return res
    })
  )

  const d: [CurrencyAmount<Currency>, Pool, any][] = await result
  // Array of expectedAmounts
  // console.log(d.flat().map(d => `OUT ${d[0].toSignificant()} `))

  const absAmounts = d
    .flat()
    .filter((amt) => amt !== undefined)
    .map((amount) => {
      const amt: CurrencyAmount<Currency> = amount![0]

      let absAmt = amt
      // If negative. take abs
      if (+amt.toFixed(2) < 0) {
        const { numerator, denominator } = amt.multiply('-1')
        absAmt = CurrencyAmount.fromFractionalAmount(currencyIn, numerator, denominator)
      }

      return [absAmt, amount![1], amount![2]]
    })

  let bestPath:
    | {
        bestRoute: Route<Currency, Currency>
        amountIn: CurrencyAmount<typeof currencyIn>
        swapAccounts: AccountMeta[]
      }
    | undefined = undefined

  for (const index in absAmounts) {
    const amount = absAmounts[index]
    // find the path which gives the smallest amountIn
    if (!bestPath || bestPath.amountIn.lessThan(amount[0] as CurrencyAmount<Currency>)) {
      bestPath = {
        bestRoute: routes[index],
        amountIn: amount[0] as CurrencyAmount<Currency>,
        swapAccounts: amount[2] as AccountMeta[],
      }
    }
  }

  if (!bestPath) {
    return {
      state: V3TradeState.NO_ROUTE_FOUND,
      trade: null,
      accounts: undefined,
    }
  }
  const { bestRoute, amountIn, swapAccounts } = bestPath

  return {
    state: V3TradeState.VALID,
    trade: Trade.createUncheckedTrade({
      route: bestRoute,
      tradeType: TradeType.EXACT_OUTPUT,
      inputAmount: amountIn,
      outputAmount: amountOut,
    }),
    accounts: swapAccounts, // Figure out how to pass the actual accounts here
  }
}
