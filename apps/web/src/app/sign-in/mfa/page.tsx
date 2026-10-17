import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field } from '../../../components/field';
import { loadPublicPage } from '../../../lib/http/next';
import { mfaPage } from '../../../lib/routes/sign-in';
import { mfaStep } from '../actions';

export const metadata: Metadata = { title: 'Verification code' };

export default async function MfaPage() {
  const { email } = await loadPublicPage(mfaPage, {});
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Verification code</h1>
      <Card>
        <CardHeader>
          <CardTitle>{email}</CardTitle>
          <CardDescription>Enter the six-digit code your authenticator app shows for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={mfaStep} submit="Sign in">
            <Field label="Six-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
