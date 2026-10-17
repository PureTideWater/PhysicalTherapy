import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, ERA_FORMAT_IDS, type EraFormatId, LocalKeyProvider, type PracticeCipher, databaseClient, documentObjectKey, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { syntheticXlsx } from '@tp/contracts/testing';
import { type MigratedDatabase, createMigratedDatabase, createTenantWorld, endPool } from '@tp/db/testing';
import { assertNoPhi, createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalLanding } from '../../intake/landing';
import { intakeHandler } from '../../intake/intake';
import { LocalScanService } from '../../intake/scan';
import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import type { JobContext } from '../../jobs/handlers';
import type { JobPayload, JobType } from '../../jobs/registry';
import { DocumentStore } from '../../storage/documents';
import { parseHandler } from '../job';
import type { ReportedTransaction } from '../report';
import type { ReportedExportError, ReportedExportPayment } from './report';

/**
 * ERA exports as first-class intake (Change Order 001, CO-03; reconciliation-001 D12 (a) and D13 (a); docs/adr/0060),
 * against PostgreSQL as the application role in each job's scope: each of the four vendor fixtures
 * (fixtures/synthetic/emr/<format_id>/) uploads, is classified as an era_export of its format, and loads through
 * the parse job into remittances, claims and lines whose decrypted values are the manifest's canonical rows to the
 * cent. The same payment sent as an 835 and as an export loads once in either order: an export after the 835
 * loads zero rows for it, an 835 after the export is held for review. A resent export loads nothing; an export
 * that lacks a field a line needs is held with its reason and column. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
const fixture = (relative: string): Buffer => readFileSync(path.join(FIXTURES, relative));
const exportOf = (formatId: EraFormatId): Buffer => fixture(`emr/${formatId}/era-export.csv`);

interface ManifestRow {
  readonly senderId: string;
  readonly payerName: string;
  readonly payeeId: string;
  readonly trace: string;
  readonly paymentDate: string;
  readonly paymentCents: string;
  readonly paymentMethod: string;
  readonly patientControlNumber: string;
  readonly payerClaimNumber: string;
  readonly claimStatus: string;
  readonly plan: string | null;
  readonly serviceDate: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string | null;
  readonly chargeCents: string;
  readonly allowedCents: string | null;
  readonly paidCents: string;
  readonly patientResponsibilityCents: string;
  readonly contractualAdjustmentCents: string;
  readonly otherAdjustmentCents: string;
  readonly adjustmentCodes: readonly string[];
}

const manifestRows = (formatId: EraFormatId): ManifestRow[] => (JSON.parse(fixture(`emr/${formatId}/manifest.json`).toString('utf8')) as { rows: ManifestRow[] }).rows;

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
const keys = LocalKeyProvider.random();
const ciphers = new Map<string, PracticeCipher>();
const sealed = new MemorySealedBytes();
const documents = new DocumentStore(sealed);
const intake = intakeHandler({ documents, landing: new LocalLanding(documents), scan: new LocalScanService(), keys, scanWait: { pollMs: 1, timeoutMs: 20 } });
const parse = parseHandler({ documents, keys });

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 6);
}, 60_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** A practice of its own (a payment loads once per practice), with a real data key; its administrator uploads. */
async function practice(name: string): Promise<{ readonly practiceId: string; readonly uploader: string }> {
  const world = await createTenantWorld(owner, name);
  const key = await provisionPracticeKey(keys, world.practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
  ciphers.set(world.practiceId, key.cipher);
  return { practiceId: world.practiceId, uploader: world.adminUserId };
}

interface Run {
  readonly queued: { readonly type: JobType; readonly payload: unknown }[];
  readonly logs: Record<string, unknown>[];
}

function context(practiceId: string, run: Run): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: (line) => run.logs.push(JSON.parse(line) as Record<string, unknown>) }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: <T extends JobType>(type: T, payload: JobPayload<T>) => {
      run.queued.push({ type, payload });
      return Promise.resolve(randomUUID());
    },
    lastAttempt: false,
  };
}

/**
 * Uploads `bytes` as the uploads route records a file (its kind, and an ERA export's format), lands them sealed as
 * the browser's PUT leaves them, takes them in, and runs every parse job intake queues. Returns the document.
 */
