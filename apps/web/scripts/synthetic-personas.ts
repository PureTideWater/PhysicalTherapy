import { createHash } from 'node:crypto';

import { totpCode, totpSecretFromBytes } from '../src/lib/auth/totp';

/**
 * The synthetic people `pnpm db:seed` creates for development and the e2e tests: one for every
 * persona of PRD 3, plus a few the e2e tests use alone (an invited user without MFA, one to lock out,
 * one to let sit idle, a second support engineer, a billing manager and a viewer for the remittances
 * journey, a billing manager for the mapping journey, a billing manager, a platform administrator
 * and a contract specialist for the contracts journey, and a billing manager and a platform
 * administrator (who sets the practice's pricing settings in the console) for the pricing journey,
 * whose sign-ins never share a TOTP step or a hardware key with another spec's; the three billing
 * managers of the other group upload into its practice and never into the rows another spec counts;
 * and a billing manager and a viewer of the other group for the recovery journey, in a practice of
 * its own that the journey adds; and two billing managers of the other group for the packet journey,
 * one who drafts and one who approves, in a practice of its own that the journey adds; and, each in a
 * practice of its own its journey adds, a billing manager for the triage journey, one for the monthly
 * monitoring journey, and a billing manager, a viewer and a reimbursement reviewer for the reporting
 * journey; and two billing managers of the other group, a contract specialist and a platform
 * administrator (who turns the kill switch on in the console) for the model features' journey, in a
 * practice of its own; and three billing managers of the other group for the ERA export journeys, in
 * practices of their own; and two billing managers of the other group and a reimbursement reviewer for the journey of a
 * submission sent without sign-off, in a practice of its own; and a platform administrator and two people of the other
 * group for the pricing-location journey, in a group of its own the console creates; and the practice administrator of
 * SYNTHETIC SUSPENDED GROUP, a group the seed holds suspended by PaidWhole with no practice, for the billing journey of a
 * suspended organization, so no other journey shares it and nothing reinstates it; and, for the tables at a phone's
 * width, a billing manager of the other group, three contract specialists, a platform administrator and a support
 * engineer, each in one test only).
 * Their passwords and TOTP secrets are derived from their keys here rather than written down, and
 * exist only in the local identity provider's store.
 * Synthetic accounts on a development machine; never a real person.
 */

/** The seeded organizations: packages/db's synthetic tenancy's four, and the suspended group scripts/seed.ts adds. */
export type SeedOrganization = 'group' | 'other_group' | 'firm' | 'internal' | 'suspended_group';

export interface SyntheticPersona {
  readonly key: string;
  readonly organization: SeedOrganization;
  readonly role:
    | 'practice_admin'
    | 'billing_manager'
    | 'analyst'
    | 'viewer'
    | 'firm_principal'
    | 'firm_analyst'
    | 'platform_admin'
    | 'contract_specialist'
    | 'reviewer'
    | 'support';
  /** Invited: a temporary password, no MFA yet (the first sign-in sets both). */
  readonly invited?: boolean;
}

