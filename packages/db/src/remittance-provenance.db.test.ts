import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withJobScope, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { REMITTANCE_PROVENANCES } from './schema';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser, endPool } from './testing';

/**
 * Remittance provenance (migration 20261102090000; reconciliation-001 D12 (a) and D13 (a); docs/adr/0060), against
 * the application role: an 835 carries its whole X12 envelope and comes from an x12_835 document; an ERA export
 * carries no envelope and comes from an era_export document; the export duplicate key holds once per practice;
 * an export of a payment already loaded and an 835 of a payment first loaded from an export are refused by the
 * trigger (the loader holds both before it inserts); a claim of an 835 carries CLP06, a claim of an export may
 * not. Synthetic data only.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let north: TenantWorld;
let other: TenantWorld;
let manager: string;
let payerId: string;
let x12Document: string;
let exportDocument: string;

const ENVELOPE = ['sender_id', 'receiver_id', 'isa13', 'gs06', 'st02', 'trn03', 'bpr_method', 'payee_id_qualifier'] as const;

async function document(world: TenantWorld, actor: string, kind: 'x12_835' | 'era_export'): Promise<string> {
  const id = randomUUID();
  await withPracticeScope(app, { actorId: actor, practiceIds: [world.practiceId] }, (scope) =>
    scope.client.query('INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, format_id) VALUES ($1, $2, $3, 100, $4, $5, $6)', [
      id,
      world.practiceId,
      kind,
      kind === 'x12_835' ? 'application/edi-x12' : 'text/csv',
      actor,
      kind === 'era_export' ? 'webpt_billing_era_v0' : null,
    ]),
  );
  return id;
}

let sequence = 0;

interface Payment {
  readonly payee?: string;
  readonly trace?: string;
  readonly creditDebit?: 'C' | 'D';
  readonly cents?: string;
  readonly date?: string;
}

/** A remittance row's values: an 835 with its envelope, or an export with none; `overrides` replace columns. */
function remittanceRow(provenance: 'x12_835' | 'era_export', payment: Payment = {}, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  sequence += 1;
  const envelope =
    provenance === 'x12_835'
      ? { sender_id: 'SYNTHSENDER', receiver_id: 'SYNTHRECEIVER', isa13: String(100000000 + sequence), gs06: String(sequence), st02: '0001', trn03: '1SYNTHPAYR', bpr_method: 'ACH', payee_id_qualifier: 'XX' }
      : { sender_id: 'SYNTHSENDER', bpr_method: 'ACH' };
  return {
    practice_id: north.practiceId,
    source_document_id: provenance === 'x12_835' ? x12Document : exportDocument,
    provenance,
    trn02: payment.trace ?? `SYNTRACE${String(sequence)}`,
    bpr02_cents: payment.cents ?? '8800',
    bpr_credit_debit: payment.creditDebit ?? 'C',
    bpr16_date: payment.date ?? '2026-04-06',
    payer_name: 'SYNTHETIC PAYER A',
    payer_id: payerId,
    payee_npi: payment.payee ?? '9900639797',
    claim_count: 0,
    plb_total_cents: '0',
    ...envelope,
    ...overrides,
  };
}

/** Inserts `row` as the parse job of its practice, committed; returns its ID. */
async function insert(row: Record<string, unknown>, practiceId = north.practiceId): Promise<string> {
  const columns = Object.keys(row);
  const { rows } = await withJobScope(app, { jobId: randomUUID(), practiceId }, (scope) =>
    scope.client.query<{ id: string }>(`INSERT INTO remittance (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')}) RETURNING id`, Object.values(row)),
  );
  return (rows[0] as { id: string }).id;
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  north = await createTenantWorld(owner, 'north');
  other = await createTenantWorld(owner, 'other');
  manager = await createUser(owner);
  await addMembership(owner, north.organizationId, manager, 'billing_manager');
  payerId = randomUUID();
  await withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) =>
    scope.client.query("INSERT INTO payer (id, practice_id, payer_id_raw, name_raw) VALUES ($1, $2, 'NAME:SYNTHETIC PAYER A', 'SYNTHETIC PAYER A')", [payerId, north.practiceId]),
  );
  x12Document = await document(north, manager, 'x12_835');
  exportDocument = await document(north, manager, 'era_export');
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

