import { describe, expect, it } from 'vitest';

import { type BaselineEntry, type ContractBaseline, type ContractVariant, parseBaseline } from '../src/baseline-format';
import { COMMITTED_BASELINE } from '../src/evaluated';
import { type Correction, PERMITTED_FIELDS, PERMITTED_REPORT_FORMAT_V1, type PermittedField, type PermittedResult, permittedReport, permittedResult } from '../src/permitted';
import { PROMPTS } from '../src/prompts';
import { type FieldTally, ZERO_TALLY, zeroTallies } from '../src/tally';
import { type Baseline, recordPermitted, reportSha256 } from './baseline';

/**
 * Recording the in-boundary permitted run on a real provider's pending contract entries (F5 (a), session
 * ruling 9; docs/adr/0070, Part 2), and the served history that ties every later run to what is served
 * (the PR review's B1, M1, M3 and S1, N3 and N4). SYNTHETIC entries and reports only: the local entry's
 * counts under Bedrock's pinned models, and reports of synthetic example and run IDs.
 */

const local = COMMITTED_BASELINE.entries.find((entry): entry is ContractBaseline => entry.purpose === 'proposeContractTerms');
if (local === undefined) {
  throw new Error('the committed baseline holds the local contract entry');
}
const E1 = '00000000-0000-4000-8000-0000000000e1';
const E2 = '00000000-0000-4000-8000-0000000000e2';
const E3 = '00000000-0000-4000-8000-0000000000e3';
const RUN_1 = '00000000-0000-4000-8000-0000000000c1';
const RUN_2 = '00000000-0000-4000-8000-0000000000c2';
const RUN_3 = '00000000-0000-4000-8000-0000000000c3';
const DOCUMENT = '00000000-0000-4000-8000-0000000000d1';
const ON = '2026-10-27';
const prompt = PROMPTS.proposeContractTerms;

const pending = (variant: ContractVariant, permitted: ContractBaseline['permitted'] = 'pending'): ContractBaseline => ({
  ...local,
  provider: 'bedrock',
  model_id: prompt.models.bedrock[variant] ?? '',
  variant,
  permitted,
});
const withEntries = (...entries: BaselineEntry[]): Baseline => parseBaseline({ ...COMMITTED_BASELINE, entries: [...COMMITTED_BASELINE.entries, ...entries] });
const both = () => withEntries(pending('default'), pending('ambiguous'));
const text = (value: unknown) => ({ text: `${JSON.stringify(value, null, 2)}\n` });

