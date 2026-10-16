import { type Cents, parseCents } from '@tp/money';

import type { FeeSource } from '../reconcile/statements';

/**
 * The ROI statement's fees (PRD 13, ROI statement: "fees paid to the product in the period"; the milestone 9
 * seam, docs/adr/0043 and 0050): what the practice's group paid in the period by its paid invoices, shared
 * among the group's active practices, from practice_fees_paid() in the practice's own scope. Integer cents.
 */
export const PAID_INVOICE_FEES: FeeSource = {
  feesPaid: async (scope, practiceId, from, to): Promise<Cents> => {
    const { rows } = await scope.client.query<{ fees: string }>('SELECT practice_fees_paid($1, $2::date, $3::date)::text AS fees', [practiceId, from, to]);
    return parseCents(rows[0]?.fees ?? '0');
  },
};
