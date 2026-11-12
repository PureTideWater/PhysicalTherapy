'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { openKeyRegistrationAction } from '../../app/console/actions';
import type { ActionState } from '../../lib/http/next';
import { ActionForm } from '../action-form';
import { utc } from '../format';

/**
 * Opens registration of a new hardware key after a removal, and shows the one-time code once (docs/adr/0095). The code
 * comes back from the server action into this component's memory only: it is in no URL, cookie or storage, and a
 * reload or leaving the page drops it. The panel takes focus so a screen reader reads it when it appears.
 */
export function OpenRegistration({ organizationId, removalId, email, children }: { readonly organizationId: string; readonly removalId: string; readonly email: string; readonly children: ReactNode }) {
  const [opened, setOpened] = useState<{ readonly code: string; readonly until: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const action = useCallback(async (state: ActionState, form: FormData): Promise<ActionState> => {
    const answer = await openKeyRegistrationAction(state, form);
    if (answer.registrationCode !== undefined && answer.openUntil !== undefined) {
      setOpened({ code: answer.registrationCode, until: answer.openUntil });
      return {};
    }
    return answer;
  }, []);
  useEffect(() => {
    if (opened !== null) {
      panel.current?.focus();
    }
  }, [opened]);
  if (opened !== null) {
    return (
      <div ref={panel} tabIndex={-1} role="group" aria-label={`Registration code for ${email}`} className="flex max-w-md flex-col gap-2 rounded-md border p-3 text-sm">
        <p className="font-medium">Registration is open for {email} until {utc(opened.until)}.</p>
        <p>
          Code: <span className="font-mono text-base font-semibold tracking-widest">{`${opened.code.slice(0, 4)} ${opened.code.slice(4)}`}</span>
        </p>
        <p>Read it to the person by phone, on a number you already hold for them. It is shown once: PaidWhole keeps no copy, and it goes when you leave or reload this page.</p>
        <p className="text-muted-foreground">Never send the code by email or chat. They enter it after their password and authenticator code, then register the new key. Five wrong codes close this opening.</p>
      </div>
    );
  }
  return (
    <ActionForm action={action} submit="Open registration" variant="outline" className="flex flex-col gap-1">
      {children}
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="removalId" value={removalId} />
    </ActionForm>
  );
}
