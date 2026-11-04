import { Alert, AlertDescription, AlertTitle } from '@tp/ui';

import { ArrivalNotice } from '../../components/arrival-focus';
import type { ForgotPasswordReason, PasswordToUse, SignInReason } from '../../lib/routes/sign-in';

/** Why the user is signing in again, in words (the URL carries only the code); `locked`'s are built with the support address. */
const REASONS: Readonly<Record<Exclude<SignInReason, 'locked' | 'password_reset_locked'>, { readonly title: string; readonly text: string }>> = {
  signed_out: { title: 'Signed out', text: 'You have signed out.' },
  idle: { title: 'Session expired', text: 'You were signed out after 30 minutes without activity. Sign in again to continue.' },
  expired: { title: 'Session expired', text: 'Sessions last 12 hours. Sign in again to continue.' },
  ended: { title: 'Session ended', text: 'This session has ended. Sign in again to continue.' },
  device_revoked: { title: 'Device revoked', text: 'This device was revoked, which ended its sessions. Sign in again to use it.' },
  user_disabled: { title: 'Account disabled', text: 'This account is disabled. Ask your administrator.' },
  mfa_required: { title: 'Two-step verification required', text: 'Every account needs an authenticator app or a hardware key. Sign in to set it up.' },
  step_expired: { title: 'Sign-in step closed', text: 'That sign-in step closed. Start again from your email and password.' },
  hardware_key_required: { title: 'Hardware key required', text: 'Your role signs in with a hardware key. Use it below.' },
  key_registered: { title: 'Hardware key registered', text: 'Your hardware key is registered. Sign in with it now.' },
  restarted: { title: 'Start again', text: 'Start again from your email and password.' },
  password_reset: {
    title: 'Password changed',
    text: 'Your password is changed, and every session of this account has ended. Sign in with your new password and the code from your authenticator app. If you sign in with a hardware key, use it as before.',
  },
};

/** A reset's words when the proven address was kept and fills the Email field (review UXR-08, UXR-09). */
const RESET_KEPT =
  'Your password is changed, and every session of this account has ended. Your email is filled in: sign in with your new password and the code from your authenticator app. If you sign in with a hardware key, use it as before.';

/**
 * The locked notice (UX-066): the way out, by the support address. No address is on screen here, so it says "the address
 * you sign in with", not the refusal's "this address" (D-4). A reset never lifts the lock, so it is never offered.
 */
function locked(supportEmail: string): { readonly title: string; readonly text: string } {
  return { title: 'Account locked', text: `This account was locked after ten failed attempts. Write to ${supportEmail} from the address you sign in with to have it unlocked.` };
}

/** A locked account's reset (docs/adr/0081, the forgotten password): the lock stays, and the words say how to lift it. */
function resetLocked(supportEmail: string): { readonly title: string; readonly text: string } {
  return {
    title: 'Password changed',
    text: `Your password is changed, and every session of this account has ended. This account is locked after ten failed attempts: write to ${supportEmail} from the address you sign in with to have it unlocked.`,
  };
}

/** A reason's title and default words. */
function reasonOf(reason: SignInReason, supportEmail: string): { readonly title: string; readonly text: string } {
  if (reason === 'locked') {
    return locked(supportEmail);
  }
  return reason === 'password_reset_locked' ? resetLocked(supportEmail) : REASONS[reason];
}

/** The two reasons a person is back after a sign-in step: it closed, or they chose to start again (docs/adr/0081). */
type RestartReason = Extract<SignInReason, 'step_expired' | 'restarted'>;

const isRestart = (reason: SignInReason): reason is RestartReason => reason === 'step_expired' || reason === 'restarted';

/** The reasons a person arrives at after a step or a reset, whose notice takes the focus once (docs/adr/0081, A5). */
const isArrival = (reason: SignInReason): boolean => isRestart(reason) || reason === 'password_reset' || reason === 'password_reset_locked';

/** The restart reasons' words with the email kept, and on the hardware-key page, which never keeps one. */
const RESTARTS: Readonly<Record<RestartReason, { readonly kept: string; readonly key: string }>> = {
  step_expired: {
    kept: 'That sign-in step closed. Your email is filled in: type your password to start again.',
    key: 'That sign-in step closed. Start again with your hardware key.',
  },
  restarted: { kept: 'Your email is filled in: type your password to start again.', key: 'Start again with your hardware key.' },
};

/** Which password starts again: the invitation's while none was saved, the chosen one once it was. */
const PASSWORD_TO_USE: Readonly<Record<PasswordToUse, string>> = {
  temporary: 'Use the temporary password from your invitation.',
  chosen: 'Use the password you chose: the temporary one no longer works.',
};

