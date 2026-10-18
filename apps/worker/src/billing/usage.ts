import { type BillingPool, billingRows, withBilling } from './scope';

/**
 * The nightly usage snapshot (Data dictionary, usage_snapshot: organization_id, date, granted_practices,
 * active_practices; PRD 5, J18: "Firms are invoiced per granted practice, counted nightly from grants in
 * force"; docs/adr/0050): one row per group and firm per day, counted by billing_usage_counts() (counts
 * only; billing reads no practice and no grant itself). It is the seam firm per-practice invoicing reads in
 * milestone 12; nothing invoices from it yet. A day's snapshot is taken once: a rerun records nothing.
 */

export interface UsageSnapshotResult {
  readonly organizations: number;
  readonly recorded: number;
}

export async function recordUsageSnapshots(options: { readonly pool: BillingPool; readonly day: string; readonly requestId: string }): Promise<UsageSnapshotResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.day)) {
    throw new Error('a usage snapshot is taken for a calendar day, YYYY-MM-DD');
  }
  return withBilling(options.pool, async (client) => {
    const counted = await billingRows<{ organization_id: string }>(client, 'SELECT organization_id FROM billing_usage_counts()');
    const inserted = await billingRows<{ id: string }>(
      client,
      `INSERT INTO usage_snapshot (organization_id, date, granted_practices, active_practices)
       SELECT organization_id, $1::date, granted_practices, active_practices FROM billing_usage_counts()
       ON CONFLICT (organization_id, date) DO NOTHING
       RETURNING id`,
      [options.day],
    );
    if (inserted.length > 0) {
      await client.query("SELECT billing_record_audit('billing_usage_snapshot', 'usage_snapshot', NULL, 'nightly', $1)", [options.requestId]);
    }
    return { organizations: counted.length, recorded: inserted.length };
  });
}
