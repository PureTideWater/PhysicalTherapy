import { type ScopeClient, type ScopePool, recordAuditEvent, withActor } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';

import type {
  AuthProvider,
  AuthStep,
  AuthenticationResponseJSON,
  FailureStage,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from './provider';
import { type OpenedSession, openSession, revokeUserSessions } from './sessions';

/**
 * Sign-in, step by step (PRD 7, Sign-in and MFA; docs/product/sessions.md; docs/adr/0016). The
 * provider proves the password and the second factor; this flow applies the application's rules
 * around it:
 *
 * - A locked account (ten consecutive failures) is refused before any credential is tried, and stays
 *   locked until a platform administrator unlocks it. Every failure for a known account is counted
 *   and audited; three failed second factors within fifteen minutes are a security event.
 * - MFA is mandatory: there is no path to a session without a TOTP code or a hardware key, and a
 *   first sign-in enrolls TOTP before anything else.
 * - Internal roles must use a hardware key: a TOTP sign-in by such a user only registers a key (when
 *   they have none) and never opens a session; they then sign in with the key.
 *
 * - A forgotten password is reset by a code mailed to the address (docs/adr/0081, the forgotten password): the
 *   request answers alike for every address, at a floor, and a code goes only to an active account that already has a
 *   second factor; a reset ends every session of the account and still asks for the second factor next time.
 *
 * The flow carries no state of its own. Between steps the browser holds a Pending value, which the
 * web layer seals into a short-lived HttpOnly cookie.
 */

export interface SignInContext {
  /** The browser's device cookie, if any. */
  readonly deviceToken: string | undefined;
  readonly userAgent: string | null;
  readonly requestId: string;
}

export interface TotpEnrollment {
  readonly secret: string;
  readonly uri: string;
}

export type Pending =
  | { readonly step: 'new_password'; readonly email: string; readonly challenge: string }
  | { readonly step: 'mfa_setup'; readonly email: string; readonly challenge: string; readonly totp?: TotpEnrollment }
  | { readonly step: 'mfa'; readonly email: string; readonly challenge: string }
  | { readonly step: 'key'; readonly email: string; readonly challenge: string }
  /** An internal user proved password and TOTP but has no hardware key yet: they may register one. */
  | { readonly step: 'register_key'; readonly email: string; readonly userId: string; readonly grant: string; readonly challenge?: string }
  /** A reset code was asked for the typed address: unproven until the code is, so it holds no challenge and opens nothing. */
  | { readonly step: 'reset'; readonly email: string };

export type RefusalReason = 'credentials' | 'locked' | 'expired' | 'hardware_key_required' | 'no_account' | 'key_not_registered' | 'invitation_expired';

export type FlowResult =
  /** `keyRequired`: on the first step's result, the account must also register a hardware key (the web layer numbers the setup steps). */
  | { readonly kind: 'pending'; readonly pending: Pending; readonly keyRequired?: true }
  | { readonly kind: 'signed_in'; readonly session: OpenedSession; readonly userId: string }
  | { readonly kind: 'refused'; readonly reason: RefusalReason }
  | { readonly kind: 'invalid_password'; readonly problems: readonly string[]; readonly pending: Pending }
  | { readonly kind: 'key_registered' };

interface Account {
  readonly user_id: string;
  readonly cognito_sub: string;
  readonly email: string;
  readonly status: 'invited' | 'active' | 'disabled';
  readonly mfa_enrolled: boolean;
  readonly locked: boolean;
  readonly hardware_key_required: boolean;
}

/**
 * A forgotten password's confirmation, as the web layer settles it: reset (`locked`: the lock stays, and its notice says
 * how to lift it; `keepEmail`: the address may now be kept, being proven, but never for a locked or disabled account),
 * one refusal for every code problem, the policy's refusal, or the sessions that could not be ended (review R-3).
 */
export type ResetResult =
  | { readonly kind: 'reset'; readonly locked: boolean; readonly keepEmail: boolean }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'invalid_password'; readonly problems: readonly string[] }
  | { readonly kind: 'sessions_not_ended' };

