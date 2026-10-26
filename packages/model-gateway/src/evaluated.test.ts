import { describe, expect, it } from 'vitest';

import baselineFile from '../eval/baseline.json' with { type: 'json' };
import { GatewayConfigError } from './errors';
import { COMMITTED_BASELINE, committedBaseline } from './evaluated';

/**
 * How production reads the committed baseline (review m4): at import, strictly, and a file that does not
 * parse is a GatewayConfigError naming it, never a gateway that starts with every feature quietly off.
 * Synthetic content only: the committed file and edits of it.
 */
describe('the committed baseline as production reads it', () => {
  it('is the committed file, parsed once at import', () => {
    expect(committedBaseline(baselineFile)).toEqual(COMMITTED_BASELINE);
  });

  it('fails loudly and closed on a file that does not parse: a duplicate key, a format before it, an entry the gate never writes', () => {
    const [first] = COMMITTED_BASELINE.entries;
    const broken = [
      { ...COMMITTED_BASELINE, entries: [...COMMITTED_BASELINE.entries, first] },
      { ...COMMITTED_BASELINE, format: 'tp-model-eval-baseline/3' },
      { ...COMMITTED_BASELINE, entries: [{ ...first, faithful_wrong_verified: 1 }] },
      'not a baseline',
    ];
    for (const value of broken) {
      expect(() => committedBaseline(value)).toThrow(GatewayConfigError);
      expect(() => committedBaseline(value)).toThrow(/eval\/baseline\.json does not parse/);
    }
  });
});
