'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@tp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useActionState, useEffect, useRef } from 'react';

import type { ActionState } from '../../lib/http/next';
import type { ExportAttemptWords } from '../../lib/packets/export-attempts';
import { PendingStatus } from '../form-issues';

/**
 * A packet version's export, as its packet page shows it (the best-option audit's item #26, the founder's ruling
 * of 2026-10-18; docs/adr/0061). ExportStatus is the latest attempt since the latest request, in the words the
 * server chose (lib/packets/export-attempts.ts): while it is in progress or trying again, a polite live status
 * region that asks the server again about every five seconds (router.refresh) with a "Check again" link; once
 * the job refused or failed it, an alert with the reason and what to do. ExportRequestForm is the Export button:
 * a request the job would refuse comes back at once with every reason and its fix, and nothing is queued. While
 * a request is on its way the button keeps focus and its words (aria-disabled, a ref guarding a second press) and a
 * status beside it says "Working…" (docs/adr/0077, decision D5). Its fields are hidden: nothing typed to keep.
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
  }
  const reasons = (state.issues ?? []).filter((issue) => refusalCodes.includes(issue.field));
  const others = (state.issues ?? []).filter((issue) => !refusalCodes.includes(issue.field));
  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-2">
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
            {/* An invalid request's lead is about fields, and this form has none the person fills: its messages stand alone (#50's rule). */}
            {state.invalid === true && others.length > 0 ? null : <p>{state.error}</p>}
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
    </form>
  );
}