async function send(where: { readonly practiceId: string; readonly uploader: string }, bytes: Buffer, kind: 'x12_835' | 'era_export', formatId: EraFormatId | null = null): Promise<{ readonly id: string; readonly run: Run }> {
  const id = randomUUID();
  await withPracticeScope(app, { actorId: where.uploader, practiceIds: [where.practiceId] }, (scope) =>
    scope.client.query('INSERT INTO source_document (id, practice_id, kind, format_id, size_bytes, content_type, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      id,
      where.practiceId,
      kind,
      formatId,
      bytes.length,
      kind === 'era_export' ? 'text/csv' : 'application/octet-stream',
      where.uploader,
    ]),
  );
  await documents.write(ciphers.get(where.practiceId) as PracticeCipher, documentObjectKey(where.practiceId, id), Readable.from([bytes]));
  const run: Run = { queued: [], logs: [] };
  await intake({ practice_id: where.practiceId, document_id: id }, context(where.practiceId, run));
  for (const job of [...run.queued]) {
    if (job.type === 'parse_835') {
      await parse(job.payload as JobPayload<'parse_835'>, context(where.practiceId, run));
    }
  }
  return { id, run };
}

interface Report {
  readonly outcome: string;
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly held: number;
  readonly loaded_transactions: number;
  readonly loaded_claims: number;
  readonly loaded_lines: number;
  readonly duplicate_transactions: number;
  readonly plb_total_cents: string;
  readonly errors: unknown[];
  readonly transaction_outcomes: unknown[];
}

async function reportOf(documentId: string): Promise<Report> {
  const { rows } = await owner.query<Report>(
    `SELECT outcome, transactions, claims, lines, held, loaded_transactions, loaded_claims, loaded_lines, duplicate_transactions, plb_total_cents::text AS plb_total_cents,
            errors, transaction_outcomes
       FROM parse_report WHERE source_document_id = $1`,
    [documentId],
  );
  return rows[0] as Report;
}

async function documentOf(documentId: string): Promise<{ kind: string; format_id: string | null; status: string }> {
  return (await owner.query<{ kind: string; format_id: string | null; status: string }>('SELECT kind, format_id, status FROM source_document WHERE id = $1', [documentId])).rows[0] as {
    kind: string;
    format_id: string | null;
    status: string;
  };
}

/** A numeric(9,3) as the export wrote it: no trailing zeros. */
const units = (text: string | null): string | null => (text === null ? null : text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text);

interface LineRow {
  readonly sender_id: string | null;
  readonly payer_name: string;
  readonly payee_npi: string;
  readonly trn02: string;
  readonly bpr16_date: string;
  readonly bpr02_cents: string;
  readonly bpr_credit_debit: string;
  readonly bpr_method: string | null;
  readonly patient_control_number: string;
  readonly payer_claim_control_number: string;
  readonly claim_status_code: string;
  readonly plan_key: string;
  readonly service_date: string;
  readonly procedure_code: string;
  readonly modifiers: string[];
  readonly units: string | null;
  readonly charge_cents: string;
  readonly line_allowed_cents: string | null;
  readonly paid_cents: string;
  readonly patient_share_cents: string;
  readonly adjustments: { group_code: string; reason_code: string; amount_cents: string; position: number }[];
}

/** The practice's lines of `documentId`'s remittances, decrypted, as the manifest's canonical rows, by trace, claim and line. */
async function canonicalLines(practiceId: string, documentId: string): Promise<ManifestRow[]> {
  const cipher = ciphers.get(practiceId) as PracticeCipher;
  const { rows } = await owner.query<LineRow>(
    `SELECT r.sender_id, r.payer_name, r.payee_npi, r.trn02, r.bpr16_date::text AS bpr16_date, r.bpr02_cents::text AS bpr02_cents, r.bpr_credit_debit, r.bpr_method,
            c.patient_control_number, c.payer_claim_control_number, c.claim_status_code, p.plan_key, l.service_date::text AS service_date, l.procedure_code, l.modifiers,
            l.units::text AS units, l.charge_cents::text AS charge_cents, l.line_allowed_cents::text AS line_allowed_cents, l.paid_cents::text AS paid_cents,
            l.patient_share_cents::text AS patient_share_cents,
            coalesce((SELECT jsonb_agg(jsonb_build_object('group_code', a.group_code, 'reason_code', a.reason_code, 'amount_cents', a.amount_cents::text, 'position', a.position) ORDER BY a.position)
                        FROM adjustment a WHERE a.service_line_id = l.id), '[]') AS adjustments
       FROM remittance r JOIN claim c ON c.remittance_id = r.id JOIN service_line l ON l.claim_id = c.id JOIN plan p ON p.id = l.payer_plan_key
      WHERE r.practice_id = $1 AND r.source_document_id = $2
      ORDER BY r.trn02, c.claim_no, l.line_no`,
    [practiceId, documentId],
  );
  return rows.map((row) => {
    const total = (groups: readonly string[]) => row.adjustments.filter((item) => groups.includes(item.group_code)).reduce((sum, item) => sum + BigInt(item.amount_cents), 0n).toString();
    return {
      senderId: row.sender_id ?? '',
      payerName: row.payer_name,
      payeeId: row.payee_npi,
      trace: row.trn02,
      paymentDate: row.bpr16_date,
      paymentCents: (row.bpr_credit_debit === 'D' ? -BigInt(row.bpr02_cents) : BigInt(row.bpr02_cents)).toString(),
      paymentMethod: row.bpr_method ?? '',
      patientControlNumber: cipher.decrypt('claim.patient_control_number', row.patient_control_number),
      payerClaimNumber: cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
      claimStatus: row.claim_status_code,
      plan: row.plan_key.replace(/^PLAN:/, ''),
      serviceDate: row.service_date,
      procedureCode: row.procedure_code,
      modifiers: row.modifiers,
      units: units(row.units),
      chargeCents: row.charge_cents,
      allowedCents: row.line_allowed_cents,
      paidCents: row.paid_cents,
      patientResponsibilityCents: row.patient_share_cents,
      contractualAdjustmentCents: total(['CO']),
      otherAdjustmentCents: total(['OA', 'PI']),
      adjustmentCodes: row.adjustments.flatMap((item) => item.reason_code.split('+').map((reason) => `${item.group_code}-${reason}`)),
    };
  });
}

