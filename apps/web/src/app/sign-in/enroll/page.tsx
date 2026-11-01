import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field } from '../../../components/field';
import { StepTimer } from '../../../components/step-timer';
import { loadPublicPage } from '../../../lib/http/next';
import { enrollPage } from '../../../lib/routes/sign-in';
import { enrollStep } from '../actions';
import { StepHeading } from '../step-heading';

export const metadata: Metadata = { title: 'Set up two-step verification' };

/** TOTP enrollment (PRD 7): MFA is mandatory, so a first sign-in enrolls before anything else. */
export default async function EnrollPage() {
  const { email, secret, uri, time, setup } = await loadPublicPage(enrollPage, {});
  const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? secret;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <StepHeading setup={setup}>Set up two-step verification</StepHeading>
      <Card>
        <CardHeader>
          <CardTitle>Add this account to your authenticator app</CardTitle>
          <CardDescription>Every account needs a second step. In your authenticator app, add an account for {email} with this setup key, then enter the code it shows.</CardDescription>
        </CardHeader>
        <CardContent>
          <StepTimer
            limitSeconds={time.limitSeconds}
            warningSeconds={time.warningSeconds}
            closesIn={time.closesIn}
            closesAt={time.closesAt}
            restartHref="/sign-in?reason=restarted"
            notes={{
              warning: 'Starting again gives you a new setup key: replace this one in your authenticator app.',
              closed: 'This setup key no longer works: starting again gives you a new one.',
            }}
          >
            <p className="rounded-md border bg-muted px-3 py-2 font-mono text-sm" data-slot="totp-secret" data-secret={secret}>
              {grouped}
            </p>
            <p className="text-sm">
              <a className="underline" href={uri}>
                Open in an authenticator app on this device
              </a>
            </p>
            <ActionForm action={enrollStep} submit="Verify and continue">
              <Field label="Six-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={12} hint="Six digits. Spaces are fine." required />
            </ActionForm>
          </StepTimer>
        </CardContent>
      </Card>
    </main>
  );
}
