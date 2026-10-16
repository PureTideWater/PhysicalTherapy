import { normalizePageText, quoteOnPage } from '@tp/contracts';
import { identifierForms } from '@tp/packets';
import { TRUTH_FIELDS } from '@tp/synth';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ModelProvider } from '../src/provider';
import { LocalDeterministicProvider } from '../src/providers/local';
import { MemoryModelCallStore } from '../src/store';
import { BASELINE_PATH, type Baseline, gate, readBaseline } from './baseline';
import { addFigure, dropCitation, dropFact, dropField, misquote, wrongValue } from './faults';
import { type EvaluationReport, runEvaluation } from './harness';
import { registerReferences } from './reference';
import { precision, recall } from './score';
import { type LoadedContractSet, type LoadedNarrativeSet, loadContractSet, loadNarrativeSet, truthFields } from './sets';

/**
 * The model gate in CI (PRD 14, Logging and evaluation; PRD 18, Layers: Model; test matrix MOD-01 and
 * MOD-03; docs/adr/0050), in the golden project that `pnpm test:golden` runs.
 *
 * CI has no model: the gateway runs here on the local deterministic provider, which answers each case
 * with its reference answer (./reference.ts). That proves the whole path a model's answer takes, from
 * the pages intake reads (pdf.js, the CSV reader, the scan reader's recording) through the framing,
 * the schema, the verifiers and the scoring to the committed baseline, and it proves the gate fails
 * when an answer drops a field, misquotes, writes a wrong figure or leaves a fact out. It does not
 * measure a model: that run needs a model, with ./cli.ts --provider configured, where one can be
 * called, before a prompt or model change ships.
 */

let contracts: LoadedContractSet;
let narratives: LoadedNarrativeSet;
let baseline: Baseline;
let reference: LocalDeterministicProvider;
let report: EvaluationReport;
let store: MemoryModelCallStore;

beforeAll(async () => {
  contracts = await loadContractSet();
  narratives = loadNarrativeSet();
  baseline = readBaseline();
  reference = registerReferences(new LocalDeterministicProvider(), contracts.cases, narratives.cases);
  store = new MemoryModelCallStore({ actor: { kind: 'evaluation' } });
  report = await runEvaluation({ provider: reference, contracts, narratives, store });
}, 180_000);

describe('the synthetic contract set (MOD-01)', () => {
  it('holds 40 contracts and exhibits in three layouts, every one SYNTHETIC', () => {
    expect(contracts.cases).toHaveLength(40);
    const layouts = contracts.cases.map((item) => item.layout);
    expect({ table: layouts.filter((layout) => layout === 'table').length, prose: layouts.filter((layout) => layout === 'prose').length, scanned: layouts.filter((layout) => layout === 'scanned').length }).toEqual({
      table: 14,
      prose: 13,
      scanned: 13,
    });
    expect(new Set(contracts.cases.map((item) => item.truth.kind))).toEqual(new Set(['contract', 'exhibit']));
    expect(new Set(contracts.cases.map((item) => item.truth.contentType))).toEqual(new Set(['application/pdf', 'text/csv']));
    expect(new Set(contracts.cases.flatMap((item) => item.truth.records.map((record) => record.fields.method?.value)))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT']));
    for (const item of contracts.cases) {
      expect(item.truth.synthetic).toBe(true);
      expect(item.input.pages.join(' '), item.id).toContain('SYNTHETIC');
    }
  });

  it('scans have no text layer: the text reader finds nothing, and the pages come from the scan reader’s recording', () => {
    for (const item of contracts.cases) {
      expect(item.textless, item.id).toBe(item.layout === 'scanned');
      expect(item.truth.scan !== null, item.id).toBe(item.layout === 'scanned');
      expect(item.input.pages.every((page) => normalizePageText(page) !== ''), item.id).toBe(true);
      expect(item.input.pages, item.id).toHaveLength(item.truth.pages);
    }
  });

  it('every true field is quoted from its own page as intake reads it, and the quote holds what the field is written as', () => {
    let fields = 0;
    for (const item of contracts.cases) {
      for (const { field, value } of truthFields(item.truth)) {
        fields += 1;
        expect(quoteOnPage(value.quote, item.input.pages[value.page - 1] ?? ''), `${item.id} ${field}`).toBe(true);
        for (const written of value.written === null ? [] : typeof value.written === 'string' ? [value.written] : value.written) {
          expect(normalizePageText(value.quote), `${item.id} ${field}`).toContain(normalizePageText(written));
        }
      }
    }
    expect(fields).toBe(742);
  });
});

describe('the synthetic narrative set (MOD-03)', () => {
  it('holds 300 pattern statements over every method, with no identifier in what a model is given', () => {
    expect(narratives.cases).toHaveLength(300);
    expect(new Set(narratives.cases.map((item) => item.method))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'MA_NONCONTRACTED']));
    for (const item of narratives.cases) {
      expect(item.input.identifiers.length, item.id).toBeGreaterThan(0);
      const content = JSON.stringify(item.input.content).toUpperCase();
      for (const form of identifierForms(item.input.identifiers)) {
        expect(content, item.id).not.toContain(form.toUpperCase());
      }
      expect(item.input.content.lines.every((line) => line.patient_name.startsWith('{{patient_name:')), item.id).toBe(true);
      expect(item.required.map((fact) => fact.what), item.id).toEqual(expect.arrayContaining(['shortfall', 'expected', 'observed', 'lines', 'citation', 'line_schedule']));
    }
  });
});

