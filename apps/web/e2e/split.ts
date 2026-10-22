import { appDevLoginUrl, databaseClient } from '@tp/db';

import { personaEmail } from '../scripts/synthetic-personas';

/**
 * The place-of-service split every e2e run starts with (PR 6b; docs/adr/0064): since the split is every practice's
 * default for a place it has not set, and pinned on each pricing run, prepare.ts approves it before any spec runs, so
 * which places a run fills never depends on the order the specs run in (fullyParallel, one database). Its settings are
 * exactly the ones the screening journey's contract specialist approves (facility 21, 22 and 23; non-facility 11 and
 * 12), so that approval changes nothing for another spec. SYNTHETIC.
 */
export const PREPARED_SPLIT: Readonly<Record<string, 'facility' | 'non_facility'>> = {
  '11': 'non_facility',
  '12': 'non_facility',
  '21': 'facility',
  '22': 'facility',
  '23': 'facility',
};

/** The contract specialist approves the split through the console's own function, as the application's login does. */
export async function approvePreparedSplit(databaseUrl: string): Promise<void> {
  const client = databaseClient(appDevLoginUrl(databaseUrl));
  await client.connect();
  try {
    await client.query('BEGIN');
    const specialist = (await client.query<{ user_id: string }>('SELECT user_id FROM sign_in_account($1, NULL)', [personaEmail('contract-specialist')])).rows[0]?.user_id;
    if (specialist === undefined) {
      throw new Error('the seeded contract specialist is missing');
    }
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [specialist]);
    await client.query('SELECT console_approve_place_of_service_split($1::jsonb)', [JSON.stringify(PREPARED_SPLIT)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
