import { withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule, until } from './journeys';

export { chainFrom, chainPricedMonths, newestDocument } from './journeys';

/**
 * The recovery journey's setup on the e2e database (synthetic data only): a practice of its own in the
 * other group (so no other spec's counts move), with its BAA, a deposit proof level and a single 30.00
 * line making a case; and, once its SYNTHETIC LED-06 original payment is loaded through the Uploads
 * screen, the case it opens: the payer's 50.00-per-unit 97110 schedule abstracted by the contract
 * specialist (under a support grant) and signed off by the billing manager through @tp/contracts, the
 * plan mapped, March priced and triaged by the worker's own jobs (e2e/journeys.ts). The browser does the
 * rest.
 */

export const LEDGER_PRACTICE = 'SYNTHETIC OTHER PRACTICE LEDGER';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000', proof_level: 'deposited' };

/** The journey's practice (created once per database): its ID. */
export function ledgerPractice(): Promise<string> {
  return journeyPractice({ name: LEDGER_PRACTICE, settings: SETTINGS });
}

/**
 * The case of the journey: the schedule signed off, the plan mapped, March priced and triaged by the
 * worker (which the caller keeps running). Returns the case's ID.
 */
export async function openLedgerCase(practiceId: string): Promise<string> {
  await signedOffSchedule({ practiceId, managerKey: 'ledger-manager', planKey: 'CE:SYNPLAN-FIX-LED' });
  await pricedAndTriaged({ practiceId, managerKey: 'ledger-manager', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
  let caseId = '';
  await until(async () => {
    caseId = await withDatabase(async (client) => (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.case_id ?? '');
    return caseId !== '';
  }, 'the triage job');
  return caseId;
}
