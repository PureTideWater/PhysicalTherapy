'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@tp/ui';
import { useRouter } from 'next/navigation';
import { Fragment, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ActionState } from '../lib/http/next';
import { FormIssues, PendingStatus, RefusalSummary, SUMMARY_TITLES, type SummaryKind, summaryKind, useClearedForAnotherPerson, useGuardedSubmit } from './form-issues';

export { summaryLead } from './form-issues';

/**
 * A form posting to a server action that keeps what the person typed when the action refuses (docs/adr/0077). The
 * form is sent from `onSubmit` (useGuardedSubmit), so React never resets it on a refusal; one press sends one request;
 * a dropped connection keeps every value but the secrets and says the save is not confirmed. The refusal shows first
 * in the form (RefusalSummary): each issue named by the label the person sees and linked to its field, which shows
 * "Error:" and the rule's words under it (FormIssues); the focus goes to the one field refused, or to the summary.
 * Passwords and codes are emptied, and say so. While the request is out the button keeps its words and its focus
 * (aria-disabled, never disabled) and a status beside it says "Working…". On success the action redirects, and Next
 * remounts the page, so a saved form starts fresh with a fresh request key. That holds on two conditions, which no
 * change may break:
 *
 * 1. The hook whose dispatcher goes on `<form action>` takes the server action itself, never a client wrapper: a
 *    wrapper drops the $ACTION_* fields the post without JavaScript (and React's replay of a press made before the
 *    page hydrated) needs. useGuardedSubmit's browser hook may wrap it, since only onSubmit dispatches it, and it
 *    rethrows Next's redirect, so a success through it remounts the form as before.
 * 2. `<FormKeys/>` is rendered by pages, never by a layout: a layout does not render again after the redirect, so a
 *    second submit would replay the old request key.
 *
 * A form whose refusal can mean the page itself is out of date (an Accept or Re-run button another person's
 * change has overtaken: combined audit #10, docs/adr/0037) sets `refreshOnError` to a key of its own: after a
 * refusal the page is read again (router.refresh, as the export status does). Still rendered, the form keeps its
 * state, its refusal and the focus. Replaced by an explanation that names the same key (RefusalTakeover), the
 * focus, which the form took with it, moves to that explanation, so a keyboard or screen-reader user lands on why
 * and on its next step. Any form whose CSRF token or request key was out of date (`stale`) reads the page again the
 * same way, with no takeover: the fresh token and key render in place and what was typed stays. A press whose
 * connection dropped keeps its request key for the next press, whatever a refresh renders (useGuardedSubmit); and when
 * a refresh shows another person signed in, the fields mount afresh and the summary says the form was cleared
 * (useClearedForAnotherPerson), so nothing typed is sent under another person's name.
 */
