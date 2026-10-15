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
});
