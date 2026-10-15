import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, type PracticeCipher, databaseClient, documentObjectKey, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createTenantWorld, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import { SYNTHETIC_BODY, syntheticInterchange } from '@tp/edi835/testing';

import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { DocumentStore } from '../storage/documents';
import { parseHandler } from './job';

/**
 * The parse_835 job and the loader against PostgreSQL, as the application role in each job's scope
 * (PRD 10, steps 8 to 10 and What the loader never does; PRD 6, Canonical model and matching; test
 * matrix PAR-07, PAR-08, PAR-20, PAR-30, JOB-01; variant V25). The documents are SYNTHETIC fixtures,
 * sealed under their keys as intake leaves them, with their hashes recorded and their scan clean.
 * apps/web/src/lib/routes/remittances.db.test.ts runs every PAR case through the upload routes.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic');
const fixture = (relative: string) => readFileSync(path.join(FIXTURES, relative));
const RELEASE_DIR = path.join(FIXTURES, 'rules/release-synth-900001');

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let world: TenantWorld;
let other: TenantWorld;
let manager: string;
const keys = LocalKeyProvider.random();
const ciphers = new Map<string, PracticeCipher>();
const bytes = new MemorySealedBytes();
const documents = new DocumentStore(bytes);
const parse = parseHandler({ documents, keys });

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 8);
  await loadRelease(owner, RELEASE_DIR, { release: 900001, allowSyntheticFixtureForTests: true });
  world = await createTenantWorld(owner, 'parse');
  other = await createTenantWorld(owner, 'parse other');
  for (const practiceId of [world.practiceId, other.practiceId]) {
    const key = await provisionPracticeKey(keys, practiceId);
    await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, practiceId]);
    ciphers.set(practiceId, key.cipher);
  }
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
}, 60_000);

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

interface Logs {
  readonly lines: Record<string, unknown>[];
}

function context(practiceId: string, logs: Logs = { lines: [] }, lastAttempt = false): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: (line) => logs.lines.push(JSON.parse(line) as Record<string, unknown>) }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: () => Promise.resolve(null),
    lastAttempt,
  };
}

/** A document as intake leaves a clean 835: its row, its sealed bytes, its hash, scanned. */
async function stage(content: Buffer, practice: TenantWorld = world, sha256 = createHash('sha256').update(content).digest('hex')): Promise<string> {
  const id = randomUUID();
  const uploader = practice === world ? manager : practice.adminUserId;
  await withPracticeScope(app, { actorId: uploader, practiceIds: [practice.practiceId] }, (scope) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', $3, 'application/octet-stream', $4)", [
      id,
      practice.practiceId,
      content.length,
      uploader,
    ]),
  );
  await documents.write(ciphers.get(practice.practiceId) as PracticeCipher, documentObjectKey(practice.practiceId, id), Readable.from([content]));
  await asOwner(owner, [practice.practiceId], () =>
    owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [id, sha256]),
  );
  return id;
}

async function run(documentId: string, practice: TenantWorld = world, logs?: Logs, lastAttempt = false): Promise<void> {
  await parse({ practice_id: practice.practiceId, document_id: documentId }, context(practice.practiceId, logs, lastAttempt));
}

async function count(table: string, where = 'true', values: unknown[] = []): Promise<number> {
  const { rows } = await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, values);
  return rows[0]?.n ?? 0;
}

async function documentStatus(id: string): Promise<string> {
  return ((await owner.query<{ status: string }>('SELECT status FROM source_document WHERE id = $1', [id])).rows[0] as { status: string }).status;
}

interface ReportRow {
  readonly outcome: string;
  readonly transactions: number;
  readonly held: number;
  readonly loaded_transactions: number;
  readonly loaded_claims: number;
  readonly duplicate_transactions: number;
  readonly unknown_codes: string[];
  readonly errors: Record<string, unknown>[];
  readonly transaction_outcomes: Record<string, unknown>[];
  readonly code_list_release: number | null;
}

