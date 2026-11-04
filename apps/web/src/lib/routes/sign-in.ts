import { z } from 'zod';

import {
  type PasswordToUse,
  type SealedPending,
  type StepMeta,
  clearKeptEmail,
  clearPending,
  clearSignIn,
  readKeptEmail,
  readPending,
  stepClosesAt,
  stepMetaOf,
  writeKeptEmail,
  writePending,
  writeSession,
} from '../auth/pending';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '../auth/provider';
import { DEVICE_COOKIE, SIGN_IN_COOKIE } from '../auth/sessions';
import type { FlowResult, Pending, SignInContext } from '../auth/sign-in';
import { stepSeconds, warningSeconds } from '../auth/step-limits';
import { cookieToken } from '../auth/tokens';
import { listed } from '../copy/words';
import { publicRoute } from '../http/invoke';
import type { Issue, PublicContext, RouteRequest } from '../http/route';
import { emailAddress, sixDigitCode } from './schemas';

/**
 * Sign-in and MFA (PRD 7): email and password, a new password on first sign-in, TOTP enrollment and
 * challenge, and the hardware key (WebAuthn) that internal roles must use. Public routes: they need no
 * session, open no practice scope and read no tenant table; each step writes its own audit events
 * through the sign-in flow (src/lib/auth/sign-in.ts). A step is guarded by its sealed, single-use
 * provider challenge rather than a request key: a replayed code or assertion is refused. The
 * hardware-key ceremonies are JSON route handlers, which the browser's WebAuthn calls sit between.
 * Each step closes at the limit it states (src/lib/auth/step-limits.ts; docs/adr/0081), counted from
 * the moment before the provider was asked for its challenge: past it, every page and press of the step
 * starts again without asking the provider, and the sign-in page fills in the kept email.
 */

/** Why the sign-in screen is shown, as a code in the URL (never an identifier). */
export const SIGN_IN_REASONS = [
  'signed_out',
  'idle',
  'expired',
  'ended',
  'device_revoked',
  'user_disabled',
  'mfa_required',
  'step_expired',
  'hardware_key_required',
  'key_registered',
  'locked',
  'restarted',
] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];
/** Which password a restart takes, as the sign-in page is told it. */
export type { PasswordToUse };

const reasonParams = z.object({ reason: z.enum(SIGN_IN_REASONS).optional() });
const noParams = z.object({});

/**
 * What a sign-in step returns to the browser: where to go next, or what went wrong, with the field at fault when
 * naming it leaks nothing (the form shows it as an issue on that field). `final`: no press of this form can succeed,
 * whatever is typed (an expired invitation, refused before any password is checked), so the emptied password's note
 * asks for nothing (docs/adr/0077, D2); a lock says so by `locked`. Never on a refusal whose words are a wrong
 * password's, which would tell which addresses have accounts.
 */
export type StepResult = { readonly redirect: string } | { readonly error: string; readonly locked?: boolean; readonly final?: boolean; readonly issues?: readonly Issue[] };

const MESSAGES = {
  credentials: 'That did not match. Check the email, the password or the code, and try again.',
  locked: 'This account is locked after ten failed attempts. A platform administrator can unlock it.',
  no_account: 'That did not match. Check the email, the password or the code, and try again.',
  key_not_registered: 'The hardware key was not registered. Try again with the key connected.',
  invitation_expired: 'This invitation has expired. Ask your organization’s administrator to send it again.',
} as const;

/** What a timed step's page is given for its timer: its limit, its warning, and when it closes (absent with no stamp). */
export interface StepTime {
  readonly limitSeconds: number;
  readonly warningSeconds: number;
  /** The server's deadline, epoch ms on its clock. */
  readonly closesAt?: number;
  /** Milliseconds left when the page was rendered: always positive, since a step at its limit is refused. */
  readonly closesIn?: number;
}

/** An invited person's setup step, numbered; null when the step is not numbered. */
export type SetupMarker = { readonly at: number; readonly of: number } | null;

const STEP_PAGES: Readonly<Record<Pending['step'], string>> = {
  new_password: '/sign-in/new-password',
  mfa_setup: '/sign-in/enroll',
  mfa: '/sign-in/mfa',
  key: '/sign-in/hardware-key',
  register_key: '/sign-in/register-key',
};

function contextOf(context: PublicContext<unknown, unknown>): SignInContext {
  return { deviceToken: cookieToken(context.request.cookies.get(DEVICE_COOKIE)), userAgent: context.request.userAgent, requestId: context.request.requestId };
}

