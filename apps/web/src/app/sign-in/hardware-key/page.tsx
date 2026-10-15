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
    <main className="mx-auto flex max-w-md flex-col gap-6 p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in with a hardware key</h1>
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