async function report(documentId: string): Promise<ReportRow> {
  const { rows } = await owner.query<ReportRow>('SELECT * FROM parse_report WHERE source_document_id = $1', [documentId]);
  expect(rows).toHaveLength(1);
  return rows[0] as ReportRow;
}

/** A fixture with its trace number and patient made distinct, so it is a different remittance. */
let variations = 0;
function distinct(relative: string): Buffer {
  variations += 1;
  const tag = String(variations).padStart(4, '0');
  return Buffer.from(fixture(relative).toString('latin1').replaceAll('SYNEFT', `SYNX${tag}`), 'latin1');
}

describe('loading a balanced remittance (PAR-01)', () => {
  it('writes the remittance, its claim and lines, adjustments, patient and payer, with identifiers encrypted', async () => {
    const id = await stage(fixture('PAR-01/remit.835'));
    await run(id);
    expect(await documentStatus(id)).toBe('loaded');
    const [remittance] = (await owner.query('SELECT * FROM remittance WHERE source_document_id = $1', [id])).rows as Record<string, unknown>[];
    expect(remittance).toMatchObject({
      practice_id: world.practiceId,
      sender_id: 'SYNTHSENDER',
      isa13: '010010001',
      st02: '0001',
      trn02: 'SYNEFTPAR01001',
      bpr02_cents: '8800',
      bpr_method: 'ACH',
      bpr_credit_debit: 'C',
      payer_name: 'SYNTHETIC PAYER A',
      payee_id_qualifier: 'XX',
      balanced: true,
      balance_diff_cents: '0',
      claim_count: 1,
      status: 'loaded',
      review_reason: null,
    });
    const cipher = ciphers.get(world.practiceId) as PracticeCipher;
    const [claim] = (await owner.query('SELECT * FROM claim WHERE remittance_id = $1', [remittance?.id])).rows as Record<string, string>[];
    expect(claim?.patient_control_number).toMatch(/^enc:v1:/);
    expect(cipher.decrypt('claim.patient_control_number', claim?.patient_control_number ?? '')).toBe('SYNPCNPAR01001');
    expect(cipher.decrypt('claim.payer_claim_control_number', claim?.payer_claim_control_number ?? '')).toBe('SYNCCNPAR010001');
    expect(claim?.payer_claim_control_number_hash).toBe(cipher.lookupHash('claim.payer_claim_control_number', 'SYNCCNPAR010001'));
    expect(claim).toMatchObject({ claim_status_code: '1', charge_cents: '16000', paid_cents: '8800', patient_resp_cents: '2200', filing_indicator: '12', facility_type: '11' });
    const [line] = (await owner.query('SELECT * FROM service_line WHERE claim_id = $1', [claim?.id])).rows as Record<string, unknown>[];
    expect(line).toMatchObject({ procedure_qualifier: 'HC', procedure_code: '97110', modifiers: ['GP'], units: '2.000', observed_allowed_cents: '11000', observed_allowed_basis: 'paid_plus_pr', patient_share_cents: '2200' });
    expect((await owner.query('SELECT group_code, reason_code, amount_cents::text AS amount, position, unknown_code FROM adjustment WHERE claim_id = $1 ORDER BY position', [claim?.id])).rows).toEqual([
      { group_code: 'CO', reason_code: '45', amount: '5000', position: 1, unknown_code: false },
      { group_code: 'PR', reason_code: '2', amount: '2200', position: 2, unknown_code: false },
    ]);
    // The patient: one pseudonymous reference with the name and member ID encrypted.
    const [patient] = (await owner.query('SELECT * FROM patient_ref WHERE id = $1', [claim?.patient_ref_id])).rows as Record<string, string>[];
    expect(patient?.pseudonym).toBe(cipher.lookupHash('patient_ref.pseudonym', 'name|SYNTHLASTL7MLBP|SYNTHFIRSTH6E||'));
    expect(cipher.decrypt('patient_ref.last_name', patient?.last_name ?? '')).toBe('SYNTHLASTL7MLBP');
    expect(cipher.decrypt('patient_ref.member_id', patient?.member_id ?? '')).toBe('SYNMBR39859729');
    // The payer and the plan reach the mapping queue.
    expect((await owner.query('SELECT payer_id_raw, name_raw FROM payer WHERE id = $1', [remittance?.payer_id])).rows).toEqual([{ payer_id_raw: '2U:SYNPAYERA', name_raw: 'SYNTHETIC PAYER A' }]);
    expect((await owner.query('SELECT p.plan_key FROM plan p JOIN service_line l ON l.payer_plan_key = p.id WHERE l.id = $1', [line?.id])).rows).toEqual([{ plan_key: 'CE:SYNPLAN-COMM-01' }]);
    expect(await report(id)).toMatchObject({ outcome: 'loaded', transactions: 1, held: 0, loaded_transactions: 1, loaded_claims: 1, errors: [], code_list_release: 900001 });
    // Nothing of the patient is stored in plain text anywhere.
    const dump = JSON.stringify((await owner.query('SELECT c.*, p.* FROM claim c JOIN patient_ref p ON p.id = c.patient_ref_id WHERE c.remittance_id = $1', [remittance?.id])).rows);
    for (const value of ['SYNPCNPAR01001', 'SYNCCNPAR010001', 'SYNTHLASTL7MLBP', 'SYNTHFIRSTH6E', 'SYNMBR39859729']) {
      expect(dump).not.toContain(value);
    }
  });
});

