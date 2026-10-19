import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { auditFiles, auditLines, readAuditInputs } from './audit';
import { AUDIT_ROOT, auditDirectories, generatedAudit } from './audit-cli';

/**
 * The synthetic end-to-end audit's remittance (fixtures/synthetic/audit): built from its declarative
 * inputs by this package, deterministic, with the synthetic sender, and committed with the
 * expected.json the 835 oracle reads (regenerate with `tsx packages/synth/src/audit-cli.ts`).
 */
describe('the synthetic audits', () => {
  it('are committed as a fresh generation makes them', () => {
    expect(auditDirectories().map((dir) => path.basename(dir))).toEqual(['AUDIT-01']);
    for (const dir of auditDirectories()) {
      for (const [name, bytes] of generatedAudit(dir)) {
        expect(Buffer.from(bytes).equals(readFileSync(path.join(dir, name))), `${path.basename(dir)}/${name} differs from a fresh generation`).toBe(true);
      }
    }
  });

  it('expands the groups as inputs.json states: one claim per line, numbered, dates modulo 20 days, the synthetic sender', () => {
    const inputs = readAuditInputs(path.join(AUDIT_ROOT, 'AUDIT-01/inputs.json'));
    const lines = auditLines(inputs);
    expect(lines).toHaveLength(52);
    expect(lines[0]).toMatchObject({ payerClaimControlNumber: 'SYNCCNAUD010001', plan: 'SYNPLAN-AUD-FIX', code: '97110', units: 2, serviceDate: '2026-03-02' });
    expect(lines.at(-1)).toMatchObject({ payerClaimControlNumber: 'SYNCCNAUD010052', plan: 'SYNPLAN-AUD-OON', serviceDate: '2026-03-12' });
    const text = Buffer.from(auditFiles(inputs).remit).toString('latin1');
    expect(text).toMatch(/^ISA\*00\* {10}\*00\* {10}\*ZZ\*SYNTHSENDER {4}\*/);
    expect(text).toContain('GS*HP*SYNTH*');
    expect(text.match(/~CLP\*/g)).toHaveLength(52);
  });

  it('refuses inputs that are not synthetic, or name a plan the groups do not have', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-synth-audit-'));
    try {
      const inputs = JSON.parse(readFileSync(path.join(AUDIT_ROOT, 'AUDIT-01/inputs.json'), 'utf8')) as Record<string, unknown>;
      const write = (value: unknown) => {
        const file = path.join(dir, 'inputs.json');
        writeFileSync(file, JSON.stringify(value));
        return file;
      };
      expect(() => readAuditInputs(write({ ...inputs, synthetic: false }))).toThrow(/synthetic/);
      expect(() => readAuditInputs(write({ ...inputs, payer: { key: 'AUD', name: 'A REAL PAYER' } }))).toThrow(/SYNTHETIC/);
      expect(() => readAuditInputs(write({ ...inputs, groups: [{ plan: 'NOPLAN', code: '97110', units: 1, unit_charge_cents: '100', allowed_cents: '100', count: 1, first_service_date: '2026-03-02', note: '' }] }))).toThrow(/unknown plan/);
      expect(() => readAuditInputs(write({ ...inputs, format: 'other' }))).toThrow(/tp-audit-inputs/);
      // A contract window's evidence names a page and quotes the contract's own days (D17 a).
      const [fixed, ...others] = inputs.plans as { readonly contract?: object }[];
      const withEvidence = (evidence: object) => ({ ...inputs, plans: [{ ...fixed, contract: { ...fixed?.contract, dispute_window_evidence: evidence } }, ...others] });
      expect(() => readAuditInputs(write(withEvidence({ page: 0, quote: 'Disputes are raised within 3650 days of the remittance.', unit: 'calendar_days', measured_from: 'remittance_date' })))).toThrow(/names a page/);
      const quote = 'Disputes are raised within 3650 days of the remittance.';
      expect(() => readAuditInputs(write(withEvidence({ page: 1, quote: 'Disputes are raised within 90 days of the remittance.', unit: 'calendar_days', measured_from: 'remittance_date' })))).toThrow(/own days/);
      // And the rule its words state, from the fixed lists (best-option audit #5).
      expect(() => readAuditInputs(write(withEvidence({ page: 1, quote, measured_from: 'remittance_date' })))).toThrow(/names its unit/);
      expect(() => readAuditInputs(write(withEvidence({ page: 1, quote, unit: 'days', measured_from: 'remittance_date' })))).toThrow(/names its unit/);
      expect(() => readAuditInputs(write(withEvidence({ page: 1, quote, unit: 'calendar_days' })))).toThrow(/counts from/);
      expect(() => readAuditInputs(write(withEvidence({ page: 1, quote, unit: 'calendar_days', measured_from: 'claim_date' })))).toThrow(/counts from/);
      expect(readAuditInputs(write(withEvidence({ page: 1, quote, unit: 'business_days', measured_from: 'date_of_service' }))).plans[0]?.contract?.dispute_window_evidence).toMatchObject({ unit: 'business_days' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
