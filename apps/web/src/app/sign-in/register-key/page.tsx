import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { HardwareKeyRegistration } from '../../../components/hardware-key';
import { StepTimer } from '../../../components/step-timer';
import { loadPublicPage } from '../../../lib/http/next';
import { registerKeyPage } from '../../../lib/routes/sign-in';
import { restartStep } from '../actions';
import { StepHeading } from '../step-heading';

export const metadata: Metadata = { title: 'Register a hardware key' };

/** An internal user who proved password and code but has no key: they register one, then sign in with it. */
export default async function RegisterKeyPage() {
  const { email, time, setup } = await loadPublicPage(registerKeyPage, {});
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <StepHeading setup={setup}>Register a hardware key</StepHeading>
      <Card>
        <CardHeader>
          <CardTitle>{email}</CardTitle>
          <CardDescription>
            Your role signs in with a hardware key only. Connect your key and register it; then sign in with it. Your password and code alone open nothing for this account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepTimer
            limitSeconds={time.limitSeconds}
            warningSeconds={time.warningSeconds}
            closesIn={time.closesIn}
            closesAt={time.closesAt}
            restart={restartStep}
            notes={{ warning: 'Starting again also asks for a code from your authenticator app.', closed: 'Starting again also asks for a code from your authenticator app.' }}
          >
            <HardwareKeyRegistration />
          </StepTimer>
        </CardContent>
      </Card>
    </main>
  );
}
