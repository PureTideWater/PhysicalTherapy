import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { type PostingTemplate, SYNTHETIC_PM_EXPORT_V1, VENDOR_POSTING_TEMPLATES, readPostingExport } from '@tp/ledger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FIXTURES, type Practice } from '../price/test-support/pricing-world';
import { loadExports } from './exports';
import { type Scope, practiceLedgerSettings } from './ledger';
import { setPostingTemplate } from './settings';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * The four vendor posting exports (Change Order 001, CO-03; docs/adr/0059), against PostgreSQL: each
 * of packages/synth's FORMAT_UNCONFIRMED placeholders (fixtures/synthetic/emr/<format_id>/), uploaded
 * by a practice whose billing manager mapped the matching built-in template, loads through the
 * reconcile job into posting_row: every row of the manifest, the amount in integer cents, the template
 * named by the format's ID, the claim reference sealed. Its rows are the SYNTHETIC template's rows of
 * the source cases (LED-04, LED-08, LED-09, and LED-06's take-back, a negative amount), so the same posting brought by a vendor's export is the
 * row the practice already holds and is stored once. The practice's template reads back unconfirmed.
 * Synthetic data only.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface ManifestRow {
  readonly postedOn: string;
  readonly checkOrTrace: string;
  readonly amountCents: string;
  readonly payerName: string | null;
  readonly claimReference: string | null;
  readonly procedureCode: string | null;
  readonly serviceDate: string | null;
  readonly batch: string | null;
}

interface Manifest {
  readonly format: string;
  readonly status: string;
  readonly rows: readonly ManifestRow[];
}

const manifestOf = (id: string) => JSON.parse(readFileSync(path.join(FIXTURES, 'emr', id, 'manifest.json'), 'utf8')) as Manifest;

/** The source cases' synthetic posting exports, which the vendor exports write again. */
const SOURCES = ['LED-04/posting-export.csv', 'LED-08/posting-export-again.csv', 'LED-09/lines-posting-export.csv', 'LED-06/recoupment-posting-export.csv'];

interface StoredRow {
  readonly row_no: number;
  readonly posted_on: string;
  readonly check_or_trace: string;
  readonly amount_cents: string;
  readonly payer_name: string | null;
  readonly claim_reference: string | null;
  readonly procedure_code: string | null;
  readonly service_date: string | null;
  readonly batch: string | null;
  readonly template: string;
}

const as = <T>(practice: Practice, run: (scope: Scope) => Promise<T>) => withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => run(scope as Scope));

