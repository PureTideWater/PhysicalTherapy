import { createHash } from 'node:crypto';

import { totpCode, totpSecretFromBytes } from '../src/lib/auth/totp';

/**
 * The synthetic people `pnpm db:seed` creates for development and the e2e tests: one for every
 * persona of PRD 3, plus a few the e2e tests use alone (an invited user without MFA, one to lock out,
 * one to let sit idle, a second support engineer). Their passwords and TOTP secrets are derived from
 * their keys here rather than written down, and exist only in the local identity provider's store.
 * Synthetic accounts on a development machine; never a real person.
 */

export type SeedOrganization = 'group' | 'other_group' | 'firm' | 'internal';

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
];

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