describe('remittance provenance', () => {
  it('makes every remittance an 835 unless it says otherwise, and has exactly two provenances', async () => {
    const { provenance: _omitted, ...row } = remittanceRow('x12_835');
    const id = await insert(row);
    const { rows } = await owner.query<{ provenance: string }>('SELECT provenance FROM remittance WHERE id = $1', [id]);
    expect(rows).toEqual([{ provenance: 'x12_835' }]);
    const { rows: check } = await owner.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'remittance_provenance_check'");
    expect([...(check[0]?.definition ?? '').matchAll(/'([^']*)'::text/g)].map((match) => match[1])).toEqual([...REMITTANCE_PROVENANCES]);
    // No document is of that kind, so the trigger refuses it before the CHECK would.
    await expect(insert(remittanceRow('x12_835', {}, { provenance: 'csv' }))).rejects.toMatchObject({ code: '23514' });
  });

  it('requires the whole X12 envelope of an 835, each field as before', async () => {
    for (const column of ENVELOPE) {
      await expect(insert(remittanceRow('x12_835', {}, { [column]: null })), column).rejects.toMatchObject({ code: '23514', constraint: 'remittance_x12_envelope' });
      await expect(insert(remittanceRow('x12_835', {}, { [column]: ' ' })), column).rejects.toMatchObject({ code: '23514', constraint: `remittance_${column}_check` });
    }
  });

  it('loads an export with no envelope, keeping its sender and payment method only when its columns hold them', async () => {
    expect(await insert(remittanceRow('era_export'))).toEqual(expect.any(String));
    expect(await insert(remittanceRow('era_export', {}, { sender_id: null, bpr_method: null }))).toEqual(expect.any(String));
    for (const column of ['receiver_id', 'isa13', 'gs06', 'st02', 'trn03', 'payee_id_qualifier']) {
      await expect(insert(remittanceRow('era_export', {}, { [column]: 'SYNTHETIC1' })), column).rejects.toMatchObject({ code: '23514', constraint: 'remittance_export_has_no_envelope' });
    }
    // The fields both provenances hold stay required.
    for (const column of ['trn02', 'bpr02_cents', 'bpr_credit_debit', 'bpr16_date', 'payer_name', 'payee_npi', 'claim_count', 'plb_total_cents']) {
      await expect(insert(remittanceRow('era_export', {}, { [column]: null })), column).rejects.toMatchObject({ code: '23502' });
    }
    await expect(insert(remittanceRow('era_export', { cents: '-100' }))).rejects.toMatchObject({ code: '23514', constraint: 'remittance_bpr02_cents_check' });
  });

  it('takes a remittance only from a document of its own provenance in its practice', async () => {
    await expect(insert(remittanceRow('era_export', {}, { source_document_id: x12Document }))).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/document of its provenance/) });
    await expect(insert(remittanceRow('x12_835', {}, { source_document_id: exportDocument }))).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/document of its provenance/) });
    const theirs = await document(other, other.adminUserId, 'era_export');
    await expect(insert(remittanceRow('era_export', {}, { source_document_id: theirs }))).rejects.toMatchObject({ code: '23514' });
  });

  it('never changes a remittance’s provenance', async () => {
    const id = await insert(remittanceRow('era_export'));
    await expect(withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, (scope) => scope.client.query("UPDATE remittance SET provenance = 'x12_835' WHERE id = $1", [id]))).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('the export duplicate key and the 835’s authority (D12 a, D13 a)', () => {
  it('loads an export of a payment once: the trigger refuses a second, and the unique key backs it when two load at once', async () => {
    const payment = { trace: 'SYNEXPORTONCE1', cents: '7516', date: '2026-05-18' };
    await insert(remittanceRow('era_export', payment));
    await expect(insert(remittanceRow('era_export', payment))).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/already loaded/) });
    // Two transactions that do not see each other's row: the trigger passes both, and remittance_export_once refuses the second.
    const racing = { trace: 'SYNEXPORTRACE1', cents: '7516', date: '2026-05-18' };
    const [first, second] = [await app.connect(), await app.connect()];
    try {
      for (const client of [first, second]) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [randomUUID(), `{${north.practiceId}}`]);
      }
      const row = remittanceRow('era_export', racing);
      const columns = Object.keys(row);
      const sql = `INSERT INTO remittance (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})`;
      await first.query(sql, Object.values(row));
      const pid = (await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
      const blocked = second.query(sql, Object.values(remittanceRow('era_export', racing)));
      blocked.catch(() => undefined);
      // The second insert has passed its trigger and waits on the first's index entry before the first commits.
      for (let tries = 0; tries < 200; tries += 1) {
        const { rows } = await owner.query<{ wait: string | null }>('SELECT wait_event_type AS wait FROM pg_stat_activity WHERE pid = $1', [pid]);
        if (rows[0]?.wait === 'Lock') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await first.query('COMMIT');
      await expect(blocked).rejects.toMatchObject({ code: '23505', constraint: 'remittance_export_once' });
    } finally {
      await second.query('ROLLBACK');
      first.release();
      second.release();
    }
  });

  it('keys an export on payee, trace, the signed payment and its date: another of any loads (for review, by the loader)', async () => {
    const base = { payee: '9936708897', trace: 'SYNEXPORTKEY1', creditDebit: 'C' as const, cents: '2400', date: '2026-06-08' };
    await insert(remittanceRow('era_export', base));
    for (const variant of [{ payee: '9932455089' }, { trace: 'SYNEXPORTKEY2' }, { creditDebit: 'D' as const }, { cents: '2401' }, { date: '2026-06-09' }]) {
      expect(await insert(remittanceRow('era_export', { ...base, ...variant })), JSON.stringify(variant)).toEqual(expect.any(String));
    }
  });

  it('refuses an export of a payment an 835 loaded, and an 835 of a payment an export loaded first', async () => {
    const fromX12 = { trace: 'SYNAUTHORITY1', cents: '19111', date: '2026-05-11' };
    await insert(remittanceRow('x12_835', fromX12));
    await expect(insert(remittanceRow('era_export', fromX12))).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/already loaded/) });
    const fromExport = { trace: 'SYNAUTHORITY2', cents: '6400', date: '2026-06-17' };
    await insert(remittanceRow('era_export', fromExport));
    await expect(insert(remittanceRow('x12_835', fromExport))).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/held for review/) });
    // The same payment in another practice is that practice's own.
    const theirs = await document(other, other.adminUserId, 'x12_835');
    const theirPayer = randomUUID();
    await withJobScope(app, { jobId: randomUUID(), practiceId: other.practiceId }, (scope) =>
      scope.client.query("INSERT INTO payer (id, practice_id, payer_id_raw, name_raw) VALUES ($1, $2, 'NAME:SYNTHETIC PAYER A', 'SYNTHETIC PAYER A')", [theirPayer, other.practiceId]),
    );
    expect(await insert(remittanceRow('x12_835', fromExport, { practice_id: other.practiceId, source_document_id: theirs, payer_id: theirPayer }), other.practiceId)).toEqual(expect.any(String));
  });

  it('still lets two 835s share payee, trace, amount and date under different TRN03 values (ADR 0031)', async () => {
    const payment = { trace: 'SYNSHAREDTRACE1', cents: '7980', date: '2026-04-14' };
    await insert(remittanceRow('x12_835', payment, { trn03: '1SYNTHPAYA' }));
    expect(await insert(remittanceRow('x12_835', payment, { trn03: '1SYNTHPAYB' }))).toEqual(expect.any(String));
  });
});

