import { allocateByWeight } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents } from '@tp/money';

import { EMPTY_LINE_LEDGER, type Scope, insertEntry, ledgerEntries, lineLedgers } from './ledger';

/**
 * Approvals from payer responses (PRD 13, Entries: "approved: a payer response accepts an amount"; PRD
 * 5, J10). A response that accepts an amount (accepted or partial) approves it for the lines its
 * submission asked for, split by their variance (allocated when it covers several), and only what no
 * approval already stands for: a line a reprocessed remittance already approved is not approved twice,
 * and a later remittance paying it is compared with what is approved, so it is not approved again either
 * (it posts against the approval). The responses are the submissions' records (milestone 8), read through
 * their function; recording one never writes the ledger itself (LED-01).
 */

export interface AcceptedResponse {
  readonly responseId: string;
  readonly caseId: string;
  readonly amountCents: Cents;
  /** The lines the submitted version asked for, with their variance. */
  readonly lines: readonly { readonly serviceLineId: string; readonly varianceCents: Cents }[];
}

/** The practice's payer responses that accept an amount (the submissions' function). */
export type AcceptedResponses = (scope: Scope, practiceId: string) => Promise<readonly AcceptedResponse[]>;

/** Until submissions are recorded, no response accepts anything. */
export const NO_RESPONSES: AcceptedResponses = () => Promise.resolve([]);

export async function approveFromResponses(scope: Scope, practiceId: string, responses: readonly AcceptedResponse[]): Promise<number> {
  if (responses.length === 0) {
    return 0;
  }
  const ledgers = lineLedgers(await ledgerEntries(scope, practiceId));
  const { rows } = await scope.client.query<{ case_id: string; service_line_id: string }>('SELECT case_id, service_line_id FROM case_line WHERE practice_id = $1 AND written_off_reason IS NULL', [practiceId]);
  let written = 0;
  for (const response of responses) {
    const lines = response.lines.filter((line) => line.varianceCents > ZERO_CENTS && rows.some((row) => row.case_id === response.caseId && row.service_line_id === line.serviceLineId));
    if (lines.length === 0 || response.amountCents <= ZERO_CENTS) {
      continue;
    }
    const parts = allocateByWeight(response.amountCents, lines.map((line) => line.varianceCents));
    for (const [index, line] of lines.entries()) {
      const standing = (ledgers.get(line.serviceLineId) ?? EMPTY_LINE_LEDGER).approvedCents;
      const amount = cents((parts[index] as Cents) - standing);
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
      written += id === null ? 0 : 1;
    }
  }
  return written;
}