/**
 * The code steps' refusal of a wrong code. They run only with the sealed pending cookie, which proves the email and
 * password, so naming the code as the wrong part leaks nothing; the first step never names a field (account
 * enumeration).
 */
const WRONG_CODE: Issue = { field: 'code', message: 'enter the code your authenticator app shows now' };

/** The new-password step's refusal by the policy: what the password still lacks, or the user pool's own refusal. */
function passwordIssue(problems: readonly string[]): Issue {
  return { field: 'password', message: problems.length === 0 ? 'the sign-in service refused it: choose a different password' : `it still needs ${listed(problems)}` };
}

/**
 * Which setup step a new step is, counted by the server: from the provider's answer (a new password is followed by
 * enrolment), the account (`keyRequired`: key registration follows) and the step it came from. Never from the request.
 */
function setupOf(step: Pending['step'], from: SealedPending | undefined, keyRequired: boolean): StepMeta['setup'] {
  const next = from?.setup === undefined ? undefined : { at: from.setup.at + 1, of: from.setup.of };
  switch (step) {
    case 'new_password':
      return { at: 1, of: keyRequired ? 3 : 2 };
    case 'mfa_setup':
      return next ?? (keyRequired ? { at: 1, of: 2 } : undefined);
    case 'register_key':
      return next;
    case 'mfa':
    case 'key':
      return undefined;
  }
}

interface SettleOptions {
  /** The issue a `credentials` refusal names in place of the first step's vague words, for a step that proved them. */
  readonly credentials?: Issue;
  /** When the provider was asked (epoch ms, taken before the call): a new step's limit counts from here. */
  readonly at: number;
  /** The sealed step this result came from: a rewrite keeps its meta, and the next step's number follows it. */
  readonly from?: SealedPending;
}

/**
 * Applies a flow result: writes or clears the cookies and says where the browser goes. A new step is stamped with
 * `at`; once the provider has accepted the password, the email is kept for a restart, written before enrolment's
 * setup key is asked for, so a step that closes on that call already says which password now works.
 */
async function settle(context: PublicContext<unknown, unknown>, result: FlowResult, options: SettleOptions): Promise<StepResult> {
  const { cookies } = context.request;
  const { sealer, signIn } = context.services;
  const now = context.services.now();
  const { from } = options;
  switch (result.kind) {
    case 'pending': {
      let pending = result.pending;
      const passwordSaved = from?.step === 'new_password' || from?.passwordSaved === true;
      const setup = setupOf(pending.step, from, result.keyRequired === true);
      const meta: StepMeta = { startedAt: options.at, ...(setup === undefined ? {} : { setup }), ...(passwordSaved ? { passwordSaved: true } : {}) };
      if (pending.step !== 'key') {
        const use: PasswordToUse | undefined = pending.step === 'new_password' ? 'temporary' : passwordSaved ? 'chosen' : undefined;
        writeKeptEmail(cookies, sealer, { email: pending.email, ...(use === undefined ? {} : { use }) }, pending.step, options.at, now);
      }
      if (pending.step === 'mfa_setup' && pending.totp === undefined) {
        const begun = await signIn.beginTotpSetup(pending);
        if (begun.kind !== 'pending') {
          return settle(context, begun, options);
        }
        pending = begun.pending;
      }
      writePending(cookies, sealer, pending, meta, now);
      return { redirect: STEP_PAGES[pending.step] };
    }
    case 'signed_in':
      writeSession(cookies, result.session);
      return { redirect: '/' };
    case 'invalid_password':
      writePending(cookies, sealer, result.pending, from === undefined ? {} : stepMetaOf(from), now);
      return { error: 'Choose a stronger password.', issues: [passwordIssue(result.problems)] };
    case 'key_registered':
      clearSignIn(cookies);
      return { redirect: '/sign-in/hardware-key?reason=key_registered' };
    case 'refused':
      switch (result.reason) {
        case 'expired':
          // The kept email outlives an expiry: that is what it is for. A key step goes back to the key surface (UXS-01).
          clearPending(cookies);
          return from?.step === 'key' ? KEY_RESTART : RESTART;
        case 'hardware_key_required':
          clearSignIn(cookies);
          return { redirect: '/sign-in/hardware-key?reason=hardware_key_required' };
        case 'locked':
          clearSignIn(cookies);
          return { error: MESSAGES.locked, locked: true };
        case 'credentials':
          return options.credentials === undefined ? { error: MESSAGES.credentials } : { error: 'That did not match.', issues: [options.credentials] };
        case 'invitation_expired':
          return { error: MESSAGES.invitation_expired, final: true };
        case 'no_account':
          // The account was disabled or removed after the password: the attempt has ended, and the kept email with it.
          clearSignIn(cookies);
          return { error: MESSAGES.no_account };
        case 'key_not_registered':
          return { error: MESSAGES.key_not_registered };
      }
  }
}

