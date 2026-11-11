import type { ScopeClient, ScopePool } from '@tp/db/runtime';

import { type OpenSessionRequest, type OpenedSession, openSession } from '../../auth/sessions';

/**
 * A session a test opens directly, without the sign-in flow. The attempt's start is read from the database's clock
 * first, as the flow reads it before its first provider call (sign_in_step_began(); docs/adr/0093, D3), so the row
 * carries a start and the database checks it like any other. Tests only: production code never stamps a start for a
 * caller, since a start read after the proof would let a step begun before a password reset through.
 */
export async function openSessionNow(pool: ScopePool<ScopeClient>, request: Omit<OpenSessionRequest, 'began'>): Promise<OpenedSession> {
  const client = await pool.connect();
  let began: Date | undefined;
  try {
    began = (await client.query<{ began: Date }>('SELECT sign_in_step_began() AS began')).rows[0]?.began;
  } finally {
    client.release();
  }
  if (began === undefined) {
    throw new Error('the database gave no start for the test session');
  }
  return openSession(pool, { ...request, began: new Date(began).getTime() });
}
