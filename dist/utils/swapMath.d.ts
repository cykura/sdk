import JSBI from 'jsbi';
import { FeeAmount } from '../constants';
export declare abstract class SwapMath {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static computeSwapStep(sqrtRatioCurrentX32: JSBI, sqrtRatioTargetX32: JSBI, liquidity: JSBI, amountRemaining: JSBI, feePips: FeeAmount): [JSBI, JSBI, JSBI, JSBI];
}
