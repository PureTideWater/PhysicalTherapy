import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field } from '../../../components/field';
import { loadPublicPage } from '../../../lib/http/next';
import { enrollPage } from '../../../lib/routes/sign-in';
import { enrollStep } from '../actions';

export const metadata: Metadata = { title: 'Set up two-step verification' };

/** TOTP enrollment (PRD 7): MFA is mandatory, so a first sign-in enrolls before anything else. */
export default async function EnrollPage() {
  const { email, secret, uri } = await loadPublicPage(enrollPage, {});
  const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? secret;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set up two-step verification</h1>
      <Card>
        <CardHeader>
          <CardTitle>Add this account to your authenticator app</CardTitle>
          <CardDescription>Every account needs a second step. In your authenticator app, add an account for {email} with this setup key, then enter the code it shows.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="rounded-md border bg-muted px-3 py-2 font-mono text-sm" data-slot="totp-secret" data-secret={secret}>
            {grouped}
          </p>
          <p className="text-sm">
            <a className="underline" href={uri}>
              Open in an authenticator app on this device
            </a>
          </p>
          <ActionForm action={enrollStep} submit="Verify and continue">
            <Field label="Six-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
