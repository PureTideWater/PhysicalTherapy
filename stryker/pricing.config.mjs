// @ts-check
import { packageOptions } from './base.mjs';

/**
 * Mutation testing of the pricing engine (packages/pricing), every source file but its test helper testing.ts, against
 * its unit tests and the golden engine tests (stryker/base.mjs MUTATE.pricing, vitest.mutation.config.ts
 * TEST_SETS.pricing). `pnpm stryker run stryker/pricing.config.mjs` reports to reports/mutation/pricing.json.
 */
export default packageOptions('pricing');
