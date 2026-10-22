import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The pricing oracle (PRD section 18; fixtures/golden/README.md). Every golden claim is recomputed by
 * the independent worksheet, and any difference from the committed expected results or worksheet
 * fails. The engine's comparison is engine.golden.test.ts, beside this one. With `pnpm test:golden --report`
 * (TP_GOLDEN_REPORT), the differences are written to fixtures/golden/.report; fixtures are never
 * touched.
 */
const WORKSHEET = 'tools/golden-worksheet/golden_worksheet.py';
const CLAIMS = 'fixtures/golden/claims';
/** Golden diffs: changes to what existing golden lines expect, each explained and awaiting (or given) the specialist's approval. */
const DIFFS = 'fixtures/golden/diffs';
const COMPUTED_BY = 'independent worksheet tools/golden-worksheet';

/** The unpriced reasons a golden line can hold: every reason of the closed list but ENGINE_ERROR, which is never a golden line. */
const GOLDEN_REASONS = [
  'NO_MAPPING',
  'NO_AGREEMENT',
  'AMBIGUOUS_RATE',
  'NO_RATE_FOR_CODE',
  'NO_PFS_VALUE',
  'MUE_EXCEEDED',
  'UNITS_RULE_UNKNOWN',
  'SECONDARY_PAYER',
  'DATE_OUTSIDE_VERSIONS',
  'REVERSED_CLAIM',
  'UNSUPPORTED_METHOD',
];
const NEVER_GOLDEN = ['ENGINE_ERROR'];
const METHODS = ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED'];
const FLAGS = ['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration', 'apply_ncci'];
const FIXTURE_PAYERS = ['A', 'B', 'C', 'D', 'E'];

interface Difference {
  readonly file: string;
  readonly case: string | null;
  readonly line_no: number | null;
  readonly field: string;
  readonly golden: unknown;
  readonly worksheet: unknown;
}

interface CheckReport {
  readonly files: number;
  readonly cases: number;
  readonly lines: number;
  readonly differences: readonly Difference[];
}

interface GoldenLine {
  readonly line_no: number;
  readonly outcome: 'priced' | 'unpriced';
  readonly unpriced_reason?: string;
  readonly expected_unrounded_cents?: string;
  readonly rounding?: string;
  readonly method?: string;
  readonly base_cents?: string;
  readonly adjustments?: readonly { readonly name: string; readonly before_cents: string; readonly after_cents: string }[];
  readonly review_flags?: readonly { readonly flag: string; readonly column1_line_no: number }[];
  readonly variance_cents?: string;
  readonly window?: { readonly ends_on: string | null; readonly status: string };
}

interface RateRecord {
  readonly method: string;
  readonly parameters: {
    readonly year_basis?: string;
    readonly conversion_factor?: string;
    readonly schedule?: { readonly method: string };
    readonly contract_adjustment?: { readonly kind: string } | null;
  };
  readonly flags: Record<string, boolean | string | null>;
}

interface ContractVersion {
  readonly contract_id: string;
  readonly rate_records: readonly RateRecord[];
}

interface GoldenClaim {
  readonly format: string;
  readonly id: string;
  readonly covers: readonly string[];
  readonly inputs: {
    readonly release: { readonly number: number; readonly dir: string };
    /** `zip_plus_four` is absent unless the claim gives one (PR 6b; docs/adr/0064). */
    readonly practice_settings: { readonly zip: string; readonly zip_plus_four?: string; readonly default_rounding: string | null };
    readonly place_of_service_settings: Record<string, string>;
    readonly claim: {
      readonly claim_status_code: string;
      readonly reversed: boolean;
      readonly lines: readonly { readonly modifiers: readonly string[]; readonly place_of_service: string; readonly patient_share_adjustments: readonly unknown[] }[];
    };
    readonly mappings: readonly { readonly kind: string }[];
    readonly contract_versions: readonly ContractVersion[];
  };
  readonly expected: { readonly lines: readonly GoldenLine[] };
  readonly provenance: { readonly computed_by: string; readonly specialist_verified: boolean };
}

