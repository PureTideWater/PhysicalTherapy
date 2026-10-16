import { type Cents, parseCents } from '@tp/money';

import type { Scope } from './ledger';

/**
 * What matches nothing, with the evidence side by side (PRD 13, Matching step 4: "adjusted payments,
 * postings and deposits that match nothing are listed for manual matching with the evidence side by
 * side ... Nothing unmatched counts"; PRD 5, J10; test matrix LED-03, LED-07). A take-back row of a
 * corrected posting export is listed with the standing match it offsets, for a person to reverse
 * (PRD 13, Entries: "reversed ... or a posting export is corrected"). Each item carries its own
 * evidence and the candidates a person may match it to, by opaque ID with amounts, dates, codes and
 * trace numbers; no patient identifier is read (a claim reference stays encrypted in its row).
 */

export interface RemittanceCandidate {
  readonly remittanceId: string;
  readonly trace: string;
  readonly paymentDate: string;
  readonly paymentCents: Cents;
  readonly payerName: string;
}

export interface UnmatchedPosting {
  readonly postingRowId: string;
  readonly documentId: string;
  readonly rowNo: number;
  readonly checkOrTrace: string;
  readonly postedOn: string;
  readonly amountCents: Cents;
  readonly payerName: string | null;
  readonly batch: string | null;
  /** The export has lines (the row carries a claim reference). */
  readonly lineLevel: boolean;
  /** A person reversed an earlier match of it. */
  readonly reversed: boolean;
  /**
   * A take-back row (a negative amount) that exactly offsets a row of the same check or trace number,
   * code and date of service whose posting match stands: a corrected posting export (PRD 13, Entries:
   * reversed). A person reverses that match, with a reason; nothing reverses it by itself.
   */
  readonly correctionOf: { readonly matchId: string; readonly postingRowId: string } | null;
  /** Remittances of its check or trace number, or of its amount. */
  readonly candidates: readonly RemittanceCandidate[];
}

export interface UnmatchedDeposit {
  readonly eftRowId: string;
  readonly documentId: string;
  readonly rowNo: number;
  readonly trace: string;
  readonly depositedOn: string;
  readonly amountCents: Cents;
  readonly batchReference: string | null;
  readonly reversed: boolean;
  readonly candidates: readonly RemittanceCandidate[];
}

export interface CaseLineCandidate {
  readonly caseId: string;
  readonly serviceLineId: string;
  readonly procedureCode: string;
  readonly serviceDate: string | null;
  readonly observedAllowedCents: Cents;
}

export interface UnmatchedAdjustedPayment {
  readonly claimId: string;
  readonly remittanceId: string;
  readonly trace: string;
  readonly paymentDate: string;
  readonly payerName: string;
  readonly paidCents: Cents;
  readonly lines: readonly { readonly procedureCode: string; readonly serviceDate: string | null; readonly observedAllowedCents: Cents }[];
  /** Open case lines of the same code and service date. */
  readonly candidates: readonly CaseLineCandidate[];
}

export interface UnmatchedItems {
  readonly postings: readonly UnmatchedPosting[];
  readonly deposits: readonly UnmatchedDeposit[];
  readonly adjustedPayments: readonly UnmatchedAdjustedPayment[];
}

const CANDIDATE_LIMIT = 10;

interface CandidateRow {
  readonly id: string;
  readonly trn02: string;
  readonly payment_date: string;
  readonly payment_cents: string;
  readonly payer_name: string;
}

async function remittanceCandidates(scope: Scope, practiceId: string, trace: string, amount: string): Promise<RemittanceCandidate[]> {
  const { rows } = await scope.client.query<CandidateRow>(
    `SELECT r.id, r.trn02, r.bpr16_date::text AS payment_date, r.bpr02_cents::text AS payment_cents, r.payer_name FROM remittance r
      WHERE r.practice_id = $1 AND r.status = 'loaded' AND (r.trn02 = $2 OR r.bpr02_cents = $3::bigint)
      ORDER BY (r.trn02 = $2) DESC, r.bpr16_date DESC, r.id LIMIT ${String(CANDIDATE_LIMIT)}`,
    [practiceId, trace, amount],
  );
  return rows.map((row) => ({ remittanceId: row.id, trace: row.trn02, paymentDate: row.payment_date, paymentCents: parseCents(row.payment_cents), payerName: row.payer_name }));
}

