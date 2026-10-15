import { Alert, AlertDescription, AlertTitle } from '@tp/ui';

import type { SignInReason } from '../../lib/routes/sign-in';

/** Why the user is signing in again, in words (the URL carries only the code). */
const REASONS: Readonly<Record<SignInReason, { readonly title: string; readonly text: string }>> = {
  signed_out: { title: 'Signed out', text: 'You have signed out.' },
  idle: { title: 'Session expired', text: 'You were signed out after 30 minutes without activity. Sign in again to continue.' },
  expired: { title: 'Session expired', text: 'Sessions last 12 hours. Sign in again to continue.' },
  ended: { title: 'Session ended', text: 'This session has ended. Sign in again to continue.' },
  device_revoked: { title: 'Device revoked', text: 'This device was revoked, which ended its sessions. Sign in again to use it.' },
  user_disabled: { title: 'Account disabled', text: 'This account is disabled. Ask your administrator.' },
  mfa_required: { title: 'Two-step verification required', text: 'Every account needs an authenticator app or a hardware key. Sign in to set it up.' },
  step_expired: { title: 'Start again', text: 'That sign-in step expired. Start again from your email and password.' },
  hardware_key_required: { title: 'Hardware key required', text: 'Your role signs in with a hardware key. Use it below.' },
  key_registered: { title: 'Hardware key registered', text: 'Your hardware key is registered. Sign in with it now.' },
  locked: { title: 'Account locked', text: 'This account is locked after ten failed attempts. A platform administrator can unlock it.' },
};

export function SignInNotice({ reason }: { readonly reason: SignInReason | null }) {
  if (reason === null) {
    return null;
  }
  const notice = REASONS[reason];
  return (
    <Alert role="status" data-reason={reason}>
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  );
}

/** PRD 7: internal roles see the hardware-key requirement on the sign-in screen. */
export function HardwareKeyRequirement() {
  return (
    <Alert role="note" data-slot="hardware-key-requirement">
      <AlertTitle>Company staff sign in with a hardware key</AlertTitle>
      <AlertDescription>
        Platform administrators, contract specialists, reimbursement reviewers and support engineers must use a hardware key. A password and an authenticator code are not enough
        for these roles.
      </AlertDescription>
    </Alert>
  );
}
