import { describe, expect, it } from 'vitest';

import { type BaselineEntry, type ContractBaseline, parseBaseline } from '../src/baseline-format';
import { COMMITTED_BASELINE } from '../src/evaluated';
import { PERMITTED_REPORT_FORMAT_V1, permittedReport, permittedResult } from '../src/permitted';
import { PROMPTS } from '../src/prompts';
import { type Baseline, recordPermitted, reportSha256 } from './baseline';

/**
 * Recording the in-boundary permitted run on a real provider's pending contract entries (F5 (a), session
 * ruling 9; docs/adr/0070, Part 2). SYNTHETIC entries and reports only: the local entry's counts under
 * Bedrock's pinned models, and reports of synthetic example IDs.
 */

const local = COMMITTED_BASELINE.entries.find((entry): entry is ContractBaseline => entry.purpose === 'proposeContractTerms');
if (local === undefined) {
  throw new Error('the committed baseline holds the local contract entry');
}
const E1 = '00000000-0000-4000-8000-0000000000e1';
const E2 = '00000000-0000-4000-8000-0000000000e2';

const pending = (variant: 'default' | 'ambiguous', permitted: ContractBaseline['permitted'] = 'pending'): ContractBaseline => ({
  ...local,
  provider: 'bedrock',
  model_id: PROMPTS.proposeContractTerms.models.bedrock[variant] ?? '',
  variant,
  permitted,
});
const withEntries = (...entries: BaselineEntry[]): Baseline => parseBaseline({ ...COMMITTED_BASELINE, entries: [...COMMITTED_BASELINE.entries, ...entries] });
const text = (value: unknown) => ({ text: `${JSON.stringify(value, null, 2)}\n` });
/** A run's report on the examples given, each proposing nothing (an expectation that did not parse). */
const run = (ids: readonly string[], provider: 'bedrock' | 'anthropic' = 'bedrock') => permittedReport(provider, 1, ids.map((id) => permittedResult(id, null, { proposal: null, problem: 'expected_invalid' })));
const permittedOf = (baseline: Baseline) => baseline.entries.filter((entry) => entry.provider === 'bedrock').map((entry) => (entry.purpose === 'proposeContractTerms' ? [entry.variant, entry.permitted] : null));

describe('record-permitted', () => {
  it('writes the run’s example count and both reports’ hashes into every pending entry of its provider, prompt and models', () => {
    const baseline = withEntries(pending('default'), pending('ambiguous'));
    const report = text(run([]));
    const first = recordPermitted(baseline, report, null, '2026-10-27');
    expect(first.variants).toEqual(['default', 'ambiguous']);
    const recorded = { examples: 0, report_sha256: reportSha256(report.text), against_sha256: null, recorded_on: '2026-10-27' };
    expect(permittedOf(first.baseline)).toEqual([
      ['default', recorded],
      ['ambiguous', recorded],
    ]);
    // The local entries are untouched; nothing of the report but its count and hash is kept.
    expect(first.baseline.entries.filter((entry) => entry.provider === 'local')).toEqual(COMMITTED_BASELINE.entries);
    expect(JSON.stringify(first.baseline)).not.toContain('expected_invalid');
  });

  it('refuses a report that is not /2 as the run wrote it, of a local or unknown provider, or of another prompt or other models', () => {
    const baseline = withEntries(pending('default'));
    const good = run([]);
    for (const bad of [
      { format: PERMITTED_REPORT_FORMAT_V1, examples: 0 },
      { ...good, spliced: true },
      { ...good, provider: 'local', modelIds: ['local-deterministic'] },
      { ...good, provider: 'synthetic' },
      { ...good, promptSha256: '0'.repeat(64) },
      { ...good, promptVersion: 'propose-contract-terms/0' },
      { ...good, modelIds: [PROMPTS.proposeContractTerms.models.bedrock.default] },
    ]) {
      expect(() => recordPermitted(baseline, text(bad), null, '2026-10-27'), JSON.stringify(bad).slice(0, 60)).toThrow(/nothing is recorded/);
    }
    expect(() => recordPermitted(baseline, { text: 'not json' }, null, '2026-10-27')).toThrow(/tp-model-eval-permitted\/2/);
    // No entry for the run's provider: the synthetic run is recorded first.
    expect(() => recordPermitted(baseline, text(run([], 'anthropic')), null, '2026-10-27')).toThrow(/record the synthetic run first/);
  });

  it('needs --against once the provider serves contracts on a recorded run, and refuses any regression against it', () => {
    const served = { examples: 1, report_sha256: 'b'.repeat(64), against_sha256: null, recorded_on: '2026-10-20' };
    const baseline = withEntries(pending('default', served), pending('ambiguous'));
    const now = text(run([E1]));
    expect(() => recordPermitted(baseline, now, null, '2026-10-27')).toThrow(/give --against/);
    // Another set of examples of the same size is not the same run (review m7); a /1 earlier report is refused whole.
    expect(() => recordPermitted(baseline, now, text(run([E2])), '2026-10-27')).toThrow(/examples_changed/);
    expect(() => recordPermitted(baseline, now, text({ format: PERMITTED_REPORT_FORMAT_V1, examples: 1 }), '2026-10-27')).toThrow(/earlier_report_format/);
    expect(() => recordPermitted(baseline, now, { text: '{}' }, '2026-10-27')).toThrow(/earlier_report_invalid/);
    // A refusal the earlier run did not have regresses.
    const refused = text(permittedReport('bedrock', 1, [permittedResult(E1, null, { proposal: null, problem: 'refused:document_kind' })]));
    expect(() => recordPermitted(baseline, refused, now, '2026-10-27')).toThrow(/refused_rose/);
    // The same examples, nothing worse: recorded, naming both reports.
    const against = text(run([E1]));
    const recorded = recordPermitted(baseline, now, against, '2026-10-27');
    expect(permittedOf(recorded.baseline)).toEqual([
      ['default', { examples: 1, report_sha256: reportSha256(now.text), against_sha256: reportSha256(against.text), recorded_on: '2026-10-27' }],
      ['ambiguous', { examples: 1, report_sha256: reportSha256(now.text), against_sha256: reportSha256(against.text), recorded_on: '2026-10-27' }],
    ]);
  });

  it('refuses a run that did not reach the model for every example: a failed call, or the feature or its variant off', () => {
    const baseline = withEntries(pending('default'), pending('ambiguous'));
    for (const problem of ['call_failed:timeout', 'refused:kill_switch', 'refused:feature_off', 'refused:not_evaluated']) {
      const report = text(permittedReport('bedrock', 1, [permittedResult(E1, null, { proposal: null, problem: 'expected_invalid' }), permittedResult(E2, null, { proposal: null, problem })]));
      expect(() => recordPermitted(baseline, report, null, '2026-10-27'), problem).toThrow(new RegExp(`nothing is recorded \\(${problem}\\)`));
    }
    // A refusal on the input's own merits is counted, not a reason to refuse the record: a rerun would refuse it again.
    const kind = text(permittedReport('bedrock', 1, [permittedResult(E1, null, { proposal: null, problem: 'refused:document_kind' })]));
    expect(recordPermitted(baseline, kind, null, '2026-10-27').variants).toEqual(['default', 'ambiguous']);
  });

  it('compares an earlier report whenever one is given, before anything is served', () => {
    const baseline = withEntries(pending('default'));
    expect(() => recordPermitted(baseline, text(run([E1])), text(run([E2])), '2026-10-27')).toThrow(/examples_changed/);
  });
});