describe('idempotency', () => {
  it('replays a parse job with no duplicate effects (JOB-01)', async () => {
    const id = await stage(fixture('JOB-01/remit.835'));
    const logs: Logs = { lines: [] };
    await run(id, world, logs);
    await run(id, world, logs);
    expect(await count('remittance', 'source_document_id = $1', [id])).toBe(1);
    expect(await count('claim c JOIN remittance r ON r.id = c.remittance_id', 'r.source_document_id = $1', [id])).toBe(1);
    expect(await count('parse_report', 'source_document_id = $1', [id])).toBe(1);
    expect(logs.lines.map((line) => line.msg)).toEqual(['document parsed and loaded', 'document was not waiting for parse']);
  });

  it('resumes an attempt that loaded part of a document: the loaded transaction set is not loaded again', async () => {
    const content = distinct('PAR-02/remit.835');
    const id = await stage(content);
    await run(id);
    const remittances = await count('remittance', 'source_document_id = $1', [id]);
    expect(remittances).toBe(2);
    // As if the attempt had stopped before its report: the next one finds both sets already loaded.
    await asOwner(owner, [world.practiceId], async () => {
      await owner.query('DELETE FROM parse_report WHERE source_document_id = $1', [id]);
      await owner.query("UPDATE source_document SET status = 'scanned' WHERE id = $1", [id]);
    });
    await run(id);
    expect(await count('remittance', 'source_document_id = $1', [id])).toBe(remittances);
    expect(await report(id)).toMatchObject({ outcome: 'loaded', loaded_transactions: 2, duplicate_transactions: 0 });
  });

  it('loads the same remittance from a second download as zero rows, linked to the original (PAR-07)', async () => {
    const original = await stage(fixture('PAR-07/original.835'));
    const resent = await stage(fixture('PAR-07/resent.835'));
    await run(original);
    await run(resent);
    expect(await count('remittance', "trn02 = 'SYNEFTPAR07001'")).toBe(1);
    expect(await count('remittance', 'source_document_id = $1', [resent])).toBe(0);
    expect(await documentStatus(resent)).toBe('duplicate');
    const [loaded] = (await owner.query<{ id: string }>('SELECT id FROM remittance WHERE source_document_id = $1', [original])).rows;
    const resentReport = await report(resent);
    expect(resentReport).toMatchObject({ outcome: 'duplicate', loaded_transactions: 0, loaded_claims: 0, duplicate_transactions: 1 });
    expect(resentReport.transaction_outcomes).toEqual([expect.objectContaining({ outcome: 'duplicate_remittance', linkedRemittanceId: loaded?.id, linkedDocumentId: original, reasons: ['EDI_DUPLICATE'] })]);
  });

  it('makes exactly one remittance row when two documents of the same remittance load at once (PAR-30)', async () => {
    const first = distinct('PAR-07/original.835');
    const tag = first.toString('latin1').match(/SYNX\d{4}/)?.[0] ?? '';
    const second = Buffer.from(fixture('PAR-07/resent.835').toString('latin1').replaceAll('SYNEFT', tag), 'latin1');
    const ids = [await stage(first), await stage(second)];
    await Promise.all(ids.map((id) => run(id)));
    expect(await count('remittance', 'trn02 = $1', [`${tag}PAR07001`])).toBe(1);
    const outcomes = await Promise.all(ids.map(async (id) => (await report(id)).outcome));
    expect(outcomes.sort()).toEqual(['duplicate', 'loaded']);
  });

  it('loads a different remittance reusing a trace on another day, surfaced for review against the first (V25)', async () => {
    const first = await stage(fixture('variants/V25-trace-reused/first.835'));
    const second = await stage(fixture('variants/V25-trace-reused/second.835'));
    await run(first);
    await run(second);
    const rows = (await owner.query<{ id: string; source_document_id: string; review_reason: string | null; review_of_remittance_id: string | null }>(
      'SELECT id, source_document_id, review_reason, review_of_remittance_id FROM remittance WHERE source_document_id = ANY ($1::uuid[])',
      [[first, second]],
    )).rows;
    const earlier = rows.find((row) => row.source_document_id === first);
    expect(rows.find((row) => row.source_document_id === second)).toMatchObject({ review_reason: 'trace_reused_another_date', review_of_remittance_id: earlier?.id });
    expect((await report(second)).transaction_outcomes).toEqual([expect.objectContaining({ outcome: 'loaded_for_review', linkedRemittanceId: earlier?.id })]);
  });
});