export async function unmatchedItems(scope: Scope, practiceId: string): Promise<UnmatchedItems> {
  const postingRows = await scope.client.query<{
    id: string;
    source_document_id: string;
    row_no: number;
    check_or_trace: string;
    posted_on: string;
    amount_cents: string;
    payer_name: string | null;
    batch: string | null;
    line_level: boolean;
    reversed: boolean;
    corrected_match_id: string | null;
    corrected_row_id: string | null;
  }>(
    `SELECT p.id, p.source_document_id, p.row_no, p.check_or_trace, p.posted_on::text AS posted_on, p.amount_cents::text AS amount_cents, p.payer_name, p.batch,
            p.claim_reference IS NOT NULL AS line_level, EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id) AS reversed,
            corrected.match_id AS corrected_match_id, corrected.row_id AS corrected_row_id
       FROM posting_row p
       LEFT JOIN LATERAL (
         SELECT m.id AS match_id, o.id AS row_id FROM posting_row o JOIN ledger_match m ON m.posting_row_id = o.id AND m.kind = 'posting' AND m.reversed_at IS NULL
          WHERE p.amount_cents < 0 AND o.practice_id = p.practice_id AND o.check_or_trace = p.check_or_trace AND o.amount_cents = -p.amount_cents
            AND o.procedure_code IS NOT DISTINCT FROM p.procedure_code AND o.service_date IS NOT DISTINCT FROM p.service_date
          ORDER BY o.posted_on, o.created_at, o.row_no LIMIT 1
       ) corrected ON true
      WHERE p.practice_id = $1 AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id AND m.reversed_at IS NULL)
      ORDER BY p.posted_on, p.created_at, p.row_no`,
    [practiceId],
  );
  const postings: UnmatchedPosting[] = [];
  for (const row of postingRows.rows) {
    postings.push({
      postingRowId: row.id,
      documentId: row.source_document_id,
      rowNo: row.row_no,
      checkOrTrace: row.check_or_trace,
      postedOn: row.posted_on,
      amountCents: parseCents(row.amount_cents),
      payerName: row.payer_name,
      batch: row.batch,
      lineLevel: row.line_level,
      reversed: row.reversed,
      correctionOf: row.corrected_match_id === null || row.corrected_row_id === null ? null : { matchId: row.corrected_match_id, postingRowId: row.corrected_row_id },
      candidates: await remittanceCandidates(scope, practiceId, row.check_or_trace, row.amount_cents),
    });
  }
  const eftRows = await scope.client.query<{
    id: string;
    source_document_id: string;
    row_no: number;
    trace: string;
    deposited_on: string;
    amount_cents: string;
    batch_reference: string | null;
    reversed: boolean;
  }>(
    `SELECT e.id, e.source_document_id, e.row_no, e.trace, e.deposited_on::text AS deposited_on, e.amount_cents::text AS amount_cents, e.batch_reference,
            EXISTS (SELECT 1 FROM ledger_match m WHERE m.eft_row_id = e.id) AS reversed
       FROM eft_row e
      WHERE e.practice_id = $1 AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.eft_row_id = e.id AND m.reversed_at IS NULL)
      ORDER BY e.deposited_on, e.created_at, e.row_no`,
    [practiceId],
  );
  const deposits: UnmatchedDeposit[] = [];
  for (const row of eftRows.rows) {
    deposits.push({
      eftRowId: row.id,
      documentId: row.source_document_id,
      rowNo: row.row_no,
      trace: row.trace,
      depositedOn: row.deposited_on,
      amountCents: parseCents(row.amount_cents),
      batchReference: row.batch_reference,
      reversed: row.reversed,
      candidates: await remittanceCandidates(scope, practiceId, row.trace, row.amount_cents),
    });
  }
  // Adjusted payments: corrected or replacement claims (frequency 7, or superseding a claim the practice
  // holds) that no standing match attaches to a case line and that are no case line's own claim.
  const claims = await scope.client.query<{ id: string; remittance_id: string; trn02: string; payment_date: string; payer_name: string; paid_cents: string }>(
    `SELECT c.id, c.remittance_id, r.trn02, r.bpr16_date::text AS payment_date, r.payer_name, c.paid_cents::text AS paid_cents
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = $1 AND r.status = 'loaded' AND c.claim_status_code <> '22'
        AND (c.frequency_code = '7' OR EXISTS (SELECT 1 FROM claim o WHERE o.superseded_by_claim_id = c.id))
        AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.reversed_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id WHERE xl.claim_id = c.id)
      ORDER BY r.bpr16_date, c.created_at, c.id`,
    [practiceId],
  );
  const adjustedPayments: UnmatchedAdjustedPayment[] = [];
  for (const claim of claims.rows) {
    const lines = await scope.client.query<{ procedure_code: string; service_date: string | null; observed_allowed_cents: string }>(
      'SELECT s.procedure_code, s.service_date::text AS service_date, s.observed_allowed_cents::text AS observed_allowed_cents FROM service_line s WHERE s.claim_id = $1 ORDER BY s.line_no',
      [claim.id],
    );
    const candidates = await scope.client.query<{ case_id: string; service_line_id: string; procedure_code: string; service_date: string | null; observed_allowed_cents: string }>(
      `SELECT cl.case_id, cl.service_line_id, l.procedure_code, l.service_date::text AS service_date, l.observed_allowed_cents::text AS observed_allowed_cents
         FROM case_line cl JOIN "case" k ON k.id = cl.case_id JOIN service_line l ON l.id = cl.service_line_id
        WHERE cl.practice_id = $1 AND cl.written_off_reason IS NULL AND k.state <> 'closed_written_off'
          AND EXISTS (SELECT 1 FROM service_line s WHERE s.claim_id = $2 AND s.procedure_code = l.procedure_code AND s.service_date IS NOT DISTINCT FROM l.service_date)
        ORDER BY l.service_date, cl.service_line_id LIMIT ${String(CANDIDATE_LIMIT)}`,
      [practiceId, claim.id],
    );
    adjustedPayments.push({
      claimId: claim.id,
      remittanceId: claim.remittance_id,
      trace: claim.trn02,
      paymentDate: claim.payment_date,
      payerName: claim.payer_name,
      paidCents: parseCents(claim.paid_cents),
      lines: lines.rows.map((line) => ({ procedureCode: line.procedure_code, serviceDate: line.service_date, observedAllowedCents: parseCents(line.observed_allowed_cents) })),
      candidates: candidates.rows.map((row) => ({
        caseId: row.case_id,
        serviceLineId: row.service_line_id,
        procedureCode: row.procedure_code,
        serviceDate: row.service_date,
        observedAllowedCents: parseCents(row.observed_allowed_cents),
      })),
    });
  }
  return { postings, deposits, adjustedPayments };
}
