import { randomBytes, randomUUID } from 'node:crypto';

import type { PracticeCipher } from '@tp/db/runtime';
import { asOwner } from '@tp/db/testing';
import type pg from 'pg';

/**
 * SYNTHETIC records for the contract screen's database tests (patient-records.db.test.ts, gateway.db.test.ts): the
 * rows the 835 loader (apps/worker/src/parse/loader.ts, which this package cannot import) writes for a remittance's
 * patients and claims, with their member IDs, patient control numbers and payer claim control numbers encrypted
 * under the practice's cipher, and the rows the reconcile job (apps/worker/src/reconcile/exports.ts and postings.ts)
 * writes for a posting export's lines and the claims it matches them to, written as the owner. A test seeds a
 * practice's identifiers from packages/synth (MOD-12's practice, or values of its own) and asks the screen about
 * pages.
 */

export interface ScreenWorldRecords {
  readonly memberIds?: readonly string[];
  readonly patientControlNumbers?: readonly string[];
  readonly payerClaimNumbers?: readonly string[];
  /** Further claims, every one holding the same numbers (SCHEDULE00000001 and 7700000000001): enough rows to pass the bound, cheaply. */
  readonly bulkClaims?: number;
  /** The last this many listed claims have their patient control number sealed for another column, so it no longer decrypts (what a write bug, or a restore under the wrong key, leaves). */
  readonly undecryptableClaims?: number;
  /** Lines of one posting export (a paper check's), each holding one claim reference, matched to no claim: numbers the practice holds only there. */
  readonly postingReferences?: readonly string[];
  /** The first this many listed claims each also have a posting line whose claim reference is their patient control number, matched to the claim at the claim level, as the reconcile job matches one. */
  readonly postedClaims?: number;
}

export interface SeededRecords {
  readonly patientRefIds: readonly string[];
  readonly claimIds: readonly string[];
  /** The posting lines, unmatched (postingReferences) first, then the matched (postedClaims). */
  readonly postingRowIds: readonly string[];
}

/** Writes one remittance for the practice holding the given identifiers (one patient per member ID, one claim per number pair) and, when asked, one posting export's lines. */
export async function seedScreenRecords(owner: pg.Client, practice: { readonly practiceId: string; readonly uploaderId: string }, cipher: PracticeCipher, records: ScreenWorldRecords): Promise<SeededRecords> {
  const { practiceId } = practice;
  const loaded = await asOwner(
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
      const undecryptableFrom = pairs.length - (records.undecryptableClaims ?? 0);
      for (const [index, [pcn, ccn]] of pairs.entries()) {
        claimIds.push(
          await one(`${insertClaim} VALUES ($1, $2, $3, $4, $5, $6, '1', 0, 0, 0, '12', $7, '2026-03-15', '2026-03-15') RETURNING id`, [
            practiceId,
            remittance,
            index + 1,
            // Sealed for another column: a well-formed ciphertext the claim's column cannot open.
            cipher.encrypt(index >= undecryptableFrom ? 'patient_ref.member_id' : 'claim.patient_control_number', pcn),
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
      const exported =
        (records.postingReferences ?? []).length + (records.postedClaims ?? 0) === 0
          ? null
          : await one(
              "INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status) VALUES ($1, 'posting_export', 400, 'text/csv', $2, $3, 'clean', now(), 'stored') RETURNING id",
              [practiceId, practice.uploaderId, randomBytes(32).toString('hex')],
            );
      return { patientRefIds, claimIds, remittance, exported, pcns: pairs.map(([pcn]) => pcn) };
    },
    practice.uploaderId,
  );
  const { patientRefIds, claimIds, remittance, exported, pcns } = loaded;
  if (exported === null) {
    return { patientRefIds, claimIds, postingRowIds: [] };
  }
  // The posting lines and their matches are the reconcile job's: written in no person's name (its job ID is no user).
  const postingRowIds = await asOwner(
    owner,
    [practiceId],
    async () => {
      const ids: string[] = [];
      const line = async (reference: string) => {
        const { rows } = await owner.query<{ id: string }>(
          `INSERT INTO posting_row (practice_id, source_document_id, row_no, check_or_trace, posted_on, amount_cents, claim_reference, procedure_code, service_date, payer_name, batch, raw, template, fingerprint)
           VALUES ($1, $2, $3, 'SYNPAPERCHK0001', '2026-04-10', 4310, $4, '97110', '2026-03-15', 'SYNTHETIC PAPER PAYER', 'B1', '{}'::jsonb, 'practice', $5) RETURNING id`,
          [practiceId, exported, ids.length + 1, cipher.encrypt('posting_row.claim_reference', reference), randomBytes(32).toString('hex')],
        );
        const id = (rows[0] as { id: string }).id;
        ids.push(id);
        return id;
      };
      for (const reference of records.postingReferences ?? []) {
        await line(reference);
      }
      for (const [index, claimId] of claimIds.slice(0, records.postedClaims ?? 0).entries()) {
        const postingRowId = await line(pcns[index] ?? '');
        await owner.query("INSERT INTO ledger_match (practice_id, kind, claim_id, posting_row_id, remittance_id, level) VALUES ($1, 'posting', $2, $3, $4, 'claim')", [practiceId, claimId, postingRowId, remittance]);
      }
      return ids;
    },
    randomUUID(),
  );
  return { patientRefIds, claimIds, postingRowIds };
}
