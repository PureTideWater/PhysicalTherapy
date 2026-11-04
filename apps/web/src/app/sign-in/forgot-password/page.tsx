import { Card, CardContent, CardDescription, CardHeader, CardTitle, buttonVariants } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../components/action-form';
import { Field } from '../../../components/field';
import { PasswordField } from '../../../components/password-field';
import { StepTimer } from '../../../components/step-timer';
import { PASSWORD_MIN_LENGTH } from '../../../lib/auth/password';
import { loadPublicPage } from '../../../lib/http/next';
import { forgotPasswordPage } from '../../../lib/routes/sign-in';
import { backToSignInStep, resetConfirmStep, resetRequestStep, useDifferentEmailStep } from '../actions';
import { ForgotPasswordNotice, NoEmailList, RESET_REQUEST_DESCRIPTION } from '../notice';
import { StepHeading } from '../step-heading';

export const metadata: Metadata = { title: 'Reset your password' };

/**
 * The code step's own words at the warning and once closed (review UXR-02): StepTimer's default says the email is kept
 * and the password typed again, which is false here, where nothing is kept before the code is proven.
 */
const RESET_STEP_WORDS = {
  warning: 'If you need more time, send a new code below: it replaces the code already sent, and the step opens again for 15 minutes.',
  closed: 'Send a new code below to continue, or use a different email.',
} as const;

/**
 * A forgotten password (docs/adr/0081, the forgotten password; test matrix SGN-05, SGN-06): with no live reset step,
 * the request, which answers every address alike; with one, the mailed code and the new password, a timed step that can
 * always be left (Use a different email, Back to sign in) or opened again without typing (Send a new code). The server
 * chooses the phase from the sealed step. The address is never in the URL or a notice: phase 2's card shows the one this
 * browser typed, and its forms carry it hidden.
 */
export default async function ForgotPasswordPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadPublicPage(forgotPasswordPage, props);
  if (data.phase === 'request') {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
        <StepHeading setup={null}>Reset your password</StepHeading>
        <ForgotPasswordNotice phase="request" reason={data.reason} />
        <Card>
          <CardHeader>
            <CardTitle>Your email</CardTitle>
            <CardDescription>{RESET_REQUEST_DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={resetRequestStep} submit="Send code">
              <Field label="Email" name="email" type="email" autoComplete="username" required />
            </ActionForm>
          </CardContent>
        </Card>
        <p className="text-sm">
          <Link className="underline" href="/sign-in">
            Back to sign in
          </Link>
        </p>
      </main>
    );
  }
  const { email, time, startedAt, reason, supportEmail } = data;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <StepHeading setup={null}>Choose a new password</StepHeading>
      <ForgotPasswordNotice phase="confirm" reason={reason} startedAt={startedAt} />
      <Card>
        <CardHeader>
          <CardTitle className="[overflow-wrap:anywhere]">{email}</CardTitle>
          <CardDescription>Enter the code from the email, then choose a new password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <StepTimer limitSeconds={time.limitSeconds} warningSeconds={time.warningSeconds} closesIn={time.closesIn} closesAt={time.closesAt} restart={null} words={RESET_STEP_WORDS}>
            <ActionForm action={resetConfirmStep} submit="Save password">
              <input type="hidden" name="email" value={email} autoComplete="username" data-error-name="Email" />
              <Field label="Six-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={12} hint="Six digits from the email. Spaces are fine." required />
              <PasswordField
                label="New password"
                name="password"
                showName=" new password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters, with a lowercase letter, an uppercase letter, a digit and a symbol.`}
              />
              <PasswordField label="New password again" name="confirm" showName=" new password again" autoComplete="new-password" required />
            </ActionForm>
          </StepTimer>
          <NoEmailList supportEmail={supportEmail} />
          <div className="flex flex-col items-start gap-3">
            {/* Keyed by the step's start, so a successful Send a new code mounts it afresh and the notice above takes the focus (review UXR-05). */}
            <ActionForm key={startedAt} action={resetRequestStep} submit="Send a new code" variant="outline">
              <input type="hidden" name="email" value={email} data-error-name="Email" />
            </ActionForm>
            <form action={useDifferentEmailStep}>
              <button type="submit" className={buttonVariants({ variant: 'outline' })}>
                Use a different email
              </button>
            </form>
          </div>
        </CardContent>
      </Card>
      {/* A POST, not a link: a link would leave the step live, and "Forgot your password?" would open this phase again (review UXR-01). It looks as phase 1's link does (review UXB-N1). */}
      <form action={backToSignInStep}>
        <button type="submit" className="pw-link-button text-sm underline">
          Back to sign in
        </button>
      </form>
    </main>
  );
}
