import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, type KeyProvider, type PracticeCipher, loadPracticeCipher, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import type { DocumentStore } from '@tp/worker/documents';
import { type Scope, generateRoiStatement, matchPostingByHand } from '@tp/worker/ledger';
import { printRoiStatement } from '@tp/worker/runtime';

/**
 * Test support: a route-test world's recovery ledger (docs/adr/0042, 0043), for the Reconciliation and
 * ROI statement routes. Synthetic data only. An adjusted remittance (SYNEFTROUTE0002, 12.00) whose
 * corrected claim pays the case line's 97110 of 2026-03-16 at an allowed of 32.00, attached to no case
 * line yet; a posting export with one row posting the whole of the world's first remittance
 * (SYNEFTROUTE0001, 88.00), unmatched, and one posting the adjusted remittance, matched by the billing
 * manager (a match a person may reverse); a bank export with one row depositing the first remittance,
 * unmatched; and an ROI statement of 2026 the billing manager generated, printed by the statement job's
 * code with a stand-in printer.
 */

export interface LedgerWorldOptions {
  readonly owner: DatabaseClient;
  readonly app: DatabasePool;
  readonly keys: KeyProvider;
  readonly documents: DocumentStore;
  readonly practiceId: string;
  readonly cipher: PracticeCipher;
  readonly uploaderId: string;
  readonly managerId: string;
  readonly payerId: string;
  readonly planId: string;
  /** The world's loaded remittance (SYNEFTROUTE0001, 88.00). */
  readonly remittanceId: string;
  /** The case line's service line (97110, 2026-03-16). */
  readonly caseServiceLineId: string;
}

export interface SeededLedger {
  readonly postingRowId: string;
  readonly eftRowId: string;
  readonly adjustedClaimId: string;
  readonly caseServiceLineId: string;
  readonly reversibleMatchId: string;
  readonly roiStatementId: string;
}

const hex = () => randomBytes(32).toString('hex');
const standInPdf = () => new TextEncoder().encode(`%PDF-1.7\n% SYNTHETIC stand-in for the route tests ${randomUUID()}\n`);

export async function seedLedger(options: LedgerWorldOptions): Promise<SeededLedger> {
  const { owner, practiceId, cipher } = options;
  const seeded = await asOwner(
    owner,
    [practiceId],
    async () => {
      const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
      const document = (kind: string, contentType: string) =>
        one(
          `INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status)
           VALUES ($1, $2, 600, $3, $4, $5, 'clean', now(), 'loaded') RETURNING id`,
          [practiceId, kind, contentType, options.uploaderId, hex()],
        );
      const remittanceDocument = await document('x12_835', 'application/octet-stream');
      // The corrected claim is the same patient's as the world's loaded claim.
      const patientRefId = (await owner.query<{ patient_ref_id: string }>('SELECT patient_ref_id FROM claim WHERE remittance_id = $1 ORDER BY claim_no LIMIT 1', [options.remittanceId])).rows[0]?.patient_ref_id ?? null;
      const adjustedRemittanceId = await one(
        `INSERT INTO remittance (practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method, bpr16_date,
           payer_name, payer_id, payee_npi, payee_id_qualifier, claim_count, plb_total_cents)
         VALUES ($1, $2, 'SYNTHSENDER', 'SYNTHRECEIVER', '000000002', '2', '0001', 'SYNEFTROUTE0002', '1SYN00000R', 1200, 'C', 'ACH', '2026-06-08', 'SYNTHETIC PAYER ROUTE', $3, '9900000001', 'XX', 1, 0)
         RETURNING id`,
        [practiceId, remittanceDocument, options.payerId],
      );
      const adjustedClaimId = await one(
        `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
           charge_cents, paid_cents, patient_resp_cents, filing_indicator, frequency_code, patient_ref_id, service_from, service_to)
         VALUES ($1, $2, 1, $3, $4, $5, '1', 8000, 1200, 0, '12', '7', $6, '2026-03-16', '2026-03-16') RETURNING id`,
        [
          practiceId,
          adjustedRemittanceId,
          cipher.encrypt('claim.patient_control_number', 'SYNPCNROUTE0001'),
          cipher.encrypt('claim.payer_claim_control_number', 'SYNCCNROUTE0002'),
          cipher.lookupHash('claim.payer_claim_control_number', 'SYNCCNROUTE0002'),
          patientRefId,
        ],
      );
      await owner.query(
        `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date,
           observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
         VALUES ($1, $2, 1, 'HC', '97110', '{GP}', 8000, 1200, 1, '2026-03-16', 3200, 'paid_plus_pr', 2000, $3)`,
        [practiceId, adjustedClaimId, options.planId],
      );
      const postings = await document('posting_export', 'text/csv');
      const postingRow = (rowNo: number, check: string, cents: number) =>
        one(
          `INSERT INTO posting_row (practice_id, source_document_id, row_no, check_or_trace, posted_on, amount_cents, raw, template, fingerprint)
           VALUES ($1, $2, $3, $4, '2026-06-10', $5, '{}', 'synthetic_pm_export_v1', $6) RETURNING id`,
          [practiceId, postings, rowNo, check, cents, hex()],
        );
      const postingRowId = await postingRow(1, 'SYNEFTROUTE0001', 8800);
      const reversiblePostingRowId = await postingRow(2, 'SYNEFTROUTE0002', 1200);
      const deposits = await document('eft_export', 'text/csv');
      const eftRowId = await one(
        `INSERT INTO eft_row (practice_id, source_document_id, row_no, trace, deposited_on, amount_cents, fingerprint) VALUES ($1, $2, 1, 'SYNEFTROUTE0001', '2026-04-09', 8800, $3) RETURNING id`,
        [practiceId, deposits, hex()],
      );
      return { adjustedRemittanceId, adjustedClaimId, postingRowId, reversiblePostingRowId, eftRowId };
    },
    options.uploaderId,
  );
  const asManager = <T>(run: (scope: Scope) => Promise<T>) => withPracticeScope(options.app, { actorId: options.managerId, practiceIds: [practiceId] }, (scope) => run(scope as Scope));
  const { matchId } = await asManager(async (scope) =>
    matchPostingByHand(
      { scope, cipher: await loadPracticeCipher(scope, options.keys, practiceId), keys: options.keys, requestId: `test-${randomUUID()}` },
      { practiceId, postingRowId: seeded.reversiblePostingRowId, remittanceId: seeded.adjustedRemittanceId },
    ),
  );
  const statement = await asManager((scope) => generateRoiStatement(scope, { practiceId, periodFrom: '2026-01-01', periodTo: '2026-12-31', requestId: `test-${randomUUID()}` }));
  if (statement === null) {
    throw new Error('the seeded statement was not written');
  }
  const jobId = randomUUID();
  const printed = await printRoiStatement(
    { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(options.app, { jobId, practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false },
    { documents: options.documents, keys: options.keys, pdf: { render: () => Promise.resolve(standInPdf()) } },
    practiceId,
    statement.statementId,
  );
  if (printed.outcome !== 'printed') {
    throw new Error('the seeded statement was not printed');
  }
  return {
    postingRowId: seeded.postingRowId,
    eftRowId: seeded.eftRowId,
    adjustedClaimId: seeded.adjustedClaimId,
    caseServiceLineId: options.caseServiceLineId,
    reversibleMatchId: matchId,
    roiStatementId: statement.statementId,
  };
}