/** One golden diff (tp-golden-diff/1, fixtures/golden/README.md). */
interface GoldenDiff {
  readonly format: string;
  readonly id: string;
  readonly title: string;
  readonly status: 'pending_specialist_approval' | 'approved';
  /** The specialist's approval, a human step: who and when. Null while pending. */
  readonly approval: { readonly by: string; readonly on: string } | null;
  readonly baseline: { readonly commit: string; readonly format: string; readonly claims: { readonly from: string; readonly to: string }; readonly note: string };
  readonly changed_in: string;
  readonly question: string;
  readonly amounts_changed: boolean;
  readonly cause: string;
  readonly lines: readonly {
    readonly claim: string;
    readonly line_no: number;
    readonly field: 'review_flags';
    readonly before: unknown;
    readonly after: unknown;
    readonly record: { readonly release: number; readonly record_type: string; readonly key: Readonly<Record<string, string>>; readonly modifier_indicator: string };
    readonly explanation: string;
  }[];
}

function readDiffs(): GoldenDiff[] {
  return readdirSync(path.join(repositoryRoot, DIFFS))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(repositoryRoot, DIFFS, name), 'utf8')) as GoldenDiff);
}

const claimNumber = (id: string) => Number.parseInt(id.slice(1), 10);

/** The golden diffs as the golden-diff skill reads them, beside the worksheet's report. */
function writePendingReport(directory: string, diffs: readonly GoldenDiff[]): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'pending.json'), `${JSON.stringify({ comparison: 'golden diffs: changes to existing golden lines and their approval', diffs }, null, 2)}\n`);
  const body = ['# Golden diffs: changes to what existing golden lines expect', '', 'A golden line changes only with the specialist. Each diff below is explained; a pending one awaits their approval.', ''];
  for (const diff of diffs) {
    body.push(`## ${diff.id}: ${diff.title} (${diff.status === 'approved' ? `approved by ${diff.approval?.by ?? ''} on ${diff.approval?.on ?? ''}` : 'pending the specialist'})`, '', diff.cause, '');
    body.push('| Claim | Line | Field | Before | After | Record | Why |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const line of diff.lines) {
      body.push(`| ${line.claim} | ${String(line.line_no)} | ${line.field} | ${line.before === null ? `not compared (${diff.baseline.format})` : cell(line.before)} | ${cell(line.after)} | ${line.record.record_type} ${cell(line.record.key)} (release ${String(line.record.release)}) | ${line.explanation} |`);
    }
    body.push('');
  }
  writeFileSync(path.join(directory, 'pending.md'), body.join('\n'));
}

