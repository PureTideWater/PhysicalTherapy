import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type IndexedRelease, UNPRICED_REASONS, indexRelease, price, recompute } from '@tp/pricing';
import { type ReleaseContents, readRelease } from '@tp/rules/content';
import { afterAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { type EngineDifference, type EngineRun, GOLDEN_CLAIMS_DIR, type GoldenClaim, engineDifferences, goldenPricingInput, readGoldenClaims } from './engine';

/**
 * The pricing oracle against the engine (PRD section 18; milestone 5's done check: "every golden line
 * matches to the cent ... and the trace recompute test passes"; milestone 7's: "200 golden lines across
 * five fixture payers match to the cent"). The engine prices every golden claim
 * from the claim's own inputs (tools/golden-worksheet/engine.ts) and must match every expected line
 * field by field, while the lines are still the independent worksheet's (specialist_verified false):
 * a difference fails, and is explained with the golden-diff skill, never by editing a golden file.
 * Every line's trace must recompute (PRC-16). With `pnpm test:golden --report` (TP_GOLDEN_REPORT) the
 * differences are written to fixtures/golden/.report/engine.{json,md} beside the worksheet's.
 *
 * Each claim is priced in a test of its own, and nothing the engine computes for one claim is reused by another's
 * test (docs/adr/0066, Part 4): mutation testing credits each mutant to the tests that ran its code (Stryker's perTest
 * coverage) and reruns only those, so a claim priced once for the whole file, or a release index shared between
 * claims, would leave every other claim's assertions out of that mutant's run. The last test holds the file to the
 * claims under fixtures/golden, each priced in exactly one test, and to the breadth of lines those tests check.
 */

interface RecomputeDifference {
  readonly file: string;
  readonly case: string;
  readonly line_no: number;
  readonly field: string;
  readonly stored: unknown;
  readonly recomputed: unknown;
}

function cell(value: unknown): string {
  return value === null || value === undefined ? '' : JSON.stringify(value).replaceAll('|', '\\|');
}

function writeReport(directory: string, report: { files: number; cases: number; lines: number; unverified: number; differences: readonly EngineDifference[]; recompute: readonly RecomputeDifference[] }): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'engine.json'), `${JSON.stringify({ comparison: 'the engine (packages/pricing) against the golden expected results', ...report }, null, 2)}\n`);
  const rows = report.differences.map((item) => `| ${item.file} | ${item.case} | ${String(item.line_no)} | ${item.field} | ${cell(item.golden)} | ${cell(item.engine)} |`);
  const recomputed = report.recompute.map((item) => `| ${item.file} | ${item.case} | ${String(item.line_no)} | ${item.field} | ${cell(item.stored)} | ${cell(item.recomputed)} |`);
  const body = [
    '# Golden differences: the engine against the committed golden lines',
    '',
    `${String(report.cases)} claim(s), ${String(report.lines)} line(s), ${String(report.differences.length)} difference(s). ${String(report.unverified)} claim(s) not yet verified by the reimbursement specialist.`,
    'Nothing under fixtures/golden was changed; a golden line changes only by hand, with the specialist. The worksheet comparison is in worksheet.md beside this file.',
    '',
    ...(rows.length === 0 ? ['No differences.'] : ['| File | Case | Line | Field | Golden | Engine |', '| --- | --- | --- | --- | --- | --- |', ...rows]),
    '',
    '## Trace recompute (PRC-16)',
    '',
    ...(recomputed.length === 0 ? ['Every trace recomputes to its stored result.'] : ['| File | Case | Line | Field | Stored | Recomputed |', '| --- | --- | --- | --- | --- | --- |', ...recomputed]),
    '',
  ];
  writeFileSync(path.join(directory, 'engine.md'), body.join('\n'));
}

/**
 * One golden claim priced, in the test that checks it: its run, its lines, and every way its stored traces fail to
 * recompute. `release` is the release the claim names, indexed for this claim alone.
 */
