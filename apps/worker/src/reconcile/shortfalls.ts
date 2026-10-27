import { unpaidPayment } from '@tp/ledger';
import { type Cents, ZERO_CENTS } from '@tp/money';

import { EMPTY_LINE_LEDGER, type Scope, approvedRemaining, ledgerEntries, lineLedgers } from './ledger';
import { chainContext, lineChain, paidLine } from './remittances';

/**
 * Approval shortfalls (PRD 13, Matching step 1; docs/adr/0046, 0067): a case line whose payer response
 * accepted an amount that the remittance reprocessing it then paid only in part. The part paid is
 * confirmed (posted and deposited against the approval); the rest stays approved, never taken back as a
 * recoupment, and is shown on the Reconciliation screen for a person to adjust (an adjusted entry, with a
 * reason) or dispute (a further submission). An acceptance no remittance has reprocessed yet is no
 * shortfall: it is approved and waiting for its payment. Both are in payment terms (@tp/ledger
 * unpaidPayment): what is approved and not taken back, less what the remittances paid the line above the
 * original. An acceptance typed as the allowed amount on a line with a patient's share leaves that share
 * as a shortfall, which the Reconciliation screen names beside it (patient-share.ts).
 */
export async function approvalShortfalls(scope: Scope, practiceId: string, serviceLineIds: readonly string[]): Promise<Map<string, Cents>> {
  const shortfalls = new Map<string, Cents>();
  if (serviceLineIds.length === 0) {
    return shortfalls;
  }
  const { rows } = await scope.client.query<{ service_line_id: string; claim_id: string }>(
    `SELECT cl.service_line_id, l.claim_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1 AND cl.service_line_id = ANY ($2::uuid[])`,
    [practiceId, serviceLineIds],
  );
  const entries = await ledgerEntries(scope, practiceId);
  const ledgers = lineLedgers(entries);
  const context = await chainContext(scope, practiceId, rows.map((row) => row.claim_id), entries);
  for (const row of rows) {
    const ledger = ledgers.get(row.service_line_id) ?? EMPTY_LINE_LEDGER;
    const reprocessed = context.matches.some((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved' && match.serviceLineId === row.service_line_id);
    const chain = lineChain(context, { serviceLineId: row.service_line_id, claimId: row.claim_id });
    if (!reprocessed || chain === undefined || ledger.approvedByResponsesCents <= ZERO_CENTS) {
      continue;
    }
    const unpaid = unpaidPayment({ original: paidLine(chain.original), baselines: chain.chain.current, approvedRemainingCents: approvedRemaining(ledger) });
    if (unpaid > ZERO_CENTS) {
      shortfalls.set(row.service_line_id, unpaid);
    }
  }
  return shortfalls;
}