/** A synthetic correction: one fixed-schedule final. */
const correction: Correction = { format: 'tp-eval-correction/1', document_id: DOCUMENT, records: [{ scope: { codes: ['97110'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '4310' } }] };
/** An example the model was called for and answered nothing usable on (invalid_output): measured, every final missed. */
const answered = (id: string, variant: ContractVariant = 'default') => permittedResult(id, correction, { proposal: null, problem: 'invalid_output' }, variant);
/** An example whose outcome is the problem given (no correction read). */
const problem = (id: string, code: string, variant: ContractVariant = 'default') => permittedResult(id, null, { proposal: null, problem: code }, variant);
/** An example measured with the amount tallied as given and every other field empty. */
const amount = (id: string, variant: ContractVariant, tally: Partial<FieldTally>): PermittedResult => ({
  exampleId: id,
  counts: { ...zeroTallies<PermittedField>(PERMITTED_FIELDS), amount: { ...ZERO_TALLY, ...tally } },
  problem: null,
  legacy: false,
  uncitedFinals: 0,
  variant,
});
const report = (results: readonly PermittedResult[], options: { readonly runId?: string; readonly production?: boolean; readonly provider?: 'bedrock' | 'anthropic' } = {}) =>
  permittedReport(options.provider ?? 'bedrock', 1, results, { runId: options.runId ?? RUN_2, production: options.production ?? true });
const permittedOf = (baseline: Baseline) => baseline.entries.filter((entry) => entry.provider === 'bedrock').map((entry) => (entry.purpose === 'proposeContractTerms' ? [entry.variant, entry.permitted] : null));
/** The entries put back to pending, as eval --record of the same prompt version and model does (a version change's new entries start pending too). */
const repended = (baseline: Baseline): Baseline =>
  parseBaseline({ ...baseline, entries: baseline.entries.map((entry) => (entry.purpose === 'proposeContractTerms' && entry.provider === 'bedrock' ? { ...entry, permitted: 'pending' } : entry)) });
/** A first run recorded on both variants, then every entry put back to pending: a provider with served history and nothing served now. */
function servedThenRepended(first = report([answered(E1), answered(E2, 'ambiguous')], { runId: RUN_1 })) {
  const firstText = text(first);
  return { firstText, baseline: repended(recordPermitted(both(), firstText, null, '2026-10-20').baseline) };
}

describe('record-permitted', () => {
  it('writes each variant’s example count and both reports’ hashes into its own entry, and keeps the served history', () => {
    const run = text(report([answered(E1), answered(E2, 'ambiguous')]));
    const first = recordPermitted(both(), run, null, ON);
    expect(first.variants).toEqual(['default', 'ambiguous']);
    expect(first.pending).toEqual([]);
    const recorded = { examples: 1, report_sha256: reportSha256(run.text), against_sha256: null, recorded_on: ON };
    expect(permittedOf(first.baseline)).toEqual([
      ['default', recorded],
      ['ambiguous', recorded],
    ]);
    expect(first.baseline.served).toEqual({
      bedrock: {
        default: { prompt_version: prompt.id, prompt_sha256: prompt.sha256, model_id: prompt.models.bedrock.default, ...recorded },
        ambiguous: { prompt_version: prompt.id, prompt_sha256: prompt.sha256, model_id: prompt.models.bedrock.ambiguous, ...recorded },
      },
    });
    // The local entries are untouched; nothing of the report but its counts and hash is kept.
    expect(first.baseline.entries.filter((entry) => entry.provider === 'local')).toEqual(COMMITTED_BASELINE.entries);
    expect(JSON.stringify(first.baseline)).not.toContain('invalid_output');
    expect(JSON.stringify(first.baseline)).not.toContain(RUN_2);
  });

  it('records a run with no examples at all (before the first practice) on every entry, as a production run only (review N4)', () => {
    expect(recordPermitted(both(), text(report([])), null, ON).variants).toEqual(['default', 'ambiguous']);
    expect(() => recordPermitted(both(), text(report([], { production: false })), null, ON)).toThrow(/production.*nothing is recorded/);
    expect(() => recordPermitted(both(), text(report([answered(E1)], { production: false })), null, ON)).toThrow(/production.*nothing is recorded/);
  });

  it('refuses a report that is not /2 as the run wrote it, of a local or unknown provider, or of another prompt or other models', () => {
    const baseline = withEntries(pending('default'));
    const good = report([]);
    for (const bad of [
      { format: PERMITTED_REPORT_FORMAT_V1, examples: 0 },
      { ...good, spliced: true },
      { ...good, provider: 'local' },
      { ...good, provider: 'synthetic' },
      { ...good, promptSha256: '0'.repeat(64) },
      { ...good, promptVersion: 'propose-contract-terms/0' },
      { ...good, variants: { ...good.variants, ambiguous: { ...good.variants.ambiguous, modelId: prompt.models.bedrock.default } } },
      { ...good, runId: 'run-1' },
    ]) {
      expect(() => recordPermitted(baseline, text(bad), null, ON), JSON.stringify(bad).slice(0, 60)).toThrow(/nothing is recorded/);
    }
    expect(() => recordPermitted(baseline, { text: 'not json' }, null, ON)).toThrow(/tp-model-eval-permitted\/2/);
    // No entry for the run's provider: the synthetic run is recorded first.
    expect(() => recordPermitted(baseline, text(report([], { provider: 'anthropic' })), null, ON)).toThrow(/record the synthetic run first/);
  });

  it('refuses a report whose counts do not add up: edited, or spliced from runs (review N3)', () => {
    const good = report([answered(E1), answered(E2, 'ambiguous'), problem(E3, 'refused:document_kind')]);
    expect(recordPermitted(both(), text(good), null, ON).variants).toEqual(['default', 'ambiguous']);
    const { default: first, ambiguous } = good.variants;
    for (const bad of [
      { ...good, examples: 4 },
      { ...good, exampleIds: [E1, E2] },
      { ...good, exampleIds: [E2, E1, E3] },
      { ...good, exampleIds: [E1, E1, E3] },
      { ...good, refused: 0 },
      { ...good, measured: 3 },
      { ...good, total: { ...good.total, tp: good.total.tp + 1 } },
      { ...good, fields: { ...good.fields, amount: { ...good.fields.amount, missed: 0 } } },
      { ...good, problems: [...good.problems, { exampleId: E1, problem: 'refused:document_kind' }] },
      { ...good, problems: good.problems.filter((entry) => entry.exampleId !== E3) },
      { ...good, variants: { default: { ...first, exampleIds: [E1, E2, E3] }, ambiguous } },
      { ...good, variants: { default: { ...first, total: ZERO_TALLY }, ambiguous } },
      { ...good, variants: { default: first, ambiguous: { ...ambiguous, measured: 0 } } },
      { ...good, legacyUnfiltered: 4 },
    ]) {
      expect(() => recordPermitted(both(), text(bad), null, ON), JSON.stringify(bad).slice(0, 80)).toThrow(/do not add up.*nothing is recorded \(report_inconsistent\)/);
    }
  });

  it('needs --against whenever anything was ever served for the provider: after a re-record or a version change too (review B1)', () => {
    const { baseline } = servedThenRepended();
    const now = text(report([answered(E1), answered(E2, 'ambiguous')]));
    // Nothing is served now (every entry pending), but the provider served before: a run compared with nothing is refused.
    expect(permittedOf(baseline).every((entry) => entry?.[1] === 'pending')).toBe(true);
    expect(() => recordPermitted(baseline, now, null, ON)).toThrow(/give --against/);
    // The served entries deleted, as a version change's pull request deletes them: the history still holds.
    const deleted = parseBaseline({ ...baseline, entries: [...COMMITTED_BASELINE.entries, pending('default'), pending('ambiguous')] });
    expect(() => recordPermitted(deleted, now, null, ON)).toThrow(/give --against/);
    // An entry served with no history kept (the history deleted by hand) counts as served too.
    const unrecorded = withEntries(pending('default', { examples: 1, report_sha256: 'b'.repeat(64), against_sha256: null, recorded_on: '2026-10-20' }), pending('ambiguous'));
    expect(() => recordPermitted(unrecorded, now, null, ON)).toThrow(/give --against/);
  });

  it('ties --against to what was served: the same provider, a production run of the served prompt and models, another run (review M1)', () => {
    const { firstText, baseline } = servedThenRepended();
    const now = text(report([answered(E1), answered(E2, 'ambiguous')]));
    // The report compared with itself, or with the same run written again.
    expect(() => recordPermitted(baseline, now, now, ON)).toThrow(/against_is_report/);
    expect(() => recordPermitted(baseline, now, { text: now.text.trim() }, ON)).toThrow(/against_same_run/);
    // Another provider's run, a run outside production, and a run of models or a prompt that was not served.
    const first = JSON.parse(firstText.text) as ReturnType<typeof report>;
    expect(() => recordPermitted(baseline, now, text({ ...first, provider: 'anthropic' }), ON)).toThrow(/against_provider/);
    expect(() => recordPermitted(baseline, now, text({ ...first, production: false }), ON)).toThrow(/against_not_production/);
    const otherModel = { ...first, variants: { ...first.variants, default: { ...first.variants.default, modelId: 'synthetic-weaker-model' } } };
    expect(() => recordPermitted(baseline, now, text(otherModel), ON)).toThrow(/against_not_served:default\)/);
    expect(() => recordPermitted(baseline, now, text({ ...first, promptSha256: '0'.repeat(64) }), ON)).toThrow(/against_not_served:default, against_not_served:ambiguous/);
    // The served run itself, compared: recorded, naming both reports, and the history moves to the new run.
    const recorded = recordPermitted(baseline, now, firstText, ON);
    expect(recorded.variants).toEqual(['default', 'ambiguous']);
    expect(recorded.baseline.served?.bedrock?.default).toMatchObject({ report_sha256: reportSha256(now.text), against_sha256: reportSha256(firstText.text), recorded_on: ON });
    // A rerun of what is served on today's examples (another production run of the served prompt and models) is accepted too.
    const rerun = text(report([answered(E1), answered(E2, 'ambiguous')], { runId: RUN_3 }));
    expect(recordPermitted(baseline, now, rerun, ON).variants).toEqual(['default', 'ambiguous']);
  });

  it('refuses any regression against the served run, variant by variant', () => {
    const { firstText, baseline } = servedThenRepended();
    // Another set of examples of the same size is not the same run (review m7); a /1 earlier report is refused whole.
    expect(() => recordPermitted(baseline, text(report([answered(E3), answered(E2, 'ambiguous')])), firstText, ON)).toThrow(/examples_changed/);
    expect(() => recordPermitted(baseline, text(report([answered(E1), answered(E2, 'ambiguous')])), text({ format: PERMITTED_REPORT_FORMAT_V1, examples: 2 }), ON)).toThrow(/earlier_report_format/);
    expect(() => recordPermitted(baseline, text(report([answered(E1), answered(E2, 'ambiguous')])), { text: '{}' }, ON)).toThrow(/earlier_report_invalid/);
    // A refusal the served run did not have regresses, though that variant measured nothing and would not be recorded.
    expect(() => recordPermitted(baseline, text(report([answered(E1), problem(E2, 'refused:document_kind', 'ambiguous')])), firstText, ON)).toThrow(/refused_rose:ambiguous/);
  });

  it('never lets one variant’s gain hide the other’s regression, and records a variant only on its own examples (review M3)', () => {
    // Served: the default model got the amount wrong but verified, the ambiguous model right. Now the reverse:
    // the totals are equal, but the ambiguous model got worse on real corrections.
    const servedRun = report([amount(E1, 'default', { wrong: 1 }), amount(E2, 'ambiguous', { tp: 1 })], { runId: RUN_1 });
    const { firstText, baseline } = servedThenRepended(servedRun);
    const masked = report([amount(E1, 'default', { tp: 1 }), amount(E2, 'ambiguous', { wrong: 1 })]);
    expect(masked.total).toEqual(servedRun.total);
    expect(() => recordPermitted(baseline, text(masked), firstText, ON)).toThrow(/wrong_verified_rose:ambiguous:amount/);
    // A run with no ambiguous example records the default entry only; the ambiguous one stays pending, and says why.
    const defaultOnly = recordPermitted(both(), text(report([answered(E1)])), null, ON);
    expect(defaultOnly.variants).toEqual(['default']);
    expect(defaultOnly.pending).toEqual([{ variant: 'ambiguous', reason: 'no_examples' }]);
    expect(permittedOf(defaultOnly.baseline)).toEqual([
      ['default', expect.objectContaining({ examples: 1 }) as unknown],
      ['ambiguous', 'pending'],
    ]);
    expect(Object.keys(defaultOnly.baseline.served?.bedrock ?? {})).toEqual(['default']);
    // A variant whose examples were all outside the model (unreadable documents) is not recorded on them either.
    const unread = recordPermitted(both(), text(report([answered(E1), problem(E2, 'document_unavailable', 'ambiguous')])), null, ON);
    expect(unread.pending).toEqual([{ variant: 'ambiguous', reason: 'nothing_measured' }]);
  });

  it('refuses a run that did not measure the model for every example: only outcomes on the list are kept (review S1)', () => {
    const { firstText, baseline: served } = servedThenRepended();
    for (const code of ['call_failed:timeout', 'refused:kill_switch', 'refused:feature_off', 'refused:not_evaluated', 'refused:phi_boundary', 'refused:screen_unavailable', 'refused:input_invalid', 'budget_exceeded', 'busy', 'serving_invalid', 'something_new']) {
      const run = text(report([answered(E1), problem(E2, code, 'ambiguous')]));
      expect(() => recordPermitted(both(), run, null, ON), code).toThrow(new RegExp(`nothing is recorded \\(${code}\\)`));
      expect(() => recordPermitted(served, run, firstText, ON), code).toThrow(new RegExp(`nothing is recorded \\(${code}\\)`));
    }
    // Every example outside the model (each a refusal on the input's own merits, or unreadable): nothing was measured.
    const none = text(report([problem(E1, 'refused:document_kind'), problem(E2, 'expected_invalid', 'ambiguous')]));
    expect(() => recordPermitted(both(), none, null, ON)).toThrow(/no example reached the model/);
    // A refusal on the input's own merits beside measured examples is counted, not a reason to refuse: a rerun would refuse it again.
    const kind = text(report([answered(E1), answered(E2, 'ambiguous'), problem(E3, 'refused:document_kind')]));
    expect(recordPermitted(both(), kind, null, ON).variants).toEqual(['default', 'ambiguous']);
  });

  it('compares an earlier report whenever one is given, before anything is served', () => {
    const baseline = withEntries(pending('default'));
    expect(() => recordPermitted(baseline, text(report([answered(E1)])), text(report([answered(E2)], { runId: RUN_1 })), ON)).toThrow(/examples_changed/);
  });
});