describe('the gate on the local deterministic provider', () => {
  it('scores every field of every document right, with every quote on its page (MOD-01)', () => {
    const scored = report.contracts;
    expect(scored?.cases).toBe(40);
    expect(scored?.total).toEqual({ tp: 742, fp: 0, fn: 0 });
    expect(scored?.quotesOffPage).toBe(0);
    expect(scored?.results.filter((result) => result.problem !== null)).toEqual([]);
    for (const field of TRUTH_FIELDS) {
      const counts = scored?.fields[field];
      expect(counts?.tp, field).toBeGreaterThan(0);
      expect([precision(counts ?? { tp: 0, fp: 1, fn: 0 }), recall(counts ?? { tp: 0, fp: 0, fn: 1 })], field).toEqual([[counts?.tp, counts?.tp], [counts?.tp, counts?.tp]]);
    }
    expect(Object.values(scored?.byLayout ?? {}).every((counts) => counts.fp === 0 && counts.fn === 0 && counts.tp > 0)).toBe(true);
  });

  it('passes all 300 narratives through the packets verifier with every required fact stated: zero critical errors (MOD-03)', () => {
    expect(report.narratives?.cases).toBe(300);
    expect(report.narratives?.failures).toEqual([]);
    expect(report.narratives?.passed).toBe(300);
  });

  it('passes the gate against the committed baseline, which holds exactly this run’s results', () => {
    expect(gate(report, baseline)).toEqual({ passed: true, problems: [], heldTo: expect.objectContaining({ provider: 'local' }) });
    const local = baseline.entries.filter((entry) => entry.provider === 'local');
    expect(local.map((entry) => entry.purpose).sort()).toEqual(['draftPacketNarrative', 'proposeContractTerms']);
    for (const entry of local) {
      if (entry.purpose === 'proposeContractTerms') {
        expect({ set: entry.set_sha256, fields: entry.fields, total: entry.total, prompt: entry.prompt_version }, BASELINE_PATH).toEqual({
          set: report.contracts?.setSha256,
          fields: report.contracts?.fields,
          total: report.contracts?.total,
          prompt: report.contracts?.promptVersion,
        });
      } else {
        expect({ set: entry.set_sha256, cases: entry.cases, prompt: entry.prompt_version }).toEqual({ set: report.narratives?.setSha256, cases: 300, prompt: report.narratives?.promptVersion });
      }
    }
  });

  it('logs every call as a synthetic evaluation call: no practice, hashes and counts only', () => {
    expect(store.calls).toHaveLength(340);
    for (const call of store.calls) {
      expect(call).toMatchObject({ practiceId: null, actorKind: 'evaluation', actorId: null, provider: 'local', outcome: 'completed', verifierPassed: true });
      expect(call.inputHashes.every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true);
    }
  });
});

