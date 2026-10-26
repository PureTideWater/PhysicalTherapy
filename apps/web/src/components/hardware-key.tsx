'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@tp/ui';
import { useEffect, useRef, useState } from 'react';

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

/** While a ceremony runs: what the key needs from the person, in a status line present from the first render. */
const WAITING = 'Waiting for your hardware key. Touch it, then confirm with its PIN or fingerprint.';

/**
 * What the server or the key refused, focused when it appears (as a form's refusal summary is), so the keyboard
 * and a screen reader meet it at once; `title` is the caller's ("Not signed in", "Not registered").
 */
function Problem({ message, locked, title }: { readonly message: string | undefined; readonly locked: boolean; readonly title: string }) {
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message !== undefined) {
      alert.current?.focus();
    }
  }, [message]);
  if (message === undefined) {
    return null;
  }
  return (
    <Alert ref={alert} variant="destructive" tabIndex={-1} data-state={locked ? 'locked' : 'error'}>
      <AlertTitle>{locked ? 'Account locked' : title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * The ceremony's button and its status line (docs/adr/0077): the button keeps its words and its focus while the key
 * is asked (aria-disabled, never disabled, which would drop the focus to the page), and the line beside it says what
 * the key needs. The caller's ref guard is what refuses a second press.
 */
function CeremonyButton({ busy, type, onClick, children }: { readonly busy: boolean; readonly type: 'submit' | 'button'; readonly onClick?: () => void; readonly children: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type={type} aria-disabled={busy || undefined} onClick={onClick}>
        {children}
      </Button>
      <p role="status" className="text-sm text-muted-foreground" data-slot="pending-status">
        {busy ? WAITING : ''}
      </p>
    </div>
  );
}

export function HardwareKeySignIn() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function signIn(): Promise<void> {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
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
      inFlight.current = false;
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
      <Problem message={error} locked={locked} title="Not signed in" />
      <CeremonyButton busy={busy} type="submit">
        Sign in with hardware key
      </CeremonyButton>
    </form>
  );
}

export function HardwareKeyRegistration() {
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function register(): Promise<void> {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
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
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Problem message={error} locked={false} title="Not registered" />
      <CeremonyButton busy={busy} type="button" onClick={() => void register()}>
        Register hardware key
      </CeremonyButton>
    </div>
  );
}
