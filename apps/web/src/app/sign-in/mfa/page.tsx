import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field } from '../../../components/field';
import { StepTimer } from '../../../components/step-timer';
import { loadPublicPage } from '../../../lib/http/next';
import { mfaPage } from '../../../lib/routes/sign-in';
import { mfaStep, restartStep } from '../actions';
import { StepHeading } from '../step-heading';

export const metadata: Metadata = { title: 'Verification code' };

export default async function MfaPage() {
  const { email, time } = await loadPublicPage(mfaPage, {});
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <StepHeading setup={null}>Verification code</StepHeading>
      <Card>
        <CardHeader>
          <CardTitle>{email}</CardTitle>
          <CardDescription>Enter the six-digit code your authenticator app shows for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <StepTimer limitSeconds={time.limitSeconds} warningSeconds={time.warningSeconds} closesIn={time.closesIn} closesAt={time.closesAt} restart={restartStep}>
            <ActionForm action={mfaStep} submit="Sign in">
              <Field label="Six-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={12} hint="Six digits. Spaces are fine." required />
            </ActionForm>
          </StepTimer>
        </CardContent>
      </Card>
    </main>
  );
}
