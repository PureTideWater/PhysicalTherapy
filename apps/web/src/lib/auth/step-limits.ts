import type { Pending } from './sign-in';

/**
 * How long each sign-in step stays open (docs/adr/0081). Two clocks run on a step after the password:
 * the provider's (Cognito's sign-in session, or the access token on key registration) and the pending
 * cookie's own life. The step states, warns of and is closed at the shorter of the two, counted from
 * before the provider issued its challenge. A leaf with no runtime imports, so the dev provider, the
 * routes and the tests read one value; step-limits.test.ts pins the provider's lengths to infra's.
 */

/** Cognito's sign-in session (authSession, infra/lib/constructs/identity.ts), pinned by step-limits.test.ts. */
export const PROVIDER_CHALLENGE_SECONDS = 3 * 60;
/** Cognito's access token (accessToken, identity.ts): key registration's grant. Pinned the same way. */
export const PROVIDER_GRANT_SECONDS = 15 * 60;
/** The pending cookie's own life (docs/adr/0016): five minutes, fifteen for key registration. */
const PENDING_COOKIE_SECONDS = 5 * 60;
const REGISTRATION_COOKIE_SECONDS = 15 * 60;
/**
 * A mailed password-reset code's life: Cognito's hour (not set in infra, so nothing pins it; ADR 0081, "Not
 * verified here"), which the dev twin mirrors. Never shown: the reset step states its cookie's 15 minutes.
 */
export const PASSWORD_RESET_CODE_SECONDS = 60 * 60;
/** The reset step's cookie: 15 minutes, the safer bound at a shared computer (Send a new code opens it again). */
export const RESET_COOKIE_SECONDS = 15 * 60;
/** How long the kept email outlives its step (UX-012's figure). */
export const KEPT_EMAIL_EXTRA_SECONDS = 15 * 60;

/** A sign-in step, as the sealed pending value names it. */
export type StepName = Pending['step'];

/** Every step named, so a step added to Pending fails the typecheck here until it has its lengths (as STEP_PAGES does). */
const PROVIDER_SECONDS: Readonly<Record<StepName, number>> = {
  new_password: PROVIDER_CHALLENGE_SECONDS,
  mfa_setup: PROVIDER_CHALLENGE_SECONDS,
  mfa: PROVIDER_CHALLENGE_SECONDS,
  key: PROVIDER_CHALLENGE_SECONDS,
  register_key: PROVIDER_GRANT_SECONDS,
};
const COOKIE_SECONDS: Readonly<Record<StepName, number>> = {
  new_password: PENDING_COOKIE_SECONDS,
  mfa_setup: PENDING_COOKIE_SECONDS,
  mfa: PENDING_COOKIE_SECONDS,
  key: PENDING_COOKIE_SECONDS,
  register_key: REGISTRATION_COOKIE_SECONDS,
};

/** The pending cookie's life for a step. */
export function pendingSeconds(step: StepName): number {
  return COOKIE_SECONDS[step];
}

/** The limit a step states, warns of and is closed at: the shorter of the provider's and the cookie's. */
export function stepSeconds(step: StepName): number {
  return Math.min(PROVIDER_SECONDS[step], COOKIE_SECONDS[step]);
}

/** How long before the limit the warning comes: two minutes on a step of ten minutes or more, one otherwise. */
export function warningSeconds(limitSeconds: number): number {
  return limitSeconds >= 10 * 60 ? 2 * 60 : 60;
}