/** A practice whose billing manager maps `template`, as the template screen does. */
async function mapped(label: string, template: PostingTemplate): Promise<Practice> {
  const practice = await w.practice(`${label} ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
  await asOwner(w.owner, [practice.practiceId], () => w.owner.query("UPDATE practice SET settings = settings - 'posting_export_template' WHERE id = $1", [practice.practiceId]));
  await as(practice, (scope) => setPostingTemplate(scope, { practiceId: practice.practiceId, template, requestId: `test-${randomUUID()}` }));
  return practice;
}

/** The practice's posting rows of `documentIds`, the claim reference opened with its key, in posting order. */
async function stored(practice: Practice, documentIds: readonly string[]): Promise<ManifestRow[]> {
  const rows = await w.rows<StoredRow>(
    practice,
    `SELECT r.row_no, r.posted_on::text, r.check_or_trace, r.amount_cents::text, r.payer_name, r.claim_reference, r.procedure_code, r.service_date::text, r.batch, r.template
       FROM posting_row r WHERE r.source_document_id = ANY ($1::uuid[])
      ORDER BY array_position($1::uuid[], r.source_document_id), r.row_no`,
    [documentIds],
  );
  return rows.map((row) => ({
    postedOn: row.posted_on,
    checkOrTrace: row.check_or_trace,
    amountCents: row.amount_cents,
    payerName: row.payer_name,
    claimReference: row.claim_reference === null ? null : practice.cipher.decrypt('posting_row.claim_reference', row.claim_reference),
    procedureCode: row.procedure_code,
    serviceDate: row.service_date,
    batch: row.batch,
  }));
}

/** What the SYNTHETIC template reads from the source cases, as the manifest writes a row. */
function syntheticRows(): ManifestRow[] {
  return SOURCES.flatMap((source) => {
    const read = readPostingExport(readFileSync(path.join(FIXTURES, source), 'utf8'), SYNTHETIC_PM_EXPORT_V1);
    if (read.kind !== 'read' || read.problems.length > 0) {
      throw new Error(`${source} reads with the SYNTHETIC template`);
    }
    return read.rows.map((row) => ({
      postedOn: row.postedOn,
      checkOrTrace: row.checkOrTrace,
      amountCents: row.amountCents.toString(),
      payerName: row.payerName,
      claimReference: row.claimReference,
      procedureCode: row.procedureCode,
      serviceDate: row.serviceDate,
      batch: row.batch,
    }));
  });
}

describe('the vendor posting exports load into posting_row through their built-in templates (CO-03; docs/adr/0059)', () => {
  it.each(VENDOR_POSTING_TEMPLATES.map((template) => [template.id, template] as const))('loads %s: every manifest row, in integer cents, under its template, which reads back unconfirmed', async (id, template) => {
    const manifest = manifestOf(id);
    expect([manifest.format, manifest.status]).toEqual([id, 'FORMAT_UNCONFIRMED']);
    const practice = await mapped(`vendor ${id}`, template);
    const settings = await as(practice, (scope) => practiceLedgerSettings(scope, practice.practiceId));
    expect(settings.postingTemplate).toBe(template);
    expect(settings.postingTemplate?.status).toBe('unconfirmed');

    const documentId = await w.stageExport(practice, `emr/${id}/posting-export.csv`, 'posting_export');
    const summary = await w.reconcile(practice, { documentId });
    expect(summary.exports).toEqual([{ documentId, kind: 'posting_export', outcome: 'loaded', stored: manifest.rows.length, repeated: 0, problems: 0 }]);
    const rows = await stored(practice, [documentId]);
    expect(rows).toEqual(manifest.rows);
    expect(rows).toEqual(syntheticRows());
    // The take-back is stored as a negative amount in integer cents, as the SYNTHETIC template stores it.
    expect(rows.filter((row) => row.amountCents.startsWith('-')).map((row) => [row.checkOrTrace, row.amountCents, row.claimReference])).toEqual([['SYNEFTLED06003', '-1800', 'SYNPCNLED06001']]);
    expect(await w.rows(practice, 'SELECT DISTINCT template, count(*) OVER ()::int AS n FROM posting_row WHERE source_document_id = $1', [documentId])).toEqual([{ template: id, n: manifest.rows.length }]);
    // Only the mapped cells are kept raw, and never the claim reference.
    const [raw] = await w.rows<{ raw: Record<string, string> }>(practice, 'SELECT raw FROM posting_row WHERE source_document_id = $1 AND claim_reference IS NOT NULL', [documentId]);
    expect(Object.keys(raw?.raw ?? {}).sort()).toEqual(['amount', 'batch', 'check_or_trace', 'payer', 'posted_on', 'procedure_code', 'service_date']);
    // The document is loaded; the next reconcile reads nothing again.
    expect(await w.rows(practice, 'SELECT status FROM source_document WHERE id = $1', [documentId])).toEqual([{ status: 'loaded' }]);
    expect((await w.reconcile(practice)).exports).toEqual([]);
  });

  it('stores a posting once whichever export brings it: the SYNTHETIC exports first, then each vendor’s, repeats every row', async () => {
    const practice = await mapped('vendor repeats', SYNTHETIC_PM_EXPORT_V1);
    const sources: string[] = [];
    for (const source of SOURCES) {
      sources.push(await w.stageExport(practice, source, 'posting_export'));
    }
    await w.reconcile(practice);
    expect(await stored(practice, sources)).toEqual(syntheticRows());
    for (const template of VENDOR_POSTING_TEMPLATES) {
      await as(practice, (scope) => setPostingTemplate(scope, { practiceId: practice.practiceId, template, requestId: `test-${randomUUID()}` }));
      const documentId = await w.stageExport(practice, `emr/${template.id}/posting-export.csv`, 'posting_export');
      expect((await w.reconcile(practice, { documentId })).exports, template.id).toEqual([{ documentId, kind: 'posting_export', outcome: 'loaded', stored: 0, repeated: 5, problems: 0 }]);
    }
    expect(await w.rows(practice, 'SELECT template, count(*)::int AS n FROM posting_row GROUP BY template')).toEqual([{ template: 'synthetic_pm_export_v1', n: 5 }]);
  });

  it('leaves a vendor export unreadable under another vendor’s template: its columns are not there, and no row is kept', async () => {
    const [webpt, prompt] = VENDOR_POSTING_TEMPLATES as [PostingTemplate, PostingTemplate];
    const practice = await mapped('vendor mismatch', webpt);
    const documentId = await w.stageExport(practice, `emr/${prompt.id}/posting-export.csv`, 'posting_export');
    const logs: Record<string, unknown>[] = [];
    const exports = await loadExports(w.jobContext(practice, logs), w.services, practice.cipher, practice.practiceId, documentId);
    expect(exports).toEqual([{ documentId, kind: 'posting_export', outcome: 'unreadable', stored: 0, repeated: 0, problems: 0 }]);
    expect(logs).toContainEqual(expect.objectContaining({ document_id: documentId, error_code: 'EXPORT_MISSING_COLUMNS' }));
    expect(await w.rows(practice, 'SELECT count(*)::int AS n FROM posting_row')).toEqual([{ n: 0 }]);
  });
});