/** Runs a flow call and settles it, stamping a new step with the time taken before the provider was asked. */
async function advance(
  context: PublicContext<unknown, unknown>,
  from: SealedPending | undefined,
  run: () => Promise<FlowResult>,
  options: { readonly credentials?: Issue } = {},
): Promise<StepResult> {
  const at = context.services.now().getTime();
  return settle(context, await run(), { ...options, at, ...(from === undefined ? {} : { from }) });
}

/**
 * The pending step, or nothing (a redirect to the start) when there is none of the expected kind, or it has reached
 * its limit: refused before any provider call, as a missing cookie is, so it counts no failure.
 */
function pendingOf<S extends Pending['step']>(
  context: PublicContext<unknown, unknown>,
  step: S,
  now: Date = context.services.now(),
): (Extract<Pending, { step: S }> & StepMeta) | undefined {
  const pending = readPending(context.request.cookies, context.services.sealer, now);
  if (pending?.step !== step) {
    return undefined;
  }
  const closesAt = stepClosesAt(pending);
  return closesAt !== undefined && now.getTime() >= closesAt ? undefined : (pending as Extract<Pending, { step: S }> & StepMeta);
}

/**
 * What a timed step's page is given beside its own data: the limit, the warning and the deadline, and the marker.
 * `now` is the time `pendingOf` checked the step against, so the time left it states is never zero or less.
 */
function stepPage(pending: SealedPending, now: Date): { readonly time: StepTime; readonly setup: SetupMarker } {
  const limitSeconds = stepSeconds(pending.step);
  const closesAt = stepClosesAt(pending);
  const deadline = closesAt === undefined ? {} : { closesAt, closesIn: closesAt - now.getTime() };
  const setup = pending.setup !== undefined && pending.setup.of >= 2 ? { at: pending.setup.at, of: pending.setup.of } : null;
  return { time: { limitSeconds, warningSeconds: warningSeconds(limitSeconds), ...deadline }, setup };
}

const RESTART: StepResult = { redirect: '/sign-in?reason=step_expired' };
/** Where a closed hardware-key step goes: the key surface, which says the step closed, never the password page (UXS-01). */
const KEY_RESTART: StepResult = { redirect: '/sign-in/hardware-key?reason=step_expired' };

/** Where Start again lands: the sign-in page, which fills in the kept email. */
export const RESTARTED = { redirect: '/sign-in?reason=restarted' } as const satisfies StepResult;

/** A step after the password names its account by the pending step the browser carries (rate limits per account). */
const pendingAccount = (_input: unknown, request: RouteRequest): string | undefined => request.cookies.get(SIGN_IN_COOKIE);

export const signInPage = publicRoute({
  id: 'sign_in.page',
  kind: 'page',
  path: '/sign-in',
  phi: false,
  params: reasonParams,
  handle: (context) => {
    const reason = context.params.reason ?? null;
    // The kept email fills the form only after a step closed or the person chose to start again; never otherwise.
    const kept = reason === 'step_expired' || reason === 'restarted' ? readKeptEmail(context.request.cookies, context.services.sealer, context.services.now()) : undefined;
    return Promise.resolve({ reason, email: kept?.email ?? null, use: kept?.use ?? null });
  },
});

export const signInWithPassword = publicRoute({
  id: 'sign_in.password',
  kind: 'action',
  path: '/sign-in',
  rateLimit: 'sign_in',
  rateAccount: (input) => input.email,
  phi: false,
  params: noParams,
  input: z.object({ email: emailAddress, password: z.string().min(1, 'fill this in').max(256) }),
  handle: (context) =>
    advance(context, undefined, async () => {
      const result = await context.services.signIn.start(context.input.email, context.input.password, contextOf(context));
      // Every first step that opens no step ends the attempt before it, alike for any address (enumeration).
      if (result.kind !== 'pending') {
        clearSignIn(context.request.cookies);
      }
      return result;
    }),
});

/**
 * Start again (docs/adr/0081, D6): ends the step the person is leaving before the sign-in page renders, so its setup
 * key, its code challenge or its key-registration grant (given back to the provider) opens nothing for whoever presses
 * Back next. The kept email stays: filling it in is what Start again is for. A POST from the step's own form,
 * origin-checked as every sign-in step is, and counted like the steps after the password (by the pending step it
 * names, never an account). It records no audit event, as a step that closes at its limit records none. When that rate
 * limit refuses it (a person who spent the step's count on codes or key ceremonies), the step's cookie still goes, so
 * Back opens nothing; only giving a grant back to the provider waits, and the grant lapses at the step's limit.
 */
