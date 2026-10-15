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
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
