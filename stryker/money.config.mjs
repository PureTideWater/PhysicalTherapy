// @ts-check
import { packageOptions } from './base.mjs';

/**
 * Mutation testing of the money package (packages/money: cents, decimals and rounding), every source file, against its
 * own unit tests (stryker/base.mjs MUTATE.money, vitest.mutation.config.ts TEST_SETS.money).
 * `pnpm stryker run stryker/money.config.mjs` reports to reports/mutation/money.json.
 */
export default packageOptions('money');