const restartRoute = publicRoute({
  id: 'sign_in.restart',
  kind: 'action',
  path: '/sign-in/restart',
  rateLimit: 'mfa',
  rateAccount: pendingAccount,
  phi: false,
  params: noParams,
  input: noParams,
  handle: async (context) => {
    const { cookies } = context.request;
    const pending = readPending(cookies, context.services.sealer, context.services.now());
    clearPending(cookies);
    if (pending !== undefined) {
      await context.services.signIn.abandon(pending);
    }
    return RESTARTED;
  },
});

export const restartSignIn: typeof restartRoute = {
  ...restartRoute,
  invoke: async (request, services) => {
    const outcome = await restartRoute.invoke(request, services);
    if (outcome.status === 'rate_limited') {
      clearPending(request.cookies);
    }
    return outcome;
  },
};

export const newPasswordPage = publicRoute({
  id: 'sign_in.new_password_page',
  kind: 'page',
  path: '/sign-in/new-password',
  phi: false,
  params: noParams,
  handle: (context) => {
    const now = context.services.now();
    const pending = pendingOf(context, 'new_password', now);
    return Promise.resolve(pending === undefined ? RESTART : { email: pending.email, ...stepPage(pending, now) });
  },
});

export const chooseNewPassword = publicRoute({
  id: 'sign_in.new_password',
  kind: 'action',
  path: '/sign-in/new-password',
  rateLimit: 'sign_in',
  rateAccount: pendingAccount,
  phi: false,
  params: noParams,
  input: z
    .object({ password: z.string().min(1, 'fill this in').max(256), confirm: z.string().max(256) })
    .refine((value) => value.password === value.confirm, { path: ['confirm'], message: 'the two passwords do not match: type the same password in both fields' }),
  handle: async (context) => {
    const pending = pendingOf(context, 'new_password');
    return pending === undefined ? RESTART : advance(context, pending, () => context.services.signIn.newPassword(pending, context.input.password, contextOf(context)));
  },
});

export const enrollPage = publicRoute({
  id: 'sign_in.enroll_page',
  kind: 'page',
  path: '/sign-in/enroll',
  phi: false,
  params: noParams,
  handle: (context) => {
    const now = context.services.now();
    const pending = pendingOf(context, 'mfa_setup', now);
    return Promise.resolve(pending?.totp === undefined ? RESTART : { email: pending.email, secret: pending.totp.secret, uri: pending.totp.uri, ...stepPage(pending, now) });
  },
});

export const enrollTotp = publicRoute({
  id: 'sign_in.enroll',
  kind: 'action',
  path: '/sign-in/enroll',
  rateLimit: 'mfa',
  rateAccount: pendingAccount,
  phi: false,
  params: noParams,
  input: z.object({ code: sixDigitCode }),
  handle: async (context) => {
    const pending = pendingOf(context, 'mfa_setup');
    return pending === undefined ? RESTART : advance(context, pending, () => context.services.signIn.completeTotpSetup(pending, context.input.code, contextOf(context)), { credentials: WRONG_CODE });
  },
});

export const mfaPage = publicRoute({
  id: 'sign_in.mfa_page',
  kind: 'page',
  path: '/sign-in/mfa',
  phi: false,
  params: noParams,
  handle: (context) => {
    const now = context.services.now();
    const pending = pendingOf(context, 'mfa', now);
    return Promise.resolve(pending === undefined ? RESTART : { email: pending.email, ...stepPage(pending, now) });
  },
});

export const answerMfa = publicRoute({
  id: 'sign_in.mfa',
  kind: 'action',
  path: '/sign-in/mfa',
  rateLimit: 'mfa',
  rateAccount: pendingAccount,
  phi: false,
  params: noParams,
  input: z.object({ code: sixDigitCode }),
  handle: async (context) => {
    const pending = pendingOf(context, 'mfa');
    return pending === undefined ? RESTART : advance(context, pending, () => context.services.signIn.answerTotp(pending, context.input.code, contextOf(context)), { credentials: WRONG_CODE });
  },
});

export const hardwareKeyPage = publicRoute({
  id: 'sign_in.hardware_key_page',
  kind: 'page',
  path: '/sign-in/hardware-key',
  phi: false,
  params: reasonParams,
  handle: ({ params }) => Promise.resolve({ reason: params.reason ?? null }),
});

