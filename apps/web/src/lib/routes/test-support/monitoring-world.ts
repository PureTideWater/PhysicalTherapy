import type { DatabaseClient } from '@tp/db';
import { asOwner } from '@tp/db/testing';

/**
 * Test support: a route-test world's monitoring records (docs/adr/0039), for the notifications, digest
 * and monthly summary routes: a sent digest of March 2026 (counts and totals only), and the practice
 * administrator's two notifications, one for the world's pricing run and one for the digest. Synthetic
 * data only.
 */

export interface MonitoringWorldOptions {
  readonly owner: DatabaseClient;
  readonly practiceId: string;
  readonly adminUserId: string;
  readonly pricingRunId: string;
  readonly payerId: string;
}

export async function seedMonitoring(options: MonitoringWorldOptions): Promise<{ readonly digestId: string }> {
  const { owner, practiceId } = options;
  return asOwner(owner, [practiceId], async () => {
    const counts = {
      validated_lines: 1,
      validated_payers: 1,
      validated_lines_by_payer: { [options.payerId]: 1 },
      cases_nearing_deadline: 0,
      recoveries_posted: 0,
      coverage_lines: 2,
      coverage_priced_lines: 2,
      contracts_expiring: 0,
    };
    const totals = {
      validated_variance: '1200',
      validated_variance_by_payer: { [options.payerId]: '1200' },
      cases_nearing_deadline_actionable: '0',
      recovered: '0',
      coverage_billed: '24000',
      coverage_priced_billed: '24000',
    };
    const { rows } = await owner.query<{ id: string }>("INSERT INTO digest (practice_id, period, counts, totals_cents) VALUES ($1, '2026-03', $2, $3) RETURNING id", [
      practiceId,
      JSON.stringify(counts),
      JSON.stringify(totals),
    ]);
    const digestId = (rows[0] as { id: string }).id;
    await owner.query('UPDATE digest SET sent_at = now() WHERE id = $1', [digestId]);
    await owner.query(
      `INSERT INTO notification (practice_id, user_id, kind, subject_id, counts, totals_cents) VALUES
         ($1, $2, 'monitoring_run', $3, '{"lines": 2, "priced_lines": 2, "unpriced_lines": 0, "validated_lines": 1, "flagged_lines": 1, "cases": 1}', '{"billed": "24000", "priced_billed": "24000", "validated_variance": "1200"}'),
         ($1, $2, 'digest', $4, $5, $6)`,
      [practiceId, options.adminUserId, options.pricingRunId, digestId, JSON.stringify(counts), JSON.stringify(totals)],
    );
    return { digestId };
  });
}