function pricedClaim(file: string, claim: GoldenClaim, release: IndexedRelease) {
  const runs: EngineRun[] = [{ file, claim, results: price({ ...goldenPricingInput(claim), release }) }];
  const results = runs.flatMap((run) => run.results.map((result) => ({ run, result })));

  /** PRC-16: each line's stored trace, read back as JSON, recomputes to the stored result. */
  const recomputeDifferences: RecomputeDifference[] = results.flatMap(({ run, result }) => {
    const where = { file: run.file, case: run.claim.id, line_no: result.lineNo };
    const again = recompute(JSON.parse(JSON.stringify(result.trace)));
    const found: RecomputeDifference[] = again.differences.map((difference) => ({ ...where, field: 'trace', stored: difference, recomputed: null }));
    if (again.outcome !== result.outcome) {
      found.push({ ...where, field: 'outcome', stored: result.outcome, recomputed: again.outcome });
    } else if (again.outcome === 'priced' && result.outcome === 'priced') {
      for (const [field, stored, recomputed] of [
        ['expected_allowed_cents', result.expectedAllowedCents.toString(), again.expectedAllowedCents.toString()],
        ['expected_unrounded_cents', result.expectedUnroundedCents.toString(), again.expectedUnroundedCents.toString()],
        ['base_cents', result.baseCents.toString(), again.baseCents.toString()],
        ['rounding', result.rounding, again.rounding],
        ['adjustments', JSON.stringify(result.adjustments), JSON.stringify(again.adjustments)],
        ['review_flags', JSON.stringify(result.reviewFlags.map((flag) => [flag.flag, flag.column1LineNo])), JSON.stringify(again.reviewFlags.map((flag) => [flag.flag, flag.column1LineNo]))],
      ] as const) {
        if (stored !== recomputed) {
          found.push({ ...where, field, stored, recomputed });
        }
      }
    } else if (again.outcome === 'unpriced' && result.outcome === 'unpriced' && again.reason !== result.reason) {
      found.push({ ...where, field: 'unpriced_reason', stored: result.reason, recomputed: again.reason });
    }
    return found;
  });
  return { runs, results, recomputeDifferences };
}