/** The manifest's rows in the same order: by trace, then as written. */
const byTrace = (rows: readonly ManifestRow[]): ManifestRow[] => [...rows].sort((a, b) => (a.trace < b.trace ? -1 : a.trace > b.trace ? 1 : 0));

const remittancesOfTrace = async (practiceId: string, trace: string) =>
  (await owner.query<{ id: string; provenance: string; source_document_id: string }>('SELECT id, provenance, source_document_id FROM remittance WHERE practice_id = $1 AND trn02 = $2 ORDER BY created_at, id', [practiceId, trace]))
    .rows;

describe('ERA exports as first-class intake', () => {
  it.each(ERA_FORMAT_IDS.map((id) => [id]))('uploads %s, classifies it as an era_export of its format, and loads its lines equal to the manifest to the cent', async (formatId) => {
    const where = await practice(`era ${formatId}`);
    const { id, run } = await send(where, exportOf(formatId), 'era_export', formatId);
    expect(run.queued.filter((job) => job.type === 'parse_835')).toEqual([{ type: 'parse_835', payload: { practice_id: where.practiceId, document_id: id } }]);
    expect(await documentOf(id)).toEqual({ kind: 'era_export', format_id: formatId, status: 'loaded' });
    const rows = manifestRows(formatId);
    expect(await canonicalLines(where.practiceId, id)).toEqual(byTrace(rows));
    const report = await reportOf(id);
    expect(report).toMatchObject({ outcome: 'loaded', transactions: 7, claims: 9, lines: rows.length, held: 0, loaded_transactions: 7, loaded_claims: 9, loaded_lines: rows.length, duplicate_transactions: 0, plb_total_cents: '0', errors: [] });
    const remittances = await owner.query<{ provenance: string; isa13: string | null; receiver_id: string | null; trn03: string | null; payee_id_qualifier: string | null; balanced: boolean }>(
      'SELECT provenance, isa13, receiver_id, trn03, payee_id_qualifier, balanced FROM remittance WHERE source_document_id = $1',
      [id],
    );
    expect(remittances.rows).toHaveLength(7);
    expect(new Set(remittances.rows.map((row) => JSON.stringify(row)))).toEqual(new Set([JSON.stringify({ provenance: 'era_export', isa13: null, receiver_id: null, trn03: null, payee_id_qualifier: null, balanced: true })]));
    // Observed allowed on the paid-plus-PR basis, the claims' CLP06 absent, the payer and plans for the mapping queue.
    const lines = await owner.query<{ basis: string; ok: boolean }>(
      `SELECT DISTINCT l.observed_allowed_basis AS basis, l.observed_allowed_cents = l.paid_cents + l.patient_share_cents AS ok FROM service_line l JOIN claim c ON c.id = l.claim_id JOIN remittance r ON r.id = c.remittance_id WHERE r.source_document_id = $1`,
      [id],
    );
    expect(lines.rows).toEqual([{ basis: 'paid_plus_pr', ok: true }]);
    const payers = await owner.query<{ payer_id_raw: string }>('SELECT DISTINCT p.payer_id_raw FROM payer p JOIN remittance r ON r.payer_id = p.id WHERE r.source_document_id = $1', [id]);
    expect(payers.rows).toEqual([{ payer_id_raw: 'NAME:SYNTHETIC PAYER A' }]);
    // The correction supersedes the original it follows (PAR-08), as an 835's would.
    const linked = await owner.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM claim c JOIN remittance r ON r.id = c.remittance_id WHERE r.source_document_id = $1 AND (c.reversal_of_claim_id IS NOT NULL OR c.superseded_by_claim_id IS NOT NULL)',
      [id],
    );
    expect(linked.rows[0]?.n).toBe(2);
    // The job payloads carry opaque IDs only; the report and the logs codes, counts, positions and IDs, never a value of the file.
    for (const { payload } of run.queued) {
      expect(() => {
        assertNoPhi('job_payload', payload, { known: ['SYNPCNPAR01001', 'SYNCCNPAR010001'] });
      }).not.toThrow();
    }
    const said = JSON.stringify({ logs: run.logs, report });
    for (const value of rows.flatMap((row) => [row.patientControlNumber, row.payerClaimNumber, row.payeeId, row.trace, row.payerName])) {
      expect(said).not.toContain(value);
    }
  });

  it('loads a payment once when its 835 came first: the export loads zero rows for it and links the 835’s remittance', async () => {
    const where = await practice('era 835 first');
    const x12 = await send(where, fixture('PAR-01/remit.835'), 'x12_835');
    expect((await documentOf(x12.id)).status).toBe('loaded');
    const [from835] = await remittancesOfTrace(where.practiceId, 'SYNEFTPAR01001');
    const exported = await send(where, exportOf('webpt_billing_era_v0'), 'era_export', 'webpt_billing_era_v0');
    expect(await remittancesOfTrace(where.practiceId, 'SYNEFTPAR01001')).toEqual([from835]);
    const report = await reportOf(exported.id);
    expect(report).toMatchObject({ outcome: 'loaded', transactions: 7, loaded_transactions: 6, duplicate_transactions: 1 });
    const outcomes = report.transaction_outcomes as ReportedExportPayment[];
    expect(outcomes[0]).toEqual({
      payment: 1,
      firstRow: 1,
      rows: 1,
      outcome: 'duplicate_remittance',
      remittanceId: null,
      linkedRemittanceId: from835?.id,
      linkedDocumentId: x12.id,
      linkedProvenance: 'x12_835',
      reviewReason: null,
      claims: 0,
      lines: 0,
      reasons: [],
    });
    expect(outcomes.slice(1).map((outcome) => outcome.outcome)).toEqual(['loaded', 'loaded', 'loaded', 'loaded', 'loaded', 'loaded']);
  });

  it('holds a later 835 of a payment first loaded from an export for review, loading nothing beside it', async () => {
    const where = await practice('era export first');
    const exported = await send(where, exportOf('raintree_era_v0'), 'era_export', 'raintree_era_v0');
    const [fromExport] = await remittancesOfTrace(where.practiceId, 'SYNEFTPAR01001');
    expect(fromExport?.provenance).toBe('era_export');
    const before = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM claim WHERE practice_id = $1', [where.practiceId]);
    const x12 = await send(where, fixture('PAR-01/remit.835'), 'x12_835');
    expect(await documentOf(x12.id)).toEqual({ kind: 'x12_835', format_id: null, status: 'held' });
    expect(await remittancesOfTrace(where.practiceId, 'SYNEFTPAR01001')).toEqual([fromExport]);
    expect((await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM claim WHERE practice_id = $1', [where.practiceId])).rows).toEqual(before.rows);
    const report = await reportOf(x12.id);
    expect(report).toMatchObject({ outcome: 'held', transactions: 1, held: 1, loaded_transactions: 0, loaded_claims: 0, loaded_lines: 0, duplicate_transactions: 0 });
    expect(report.transaction_outcomes).toEqual([
      expect.objectContaining({
        outcome: 'held_for_review',
        remittanceId: null,
        linkedRemittanceId: fromExport?.id,
        linkedDocumentId: exported.id,
        linkedProvenance: 'era_export',
        reviewReason: 'payment_loaded_from_export',
        claims: 0,
        lines: 0,
        reasons: [],
      } satisfies Partial<ReportedTransaction>),
    ]);
  });

  it('loads nothing from a resent export, whether the same bytes or the same payments in another layout', async () => {
    const where = await practice('era resent');
    const first = await send(where, exportOf('spry_era_v0'), 'era_export', 'spry_era_v0');
    const again = await send(where, exportOf('spry_era_v0'), 'era_export', 'spry_era_v0');
    expect(await documentOf(again.id)).toMatchObject({ status: 'duplicate' });
    expect(again.run.queued).toEqual([]);
    const relaid = await send(where, exportOf('prompt_era_v0'), 'era_export', 'prompt_era_v0');
    expect(await documentOf(relaid.id)).toEqual({ kind: 'era_export', format_id: 'prompt_era_v0', status: 'duplicate' });
    const report = await reportOf(relaid.id);
    expect(report).toMatchObject({ outcome: 'duplicate', transactions: 7, duplicate_transactions: 7, loaded_transactions: 0, loaded_lines: 0 });
    expect(new Set((report.transaction_outcomes as ReportedExportPayment[]).map((outcome) => `${outcome.outcome}:${String(outcome.linkedProvenance)}:${String(outcome.linkedDocumentId)}`))).toEqual(
      new Set([`duplicate_remittance:era_export:${first.id}`]),
    );
    expect((await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM remittance WHERE practice_id = $1', [where.practiceId])).rows[0]?.n).toBe(7);
  });

  it('holds an export that lacks a column a line needs, naming the column, and loads nothing from it', async () => {
    const where = await practice('era held');
    const text = exportOf('webpt_billing_era_v0').toString('utf8');
    const withoutUnits = text
      .split('\r\n')
      .map((line) => line.replace(/,Units,/, ',Quantity Billed,'))
      .join('\r\n');
    const { id } = await send(where, Buffer.from(withoutUnits, 'utf8'), 'era_export', 'webpt_billing_era_v0');
    expect((await documentOf(id)).status).toBe('held');
    const report = await reportOf(id);
    expect(report).toMatchObject({ outcome: 'held', transactions: 0, claims: 0, lines: 0, loaded_transactions: 0, transaction_outcomes: [] });
    expect(report.errors).toEqual([{ code: 'EXPORT_HELD', reason: 'export_column_missing', column: 'Units', row: null, payment: null } satisfies ReportedExportError]);
    expect((await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM remittance WHERE practice_id = $1', [where.practiceId])).rows[0]?.n).toBe(0);
  });

  it('holds the payment of a row without its units, naming the column and row, and loads the others (partially held)', async () => {
    const where = await practice('era partly held');
    const lines = exportOf('webpt_billing_era_v0').toString('utf8').split('\r\n');
    // Data row 2 is the first line of PAR-08's original payment (payment 2); its Units cell (the fifteenth) is emptied.
    const cells = (lines[2] as string).split(',');
    cells[14] = '';
    lines[2] = cells.join(',');
    const { id } = await send(where, Buffer.from(lines.join('\r\n'), 'utf8'), 'era_export', 'webpt_billing_era_v0');
    expect((await documentOf(id)).status).toBe('held');
    const report = await reportOf(id);
    expect(report).toMatchObject({ outcome: 'partially_held', transactions: 7, held: 1, loaded_transactions: 6 });
    expect(report.errors).toEqual([{ code: 'EXPORT_HELD', reason: 'export_value_missing', column: 'Units', row: 2, payment: 2 }]);
    expect((report.transaction_outcomes as ReportedExportPayment[])[1]).toMatchObject({ payment: 2, firstRow: 2, rows: 2, outcome: 'held', remittanceId: null, reasons: ['export_value_missing'] });
    expect(await remittancesOfTrace(where.practiceId, 'SYNEFTPAR08001')).toEqual([]);
    expect(await remittancesOfTrace(where.practiceId, 'SYNEFTPAR01001')).toHaveLength(1);
    for (const value of ['SYNPCNPAR08001', 'SYNCCNPAR080001', '9936708897', 'SYNEFTPAR08001']) {
      expect(JSON.stringify(report)).not.toContain(value);
    }
  });

  it('holds a workbook, .xlsx or .xls, uploaded as an ERA export as not its type at intake, and parses nothing (docs/adr/0059)', async () => {
    const where = await practice('era workbook');
    const rows = [['Check #', 'Check Date', 'Check Total', 'Sender ID'], ['SYNEFTPAR01001', '04/06/2026', '88.00', 'SYNTHSENDER']];
    const xlsx = Buffer.from(syntheticXlsx([{ name: 'ERA', rows }]));
    const xls = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504, 0)]);
    for (const workbook of [xlsx, xls]) {
      const { id, run } = await send(where, workbook, 'era_export', 'spry_era_v0');
      expect(await documentOf(id)).toEqual({ kind: 'era_export', format_id: 'spry_era_v0', status: 'wrong_type' });
      expect(run.queued).toEqual([]);
    }
  });
});