/** The net view: adjudicated claims, neither a reversal, nor reversed, nor superseded (PRD 6). */
async function netClaims(remittanceDocuments: readonly string[]): Promise<{ paid: string }[]> {
  return (
    await owner.query<{ paid: string }>(
      `SELECT c.paid_cents::text AS paid FROM claim c JOIN remittance r ON r.id = c.remittance_id
        WHERE r.source_document_id = ANY ($1::uuid[]) AND c.claim_status_code <> '22' AND c.superseded_by_claim_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id)`,
      [remittanceDocuments],
    )
  ).rows;
}

describe('reversals and corrections (PAR-08)', () => {
  it('links the reversal to the claim it reverses, and the correction supersedes it: the net view shows one claim', async () => {
    const original = await stage(fixture('PAR-08/original.835'));
    const correction = await stage(fixture('PAR-08/correction.835'));
    await run(original);
    await run(correction);
    const claims = (
      await owner.query<{ id: string; status: string; doc: string; reversal_of: string | null; superseded_by: string | null; claim_no: number }>(
        `SELECT c.id, c.claim_status_code AS status, r.source_document_id AS doc, c.reversal_of_claim_id AS reversal_of, c.superseded_by_claim_id AS superseded_by, c.claim_no
           FROM claim c JOIN remittance r ON r.id = c.remittance_id WHERE r.source_document_id = ANY ($1::uuid[]) ORDER BY r.created_at, c.claim_no`,
        [[original, correction]],
      )
    ).rows;
    const [first, reversal, corrected] = claims;
    expect(claims).toHaveLength(3);
    expect(reversal).toMatchObject({ status: '22', reversal_of: first?.id });
    expect(first).toMatchObject({ superseded_by: corrected?.id });
    expect(await netClaims([original, correction])).toEqual([{ paid: '13200' }]);
  });

  it('links a reversal loaded before its original once the original arrives (files uploaded out of order)', async () => {
    const original = distinct('PAR-08/original.835');
    const tag = original.toString('latin1').match(/SYNX\d{4}/)?.[0] ?? '';
    const later = Buffer.from(fixture('PAR-08/correction.835').toString('latin1').replaceAll('SYNEFT', tag).replaceAll('SYNCCNPAR08', `${tag}C`).replaceAll('SYNPCNPAR08', `${tag}P`), 'latin1');
    const earlier = Buffer.from(original.toString('latin1').replaceAll('SYNCCNPAR08', `${tag}C`).replaceAll('SYNPCNPAR08', `${tag}P`), 'latin1');
    const correction = await stage(later);
    const first = await stage(earlier);
    await run(correction);
    await run(first);
    const [linked] = (
      await owner.query<{ reversal_of: string | null; original: string }>(
        `SELECT x.reversal_of_claim_id AS reversal_of, o.id AS original FROM claim x JOIN remittance rx ON rx.id = x.remittance_id,
                claim o JOIN remittance ro ON ro.id = o.remittance_id
          WHERE rx.source_document_id = $1 AND x.claim_status_code = '22' AND ro.source_document_id = $2`,
        [correction, first],
      )
    ).rows;
    expect(linked?.reversal_of).toBe(linked?.original);
    expect(await netClaims([correction, first])).toEqual([{ paid: '13200' }]);
  });
});

