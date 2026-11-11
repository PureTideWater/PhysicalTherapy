import { appendFileSync } from 'node:fs';

import fc from 'fast-check';
import { expect, it } from 'vitest';

it('shows the global seed and a sample drawn with it', () => {
  appendFileSync('/home/user/work/tests-scratch/seed/probe.out', `FC_SEED=${process.env.FC_SEED ?? ''} global ${JSON.stringify(fc.readConfigureGlobal())} sample ${JSON.stringify(fc.sample(fc.nat(), 3))} ${import.meta.resolve('fast-check')}\n`);
  expect(true).toBe(true);
});
