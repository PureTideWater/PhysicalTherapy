import { roiStatement } from '@tp/ledger';
import { parseCents } from '@tp/money';

import { ACTIONABLE_NOW } from '../../triage/actionable-now';
import { type Scope, ledgerEntries, practiceLedgerSettings } from '../ledger';
import { type GeneratedStatement, NO_BILLING, NO_TIME_LOG, type StatementSources } from '../statements';

/**
 * For the tests (schema PR 5; the design note's T10 and T11): the statement writer as it was before the statement
 * listed the lines its actionable figure counted, kept word for word but for the permission check and the audit event
 * (the tests run it as the job): four keys in `links`, the open cases read by the query of that day. The write-equality
 * test stores a statement with it and with today's writer on the same state and compares the two rows; the deploy test
 * runs it against the migrated database as the previous image would.
 */
export const FOUR_KEY_OPEN_CASES = `SELECT c.id, ${ACTIONABLE_NOW('c')}::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = $1 AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id`;

export async function generateFourKeyStatement(
  scope: Scope,
  input: {
    readonly practiceId: string;
    readonly periodFrom: string;
    readonly periodTo: string;
  },
  sources: StatementSources = { fees: NO_BILLING, pursuitHours: NO_TIME_LOG },
): Promise<GeneratedStatement | null> {
  const { practiceId, periodFrom, periodTo } = input;
  const { proofLevel } = await practiceLedgerSettings(scope, practiceId);
  const { rows: open } = await scope.client.query<{
    id: string;
    actionable_cents: string;
  }>(FOUR_KEY_OPEN_CASES, [practiceId]);
  const statement = roiStatement({
    periodFrom,
    periodTo,
    proofLevel,
    entries: await ledgerEntries(scope, practiceId),
    feesCents: await sources.fees.feesPaid(scope, practiceId, periodFrom, periodTo),
    pursuitHours: await sources.pursuitHours.hoursLogged(scope, practiceId, periodFrom, periodTo),
    openCases: open.map((row) => ({
      caseId: row.id,
      actionableCents: parseCents(row.actionable_cents),
    })),
  });
  const links = {
    recovered: statement.links.recovered,
    interest: statement.links.interest,
    approved_unposted: statement.links.approvedUnposted,
    actionable_open: statement.links.actionableOpen,
  };
  const { rows } = await scope.client.query<{ id: string }>(
    `INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING
     RETURNING id`,
    [
      practiceId,
      periodFrom,
      periodTo,
      proofLevel,
      statement.feesCents.toString(),
      statement.recoveredCents.toString(),
      statement.interestCents.toString(),
      statement.approvedUnpostedCents.toString(),
      statement.actionableOpenCents.toString(),
      statement.pursuitHours,
      JSON.stringify(links),
      null,
    ],
  );
  const statementId = rows[0]?.id;
  return statementId === undefined ? null : { statementId, statement };
}