describe('a reversal in the same transaction set as its original', () => {
  it('links to the original the parser found there, and an earlier orphan reversal is not taken as a second one', async () => {
    const header = SYNTHETIC_BODY.slice(0, SYNTHETIC_BODY.indexOf('LX*1') + 1);
    const original = SYNTHETIC_BODY.slice(SYNTHETIC_BODY.indexOf('LX*1') + 1).map((segment) => segment.replace('SYNPCN0001', 'SYNPCNSAME01').replace('SYNCCN0001', 'SYNCCNSAME01'));
    const reversal = ['CLP*SYNPCNSAME01*22*-150.00*-100.00*-20.00*12*SYNCCNSAME01*11*8', 'NM1*QC*1*SYNTHLAST*SYNTHFIRST****MI*SYNMBR0001', 'SVC*HC:97110:GP*-150.00*-100.00**2', 'DTM*472*20260315', 'CAS*CO*45*-30.00', 'CAS*PR*2*-20.00'];
    // A reversal alone, paid back by a debit and loaded first, two weeks after: its original is not loaded.
    const alone = header.map((segment) => segment.replace('*100.00*C*ACH', '*100.00*D*ACH').replace('SYNTRACE0001', 'SYNSAME0001').replace(/\*20260406$/, '*20260420'));
    const orphan = await stage(Buffer.from(syntheticInterchange([[...alone, ...reversal]], '000000776', '776'), 'utf8'));
    await run(orphan);
    // Then the original and its reversal in one transaction set, paying nothing in all.
    const together = header.map((segment) => segment.replace('*100.00*C*ACH', '*0.00*C*ACH').replace('SYNTRACE0001', 'SYNSAME0002'));
    const both = await stage(Buffer.from(syntheticInterchange([[...together, ...original, ...reversal]], '000000777', '777'), 'utf8'));
    await run(both);
    const claims = (
      await owner.query<{ id: string; doc: string; status: string; reversal_of: string | null }>(
        `SELECT c.id, r.source_document_id AS doc, c.claim_status_code AS status, c.reversal_of_claim_id AS reversal_of
           FROM claim c JOIN remittance r ON r.id = c.remittance_id WHERE r.source_document_id = ANY ($1::uuid[]) ORDER BY r.created_at, c.claim_no`,
        [[orphan, both]],
      )
    ).rows;
    const [waiting, first, reversed] = claims;
    expect(claims.map((claim) => [claim.doc, claim.status])).toEqual([
      [orphan, '22'],
      [both, '1'],
      [both, '22'],
    ]);
    expect(reversed?.reversal_of).toBe(first?.id);
    expect(waiting?.reversal_of).toBeNull();
    expect(await netClaims([both])).toEqual([]);
  });
});