describe('the gate fails on injected faults', () => {
  const contractsOnly = (provider: ModelProvider) => runEvaluation({ provider, contracts, narratives: null });
  const narrativesOnly = (provider: ModelProvider) => runEvaluation({ provider, contracts: null, narratives });
  /** The first document whose first record states an amount (the faults spoil a document's first candidate). */
  const withAmount = () => new Set([contracts.cases.findIndex((item) => item.truth.records[0]?.fields.amount !== undefined)]);
  const codes = (result: ReturnType<typeof gate>) => result.problems.map((problem) => ('field' in problem ? `${problem.code}:${problem.field}` : problem.code));

  it('a provider that drops one field of one document regresses that field’s recall', async () => {
    const result = gate(await contractsOnly(dropField(reference, 'amount', { calls: withAmount() })), baseline);
    expect(result.passed).toBe(false);
    expect(codes(result)).toEqual(['recall_regressed:all', 'recall_regressed:amount']);
  }, 60_000);

  it('a provider that misquotes one field fails the quote check and regresses precision and recall', async () => {
    const result = gate(await contractsOnly(misquote(reference, 'effective_from', { calls: new Set([4]) })), baseline);
    expect(result.passed).toBe(false);
    expect(codes(result)).toEqual(expect.arrayContaining(['precision_regressed:all', 'recall_regressed:all', 'precision_regressed:effective_from', 'recall_regressed:effective_from', 'quotes_off_page']));
  }, 60_000);

  it('a provider that writes an amount its quote does not hold regresses precision', async () => {
    const result = gate(await contractsOnly(wrongValue(reference, { calls: withAmount() })), baseline);
    expect(result.passed).toBe(false);
    expect(codes(result)).toEqual(expect.arrayContaining(['precision_regressed:all', 'precision_regressed:amount', 'recall_regressed:amount']));
  }, 60_000);

  it('one narrative with a figure not in its inputs fails the zero-tolerance gate', async () => {
    const scored = await narrativesOnly(addFigure(reference, { calls: new Set([17]) }));
    const result = gate(scored, baseline);
    expect(result.passed).toBe(false);
    expect(result.problems).toEqual([{ code: 'narrative_failures', count: 1, cases: [narratives.cases[17]?.id] }]);
    expect(scored.narratives?.failures[0]).toMatchObject({ problems: ['verifier_failed'], mismatches: ['figure_not_in_input'] });
  }, 60_000);

  it('one narrative sentence without its citation fails it', async () => {
    const scored = await narrativesOnly(dropCitation(reference, { calls: new Set([3]) }));
    expect(gate(scored, baseline).passed).toBe(false);
    expect(scored.narratives?.failures).toEqual([expect.objectContaining({ problems: ['verifier_failed'], mismatches: ['sentence_without_citation'] })]);
  }, 60_000);

  it('a narrative that verifies but leaves out the shortfall misses a required fact, and fails', async () => {
    const scored = await narrativesOnly(dropFact(reference, { calls: new Set([0]) }));
    expect(gate(scored, baseline).passed).toBe(false);
    expect(scored.narratives?.failures).toEqual([expect.objectContaining({ problems: ['fact_missing'], mismatches: [] })]);
    expect(scored.narratives?.failures[0]?.missing).toContain('shortfall');
  }, 60_000);

  it('a changed set, or a provider with no recorded baseline, fails until a person records one', () => {
    const changed = { ...report, contracts: report.contracts === null ? null : { ...report.contracts, setSha256: '0'.repeat(64) } };
    expect(gate(changed, baseline).problems).toEqual([{ code: 'set_changed', purpose: 'proposeContractTerms' }]);
    const unrecorded: EvaluationReport = { ...report, provider: 'bedrock' };
    expect(gate(unrecorded, baseline).problems).toEqual([{ code: 'no_baseline', purpose: 'proposeContractTerms', provider: 'bedrock' }]);
  });
});
