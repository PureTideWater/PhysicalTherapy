import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The synthetic audit's independent worksheet is Python (standard library only) so that it shares no
 * code with packages/triage or the report job. `pnpm test` checks that the committed expected files
 * are what it computes from inputs.json now, isolated (-I) so nothing from the environment is
 * imported, and that it refuses inputs whose windows would make the report depend on the triage date.
 */
const WORKSHEET = 'tools/audit-worksheet/audit_worksheet.py';
const AUDIT = path.join(repositoryRoot, 'fixtures/synthetic/audit/AUDIT-01');

function worksheet(...args: string[]) {
  return spawnSync('python3', ['-I', '-B', WORKSHEET, ...args], { cwd: repositoryRoot, encoding: 'utf8' });
}

describe('the synthetic audit worksheet', () => {
  it('recomputes the committed expected report and line CSV exactly, leaving no bytecode', () => {
    const result = worksheet('check');
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(path.join(repositoryRoot, 'tools/audit-worksheet/__pycache__'))).toBe(false);
  });

  it('keeps the four kinds of line apart: one case, a held pattern, a passed window and an anomaly in no total', () => {
    const report = JSON.parse(readFileSync(path.join(AUDIT, 'expected-report.json'), 'utf8')) as { headline: Record<string, unknown>; cases: unknown[]; validated: { not_actionable: { reason: string }[] } };
    expect(report.headline).toMatchObject({ actionable_cents: '28000', payer_approved_cents: '0', recovered_cents: '0', flagged_lines: 4, validated_lines: 18 });
    expect(report.cases).toHaveLength(1);
    expect(report.validated.not_actionable.map((item) => item.reason).sort()).toEqual(['BELOW_CASE_MATERIALITY', 'BELOW_LINE_MATERIALITY', 'WINDOW_PASSED']);
  });

  it('refuses inputs whose window ends inside the stable range, and writes nothing then', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-audit-worksheet-'));
    try {
      const inputs = JSON.parse(readFileSync(path.join(AUDIT, 'inputs.json'), 'utf8')) as { plans: { contract?: { dispute_window_days: number } }[] };
      const short = inputs.plans[1]?.contract;
      if (short !== undefined) {
        short.dispute_window_days = 400;
      }
      writeFileSync(path.join(dir, 'inputs.json'), JSON.stringify(inputs));
      const result = worksheet('write', dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('inside the stable range');
      expect(existsSync(path.join(dir, 'expected-report.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
