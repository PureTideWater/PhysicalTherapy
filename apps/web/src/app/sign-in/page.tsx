import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../components/action-form';
import { Field } from '../../components/field';
import { PasswordField } from '../../components/password-field';
import { loadPublicPage } from '../../lib/http/next';
import { signInPage } from '../../lib/routes/sign-in';
import { signInStep } from './actions';
import { HardwareKeyRequirement, SignInNotice, SupportLink } from './notice';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reason, email, use, supportEmail } = await loadPublicPage(signInPage, props);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Sign in</h1>
      <SignInNotice reason={reason} kept={email === null ? undefined : { use }} supportEmail={supportEmail} />
      <Card>
        <CardHeader>
          <CardTitle>Email and password</CardTitle>
          <CardDescription>Then the six-digit code from your authenticator app. Ten failed attempts lock the account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={signInStep} submit="Continue">
            <Field label="Email" name="email" type="email" autoComplete="username" defaultValue={email ?? undefined} required />
            <PasswordField label="Password" name="password" showName=" password" autoComplete="current-password" required />
          </ActionForm>
        </CardContent>
      </Card>
      {/* Next to the password it serves, and seen first after a refusal at a phone's width (review UXR-03). */}
      <p className="text-sm">
        <Link className="underline" href="/sign-in/forgot-password">
          Forgot your password?
        </Link>
      </p>
      <HardwareKeyRequirement />
      <p className="text-sm">
        <Link className="underline" href="/sign-in/hardware-key">
          Sign in with a hardware key
        </Link>
      </p>
      <section aria-labelledby="sign-in-help" className="flex flex-col gap-2 text-sm text-muted-foreground">
        <h2 id="sign-in-help" className="text-sm font-semibold text-foreground">
          Help signing in
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Invited by your organization? Use the email and temporary password from your invitation.</li>
          <li>
            Forgot your password?{' '}
            <Link className="underline" href="/sign-in/forgot-password">
              Reset it by email
            </Link>
            .
          </li>
          <li>
            Lost your authenticator app? Write to <SupportLink supportEmail={supportEmail} /> from the address you sign in with.
          </li>
          <li>
            Lost a hardware key? Sign in with your second key. If you have none, write to <SupportLink supportEmail={supportEmail} /> from the address you sign in with.
          </li>
          <li>
            New to PaidWhole?{' '}
            <Link className="underline" href="/request-audit">
              Request an audit
            </Link>
            .
          </li>
          <li>
            <Link className="underline" href="/status">
              Service status
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
