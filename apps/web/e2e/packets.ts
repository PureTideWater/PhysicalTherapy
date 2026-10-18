import { withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule, until } from './journeys';

/**
 * The packet journey's setup on the e2e database (synthetic data only): a practice of its own in the
 * other group (so no other spec's counts move), with its BAA and a case materiality of 10.00; and, once
 * its SYNTHETIC CAS-08 remittance is loaded through the Uploads screen, the case it opens: the payer's
 * 50.00-per-unit 97110 schedule abstracted by the contract specialist (under a support grant) and signed
 * off by a billing manager through @tp/contracts, the plan mapped, March priced and triaged by the
 * worker's own jobs (the three lines allowed 70.00 against 100.00 each; e2e/journeys.ts). The browser
 * does the rest.
 */

export const PACKET_PRACTICE = 'SYNTHETIC OTHER PRACTICE PACKETS';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };

/** The journey's practice (created once per database): its ID. */
export function packetPractice(): Promise<string> {
  return journeyPractice({ name: PACKET_PRACTICE, settings: SETTINGS });
}

/**
 * The case of the journey: the schedule signed off, the plan mapped, March priced and triaged by the
 * worker (which the caller keeps running). Returns the case's ID.
 */
export async function openPacketCase(practiceId: string): Promise<string> {
  await signedOffSchedule({ practiceId, managerKey: 'packet-approver', planKey: 'CE:SYNPLAN-FIX-ONE' });
  await pricedAndTriaged({ practiceId, managerKey: 'packet-approver', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
  let caseId = '';
  await until(async () => {
    caseId = await withDatabase(async (client) => (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.case_id ?? '');
    return caseId !== '';
  }, 'the triage job');
  return caseId;
}
