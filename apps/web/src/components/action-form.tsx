'use client';

import { Alert, AlertDescription, AlertTitle, Button } from '@tp/ui';
import { useRouter } from 'next/navigation';
import { type ReactNode, useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import type { ActionState } from '../lib/http/next';

/**
 * A form posting to a server action, showing what the action refused: the error, each field's
 * problem, and the password policy's unmet rules. On success the action redirects, so a fresh page
 * (with a fresh request key) replaces the form. A field's problem is named by the field's label (`labels`; its key
 * where none is given), and the control it names is marked invalid and described by it; the focus, which the
 * disabled button dropped while the request was pending, moves to the first such control, or to the summary.
 *
 * The refusal's first line is the action's error. The generic one of an invalid form ("Check the fields marked
 * below.", `invalid`) shows only when an issue marked a control the person can see: when every issue names a hidden
 * field (the run an Accept button carries) there is nothing marked below, so the issues stand alone under "Not done".
 *
 * A form whose refusal can mean the page itself is out of date (an Accept or Re-run button another person's
 * change has overtaken: combined audit #10, docs/adr/0037) sets `refreshOnError` to a key of its own: after a
 * refusal the page is read again (router.refresh, as the export status does). Still rendered, the form keeps its
 * state, its refusal and the focus. Replaced by an explanation that names the same key (RefusalTakeover), the
 * focus, which the form took with it, moves to that explanation, so a keyboard or screen-reader user lands on why
 * and on its next step. Forms without the prop are unchanged.
 */
export function ActionForm({
  action,
  submit,
  children,
  variant = 'default',
  className,
  labels = {},
  refreshOnError,
  wrapSubmit = false,
}: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The button's words; may hold a figure in the mono face (<Money/>). */
  readonly submit: ReactNode;
  readonly children?: ReactNode;
  readonly variant?: 'default' | 'outline' | 'destructive';
  readonly className?: string;
  /** The label of each field a refusal may name, by its key, as the form shows it. */
  readonly labels?: Readonly<Record<string, string>>;
  /** Read the page again after a refusal, for a form a change elsewhere can overtake: the key an explanation that may take its place names. */
  readonly refreshOnError?: string;
  /**
   * Let the button's words wrap, for a label long enough to outrun its card at a phone's width (WCAG 1.4.10, reflow
   * at 320 px): the Button is one line by default (UX recheck of PR #50, N1).
   */
  readonly wrapSubmit?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const issueId = useId();
  // The refusal whose issues marked a visible control, so the generic first line points at something.
  const [markedFor, setMarkedFor] = useState<ActionState | null>(null);
  useLayoutEffect(() => {
    const form = formRef.current;
    if (form === null || state.error === undefined) {
      return undefined;
    }
    const marked: { readonly control: HTMLElement; readonly describedBy: string | null }[] = [];
    (state.issues ?? []).forEach((issue, index) => {
      const control = form.elements.namedItem(issue.field);
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || control.type === 'hidden') {
        return;
      }
      const describedBy = control.getAttribute('aria-describedby');
      marked.push({ control, describedBy });
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', [`${issueId}-${String(index)}`, describedBy].filter((part) => part !== null && part !== '').join(' '));
    });
    setMarkedFor(marked.length > 0 ? state : null);
    (marked[0]?.control ?? summaryRef.current)?.focus();
    return () => {
      for (const { control, describedBy } of marked) {
        control.removeAttribute('aria-invalid');
        if (describedBy === null) {
          control.removeAttribute('aria-describedby');
        } else {
          control.setAttribute('aria-describedby', describedBy);
        }
      }
    };
  }, [state, issueId]);
  return (
    <form ref={formRef} action={formAction} className={className ?? 'flex flex-col gap-4'}>
      {refreshOnError === undefined ? null : <RefreshAfterRefusal state={state} takeover={refreshOnError} labels={labels} />}
      {children}
      {state.error === undefined ? null : (
        <Alert variant="destructive" data-state={state.locked === true ? 'locked' : 'error'} ref={summaryRef} tabIndex={-1}>
          <AlertTitle>{state.locked === true ? 'Account locked' : 'Not done'}</AlertTitle>
          <AlertDescription>
            {summaryLead(state, markedFor === state) === null ? null : <p>{state.error}</p>}
            {state.issues === undefined || state.issues.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {state.issues.map((issue, index) => (
                  <li key={`${issue.field}:${issue.message}`} id={`${issueId}-${String(index)}`}>
                    {labels[issue.field] ?? issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {state.problems === undefined ? null : <p className="mt-1">It needs {state.problems.join(', ')}.</p>}
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant={variant} disabled={pending} className={wrapSubmit ? 'h-auto min-h-9 whitespace-normal text-left' : undefined}>
          {pending ? 'Working…' : submit}
        </Button>
      </div>
    </form>
  );
}

/**
 * The refusal's first line: the action's error, except the generic line of an invalid form when no issue marked a
 * visible control (`marked`), which would point at nothing (null: the issues stand alone).
 */
export function summaryLead(state: ActionState, marked: boolean): string | null {
  if (state.error === undefined) {
    return null;
  }
  return state.invalid === true && !marked && (state.issues?.length ?? 0) > 0 ? null : state.error;
}

/** How long after a refusal's refresh an explanation may still take the focus: the refresh's round trip, with room. */
const TAKEOVER_MS = 15_000;

/**
 * The form refused last that asked for a refresh, by its key, when, and its refusal as the form showed it (each issue
 * after its field's label): one per page, in this browser tab's memory.
 */
let refused: { readonly key: string; readonly at: number; readonly lines: readonly string[] } | null = null;

/** Records a refusal of the form with this key, before its refresh (RefreshAfterRefusal), with its lines. */
export function noteRefusal(key: string, at: number, lines: readonly string[] = []): void {
  refused = { key, at, lines };
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

/**
 * The refusal of a form whose key starts with `prefix` but names none of `present` (its row left the list on the
 * refresh, so no explanation takes its place), within TAKEOVER_MS, when the focus fell to the page: its lines, which
 * ends the hand-off. Null otherwise (an explanation of its own took it, or none is due).
 */
export function takesOrphanedRefusal(prefix: string, present: readonly string[], at: number, focusLost: boolean): readonly string[] | null {
  if (refused === null || !focusLost || !refused.key.startsWith(prefix) || present.includes(refused.key) || at - refused.at > TAKEOVER_MS) {
    return null;
  }
  const { lines } = refused;
  refused = null;
  return lines;
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
  const [lines, setLines] = useState<readonly string[] | null>(null);
  const presentList = present.join(' ');
  // Read from the page the wrapper is in (its document's focus), after the list's own explanations had their turn.
  useLayoutEffect(() => {
    const page = ref.current?.ownerDocument;
    if (page === undefined) {
      return;
    }
    const active = page.activeElement;
    const taken = takesOrphanedRefusal(prefix, presentList.split(' '), Date.now(), active === null || active === page.body);
    if (taken !== null) {
      setLines(taken);
    }
  }, [prefix, presentList]);
  useEffect(() => {
    if (lines !== null) {
      ref.current?.focus();
    }
  }, [lines]);
  return (
    <div
      ref={ref}
      tabIndex={lines === null ? undefined : -1}
      data-takes-over={lines === null ? undefined : `${prefix}*`}
      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {lines === null ? null : (
        <Alert variant="destructive" data-state="refused-row-gone">
          <AlertTitle>Not done</AlertTitle>
          <AlertDescription>
            <p>{lead}</p>
            {lines.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {lines.map((line) => (
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
 * Reads the page again after each refusal (ActionForm's `refreshOnError`). A component of its own, rendered only for
 * a form that asks, so the router is read only there: every other form renders, as before, outside the app router
 * too (a component test's renderToString).
 */
function RefreshAfterRefusal({ state, takeover, labels }: { readonly state: ActionState; readonly takeover: string; readonly labels: Readonly<Record<string, string>> }) {
  const router = useRouter();
  // The labels as rendered last, read when a refusal arrives: a new object each render, so never a reason to refresh again.
  const labelsRef = useRef(labels);
  useLayoutEffect(() => {
    labelsRef.current = labels;
  });
  useEffect(() => {
    if (state.error !== undefined) {
      noteRefusal(
        takeover,
        Date.now(),
        (state.issues ?? []).map((issue) => `${labelsRef.current[issue.field] ?? issue.field}: ${issue.message}`),
      );
      router.refresh();
    }
  }, [state, router, takeover]);
  return null;
}
