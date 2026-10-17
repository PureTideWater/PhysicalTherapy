import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HardwareKeySignIn } from '../../../components/hardware-key';
import { loadPublicPage } from '../../../lib/http/next';
import { hardwareKeyPage } from '../../../lib/routes/sign-in';
import { HardwareKeyRequirement, SignInNotice } from '../notice';

export const metadata: Metadata = { title: 'Sign in with a hardware key' };

export default async function HardwareKeyPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reason } = await loadPublicPage(hardwareKeyPage, props);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-display">Sign in with a hardware key</h1>
      <SignInNotice reason={reason} />
      <HardwareKeyRequirement />
      <Card>
        <CardHeader>
          <CardTitle>Hardware key</CardTitle>
          <CardDescription>Enter your email, then touch your key and confirm with its PIN or fingerprint when it asks.</CardDescription>
        </CardHeader>
        <CardContent>
          <HardwareKeySignIn />
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        No key registered yet?{' '}
        <Link className="underline" href="/sign-in">
          Sign in with your password and code
        </Link>{' '}
        once to register it.
      </p>
    </main>
  );
}
