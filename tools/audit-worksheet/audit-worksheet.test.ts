import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { COMPUTED_CONTRACT_WINDOW_RULE, DISPUTE_WINDOW_STARTS, DISPUTE_WINDOW_UNITS } from '@tp/contracts';
import { NOT_ACTIONABLE_REASONS } from '@tp/triage';
import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The synthetic audit's independent worksheet is Python (standard library only) so that it shares no
 * code with packages/triage or the report job. `pnpm test` checks that the committed expected files
 * are what it computes from inputs.json now, isolated (-I) so nothing from the environment is
 * imported, that it refuses inputs whose windows would make the report depend on the triage date, that a
 * contract window without its evidence leaves its lines' deadlines unverified (D17 a), and that a window whose
 * evidence states a rule the product does not compute (anything but calendar days after the remittance date) does
 * too (best-option audit #5).
 */
const WORKSHEET = 'tools/audit-worksheet/audit_worksheet.py';
const AUDIT = path.join(repositoryRoot, 'fixtures/synthetic/audit/AUDIT-01');

function worksheet(...args: string[]) {
  return spawnSync('python3', ['-I', '-B', WORKSHEET, ...args], { cwd: repositoryRoot, encoding: 'utf8' });
}

/** The worksheet's own module-level constants, read by importing it isolated (-I) and without bytecode (-B). */
function worksheetConstants(...names: string[]): unknown[] {
  const read = spawnSync(
    'python3',
    [
      '-I',
      '-B',
      '-c',
      'import importlib.util, json, sys; spec = importlib.util.spec_from_file_location("worksheet", sys.argv[1]); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); print(json.dumps([getattr(module, name) for name in sys.argv[2:]]))',
      WORKSHEET,
      ...names,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  expect(read.status, read.stderr).toBe(0);
  return JSON.parse(read.stdout) as unknown[];
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

  it('verifies a contract line’s deadline only from its contract’s window evidence: without it, every line waits and nothing is actionable (D17 a)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-audit-worksheet-'));
    try {
      const inputs = JSON.parse(readFileSync(path.join(AUDIT, 'inputs.json'), 'utf8')) as { plans: { contract?: { dispute_window_evidence?: unknown } }[] };
      expect(inputs.plans.filter((plan) => plan.contract !== undefined).map((plan) => plan.contract?.dispute_window_evidence !== undefined)).toEqual([true, true]);
      for (const plan of inputs.plans) {
        delete plan.contract?.dispute_window_evidence;
      }
      writeFileSync(path.join(dir, 'inputs.json'), JSON.stringify(inputs));
      const result = worksheet('write', dir);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(path.join(dir, 'expected-report.json'), 'utf8')) as {
        headline: Record<string, unknown>;
        cases: unknown[];
        validated: { lines: number; not_actionable: { reason: string; lines: number }[] };
        evidence_gaps: { kind: string; reason: string | null; lines: number }[];
      };
      // Validated as before (the prices are unchanged); actionable falls to zero, the approved consequence.
      expect(report.headline).toMatchObject({ actionable_cents: '0', actionable_lines: 0, validated_lines: 18 });
      expect(report.cases).toEqual([]);
      expect(report.validated.not_actionable.find((item) => item.reason === 'DEADLINE_UNVERIFIED')?.lines).toBe(report.validated.lines);
      expect(report.evidence_gaps).toContainEqual(expect.objectContaining({ kind: 'deadline_unverified', reason: 'DEADLINE_UNVERIFIED', lines: report.validated.lines }));
      expect(readFileSync(path.join(dir, 'expected-lines.csv'), 'utf8')).not.toContain(',case,');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('verifies a contract window only when its evidence states the rule the product computes: one counted from the date of service, or in business days, leaves its lines waiting (best-option audit #5)', () => {
    type Inputs = { plans: { key: string; contract?: { dispute_window_evidence?: Record<string, unknown> } }[] };
    const original = JSON.parse(readFileSync(path.join(AUDIT, 'inputs.json'), 'utf8')) as Inputs;
    expect(original.plans.flatMap((plan) => (plan.contract?.dispute_window_evidence === undefined ? [] : [plan.contract.dispute_window_evidence]))).toEqual([
      expect.objectContaining({ unit: 'calendar_days', measured_from: 'remittance_date' }),
      expect.objectContaining({ unit: 'calendar_days', measured_from: 'remittance_date' }),
    ]);
    for (const rule of [
      { unit: 'calendar_days', measured_from: 'date_of_service' },
      { unit: 'business_days', measured_from: 'remittance_date' },
      { unit: 'months', measured_from: 'payment_date' },
    ]) {
      const dir = mkdtempSync(path.join(tmpdir(), 'tp-audit-worksheet-'));
      try {
        const inputs = structuredClone(original);
        for (const plan of inputs.plans) {
          if (plan.contract?.dispute_window_evidence !== undefined) {
            plan.contract.dispute_window_evidence = { ...plan.contract.dispute_window_evidence, ...rule };
          }
        }
        writeFileSync(path.join(dir, 'inputs.json'), JSON.stringify(inputs));
        const result = worksheet('write', dir);
        expect(result.status, result.stderr).toBe(0);
        const report = JSON.parse(readFileSync(path.join(dir, 'expected-report.json'), 'utf8')) as {
          headline: Record<string, unknown>;
          cases: unknown[];
          validated: { lines: number; not_actionable: { reason: string; lines: number }[] };
        };
        // Priced and validated as before; no deadline is verified, so nothing is actionable.
        expect(report.headline, JSON.stringify(rule)).toMatchObject({ actionable_cents: '0', actionable_lines: 0, validated_lines: 18 });
        expect(report.cases).toEqual([]);
        expect(report.validated.not_actionable.find((item) => item.reason === 'DEADLINE_UNVERIFIED')?.lines).toBe(report.validated.lines);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('refuses window evidence that names no unit or start from the fixed lists, and writes nothing then', () => {
    for (const wrong of [{ unit: 'days' }, { measured_from: 'claim_date' }, { unit: undefined }]) {
      const dir = mkdtempSync(path.join(tmpdir(), 'tp-audit-worksheet-'));
      try {
        const inputs = JSON.parse(readFileSync(path.join(AUDIT, 'inputs.json'), 'utf8')) as { plans: { contract?: { dispute_window_evidence?: Record<string, unknown> } }[] };
        const evidence = inputs.plans[0]?.contract?.dispute_window_evidence;
        if (evidence !== undefined && inputs.plans[0]?.contract !== undefined) {
          inputs.plans[0].contract.dispute_window_evidence = { ...evidence, ...wrong };
        }
        writeFileSync(path.join(dir, 'inputs.json'), JSON.stringify(inputs));
        const result = worksheet('write', dir);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('names its unit');
        expect(existsSync(path.join(dir, 'expected-report.json'))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('lists the window’s units and starts, and computes one rule, exactly as @tp/contracts does (best-option audit #5)', () => {
    const [units, starts, computed] = worksheetConstants('WINDOW_UNITS', 'WINDOW_STARTS', 'COMPUTED_WINDOW_RULE') as [string[], string[], string[]];
    expect(units).toEqual([...DISPUTE_WINDOW_UNITS]);
    expect(starts).toEqual([...DISPUTE_WINDOW_STARTS]);
    expect(computed).toEqual([COMPUTED_CONTRACT_WINDOW_RULE.unit, COMPUTED_CONTRACT_WINDOW_RULE.measuredFrom]);
    expect(existsSync(path.join(repositoryRoot, 'tools/audit-worksheet/__pycache__'))).toBe(false);
  });

  it('lists the reasons a validated line waits in the report’s order, @tp/triage’s, with the case materiality last', () => {
    const [order] = worksheetConstants('NOT_ACTIONABLE_ORDER') as [string[]];
    expect(order.at(-1)).toBe('BELOW_CASE_MATERIALITY');
    expect(order).toEqual(expect.arrayContaining(['VERSION_NOT_SIGNED_OFF', 'VERSION_NOT_IN_FORCE', 'RELEASE_WITHDRAWN']));
    // Every reason the worksheet lists is triage's, in triage's order (the report's, report/content.ts).
    const report = [...NOT_ACTIONABLE_REASONS, 'BELOW_CASE_MATERIALITY'];
    expect(order.slice(0, -1).every((reason) => (NOT_ACTIONABLE_REASONS as readonly string[]).includes(reason))).toBe(true);
    expect(report.filter((reason) => order.includes(reason))).toEqual(order);
    expect(existsSync(path.join(repositoryRoot, 'tools/audit-worksheet/__pycache__'))).toBe(false);
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