describe('golden lines priced by the engine', () => {
  // Read once, while the tests are collected: the golden claims and each release they name, as files. Nothing here
  // runs @tp/pricing, which each claim's test runs for that claim alone.
  const claims = readGoldenClaims();
  const releaseFiles = new Map<string, ReleaseContents>([...new Set(claims.map(({ claim }) => claim.inputs.release.dir))].map((dir) => [dir, readRelease(path.join(repositoryRoot, dir))]));

  /**
   * The release a claim names, indexed by that claim's test. goldenPricingInput checks the release (goldenRelease: its
   * files verify, and its number and manifest hash are the claim's), but keeps one index for every claim that names it,
   * and indexRelease and its record references are the engine's code; the trace's release, which each test asserts,
   * is this index's.
   */
  function claimRelease(claim: GoldenClaim): IndexedRelease {
    const release = releaseFiles.get(claim.inputs.release.dir) as ReleaseContents;
    return indexRelease({ releaseNo: release.manifest.release, manifestSha256: release.manifestSha256, records: release.records.map((located) => located.record) });
  }

  /** With `pnpm test:golden --report`, each claim's differences, which the report gathers once every claim has run. */
  const reportDir = process.env.TP_GOLDEN_REPORT;
  const report = reportDir !== undefined && reportDir !== '' ? { files: 0, cases: 0, lines: 0, unverified: 0, differences: [] as EngineDifference[], recompute: [] as RecomputeDifference[] } : null;
  afterAll(() => {
    if (reportDir !== undefined && report !== null) {
      writeReport(reportDir, report);
    }
  });

  it.each(claims)('$claim.id: every line to the cent and field by field, recomputed from its trace, under the release the claim names, its ZIP+4 read as PRC-21 says', ({ file, claim }) => {
    const { runs, results, recomputeDifferences } = pricedClaim(file, claim, claimRelease(claim));

    // Match every golden line to the cent, field by field, variance and window included, though no line is specialist-verified yet.
    const differences = engineDifferences(runs);
    if (report !== null) {
      report.files += runs.length;
      report.cases += runs.length;
      report.lines += results.length;
      report.unverified += runs.filter((run) => !run.claim.provenance.specialist_verified).length;
      report.differences.push(...differences);
      report.recompute.push(...recomputeDifferences);
    }
    expect(results.length).toBe(runs.reduce((count, run) => count + run.claim.expected.lines.length, 0));
    expect(differences).toEqual([]);

    // Recompute from their traces alone to the stored amount, every line (PRC-16).
    expect(recomputeDifferences).toEqual([]);

    // Price under the release each claim names, recorded in every trace.
    for (const { run, result } of results) {
      expect(result.trace.release, run.claim.id).toEqual({ number: run.claim.inputs.release.number, manifest_sha256: run.claim.inputs.release.manifest_sha256 });
    }

    // Price a ZIP that spans localities at the range holding its ZIP+4, and read no ZIP+4 of a ZIP with one locality (PRC-21; docs/adr/0064).
    const given = results.filter(({ run }) => run.claim.inputs.practice_settings.zip_plus_four !== undefined);
    const read: string[] = [];
    for (const { run, result } of given) {
      const zipPlusFour = run.claim.inputs.practice_settings.zip_plus_four;
      expect(result.trace.settings.zip_plus_four, run.claim.id).toBe(zipPlusFour);
      expect(result.outcome, run.claim.id).toBe('priced');
      const locality = result.trace.steps.fee_schedule?.locality;
      expect(locality, run.claim.id).toBeDefined();
      if (locality?.plus_four_required === true) {
        const range = locality.plus_four;
        expect(range?.zip_plus_four, run.claim.id).toBe(zipPlusFour);
        expect(range !== undefined && zipPlusFour !== undefined && range.from <= zipPlusFour && zipPlusFour <= range.to, run.claim.id).toBe(true);
        expect(result.trace.steps.fee_schedule?.gpci?.record.key, run.claim.id).toEqual({ carrier: range?.carrier, locality: range?.locality });
        read.push(`${run.claim.id} ${range?.locality ?? ''}`);
      } else {
        expect(locality?.plus_four, run.claim.id).toBeUndefined();
      }
    }
    // G196, G197 and G199 read the range holding their ZIP+4; G198's ZIP has one locality.
    expect(read.sort()).toEqual(['G196 01', 'G197 02', 'G199 02'].filter((entry) => entry.startsWith(`${claim.id} `)));
    // Every other golden line's trace is as the engine wrote it before the ZIP+4: no ZIP+4 in the settings, no range.
    for (const { run, result } of results.filter(({ run }) => run.claim.inputs.practice_settings.zip_plus_four === undefined)) {
      expect(result.trace.settings, run.claim.id).not.toHaveProperty('zip_plus_four');
      expect(result.trace.steps.fee_schedule?.locality?.plus_four, run.claim.id).toBeUndefined();
    }
  });

  it('prices every golden claim in exactly one test, and the claims hold every line, method, reason and ZIP+4 their tests check', ({ task }) => {
    // The claim ids under fixtures/golden, read here apart from readGoldenClaims, against the tests this file registered:
    // one test per claim, named by its id.
    const directory = path.join(repositoryRoot, GOLDEN_CLAIMS_DIR);
    const onDisk = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => (JSON.parse(readFileSync(path.join(directory, name), 'utf8')) as { id: string }).id);
    const tested = (task.suite?.tasks ?? []).filter((item) => item.type === 'test' && item.id !== task.id).map((item) => item.name.slice(0, item.name.indexOf(':')));
    expect(onDisk.length).toBe(claims.length);
    expect(new Set(onDisk).size).toBe(onDisk.length);
    expect(tested.sort()).toEqual(onDisk.sort());

    // Each claim's test holds the engine to these lines field by field (outcome, reason, method, review flags and
    // adjustments, in the result and its trace), so what the lines hold the engine produced.
    const lines = claims.flatMap(({ claim }) => claim.expected.lines);
    // The hundred lines of milestone 5, the lines added for its later branches, and milestone 7's two hundred across five fixture payers.
    expect(lines.length).toBeGreaterThanOrEqual(200);
    expect(lines.filter((line) => line.outcome === 'priced').length).toBeGreaterThan(200);
    // Every method that prices, and the per-visit zero lines and review flags, recompute from their traces.
    const priced = lines.filter((line) => line.outcome === 'priced');
    expect(new Set(priced.map((line) => line.method))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT']));
    expect(priced.some((line) => (line.review_flags ?? []).length > 0)).toBe(true);
    expect(priced.some((line) => (line.adjustments ?? []).some((item) => item.name === 'contract_adjustment'))).toBe(true);
    // Produce every reason a golden line can hold.
    const reasons = new Set(lines.flatMap((line) => (line.outcome === 'unpriced' ? [line.unpriced_reason] : [])));
    // A golden line is never an engine error; the unit tests produce ENGINE_ERROR.
    expect([...reasons].sort()).toEqual(UNPRICED_REASONS.filter((reason) => reason !== 'ENGINE_ERROR').sort());
    // G196-G199: 0001 and 5000 open a range, 8999 closes one, and 1234 is on a ZIP the ZIP5 record does not flag.
    expect(new Set(claims.filter(({ claim }) => claim.inputs.practice_settings.zip_plus_four !== undefined).map(({ claim }) => claim.id))).toEqual(new Set(['G196', 'G197', 'G198', 'G199']));
  });
});
