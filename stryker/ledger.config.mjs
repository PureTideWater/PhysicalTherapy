// @ts-check
import { packageOptions } from './base.mjs';

/**
 * Mutation testing of the ledger (packages/ledger), every source file, against its own unit tests (stryker/base.mjs
 * MUTATE.ledger, vitest.mutation.config.ts TEST_SETS.ledger).
 * `pnpm stryker run stryker/ledger.config.mjs` reports to reports/mutation/ledger.json.
 */
export default packageOptions('ledger');
