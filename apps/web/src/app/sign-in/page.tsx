import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../components/action-form';
import { Field } from '../../components/field';
import { loadPublicPage } from '../../lib/http/next';
import { signInPage } from '../../lib/routes/sign-in';
import { signInStep } from './actions';
import { HardwareKeyRequirement, SignInNotice } from './notice';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reason } = await loadPublicPage(signInPage, props);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <SignInNotice reason={reason} />
      <Card>
        <CardHeader>
          <CardTitle>Email and password</CardTitle>
          <CardDescription>Then the six-digit code from your authenticator app. Ten failed attempts lock the account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={signInStep} submit="Continue">
            <Field label="Email" name="email" type="email" autoComplete="username" required />
            <Field label="Password" name="password" type="password" autoComplete="current-password" required />
          </ActionForm>
        </CardContent>
      </Card>
      <HardwareKeyRequirement />
      <p className="text-sm">
        <Link className="underline" href="/sign-in/hardware-key">
          Sign in with a hardware key
        </Link>
      </p>
    </main>
  );
}
