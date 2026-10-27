'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@tp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useActionState, useEffect, useRef, useState } from 'react';

import type { ActionState } from '../../lib/http/next';
import type { ExportAttemptWords } from '../../lib/packets/export-attempts';
import { RefreshAfterRefusal } from '../action-form';
import { PendingStatus, RefusalLead } from '../form-issues';

/**
 * A packet version's export, as its packet page shows it (the best-option audit's item #26, the founder's ruling
 * of 2026-10-18; docs/adr/0061). ExportStatus is the latest attempt since the latest request, in the words the
 * server chose (lib/packets/export-attempts.ts): while it is in progress or trying again, a polite live status
 * region that asks the server again about every five seconds (router.refresh) with a "Check again" link; once
 * the job refused or failed it, an alert with the reason and what to do. ExportRequestForm is the Export button:
 * a request the job would refuse comes back at once with every reason and its fix, and nothing is queued. While
 * a request is on its way the button keeps focus and its words (aria-disabled, a ref guarding a second press) and a
 * status beside it says "Working…" (docs/adr/0077, decision D5). Its fields are hidden: nothing typed to keep. A
 * request refused because the page was out of date (`stale`) reads the page again, as ActionForm does (D10), and says
 * so in the same words: a press made on this page is invited again, any other post is not.
 */

export function ExportStatus({ words, checkAgainHref, refreshMs }: { readonly words: ExportAttemptWords; readonly checkAgainHref: string; readonly refreshMs: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!words.live) {
      return undefined;
    }
    const timer = setInterval(() => {
      router.refresh();
    }, refreshMs);
    return () => {
      clearInterval(timer);
    };
  }, [words.live, refreshMs, router]);
  if (words.live) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-1 rounded-md border p-3 text-sm" data-export-attempt={words.state} data-code={words.code ?? undefined}>
        <p className="font-medium">{words.title}</p>
        <p>{words.text}</p>
        <p>
          <Link className="underline" href={checkAgainHref} prefetch={false}>
            Check again
          </Link>
        </p>
      </div>
    );
  }
  return (
    <Alert variant={words.tone === 'danger' ? 'destructive' : 'default'} data-export-attempt={words.state} data-code={words.code ?? undefined}>
      <AlertTitle>{words.title}</AlertTitle>
      <AlertDescription>{words.text}</AlertDescription>
    </Alert>
  );
}

export function ExportRequestForm({
  action,
  children,
  refusalCodes,
}: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The request keys and the version's hidden fields. */
  readonly children: ReactNode;
  /** The codes a refusal names (@tp/worker/packets PACKET_EXPORT_REFUSALS): an issue with one of them as its field is a reason. */
  readonly refusalCodes: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Whether a press on this page sent the request (onSubmit runs only with JavaScript), so a stale page may invite another.
  const [pressedHere, setPressedHere] = useState(false);
  // The one guard against a second press, even in the same frame: a disabled button would drop focus to the page.
  const inFlight = useRef(false);
  useEffect(() => {
    if (!pending) {
      inFlight.current = false;
    }
  }, [pending]);
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    if (inFlight.current) {
      event.preventDefault();
      return;
    }
    inFlight.current = true;
    setPressedHere(true);
  }
  const reasons = (state.issues ?? []).filter((issue) => refusalCodes.includes(issue.field));
  const others = (state.issues ?? []).filter((issue) => !refusalCodes.includes(issue.field));
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-2">
      {children}
      {reasons.length > 0 ? (
        <Alert variant="destructive" data-state="error" data-export-refused={reasons[0]?.field}>
          <AlertTitle>Not exported: nothing was queued</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-5" aria-label="Why the export is refused">
              {reasons.map((reason) => (
                <li key={reason.field} data-refusal={reason.field}>
                  {reason.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : state.error === undefined ? null : (
        <Alert variant="destructive" data-state="error">
          <AlertTitle>Not done</AlertTitle>
          <AlertDescription>
            {/* No field of this form is the person's to fill (none placed): an invalid request's messages stand alone (#50's rule). */}
            <RefusalLead state={state} placed={0} fromBrowser={pressedHere} submit="Export PDF and CSV" />
            {others.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {/* The message alone: a key is never shown, and these name no field of this form. */}
                {others.map((issue) => (
                  <li key={`${issue.field}:${issue.message}`}>{issue.message.charAt(0).toUpperCase() + issue.message.slice(1)}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" aria-disabled={pending || undefined}>
          Export PDF and CSV
        </Button>
        <PendingStatus pending={pending} />
      </div>
      {state.stale === true ? <RefreshAfterRefusal state={state} takeover={undefined} formRef={formRef} /> : null}
    </form>
  );
}