export type KeyOptionsResult = { readonly options: PublicKeyCredentialRequestOptionsJSON } | { readonly error: string; readonly locked?: boolean };

export const hardwareKeyOptions = publicRoute({
  id: 'sign_in.key_options',
  kind: 'handler',
  method: 'POST',
  path: '/api/sign-in/hardware-key/options',
  rateLimit: 'sign_in',
  rateAccount: (input) => input.email,
  phi: false,
  params: noParams,
  input: z.object({ email: emailAddress }),
  handle: async (context): Promise<KeyOptionsResult> => {
    // Any typed address reaches this step, so it ends a kept email and never writes one.
    clearKeptEmail(context.request.cookies);
    const at = context.services.now().getTime();
    const begun = await context.services.signIn.beginKey(context.input.email);
    if ('kind' in begun) {
      const settled = await settle(context, begun, { at });
      return 'error' in settled ? settled : { error: MESSAGES.credentials };
    }
    writePending(context.request.cookies, context.services.sealer, begun.pending, { startedAt: at }, context.services.now());
    return { options: begun.options };
  },
});

/** A WebAuthn response, as the browser library serializes it. */
const credentialJson = z.string().max(16_384).transform((text, check) => {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed && 'response' in parsed) {
      return parsed;
    }
  } catch {
    // reported below
  }
  check.addIssue({ code: 'custom', message: 'a hardware-key response' });
  return z.NEVER;
});

export const verifyHardwareKey = publicRoute({
  id: 'sign_in.key_verify',
  kind: 'handler',
  method: 'POST',
  path: '/api/sign-in/hardware-key/verify',
  rateLimit: 'mfa',
  rateAccount: pendingAccount,
  phi: false,
  params: noParams,
  input: z.object({ response: credentialJson }),
  handle: async (context) => {
    const pending = pendingOf(context, 'key');
    return pending === undefined
      ? KEY_RESTART
      : advance(context, pending, () => context.services.signIn.completeKey(pending, context.input.response as unknown as AuthenticationResponseJSON, contextOf(context)));
  },
});

export const registerKeyPage = publicRoute({
  id: 'sign_in.register_key_page',
  kind: 'page',
  path: '/sign-in/register-key',
  phi: false,
  params: noParams,
  handle: (context) => {
    const now = context.services.now();
    const pending = pendingOf(context, 'register_key', now);
    return Promise.resolve(pending === undefined ? RESTART : { email: pending.email, ...stepPage(pending, now) });
  },
});

export type RegisterOptionsResult = { readonly options: PublicKeyCredentialCreationOptionsJSON } | StepResult;

export const hardwareKeyRegistrationOptions = publicRoute({
  id: 'sign_in.register_options',
  kind: 'handler',
  method: 'POST',
  path: '/api/sign-in/register-key/options',
  rateLimit: 'mfa',
  rateAccount: pendingAccount,
  phi: false,
  params: noParams,
  input: z.object({}),
  handle: async (context): Promise<RegisterOptionsResult> => {
    const pending = pendingOf(context, 'register_key');
    if (pending === undefined) {
      return RESTART;
    }
    const at = context.services.now().getTime();
    const begun = await context.services.signIn.beginKeyRegistration(pending);
    if ('kind' in begun) {
      return settle(context, begun, { at, from: pending });
    }
    // The same step with a new challenge: its start, and so its limit, stay where they were.
    writePending(context.request.cookies, context.services.sealer, begun.pending, stepMetaOf(pending), context.services.now());
    return { options: begun.options };
  },
});

export const registerHardwareKey = publicRoute({
  id: 'sign_in.register_verify',
  kind: 'handler',
  method: 'POST',
  path: '/api/sign-in/register-key/verify',
  rateLimit: 'mfa',
  rateAccount: pendingAccount,
  phi: false,
  params: noParams,
  input: z.object({ response: credentialJson }),
  handle: async (context) => {
    const pending = pendingOf(context, 'register_key');
    return pending === undefined
      ? RESTART
      : advance(context, pending, () => context.services.signIn.completeKeyRegistration(pending, context.input.response as unknown as RegistrationResponseJSON, contextOf(context)));
  },
});

export const SIGN_IN_ROUTES = [
  signInPage,
  signInWithPassword,
  restartSignIn,
  newPasswordPage,
  chooseNewPassword,
  enrollPage,
  enrollTotp,
  mfaPage,
  answerMfa,
  hardwareKeyPage,
  hardwareKeyOptions,
  verifyHardwareKey,
  registerKeyPage,
  hardwareKeyRegistrationOptions,
  registerHardwareKey,
] as const;
