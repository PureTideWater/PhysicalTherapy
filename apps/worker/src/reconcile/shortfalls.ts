import { type Cents, ZERO_CENTS, parseCents } from '@tp/money';

import { EMPTY_LINE_LEDGER, type Scope, ledgerEntries, ledgerMatches, lineLedgers } from './ledger';
import { remittanceBaseline, unpaidApproval } from './remittances';

/**
 * Approval shortfalls (PRD 13, Matching step 1; docs/adr/0046): a case line whose payer response
 * accepted an amount that the remittance reprocessing it then paid only in part. The part paid is
 * confirmed (posted and deposited against the approval); the rest stays approved, never taken back as a
 * recoupment, and is shown on the Reconciliation screen for a person to adjust (an adjusted entry, with a
 * reason) or dispute (a further submission). An acceptance no remittance has reprocessed yet is no
 * shortfall: it is approved and waiting for its payment.
 */
export async function approvalShortfalls(scope: Scope, practiceId: string, serviceLineIds: readonly string[]): Promise<Map<string, Cents>> {
  const shortfalls = new Map<string, Cents>();
  if (serviceLineIds.length === 0) {
    return shortfalls;
  }
  const { rows } = await scope.client.query<{ service_line_id: string; claim_id: string; observed_allowed_cents: string }>(
    `SELECT cl.service_line_id, l.claim_id, l.observed_allowed_cents::text AS observed_allowed_cents
       FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id WHERE cl.practice_id = $1 AND cl.service_line_id = ANY ($2::uuid[])`,
    [practiceId, serviceLineIds],
  );
  const entries = await ledgerEntries(scope, practiceId);
  const matches = await ledgerMatches(scope, practiceId);
  const ledgers = lineLedgers(entries);
  for (const row of rows) {
    const ledger = ledgers.get(row.service_line_id) ?? EMPTY_LINE_LEDGER;
    const reprocessed = matches.some((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved' && match.serviceLineId === row.service_line_id);
    if (!reprocessed || ledger.approvedByResponsesCents <= ZERO_CENTS) {
      continue;
    }
    const line = { serviceLineId: row.service_line_id, claimId: row.claim_id, observedAllowedCents: parseCents(row.observed_allowed_cents) };
    const unpaid = unpaidApproval(line, ledger, await remittanceBaseline(scope, line, matches, entries));
    if (unpaid > ZERO_CENTS) {
      shortfalls.set(row.service_line_id, unpaid);
    }
  }
  return shortfalls;
}
