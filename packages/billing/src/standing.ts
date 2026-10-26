/**
 * An organization's one standing (docs/adr/0050; the UX baseline review's UX-004). Stub for the failing tests: the
 * standing as billing alone gives it, as the pages read it before.
 */

export type OrganizationStatus = 'active' | 'suspended' | 'closed';
export type BillingStanding = 'good' | 'past_due' | 'suspended';
export type OrganizationKind = 'group' | 'firm' | 'internal';
export type StandingKind = 'closed' | 'suspended_by_paidwhole' | 'suspended_nonpayment' | 'past_due' | 'good';

export function standingKind(_status: OrganizationStatus, standing: BillingStanding, _kind: OrganizationKind): StandingKind {
  return standing === 'suspended' ? 'suspended_nonpayment' : standing;
}

export const STANDING_ORDER: readonly StandingKind[] = ['suspended_nonpayment', 'past_due', 'good', 'suspended_by_paidwhole', 'closed'];