function runWorksheetCheck(): CheckReport {
  const result = spawnSync('python3', ['-I', WORKSHEET, 'check', '--json'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.error !== undefined) {
    throw new Error(`python3 could not run the golden worksheet: ${result.error.message}`);
  }
  if (result.stderr !== '') {
    throw new Error(`the golden worksheet failed:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout) as CheckReport;
}

function readClaims(): GoldenClaim[] {
  return readdirSync(path.join(repositoryRoot, CLAIMS))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(repositoryRoot, CLAIMS, name), 'utf8')) as GoldenClaim);
}

function cell(value: unknown): string {
  return value === null || value === undefined ? '' : JSON.stringify(value).replaceAll('|', '\\|');
}

/** The report the golden-diff skill reads: JSON for tools, Markdown for the person. */
function writeReport(directory: string, report: CheckReport, unverified: number): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'worksheet.json'), `${JSON.stringify({ comparison: 'golden files against the independent worksheet', ...report, unverified }, null, 2)}\n`);
  const rows = report.differences.map((item) => `| ${item.file} | ${item.case ?? ''} | ${item.line_no === null ? '' : String(item.line_no)} | ${item.field} | ${cell(item.golden)} | ${cell(item.worksheet)} |`);
  const body = [
    '# Golden differences: committed golden files against the independent worksheet',
    '',
    `${String(report.cases)} claim(s), ${String(report.lines)} line(s), ${String(report.differences.length)} difference(s). ${String(unverified)} claim(s) not yet verified by the reimbursement specialist.`,
    'The engine comparison is in engine.md beside this file. Nothing under fixtures/golden was changed; a golden line changes only by hand, with the specialist.',
    '',
    ...(rows.length === 0 ? ['No differences.'] : ['| File | Case | Line | Field | Golden | Worksheet |', '| --- | --- | --- | --- | --- | --- |', ...rows]),
    '',
  ];
  writeFileSync(path.join(directory, 'worksheet.md'), body.join('\n'));
}

describe('golden lines', () => {
  const claims = readClaims();
  const lines = claims.flatMap((claim) => claim.expected.lines);
  const records = claims.flatMap((claim) => claim.inputs.contract_versions.flatMap((version) => version.rate_records));

  it('match the independent worksheet to the cent, line by line, with an identical worksheet', () => {
    const report = runWorksheetCheck();
    const reportDir = process.env.TP_GOLDEN_REPORT;
    if (reportDir !== undefined && reportDir !== '') {
      writeReport(reportDir, report, claims.filter((claim) => !claim.provenance.specialist_verified).length);
    }
    expect(report.files).toBe(claims.length);
    expect(report.differences).toEqual([]);
  });

  it('record every review flag an earlier golden line gained as a golden diff awaiting the specialist, as the claim now holds it', () => {
    const diffs = readDiffs();
    const reportDir = process.env.TP_GOLDEN_REPORT;
    if (reportDir !== undefined && reportDir !== '') {
      writePendingReport(reportDir, diffs);
    }
    const byId = new Map(claims.map((claim) => [claim.id, claim]));
    expect(diffs.map((diff) => diff.id)).toEqual(['D001']);
    for (const diff of diffs) {
      expect(diff.format, diff.id).toBe('tp-golden-diff/1');
      // Approval is the specialist's, a human step: none is recorded without a name and a date.
      expect(diff.status === 'approved' ? diff.approval !== null && diff.approval.by !== '' && /^\d{4}-\d{2}-\d{2}$/.test(diff.approval.on) : diff.approval === null, diff.id).toBe(true);
      expect(['pending_specialist_approval', 'approved']).toContain(diff.status);
      for (const line of diff.lines) {
        const claim = byId.get(line.claim);
        const where = `${diff.id} ${line.claim} line ${String(line.line_no)}`;
        expect(claim, where).toBeDefined();
        expect(claimNumber(line.claim) >= claimNumber(diff.baseline.claims.from) && claimNumber(line.claim) <= claimNumber(diff.baseline.claims.to), where).toBe(true);
        // The recorded change is what the claim now expects: the record and the golden line agree.
        expect(claim?.expected.lines.find((expected) => expected.line_no === line.line_no)?.[line.field], where).toEqual(line.after);
        // A claim is not verified while a change to it awaits the specialist.
        if (diff.status === 'pending_specialist_approval') {
          expect(claim?.provenance.specialist_verified, where).toBe(false);
        }
      }
    }
    // Every review flag on a line of the claims format 2 held (which compared none) is recorded in a diff.
    const [phaseOne] = diffs;
    const inBaseline = claims.filter((claim) => phaseOne !== undefined && claimNumber(claim.id) >= claimNumber(phaseOne.baseline.claims.from) && claimNumber(claim.id) <= claimNumber(phaseOne.baseline.claims.to));
    expect(inBaseline).toHaveLength(64);
    const flagged = inBaseline.flatMap((claim) => claim.expected.lines.filter((line) => (line.review_flags ?? []).length > 0).map((line) => `${claim.id}:${String(line.line_no)}`));
    const recorded = diffs.flatMap((diff) => diff.lines.map((line) => `${line.claim}:${String(line.line_no)}`));
    expect(flagged.sort()).toEqual([...recorded].sort());
    expect(recorded).toHaveLength(8);
    // D001 waits for the specialist; no amount of its lines moved.
    expect(phaseOne).toMatchObject({ id: 'D001', status: 'pending_specialist_approval', amounts_changed: false, question: 'Q41' });
  });

  it('hold only claim files, each with its worksheet beside it', () => {
    const names = readdirSync(path.join(repositoryRoot, CLAIMS)).sort();
    const claimsNamed = names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length));
    expect(names).toEqual(claimsNamed.flatMap((name) => [`${name}.json`, `${name}.worksheet.md`]).sort());
    for (const [index, name] of claimsNamed.entries()) {
      expect(name.startsWith(`${claims[index]?.id ?? ''}-`), name).toBe(true);
    }
  });

  it('hold at least the two hundred lines of Monitoring v1, in format 3, each claim with its provenance', () => {
    expect(lines.length).toBeGreaterThanOrEqual(200);
    expect(new Set(claims.map((claim) => claim.id)).size).toBe(claims.length);
    for (const claim of claims) {
      expect(claim.format, claim.id).toBe('tp-golden-claim/3');
      expect(claim.provenance.computed_by, claim.id).toBe(COMPUTED_BY);
      expect(typeof claim.provenance.specialist_verified, claim.id).toBe('boolean');
    }
  });

  it('cover every unpriced reason a golden line can hold', () => {
    const table = readFileSync(path.join(repositoryRoot, 'docs/product/unpriced-reasons.md'), 'utf8');
    const listed = [...table.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1]);
    expect([...GOLDEN_REASONS, ...NEVER_GOLDEN].sort()).toEqual([...listed].sort());
    const reasons = new Set(lines.map((line) => line.unpriced_reason).filter((reason) => reason !== undefined));
    expect([...reasons].sort()).toEqual([...GOLDEN_REASONS].sort());
  });

  it('hold two hundred lines across the five fixture payers, each one SYNTHETIC contract carried identically by its claims', () => {
    const payerLines = new Map<string, number>();
    for (const letter of FIXTURE_PAYERS) {
      const ofPayer = claims.filter((claim) => claim.covers.includes(`fixture payer ${letter}`));
      expect(ofPayer.length, letter).toBeGreaterThan(5);
      const contracts = new Set(ofPayer.map((claim) => JSON.stringify(claim.inputs.contract_versions)));
      expect(contracts.size, letter).toBe(1);
      expect(new Set(ofPayer.flatMap((claim) => claim.inputs.contract_versions.map((version) => version.contract_id))).size, letter).toBe(1);
      payerLines.set(letter, ofPayer.reduce((count, claim) => count + claim.expected.lines.length, 0));
    }
    expect([...payerLines.values()].reduce((total, count) => total + count, 0)).toBeGreaterThanOrEqual(200);
    const reasons = new Set(
      claims.filter((claim) => claim.covers.some((item) => item.startsWith('fixture payer '))).flatMap((claim) => claim.expected.lines.flatMap((line) => (line.unpriced_reason === undefined ? [] : [line.unpriced_reason]))),
    );
    expect([...reasons].sort()).toEqual([...GOLDEN_REASONS].sort());
  });

  it('cover every method, every adjustment flag on and off, contract adjustments, the edits and reversals', () => {
    expect(new Set(records.map((record) => record.method))).toEqual(new Set(METHODS));
    const priced = lines.filter((line) => line.outcome === 'priced');
    expect(new Set(priced.map((line) => line.method))).toEqual(new Set(METHODS.filter((method) => method !== 'UNSUPPORTED')));
    for (const flag of FLAGS) {
      expect(new Set(records.map((record) => record.flags[flag])), flag).toEqual(new Set([true, false]));
    }
    expect(new Set(records.flatMap((record) => (record.method === 'LESSER_OF' ? [record.parameters.schedule?.method] : [])))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE']));
    expect(new Set(records.flatMap((record) => (record.parameters.contract_adjustment ? [record.parameters.contract_adjustment.kind] : [])))).toEqual(new Set(['PERCENT', 'CAP']));
    const contractAdjusted = priced.flatMap((line) => (line.adjustments ?? []).filter((item) => item.name === 'contract_adjustment'));
    expect(contractAdjusted.some((item) => item.before_cents !== item.after_cents)).toBe(true);
    expect(contractAdjusted.some((item) => item.before_cents === item.after_cents)).toBe(true);
    expect(priced.some((line) => (line.review_flags ?? []).some((flag) => flag.flag === 'NCCI_PTP'))).toBe(true);
    expect(new Set(records.map((record) => record.flags.timed_units_rule))).toEqual(new Set(['MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN']));
    expect(priced.some((line) => line.method === 'PER_VISIT' && line.base_cents === '0')).toBe(true);
    // A reversal (status 22) or a reversed claim against every fixture payer's contract.
    for (const letter of FIXTURE_PAYERS) {
      const reversals = claims.filter((claim) => claim.covers.includes(`fixture payer ${letter}`) && (claim.inputs.claim.claim_status_code === '22' || claim.inputs.claim.reversed));
      expect(reversals.length, letter).toBeGreaterThan(0);
    }
  });

  it('cover the cases the plan names', () => {
    const covered = new Set(claims.flatMap((claim) => claim.covers));
    for (const id of ['PRD 11 worked example', 'PRC-01', 'PRC-02', 'PRC-03', 'PRC-04', 'PRC-08', 'PRC-09', 'PRC-12', 'PRC-13']) {
      expect(covered.has(id), id).toBe(true);
    }
    const halves = lines.filter((line) => line.expected_unrounded_cents?.endsWith('.5') === true);
    expect(new Set(halves.map((line) => line.rounding))).toEqual(new Set(['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE']));
    const percent = records.filter((record) => record.method === 'PERCENT_OF_MEDICARE');
    expect(new Set(percent.map((record) => record.parameters.conversion_factor))).toEqual(new Set(['non_qualifying_apm', 'qualifying_apm']));
    expect(percent.some((record) => record.parameters.year_basis === 'CURRENT')).toBe(true);
    expect(percent.some((record) => record.parameters.year_basis?.startsWith('LOCKED:') === true)).toBe(true);
    expect(claims.some((claim) => claim.inputs.mappings.some((mapping) => mapping.kind === 'ma_noncontracted'))).toBe(true);
    const claimLines = claims.flatMap((claim) => claim.inputs.claim.lines.map((line) => ({ line, settings: claim.inputs.place_of_service_settings })));
    expect(new Set(claimLines.map(({ line, settings }) => settings[line.place_of_service]))).toEqual(new Set(['facility', 'non_facility']));
    for (const modifier of ['CQ', 'CO']) {
      expect(claimLines.some(({ line }) => line.modifiers.includes(modifier)), modifier).toBe(true);
    }
    expect(new Set(claimLines.map(({ line }) => line.patient_share_adjustments.length > 0))).toEqual(new Set([true, false]));
    // Steps 7 and 8: underpaid and overpaid lines, and every window status.
    const priced = lines.filter((line) => line.outcome === 'priced');
    const sides = new Set(priced.map((line) => ((line.variance_cents ?? '0').startsWith('-') ? 'overpaid' : line.variance_cents === '0' ? 'even' : 'underpaid')));
    expect(sides.has('underpaid') && sides.has('overpaid')).toBe(true);
    expect(new Set(priced.map((line) => line.window?.status))).toEqual(new Set(['OPEN', 'WINDOW_PASSED', 'NO_WINDOW']));
    for (const id of ['PRC-05', 'PRC-06', 'PRC-07', 'PRC-10', 'PRC-11', 'PRC-14', 'PRC-15', 'claim status 19', 'claim status 20', 'UNITS_RULE_UNKNOWN', 'suspended sequestration', 'MPPR general rate']) {
      expect(covered.has(id), id).toBe(true);
    }
  });

  it('give a ZIP+4 only in G196-G199, under release 900006: a code opening each range, the last code of one, and a ZIP that needs none (PRC-21)', () => {
    // The founder's answer of 2026-10-21 to PR 6b's Q4 (a): the four claims are added under SYNTHETIC release 900006 and
    // no existing claim changes, so every other claim gives no ZIP+4 (docs/adr/0064).
    const given = claims.filter((claim) => claim.inputs.practice_settings.zip_plus_four !== undefined);
    expect(given.map((claim) => [claim.id, claim.inputs.practice_settings.zip, claim.inputs.practice_settings.zip_plus_four])).toEqual([
      ['G196', '00012', '0001'],
      ['G197', '00012', '5000'],
      ['G198', '00011', '1234'],
      ['G199', '00012', '8999'],
    ]);
    for (const claim of given) {
      expect(claim.inputs.release, claim.id).toMatchObject({ number: 900006, dir: 'fixtures/synthetic/rules/release-synth-900006' });
      expect(claim.covers, claim.id).toContain('PRC-21');
    }
    expect(claims.filter((claim) => claim.inputs.release.number === 900006).map((claim) => claim.id)).toEqual(given.map((claim) => claim.id));
    // The ZIP+4 changes the amount: 00012-5000 (locality 02) and 00012-0001 (locality 01) price one line differently.
    const allowed = (id: string) => given.find((claim) => claim.id === id)?.expected.lines[0]?.expected_unrounded_cents;
    expect(allowed('G197')).not.toBe(allowed('G196'));
    expect(allowed('G198')).toBe(allowed('G196'));
  });
});
