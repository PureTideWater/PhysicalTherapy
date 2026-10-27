// @ts-check
import { packageOptions } from './base.mjs';

/**
 * Mutation testing of the packets package: the verifier, the reading of a narrative it rests on, and the packet's
 * arithmetic (interest, calculation, dates, windows and assembly), against the package's unit tests (stryker/base.mjs
 * MUTATE.packets, vitest.mutation.config.ts TEST_SETS.packets).
 * `pnpm stryker run stryker/packets.config.mjs` reports to reports/mutation/packets.json.
 */
export default packageOptions('packets');
