import { z } from 'zod';

import { clearPending, readPending, writePending, writeSession } from '../auth/pending';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '../auth/provider';
import { DEVICE_COOKIE, SIGN_IN_COOKIE } from '../auth/sessions';
import type { FlowResult, Pending, SignInContext } from '../auth/sign-in';
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
] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

const reasonParams = z.object({ reason: z.enum(SIGN_IN_REASONS).optional() });
const noParams = z.object({});

/**
 * What a sign-in step returns to the browser: where to go next, or what went wrong, with the field at fault when
 * naming it leaks nothing (the form shows it as an issue on that field).
 */
export type StepResult = { readonly redirect: string } | { readonly error: string; readonly locked?: boolean; readonly issues?: readonly Issue[] };

const MESSAGES = {
  credentials: 'That did not match. Check the email, the password or the code, and try again.',
  locked: 'This account is locked after ten failed attempts. A platform administrator can unlock it.',
  no_account: 'That did not match. Check the email, the password or the code, and try again.',
  key_not_registered: 'The hardware key was not registered. Try again with the key connected.',
  invitation_expired: 'This invitation has expired. Ask your organization’s administrator to send it again.',
} as const;

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
 * Applies a flow result: writes or clears the cookies and says where the browser goes. A step that proved the
 * credentials passes `credentials`, the issue a `credentials` refusal names in place of the first step's vague words.
 */
async function settle(context: PublicContext<unknown, unknown>, result: FlowResult, options: { readonly credentials?: Issue } = {}): Promise<StepResult> {
  const { cookies } = context.request;
  const { sealer, signIn } = context.services;
  const now = context.services.now();
  switch (result.kind) {
    case 'pending': {
      let pending = result.pending;
      if (pending.step === 'mfa_setup' && pending.totp === undefined) {
        const setup = await signIn.beginTotpSetup(pending);
        if (setup.kind !== 'pending') {
          return settle(context, setup, options);
        }
        pending = setup.pending;
      }
      writePending(cookies, sealer, pending, now);
      return { redirect: STEP_PAGES[pending.step] };
    }
    case 'signed_in':
      writeSession(cookies, result.session);
      return { redirect: '/' };
    case 'invalid_password':
      writePending(cookies, sealer, result.pending, now);
      return { error: 'Choose a stronger password.', issues: [passwordIssue(result.problems)] };
    case 'key_registered':
      clearPending(cookies);
      return { redirect: '/sign-in/hardware-key?reason=key_registered' };
    case 'refused':
      switch (result.reason) {
        case 'expired':
          clearPending(cookies);
          return { redirect: '/sign-in?reason=step_expired' };
        case 'hardware_key_required':
          clearPending(cookies);
          return { redirect: '/sign-in/hardware-key?reason=hardware_key_required' };
        case 'locked':
          clearPending(cookies);
          return { error: MESSAGES.locked, locked: true };
        case 'credentials':
          return options.credentials === undefined ? { error: MESSAGES.credentials } : { error: 'That did not match.', issues: [options.credentials] };
        case 'no_account':
        case 'key_not_registered':
        case 'invitation_expired':
          return { error: MESSAGES[result.reason] };
      }
  }
}

/** The pending step, or a redirect to the start when there is none of the expected kind. */
function pendingOf<S extends Pending['step']>(context: PublicContext<unknown, unknown>, step: S): Extract<Pending, { step: S }> | undefined {
  const pending = readPending(context.request.cookies, context.services.sealer, context.services.now());
  return pending?.step === step ? (pending as Extract<Pending, { step: S }>) : undefined;
}

const RESTART: StepResult = { redirect: '/sign-in?reason=step_expired' };

/** A step after the password names its account by the pending step the browser carries (rate limits per account). */
const pendingAccount = (_input: unknown, request: RouteRequest): string | undefined => request.cookies.get(SIGN_IN_COOKIE);

export const signInPage = publicRoute({
  id: 'sign_in.page',
  kind: 'page',
  path: '/sign-in',
  phi: false,
  params: reasonParams,
  handle: ({ params }) => Promise.resolve({ reason: params.reason ?? null }),
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
  handle: async (context) => settle(context, await context.services.signIn.start(context.input.email, context.input.password, contextOf(context))),
});

export const newPasswordPage = publicRoute({
  id: 'sign_in.new_password_page',
  kind: 'page',
  path: '/sign-in/new-password',
  phi: false,
  params: noParams,
  handle: (context) => {
    const pending = pendingOf(context, 'new_password');
    return Promise.resolve(pending === undefined ? RESTART : { email: pending.email });
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
    return pending === undefined ? RESTART : settle(context, await context.services.signIn.newPassword(pending, context.input.password, contextOf(context)));
  },
});

export const enrollPage = publicRoute({
  id: 'sign_in.enroll_page',
  kind: 'page',
  path: '/sign-in/enroll',
  phi: false,
  params: noParams,
  handle: (context) => {
    const pending = pendingOf(context, 'mfa_setup');
    return Promise.resolve(pending?.totp === undefined ? RESTART : { email: pending.email, secret: pending.totp.secret, uri: pending.totp.uri });
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
    return pending === undefined ? RESTART : settle(context, await context.services.signIn.completeTotpSetup(pending, context.input.code, contextOf(context)), { credentials: WRONG_CODE });
  },
});

export const mfaPage = publicRoute({
  id: 'sign_in.mfa_page',
  kind: 'page',
  path: '/sign-in/mfa',
  phi: false,
  params: noParams,
  handle: (context) => {
    const pending = pendingOf(context, 'mfa');
    return Promise.resolve(pending === undefined ? RESTART : { email: pending.email });
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
    return pending === undefined ? RESTART : settle(context, await context.services.signIn.answerTotp(pending, context.input.code, contextOf(context)), { credentials: WRONG_CODE });
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
    const begun = await context.services.signIn.beginKey(context.input.email);
    if ('kind' in begun) {
      const settled = await settle(context, begun);
      return 'error' in settled ? settled : { error: MESSAGES.credentials };
    }
    writePending(context.request.cookies, context.services.sealer, begun.pending, context.services.now());
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
      ? RESTART
      : settle(context, await context.services.signIn.completeKey(pending, context.input.response as unknown as AuthenticationResponseJSON, contextOf(context)));
  },
});

export const registerKeyPage = publicRoute({
  id: 'sign_in.register_key_page',
  kind: 'page',
  path: '/sign-in/register-key',
  phi: false,
  params: noParams,
  handle: (context) => {
    const pending = pendingOf(context, 'register_key');
    return Promise.resolve(pending === undefined ? RESTART : { email: pending.email });
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
    const begun = await context.services.signIn.beginKeyRegistration(pending);
    if ('kind' in begun) {
      return settle(context, begun);
    }
    writePending(context.request.cookies, context.services.sealer, begun.pending, context.services.now());
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
      : settle(context, await context.services.signIn.completeKeyRegistration(pending, context.input.response as unknown as RegistrationResponseJSON, contextOf(context)));
  },
});

export const SIGN_IN_ROUTES = [
  signInPage,
  signInWithPassword,
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