export const SYNTHETIC_PERSONAS: readonly SyntheticPersona[] = [
  { key: 'practice-admin', organization: 'group', role: 'practice_admin' },
  { key: 'billing-manager', organization: 'group', role: 'billing_manager' },
  { key: 'analyst', organization: 'group', role: 'analyst' },
  { key: 'viewer', organization: 'group', role: 'viewer' },
  { key: 'other-admin', organization: 'other_group', role: 'practice_admin' },
  { key: 'firm-principal', organization: 'firm', role: 'firm_principal' },
  { key: 'firm-analyst', organization: 'firm', role: 'firm_analyst' },
  { key: 'platform-admin', organization: 'internal', role: 'platform_admin' },
  { key: 'contract-specialist', organization: 'internal', role: 'contract_specialist' },
  { key: 'reviewer', organization: 'internal', role: 'reviewer' },
  { key: 'support', organization: 'internal', role: 'support' },
  { key: 'support-expiry', organization: 'internal', role: 'support' },
  { key: 'invited', organization: 'group', role: 'viewer', invited: true },
  { key: 'lockout', organization: 'group', role: 'analyst' },
  { key: 'idle', organization: 'group', role: 'billing_manager' },
  { key: 'devices', organization: 'group', role: 'viewer' },
  { key: 'remittances-manager', organization: 'group', role: 'billing_manager' },
  { key: 'remittances-viewer', organization: 'group', role: 'viewer' },
  { key: 'mapping-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'contracts-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'contracts-admin', organization: 'internal', role: 'platform_admin' },
  { key: 'contracts-specialist', organization: 'internal', role: 'contract_specialist' },
  { key: 'pricing-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'pricing-admin', organization: 'internal', role: 'platform_admin' },
  { key: 'ledger-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'ledger-viewer', organization: 'other_group', role: 'viewer' },
  { key: 'packet-drafter', organization: 'other_group', role: 'billing_manager' },
  { key: 'packet-approver', organization: 'other_group', role: 'billing_manager' },
  // The packet's export attestation (D16; docs/adr/0061): the reimbursement reviewer, under a support grant on the journey's practice.
  { key: 'packet-reviewer', organization: 'internal', role: 'reviewer' },
  // The deadline journey (CO-05, D17): billing managers of the other group, in a practice of its own.
  { key: 'packet-deadline-drafter', organization: 'other_group', role: 'billing_manager' },
  { key: 'packet-deadline-approver', organization: 'other_group', role: 'billing_manager' },
  { key: 'triage-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'monitoring-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'reports-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'reports-viewer', organization: 'other_group', role: 'viewer' },
  { key: 'reports-reviewer', organization: 'internal', role: 'reviewer' },
  { key: 'models-drafter', organization: 'other_group', role: 'billing_manager' },
  { key: 'models-approver', organization: 'other_group', role: 'billing_manager' },
  { key: 'models-specialist', organization: 'internal', role: 'contract_specialist' },
  // The model features' journey (MOD-06): the platform administrator who turns the kill switch on from the console.
  { key: 'models-admin', organization: 'internal', role: 'platform_admin' },
  // Onboarding (docs/adr/0053): the platform administrator who turns an audit request into a customer.
  { key: 'onboarding-admin', organization: 'internal', role: 'platform_admin' },
  // The brand journey (docs/adr/0056): a billing manager of the other group, in a practice of its own.
  { key: 'brand-manager', organization: 'other_group', role: 'billing_manager' },
  // The ERA export journeys (docs/adr/0060): billing managers of the other group, each journey in practices of its own,
  // one for the four formats' uploads, one for the Coverage flag and one for the duplicate receipts.
  { key: 'era-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'era-coverage-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'era-duplicates-manager', organization: 'other_group', role: 'billing_manager' },
  // The free screening's journey (CO-04, decision D20 a): the contract specialist who approves the screening's place-of-service split.
  { key: 'screening-specialist', organization: 'internal', role: 'contract_specialist' },
  // The same journey (audit #57): the platform administrator who declines an audit request with its reason.
  { key: 'screening-admin', organization: 'internal', role: 'platform_admin' },
  // A submission sent without sign-off (the founder's ruling of 2026-10-20; docs/adr/0061): two billing managers of the
  // other group, one who writes and logs and one who approves, and a reimbursement reviewer, in a practice of its own.
  { key: 'unattested-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'unattested-approver', organization: 'other_group', role: 'billing_manager' },
  { key: 'unattested-reviewer', organization: 'internal', role: 'reviewer' },
  // The pricing-location journey (audit #33, PR 6b): the platform administrator who creates its practices with their
  // billing ZIPs, and two people of the other group the console adds to the journey's own group: its practice
  // administrator, who confirms the billing ZIP, and a billing manager, who uploads and maps.
  { key: 'location-admin', organization: 'internal', role: 'platform_admin' },
  { key: 'location-practice-admin', organization: 'other_group', role: 'viewer' },
  { key: 'location-manager', organization: 'other_group', role: 'billing_manager' },
  // A suspended organization's billing page (BIL-06; the UX baseline review's UX-004): the practice administrator of the
  // group the seed holds suspended by PaidWhole.
  { key: 'suspended-admin', organization: 'suspended_group', role: 'practice_admin' },
  // The tables at a phone's width (TBL-02, TBL-03; docs/adr/0078), each persona in one test only, so no sign-in or
  // hardware key is shared between tests that run at once: a billing manager of the other group, in a practice of its
  // own, and the contract specialist who abstracts there; the console's contract specialist, platform administrator and
  // support engineer; and the contract specialist who corrects the recovery journey's ledger.
  { key: 'tables-manager', organization: 'other_group', role: 'billing_manager' },
  { key: 'tables-specialist', organization: 'internal', role: 'contract_specialist' },
  { key: 'tables-console-specialist', organization: 'internal', role: 'contract_specialist' },
  { key: 'tables-admin', organization: 'internal', role: 'platform_admin' },
  { key: 'tables-support', organization: 'internal', role: 'support' },
  { key: 'tables-ledger-specialist', organization: 'internal', role: 'contract_specialist' },
];

/** The group the seed holds suspended by PaidWhole (BIL-06): no practice, one administrator, never reinstated. */
export const SYNTHETIC_SUSPENDED_GROUP = 'SYNTHETIC SUSPENDED GROUP';

export const SYNTHETIC_PRACTICES = {
  north: 'SYNTHETIC PHYSICAL THERAPY NORTH',
  south: 'SYNTHETIC PHYSICAL THERAPY SOUTH',
  other: 'SYNTHETIC OTHER PRACTICE',
} as const;

export function personaEmail(key: string): string {
  return `${key}@synthetic.test`;
}

/** The persona's password (synthetic, development only): meets the policy. */
export function personaPassword(key: string): string {
  return `Synthetic-${key}-Pass-2026!`;
}

/** The persona's TOTP secret (synthetic, development only). */
export function personaTotpSecret(key: string): string {
  return totpSecretFromBytes(createHash('sha256').update(`therapy-platform synthetic totp ${key}`).digest());
}

export function personaTotpCode(key: string, at: Date = new Date()): string {
  return totpCode(personaTotpSecret(key), at);
}
