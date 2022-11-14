/// Demonstrates slippage check in Cykura SDK
/// pool.getOutputAmount() throws an error if 8 ticks are crossed

import JSBI from 'jsbi'
import { Currency, CurrencyAmount, Token, TradeType } from '@cykura/sdk-core'
import { Pool } from '../src/entities/pool'
import { Route } from '../src/entities/route'
import { Trade } from '../src/entities/trade'
import { POOL_SEED, u32ToSeed } from '../src/utils'
import { FeeAmount } from '../src/constants'
import { AccountMeta, Connection, Keypair, PublicKey } from '@solana/web3.js'
import * as anchor from '@project-serum/anchor'
import { CyclosCore, IDL } from '../src/anchor/types/cyclos_core'
import { SolanaTickDataProvider } from './SolanaTickDataProvider'

// token 0
const SOLUSDC_MAIN = new Token(
  101,
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  6,
  'USDC',
  'USD Coin'
)

// token 1
const SOLUSDT_MAIN = new Token(101, new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'), 6, 'USDT', 'USDT')
const CYS_MAIN = new Token(101, new PublicKey('BRLsMczKuaR5w9vSubF4j8HwEGGprVAyyVgS4EX7DKEg'), 6, 'CYS', 'Cyclos')
const PROGRAM_ID = new PublicKey('cysPXAjehMpVKUapzbMCCnpFxUFFryEWEaLgnb9NrR8')

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com')
  const kp = Keypair.generate()
  const wallet = new anchor.Wallet(kp)
  const provider = new anchor.Provider(connection, wallet, { skipPreflight: false })

  // @ts-ignore
  const cyclosCore = new anchor.Program<CyclosCore>(IDL, PROGRAM_ID, provider)

  const poolAddress = new PublicKey('3vDq4rPR6kzK1ysV8VbeLFbdnCqYB6FMQksAiJkD3xSf')
  const poolState = await cyclosCore.account.poolState.fetch(poolAddress)

  const tickDataProvider = new SolanaTickDataProvider(cyclosCore, {
    token0: new PublicKey(SOLUSDC_MAIN.address),
    token1: new PublicKey(SOLUSDT_MAIN.address),
    fee: FeeAmount.SUPER_STABLE,
  })
  await tickDataProvider.eagerLoadCache(poolState.tick, poolState.tickSpacing)

  const pool = new Pool(
    SOLUSDC_MAIN,
    SOLUSDT_MAIN,
    FeeAmount.SUPER_STABLE,
    JSBI.BigInt(poolState.sqrtPriceX32.toString()),
    JSBI.BigInt(poolState.liquidity.toString()),
    poolState.tick,
    tickDataProvider
  )

  const workingOutput = pool.getOutputAmount(CurrencyAmount.fromRawAmount(
    SOLUSDC_MAIN,
    JSBI.multiply(JSBI.BigInt('1000000'), JSBI.BigInt(100)))
  )
  console.log('100 USDC to Tether trade works', workingOutput)

  // This should throw 'account limit' error. Currently the pool only has $500 worth TVL
  pool.getOutputAmount(CurrencyAmount.fromRawAmount(
    SOLUSDC_MAIN,
    JSBI.multiply(JSBI.BigInt('1000000'), JSBI.BigInt(10000)))
  )

}

main()