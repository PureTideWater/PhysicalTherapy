'use client';

import { Button } from '@tp/ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { openKeyRegistrationAction } from '../../app/console/actions';
import type { ActionState } from '../../lib/http/next';
import { ActionForm } from '../action-form';
import { utc } from '../format';

const FOCUSABLE = 'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** How long after a press the row's new state may still take the focus: the action's round trip, with room (action-form's TAKEOVER_MS). */
const ARRIVAL_MS = 15_000;

/** The account whose key form was pressed last, and when: one per page, in this browser tab's memory, and nothing else. */
let pressed: { readonly account: string; readonly at: number } | null = null;

/**
 * A row's hardware-key part, set off from the membership's own buttons and named for its account. It notes a press of
 * any of its forms (the account's opaque ID and the time), so the state that press brings can take the focus.
 */
export function KeyGroup({ account, email, children }: { readonly account: string; readonly email: string; readonly children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={`Hardware keys of ${email}`}
      className="flex max-w-sm basis-full flex-col gap-2 border-t pt-2"
      onSubmitCapture={() => {
        pressed = { account, at: Date.now() };
      }}
    >
      <p className="text-xs font-medium text-muted-foreground">Hardware key</p>
      {children}
    </div>
  );
}

/**
 * The words of a row's key state, which take the focus when a press in the row brings them (WCAG 2.4.3, 4.1.3): after
 * a request, a cancellation or a confirmation the action redirects to the same page, Next renders it again and the
 * form that held the focus is gone; and after a Confirm or Cancel refused because another person decided first, the
 * form reads the page again (ActionForm's `refreshOnError`) and is replaced the same way. Then, and only when nothing
 * holds the focus and the press was this account's (KeyGroup) within ARRIVAL_MS, these words take it and are read
 * once; they are no live region. Nothing rides in the URL, and a page that loads takes no focus.
 */
export function KeyStateText({ account, state, className, children }: { readonly account: string; readonly state: string; readonly className?: string; readonly children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (pressed !== null && pressed.account === account && Date.now() - pressed.at <= ARRIVAL_MS && (active === null || active === document.body)) {
      pressed = null;
      ref.current?.focus();
    }
  }, [account, state]);
  return (
    <p ref={ref} id={`key-state-${account}`} tabIndex={-1} data-key-state={state} className={className === undefined ? FOCUSABLE : `${className} ${FOCUSABLE}`}>
      {children}
    </p>
  );
}

/**
 * Opens registration of a new hardware key after a removal, and shows the one-time code once (docs/adr/0095). The code
 * comes back from the server action into this component's memory only: it is in no URL, cookie or storage, and a
 * reload or leaving the page drops it. The panel takes focus so a screen reader reads it when it appears; its heading
 * finds it again, and its one control, Hide the code, is a place the keyboard stops at and ends the display on
 * purpose: the focus then goes to what stands for the account. There is no copy button: a clipboard is a store.
 * `lead` is the row's words before an opening, which leave when the panel shows, so nothing above the code is stale.
 */
export function OpenRegistration({ organizationId, removalId, email, lead, children }: { readonly organizationId: string; readonly removalId: string; readonly email: string; readonly lead?: ReactNode; readonly children: ReactNode }) {
  const [opened, setOpened] = useState<{ readonly code: string | null; readonly until: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLParagraphElement>(null);
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
      (opened.code === null ? hidden : panel).current?.focus();
    }
  }, [opened]);
  if (opened !== null && opened.code === null) {
    return (
      <p ref={hidden} tabIndex={-1} data-key-state="open" className={`text-sm ${FOCUSABLE}`}>
        Registration of a new key is open until {utc(opened.until)}. The code is hidden and cannot be shown again. If it was lost, open registration again after {utc(opened.until)}.
      </p>
    );
  }
  if (opened !== null && opened.code !== null) {
    const { code, until } = opened;
    return (
      <div ref={panel} tabIndex={-1} role="group" aria-label={`Registration code for ${email}`} className="flex max-w-md flex-col gap-2 rounded-md border p-3 text-sm">
        <h3 className="text-sm font-medium">Registration code for {email}</h3>
        <p>Registration is open for {email} until {utc(until)}.</p>
        <p>
          Code: <span className="font-mono text-base font-semibold tracking-widest">{`${code.slice(0, 4)} ${code.slice(4)}`}</span>
        </p>
        <p>
          Read it to the person by phone, on a number you already hold for them. It is shown once: PaidWhole keeps no copy, and it goes when you leave or reload this page. If the code is lost, it cannot be shown again, and registration cannot be opened again until {utc(until)}. Then open it again for a new code.
        </p>
        <p className="text-muted-foreground">Never send the code by email or chat. They enter it after their password and authenticator code, then register the new key. Five wrong codes close this opening.</p>
        <div>
          <Button type="button" variant="outline" onClick={() => setOpened({ code: null, until })}>
            Hide the code
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      {lead}
      <ActionForm
        action={action}
        submit={
          <>
            Open key registration<span className="sr-only"> for {email}</span>
          </>
        }
        variant="outline"
        className="flex flex-col gap-1"
      >
        {children}
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="removalId" value={removalId} />
      </ActionForm>
    </>
  );
}
