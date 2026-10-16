import { BILLING_ROLE } from '@tp/db/runtime';

/**
 * Billing's transactions (PRD 8: "Billing never reads PHI tables"; docs/adr/0050). Every billing
 * transaction runs as tp_billing (SET LOCAL ROLE): the application login (the webhook route) and the
 * operator login (the nightly jobs) may switch to it but do not inherit it, and it holds privileges on the
 * billing tables, the organization's name, kind, status and customer reference, and four functions
 * (counts, owners' addresses, audit events), and on no PHI table. The scope is empty, so even a policy
 * that read app.practice_ids would admit nothing.
 */

export interface BillingClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface BillingPool {
  connect(): Promise<BillingClient & { release(destroy?: boolean): void }>;
}

/** Runs `run` in one transaction as tp_billing with no practice in scope. */
export async function withBilling<T>(pool: BillingPool, run: (client: BillingClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
  } catch (error) {
    client.release(true);
    throw error;
  }
  let discard = false;
  try {
    await client.query(`SET LOCAL ROLE ${BILLING_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', '{}', true)");
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

/** Rows of a billing query, typed by the caller. */
export async function billingRows<R>(client: BillingClient, text: string, values?: unknown[]): Promise<R[]> {
  return (await client.query(text, values)).rows as R[];
}