export function ActionForm({
  action,
  submit,
  children,
  variant = 'default',
  className,
  refreshOnError,
  wrapSubmit = false,
  beforeSubmit,
}: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The button's words; may hold a figure in the mono face (<Money/>). */
  readonly submit: ReactNode;
  readonly children?: ReactNode;
  readonly variant?: 'default' | 'outline' | 'destructive';
  readonly className?: string;
  /** Read the page again after a refusal, for a form a change elsewhere can overtake: the key an explanation that may take its place names. */
  readonly refreshOnError?: string;
  /**
   * Let the button's words wrap, for a label long enough to outrun its card at a phone's width (WCAG 1.4.10, reflow
   * at 320 px): the Button is one line by default (UX recheck of PR #50, N1).
   */
  readonly wrapSubmit?: boolean;
  /** Called on a press, before anything is sent, with JavaScript only: false sends nothing (the split form shows its own problems). */
  readonly beforeSubmit?: (form: HTMLFormElement) => boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const heldKey = useRef<string | null>(null);
  const { state, fromBrowser, pending, formAction, onSubmit } = useGuardedSubmit(action, beforeSubmit === undefined ? { heldKey } : { beforeSubmit, heldKey });
  const { shown, generation } = useClearedForAnotherPerson(formRef, state, heldKey);
  const stale = state.stale === true;
  return (
    <FormIssues state={shown}>
      <form ref={formRef} action={formAction} onSubmit={onSubmit} className={className ?? 'flex flex-col gap-4'}>
        <RefusalSummary state={shown} fromBrowser={fromBrowser} submit={submit} formRef={formRef} />
        <Fragment key={generation}>{children}</Fragment>
        {/* The status goes inside the button's wrapper, never as a child of the form, which would take a cell of a grid or a slot of a row. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant={variant} aria-disabled={pending || undefined} className={wrapSubmit ? 'h-auto min-h-9 whitespace-normal text-left' : undefined}>
            {submit}
          </Button>
          <PendingStatus pending={pending} />
        </div>
        {refreshOnError === undefined && !stale ? null : <RefreshAfterRefusal state={state} takeover={stale ? undefined : refreshOnError} formRef={formRef} />}
      </form>
    </FormIssues>
  );
}

/** How long after a refusal's refresh an explanation may still take the focus: the refresh's round trip, with room. */
const TAKEOVER_MS = 15_000;

/**
 * The form refused last that asked for a refresh, by its key, when, its refusal as the form showed it (each issue
 * after its field's name, read when it is taken) and its kind (a key used before is "Already sent", never "Not done"):
 * one per page, in this browser tab's memory.
 */
let refused: { readonly key: string; readonly at: number; readonly lines: () => readonly string[]; readonly kind: SummaryKind } | null = null;

/** Records a refusal of the form with this key, before its refresh (RefreshAfterRefusal), with its lines and its kind. */
export function noteRefusal(key: string, at: number, lines: readonly string[] = [], kind: SummaryKind = 'error'): void {
  refused = { key, at, lines: () => lines, kind };
}

/**
 * Whether an explanation naming `keys`, mounting at `at`, takes the focus: a form it names was refused within
 * TAKEOVER_MS and the focus fell to the page (`focusLost`: that form, and its focused summary, are gone). The first to
 * take it ends the hand-off.
 */
export function takesFocus(keys: readonly string[], at: number, focusLost: boolean): boolean {
  if (refused === null || !focusLost || !keys.includes(refused.key) || at - refused.at > TAKEOVER_MS) {
    return false;
  }
  refused = null;
  return true;
}

/** A refusal handed to the note after a list (RefusalFallback): its lines, and its kind, which titles it. */
export interface OrphanedRefusal {
  readonly lines: readonly string[];
  readonly kind: SummaryKind;
}

/**
 * The refusal of a form whose key starts with `prefix` but names none of `present` (its row left the list on the
 * refresh, so no explanation takes its place), within TAKEOVER_MS, when the focus fell to the page: its lines and its
 * kind, which ends the hand-off. Null otherwise (an explanation of its own took it, or none is due).
 */
export function takesOrphanedRefusal(prefix: string, present: readonly string[], at: number, focusLost: boolean): OrphanedRefusal | null {
  if (refused === null || !focusLost || !refused.key.startsWith(prefix) || present.includes(refused.key) || at - refused.at > TAKEOVER_MS) {
    return null;
  }
  const { lines, kind } = refused;
  refused = null;
  return { lines: lines(), kind };
}

/**
 * An explanation that may take a refused form's place after the refresh (ActionForm's `refreshOnError`, by the keys
 * it names): focusable, and focused when it mounts in place of that form, so the person lands on it. It adds no live
 * region of its own: an explanation on the page from the start is read in its place, never announced on load.
 */
export function RefusalTakeover({ keys, children, className }: { readonly keys: readonly string[]; readonly children: ReactNode; readonly className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const keyList = keys.join(' ');
  useEffect(() => {
    const active = document.activeElement;
    if (takesFocus(keyList.split(' '), Date.now(), active === null || active === document.body)) {
      ref.current?.focus();
    }
  }, [keyList]);
  return (
    <div ref={ref} tabIndex={-1} data-takes-over={keyList} className={className ?? 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring'}>
      {children}
    </div>
  );
}

/**
 * Where a list's rows carry forms with `refreshOnError` keys starting with `prefix` (`present`: the keys of the rows
 * listed now), what a refused form's row says when the refresh removed it (UX recheck of PR #50, N6): no explanation
 * of its own takes its place, so this note shows the refusal as the form showed it, after `lead`, and takes the focus.
 * Otherwise it is an empty wrapper (the page whose focus it reads). A row still listed keeps its own explanation
 * (RefusalTakeover) or form.
 */
export function RefusalFallback({ prefix, present, lead }: { readonly prefix: string; readonly present: readonly string[]; readonly lead: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [taken, setTaken] = useState<OrphanedRefusal | null>(null);
  const presentList = present.join(' ');
  // Read from the page the wrapper is in (its document's focus), after the list's own explanations had their turn.
  useLayoutEffect(() => {
    const page = ref.current?.ownerDocument;
    if (page === undefined) {
      return;
    }
    const active = page.activeElement;
    const orphaned = takesOrphanedRefusal(prefix, presentList.split(' '), Date.now(), active === null || active === page.body);
    if (orphaned !== null) {
      setTaken(orphaned);
    }
  }, [prefix, presentList]);
  useEffect(() => {
    if (taken !== null) {
      ref.current?.focus();
    }
  }, [taken]);
  return (
    <div
      ref={ref}
      tabIndex={taken === null ? undefined : -1}
      data-takes-over={taken === null ? undefined : `${prefix}*`}
      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {taken === null ? null : (
        <Alert variant="destructive" data-state="refused-row-gone">
          {/* Titled as the form's summary was: a key used before is "Already sent", its row gone or not. */}
          <AlertTitle>{SUMMARY_TITLES[taken.kind]}</AlertTitle>
          <AlertDescription>
            <p>{lead}</p>
            {taken.lines.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {taken.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * The items of the summary a form shows now, read when they are asked for: the summary names each field from the page
 * after its first render, so the lines are read as the person last saw them, the form gone or not.
 */
function summaryLines(form: HTMLFormElement | null): () => readonly string[] {
  const summary = form?.querySelector(':scope > [data-slot="refusal-summary"]') ?? null;
  return () => (summary === null ? [] : [...summary.querySelectorAll('li')].map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

/**
 * Reads the page again after each refusal of a form with `refreshOnError` (noting its `takeover` key first), or of any
 * form whose page was out of date (`stale`, no takeover: the fresh token and key render in place). A component of its
 * own, rendered only for such a form or state, so the router is read only there: every other form renders, as before,
 * outside the app router too (a component test's renderToString). Once per state: the effect runs twice when React's
 * strict mode mounts it, and a second refresh would only cost a round trip. The forms that submit as ActionForm does
 * without being one (the version form, the export form) render it for a stale state too.
 */
export function RefreshAfterRefusal({ state, takeover, formRef }: { readonly state: ActionState; readonly takeover: string | undefined; readonly formRef: RefObject<HTMLFormElement | null> }) {
  const router = useRouter();
  const done = useRef<ActionState | null>(null);
  useEffect(() => {
    if (state.error === undefined || done.current === state) {
      return;
    }
    done.current = state;
    if (takeover !== undefined) {
      refused = { key: takeover, at: Date.now(), lines: summaryLines(formRef.current), kind: summaryKind(state) };
    }
    router.refresh();
  }, [state, router, takeover, formRef]);
  return null;
}
