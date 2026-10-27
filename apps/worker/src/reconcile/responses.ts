import type { KeyProvider } from '@tp/db/runtime';
import { allocateByWeight } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents } from '@tp/money';

import { acceptedPayerResponses, recordPayerResponse } from '../packets/public';
import { EMPTY_LINE_LEDGER, type Scope, insertEntry, ledgerEntries, lineLedgers } from './ledger';

/**
 * The recovery ledger's side of the payer responses (PRD 13, Entries: "approved: a payer response
 * accepts an amount"; Matching step 1: "a match with the same or lower amount is recorded as a payer
 * response of kind 'reprocessed, no change'"; PRD 5, J10). The responses are the submissions' records
 * (milestone 8, docs/adr/0041), read and written only through their own functions in
 * @tp/worker/packets: acceptedPayerResponses and recordPayerResponse. Recording a response never
 * writes the ledger itself (LED-01); the reconcile step does, here.
 */

export interface AcceptedResponse {
  readonly responseId: string;
  readonly caseId: string;
  readonly amountCents: Cents;
  /** The lines the submitted version asked for, with their variance. */
  readonly lines: readonly { readonly serviceLineId: string; readonly varianceCents: Cents }[];
}

/** The practice's payer responses that accept an amount (accepted, partial), from the submissions' own function. */
export async function acceptedResponses(scope: Scope, practiceId: string): Promise<AcceptedResponse[]> {
  return (await acceptedPayerResponses(scope, { practiceId })).map((response) => ({
    responseId: response.responseId,
    caseId: response.caseId,
    amountCents: response.amountCents,
    lines: response.lines,
  }));
}

/**
 * Approvals from payer responses: a response that accepts an amount approves it for the lines its
 * submission asked for. The amount is the payer's payment, what the letter says it will pay (the form
 * asks for it so), never the allowed amount and never the patient's share: every ledger amount is the
 * payer's cash (docs/adr/0067), so a remittance paying the acceptance confirms it with no shortfall. It is
 * split by the lines' variance (allocated when it covers several), each line at most what it asked (its
 * variance: an acceptance that includes the packet's interest line approves no interest as principal, and
 * the database refuses an acceptance above what was asked), and only what no approval already stands for:
 * a line a reprocessed remittance already approved is not approved twice, and a later remittance paying it
 * is compared with what is approved, so it is not approved again either (it posts against the approval).
 */
export async function approveFromResponses(scope: Scope, practiceId: string, responses: readonly AcceptedResponse[]): Promise<number> {
  if (responses.length === 0) {
    return 0;
  }
  const ledgers = lineLedgers(await ledgerEntries(scope, practiceId));
  // What each line has approved, as this pass approves more (a later response of the same submission
  // approves only what the earlier ones did not).
  const approvedNow = new Map([...ledgers].map(([lineId, ledger]) => [lineId, ledger.approvedCents]));
  const { rows } = await scope.client.query<{ case_id: string; service_line_id: string }>('SELECT case_id, service_line_id FROM case_line WHERE practice_id = $1 AND written_off_reason IS NULL', [practiceId]);
  let written = 0;
  for (const response of responses) {
    const lines = response.lines.filter((line) => line.varianceCents > ZERO_CENTS && rows.some((row) => row.case_id === response.caseId && row.service_line_id === line.serviceLineId));
    if (lines.length === 0 || response.amountCents <= ZERO_CENTS) {
      continue;
    }
    const parts = allocateByWeight(response.amountCents, lines.map((line) => line.varianceCents));
    for (const [index, line] of lines.entries()) {
      const standing = approvedNow.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER.approvedCents;
      const part = parts[index] as Cents;
      const amount = cents((part < line.varianceCents ? part : line.varianceCents) - standing);
      if (amount <= ZERO_CENTS) {
        continue;
      }
      const id = await insertEntry(scope, practiceId, {
        caseId: response.caseId,
        serviceLineId: line.serviceLineId,
        stage: 'approved',
        amountCents: amount,
        evidenceKind: 'payer_response',
        evidenceId: response.responseId,
        matchId: null,
        allocated: lines.length > 1,
        createdBy: null,
      });
      if (id !== null) {
        approvedNow.set(line.serviceLineId, cents(standing + amount));
        written += 1;
      }
    }
  }
  return written;
}

export interface ReprocessedNoChange {
  readonly practiceId: string;
  readonly caseId: string;
  /** The remittance whose claim reprocessed the line with no change. */
  readonly remittanceId: string;
  /** The remittance's payment date (BPR16): when the payer answered. */
  readonly receivedOn: string;
  readonly requestId: string;
}

/**
 * What became of a reprocessing with no change: recorded as the case's payer response; or not, because
 * the case has no submission for it to answer, or because the remittance is not an answer to its latest
 * one (paid before that submission, before the submission's last response, or dated after today).
 */
export type NoChangeOutcome = 'recorded' | 'no_submission' | 'not_an_answer';

/**
 * Records a payer response "reprocessed, no change" for the case's latest submission through the
 * submissions' own function (recordPayerResponse, ADR 0041), with the remittance as its evidence: in no
 * one's name from the reconcile job, in the person's own from their manual match. The database's rules
 * for a response are checked first, so a remittance that is no answer leaves the reconcile's
 * transaction whole.
 */
export async function recordReprocessedNoChange(scope: Scope, keys: KeyProvider, response: ReprocessedNoChange): Promise<NoChangeOutcome> {
  const { rows } = await scope.client.query<{ id: string; submitted_on: string; last_received_on: string | null; today: string }>(
    `SELECT s.id, s.submitted_on::text AS submitted_on, (SELECT max(r.received_on)::text FROM payer_response r WHERE r.submission_id = s.id) AS last_received_on,
            ((now() AT TIME ZONE 'UTC')::date)::text AS today
       FROM submission s WHERE s.id = case_latest_submission($1) AND s.practice_id = $2`,
    [response.caseId, response.practiceId],
  );
  const latest = rows[0];
  if (latest === undefined) {
    return 'no_submission';
  }
  if (response.receivedOn < latest.submitted_on || response.receivedOn > latest.today || (latest.last_received_on !== null && response.receivedOn < latest.last_received_on)) {
    return 'not_an_answer';
  }
  await recordPayerResponse(scope, keys, {
    practiceId: response.practiceId,
    submissionId: latest.id,
    kind: 'reprocessed_no_change',
    amountCents: null,
    documentId: null,
    remittanceId: response.remittanceId,
    receivedOn: response.receivedOn,
    requestId: response.requestId,
  });
  return 'recorded';
}
