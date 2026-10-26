import { TRUTH_FIELDS } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { BASELINE_FIELDS, BASELINE_FORMAT, CONTRACT_VARIANTS, type ContractBaseline, type NarrativeBaseline, parseBaseline } from './baseline-format';
import { PROMPTS } from './prompts';
import { PROVIDER_KINDS } from './provider';
import { ZERO_TALLY } from './tally';

/** The strict baseline format (docs/adr/0070, Part 1): an entry the gate never writes does not parse. Synthetic counts only. */

const HASH = 'a'.repeat(64);

const contract: ContractBaseline = {
  purpose: 'proposeContractTerms',
  prompt_version: PROMPTS.proposeContractTerms.id,
  prompt_sha256: HASH,
  provider: 'local',
  model_id: 'local-deterministic',
  variant: 'default',
  set_sha256: HASH,
  cases: 63,
  fields: Object.fromEntries(BASELINE_FIELDS.map((field) => [field, { ...ZERO_TALLY, tp: 1 }])) as ContractBaseline['fields'],
  total: { ...ZERO_TALLY, tp: BASELINE_FIELDS.length },
  faithful_wrong_verified: 0,
  conflicts: { expected: 4, unflagged: 0 },
  twins: { pairs: 3, differing: 0 },
  report_sha256: HASH,
  recorded_on: '2026-10-26',
};

const narrative: NarrativeBaseline = {
  purpose: 'draftPacketNarrative',
  prompt_version: PROMPTS.draftPacketNarrative.id,
  prompt_sha256: HASH,
  provider: 'local',
  model_id: 'local-deterministic',
  set_sha256: HASH,
  cases: 300,
  failures: 0,
  report_sha256: HASH,
  recorded_on: '2026-10-26',
};

const baseline = (entries: readonly unknown[]) => ({ format: BASELINE_FORMAT, synthetic: true, note: 'SYNTHETIC', entries });
const parses = (entry: unknown) => {
  try {
    parseBaseline(baseline([entry]));
    return true;
  } catch {
    return false;
  }
};

describe('the baseline format', () => {
  it('names the synthetic set’s truth fields and the prompt’s contract variants', () => {
    expect([...BASELINE_FIELDS]).toEqual([...TRUTH_FIELDS]);
    // Every variant a provider pins is one an entry can name (the local provider pins the default only).
    for (const provider of PROVIDER_KINDS) {
      const variants = Object.keys(PROMPTS.proposeContractTerms.models[provider]);
      expect(variants).toContain('default');
      expect(variants.every((variant) => (CONTRACT_VARIANTS as readonly string[]).includes(variant)), provider).toBe(true);
    }
  });

  it('reads a contract and a narrative entry as the gate writes them, and a permitted record on a contract entry', () => {
    expect(parseBaseline(baseline([contract, narrative])).entries).toEqual([contract, narrative]);
    expect(parses({ ...contract, permitted: 'pending' })).toBe(true);
    expect(parses({ ...contract, permitted: { examples: 12, report_sha256: HASH, against_sha256: null, recorded_on: '2026-10-26' } })).toBe(true);
  });

  it('refuses an entry carrying a dangerous count: wrong but verified on a faithful case, an unflagged conflict, a differing twin', () => {
    expect(parses({ ...contract, faithful_wrong_verified: 1 })).toBe(false);
    expect(parses({ ...contract, conflicts: { expected: 4, unflagged: 1 } })).toBe(false);
    expect(parses({ ...contract, twins: { pairs: 3, differing: 1 } })).toBe(false);
    expect(parses({ ...narrative, failures: 1 })).toBe(false);
  });

  it('refuses an entry for a purpose with no set, one with a key the gate does not write, and one in the old counts', () => {
    expect(parses({ ...narrative, purpose: 'suggestEvidenceRequests' })).toBe(false);
    expect(parses({ ...narrative, purpose: 'readDenialLetter' })).toBe(false);
    expect(parses({ ...contract, served: true })).toBe(false);
    expect(parses({ ...contract, total: { tp: 1, fp: 0, fn: 0 } })).toBe(false);
    expect(parses({ ...contract, fields: { ...contract.fields, amount: { ...ZERO_TALLY, tp: -1 } } })).toBe(false);
    expect(parses({ ...contract, fields: { ...contract.fields, amount: { ...ZERO_TALLY, tp: 1 / 2 } } })).toBe(false);
  });

  it('refuses an entry with no variant, an unknown variant, no report or an unknown provider, and the format before it', () => {
    const { variant: _variant, ...unvaried } = contract;
    const { report_sha256: _report, ...unreported } = contract;
    expect(parses(unvaried)).toBe(false);
    expect(parses({ ...contract, variant: 'large' })).toBe(false);
    expect(parses(unreported)).toBe(false);
    expect(parses({ ...contract, provider: 'other' })).toBe(false);
    expect(() => parseBaseline({ ...baseline([contract]), format: 'tp-model-eval-baseline/2' })).toThrow();
    expect(() => parseBaseline({ ...baseline([contract]), synthetic: false })).toThrow();
  });
});
