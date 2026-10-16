import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { evaluateChecklist, utcDate, type EvidenceRecord, type RestoreDrillRow } from './checklist';
import { CONTROLS, type Control } from './controls';
import { buildExport, complianceExportSchema, CompliancePlatformError, EXPORT_FORMAT, exportFileName, FileCompliancePlatform, MemoryCompliancePlatform, serializeExport } from './export';
import { POLICIES, policyApprovalSubject, policyById } from './policies';

const HASH = 'a'.repeat(64);
const record = (kind: EvidenceRecord['kind'], subject: string, occurredOn: string): EvidenceRecord => ({ kind, subject, occurredOn, documentRef: `evidence/${kind}.pdf`, sha256: HASH });
const drill = (outcome: string, completed: string | null): RestoreDrillRow => ({ startedAt: new Date(`${completed ?? '2026-10-01'}T03:00:00Z`), completedAt: completed === null ? null : new Date(`${completed}T03:20:00Z`), outcome, catalogProblems: 0 });

const STAFF = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2'];

function everything(today: string): EvidenceRecord[] {
  return [
    ...POLICIES.map((policy) => record('policy_approval', policyApprovalSubject(policy), today)),
    record('access_review', 'quarterly-access-review', today),
    record('tabletop_exercise', 'incident-response-tabletop', today),
    record('vendor_review', 'subprocessor-inventory', today),
    record('risk_analysis', 'risk-analysis', today),
    record('security_official', STAFF[0] ?? '', today),
    ...STAFF.map((member) => record('training_attestation', member, today)),
  ];
}