describe('claim filing indicator', () => {
  const claimOf = async (remittanceId: string, filingIndicator: string | null) =>
    withJobScope(app, { jobId: randomUUID(), practiceId: north.practiceId }, async (scope) => {
      const patient = await scope.client.query<{ id: string }>("INSERT INTO patient_ref (practice_id, pseudonym) VALUES ($1, $2) RETURNING id", [north.practiceId, randomUUID().replaceAll('-', '').padEnd(64, '0')]);
      return scope.client.query(
        `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code, charge_cents, paid_cents, filing_indicator, patient_ref_id)
         VALUES ($1, $2, 1, 'enc:v1:c3ludGhldGlj', 'enc:v1:c3ludGhldGlj', $3, '1', 16000, 8800, $4, $5)`,
        [north.practiceId, remittanceId, 'f'.repeat(64), filingIndicator, (patient.rows[0] as { id: string }).id],
      );
    });

  it('requires CLP06 on a claim of an 835, and none of a claim of an export', async () => {
    const x12 = await insert(remittanceRow('x12_835'));
    await expect(claimOf(x12, null)).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/filing indicator/) });
    expect((await claimOf(x12, 'CI')).rowCount).toBe(1);
    const exported = await insert(remittanceRow('era_export'));
    expect((await claimOf(exported, null)).rowCount).toBe(1);
    await expect(claimOf(await insert(remittanceRow('era_export')), ' ')).rejects.toMatchObject({ code: '23514', constraint: 'claim_filing_indicator_check' });
  });
});
