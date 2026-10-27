/**
 * An organization's one standing (docs/adr/0050; the UX baseline review's UX-004): its record's status, which a
 * platform administrator sets, and billing's standing from its invoices (billing_standing), worked out in one place so
 * no screen reads a suspended organization as in good standing. Pure: values in, the kind out. The words are each
 * audience's own: the customer's in apps/web/src/lib/routes/billing.ts, the operator's on the console's billing page.
 *
 * The record wins: a suspended or closed organization is never in good standing, whatever its invoices say. A firm's
 * unpaid invoice refuses no run before milestone 12 (practice_run_refusal reads only a practice's owning group, and
 * firms are billed then), so billing's suspension of a firm reads past due.
 */

export type OrganizationStatus = 'active' | 'suspended' | 'closed';
export type BillingStanding = 'good' | 'past_due' | 'suspended';
export type OrganizationKind = 'group' | 'firm' | 'internal';
export type StandingKind = 'closed' | 'suspended_by_paidwhole' | 'suspended_nonpayment' | 'past_due' | 'good';

export function standingKind(status: OrganizationStatus, standing: BillingStanding, kind: OrganizationKind): StandingKind {
  if (status === 'closed') {
    return 'closed';
  }
  if (status === 'suspended') {
    return 'suspended_by_paidwhole';
  }
  if (standing === 'suspended') {
    return kind === 'firm' ? 'past_due' : 'suspended_nonpayment';
  }
  return standing;
}

/** The order the console lists them in: what stops runs now, then what will, then the rest. */
export const STANDING_ORDER: readonly StandingKind[] = ['suspended_by_paidwhole', 'suspended_nonpayment', 'past_due', 'good', 'closed'];
