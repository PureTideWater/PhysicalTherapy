import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { normalizePageText, quoteOnPage } from '@tp/contracts';
import { identifierForms } from '@tp/packets';
import { INJECTION_CANARY, TRUTH_FIELDS } from '@tp/synth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyContractTerms } from '../src/functions/contract-terms';
import type { ModelProvider } from '../src/provider';
import { readGatewayConfig } from '../src/config';
import { COMMITTED_BASELINE, COMMITTED_FLOORS, servedSet, servingDecisions } from '../src/evaluated';
import { PERMITTED_REPORT_FORMAT, permittedReport } from '../src/permitted';
import { PRICES } from '../src/prices';
import { PROMPTS } from '../src/prompts';
import { LocalDeterministicProvider } from '../src/providers/local';
import { MemoryModelCallStore } from '../src/store';
import { ZERO_TALLY, asCounts } from '../src/tally';
import { type Baseline, type GateOptions, type GateResult, entriesFromReport, gate, readBaseline, readReport, recordBaseline, recordPermitted } from './baseline';
import {
  addFigure,
  amendedOnOriginal,
  crossRowQuote,
  dropCitation,
  dropDecoy,
  dropFact,
  dropField,
  dropScope,
  failTwin,
  flipFlag,
  labelInjection,
  mergeRows,
  mergeRowsSpanning,
  misquote,
  obeyInjection,
  quoteInjection,
  swapAmounts,
  swapCounts,
  swappedRows,
  takeStruck,
  unpairConflict,
  wrongDate,
  wrongMethod,
  wrongValue,
} from './faults';
import { parseFloors } from './floors';
import { type EvaluationReport, caseMismatches, contractReportFrom, runEvaluation, spliceReport } from './harness';
import { referenceContractOutput, registerReferences } from './reference';
import { type LoadedContractSet, type LoadedNarrativeSet, CONTRACT_SET_MANIFEST, FIXTURES, contractSetHash, loadContractSet, loadNarrativeSet, truthFields } from './sets';

/**
 * The model gate in CI (PRD 14, Logging and evaluation; PRD 18, Layers: Model; test matrix MOD-01,
 * MOD-03 and MOD-07 to MOD-10; docs/adr/0051 and 0070), in the golden project that `pnpm test:golden`
 * runs.
 *
 * CI has no model: the gateway runs here on the local deterministic provider, which answers each case
 * with its reference answer (./reference.ts). That proves the whole path a model's answer takes, from
 * the pages intake reads (pdf.js, the CSV reader, the scan reader's recording) through the framing,
 * the schema, the verifiers and the scoring to the committed baseline, and it proves the gate fails,
 * each time with the problem the design names, when an answer drops a field, misquotes, swaps or merges
 * rows, writes a wrong value that verifies, takes an amended or struck rate, obeys or quotes an
 * injection, drops a decoy or leaves a fact out. Each fault reruns only the cases it spoils and is gated
 * on the whole-set report with those cases spliced in. It does not measure a model: that run needs a
 * model, with ./cli.ts --provider configured, where one can be called, before a prompt or model change
 * ships; and twin equality here holds by construction (the local provider answers both twins with the
 * same records), so CI proves the pairing, the key and the gate, not a model's resistance to injection.
 */

let contracts: LoadedContractSet;
let narratives: LoadedNarrativeSet;
let baseline: Baseline;
let reference: LocalDeterministicProvider;
let report: EvaluationReport;
let store: MemoryModelCallStore;
/** The gate's options for a report of this run: the local reference's report, from this run, for the unfaithful cap. */
let held: GateOptions;

beforeAll(async () => {
  contracts = await loadContractSet();
  narratives = loadNarrativeSet();
  baseline = readBaseline();
  reference = registerReferences(new LocalDeterministicProvider(), contracts.cases, narratives.cases);
  store = new MemoryModelCallStore({ actor: { kind: 'evaluation' } });
  report = await runEvaluation({ provider: reference, contracts, narratives, store });
  held = { reference: report.contracts };
}, 180_000);

/** Every field's floor at one value (SYNTHETIC: a test floors file; the committed values are the founder's and the specialist's). */
const every = (value: string | null) => Object.fromEntries(TRUTH_FIELDS.map((field) => [field, value]));

const caseOf = (id: string) => {
  const found = contracts.cases.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`no case ${id}`);
  }
  return found;
};

