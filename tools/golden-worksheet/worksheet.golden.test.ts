import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The pricing oracle (PRD section 18; fixtures/golden/README.md). Every golden claim is recomputed by
 * the independent worksheet, and any difference from the committed expected results or worksheet
 * fails. Milestone 5 adds the engine's comparison beside this one. With `pnpm test:golden --report`
 * (TP_GOLDEN_REPORT), the differences are written to fixtures/golden/.report; fixtures are never
 * touched.
 */
const WORKSHEET = 'tools/golden-worksheet/golden_worksheet.py';
const CLAIMS = 'fixtures/golden/claims';
const COMPUTED_BY = 'independent worksheet tools/golden-worksheet';

/** The unpriced reasons phase one (milestone 5) can produce; the others arrive with NCCI, minute logs and the engine itself. */
const PHASE_ONE_REASONS = [
  'NO_MAPPING',
  'NO_AGREEMENT',
  'AMBIGUOUS_RATE',
  'NO_RATE_FOR_CODE',
  'NO_PFS_VALUE',
  'SECONDARY_PAYER',
  'DATE_OUTSIDE_VERSIONS',
  'REVERSED_CLAIM',
  'UNSUPPORTED_METHOD',
];
const LATER_REASONS = ['MUE_EXCEEDED', 'UNITS_RULE_UNKNOWN', 'ENGINE_ERROR'];

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
}

interface RateRecord {
  readonly method: string;
  readonly parameters: { readonly year_basis?: string; readonly conversion_factor?: string };
  readonly flags: Record<string, boolean | string | null>;
}

interface GoldenClaim {
  readonly id: string;
  readonly covers: readonly string[];
  readonly inputs: {
    readonly place_of_service_settings: Record<string, string>;
    readonly claim: { readonly lines: readonly { readonly modifiers: readonly string[]; readonly place_of_service: string; readonly patient_share_adjustments: readonly unknown[] }[] };
    readonly mappings: readonly { readonly kind: string }[];
    readonly contract_versions: readonly { readonly rate_records: readonly RateRecord[] }[];
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
    'The engine comparison is added in milestone 5. Nothing under fixtures/golden was changed; a golden line changes only by hand, with the specialist.',
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

  it('hold one hundred lines, each claim with its provenance', () => {
    expect(lines).toHaveLength(100);
    expect(new Set(claims.map((claim) => claim.id)).size).toBe(claims.length);
    for (const claim of claims) {
      expect(claim.provenance.computed_by, claim.id).toBe(COMPUTED_BY);
      expect(typeof claim.provenance.specialist_verified, claim.id).toBe('boolean');
    }
  });

  it('cover every unpriced reason of phase one and none of the later ones', () => {
    const table = readFileSync(path.join(repositoryRoot, 'docs/product/unpriced-reasons.md'), 'utf8');
    const listed = [...table.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1]);
    expect([...PHASE_ONE_REASONS, ...LATER_REASONS].sort()).toEqual([...listed].sort());
    const reasons = new Set(lines.map((line) => line.unpriced_reason).filter((reason) => reason !== undefined));
    expect([...reasons].sort()).toEqual([...PHASE_ONE_REASONS].sort());
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
    for (const flag of ['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration']) {
      expect(new Set(records.map((record) => record.flags[flag])), flag).toEqual(new Set([true, false]));
    }
    expect(claims.some((claim) => claim.inputs.mappings.some((mapping) => mapping.kind === 'ma_noncontracted'))).toBe(true);
    const claimLines = claims.flatMap((claim) => claim.inputs.claim.lines.map((line) => ({ line, settings: claim.inputs.place_of_service_settings })));
    expect(new Set(claimLines.map(({ line, settings }) => settings[line.place_of_service]))).toEqual(new Set(['facility', 'non_facility']));
    for (const modifier of ['CQ', 'CO']) {
      expect(claimLines.some(({ line }) => line.modifiers.includes(modifier)), modifier).toBe(true);
    }
    expect(new Set(claimLines.map(({ line }) => line.patient_share_adjustments.length > 0))).toEqual(new Set([true, false]));
  });
});
