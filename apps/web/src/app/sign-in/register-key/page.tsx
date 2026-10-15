import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { HardwareKeyRegistration } from '../../../components/hardware-key';
import { loadPublicPage } from '../../../lib/http/next';
import { registerKeyPage } from '../../../lib/routes/sign-in';

export const metadata: Metadata = { title: 'Register a hardware key' };

/** An internal user who proved password and code but has no key: they register one, then sign in with it. */
export default async function RegisterKeyPage() {
  const { email } = await loadPublicPage(registerKeyPage, {});
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Register a hardware key</h1>
      <Card>
        <CardHeader>
          <CardTitle>{email}</CardTitle>
          <CardDescription>
            Your role signs in with a hardware key only. Connect your key and register it; then sign in with it. Your password and code alone open nothing for this account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HardwareKeyRegistration />
        </CardContent>
      </Card>
    </main>
  );
}
