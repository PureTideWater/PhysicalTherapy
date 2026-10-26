import { randomBytes, randomUUID } from 'node:crypto';

import type { PracticeCipher } from '@tp/db/runtime';
import { asOwner } from '@tp/db/testing';
import type pg from 'pg';

/**
 * SYNTHETIC records for the contract screen's database tests (patient-records.db.test.ts, gateway.db.test.ts): the
 * rows the 835 loader (apps/worker/src/parse/loader.ts, which this package cannot import) writes for a remittance's
 * patients and claims, with their member IDs, patient control numbers and payer claim control numbers encrypted
 * under the practice's cipher, written as the owner. A test seeds a practice's identifiers from packages/synth
 * (MOD-12's practice, or values of its own) and asks the screen about pages.
 */

export interface ScreenWorldRecords {
  readonly memberIds?: readonly string[];
  readonly patientControlNumbers?: readonly string[];
  readonly payerClaimNumbers?: readonly string[];
  /** Further claims, every one holding the same numbers (SCHEDULE00000001 and 7700000000001): enough rows to pass the bound, cheaply. */
  readonly bulkClaims?: number;
}

export interface SeededRecords {
  readonly patientRefIds: readonly string[];
  readonly claimIds: readonly string[];
}

/** Writes one remittance for the practice holding the given identifiers: one patient per member ID, one claim per number pair. */
export async function seedScreenRecords(owner: pg.Client, practice: { readonly practiceId: string; readonly uploaderId: string }, cipher: PracticeCipher, records: ScreenWorldRecords): Promise<SeededRecords> {
  const { practiceId } = practice;
  return asOwner(
    owner,
    [practiceId],
    async () => {
      const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
      const document = await one(
        "INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status) VALUES ($1, 'x12_835', 1200, 'application/octet-stream', $2, $3, 'clean', now(), 'loaded') RETURNING id",
        [practiceId, practice.uploaderId, randomBytes(32).toString('hex')],
      );
      const payer = await one("INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, $2, 'SYNTHETIC PAYER SCREEN') RETURNING id", [practiceId, `2U:SYNSCREEN${randomBytes(4).toString('hex').toUpperCase()}`]);
      const patientRefIds: string[] = [];
      for (const memberId of records.memberIds ?? []) {
        patientRefIds.push(
          await one('INSERT INTO patient_ref (practice_id, pseudonym, member_id) VALUES ($1, $2, $3) RETURNING id', [
            practiceId,
            cipher.lookupHash('patient_ref.pseudonym', `screen|${randomUUID()}`),
            cipher.encrypt('patient_ref.member_id', memberId),
          ]),
        );
      }
      const holder = patientRefIds[0] ?? (await one('INSERT INTO patient_ref (practice_id, pseudonym) VALUES ($1, $2) RETURNING id', [practiceId, cipher.lookupHash('patient_ref.pseudonym', `screen|${randomUUID()}`)]));
      const pcns = records.patientControlNumbers ?? [];
      const ccns = records.payerClaimNumbers ?? [];
      const pairs = Array.from({ length: Math.max(pcns.length, ccns.length) }, (_, index) => [pcns[index] ?? 'P1', ccns[index] ?? 'C1'] as const);
      const remittance = await one(
        `INSERT INTO remittance (practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method, bpr16_date,
           payer_name, payer_id, payee_npi, payee_id_qualifier, claim_count, plb_total_cents)
         VALUES ($1, $2, 'SYNTHSENDER', 'SYNTHRECEIVER', '000000012', '1', '0001', $3, '1SYN000012', 0, 'C', 'ACH', '2026-04-06', 'SYNTHETIC PAYER SCREEN', $4, '9900000012', 'XX', $5, 0)
         RETURNING id`,
        [practiceId, document, `SYNSCREEN${randomBytes(6).toString('hex').toUpperCase()}`, payer, pairs.length + (records.bulkClaims ?? 0)],
      );
      const insertClaim = `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
           charge_cents, paid_cents, patient_resp_cents, filing_indicator, patient_ref_id, service_from, service_to)`;
      const claimIds: string[] = [];
      for (const [index, [pcn, ccn]] of pairs.entries()) {
        claimIds.push(
          await one(`${insertClaim} VALUES ($1, $2, $3, $4, $5, $6, '1', 0, 0, 0, '12', $7, '2026-03-15', '2026-03-15') RETURNING id`, [
            practiceId,
            remittance,
            index + 1,
            cipher.encrypt('claim.patient_control_number', pcn),
            cipher.encrypt('claim.payer_claim_control_number', ccn),
            cipher.lookupHash('claim.payer_claim_control_number', ccn),
            holder,
          ]),
        );
      }
      if ((records.bulkClaims ?? 0) > 0) {
        await owner.query(
          `${insertClaim} SELECT $1, $2, $3::int + n, $4, $5, $6, '1', 0, 0, 0, '12', $7, '2026-03-15', '2026-03-15' FROM generate_series(1, $8::int) AS n`,
          [
            practiceId,
            remittance,
            pairs.length,
            cipher.encrypt('claim.patient_control_number', 'SCHEDULE00000001'),
            cipher.encrypt('claim.payer_claim_control_number', '7700000000001'),
            cipher.lookupHash('claim.payer_claim_control_number', '7700000000001'),
            holder,
            records.bulkClaims,
          ],
        );
      }
      return { patientRefIds, claimIds };
    },
    practice.uploaderId,
  );
}