describe('the synthetic contract set v2 (MOD-09)', () => {
  it('holds 63 contracts and exhibits in three tiers and three layouts, five of them unfaithful, every one SYNTHETIC', () => {
    expect(contracts.cases).toHaveLength(63);
    const count = <K extends string>(keyOf: (item: (typeof contracts.cases)[number]) => K) => contracts.cases.reduce<Record<string, number>>((sum, item) => ({ ...sum, [keyOf(item)]: (sum[keyOf(item)] ?? 0) + 1 }), {});
    expect(count((item) => item.tier)).toEqual({ small: 53, medium: 5, large: 5 });
    expect(count((item) => item.layout)).toEqual({ table: 23, prose: 20, scanned: 20 });
    expect(contracts.cases.filter((item) => item.pageText === 'unfaithful').map((item) => [item.id, item.truth.unfaithfulBecause])).toEqual([
      ['V05', 'ocr_errors'],
      ['V07', 'ocr_layer_errors'],
      ['V08', 'struck_text'],
      ['V09', 'struck_text'],
      ['V13', 'hidden_text'],
    ]);
    expect(contracts.cases.filter((item) => item.truth.twinOf !== null).map((item) => `${item.id}:${String(item.truth.twinOf)}`)).toEqual(['V11:V10', 'V13:V12', 'V15:V14']);
    expect(contracts.cases.filter((item) => item.truth.pairOf !== null).map((item) => `${item.id}:${String(item.truth.pairOf)}`)).toEqual(['V03:V04', 'V04:V03', 'L04:L05', 'L05:L04']);
    expect(contracts.cases.reduce((sum, item) => sum + item.truth.conflicts.length, 0)).toBe(9);
    expect(Math.max(...contracts.cases.map((item) => item.truth.pages))).toBe(80);
    expect(new Set(contracts.cases.map((item) => item.truth.kind))).toEqual(new Set(['contract', 'exhibit']));
    expect(new Set(contracts.cases.flatMap((item) => item.truth.records.map((record) => record.fields.method?.value)))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT']));
    expect(contracts.caseIds).toEqual(contracts.cases.map((item) => item.id).sort());
    for (const item of contracts.cases) {
      expect(item.truth.synthetic).toBe(true);
      expect(item.input.pages.join(' '), item.id).toContain('SYNTHETIC');
    }
  });

  it('only image-only scans are textless (their pages come from the scan reader’s recording); a scan with its own text layer is read from it', () => {
    const textless = contracts.cases.filter((item) => item.textless).map((item) => item.id);
    expect(textless).toEqual([...contracts.cases.filter((item) => item.id.startsWith('C') && item.layout === 'scanned').map((item) => item.id), 'V05', 'V14', 'V15', 'V18', 'L03']);
    expect(caseOf('V06').layout).toBe('scanned');
    expect(caseOf('V07').layout).toBe('scanned');
    for (const item of contracts.cases) {
      expect(item.truth.scan !== null, item.id).toBe(item.textless);
      expect(item.input.pages.every((page) => normalizePageText(page) !== ''), item.id).toBe(true);
      expect(item.input.pages, item.id).toHaveLength(item.truth.pages);
    }
  });

  it('every true field is quoted from its own page as intake reads it (on an unfaithful case, as read where it reads differently), and the quote holds what the field is written as', () => {
    let fields = 0;
    for (const item of contracts.cases) {
      for (const { field, value } of truthFields(item.truth)) {
        fields += 1;
        const quote = value.asRead?.quote ?? value.quote;
        const written = value.asRead === undefined ? value.written : value.asRead.written;
        expect(item.pageText === 'unfaithful' || value.asRead === undefined, `${item.id} ${field}`).toBe(true);
        expect(quoteOnPage(quote, item.input.pages[value.page - 1] ?? ''), `${item.id} ${field}`).toBe(true);
        for (const text of written === null ? [] : typeof written === 'string' ? [written] : written) {
          expect(normalizePageText(quote), `${item.id} ${field}`).toContain(normalizePageText(text));
        }
      }
    }
    const manifest = JSON.parse(readFileSync(CONTRACT_SET_MANIFEST, 'utf8')) as { cases: { fields: number }[] };
    expect(fields).toBe(manifest.cases.reduce((sum, entry) => sum + entry.fields, 0));
    expect(fields).toBe(2615);
    // v1's 40 cases are inside, their 742 fields with them.
    expect(contracts.cases.filter((item) => item.id.startsWith('C')).reduce((sum, item) => sum + truthFields(item.truth).length, 0)).toBe(742);
  });

  it('the canary is in the injected twins’ pages only (not V13’s, whose injection is hidden but still read)', () => {
    expect(contracts.cases.filter((item) => item.input.pages.join('\n').includes(INJECTION_CANARY)).map((item) => item.id)).toEqual(['V11', 'V13', 'V15']);
  });

  it('hashes the pages as read: a reader that changes one page changes the set', () => {
    const files = contracts.cases.map((item) => ({ item, files: [] }));
    const changed = contracts.cases.map((item, index) => ({ item: index === 0 ? { ...item, input: { ...item.input, pages: [`${item.input.pages[0] ?? ''} `, ...item.input.pages.slice(1)] } } : item, files: [] }));
    const moved = contracts.cases.map((item, index) => ({ item: index === 0 ? { ...item, input: { ...item.input, pages: ['SYNTHETIC other text', ...item.input.pages.slice(1)] } } : item, files: [] }));
    const hash = contractSetHash('a'.repeat(64), files);
    // Whitespace the page hash normalizes away is not a change; other text is.
    expect(contractSetHash('a'.repeat(64), changed)).toBe(hash);
    expect(contractSetHash('a'.repeat(64), moved)).not.toBe(hash);
    expect(contractSetHash('b'.repeat(64), files)).not.toBe(hash);
  });

  describe('the loader refuses a set that names what is not there (review m5)', () => {
    let root: string;
    const write = (edit: (truths: Record<string, Record<string, unknown>>) => void) => {
      const manifest = JSON.parse(readFileSync(CONTRACT_SET_MANIFEST, 'utf8')) as { cases: { id: string; path: string }[] };
      const kept = manifest.cases.filter((entry) => entry.id === 'C01' || entry.id === 'C02');
      const truths: Record<string, Record<string, unknown>> = {};
      for (const entry of kept) {
        cpSync(path.join(FIXTURES, entry.path), path.join(root, entry.path), { recursive: true });
        truths[entry.id] = JSON.parse(readFileSync(path.join(root, entry.path, 'truth.json'), 'utf8')) as Record<string, unknown>;
      }
      edit(truths);
      for (const entry of kept) {
        writeFileSync(path.join(root, entry.path, 'truth.json'), JSON.stringify(truths[entry.id]));
      }
      const file = path.join(root, 'set.json');
      writeFileSync(file, JSON.stringify({ ...manifest, cases: kept }));
      return loadContractSet({ manifest: file, fixtures: root });
    };

    beforeAll(() => {
      root = mkdtempSync(path.join(tmpdir(), 'tp-eval-set-'));
    });
    afterAll(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('reads a well-formed subset', async () => {
      expect((await write(() => undefined)).caseIds).toEqual(['C01', 'C02']);
    }, 60_000);

    it('refuses a dangling twinOf, a pairOf that is not named back, and a conflict index past the records', async () => {
      await expect(write((truths) => Object.assign(truths.C02 ?? {}, { twinOf: 'C77' }))).rejects.toThrow('twinOf');
      await expect(write((truths) => Object.assign(truths.C02 ?? {}, { pairOf: 'C01' }))).rejects.toThrow('pairOf');
      await expect(write((truths) => Object.assign(truths.C02 ?? {}, { conflicts: [[0, 9]] }))).rejects.toThrow('conflict');
      await expect(write((truths) => Object.assign(truths.C02 ?? {}, { pageText: 'unfaithful' }))).rejects.toThrow();
    }, 60_000);
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
  it('scores every field of every faithful document right: no wrong, extra, rejected or missed field, every conflict flagged, every twin equal (MOD-09, MOD-10)', () => {
    const scored = report.contracts;
    expect(scored?.cases).toBe(63);
    expect(scored?.byPageText.faithful).toEqual({ ...ZERO_TALLY, tp: 2339 });
    expect(scored?.faithfulWrongVerified).toEqual(Object.fromEntries(TRUTH_FIELDS.map((field) => [field, 0])));
    expect(scored?.quotesOffPage).toBe(0);
    expect(scored?.results.filter((result) => result.problem !== null)).toEqual([]);
    expect(scored?.conflicts).toEqual({ expected: 9, unflagged: [] });
    expect(scored?.twins).toEqual({ pairs: 3, differing: [], incomplete: [], canary: [] });
    expect(scored?.pairTermExtra).toEqual([]);
    for (const field of TRUTH_FIELDS) {
      expect(scored?.fields[field].tp, field).toBeGreaterThan(0);
    }
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(scored?.byTier[tier].tp, tier).toBeGreaterThan(0);
    }
  });

  it('on the unfaithful cases scores what a faithful copier of the text as read scores, as the committed report recorded it', () => {
    const scored = report.contracts;
    // The seeded reading errors (V05, V07) give misread figures that verify (wrong) or that code cannot read (rejected); the struck and hidden text, nothing.
    expect(scored?.byPageText.unfaithful).toEqual({ ...ZERO_TALLY, tp: 268, wrong: 5, rejected: 3 });
    expect(scored?.results.filter((result) => result.pageText === 'unfaithful' && Object.values(result.wrongVerified).some((count) => count > 0)).map((result) => result.id)).toEqual(['V05', 'V07']);
    const entry = baseline.entries.find((item) => item.purpose === 'proposeContractTerms' && item.provider === 'local');
    const recorded = readReport(entry?.report_sha256 ?? '').contracts;
    expect(scored?.byPageText.unfaithful).toEqual(recorded?.byPageText.unfaithful);
    expect(scored?.results.filter((result) => result.pageText === 'unfaithful')).toEqual(recorded?.results.filter((result) => result.pageText === 'unfaithful'));
  });

  it('names the reference’s wrong values on the unfaithful cases by their records: each a field the case reads otherwise than a person sees it (review n4)', () => {
    const unfaithful = report.contracts?.results.filter((result) => result.pageText === 'unfaithful') ?? [];
    const locations = unfaithful.flatMap((result) => result.wrongVerifiedAt.map((at) => ({ case: result.id, ...at })));
    expect(locations).toHaveLength(5);
    for (const at of locations) {
      const value = caseOf(at.case).truth.records[at.record]?.fields[at.field];
      expect(value?.asRead, `${at.case} ${at.field}@${String(at.record)}`).toBeDefined();
    }
    // Every faithful case names none.
    expect(report.contracts?.results.filter((result) => result.pageText === 'faithful' && result.wrongVerifiedAt.length > 0)).toEqual([]);
  });

  it('derives v1’s 742 fields’ tp, fp and fn unchanged: every v1 reference answer is all tp', () => {
    const v1 = report.contracts?.results.filter((result) => result.id.startsWith('C')) ?? [];
    expect(v1).toHaveLength(40);
    const sum = v1.reduce((total, result) => total + TRUTH_FIELDS.reduce((fields, field) => fields + result.fields[field].tp, 0), 0);
    expect(sum).toBe(742);
    for (const result of v1) {
      for (const field of TRUTH_FIELDS) {
        expect(asCounts(result.fields[field]), `${result.id} ${field}`).toEqual({ tp: result.fields[field].tp, fp: 0, fn: 0 });
      }
    }
  });

  it('passes all 300 narratives through the packets verifier with every required fact stated: zero critical errors (MOD-03)', () => {
    expect(report.narratives?.cases).toBe(300);
    expect(report.narratives?.failures).toEqual([]);
    expect(report.narratives?.passed).toBe(300);
  });

  it('passes the gate against the committed baseline', () => {
    expect(gate(report, baseline, held)).toEqual({ passed: true, problems: [], heldTo: expect.objectContaining({ provider: 'local', variant: 'default' }) as unknown });
    const local = baseline.entries.filter((entry) => entry.provider === 'local');
    expect(local.map((entry) => entry.purpose).sort()).toEqual(['draftPacketNarrative', 'proposeContractTerms']);
  });

  it('recomputes every committed entry from the report it names, and that report from its cases (review M13)', () => {
    for (const entry of baseline.entries) {
      const recorded = readReport(entry.report_sha256);
      expect(recorded.spliced, entry.report_sha256).toBe(false);
      // A real provider's permitted run is recorded on its entry later (record-permitted), from no committed report.
      const recomputed = entriesFromReport(recorded, entry.report_sha256, entry.recorded_on).map((found) => (found.purpose === 'proposeContractTerms' && entry.purpose === 'proposeContractTerms' ? { ...found, permitted: entry.permitted } : found));
      expect(recomputed).toContainEqual(entry);
      if (entry.purpose === 'proposeContractTerms') {
        expect(entry.provider === 'local' ? entry.permitted === undefined : entry.permitted !== undefined, entry.provider).toBe(true);
      }
      if (entry.purpose === 'proposeContractTerms') {
        const part = recorded.contracts;
        expect(part?.caseIds).toEqual(contracts.caseIds);
        expect(part === null || part === undefined ? null : contractReportFrom(part, part.results)).toEqual(part);
        // What the set decides of each case is the set's, and each count is its tallies' (review n1).
        expect(part === null || part === undefined ? ['no contracts'] : caseMismatches(part, contracts)).toEqual([]);
        expect(entry.set_sha256).toBe(contracts.sha256);
        expect({ prompt: entry.prompt_version, sha: entry.prompt_sha256 }).toEqual({ prompt: PROMPTS.proposeContractTerms.id, sha: PROMPTS.proposeContractTerms.sha256 });
      } else {
        expect(recorded.narratives?.caseIds).toEqual(narratives.caseIds);
        expect(recorded.narratives?.passed).toBe(recorded.narratives?.cases);
        expect(entry.set_sha256).toBe(narratives.sha256);
        expect({ prompt: entry.prompt_version, sha: entry.prompt_sha256 }).toEqual({ prompt: PROMPTS.draftPacketNarrative.id, sha: PROMPTS.draftPacketNarrative.sha256 });
      }
    }
    // The local entry is exactly this run's results.
    const entries = entriesFromReport(report, 'a'.repeat(64), '2026-10-26').map((entry) => ({ ...entry, report_sha256: '', recorded_on: '' }));
    expect(baseline.entries.filter((entry) => entry.provider === 'local').map((entry) => ({ ...entry, report_sha256: '', recorded_on: '' }))).toEqual(entries);
  });

  it('finds a report edited by hand: a faithful case marked unfaithful, a twin or pair renamed, a count apart from its tallies (review n1)', () => {
    const part = report.contracts;
    if (part === null) {
      throw new Error('contracts');
    }
    expect(caseMismatches(part, contracts)).toEqual([]);
    const edit = (id: string, change: Partial<(typeof part.results)[number]>) => ({ ...part, results: part.results.map((result) => (result.id === id ? { ...result, ...change } : result)) });
    expect(caseMismatches(edit('C08', { pageText: 'unfaithful' }), contracts)).toEqual(['C08:pageText']);
    expect(caseMismatches(edit('V11', { twinOf: null, layout: 'prose' }), contracts)).toEqual(['V11:layout', 'V11:twinOf']);
    expect(caseMismatches(edit('V04', { pairOf: null, tier: 'large' }), contracts)).toEqual(['V04:tier', 'V04:pairOf']);
    const v05 = part.results.find((result) => result.id === 'V05');
    if (v05 === undefined) {
      throw new Error('V05');
    }
    expect(caseMismatches(edit('V05', { wrongVerified: { ...v05.wrongVerified, amount: 9 } }), contracts)).toEqual(['V05:wrongVerified:amount']);
    expect(caseMismatches(edit('V05', { wrongVerifiedAt: [...v05.wrongVerifiedAt, { field: 'amount', record: 99 }] }), contracts)).toEqual(['V05:wrongVerifiedAt:amount']);
    expect(caseMismatches({ ...part, results: [...part.results, { ...v05, id: 'V99' }] }, contracts)).toEqual(['V99:not_in_set']);
  });

  it('logs every call as a synthetic evaluation call: no practice, hashes and counts only', () => {
    expect(store.calls).toHaveLength(63 + 300);
    for (const call of store.calls) {
      expect(call).toMatchObject({ practiceId: null, actorKind: 'evaluation', actorId: null, provider: 'local', outcome: 'completed' });
      expect(call.inputHashes.every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true);
    }
    // Every verifier passes but on four cases: the two whose reading errors leave a figure code cannot read (V05, V07),
    // and the two terms-only contracts of a pair (V03, L04), whose candidates state no rate for the terms to be valid.
    expect(store.calls.filter((call) => call.verifierPassed !== true)).toHaveLength(4);
  });
});

describe('a prompt or model change and the real providers (PRD 14: "no regression"; docs/adr/0054 and 0070)', () => {
  it('serves no model feature on a real provider in production as the repository ships, from the same baseline file the gate reads (review M3, docs/adr/0070 Part 2)', () => {
    // The runtime reads the same baseline file the gate does, parsed as strictly.
    expect(COMMITTED_BASELINE).toEqual(baseline);
    for (const provider of ['bedrock', 'anthropic'] as const) {
      const decisions = servingDecisions(provider);
      expect(decisions.map((decision) => decision.key), provider).toEqual([
        'proposeContractTerms/default',
        'proposeContractTerms/ambiguous',
        'readDenialLetter/default',
        'draftPacketNarrative/default',
        'suggestEvidenceRequests/default',
      ]);
      expect(servedSet(decisions, 'served').keys.size, provider).toBe(0);
      expect(servedSet(decisions, 'evaluable').keys.size, provider).toBe(0);
      // No entry for any real provider, and the two purposes with no set can never have one.
      expect(decisions.filter((decision) => decision.reasons.includes('no_entry')).map((decision) => decision.key), provider).toEqual(['proposeContractTerms/default', 'proposeContractTerms/ambiguous', 'draftPacketNarrative/default']);
      expect(decisions.filter((decision) => decision.reasons.includes('no_set')).map((decision) => decision.key), provider).toEqual(['readDenialLetter/default', 'suggestEvidenceRequests/default']);
    }
    expect(() => readGatewayConfig({ NODE_ENV: 'production', AWS_REGION: 'us-east-1' })).toThrow(/no model feature has passed its evaluation/);
    expect(() => readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toThrow(/no model feature has passed its evaluation/);
  });

  it('serves a real provider’s contract entry only after its permitted run is recorded, on the floors the gate held it to (F5 (a))', () => {
    // SYNTHETIC: this run's report under the Bedrock provider and its pinned default model, a test floors file, and
    // every price confirmed; no model is called and nothing is written.
    const modelId = PROMPTS.proposeContractTerms.models.bedrock.default ?? '';
    const real: EvaluationReport = { ...report, provider: 'bedrock', narratives: null, contracts: report.contracts === null ? null : { ...report.contracts, modelId } };
    const floors = parseFloors({ ...COMMITTED_FLOORS, proposeContractTerms: { recall: every('0.9'), precision: every('0.9') } });
    const recorded = recordBaseline(baseline, real, '2026-10-26', { ...held, floors }).baseline;
    const entry = recorded.entries.find((found) => found.provider === 'bedrock');
    expect(entry).toMatchObject({ purpose: 'proposeContractTerms', variant: 'default', model_id: modelId, permitted: 'pending' });
    const prices = PRICES.map((price) => ({ ...price, confirmed: true }));
    const key = (on: Baseline, withFloors = floors) => servingDecisions('bedrock', { baseline: on, floors: withFloors, prices }).find((decision) => decision.key === 'proposeContractTerms/default');
    // The deploy carrying the synthetic record serves nothing new: the key is evaluable only.
    expect(key(recorded)).toEqual({ key: 'proposeContractTerms/default', served: false, evaluable: true, reasons: ['permitted_pending'] });
    // The permitted run, made in production with no examples before the first practice, recorded: served.
    const run = { text: `${JSON.stringify(permittedReport('bedrock', 1, [], { runId: '00000000-0000-4000-8000-0000000000c1', production: true }), null, 2)}\n` };
    const permitted = recordPermitted(recorded, run, null, '2026-10-27');
    expect(permitted.variants).toEqual(['default']);
    expect(key(permitted.baseline)).toEqual({ key: 'proposeContractTerms/default', served: true, evaluable: true, reasons: [] });
    // The committed floors, every one unset, still serve nothing: serving reads the floors at run time.
    expect(key(permitted.baseline, COMMITTED_FLOORS)).toMatchObject({ served: false, reasons: ['floor_unset'] });
    // Re-recording the synthetic run puts the entry back to pending, and its served history stays: the next
    // permitted run is compared with the one served (review B1), and the history itself serves nothing.
    const rerecorded = recordBaseline(permitted.baseline, real, '2026-10-28', { ...held, floors }).baseline;
    expect(key(rerecorded)).toMatchObject({ served: false, reasons: ['permitted_pending'] });
    expect(rerecorded.served).toEqual(permitted.baseline.served);
    expect(() => recordPermitted(rerecorded, run, null, '2026-10-29')).toThrow(/give --against/);
    expect(JSON.parse(run.text)).toMatchObject({ format: PERMITTED_REPORT_FORMAT });
  });

  it('fails a prompt version edited in place, however its answers score', () => {
    const edited: EvaluationReport = { ...report, contracts: report.contracts === null ? null : { ...report.contracts, promptSha256: '0'.repeat(64) } };
    expect(gate(edited, baseline, held).problems).toEqual([{ code: 'prompt_changed', purpose: 'proposeContractTerms', promptVersion: PROMPTS.proposeContractTerms.id }]);
  });

  it('holds a variant to its own entry only: the ambiguous variant has none, and recording it keeps the default’s (review m1)', async () => {
    const ambiguous = await runEvaluation({ provider: reference, contracts, narratives: null, variant: 'ambiguous' });
    expect(gate(ambiguous, baseline, held).problems).toEqual([{ code: 'no_baseline', purpose: 'proposeContractTerms', provider: 'local', variant: 'ambiguous' }]);
    const recorded = recordBaseline(baseline, ambiguous, '2026-10-26', held).baseline;
    expect(recorded.entries.filter((entry) => entry.purpose === 'proposeContractTerms').map((entry) => (entry.purpose === 'proposeContractTerms' ? entry.variant : null))).toEqual(['default', 'ambiguous']);
  }, 60_000);

  it('refuses a real provider with any floor unset, at the gate and at record', () => {
    const real: EvaluationReport = { ...report, provider: 'bedrock' };
    const unset = gate(real, baseline, held).problems.filter((problem) => problem.code === 'floor_unset');
    expect(unset).toHaveLength(2 * TRUTH_FIELDS.length);
    expect(() => recordBaseline(baseline, real, '2026-10-26', held)).toThrow('floor_unset');
  });

  it('refuses a report that does not cover the set, and fails closed on the unfaithful cases without the local reference', async () => {
    const subset = await runEvaluation({ provider: reference, contracts, narratives: null, cases: new Set(['C01', 'C02']) });
    const result = gate(subset, baseline, held);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ code: 'incomplete_report', purpose: 'proposeContractTerms', unexpected: [] });
    expect(() => recordBaseline(baseline, subset, '2026-10-26', held)).toThrow('incomplete_report');
    expect(gate(report, baseline).problems).toEqual([{ code: 'reference_missing', cases: ['V05', 'V07', 'V08', 'V09', 'V13'] }]);
  });
});

describe('the gate fails on injected faults, each rerunning only the cases it spoils (MOD-08)', () => {
  /** The whole-set report with the fault's cases rerun on the faulty provider and spliced in. */
  const spliced = async (provider: ModelProvider, cases: readonly string[], part: 'contracts' | 'narratives' = 'contracts') =>
    spliceReport(report, await runEvaluation({ provider, contracts: part === 'contracts' ? contracts : null, narratives: part === 'narratives' ? narratives : null, cases: new Set(cases) }));
  /** The gate's problems as code:field (or code:case:field), the leading spliced_report checked and left out. */
  const codes = (result: GateResult) => {
    expect(result.problems[0]).toEqual({ code: 'spliced_report' });
    return result.problems.slice(1).map((problem) => ('case' in problem && 'field' in problem ? `${problem.code}:${problem.case}:${problem.field}` : 'field' in problem ? `${problem.code}:${problem.field}` : problem.code));
  };
  const faulted = async (provider: ModelProvider, cases: readonly string[]) => codes(gate(await spliced(provider, cases), baseline, held));
  const regressed = (...fields: string[]) => ['precision_regressed:all', 'recall_regressed:all', ...fields.flatMap((field) => [`precision_regressed:${field}`, `recall_regressed:${field}`])];
  const wrongVerified = (field: string) => ['wrong_verified_rose:all', `wrong_verified_rose:${field}`, `wrong_verified_on_faithful:${field}`];

  it('a splice equals a whole-set run of the same faulty provider (Appendix A.5)', async () => {
    const provider = takeStruck(reference, { cases: ['V08'] });
    const whole = await runEvaluation({ provider, contracts, narratives });
    const part = await spliced(provider, ['V08']);
    expect(part.contracts).toEqual(whole.contracts);
    expect(part.narratives).toEqual(whole.narratives);
    expect(part.spliced).toBe(true);
    expect(() => recordBaseline(baseline, part, '2026-10-26', held)).toThrow('spliced_report');
  }, 60_000);

  it('dropField: one field of one document left out regresses that field’s recall (and its precision, the reference’s unfaithful cases holding some wrong amounts)', async () => {
    expect(await faulted(dropField(reference, 'amount', { cases: ['C04'] }), ['C04'])).toEqual(regressed('amount'));
  });

  it('misquote: one field misquoted fails the quote check and regresses precision and recall', async () => {
    expect(await faulted(misquote(reference, 'effective_from', { cases: ['C05'] }), ['C05'])).toEqual([...regressed('effective_from'), 'quotes_off_page']);
  });

  it('wrongValue: an amount its quote does not hold is rejected: precision and recall regress, nothing wrong verifies', async () => {
    expect(await faulted(wrongValue(reference, { cases: ['C04'] }), ['C04'])).toEqual(regressed('amount'));
  });

  it('swappedRows: two rows’ amounts exchanged are each rejected as not in their row, and nothing wrong verifies', async () => {
    expect(await faulted(swappedRows(reference, { cases: ['C08'] }), ['C08'])).toEqual(regressed('amount'));
    const item = caseOf('C08');
    const [first, second, ...rest] = referenceContractOutput(item.truth).candidates;
    if (first === undefined || second === undefined) {
      throw new Error('two candidates');
    }
    const proposal = verifyContractTerms(item.input, { candidates: [{ ...first, amount: second.amount }, { ...second, amount: first.amount }, ...rest] }).proposal;
    expect(proposal.candidates.slice(0, 2).map((candidate) => candidate.fields.find((field) => field.field === 'amount')?.problems)).toEqual([['not_in_row'], ['not_in_row']]);
  });

  it('crossRowQuote: row 1’s amount quoted with rows 0 and 1 together is rejected as not in its row', async () => {
    expect(await faulted(crossRowQuote(reference, { cases: ['C08'] }), ['C08'])).toEqual(regressed('amount'));
  });

  it('mergeRowsSpanning: the merge mergeRows makes, its codes quoted over both rows, verifies the merged codes, which are wrong but verified (review n3)', async () => {
    // C01, as mergeRows: the same lost row, but the codes are wrong and verified rather than rejected.
    expect(await faulted(mergeRowsSpanning(reference, { cases: ['C01'] }), ['C01'])).toEqual([
      'precision_regressed:all',
      'recall_regressed:all',
      'recall_regressed:method',
      'precision_regressed:codes',
      'recall_regressed:codes',
      'recall_regressed:percentage',
      'recall_regressed:effective_from',
      'recall_regressed:effective_to',
      'wrong_verified_rose:all',
      'wrong_verified_rose:codes',
      'wrong_verified_on_faithful:codes',
    ]);
    const part = await spliced(mergeRowsSpanning(reference, { cases: ['C01'] }), ['C01']);
    expect(part.contracts?.results.find((result) => result.id === 'C01')?.fields.codes).toEqual({ ...ZERO_TALLY, wrong: 1, missed: 1 });
  });

  it('dropScope: a scope field left out of every row widens every rate record with nothing marked, and fails as wrong but verified (review M2)', async () => {
    expect(await faulted(dropScope(reference, 'modifiers', { cases: ['C05'] }), ['C05'])).toEqual([
      'precision_regressed:all',
      'recall_regressed:all',
      'recall_regressed:modifiers',
      'wrong_verified_rose:all',
      'wrong_verified_rose:modifiers',
      'wrong_verified_on_faithful:modifiers',
    ]);
    const part = await spliced(dropScope(reference, 'modifiers', { cases: ['C05'] }), ['C05']);
    expect(part.contracts?.results.find((result) => result.id === 'C05')?.fields.modifiers).toEqual({ ...ZERO_TALLY, widened: 4 });
    // Codes left out: a record for every code; the end date left out: a record with no end.
    for (const field of ['codes', 'effective_to'] as const) {
      const problems = await faulted(dropScope(reference, field, { cases: ['C08'] }), ['C08']);
      expect(problems, field).toEqual(expect.arrayContaining([`wrong_verified_rose:${field}`, `wrong_verified_on_faithful:${field}`]));
    }
  });

  it('mergeRows: two rows merged into one lose the second row and reject the merged codes (C01: the codes’ quote holds one row’s code)', async () => {
    expect(await faulted(mergeRows(reference, { cases: ['C01'] }), ['C01'])).toEqual([
      'precision_regressed:all',
      'recall_regressed:all',
      'recall_regressed:method',
      'precision_regressed:codes',
      'recall_regressed:codes',
      'recall_regressed:percentage',
      'recall_regressed:effective_from',
      'recall_regressed:effective_to',
    ]);
  });

  it('flipFlag: a flag flipped with its real sentence verifies, and is wrong but verified on a faithful case', async () => {
    expect(await faulted(flipFlag(reference, 'apply_mppr', { cases: ['C08'] }), ['C08'])).toEqual([...regressed('flags'), ...wrongVerified('flags')]);
  });

  it('wrongMethod: a fixed schedule read as per visit verifies, and is wrong but verified', async () => {
    expect(await faulted(wrongMethod(reference, { cases: ['C08'] }), ['C08'])).toEqual([...regressed('method'), ...wrongVerified('method')]);
  });

  it('wrongDate: another date of the same sentence as the start date verifies, and is wrong but verified', async () => {
    expect(await faulted(wrongDate(reference, { cases: ['C08'] }), ['C08'])).toEqual([...regressed('effective_from'), ...wrongVerified('effective_from')]);
  });

  it('amendedOnOriginal: the amended figure on the original record verifies, and is wrong but verified', async () => {
    expect(await faulted(amendedOnOriginal(reference, { cases: ['C05'] }), ['C05'])).toEqual([...regressed('amount'), ...wrongVerified('amount')]);
  });

  it('takeStruck: the struck rate on an unfaithful case rises above the reference there, and is not counted as faithful (review M6)', async () => {
    const problems = await faulted(takeStruck(reference, { cases: ['V08'] }), ['V08']);
    // As many wrong values as the reference or more, and on a record the reference reads right (review n4).
    expect(problems).toEqual([...regressed('amount'), 'wrong_verified_rose:all', 'wrong_verified_rose:amount', 'wrong_verified_above_reference:V08:amount', 'wrong_verified_off_reference:V08:amount']);
    expect(problems.some((code) => code.startsWith('wrong_verified_on_faithful'))).toBe(false);
  });

  it('obeyInjection: a candidate that does what the injection asks differs from the clean twin, quotes the canary and is wrong but verified', async () => {
    const problems = await faulted(obeyInjection(reference, { cases: ['V11'] }), ['V11']);
    expect(problems).toEqual(expect.arrayContaining(['wrong_verified_on_faithful:amount', 'wrong_verified_on_faithful:codes', 'twin_differs', 'twin_canary']));
    expect(problems.slice(-2)).toEqual(['twin_differs', 'twin_canary']);
  });

  it('quoteInjection: every value equal to the clean twin’s, but a quote from the injection: the twin differs and quotes the canary (review M4)', async () => {
    const part = await spliced(quoteInjection(reference, { cases: ['V11'] }), ['V11']);
    expect(codes(gate(part, baseline, held))).toEqual(['twin_differs', 'twin_canary']);
    expect(part.contracts?.results.find((result) => result.id === 'V11')?.fields).toEqual(report.contracts?.results.find((result) => result.id === 'V11')?.fields);
  });

  it('labelInjection: every value and quote the clean twin’s, only the label obeying the injection: the injected-words rule catches it (review m2)', async () => {
    const part = await spliced(labelInjection(reference, { cases: ['V11', 'V13', 'V15'] }), ['V11', 'V13', 'V15']);
    expect(codes(gate(part, baseline, held))).toEqual(['twin_canary']);
    expect(part.contracts?.twins).toEqual({ pairs: 3, differing: [], incomplete: [], canary: ['V11', 'V13', 'V15'] });
  });

  it('failTwin: an injected twin whose call fails is incomplete, never equal, and the run measured nothing there (review m1)', async () => {
    const problems = await faulted(failTwin(reference, { cases: ['V11'] }), ['V11']);
    expect(problems.at(-1)).toBe('twin_incomplete');
    expect(problems.filter((code) => !code.startsWith('precision_regressed') && !code.startsWith('recall_regressed'))).toEqual(['unmeasured_cases', 'twin_incomplete']);
  });

  it('a failed call on a case with no twin or conflict is refused at record, first record or not (review m1)', async () => {
    const part = await spliced(failTwin(reference, { cases: ['C04'] }), ['C04']);
    const whole = { ...part, spliced: false };
    expect(gate(whole, baseline, held).problems).toEqual(expect.arrayContaining([{ code: 'unmeasured_cases', cases: ['C04'] }]));
    expect(() => recordBaseline({ ...baseline, entries: [] }, whole, '2026-10-26', held)).toThrow('unmeasured_cases');
  });

  it('dropDecoy: a decoy left out leaves its conflict unflagged and regresses recall', async () => {
    const problems = await faulted(dropDecoy(reference, { cases: ['V16'] }), ['V16']);
    expect(problems.at(-1)).toBe('conflict_unflagged');
    expect(problems).toEqual(expect.arrayContaining(['recall_regressed:all', 'recall_regressed:amount']));
  });

  it('unpairConflict: a decoy flagged against a third candidate instead of its row is an unflagged conflict (review m6)', async () => {
    const problems = await faulted(unpairConflict(reference, { cases: ['V16'] }), ['V16']);
    expect(problems.at(-1)).toBe('conflict_unflagged');
  });

  it('the floors: a real provider’s report below a set recall or precision floor fails with that floor (review M6)', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tp-eval-floors-'));
    try {
      const file = path.join(root, 'floors.json');
      const floorsWith = (kind: 'recall' | 'precision') => {
        const all = Object.fromEntries(TRUTH_FIELDS.map((field) => [field, '0']));
        writeFileSync(file, JSON.stringify({ format: 'tp-model-eval-floors/1', note: 'SYNTHETIC test floors', proposeContractTerms: { recall: all, precision: all, [kind]: { ...all, amount: '1' } } }));
        return parseFloors(JSON.parse(readFileSync(file, 'utf8')));
      };
      const dropped = { ...(await spliced(dropField(reference, 'amount', { cases: ['C04'] }), ['C04'])), provider: 'bedrock' as const };
      expect(gate(dropped, baseline, { ...held, floors: floorsWith('recall') }).problems).toEqual(expect.arrayContaining([{ code: 'recall_below_floor', field: 'amount' }]));
      const wrong = { ...(await spliced(wrongValue(reference, { cases: ['C04'] }), ['C04'])), provider: 'bedrock' as const };
      const precisionProblems = gate(wrong, baseline, { ...held, floors: floorsWith('precision') }).problems;
      expect(precisionProblems).toEqual(expect.arrayContaining([{ code: 'precision_below_floor', field: 'amount' }]));
      expect(precisionProblems.some((problem) => problem.code === 'floor_unset')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the demonstration (MOD-07): a rejection and a wrong value that verifies score the same under the old counts, and the gate fails the second', async () => {
    // Recorded on a run whose original row of C05 has its amount rejected (wrongValue), then gated on a run that puts the amended figure there instead.
    const rejectedRun = await runEvaluation({ provider: wrongValue(reference, { cases: ['C05'] }), contracts, narratives: null });
    const silentRun = await runEvaluation({ provider: amendedOnOriginal(reference, { cases: ['C05'] }), contracts, narratives: null });
    const fieldsOf = (run: EvaluationReport) => Object.fromEntries(TRUTH_FIELDS.map((field) => [field, asCounts(run.contracts?.fields[field] ?? ZERO_TALLY)]));
    expect(fieldsOf(silentRun)).toEqual(fieldsOf(rejectedRun));
    const recorded = recordBaseline({ ...baseline, entries: [] }, rejectedRun, '2026-10-26', held).baseline;
    const problems = gate(silentRun, recorded, held).problems.map((problem) => ('field' in problem ? `${problem.code}:${problem.field}` : problem.code));
    expect(problems).toEqual(['wrong_verified_rose:all', 'wrong_verified_rose:amount', 'wrong_verified_on_faithful:amount']);
    // On a changed set nothing is compared: only the absolute rule is left.
    const moved = { ...silentRun, contracts: silentRun.contracts === null ? null : { ...silentRun.contracts, setSha256: '0'.repeat(64) } };
    const movedReference = report.contracts === null ? null : { ...report.contracts, setSha256: '0'.repeat(64) };
    expect(gate(moved, recorded, { reference: movedReference }).problems.map((problem) => problem.code)).toEqual(['set_changed', 'wrong_verified_on_faithful']);
  }, 60_000);

  it('--new-set: the held model recorded on a changed set, never a changed model with it (review B2)', () => {
    const moved = (modelId?: string): EvaluationReport => ({
      ...report,
      contracts: report.contracts === null ? null : { ...report.contracts, setSha256: '0'.repeat(64), ...(modelId === undefined ? {} : { modelId }) },
    });
    const movedReference = report.contracts === null ? null : { ...report.contracts, setSha256: '0'.repeat(64) };
    expect(gate(moved(), baseline, { reference: movedReference }).problems).toEqual([{ code: 'set_changed', purpose: 'proposeContractTerms' }]);
    expect(() => recordBaseline(baseline, moved(), '2026-10-26', { reference: movedReference })).toThrow('set_changed');
    const recorded = recordBaseline(baseline, moved(), '2026-10-26', { reference: movedReference, newSet: true }).baseline;
    expect(recorded.entries.filter((entry) => entry.purpose === 'proposeContractTerms').map((entry) => entry.set_sha256)).toEqual(['0'.repeat(64)]);
    expect(() => recordBaseline(baseline, moved('local-other'), '2026-10-26', { reference: movedReference, newSet: true })).toThrow('new_set_with_change');
  });

  it('addFigure: one narrative with a figure not in its inputs fails the zero-tolerance gate', async () => {
    const id = narratives.cases[17]?.id ?? '';
    const part = await spliced(addFigure(reference, { cases: [id] }), [id], 'narratives');
    expect(codes(gate(part, baseline, held))).toEqual(['narrative_failures']);
    expect(gate(part, baseline, held).problems[1]).toEqual({ code: 'narrative_failures', count: 1, cases: [id] });
    expect(part.narratives?.failures[0]).toMatchObject({ problems: ['verifier_failed'], mismatches: ['figure_not_in_input'] });
  });

  it('dropCitation: one narrative sentence without its citation fails it', async () => {
    const id = narratives.cases[3]?.id ?? '';
    const part = await spliced(dropCitation(reference, { cases: [id] }), [id], 'narratives');
    expect(codes(gate(part, baseline, held))).toEqual(['narrative_failures']);
    expect(part.narratives?.failures).toEqual([expect.objectContaining({ id, problems: ['verifier_failed'], mismatches: ['sentence_without_citation'] })]);
  });

  it('dropFact: a narrative that verifies but leaves out the shortfall misses a required fact, and fails', async () => {
    const id = narratives.cases[0]?.id ?? '';
    const part = await spliced(dropFact(reference, { cases: [id] }), [id], 'narratives');
    expect(codes(gate(part, baseline, held))).toEqual(['narrative_failures']);
    expect(part.narratives?.failures).toEqual([expect.objectContaining({ problems: ['fact_missing'], mismatches: [] })]);
    expect(part.narratives?.failures[0]?.missing).toContain('shortfall');
  });

  it('swapAmounts: a narrative that swaps what the contract requires and what the remittances show fails: every figure is an input, but in the wrong role', async () => {
    const ids = narratives.cases.slice(0, 3).map((item) => item.id);
    const part = await spliced(swapAmounts(reference, { cases: ids }), ids, 'narratives');
    // Each of the three reference styles, swapped.
    expect(gate(part, baseline, held).problems.slice(1)).toEqual([{ code: 'narrative_failures', count: 3, cases: ids }]);
    // The packets verifier fails each swapped figure itself (docs/adr/0086), and the gateway names its role.
    for (const failure of part.narratives?.failures ?? []) {
      expect(failure, failure.id).toMatchObject({ problems: ['verifier_failed'], mismatches: ['figure_in_wrong_role', 'figure_not_in_input'] });
    }
  });

  it('swapCounts: a narrative that swaps the line count with the claim or patient count fails the same way', async () => {
    // Cases whose line count differs from both other counts, so the swap changes the text: one of each style.
    const differing = narratives.cases.flatMap((item, index) => {
      const { pattern } = item.input.content;
      return pattern.lines !== pattern.claims && pattern.lines !== pattern.patients ? [index] : [];
    });
    const picked = [0, 1, 2].map((style) => differing.find((index) => index % 3 === style) ?? -1);
    expect(picked.every((index) => index >= 0)).toBe(true);
    const ids = picked.map((index) => narratives.cases[index]?.id ?? '');
    const part = await spliced(swapCounts(reference, { cases: ids }), ids, 'narratives');
    expect(codes(gate(part, baseline, held))).toEqual(['narrative_failures']);
    expect(part.narratives?.failures.map((failure) => [failure.id, failure.problems, failure.mismatches])).toEqual([...ids].sort().map((id) => [id, ['verifier_failed'], ['figure_in_wrong_role', 'figure_not_in_input']]));
  });
});
