// Written in Anchor style, ignoring Uniswap's SDK convention
// We need an SDK rewrite soon

import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export interface PoolState {
  bump: number,
  token0: PublicKey,
  token1: PublicKey,
  fee: number,
  tickSpacing: number,
  liquidity: BN,
  sqrtPriceX32: BN,
  tick: number,
  observationIndex: number,
  observationCardinality: number,
  observationCardinalityNext: number,
  feeGrowthGlobal0X32: BN,
  feeGrowthGlobal1X32: BN,
  protocolFeesToken0: BN,
  protocolFeesToken1: BN,
  unlocked: boolean,
}

export interface TickState {
  bump: number,
  tick: number,
  liquidityNet: BN,
  liquidityGross: BN,
  feeGrowthOutside0X32: BN,
  feeGrowthOutside1X32: BN,
  tickCumulativeOutside: BN,
  secondsPerLiquidityOutsideX32: BN,
  secondsOutside: number,
}

export interface ObservationState {
  bump: number,
  index: number,
  blockTimestamp: number,
  tickCumulative: BN,
  secondsPerLiquidityCumulativeX32: BN,
  initialized: boolean,
}

export function transformObservation({
  observation,
  blockTimestamp,
  tick,
  liquidity,
}: {
  observation: ObservationState,
  blockTimestamp: number,
  tick: number,
  liquidity: BN,
}): ObservationState {
  const delta = new BN(blockTimestamp - observation.blockTimestamp)

  return {
    ...observation,
    tickCumulative: observation.tickCumulative.add(delta.muln(tick)),
    secondsPerLiquidityCumulativeX32: observation.secondsPerLiquidityCumulativeX32.add(
      delta.shln(32).div(liquidity.gtn(0) ? liquidity : new BN(1))
    ),
    initialized: true,
  }
}

export interface SnapshotCumulative {
  tickCumulativeInside: BN,
  secondsPerLiquidityInsideX32: BN,
  secondsInside: number,
}

export function snapshotCumulativesInside({
  poolState,
  tickLower,
  tickUpper,
  latestObservation,
  time,
}: {
  poolState: PoolState,
  tickLower: TickState,
  tickUpper: TickState,
  latestObservation: ObservationState,
  time: number,
}): SnapshotCumulative {
  if (poolState.tick < tickLower.tick) {
    return {
      tickCumulativeInside: tickLower.tickCumulativeOutside
        .sub(tickUpper.tickCumulativeOutside),
      secondsPerLiquidityInsideX32: tickLower.secondsPerLiquidityOutsideX32
        .sub(tickUpper.secondsPerLiquidityOutsideX32),
      secondsInside: tickLower.secondsOutside - tickUpper.secondsOutside,
    }
  } else if (poolState.tick <tickUpper.tick) {
    const { tickCumulative, secondsPerLiquidityCumulativeX32 } = latestObservation.blockTimestamp == time
      ? latestObservation
      : transformObservation({
        observation: latestObservation,
        blockTimestamp: time,
        tick: poolState.tick,
        liquidity: poolState.liquidity
      })

    return {
      tickCumulativeInside: tickCumulative
        .sub(tickLower.tickCumulativeOutside)
        .sub(tickUpper.tickCumulativeOutside),
      secondsPerLiquidityInsideX32: secondsPerLiquidityCumulativeX32
        .sub(tickLower.secondsPerLiquidityOutsideX32)
        .sub(tickUpper.secondsPerLiquidityOutsideX32),
      secondsInside: time - tickLower.secondsOutside - tickUpper.secondsOutside
    }
  } else {
    return {
      tickCumulativeInside: tickUpper.tickCumulativeOutside
        .sub(tickLower.tickCumulativeOutside),
      secondsPerLiquidityInsideX32: tickUpper.secondsPerLiquidityOutsideX32
        .sub(tickLower.secondsPerLiquidityOutsideX32),
      secondsInside: tickUpper.secondsOutside - tickLower.secondsOutside,
    }
  }
}