/** The notice's words: the reason's, or after a step, the kept email's and which password, or the key's. */
function wordsOf(reason: SignInReason, kept: { readonly use: PasswordToUse | null } | undefined, surface: 'password' | 'key', supportEmail: string): string {
  if (reason === 'password_reset' && kept !== undefined) {
    return RESET_KEPT;
  }
  if (!isRestart(reason)) {
    return reasonOf(reason, supportEmail).text;
  }
  if (surface === 'key') {
    return RESTARTS[reason].key;
  }
  if (kept === undefined) {
    return REASONS[reason].text;
  }
  return kept.use === null ? RESTARTS[reason].kept : `${RESTARTS[reason].kept} ${PASSWORD_TO_USE[kept.use]}`;
}

/**
 * Why the person is on a sign-in page. `kept` is given only when the page filled in the email kept from a step (never
 * the address itself, which only the Email field holds); `surface` is the page: the password's, or the hardware key's;
 * `supportEmail` is PaidWhole's support address, which the locked words name (never the person's own).
 * After a step closed or was started again, or a forgotten password was reset, the notice is a note that takes the focus
 * once, so it is read on arrival, once (docs/adr/0081); every other reason is a polite status, which takes no focus.
 */
export function SignInNotice({
  reason,
  kept,
  surface = 'password',
  supportEmail,
}: {
  readonly reason: SignInReason | null;
  readonly kept?: { readonly use: PasswordToUse | null };
  readonly surface?: 'password' | 'key';
  readonly supportEmail: string;
}) {
  if (reason === null) {
    return null;
  }
  const { title } = reasonOf(reason, supportEmail);
  const text = wordsOf(reason, kept, surface, supportEmail);
  return isArrival(reason) ? (
    <ArrivalNotice reason={reason} title={title} text={text} />
  ) : (
    <Alert role="status" data-reason={reason}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/**
 * The forgot-password page's first phase, under its card's title (review UXR-06, UXR-13 b): the same for every address,
 * so the invited, who get no code, learn what to do here without the page telling accounts apart.
 */
export const RESET_REQUEST_DESCRIPTION =
  'Enter the email you sign in with. If it has an account, we send it a code for choosing a new password. Invited and not signed in yet? Use the temporary password from your invitation instead.';

/** The forgot page's reasons, each with the phase it belongs to (review UXR-12) and its words. */
const FORGOT_REASONS: Readonly<Record<ForgotPasswordReason, { readonly phase: 'request' | 'confirm'; readonly title: string; readonly text: string }>> = {
  code_sent: {
    phase: 'confirm',
    title: 'Check your email',
    text: 'If an account uses the address you typed, we sent it a six-digit code. It can take a few minutes: check your spam folder too.',
  },
  step_expired: { phase: 'request', title: 'Reset step closed', text: 'That step closed. Enter your email for a new code.' },
};

/**
 * Why the person is on the forgot-password page (docs/adr/0081, the forgotten password): "Check your email" in the
 * code's phase, the closed step in the request's, each a note focused once on arrival and shown only in its own phase,
 * so a Back or a bookmark to the other's shows the phase plainly (review UXR-12). The notice is keyed by the step's
 * start, so a successful Send a new code mounts it afresh and it takes the focus again (review UXR-05). It never holds
 * the address, which only the step's card shows.
 */
export function ForgotPasswordNotice({ phase, reason, startedAt }: { readonly phase: 'request' | 'confirm'; readonly reason: ForgotPasswordReason | null; readonly startedAt?: number }) {
  if (reason === null || FORGOT_REASONS[reason].phase !== phase) {
    return null;
  }
  const { title, text } = FORGOT_REASONS[reason];
  return <ArrivalNotice key={startedAt ?? 0} reason={reason} title={title} text={text} />;
}

/**
 * Below the code step's form: what to do when no email came, the same for every address (review UXR-06), so an address
 * with no account, or an invited one, reads as any other. The two bold items are the two buttons below the list.
 */
export function NoEmailList() {
  return (
    <div className="text-sm text-muted-foreground" data-slot="no-email">
      <div id="no-email-lead">No email?</div>
      <ul aria-labelledby="no-email-lead" className="mt-1 flex list-disc flex-col gap-1 pl-5">
        <li>Check your spam folder.</li>
        <li>
          Typed the wrong address: <strong className="font-semibold text-foreground">Use a different email</strong>.
        </li>
        <li>Invited by your organization and not finished setting up: use the temporary password from your invitation, or ask your organization’s administrator to send a new invitation.</li>
        <li>
          Still nothing: <strong className="font-semibold text-foreground">Send a new code</strong>.
        </li>
      </ul>
    </div>
  );
}

/** PRD 7: internal roles see the hardware-key requirement on the sign-in screen. */
export function HardwareKeyRequirement() {
  return (
    <Alert role="note" data-slot="hardware-key-requirement">
      <AlertTitle>PaidWhole staff sign in with a hardware key</AlertTitle>
      <AlertDescription>
        Platform administrators, contract specialists, reimbursement reviewers and support engineers must use a hardware key. A password and an authenticator code are not enough
        for these roles.
      </AlertDescription>
    </Alert>
  );
}