describe('what the loader never does', () => {
  it('never loads a transaction that does not balance: it is held with the difference and its position (PAR-20)', async () => {
    const id = await stage(fixture('PAR-20/unbalanced-transaction.835'));
    await run(id);
    expect(await documentStatus(id)).toBe('held');
    expect(await count('remittance', 'source_document_id = $1', [id])).toBe(0);
    const held = await report(id);
    expect(held).toMatchObject({ outcome: 'held', held: 1, loaded_transactions: 0 });
    expect(held.errors).toEqual([{ code: 'EDI_UNBALANCED', scope: 'transaction', segmentIndex: 4, segmentId: 'BPR', elementPosition: 2, differenceCents: '-100', transaction: { interchange: 0, group: 0, transaction: 0, st02: '0001' } }]);
    // Codes and positions only: nothing from the file's fields.
    expect(JSON.stringify(held.errors)).not.toMatch(/SYNPCN|SYNCCN|SYNTHLAST|SYNTHETIC PAYER/);
  });

  it('holds one bad document while the others load: a held file never blocks other files', async () => {
    const bad = await stage(fixture('PAR-25/truncated.835'));
    const good = await stage(distinct('PAR-01/remit.835'));
    await run(bad);
    await run(good);
    expect(await documentStatus(bad)).toBe('held');
    expect((await report(bad)).errors).toEqual([expect.objectContaining({ code: 'EDI_SYNTAX', reason: 'truncated', segmentIndex: 29, segmentId: 'CLP', elementPosition: 3 })]);
    expect(await documentStatus(good)).toBe('loaded');
  });

  it('finds no document of another practice: a job reads and loads for its own practice only', async () => {
    const theirs = await stage(distinct('PAR-01/remit.835'), other);
    const logs: Logs = { lines: [] };
    await run(theirs, world, logs);
    expect(logs.lines).toEqual([expect.objectContaining({ msg: 'parse found no such document', error_code: 'DOCUMENT_NOT_FOUND' })]);
    expect(await documentStatus(theirs)).toBe('scanned');
    await run(theirs, other);
    expect(await count('remittance', 'source_document_id = $1 AND practice_id = $2', [theirs, other.practiceId])).toBe(1);
    // The database refuses a claim of one practice that names another practice's remittance.
    const [remittance] = (await owner.query<{ id: string }>('SELECT id FROM remittance WHERE source_document_id = $1', [theirs])).rows;
    const [patient] = (await owner.query<{ id: string }>('SELECT id FROM patient_ref WHERE practice_id = $1 LIMIT 1', [world.practiceId])).rows;
    await expect(
      withJobScope(app, { jobId: randomUUID(), practiceId: world.practiceId }, (scope) =>
        scope.client.query(
          `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
             charge_cents, paid_cents, filing_indicator, patient_ref_id) VALUES ($1, $2, 99, 'enc:v1:AAAA', 'enc:v1:AAAA', $3, '1', 0, 0, '12', $4)`,
          [world.practiceId, remittance?.id, 'a'.repeat(64), patient?.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('loads nothing from bytes that are not the ones intake hashed, and marks the document failed on the last attempt', async () => {
    const id = await stage(distinct('PAR-01/remit.835'), world, 'f'.repeat(64));
    await expect(run(id)).rejects.toThrow(/not the bytes intake hashed/);
    expect(await documentStatus(id)).toBe('scanned');
    await expect(run(id, world, undefined, true)).rejects.toThrow(/not the bytes intake hashed/);
    expect(await documentStatus(id)).toBe('failed');
    expect(await count('remittance', 'source_document_id = $1', [id])).toBe(0);
  });

  it('leaves a document that is not waiting for parse as it is', async () => {
    const id = await stage(distinct('PAR-01/remit.835'));
    await asOwner(owner, [world.practiceId], () => owner.query("UPDATE source_document SET status = 'stored' WHERE id = $1", [id]));
    const logs: Logs = { lines: [] };
    await run(id, world, logs);
    expect(logs.lines.map((line) => line.msg)).toEqual(['document was not waiting for parse']);
    expect(await count('parse_report', 'source_document_id = $1', [id])).toBe(0);
  });
});

describe('unknown codes and exact values', () => {
  it('loads an unknown CARC with its flag and lists it in the receipt (PAR-21)', async () => {
    const id = await stage(fixture('PAR-21/remit.835'));
    await run(id);
    expect(await count('adjustment a JOIN claim c ON c.id = a.claim_id JOIN remittance r ON r.id = c.remittance_id', "r.source_document_id = $1 AND a.reason_code = 'Z999' AND a.unknown_code", [id])).toBe(1);
    const flagged = await report(id);
    expect(flagged).toMatchObject({ outcome: 'loaded', unknown_codes: ['carc:Z999'] });
    expect(flagged.errors).toEqual([expect.objectContaining({ code: 'EDI_UNKNOWN_CODE', list: 'carc', segmentId: 'CAS', elementPosition: 2 })]);
    expect(JSON.stringify(flagged.errors)).not.toContain('Z999');
  });

  it('stores decimal units and four modifiers exactly (PAR-22), and holds units it cannot store exactly', async () => {
    const id = await stage(fixture('PAR-22/remit.835'));
    await run(id);
    expect(
      (await owner.query('SELECT l.units::text AS units, l.original_units::text AS original, l.modifiers FROM service_line l JOIN claim c ON c.id = l.claim_id JOIN remittance r ON r.id = c.remittance_id WHERE r.source_document_id = $1 ORDER BY l.line_no', [id]))
        .rows,
    ).toEqual([
      { units: '1.500', original: '2.000', modifiers: ['59', 'KX', 'CQ', 'CO'] },
      { units: '0.250', original: null, modifiers: ['KX'] },
    ]);
    const inexact = await stage(Buffer.from(distinct('PAR-22/remit.835').toString('latin1').replace('**1.5**2', '**1.5001**2'), 'latin1'));
    await run(inexact);
    expect(await documentStatus(inexact)).toBe('held');
    expect((await report(inexact)).errors).toEqual([expect.objectContaining({ code: 'EDI_SYNTAX', reason: 'invalid_decimal', segmentId: 'SVC', elementPosition: 5 })]);
  });
});

describe('a large document', () => {
  /** Twenty SYNTHETIC transaction sets of 500 claims each, like PAR-29: 10,000 claims in one file. */
  function largeDocument(): Buffer {
    const header = SYNTHETIC_BODY.slice(0, SYNTHETIC_BODY.indexOf('LX*1') + 1);
    const claim = SYNTHETIC_BODY.slice(SYNTHETIC_BODY.indexOf('LX*1') + 1);
    const bodies = Array.from({ length: 20 }, (_, set) => [
      ...header.map((segment) => segment.replace('*100.00*C*ACH', '*50000.00*C*ACH').replace('SYNTRACE0001', `SYNLARGE${String(set).padStart(4, '0')}`)),
      ...Array.from({ length: 500 }, (_, index) =>
        claim.map((segment) =>
          segment
            .replace('SYNPCN0001', `SYNPCN${String(set)}X${String(index)}`)
            .replace('SYNCCN0001', `SYNCCN${String(set)}X${String(index)}`)
            .replace('SYNTHLAST*', `SYNTHLAST${String(index % 50)}*`),
        ),
      ).flat(),
    ]);
    return Buffer.from(syntheticInterchange(bodies, '000000929', '929'), 'utf8');
  }

  it('parses and loads 10,000 claims in under a minute, one transaction set at a time (PAR-29)', async () => {
    const id = await stage(largeDocument());
    const started = performance.now();
    await run(id);
    const seconds = (performance.now() - started) / 1000;
    expect(await report(id)).toMatchObject({ outcome: 'loaded', transactions: 20, loaded_transactions: 20, loaded_claims: 10_000 });
    expect(await count('claim c JOIN remittance r ON r.id = c.remittance_id', 'r.source_document_id = $1', [id])).toBe(10_000);
    expect(seconds).toBeLessThan(60);
  }, 180_000);
});