describe('evaluateChecklist', () => {
  it('shows nothing a person must do as done before it is recorded', () => {
    const checklist = evaluateChecklist({ today: '2026-10-16', records: [], restoreDrills: [], workforce: STAFF });
    expect(checklist.controls).toHaveLength(17);
    expect(checklist.policies.every((policy) => policy.status === 'awaiting_approval')).toBe(true);
    const statuses = new Set(checklist.controls.flatMap((control) => control.evidence.map((item) => item.status)));
    expect(statuses).toEqual(new Set(['in_repository', 'awaiting_approval', 'missing', 'collected_externally', 'not_built']));
    // Only the controls whose evidence is all in the repository are ready before people act.
    expect(checklist.controls.filter((control) => control.status === 'ready').map((control) => control.control.id)).toEqual(['logging_discipline', 'upload_safety', 'secrets', 'network']);
    expect(checklist.controls.filter((control) => control.status === 'partial').map((control) => control.control.id)).toEqual(['audit_log']);
    expect(checklist.counts).toEqual({ ready: 4, action_needed: 12, partial: 1 });
    expect(checklist.program.map((item) => item.status)).toEqual(['missing', 'missing']);
  });

  it('is ready once every record is current, partial where a later milestone builds evidence', () => {
    const today = '2026-10-16';
    const checklist = evaluateChecklist({ today, records: everything(today), restoreDrills: [drill('passed', '2026-10-01')], workforce: STAFF });
    const byId = Object.fromEntries(checklist.controls.map((control) => [control.control.id, control.status]));
    expect(byId.encryption).toBe('partial');
    expect(byId.audit_log).toBe('partial');
    expect(Object.entries(byId).filter(([, status]) => status !== 'ready').map(([id]) => id)).toEqual(['encryption', 'audit_log']);
    expect(checklist.counts).toEqual({ ready: 15, action_needed: 0, partial: 2 });
    expect(checklist.policies.every((policy) => policy.status === 'approved' && policy.approvedOn === today)).toBe(true);
    expect(checklist.program.map((item) => item.status)).toEqual(['current', 'current']);
  });

  it('marks a record past its period stale, and an approval of an older version as no approval', () => {
    const records = [
      record('access_review', 'quarterly-access-review', '2026-07-01'),
      record('policy_approval', 'access-control:0.0', '2026-10-01'),
      record('policy_approval', policyApprovalSubject(policyById('incident-response')), '2025-10-01'),
    ];
    const checklist = evaluateChecklist({ today: '2026-10-16', records, restoreDrills: [], workforce: STAFF });
    const review = checklist.controls.find((control) => control.control.id === 'access_reviews')?.evidence[0];
    expect(review?.status).toBe('stale');
    expect(review?.latest?.occurredOn).toBe('2026-07-01');
    expect(checklist.policies.find((policy) => policy.policy.id === 'access-control')?.status).toBe('awaiting_approval');
    expect(checklist.policies.find((policy) => policy.policy.id === 'incident-response')?.status).toBe('stale');
    const incident = checklist.controls.find((control) => control.control.id === 'incident_response')?.evidence.find((item) => item.source.kind === 'policy');
    expect(incident?.status).toBe('stale');
    expect(incident?.note).toContain('past its yearly review');
    // On the last day of the period the record still counts.
    expect(evaluateChecklist({ today: '2026-10-01', records, restoreDrills: [], workforce: STAFF }).controls.find((control) => control.control.id === 'access_reviews')?.evidence[0]?.status).toBe('current');
  });

  it('counts each workforce member’s attestation on its own', () => {
    const today = '2026-10-16';
    const records = [record('training_attestation', STAFF[0] ?? '', '2026-01-01'), record('training_attestation', STAFF[1] ?? '', '2025-01-01'), record('training_attestation', 'someone-else', today)];
    const workforce = evaluateChecklist({ today, records, restoreDrills: [], workforce: STAFF }).controls.find((control) => control.control.id === 'workforce')?.evidence[0];
    expect(workforce?.status).toBe('stale');
    expect(workforce?.outstanding).toEqual([STAFF[1]]);
    expect(workforce?.latest?.occurredOn).toBe('2026-01-01');
    const none = evaluateChecklist({ today, records: [], restoreDrills: [], workforce: STAFF }).controls.find((control) => control.control.id === 'workforce')?.evidence[0];
    expect(none?.status).toBe('missing');
    expect(none?.outstanding).toEqual(STAFF);
    const nobody = evaluateChecklist({ today, records, restoreDrills: [], workforce: [] }).controls.find((control) => control.control.id === 'workforce')?.evidence[0];
    expect(nobody?.status).toBe('missing');
    expect(nobody?.note).toBe('no internal workforce is recorded');
    const all = evaluateChecklist({ today, records: STAFF.map((member) => record('training_attestation', member, today)), restoreDrills: [], workforce: STAFF }).controls.find((control) => control.control.id === 'workforce')?.evidence[0];
    expect(all?.status).toBe('current');
  });

  it('reads the restore drill’s rows: the latest passing within 35 days, a failure, or none', () => {
    const status = (drills: RestoreDrillRow[]) => evaluateChecklist({ today: '2026-10-16', records: [], restoreDrills: drills, workforce: [] }).controls.find((control) => control.control.id === 'backups_and_restore')?.evidence[0];
    expect(status([drill('passed', '2026-09-20')])?.status).toBe('current');
    expect(status([drill('passed', '2026-09-01')])?.status).toBe('stale');
    expect(status([drill('failed', null), drill('passed', '2026-10-10')])?.status).toBe('failed');
    expect(status([{ ...drill('passed', '2026-10-10'), completedAt: null }])?.status).toBe('failed');
    expect(status([])?.status).toBe('missing');
  });

  it('refuses a date that is not a calendar date, and an unknown policy', () => {
    expect(() => evaluateChecklist({ today: '2026-13-45', records: [], restoreDrills: [], workforce: [] })).toThrow('YYYY-MM-DD');
    expect(() => evaluateChecklist({ today: 'today', records: [], restoreDrills: [], workforce: [] })).toThrow('YYYY-MM-DD');
    const stray: Control = { ...CONTROLS[0], evidence: [{ kind: 'policy', policy: 'nonexistent' as never }] } as Control;
    expect(() => evaluateChecklist({ today: '2026-10-16', records: [], restoreDrills: [], workforce: [] }, [stray])).toThrow('no policy');
    expect(() => policyById('nonexistent' as never)).toThrow('no policy');
    expect(utcDate(new Date('2026-10-16T23:59:59Z'))).toBe('2026-10-16');
  });
});

