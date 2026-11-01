import type { Outcome } from './route';

/**
 * Where a refused request goes to sign in again, or to the step that comes first (the terms of use in force, the
 * maintenance page): one answer for a page, a server action (next.ts) and a download a browser opened (handler.ts;
 * docs/adr/0079), so the adapters never differ. The reason is a code, never an identifier; undefined for every other
 * outcome.
 */
export function signInFor(outcome: Outcome<unknown>): string | undefined {
  if (outcome.status === 'unauthenticated') {
    return outcome.reason === 'none' ? '/sign-in' : `/sign-in?reason=${outcome.reason}`;
  }
  if (outcome.status === 'mfa_required') {
    return '/sign-in?reason=mfa_required';
  }
  if (outcome.status === 'hardware_key_required') {
    return '/sign-in/hardware-key?reason=hardware_key_required';
  }
  // A customer who has not accepted the terms of use in force accepts them first; maintenance shows its page.
  if (outcome.status === 'terms_required') {
    return '/terms';
  }
  if (outcome.status === 'maintenance') {
    return '/maintenance';
  }
  return undefined;
}
