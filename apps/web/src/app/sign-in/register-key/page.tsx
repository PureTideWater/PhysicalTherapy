import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field } from '../../../components/field';
import { HardwareKeyRegistration } from '../../../components/hardware-key';
import { StepTimer } from '../../../components/step-timer';
import { loadPublicPage } from '../../../lib/http/next';
import { registerKeyPage } from '../../../lib/routes/sign-in';
import { registrationCodeStep, restartStep } from '../actions';
import { SupportLink } from '../notice';
import { StepHeading } from '../step-heading';
import { ArrivalHeadingFocus } from './arrival-heading-focus';

export const metadata: Metadata = { title: 'Register a hardware key' };

const TIMER_NOTES = { warning: 'Starting again also asks for a code from your authenticator app.', closed: 'Starting again also asks for a code from your authenticator app.' };

/**
 * An internal user who proved password and code but has no key: they register one, then sign in with it. After a
 * removal of the account's keys the step first asks for the one-time code a PaidWhole administrator read to them
 * (docs/adr/0095): the same screen whether or not registration has been opened, so it says nothing of that. The code
 * is a secret field: the form empties it after a refusal, and a refresh keeps the step and never the code. It is typed
 * in the mono face, as the console shows it. After the right code the screen says so and its heading takes the focus
 * (WCAG 2.4.3, 4.1.3): a state of the step, so a refresh says it again.
 */
export default async function RegisterKeyPage() {
  const { email, time, setup, codeRequired, codeAccepted, supportEmail } = await loadPublicPage(registerKeyPage, {});
  const askCode = codeRequired === true;
  const accepted = codeAccepted === true;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <StepHeading setup={setup} arrival={accepted}>
        Register a hardware key
      </StepHeading>
      {accepted ? <ArrivalHeadingFocus /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{email}</CardTitle>
          <CardDescription>
            {askCode
              ? 'The hardware key for this account was removed. To register a new one, first enter the code PaidWhole gave you. Your password and authenticator code alone open nothing for this account.'
              : accepted
                ? 'Code accepted. Connect your new hardware key and press Register hardware key; then sign in with it. Your password and authenticator code alone open nothing for this account.'
                : 'Your role signs in with a hardware key only. Connect your key and register it; then sign in with it. Your password and code alone open nothing for this account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepTimer limitSeconds={time.limitSeconds} warningSeconds={time.warningSeconds} closesIn={time.closesIn} closesAt={time.closesAt} restart={restartStep} notes={TIMER_NOTES}>
            {askCode ? (
              <ActionForm action={registrationCodeStep} submit="Continue">
                <Field label="Code from PaidWhole" name="code" autoComplete="one-time-code" maxLength={32} hint="Eight letters and digits. Spaces, hyphens and lower case are fine." className="font-mono tracking-widest" required />
              </ActionForm>
            ) : (
              <HardwareKeyRegistration />
            )}
          </StepTimer>
        </CardContent>
      </Card>
      {askCode && supportEmail !== undefined ? (
        <p className="text-sm text-muted-foreground">
          No code? A PaidWhole administrator gives it to you by phone. Write to <SupportLink supportEmail={supportEmail} /> from the address you sign in with.
        </p>
      ) : null}
    </main>
  );
}
