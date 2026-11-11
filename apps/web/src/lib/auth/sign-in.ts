import { type ScopeClient, type ScopePool, recordAuditEvent, withActor } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';

import {
  type AuthProvider,
  type AuthStep,
  type AuthenticationResponseJSON,
  ClientCredentialError,
  type FailureStage,
  type PasswordResetResult,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from './provider';
import { type OpenedSession, isStaleSessionRefusal, lockAccountForSignIn, openSession, revokeUserSessions } from './sessions';

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
 * - A second factor is enrolled only inside a live invitation (docs/adr/0088, D3): the account the provider's
 *   enrolling subject names, with the same email, invited, not enrolled, not locked and holding a live invitation (an
 *   unaccepted, unexpired one whose membership has not ended). It is checked when the provider asks for enrolment and
 *   again before each enrolment call, so the provider stores no factor for anyone else; a cleared or missing TOTP
 *   factor is re-enrolled only through support (a cleared hardware key is not yet: docs/adr/0088, Not covered).
 * - Internal roles must use a hardware key: a TOTP sign-in by such a user only registers a key (when
 *   they have none) and never opens a session; they then sign in with the key.
 *
 * - A refused client credential (the provider refused this application's own secret: docs/adr/0088, D2) is the
 *   platform's failure, never the person's: it counts no failure, locks nothing, ends the attempt and is logged as a
 *   security event by the provider's error name alone.
 * - A forgotten password is reset by a code mailed to the address (docs/adr/0081, the forgotten password): the
 *   request answers alike for every address, at a floor, and a code goes only to an active account that already has a
 *   second factor; a reset ends every session of the account and still asks for the second factor next time.
 * - A sign-in attempt begun at or before the account's latest recorded password reset opens no session, registers no
 *   key, enrols no factor and replaces no temporary password afterwards (docs/adr/0093). Every attempt carries its
 *   start, read once from the database's clock before its first provider call; the database judges each step against
 *   the account's mark and records each refusal, and refuses a stale session itself. A reset whose outcome at the
 *   provider is unknown is read on the safer side: the sessions end, the mark moves and the operator is paged.
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

/**
 * When the attempt began: epoch ms of the database's sign_in_step_began(), read once before the attempt's first
 * provider call and carried unchanged through every step built from another, so an attempt has one start however many
 * steps it takes (docs/adr/0093, D3). Never the web layer's `startedAt`, which is the web server's clock, per step.
 * Absent only on a step the release before this rule sealed, which starts again (D8).
 */
interface Began {
  readonly began?: number;
}

export type Pending =
  | ({ readonly step: 'new_password'; readonly email: string; readonly challenge: string } & Began)
  /** `subject`: the provider's enrolling user (docs/adr/0088, D3); absent only on a step the release before this rule sealed. */
  | ({ readonly step: 'mfa_setup'; readonly email: string; readonly challenge: string; readonly subject?: string; readonly totp?: TotpEnrollment } & Began)
  | ({ readonly step: 'mfa'; readonly email: string; readonly challenge: string } & Began)
  | ({ readonly step: 'key'; readonly email: string; readonly challenge: string } & Began)
  /**
   * An internal user proved password and TOTP but has no hardware key yet: they may register one. `addressUserId`: the
   * account the typed address named, when it is not `userId` (a crossed state; docs/adr/0093, D5): both are judged.
   * The flow seals none now, since authenticated() refuses a crossed state before this step; a step that carries one
   * is still judged for both.
   */
  | ({ readonly step: 'register_key'; readonly email: string; readonly userId: string; readonly grant: string; readonly challenge?: string; readonly addressUserId?: string } & Began)
  /** A reset code was asked for the typed address: unproven until the code is, so it holds no challenge and opens nothing. */
  | { readonly step: 'reset'; readonly email: string };

export type RefusalReason =
  | 'credentials'
  | 'locked'
  | 'expired'
  | 'hardware_key_required'
  | 'no_account'
  | 'key_not_registered'
  | 'invitation_expired'
  /** A second factor asked for outside a live invitation (docs/adr/0088, D3). */
  | 'enrolment_not_open'
  /** The provider refused this application's client credential (docs/adr/0088, D2): the platform's failure. */
  | 'client_credential';

export type FlowResult =
  /** `keyRequired`: on the first step's result, the account must also register a hardware key (the web layer numbers the setup steps). */
  | { readonly kind: 'pending'; readonly pending: Pending; readonly keyRequired?: true }
  | { readonly kind: 'signed_in'; readonly session: OpenedSession; readonly userId: string }
  | { readonly kind: 'refused'; readonly reason: RefusalReason }
  | { readonly kind: 'invalid_password'; readonly problems: readonly string[]; readonly pending: Pending }
  | { readonly kind: 'key_registered' };

/** An attempt as a step's answer is settled: its start, and the step answered, which names a refusal after a reset. */
interface Attempt {
  readonly began: number | undefined;
  readonly step: Exclude<JudgedStep, 'key_registered'>;
}

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
  | { readonly kind: 'sessions_not_ended' }
  /**
   * The provider did not say whether it reset the password (docs/adr/0093, D9): read on the safer side, the account's
   * sessions were ended and its mark moved where the address names an account, and the answer is the generic failure,
   * never a refused code.
   */
  | { readonly kind: 'outcome_unknown' }
  /** The provider refused this application's client credential (docs/adr/0088, D2): nothing was reset. */
  | { readonly kind: 'client_credential' };

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

/** The steps the database judges against a password reset (sign_in_step_refused's closed list; docs/adr/0093, D5 and D6). */
type JudgedStep = 'new_password' | 'mfa_setup' | 'mfa' | 'key' | 'register_key' | 'key_registered';
/** Why sign_in_step_refused() refuses a step (docs/adr/0093, D5). Only `before_reset` is evidence, recorded by the database. */
type RefusedWhy = 'no_account' | 'no_start' | 'ahead_of_clock' | 'before_reset';
interface Judgement {
  readonly userId: string;
  readonly why: RefusedWhy;
}

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

  /** Whether every invitation of an invited user has lapsed (the database's rule; false for anyone not invited). */
  private async invitationExpired(userId: string): Promise<boolean> {
    const [state] = await this.query<{ expired: boolean }>('SELECT invitation_expired($1) AS expired', [userId]);
    return state?.expired === true;
  }

  /**
   * Whether the user has a live invitation (docs/adr/0088, D3; review security-S1): an unaccepted, unexpired invitation
   * whose membership has not ended. A positive check, read as the invitee under the invitation and membership policies
   * that let a user read their own rows: an invited user with no invitation row at all (one invited before invitations
   * were recorded, or inserted with no actor) has none, where invitation_expired() would call that not expired.
   */
  private async invitationLive(userId: string): Promise<boolean> {
    return withActor(this.deps.pool, userId, async (scope) => {
      const { rows } = await scope.client.query<{ live: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM invitation i JOIN membership m ON m.id = i.membership_id
            WHERE i.user_id = $1 AND i.accepted_at IS NULL AND i.expires_at > now() AND (m.ends_at IS NULL OR m.ends_at > now())
         ) AS live`,
        [userId],
      );
      return rows[0]?.live === true;
    });
  }

  /**
   * The enrolment rule (docs/adr/0088, D3; review security-S2): the subject the provider is enrolling, when it named
   * one, names an app account whose email is the step's, which the email alone finds too (sign_in_account's OR would
   * return either row), and that account is invited, not enrolled, not locked, and holds a live invitation (an
   * unaccepted, unexpired invitation whose membership has not ended; none at all is no live one). Answers the subject when enrolment is open; otherwise logs a security event of IDs only and answers
   * nothing, before any enrolment call, so the provider stores nothing.
   */
  private async enrolment(subject: string | undefined, email: string, context: SignInContext): Promise<string | undefined> {
    const bySub = subject === undefined ? undefined : await this.account({ sub: subject });
    const byEmail = await this.account({ email });
    const open =
      subject !== undefined &&
      bySub !== undefined &&
      bySub.cognito_sub === subject &&
      bySub.email.toLowerCase() === email.toLowerCase() &&
      byEmail?.user_id === bySub.user_id &&
      bySub.status === 'invited' &&
      !bySub.mfa_enrolled &&
      !bySub.locked &&
      (await this.invitationLive(bySub.user_id));
    if (!open) {
      this.deps.logger.warn('security event: second-factor enrolment refused', { user_id: (bySub ?? byEmail)?.user_id ?? null, request_id: context.requestId });
      return undefined;
    }
    return subject;
  }

  /**
   * Whether a new password may be chosen (review security-N2): the provider would store it before any enrolment rule
   * runs, so an account the provider alone knows, or an invitee outside a live invitation, would become a confirmed
   * provider user with no factor. Open for the email's account when it is not locked and is either an invitee, not
   * enrolled, holding a live invitation, or an active account with a factor (whose next step asks for that factor, not
   * for enrolment). Otherwise logs the enrolment refusal of IDs only, before the provider changes anything.
   */
  private async newPasswordOpen(email: string, context: SignInContext): Promise<boolean> {
    const account = await this.account({ email });
    const open =
      account !== undefined &&
      !account.locked &&
      ((account.status === 'invited' && !account.mfa_enrolled && (await this.invitationLive(account.user_id))) || (account.status === 'active' && account.mfa_enrolled));
    if (!open) {
      this.deps.logger.warn('security event: second-factor enrolment refused', { user_id: account?.user_id ?? null, request_id: context.requestId });
    }
    return open;
  }

  /**
   * Runs a step that calls the provider: a refused client credential (docs/adr/0088, D2) is logged as a security event
   * by the provider's error name and answered as the platform's failure, before anything counts it as the person's.
   */
  private async guarded<R>(context: SignInContext | undefined, refusal: R, run: () => Promise<R>): Promise<R> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof ClientCredentialError)) {
        throw error;
      }
      this.deps.logger.error('security event: client credential refused', { request_id: context?.requestId ?? null, error_code: error.code });
      return refusal;
    }
  }

  private audit(userId: string, action: string, requestId: string, purpose?: string): Promise<void> {
    return withActor(this.deps.pool, userId, (scope) => recordAuditEvent(scope, { action, objectType: 'user', objectId: userId, purpose, requestId }));
  }

  /** The start of an attempt: the database's clock, in whole milliseconds, read before the attempt's first provider call (D3). */
  private async beganNow(): Promise<number> {
    const [row] = await this.query<{ began: Date }>('SELECT sign_in_step_began() AS began', []);
    if (row === undefined) {
      throw new Error('the database gave no start for the sign-in attempt');
    }
    return new Date(row.began).getTime();
  }

  /**
   * Whether the database refuses the step for any of the accounts (docs/adr/0093, D5): each account is judged by
   * sign_in_step_refused(), which records a start at or before the account's mark as a security event in the same
   * call, so nothing here refuses without the record. Every account given is judged, even after one refused, so each
   * has its record. A step with no start is refused without asking: it proves nothing and is no evidence. Returns the
   * accounts that were refused.
   */
  private async judged(userIds: readonly (string | undefined)[], began: number | undefined, step: JudgedStep, context: SignInContext | undefined): Promise<Judgement[]> {
    const distinct = [...new Set(userIds.filter((id): id is string => id !== undefined))];
    const refusedFor: Judgement[] = [];
    for (const userId of distinct) {
      const [row] = await this.query<{ why: RefusedWhy | null }>('SELECT sign_in_step_refused($1, $2, $3, $4) AS why', [
        userId,
        began === undefined ? null : new Date(began),
        step,
        context?.requestId ?? null,
      ]);
      // No row cannot happen (the function always answers); read as a refusal that is no evidence.
      const why = row === undefined ? 'no_account' : row.why;
      if (why !== null) {
        refusedFor.push({ userId, why });
      }
    }
    return refusedFor;
  }

  /**
   * The lines a judgement leaves. Only a start at or before the account's mark is evidence, and only it is the line
   * the operator is paged on (the database recorded it in the same call). A start ahead of the database's clock is the
   * platform's fault (a clock that stepped back), logged as an error of its own. No account and no start log nothing.
   */
  private logJudged(judgements: readonly Judgement[], step: JudgedStep, context: SignInContext | undefined): void {
    for (const { userId, why } of judgements) {
      if (why === 'before_reset') {
        this.deps.logger.warn('security event: sign-in step refused after a password reset', { user_id: userId, request_id: context?.requestId ?? null, error_code: step });
      } else if (why === 'ahead_of_clock') {
        this.deps.logger.error('sign-in step start is ahead of the database clock', { user_id: userId, request_id: context?.requestId ?? null, error_code: step });
      }
    }
  }

  /**
   * Whether the step is stale: begun at or before a password reset of one of the accounts (or with no start, or ahead
   * of the database's clock, or for an account that is gone). Every such step is refused; logJudged says which leave a line.
   */
  private async stale(userIds: readonly (string | undefined)[], began: number | undefined, step: Exclude<JudgedStep, 'key_registered'>, context: SignInContext | undefined): Promise<boolean> {
    if (began === undefined) {
      return true;
    }
    const refusedFor = await this.judged(userIds, began, step, context);
    this.logJudged(refusedFor, step, context);
    return refusedFor.length > 0;
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

  /**
   * What the provider's answer becomes. `attempt`: the attempt's start, carried unchanged into every step built here,
   * and the step that was answered, which names a refusal after a password reset (docs/adr/0093, D3 and D5).
   */
  private async after(step: AuthStep, email: string, attempt: Attempt, context: SignInContext): Promise<FlowResult> {
    const { began } = attempt;
    switch (step.kind) {
      case 'new_password_required':
        return (await this.newPasswordOpen(email, context)) ? { kind: 'pending', pending: { step: 'new_password', email, challenge: step.challenge, began } } : refused('enrolment_not_open');
      case 'mfa_setup_required': {
        const subject = await this.enrolment(step.subject, email, context);
        return subject === undefined ? refused('enrolment_not_open') : { kind: 'pending', pending: { step: 'mfa_setup', email, challenge: step.challenge, subject, began } };
      }
      case 'mfa_required':
        return { kind: 'pending', pending: { step: 'mfa', email, challenge: step.challenge, began } };
      case 'expired':
        return refused('expired');
      case 'rejected':
        return this.failure(await this.account({ email }), step.stage, context);
      case 'authenticated':
        return this.authenticated(step, email, attempt, context);
    }
  }

  /**
   * The provider proved the person. After the account is found, not disabled and not locked, and before anything is
   * opened or sealed, the attempt is judged against a password reset (docs/adr/0093, D5): for the account the
   * provider's subject names and, when the typed address names another, that one too (a reset marks the address's
   * account; in a sound database they are one). A session then carries the attempt's start, and the database refuses
   * it under the account's row lock if a reset landed since the check (D4), which is recorded and answered alike.
   */
  private async authenticated(step: Extract<AuthStep, { kind: 'authenticated' }>, email: string, attempt: Attempt, context: SignInContext): Promise<FlowResult> {
    // The grant is given back on every way out but the key-registration step, which seals it: a lookup or a judgement
    // that throws gives it back too, before the error leaves (review SEC-N6 of 2026-11-11).
    let held = true;
    const release = async (): Promise<void> => {
      held = false;
      await this.deps.provider.release(step.grant);
    };
    try {
      const account = await this.account({ sub: step.identity.sub });
      if (account === undefined || account.status === 'disabled') {
        await release();
        return refused('no_account');
      }
      if (account.locked) {
        await release();
        return refused('locked');
      }
      // Both accounts are judged first when the typed address names another than the provider's subject (a crossed
      // state), so a reset of either leaves its record. sign_in_account() matches the address without regard to case,
      // so a sound account typed in another case is one account.
      const typed = await this.account({ email });
      const crossed = typed !== undefined && typed.user_id !== account.user_id;
      const { began } = attempt;
      if (began === undefined || (await this.stale([account.user_id, typed?.user_id], began, attempt.step, context))) {
        await release();
        return refused('expired');
      }
      // A crossed state is then refused outright (review SEC-S1 of 2026-11-11): the address's reset marks and sweeps
      // one account and the session's insert is checked against the other, so nothing exact can be said of the pair.
      if (crossed) {
        await release();
        this.deps.logger.warn('security event: sign-in refused for a crossed account', { user_id: account.user_id, request_id: context.requestId });
        return refused('no_account');
      }
      const judgedAccounts = [account.user_id];
      if (account.hardware_key_required && step.identity.method !== 'webauthn') {
        if (!(await this.deps.provider.hasHardwareKey(step.grant))) {
          held = false;
          return { kind: 'pending', pending: { step: 'register_key', email: account.email, userId: account.user_id, grant: step.grant, began: attempt.began } };
        }
        await release();
        return refused('hardware_key_required');
      }
      await release();
      let session: OpenedSession;
      try {
        session = await openSession(this.deps.pool, { userId: account.user_id, method: step.identity.method, ...context, began });
      } catch (error) {
        if (!isStaleSessionRefusal(error)) {
          throw error;
        }
        // A reset landed between the check above and the insert: the database refused the session under the account's
        // lock. Judged once more, now that the mark has moved, so the refusal has its record; if that call names no
        // reason, the paging line is still logged for the account, since the database's refusal is the fact.
        const recorded = await this.judged(judgedAccounts, attempt.began, attempt.step, context);
        this.logJudged(recorded.length > 0 ? recorded : [{ userId: account.user_id, why: 'before_reset' }], attempt.step, context);
        return refused('expired');
      }
      if (session.newDevice) {
        this.deps.logger.warn('security event: sign-in from a new device', { user_id: account.user_id, request_id: context.requestId });
      }
      return { kind: 'signed_in', session, userId: account.user_id };
    } catch (error) {
      if (held) {
        try {
          await this.deps.provider.release(step.grant);
        } catch {
          // The first error is the one that leaves; the tokens lapse on their own.
        }
      }
      throw error;
    }
  }

  /** Email and password. */
  async start(email: string, password: string, context: SignInContext): Promise<FlowResult> {
    return this.guarded(context, refused('client_credential'), () => this.started(email, password, context));
  }

  private async started(email: string, password: string, context: SignInContext): Promise<FlowResult> {
    // The attempt's start, before the account is read and the provider asked (docs/adr/0093, D3).
    const began = await this.beganNow();
    const account = await this.account({ email });
    if (account?.locked === true) {
      return refused('locked');
    }
    if (account?.status === 'disabled') {
      return refused('credentials');
    }
    // An invitation lasts seven days (PRD 5, J2: "an expired invitation is re-sent by the administrator"), as
    // Cognito's temporary password does; the database says when every invitation of the user has lapsed.
    if (account?.status === 'invited' && (await this.invitationExpired(account.user_id))) {
      return refused('invitation_expired');
    }
    const result = await this.after(await this.deps.provider.signIn(email, password), email, { began, step: 'mfa' }, context);
    return result.kind === 'pending' && account?.hardware_key_required === true ? { ...result, keyRequired: true } : result;
  }

  async newPassword(pending: Pending, password: string, context: SignInContext): Promise<FlowResult> {
    return this.guarded(context, refused('client_credential'), () => this.passwordChosen(pending, password, context));
  }

  private async passwordChosen(pending: Pending, password: string, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'new_password') {
      return refused('expired');
    }
    // Checked again: the step can outlive a change to the account, and the provider stores the password first.
    if (!(await this.newPasswordOpen(pending.email, context))) {
      return refused('enrolment_not_open');
    }
    // A step begun before a reset of the account replaces no password after it (docs/adr/0093, D5).
    const typed = await this.account({ email: pending.email });
    if (await this.stale([typed?.user_id], pending.began, 'new_password', context)) {
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
    return this.after(step, pending.email, { began: pending.began, step: 'new_password' }, context);
  }

  /**
   * The TOTP secret to enroll, shown once on the enrollment screen. The enrolment rule is checked again first, on the
   * sealed subject: the step can outlive a change to the account. A step sealed with no subject starts again.
   */
  async beginTotpSetup(pending: Pending, context: SignInContext): Promise<FlowResult> {
    return this.guarded(context, refused('client_credential'), () => this.totpSetupBegun(pending, context));
  }

  private async totpSetupBegun(pending: Pending, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'mfa_setup' || pending.subject === undefined) {
      return refused('expired');
    }
    const subject = await this.enrolment(pending.subject, pending.email, context);
    if (subject === undefined) {
      return refused('enrolment_not_open');
    }
    // A step begun before a reset of the account enrols no factor after it (docs/adr/0093, D5).
    if (await this.stale([(await this.account({ email: pending.email }))?.user_id], pending.began, 'mfa_setup', context)) {
      return refused('expired');
    }
    const setup = await this.deps.provider.beginTotpSetup(pending.challenge);
    if ('kind' in setup) {
      return refused('expired');
    }
    return {
      kind: 'pending',
      pending: { step: 'mfa_setup', email: pending.email, challenge: setup.challenge, subject, totp: { secret: setup.secret, uri: setup.uri }, began: pending.began },
    };
  }

  /** The code that proves the secret: the enrolment rule is checked once more, the last point before the provider stores the factor. */
  async completeTotpSetup(pending: Pending, code: string, context: SignInContext): Promise<FlowResult> {
    return this.guarded(context, refused('client_credential'), () => this.totpSetupCompleted(pending, code, context));
  }

  private async totpSetupCompleted(pending: Pending, code: string, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'mfa_setup' || pending.totp === undefined || pending.subject === undefined) {
      return refused('expired');
    }
    if ((await this.enrolment(pending.subject, pending.email, context)) === undefined) {
      return refused('enrolment_not_open');
    }
    if (await this.stale([(await this.account({ email: pending.email }))?.user_id], pending.began, 'mfa_setup', context)) {
      return refused('expired');
    }
    const step = await this.deps.provider.completeTotpSetup(pending.challenge, code);
    // The tokens must name the subject the rule approved: otherwise the factor and the session would belong to a user
    // the rule never checked (review security-N1). No factor is audited and no session opened.
    if (step.kind === 'authenticated' && step.identity.sub !== pending.subject) {
      await this.deps.provider.release(step.grant);
      const approved = await this.account({ sub: pending.subject });
      this.deps.logger.warn('security event: second-factor enrolment refused', { user_id: approved?.user_id ?? null, request_id: context.requestId });
      return refused('enrolment_not_open');
    }
    if (step.kind === 'authenticated') {
      const account = await this.account({ sub: step.identity.sub });
      if (account !== undefined) {
        await this.audit(account.user_id, 'mfa_enrolled', context.requestId, 'totp');
      }
    }
    return this.after(step, pending.email, { began: pending.began, step: 'mfa_setup' }, context);
  }

  /**
   * The code step. A step begun at or before a reset of the typed address's account is refused before the provider is
   * asked (docs/adr/0093, D5): it counts no failure and uses up no code after the reset. The password was proved for
   * this step, so the refusal tells its holder nothing the old password's own refusal does not.
   */
  async answerTotp(pending: Pending, code: string, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'mfa') {
      return refused('expired');
    }
    return this.guarded(context, refused('client_credential'), async () => {
      if (await this.stale([(await this.account({ email: pending.email }))?.user_id], pending.began, 'mfa', context)) {
        return refused('expired');
      }
      return this.after(await this.deps.provider.answerTotp(pending.challenge, code), pending.email, { began: pending.began, step: 'mfa' }, context);
    });
  }

  /** Hardware-key sign-in: the browser's request options. A locked account gets none. */
  async beginKey(email: string, context?: SignInContext): Promise<{ readonly options: PublicKeyCredentialRequestOptionsJSON; readonly pending: Pending } | FlowResult> {
    // The attempt's start, before the account is read and the provider asked (docs/adr/0093, D3).
    const began = await this.beganNow();
    const account = await this.account({ email });
    if (account?.locked === true) {
      return refused('locked');
    }
    return this.guarded<{ readonly options: PublicKeyCredentialRequestOptionsJSON; readonly pending: Pending } | FlowResult>(context, refused('client_credential'), async () => {
      const { options, challenge } = await this.deps.provider.beginKeySignIn(email);
      return { options, pending: { step: 'key', email, challenge, began } };
    });
  }

  /**
   * The key's assertion. Nothing is decided here before the provider has verified it (docs/adr/0093, D5): the key step
   * is sealed for any typed address with no proof, so a refusal before a valid assertion would tell an outsider that
   * the address has an account reset inside the step's life. A step with no start proves nothing and starts again; a
   * stale one is refused in authenticated(), after the assertion.
   */
  async completeKey(pending: Pending, response: AuthenticationResponseJSON, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'key' || pending.began === undefined) {
      return refused('expired');
    }
    return this.guarded(context, refused('client_credential'), async () =>
      this.after(await this.deps.provider.completeKeySignIn(pending.challenge, response), pending.email, { began: pending.began, step: 'key' }, context),
    );
  }

  /** A key-registration step begun at or before a reset is refused before the provider is asked, and its grant given back (docs/adr/0093, D5). */
  private async registrationStale(pending: Extract<Pending, { step: 'register_key' }>, context: SignInContext | undefined): Promise<boolean> {
    if (!(await this.stale([pending.userId, pending.addressUserId], pending.began, 'register_key', context))) {
      return false;
    }
    await this.guarded(context, undefined, () => this.deps.provider.release(pending.grant));
    return true;
  }

  async beginKeyRegistration(pending: Pending, context?: SignInContext): Promise<{ readonly options: PublicKeyCredentialCreationOptionsJSON; readonly pending: Pending } | FlowResult> {
    if (pending.step !== 'register_key') {
      return refused('expired');
    }
    if (await this.registrationStale(pending, context)) {
      return refused('expired');
    }
    const { options, challenge } = await this.deps.provider.beginKeyRegistration(pending.grant);
    return { options, pending: { ...pending, challenge } };
  }

  async completeKeyRegistration(pending: Pending, response: RegistrationResponseJSON, context: SignInContext): Promise<FlowResult> {
    if (pending.step !== 'register_key' || pending.challenge === undefined) {
      return refused('expired');
    }
    if (await this.registrationStale(pending, context)) {
      return refused('expired');
    }
    if (!(await this.deps.provider.completeKeyRegistration(pending.grant, pending.challenge, response))) {
      return refused('key_not_registered');
    }
    // The provider holds the key from here. Whatever follows, the grant is given back and nothing leaves without the
    // key's line or its audit record (review SEC-S3 of 2026-11-11).
    let result: FlowResult;
    try {
      result = await this.keyRegistered(pending, response.id, context);
    } catch (error) {
      try {
        await this.guarded(context, undefined, () => this.deps.provider.release(pending.grant));
      } catch {
        // The first error is the one that leaves; the tokens lapse on their own.
      }
      throw error;
    }
    // The key is registered whatever the revoke answers; a refused credential is still logged.
    await this.guarded(context, undefined, () => this.deps.provider.release(pending.grant));
    return result;
  }

  /** What a key the provider has just registered becomes: audited, or, across a password reset, removed or locked and reported (docs/adr/0093, D6). */
  private async keyRegistered(pending: Extract<Pending, { step: 'register_key' }>, credentialId: string, context: SignInContext): Promise<FlowResult> {
    // The check above read the committed mark, so a registration already at the provider when a reset commits still
    // registers, and the reset's provider sign-out comes after its commit (docs/adr/0093, D6). Judged once more; a
    // judgement that throws is read as a refusal, the safer side.
    let across: Judgement[];
    let unjudged = false;
    try {
      across = await this.judged([pending.userId, pending.addressUserId], pending.began, 'key_registered', context);
    } catch {
      across = [];
      unjudged = true;
    }
    if (!unjudged && across.length === 0) {
      await this.audit(pending.userId, 'hardware_key_registered', context.requestId, 'webauthn');
      return { kind: 'key_registered' };
    }
    // A key registered across the reset is removed, best effort. The reset's own sign-out has usually ended the
    // token that could remove it (review SEC-B1), so a key that stays locks its account: it then signs in to
    // nothing until a platform administrator has had it removed and unlocks the account. Reported either way.
    let removed = false;
    try {
      removed = await this.deps.provider.removeHardwareKey(pending.grant, credentialId);
    } catch (error) {
      if (error instanceof ClientCredentialError) {
        this.deps.logger.error('security event: client credential refused', { request_id: context.requestId, error_code: error.code });
      }
    }
    let outcome: 'removed' | 'not_removed' | 'not_removed_not_locked' = removed ? 'removed' : 'not_removed';
    if (!removed) {
      const evidenced = across.filter((judgement) => judgement.why === 'before_reset').map((judgement) => judgement.userId);
      try {
        // The database locks only an account whose registration across the reset it has on record; with no such
        // record (the judgement threw, or refused for another reason) it refuses, and the line says not locked.
        for (const userId of evidenced.length > 0 ? evidenced : [pending.userId]) {
          await this.query<{ locked: boolean }>('SELECT sign_in_lock_key_across_reset($1, $2) AS locked', [userId, context.requestId]);
        }
      } catch {
        outcome = 'not_removed_not_locked';
      }
    }
    this.deps.logger.error('security event: hardware key registered across a password reset', { user_id: pending.userId, request_id: context.requestId, error_code: outcome });
    if (!removed) {
      // Audited as registered only if it is still there.
      await this.audit(pending.userId, 'hardware_key_registered', context.requestId, 'webauthn');
    }
    return refused('expired');
  }

  /**
   * A forgotten password: asks the provider to mail a code, and answers with the reset step for the typed address, alike
   * for every address (docs/adr/0081, the forgotten password; review SEC-B1, SEC-N2). The code is asked for only for an
   * active account with a second factor: an account with none would be offered enrolment after a reset, so a mailbox
   * would be enough to take it. A locked account still gets one: the lock stays after the reset. The request is
   * recorded for every account, the actor being the account named, not a proven person (`unverified_request`); an
   * unknown address has no actor and records nothing. A failed send or audit write is logged at error with IDs only and
   * answered like every other path: only an account reaches either, so a different answer would mark the accounts
   * whenever the provider fails (review S-3; ADR 0081 A2). Each account's request is also logged by its user ID, so
   * the operator hears of one account's requests piling up (ADR 0088, D7); an unknown address logs none. Every path, a thrown one included, takes at least the floor,
   * and the wait comes after every connection is given back.
   */
  async requestPasswordReset(email: string, context: SignInContext): Promise<Extract<Pending, { step: 'reset' }>> {
    const started = this.now();
    try {
      const account = await this.account({ email });
      if (account?.status === 'active' && account.mfa_enrolled) {
        await this.unlessFailed(context, () => this.deps.provider.requestPasswordReset(email, context.requestId));
      }
      if (account !== undefined) {
        const userId = account.user_id;
        // Each account's request, by its ID alone, sent or not: the per-user alarm counts these (ADR 0088, D7).
        this.deps.logger.info('password reset requested', { user_id: userId, request_id: context.requestId });
        await this.unlessFailed(context, () => this.audit(userId, 'password_reset_requested', context.requestId, 'unverified_request'));
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

  /** A reset request's send or audit write: a failure is logged with IDs only and not rethrown (review S-3). */
  private async unlessFailed(context: SignInContext, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.deps.logger.error('password reset request failed', { request_id: context.requestId, error_code: errorCode(error) });
    }
  }

  /**
   * Sets a new password with the mailed code (docs/adr/0081, the forgotten password). The account is looked up first,
   * the provider asked second (docs/adr/0091, D15; review SEC-02 of 2026-11-11): a database that cannot be reached
   * throws from the lookup while the provider still holds the old password and the code is unspent, so the person tries
   * again, and nothing after the provider's answer needs the lookup, so a reset whose sessions cannot be ended, or whose
   * provider sign-out fails, is always logged by the user's ID. The lookup decides nothing before that answer: the
   * provider is asked for every address, with an account or none, and a refusal is answered alike for both. The code is
   * the authorization: a refused one is one answer, counts no failure and writes nothing (a count would mark real
   * accounts by timing and let anyone lock one). On a reset, one transaction as the account ends every session and
   * records the reset, retried once; then the provider signs the user out everywhere, its failure logged and not
   * failing the reset (review SEC-N1). The lock and the second factor stay: a reset proves the mailbox, nothing more.
   */
  async confirmPasswordReset(email: string, code: string, password: string, context: SignInContext): Promise<ResetResult> {
    // A lookup that throws leaves from here, with nothing changed at the provider; its row is not read until the
    // provider has reset.
    const account = await this.account({ email });
    const result = await this.guarded<PasswordResetResult | { readonly kind: 'client_credential' }>(context, { kind: 'client_credential' }, () =>
      this.deps.provider.confirmPasswordReset(email, code, password),
    );
    if (result.kind === 'client_credential') {
      return result;
    }
    if (result.kind === 'rejected') {
      this.deps.logger.warn('password reset code refused', { request_id: context.requestId, error_code: 'rejected' });
      return result;
    }
    if (result.kind === 'invalid_password') {
      return result;
    }
    if (result.kind === 'outcome_unknown') {
      // The provider did not say whether the password changed (docs/adr/0093, D9). The safer reading: the person is
      // never told the code was wrong; where the address names an account its sessions end and its mark moves, as
      // after a reset, but no password-changed email is queued (its words would claim a change nobody has proved);
      // and this line pages the operator, who finds out and tells the person another way.
      this.deps.logger.error('security event: password reset outcome unknown', { user_id: account?.user_id ?? null, request_id: context.requestId, error_code: result.code });
      if (account !== undefined) {
        await this.endedByReset(account, 'password_reset_outcome_unknown', 'unverified_code', context);
      }
      return { kind: 'outcome_unknown' };
    }
    if (account === undefined) {
      return { kind: 'reset', locked: false, keepEmail: false };
    }
    if (!(await this.endedByReset(account, 'password_reset_completed', 'email_code', context))) {
      return { kind: 'sessions_not_ended' };
    }
    this.deps.logger.warn('security event: password reset completed', { user_id: account.user_id, request_id: context.requestId });
    return { kind: 'reset', locked: account.locked, keepEmail: !account.locked && account.status !== 'disabled' };
  }

  /**
   * What a reset does to the account, or a reset that may have happened: one transaction as the account takes its row
   * lock first (docs/adr/0093, D2), ends every session and records the event, on which the database moves the
   * account's mark and ends its sessions itself (D1); retried once, a second failure logged (review R-3). Then the
   * provider signs the user out everywhere, its failure logged and never failing the reset (review SEC-N1). Answers
   * whether the sessions ended and the event was recorded.
   */
  private async endedByReset(account: Account, action: 'password_reset_completed' | 'password_reset_outcome_unknown', purpose: string, context: SignInContext): Promise<boolean> {
    let ended = false;
    for (let attempt = 0; attempt < 2 && !ended; attempt += 1) {
      try {
        await withActor(this.deps.pool, account.user_id, async (scope) => {
          await lockAccountForSignIn(scope);
          await revokeUserSessions(scope, account.user_id);
          await recordAuditEvent(scope, { action, objectType: 'user', objectId: account.user_id, purpose, requestId: context.requestId });
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
    return ended;
  }

  /**
   * The person left the step (Start again, docs/adr/0081): key registration's grant is given back, as every other way
   * out of that step gives it back. The other steps hold only a challenge, which the provider ends at its own limit and
   * which nothing can answer once the cookie that seals it is gone; the reset step holds not even that.
   */
  async abandon(pending: Pending, context?: SignInContext): Promise<void> {
    switch (pending.step) {
      case 'register_key':
        await this.guarded(context, undefined, () => this.deps.provider.release(pending.grant));
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
