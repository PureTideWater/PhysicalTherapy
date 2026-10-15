'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@tp/ui';
import { useState } from 'react';

/**
 * The browser side of the hardware-key ceremonies (WebAuthn, user verification required). The
 * server's JSON route handlers issue the options and verify the response; the browser only asks the
 * key to sign. Nothing here decides anything.
 */

interface Answer {
  readonly redirect?: string;
  readonly error?: string;
  readonly options?: unknown;
  readonly locked?: boolean;
}

async function post(path: string, body: unknown): Promise<Answer> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  const answer = (await response.json()) as Answer & { status?: string };
  return response.ok ? answer : { error: 'The sign-in step was refused. Start again.' };
}

function Problem({ message, locked }: { readonly message: string | undefined; readonly locked: boolean }) {
  if (message === undefined) {
    return null;
  }
  return (
    <Alert variant="destructive" data-state={locked ? 'locked' : 'error'}>
      <AlertTitle>{locked ? 'Account locked' : 'Not signed in'}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function HardwareKeySignIn() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signIn(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const begun = await post('/api/sign-in/hardware-key/options', { email });
      if (begun.options === undefined) {
        setLocked(begun.locked === true);
        setError(begun.error ?? 'The hardware key could not be used. Try again.');
        return;
      }
      const response = await startAuthentication({ optionsJSON: begun.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      const done = await post('/api/sign-in/hardware-key/verify', { response: JSON.stringify(response) });
      if (done.redirect !== undefined) {
        window.location.assign(done.redirect);
        return;
      }
      setLocked(done.locked === true);
      setError(done.error ?? 'The hardware key was not accepted.');
    } catch {
      setError('The hardware key did not answer. Connect it and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void signIn();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key-email">Email</Label>
        <Input id="key-email" name="email" type="email" autoComplete="username webauthn" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <Problem message={error} locked={locked} />
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Waiting for the key…' : 'Sign in with hardware key'}
        </Button>
      </div>
    </form>
  );
}

export function HardwareKeyRegistration() {
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function register(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const begun = await post('/api/sign-in/register-key/options', {});
      if (begun.options === undefined) {
        if (begun.redirect !== undefined) {
          window.location.assign(begun.redirect);
          return;
        }
        setError(begun.error ?? 'Registration could not start.');
        return;
      }
      const response = await startRegistration({ optionsJSON: begun.options as Parameters<typeof startRegistration>[0]['optionsJSON'] });
      const done = await post('/api/sign-in/register-key/verify', { response: JSON.stringify(response) });
      if (done.redirect !== undefined) {
        window.location.assign(done.redirect);
        return;
      }
      setError(done.error ?? 'The hardware key was not registered.');
    } catch {
      setError('The hardware key did not answer. Connect it and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Problem message={error} locked={false} />
      <div>
        <Button type="button" disabled={busy} onClick={() => void register()}>
          {busy ? 'Waiting for the key…' : 'Register hardware key'}
        </Button>
      </div>
    </div>
  );
}