describe('the export', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tp-compliance-'));
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const today = '2026-10-16';
  const checklist = evaluateChecklist({ today, records: everything(today), restoreDrills: [drill('passed', '2026-10-01')], workforce: STAFF });
  const generatedAt = new Date('2026-10-16T12:34:56.789Z');

  it('is the checklist in tp-compliance-evidence/1, every control with its criteria and evidence', () => {
    const evidence = buildExport(checklist, { environment: 'test', generatedAt });
    expect(evidence.format).toBe(EXPORT_FORMAT);
    expect(evidence.controls.map((control) => control.id)).toEqual(CONTROLS.map((control) => control.id));
    expect(evidence.counts).toEqual(checklist.counts);
    expect(evidence.criteria_note).toContain('proposed mapping');
    const kinds = new Set(evidence.controls.flatMap((control) => control.evidence.map((item) => item.kind)));
    expect(kinds).toEqual(new Set(['ci_job', 'database_test', 'unit_test', 'e2e_test', 'cdk_assertion', 'runbook', 'policy', 'record', 'external', 'not_built']));
    const drillItem = evidence.controls.find((control) => control.id === 'backups_and_restore')?.evidence[0];
    expect(drillItem).toMatchObject({ kind: 'record', reference: 'restore_drill', status: 'current', latest: { occurred_on: '2026-10-01', document_ref: null, sha256: null } });
    expect(evidence.policies.every((policy) => policy.status === 'approved')).toBe(true);
    // Nothing in it names a person: the workforce appears only as a count.
    expect(JSON.stringify(evidence)).not.toContain(STAFF[1]);
  });

  it('serializes stably and is refused when it does not match the format', () => {
    const evidence = buildExport(checklist, { environment: 'test', generatedAt });
    const first = serializeExport(evidence);
    expect(serializeExport(JSON.parse(first.text) as typeof evidence)).toEqual(first);
    expect(first.text.endsWith('}\n')).toBe(true);
    expect(exportFileName(evidence, first.sha256)).toBe(`tp-compliance-evidence-20261016123456-${first.sha256.slice(0, 12)}.json`);
    expect(() => serializeExport({ ...evidence, format: 'other' } as never)).toThrow();
    expect(complianceExportSchema.safeParse({ ...evidence, controls: [] }).success).toBe(false);
  });

  it('goes to the compliance platform as a file written once, or into memory for tests', async () => {
    const evidence = buildExport(checklist, { environment: 'test', generatedAt });
    const platform = new FileCompliancePlatform(path.join(directory, 'outbox'));
    expect(platform.kind).toBe('file');
    const receipt = await platform.send(evidence);
    expect(readdirSync(path.join(directory, 'outbox'))).toEqual([receipt.reference]);
    expect(readFileSync(path.join(directory, 'outbox', receipt.reference), 'utf8')).toBe(serializeExport(evidence).text);
    await expect(platform.send(evidence)).rejects.toThrow(new CompliancePlatformError('this export was already sent'));
    const blocked = new FileCompliancePlatform(path.join(directory, 'outbox', receipt.reference, 'below'));
    await expect(blocked.send(evidence)).rejects.toThrow();
    const memory = new MemoryCompliancePlatform();
    expect(memory.kind).toBe('memory');
    expect(await memory.send(evidence)).toEqual({ reference: 'memory:1', sha256: receipt.sha256 });
    expect(memory.sent).toEqual([evidence]);
  });
});
