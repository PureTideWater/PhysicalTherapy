import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { UNPRICED_REASONS, recompute } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import { type EngineDifference, engineDifferences, runEngineOnGolden } from './engine';

/**
 * The pricing oracle against the engine (PRD section 18; milestone 5's done check: "every golden line
 * matches to the cent ... and the trace recompute test passes"; milestone 7's: "200 golden lines across
 * five fixture payers match to the cent"). The engine prices every golden claim
 * from the claim's own inputs (tools/golden-worksheet/engine.ts) and must match every expected line
 * field by field, while the lines are still the independent worksheet's (specialist_verified false):
 * a difference fails, and is explained with the golden-diff skill, never by editing a golden file.
 * Every line's trace must recompute (PRC-16). With `pnpm test:golden --report` (TP_GOLDEN_REPORT) the
 * differences are written to fixtures/golden/.report/engine.{json,md} beside the worksheet's.
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

describe('golden lines priced by the engine', () => {
  const runs = runEngineOnGolden();
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

  it('match every golden line to the cent, field by field, variance and window included, though no line is specialist-verified yet', () => {
    const differences = engineDifferences(runs);
    const reportDir = process.env.TP_GOLDEN_REPORT;
    if (reportDir !== undefined && reportDir !== '') {
      writeReport(reportDir, {
        files: runs.length,
        cases: runs.length,
        lines: results.length,
        unverified: runs.filter((run) => !run.claim.provenance.specialist_verified).length,
        differences,
        recompute: recomputeDifferences,
      });
    }
    // The hundred lines of milestone 5, the lines added for its later branches, and milestone 7's two hundred across five fixture payers.
    expect(results.length).toBeGreaterThanOrEqual(200);
    expect(results.length).toBe(runs.reduce((count, run) => count + run.claim.expected.lines.length, 0));
    expect(differences).toEqual([]);
  });

  it('recompute from their traces alone to the stored amount, every line (PRC-16)', () => {
    expect(recomputeDifferences).toEqual([]);
    expect(results.filter(({ result }) => result.outcome === 'priced').length).toBeGreaterThan(200);
    // Every method that prices, and the per-visit zero lines and review flags, recompute from their traces.
    const priced = results.flatMap(({ result }) => (result.outcome === 'priced' ? [result] : []));
    expect(new Set(priced.map((result) => result.method))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT']));
    expect(priced.some((result) => result.reviewFlags.length > 0)).toBe(true);
    expect(priced.some((result) => result.adjustments.some((item) => item.name === 'contract_adjustment'))).toBe(true);
  });

  it('produce every reason a golden line can hold', () => {
    const reasons = new Set(results.flatMap(({ result }) => (result.outcome === 'unpriced' ? [result.reason] : [])));
    // A golden line is never an engine error; the unit tests produce ENGINE_ERROR.
    expect([...reasons].sort()).toEqual(UNPRICED_REASONS.filter((reason) => reason !== 'ENGINE_ERROR').sort());
  });

  it('price under the release each claim names, recorded in every trace', () => {
    for (const { run, result } of results) {
      expect(result.trace.release, run.claim.id).toEqual({ number: run.claim.inputs.release.number, manifest_sha256: run.claim.inputs.release.manifest_sha256 });
    }
  });
});
