import { Alert, AlertDescription, AlertTitle } from '@tp/ui';

import { ArrivalFocus } from '../../components/arrival-focus';
import type { PasswordToUse, SignInReason } from '../../lib/routes/sign-in';

/** Why the user is signing in again, in words (the URL carries only the code). */
const REASONS: Readonly<Record<SignInReason, { readonly title: string; readonly text: string }>> = {
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
  locked: { title: 'Account locked', text: 'This account is locked after ten failed attempts. A platform administrator can unlock it.' },
  restarted: { title: 'Start again', text: 'Start again from your email and password.' },
};

/** The two reasons a person is back after a sign-in step: it closed, or they chose to start again (docs/adr/0081). */
type RestartReason = Extract<SignInReason, 'step_expired' | 'restarted'>;

const isRestart = (reason: SignInReason): reason is RestartReason => reason === 'step_expired' || reason === 'restarted';

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
function wordsOf(reason: SignInReason, kept: { readonly use: PasswordToUse | null } | undefined, surface: 'password' | 'key'): string {
  if (!isRestart(reason)) {
    return REASONS[reason].text;
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
 * the address itself, which only the Email field holds); `surface` is the page: the password's, or the hardware key's.
 * After a step closed or was started again the notice takes the focus once, so it is read on arrival (docs/adr/0081).
 */
export function SignInNotice({
  reason,
  kept,
  surface = 'password',
}: {
  readonly reason: SignInReason | null;
  readonly kept?: { readonly use: PasswordToUse | null };
  readonly surface?: 'password' | 'key';
}) {
  if (reason === null) {
    return null;
  }
  const notice = (
    <Alert role="status" data-reason={reason}>
      <AlertTitle>{REASONS[reason].title}</AlertTitle>
      <AlertDescription>{wordsOf(reason, kept, surface)}</AlertDescription>
    </Alert>
  );
  return isRestart(reason) ? <ArrivalFocus>{notice}</ArrivalFocus> : notice;
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
