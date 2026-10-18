import { createHash, randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { ExportLoadFailed, reconcileHandler } from './job';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * Posting and EFT exports into rows (PRD 13, Matching steps 2 and 3; PRD 16; CLAUDE.md: "Check in the
 * handler and in Postgres"; docs/adr/0042 and 0046), against PostgreSQL: only the reconcile job writes an
 * export row, from a stored export of the row's kind with a clean scan, so nobody in scope can make up
 * recovery evidence; and one export the database refuses a row of, or that fails to load, never stops
 * the practice's other exports, its remittance matching or its daily reconcile.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const HEADER = 'Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch';

/** A source document of `kind`, as intake leaves one unless `status` says otherwise. */
async function document(practice: Practice, kind: string, status = 'stored', scan = 'clean'): Promise<string> {
  const { rows } = await asOwner(
    w.owner,
    [practice.practiceId],
    () =>
      w.owner.query<{ id: string }>(
        `INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status)
         VALUES ($1, $2, 100, 'text/csv', $3, $4, $5::text, CASE WHEN $5::text = 'pending' THEN NULL ELSE now() END, $6) RETURNING id`,
        [practice.practiceId, kind, practice.manager, createHash('sha256').update(randomUUID()).digest('hex'), scan, status],
      ),
    practice.manager,
  );
  return (rows[0] as { id: string }).id;
}

const postingRow = (practice: Practice, documentId: string) => ({
  sql: `INSERT INTO posting_row (practice_id, source_document_id, row_no, check_or_trace, posted_on, amount_cents, raw, template, fingerprint)
        VALUES ($1, $2, 1, '880060040002', '2026-06-11', 3000, '{}', 'synthetic_pm_export_v1', $3)`,
  values: [practice.practiceId, documentId, createHash('sha256').update(randomUUID()).digest('hex')],
});

const eftRow = (practice: Practice, documentId: string) => ({
  sql: `INSERT INTO eft_row (practice_id, source_document_id, row_no, trace, deposited_on, amount_cents, fingerprint) VALUES ($1, $2, 1, 'SYNEFTLED05002', '2026-06-09', 3000, $3)`,
  values: [practice.practiceId, documentId, createHash('sha256').update(randomUUID()).digest('hex')],
});

function asPerson(practice: Practice, actorId: string, row: { sql: string; values: unknown[] }) {
  return withPracticeScope(w.app, { actorId, practiceIds: [practice.practiceId] }, (scope) => scope.client.query(row.sql, row.values));
}

function asJob(practice: Practice, row: { sql: string; values: unknown[] }) {
  return withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => scope.client.query(row.sql, row.values));
}

describe('who writes an export row, and from what (PRD 16; CLAUDE.md: check in the handler and in Postgres)', () => {
  it('refuses a person in scope (a viewer, a billing manager) a posting or EFT row of any document', async () => {
    const practice = await w.practice(`export writers ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
    const viewer = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
    const postings = await document(practice, 'posting_export');
    const deposits = await document(practice, 'eft_export');
    for (const actor of [viewer, practice.manager, practice.world.adminUserId]) {
      await expect(asPerson(practice, actor, postingRow(practice, postings))).rejects.toMatchObject({ code: '42501' });
      await expect(asPerson(practice, actor, eftRow(practice, deposits))).rejects.toMatchObject({ code: '42501' });
    }
    // The reconcile job reads them from the stored exports.
    await expect(asJob(practice, postingRow(practice, postings))).resolves.toMatchObject({ rowCount: 1 });
    await expect(asJob(practice, eftRow(practice, deposits))).resolves.toMatchObject({ rowCount: 1 });
  });

  it('refuses the job a row of a document of another kind, unscanned, or already loaded', async () => {
    const practice = await w.practice(`export documents ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
    for (const kind of ['x12_835', 'payer_letter', 'eft_export']) {
      await expect(asJob(practice, postingRow(practice, await document(practice, kind)))).rejects.toThrow(/a posting row is a row of a posting export/);
    }
    for (const kind of ['x12_835', 'posting_export']) {
      await expect(asJob(practice, eftRow(practice, await document(practice, kind)))).rejects.toThrow(/an EFT row of an EFT export/);
    }
    await expect(asJob(practice, postingRow(practice, await document(practice, 'posting_export', 'loaded')))).rejects.toThrow(/stored with a clean malware scan/);
    await expect(asJob(practice, eftRow(practice, await document(practice, 'eft_export', 'stored', 'pending')))).rejects.toThrow(/stored with a clean malware scan/);
  });

  it('leaves a made-up posting row impossible, so nothing reaches recovered without a posting export (the review’s probe)', async () => {
    const { practice, serviceLineId } = await led04(ledSettings('posted'));
    const viewer = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
    // A row with the adjusted check's TRN02 and amount on the practice's 835: refused to the viewer, and to any job.
    const [remittanceDocument] = await w.rows<{ id: string }>(practice, "SELECT id FROM source_document WHERE kind = 'x12_835' ORDER BY created_at DESC LIMIT 1");
    await expect(asPerson(practice, viewer, postingRow(practice, remittanceDocument?.id ?? ''))).rejects.toMatchObject({ code: '42501' });
    await expect(asJob(practice, postingRow(practice, remittanceDocument?.id ?? ''))).rejects.toMatchObject({ code: '23514' });
    await w.reconcile(practice);
    expect(await w.stages(practice)).toEqual([{ stage: 'approved', amountCents: '3000' }]);
    expect(await w.lineStage(practice, serviceLineId)).toBe('payer_approved');
  });
});

describe('an export the database refuses a row of, or that fails to load (PRD 13; docs/adr/0042: a row with an unreadable field is left out and counted)', () => {
  it('reads a CPT with its modifiers as its code and leaves out an over-long payer, counted, so the export loads', async () => {
    const { practice } = await led04(ledSettings('posted'));
    const rows = ['06/11/2026,880060040002,SYNTHETIC PAYER L,,,,30.00,SYNBATCH-0401', `06/11/2026,880060040002,${'P'.repeat(224)},SYNPCN,97110,03/09/2026,1.00,SYNBATCH-0401`, '06/12/2026,880060049999,SYNTHETIC PAYER L,SYNPCN,97110-GP,03/09/2026,1.00,B'];
    const documentId = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export', Buffer.from(`${HEADER}\r\n${rows.join('\r\n')}\r\n`));
    const summary = await w.reconcile(practice, { documentId });
    expect(summary.exports).toEqual([{ documentId, kind: 'posting_export', outcome: 'loaded', stored: 2, repeated: 0, problems: 1 }]);
    expect(await w.rows(practice, 'SELECT procedure_code, raw ->> $1 AS cell FROM posting_row ORDER BY row_no', ['procedure_code'])).toEqual([
      { procedure_code: null, cell: '' },
      { procedure_code: '97110', cell: '97110-GP' },
    ]);
    expect(await w.stages(practice)).toEqual([
      { stage: 'approved', amountCents: '3000' },
      { stage: 'posted', amountCents: '3000' },
    ]);
  });

  it('marks unreadable an export whose row its table refuses, keeps none of its rows, and still reconciles the rest and the day', async () => {
    const { practice, serviceLineId } = await led04(ledSettings('posted'));
    const refused = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export', Buffer.from(`${HEADER}\r\n06/11/2026,880060040002,P,,,,30.00,B\r\n06/11/2026,880060040002,P,,,,99999999999999999999.00,B\r\n`));
    const good = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export');
    const logs: Record<string, unknown>[] = [];
    await reconcileHandler(w.services)({ practice_id: practice.practiceId, day: '2026-07-01' }, w.jobContext(practice, logs));
    expect(logs).toContainEqual(expect.objectContaining({ error_code: 'EXPORT_ROW_REFUSED', document_id: refused }));
    expect(await w.rows(practice, 'SELECT id, status FROM source_document WHERE id = ANY ($1::uuid[]) ORDER BY status', [[refused, good]])).toEqual([
      { id: good, status: 'loaded' },
      { id: refused, status: 'unreadable' },
    ]);
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM posting_row WHERE source_document_id = $1', [refused])).toEqual([{ n: 0 }]);
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    // The day's quarterly statement was written, and the next reconcile reads nothing again.
    expect(await w.rows(practice, 'SELECT period_from::text FROM roi_statement')).toEqual([{ period_from: '2026-04-01' }]);
    expect((await w.reconcile(practice)).exports).toEqual([]);
  });

  it('leaves an export that fails to load stored, reconciles the rest, and fails the attempt after its work for a retry', async () => {
    const { practice, serviceLineId } = await led04(ledSettings('posted'));
    // Stored and clean, but its sealed bytes never reached the document store.
    const missing = await document(practice, 'posting_export');
    const good = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export');
    const logs: Record<string, unknown>[] = [];
    await expect(reconcileHandler(w.services)({ practice_id: practice.practiceId, day: '2026-07-01' }, w.jobContext(practice, logs))).rejects.toThrow(ExportLoadFailed);
    expect(logs).toContainEqual(expect.objectContaining({ error_code: 'EXPORT_LOAD_FAILED', document_id: missing }));
    expect(await w.rows(practice, 'SELECT id, status FROM source_document WHERE id = ANY ($1::uuid[]) ORDER BY status', [[missing, good]])).toEqual([
      { id: good, status: 'loaded' },
      { id: missing, status: 'stored' },
    ]);
    expect(await w.lineStage(practice, serviceLineId)).toBe('recovered');
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM roi_statement')).toEqual([{ n: 1 }]);
  });
});

async function led04(settings: object): Promise<{ readonly practice: Practice; readonly serviceLineId: string }> {
  const practice = await w.practice(`LED-04 exports ${randomUUID().slice(0, 8)}`, settings);
  const { serviceLineId } = await w.caseFor(practice, 'LED-04/original.835');
  await w.load(practice, 'LED-04/adjusted.835');
  await w.reconcile(practice);
  return { practice, serviceLineId };
}