export interface SignInDependencies {
  readonly pool: ScopePool<ScopeClient>;
  readonly provider: AuthProvider;
  readonly logger: Logger;
  /** The clock the reset request's floor is measured on, epoch ms (default Date.now). */
  readonly now?: () => number;
  /** How the reset request waits out its floor (default a timer). */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * The least time a reset request takes, on every path (review SEC-N2): it covers the lookup, the audit write and the
 * skipped or real send, so the answer's timing does not tell an account from none. Its log shows when it is too low.
 */
export const RESET_REQUEST_FLOOR_MS = 1500;

const refused = (reason: RefusalReason): FlowResult => ({ kind: 'refused', reason });

/** An error's name for a log (`error_code`): never its message, which can carry what was sent. */
const errorCode = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

const timer = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class SignInFlow {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: SignInDependencies) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? timer;
  }

  private async query<R>(text: string, values: unknown[]): Promise<R[]> {
    const client = await this.deps.pool.connect();
    try {
      return (await client.query<R & Record<string, unknown>>(text, values)).rows;
    } finally {
      client.release();
    }
  }

  private async account(by: { readonly email?: string; readonly sub?: string }): Promise<Account | undefined> {
    const [row] = await this.query<Account>('SELECT * FROM sign_in_account($1, $2)', [by.email ?? null, by.sub ?? null]);
    return row;
  }

  private audit(userId: string, action: string, requestId: string, purpose?: string): Promise<void> {
    return withActor(this.deps.pool, userId, (scope) => recordAuditEvent(scope, { action, objectType: 'user', objectId: userId, purpose, requestId }));
  }

  /** A failed attempt for a known account: counted, audited, and the lock at ten. */
  private async failure(account: Account | undefined, stage: FailureStage, context: SignInContext): Promise<FlowResult> {
    if (account === undefined) {
      return refused('credentials');
    }
    const [result] = await this.query<{ locked: boolean; newly_locked: boolean; burst: boolean }>('SELECT locked, newly_locked, burst FROM sign_in_failed($1, $2, $3)', [
      account.user_id,
      stage,
      context.requestId,
    ]);
    if (result?.burst === true) {
      this.deps.logger.warn('security event: failed second-factor burst', { user_id: account.user_id, request_id: context.requestId });
    }
    if (result?.newly_locked === true) {
      this.deps.logger.warn('security event: account locked after ten failed sign-ins', { user_id: account.user_id, request_id: context.requestId });
    }
    return refused(result?.locked === true ? 'locked' : 'credentials');
  }

  private async after(step: AuthStep, email: string, context: SignInContext): Promise<FlowResult> {
    switch (step.kind) {
      case 'new_password_required':
        return { kind: 'pending', pending: { step: 'new_password', email, challenge: step.challenge } };
      case 'mfa_setup_required':
        return { kind: 'pending', pending: { step: 'mfa_setup', email, challenge: step.challenge } };
      case 'mfa_required':
        return { kind: 'pending', pending: { step: 'mfa', email, challenge: step.challenge } };
      case 'expired':
        return refused('expired');
      case 'rejected':
        return this.failure(await this.account({ email }), step.stage, context);
      case 'authenticated':
        return this.authenticated(step, context);
    }
  }

  private async authenticated(step: Extract<AuthStep, { kind: 'authenticated' }>, context: SignInContext): Promise<FlowResult> {
    const account = await this.account({ sub: step.identity.sub });
    if (account === undefined || account.status === 'disabled') {
      await this.deps.provider.release(step.grant);
      return refused('no_account');
    }
    if (account.locked) {
      await this.deps.provider.release(step.grant);
      return refused('locked');
    }
    if (account.hardware_key_required && step.identity.method !== 'webauthn') {
      if (!(await this.deps.provider.hasHardwareKey(step.grant))) {
        return { kind: 'pending', pending: { step: 'register_key', email: account.email, userId: account.user_id, grant: step.grant } };
      }
      await this.deps.provider.release(step.grant);
      return refused('hardware_key_required');
    }
    await this.deps.provider.release(step.grant);
    const session = await openSession(this.deps.pool, { userId: account.user_id, method: step.identity.method, ...context });
    if (session.newDevice) {
      this.deps.logger.warn('security event: sign-in from a new device', { user_id: account.user_id, request_id: context.requestId });
    }
    return { kind: 'signed_in', session, userId: account.user_id };
  }

  /** Email and password. */
  async start(email: string, password: string, context: SignInContext): Promise<FlowResult> {
    const account = await this.account({ email });
    if (account?.locked === true) {
      return refused('locked');
    }
    if (account?.status === 'disabled') {
      return refused('credentials');
    }
    // An invitation lasts seven days (PRD 5, J2: "an expired invitation is re-sent by the administrator"), as
    // Cognito's temporary password does; the database says when every invitation of the user has lapsed.
    if (account?.status === 'invited') {
      const [state] = await this.query<{ expired: boolean }>('SELECT invitation_expired($1) AS expired', [account.user_id]);
      if (state?.expired === true) {
        return refused('invitation_expired');
      }
    }
    const result = await this.after(await this.deps.provider.signIn(email, password), email, context);
    return result.kind === 'pending' && account?.hardware_key_required === true ? { ...result, keyRequired: true } : result;
  }

  async newPassword(pending: Pending, password: string, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'new_password') {
      return refused('expired');
    }
    const step = await this.deps.provider.setNewPassword(pending.challenge, password);
    if (step.kind === 'invalid_password') {
      return { kind: 'invalid_password', problems: step.problems, pending };
    }
    const account = await this.account({ email: pending.email });
    if (account !== undefined && step.kind !== 'expired') {
      await this.audit(account.user_id, 'password_changed', context.requestId);
    }
    return this.after(step, pending.email, context);
  }

  /** The TOTP secret to enroll, shown once on the enrollment screen. */
  async beginTotpSetup(pending: Pending): Promise<FlowResult> {
    if (pending.step !== 'mfa_setup') {
      return refused('expired');
    }
    const setup = await this.deps.provider.beginTotpSetup(pending.challenge);
    if ('kind' in setup) {
      return refused('expired');
    }
    return { kind: 'pending', pending: { step: 'mfa_setup', email: pending.email, challenge: setup.challenge, totp: { secret: setup.secret, uri: setup.uri } } };
  }

  async completeTotpSetup(pending: Pending, code: string, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'mfa_setup' || pending.totp === undefined) {
      return refused('expired');
    }
    const step = await this.deps.provider.completeTotpSetup(pending.challenge, code);
    if (step.kind === 'authenticated') {
      const account = await this.account({ sub: step.identity.sub });
      if (account !== undefined) {
        await this.audit(account.user_id, 'mfa_enrolled', context.requestId, 'totp');
      }
    }
    return this.after(step, pending.email, context);
  }

  async answerTotp(pending: Pending, code: string, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'mfa') {
      return refused('expired');
    }
    return this.after(await this.deps.provider.answerTotp(pending.challenge, code), pending.email, context);
  }

  /** Hardware-key sign-in: the browser's request options. A locked account gets none. */
  async beginKey(email: string): Promise<{ readonly options: PublicKeyCredentialRequestOptionsJSON; readonly pending: Pending } | FlowResult> {
    const account = await this.account({ email });
    if (account?.locked === true) {
      return refused('locked');
    }
    const { options, challenge } = await this.deps.provider.beginKeySignIn(email);
    return { options, pending: { step: 'key', email, challenge } };
  }

  async completeKey(pending: Pending, response: AuthenticationResponseJSON, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'key') {
      return refused('expired');
    }
    return this.after(await this.deps.provider.completeKeySignIn(pending.challenge, response), pending.email, context);
  }

  async beginKeyRegistration(pending: Pending): Promise<{ readonly options: PublicKeyCredentialCreationOptionsJSON; readonly pending: Pending } | FlowResult> {
    if (pending.step !== 'register_key') {
      return refused('expired');
    }
    const { options, challenge } = await this.deps.provider.beginKeyRegistration(pending.grant);
    return { options, pending: { ...pending, challenge } };
  }

  async completeKeyRegistration(pending: Pending, response: RegistrationResponseJSON, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'register_key' || pending.challenge === undefined) {
      return refused('expired');
    }
    if (!(await this.deps.provider.completeKeyRegistration(pending.grant, pending.challenge, response))) {
      return refused('key_not_registered');
    }
    await this.audit(pending.userId, 'hardware_key_registered', context.requestId, 'webauthn');
    await this.deps.provider.release(pending.grant);
    return { kind: 'key_registered' };
  }

  /**
   * A forgotten password: asks the provider to mail a code, and answers with the reset step for the typed address, alike
   * for every address (docs/adr/0081, the forgotten password; review SEC-B1, SEC-N2). The code is asked for only for an
   * active account with a second factor: an account with none would be offered enrolment after a reset, so a mailbox
   * would be enough to take it. A locked account still gets one: the lock stays after the reset. The request is
   * recorded for every account, the actor being the account named, not a proven person (`unverified_request`); an
   * unknown address has no actor and records nothing. Every path, a thrown one included, takes at least the floor, and
   * the wait comes after every connection is given back.
   */
  async requestPasswordReset(email: string, context: SignInContext): Promise<Extract<Pending, { step: 'reset' }>> {
    const started = this.now();
    try {
      const account = await this.account({ email });
      if (account?.status === 'active' && account.mfa_enrolled) {
        await this.deps.provider.requestPasswordReset(email, context.requestId);
      }
      if (account !== undefined) {
        await this.audit(account.user_id, 'password_reset_requested', context.requestId, 'unverified_request');
      }
      return { step: 'reset', email };
    } finally {
      const elapsed = this.now() - started;
      this.deps.logger.info('password reset request timed', { request_id: context.requestId, elapsed_ms: elapsed });
      if (elapsed > RESET_REQUEST_FLOOR_MS) {
        this.deps.logger.warn('password reset request over floor', { request_id: context.requestId, elapsed_ms: elapsed });
      } else if (elapsed < RESET_REQUEST_FLOOR_MS) {
        await this.sleep(RESET_REQUEST_FLOOR_MS - elapsed);
      }
    }
  }

  /**
   * Sets a new password with the mailed code (docs/adr/0081, the forgotten password). The code is the authorization: a
   * refused one is one answer, counts no failure and writes nothing (a count would mark real accounts by timing and let
   * anyone lock one). On a reset, one transaction as the account ends every session and records the reset, retried once;
   * then the provider signs the user out everywhere, its failure logged and not failing the reset (review SEC-N1). The
   * lock and the second factor stay: a reset proves the mailbox, nothing more.
   */
  async confirmPasswordReset(email: string, code: string, password: string, context: SignInContext): Promise<ResetResult> {
    const result = await this.deps.provider.confirmPasswordReset(email, code, password);
    if (result.kind === 'rejected') {
      this.deps.logger.warn('password reset code refused', { request_id: context.requestId, error_code: 'rejected' });
      return result;
    }
    if (result.kind === 'invalid_password') {
      return result;
    }
    const account = await this.account({ email });
    if (account === undefined) {
      return { kind: 'reset', locked: false, keepEmail: false };
    }
    let ended = false;
    for (let attempt = 0; attempt < 2 && !ended; attempt += 1) {
      try {
        await withActor(this.deps.pool, account.user_id, async (scope) => {
          await revokeUserSessions(scope, account.user_id);
          await recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: account.user_id, purpose: 'email_code', requestId: context.requestId });
        });
        ended = true;
      } catch {
        // Retried once; a second failure is logged below (review R-3).
      }
    }
    if (!ended) {
      this.deps.logger.error('security event: password reset sessions not ended', { user_id: account.user_id, request_id: context.requestId });
    }
    try {
      await this.deps.provider.globalSignOut(account.cognito_sub);
    } catch (error) {
      this.deps.logger.error('security event: password reset provider sign-out failed', { user_id: account.user_id, request_id: context.requestId, error_code: errorCode(error) });
    }
    if (!ended) {
      return { kind: 'sessions_not_ended' };
    }
    this.deps.logger.warn('security event: password reset completed', { user_id: account.user_id, request_id: context.requestId });
    return { kind: 'reset', locked: account.locked, keepEmail: !account.locked && account.status !== 'disabled' };
  }

  /**
   * The person left the step (Start again, docs/adr/0081): key registration's grant is given back, as every other way
   * out of that step gives it back. The other steps hold only a challenge, which the provider ends at its own limit and
   * which nothing can answer once the cookie that seals it is gone; the reset step holds not even that.
   */
  async abandon(pending: Pending): Promise<void> {
    switch (pending.step) {
      case 'register_key':
        await this.deps.provider.release(pending.grant);
        return;
      case 'new_password':
      case 'mfa_setup':
      case 'mfa':
      case 'key':
      case 'reset':
        return;
    }
  }
}
