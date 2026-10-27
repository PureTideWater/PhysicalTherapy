'use client';

import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import { unstable_rethrow } from 'next/navigation';
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  createContext,
  startTransition,
  use,
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Issue } from '../lib/http/route';

/**
 * A refused form, as the person sees it (docs/adr/0077): what was typed stays, each refused field shows "Error:" and
 * the rule's words under it, and a summary first in the form names each field by the label the person sees, links to
 * it and takes the focus (or gives it to the one field refused). Secrets are emptied after a refusal, and a note under
 * each says so. Nothing here echoes a value: the state carries flags, keys and the rule's words only.
 */

/** What a server action returns to a form that did not move on (ActionState, lib/http/next.ts, read structurally). */
export interface RefusalState {
  readonly error?: string;
  /** The error is the lead of an invalid form, which the browser chooses again from the issues it places. */
  readonly invalid?: boolean;
  readonly issues?: readonly Issue[];
  readonly locked?: boolean;
  /** The page's CSRF token or request key was out of date: the form reads the page again. */
  readonly stale?: boolean;
}

/** The state a form shows: the action's, plus two fields only the browser sets, never the server. */
export type FormState = RefusalState & {
  /** A new number per response from the browser, so each response inserts a new summary, which is announced. */
  readonly seq?: number;
  /** The connection dropped before an answer came back: the server may have saved. */
  readonly unconfirmed?: true;
};

/** The refusal a form is showing: its issues ([] when none) and whether it shows one at all (the emptied notes). */
export const FormIssuesContext = createContext<{ readonly issues: readonly Issue[]; readonly refused: boolean }>({ issues: [], refused: false });

/** Whether a form's state is a refusal it shows: an error, or a dropped connection. */
function refused(state: FormState): boolean {
  return state.error !== undefined || state.unconfirmed === true;
}

/** Gives the fields inside a form the refusal it shows: one provider per form, so row forms never mark each other. */
export function FormIssues({ state, children }: { readonly state: FormState; readonly children: ReactNode }) {
  const value = useMemo(() => ({ issues: state.issues ?? [], refused: refused(state) }), [state]);
  return <FormIssuesContext value={value}>{children}</FormIssuesContext>;
}

/** Whether an issue's key names the control `key`: the key itself, or one of its entries ("kept.3"). */
function keyMatches(field: string, key: string): boolean {
  return field === key || field.startsWith(`${key}.`);
}

/**
 * The messages a refusal gives the control named `name`: an issue whose key is the name, the name without a
 * trailing [] (a checkbox group posts components[]; the route names "components"), a key in `issueFor`, or a
 * key under one of those with a dotted index ("kept.3"). Several messages are joined with "; ".
 */
export function useFieldIssue(name: string | undefined, issueFor: readonly string[] = []): string | undefined {
  const { issues } = use(FormIssuesContext);
  const keys = [...(name === undefined ? [] : [name, name.endsWith('[]') ? name.slice(0, -2) : name]), ...issueFor];
  const messages = issues.filter((issue) => keys.some((key) => keyMatches(issue.field, key))).map((issue) => issue.message);
  return messages.length === 0 ? undefined : [...new Set(messages)].join('; ');
}

/**
 * The name a summary item gives a field, from the label the person sees: white space collapsed, a trailing colon and
 * one trailing parenthetical dropped ("Billing ZIP (ZIP+4 if Medicare needs one)" is "Billing ZIP"), except one that
 * says posted or deposited, which "recovered" must keep (.claude/rules/brand.md).
 */
export function fieldName(label: string): string {
  const collapsed = label.replace(/\s+/g, ' ').trim().replace(/\s*:$/, '');
  const note = /\s*\(([^()]*)\)$/.exec(collapsed);
  const name = note === null || /\b(posted|deposited)\b/i.test(note[1] ?? '') ? collapsed : collapsed.slice(0, note.index);
  return name.replace(/\s*:$/, '');
}

/** A 14 px circle with an exclamation mark, in the text's color, beside the word "Error:" (never color alone). */
function ErrorIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 14 14" width="14" height="14" className="mt-0.5 shrink-0">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 3.8v3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="10.2" r="0.85" fill="currentColor" />
    </svg>
  );
}

/**
 * What the server refused of a field, under it. The element `{id}-error` holds the message alone: it describes the
 * control (aria-describedby), which aria-invalid already announces as invalid, so the visible "Error:" is not read twice.
 */
export function FieldError({ id, error }: { readonly id: string; readonly error: string | undefined }) {
  return error === undefined ? null : (
    <div data-field-error className="flex items-start gap-1.5 text-sm text-destructive">
      <ErrorIcon />
      <span aria-hidden="true" className="font-semibold">
        Error:
      </span>
      <p id={`${id}-error`}>{error}</p>
    </div>
  );
}

/** Which secret a field holds: a password the person types again, or a one-time code whose hint says what next. */
export type SecretKind = 'password' | 'code';

/** Whether a secret field shows its emptied note: while its form shows a refusal (the form emptied it). */
export function useEmptied(secret: SecretKind | undefined): boolean {
  return use(FormIssuesContext).refused && secret !== undefined;
}

/** The note under a secret field its form emptied after a refusal, so a password manager's dots are not taken for it. */
export function EmptiedNote({ id, secret }: { readonly id: string; readonly secret: SecretKind | undefined }) {
  return useEmptied(secret) ? (
    <p id={`${id}-emptied`} data-slot="emptied-note" className="text-sm text-muted-foreground">
      {secret === 'password' ? 'Emptied for your security: type it again.' : 'Emptied for your security.'}
    </p>
  ) : null;
}

/** The ids that describe a control: its error first (read first), then the emptied note of a secret field, then its hint. */
export function describedBy(id: string, parts: { readonly error?: string | undefined; readonly emptied?: boolean; readonly hint?: string | undefined }): string | undefined {
  const ids = [parts.error === undefined ? null : `${id}-error`, parts.emptied === true ? `${id}-emptied` : null, parts.hint === undefined ? null : `${id}-hint`].filter((part) => part !== null);
  return ids.length === 0 ? undefined : ids.join(' ');
}

/**
 * Beside a form's button: a polite status, present from the first render, that says "Working…" while the form is
 * pending, so the button keeps its words and its focus. It reads no context, so a form that is no ActionForm uses it.
 */
export function PendingStatus({ pending }: { readonly pending: boolean }) {
  return (
    <p role="status" className="text-sm text-muted-foreground" data-slot="pending-status">
      {pending ? 'Working…' : ''}
    </p>
  );
}

/** A server action as a form calls it. */
type FormAction = (state: RefusalState, form: FormData) => Promise<RefusalState>;

/** A form's submission, from useGuardedSubmit. */
export interface GuardedSubmit {
  /** The state of whichever hook ran last: the browser's after a press on this page, the server's otherwise. */
  readonly state: FormState;
  /** The state came from a press on this page (the browser's hook), so a summary may invite pressing again. */
  readonly fromBrowser: boolean;
  /** A request is out, from either hook. */
  readonly pending: boolean;
  /** For `<form action>`: the server action itself, so the post without JavaScript and a pre-hydration replay work. */
  readonly formAction: (form: FormData) => void;
  /** For `<form onSubmit>`: guards, then sends the form's data with its submitter, with no reset of the form. */
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Sends `data` through the browser's hook, unguarded: for a form that guards once and chooses among actions. */
  readonly send: (data: FormData) => void;
}

/**
 * A form's submission from the browser (docs/adr/0077, D1). Two useActionState hooks over the same server action:
 * the server's, whose dispatcher goes on `<form action>` and so must take the server action itself, never a wrapper
 * (a wrapper drops the $ACTION_* fields the post without JavaScript needs); and the browser's, dispatched from
 * `onSubmit` after preventDefault, so React's form-action listener never resets the form on a refusal. The browser's
 * hook turns a dropped connection (fetch's TypeError, with no digest) into an `unconfirmed` state and rethrows
 * everything else: a server failure reaches the error boundary with its reference, and Next's redirect remounts the
 * form, which is how a saved form starts fresh.
 *
 * The `inFlight` ref is the only guard that stops two presses in one frame (state lets the second through); a form
 * with several actions passes one ref to each hook. `beforeSubmit` runs after the guard's check and before it is
 * set; false sends nothing. startTransition is called synchronously in onSubmit, so useFormStatus pends too.
 */
export function useGuardedSubmit(
  action: FormAction,
  options: { readonly beforeSubmit?: (form: HTMLFormElement) => boolean; readonly inFlight?: RefObject<boolean> } = {},
): GuardedSubmit {
  const [serverState, formAction, serverPending] = useActionState(action, {});
  const [browserState, dispatch, browserPending] = useActionState(async (previous: FormState, data: FormData): Promise<FormState> => {
    const seq = (previous.seq ?? 0) + 1;
    try {
      return { ...(await action(previous, data)), seq };
    } catch (error) {
      unstable_rethrow(error);
      if (!(error instanceof TypeError) || 'digest' in error) {
        throw error;
      }
      return { unconfirmed: true, seq };
    }
  }, {});
  const [source, setSource] = useState<'server' | 'browser'>('server');
  const pending = serverPending || browserPending;
  const ownGuard = useRef(false);
  const inFlight = options.inFlight ?? ownGuard;
  useEffect(() => {
    if (!pending) {
      inFlight.current = false;
    }
  }, [pending, inFlight]);
  const { beforeSubmit } = options;
  function send(data: FormData): void {
    startTransition(() => {
      setSource('browser');
      dispatch(data);
    });
  }
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    const form = event.currentTarget;
    if (beforeSubmit !== undefined && !beforeSubmit(form)) {
      return;
    }
    inFlight.current = true;
    send(new FormData(form, (event.nativeEvent as SubmitEvent).submitter));
  }
  return { state: source === 'browser' ? browserState : serverState, fromBrowser: source === 'browser', pending, formAction, onSubmit, send };
}

/** The keys that never name a field the person filled: root refinements and database rules, and the request key. */
const NO_FIELD = new Set(['input', 'requestKey']);

/**
 * The lead under the summary's title: the action's error, except an invalid form's, which the browser chooses by the
 * issues that name a field (`placed`, from the page; null before it is read: every issue whose key is neither `input`
 * nor `requestKey`): one, the singular; several, the plural; none, no lead, so issues on hidden fields stand alone.
 */
export function summaryLead(state: RefusalState, placed: number | null): string | null {
  if (state.error === undefined) {
    return null;
  }
  const issues = state.issues ?? [];
  if (state.invalid !== true || issues.length === 0) {
    return state.error;
  }
  const count = placed ?? issues.filter((issue) => !NO_FIELD.has(issue.field)).length;
  if (count === 0) {
    return null;
  }
  return count === 1 ? 'Fix the field listed here, then try again.' : 'Fix the fields listed here, then try again.';
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** An issue placed in the form: the control it focuses, the element its link scrolls to, and its name, if any. */
interface Placed {
  readonly control: Control;
  readonly heading: HTMLElement;
  readonly name: string | null;
}

/** A control the person fills: never a hidden field or a button. */
function isControl(element: unknown): element is Control {
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return true;
  }
  return element instanceof HTMLInputElement && !['hidden', 'submit', 'button', 'reset', 'image'].includes(element.type);
}

function legendOf(fieldset: HTMLFieldSetElement | null): HTMLLegendElement | null {
  return fieldset?.querySelector<HTMLLegendElement>(':scope > legend') ?? null;
}

/** A target's name, as 3.4 of the design orders it: data-error-name; a group's legend; the control's own label. */
function nameOf(control: Control, group: HTMLFieldSetElement | null): string | null {
  const text = control.dataset.errorName ?? group?.dataset.errorName ?? (group === null ? null : legendOf(group)?.textContent) ?? control.labels?.[0]?.textContent ?? null;
  return text === null || text.trim() === '' ? null : fieldName(text);
}

/** Resolves one key: by name, by name with [], then a control or fieldset that declares it through data-issue-for. */
function resolveKey(form: HTMLFormElement, key: string): Placed | null {
  for (const name of [key, `${key}[]`]) {
    const item = form.elements.namedItem(name);
    const controls = (item instanceof RadioNodeList ? [...item] : [item]).filter(isControl);
    const first = controls[0];
    if (first !== undefined) {
      const group = controls.length > 1 ? first.closest('fieldset') : null;
      return { control: first, heading: legendOf(group) ?? first.labels?.[0] ?? first, name: nameOf(first, group) };
    }
  }
  const declared = [...form.querySelectorAll<HTMLElement>('[data-issue-for]')].find((element) => (element.dataset.issueFor ?? '').split(' ').includes(key));
  if (declared instanceof HTMLFieldSetElement) {
    const first = [...declared.elements].find(isControl);
    return first === undefined ? null : { control: first, heading: legendOf(declared) ?? first, name: nameOf(first, declared) };
  }
  return isControl(declared) ? { control: declared, heading: declared.labels?.[0] ?? declared, name: nameOf(declared, null) } : null;
}

/** An issue's target: its key, then the key's part before its first dot ("kept.3" is "kept"). */
function resolveIssue(form: HTMLFormElement, field: string): Placed | null {
  const dot = field.indexOf('.');
  return resolveKey(form, field) ?? (dot > 0 ? resolveKey(form, field.slice(0, dot)) : null);
}

/**
 * The name a hidden field gives its issue, from its own `data-error-name`: a record the form carries (the run an Accept
 * button names), which the person never fills, so its item reads "{name}: {message}" but is never a link, never
 * focused and never counted as placed (the route words such messages to read after it: docs/adr/0037). Null without.
 */
function hiddenName(form: HTMLFormElement, field: string): string | null {
  const dot = field.indexOf('.');
  for (const key of dot > 0 ? [field, field.slice(0, dot)] : [field]) {
    for (const name of [key, `${key}[]`]) {
      const item = form.elements.namedItem(name);
      const first = item instanceof RadioNodeList ? item[0] : item;
      const text = first instanceof HTMLInputElement && first.type === 'hidden' ? first.dataset.errorName : undefined;
      if (text !== undefined && text.trim() !== '') {
        return fieldName(text);
      }
    }
  }
  return null;
}

/** Empties every secret in the form (docs/adr/0077, D2): marked by its component, or by its type as the fallback. */
function emptySecrets(form: HTMLFormElement): void {
  for (const control of form.querySelectorAll<HTMLInputElement>('input[data-secret], input[type="password"], input[autocomplete="one-time-code"]')) {
    control.value = '';
  }
}

/**
 * Marks a control no shared field renders (a hand-written control): aria-invalid, and the summary item first in its
 * description. A control its component already marks is left alone. Returns the undo, for the next state.
 */
function markByHand(control: Control, itemId: string): (() => void) | null {
  if (control.getAttribute('aria-invalid') === 'true' || control.closest('[data-invalid]') !== null) {
    return null;
  }
  const described = control.getAttribute('aria-describedby');
  control.setAttribute('aria-invalid', 'true');
  control.setAttribute('aria-describedby', [itemId, described].filter((part) => part !== null && part !== '').join(' '));
  return () => {
    control.removeAttribute('aria-invalid');
    if (described === null) {
      control.removeAttribute('aria-describedby');
    } else {
      control.setAttribute('aria-describedby', described);
    }
  };
}

function capitalised(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1);
}

/** The summary's props: the form's state and whether it came from a press on this page, its button's words, the form. */
export interface RefusalSummaryProps {
  readonly state: FormState;
  readonly fromBrowser: boolean;
  /** The form's button words, which a dropped connection or an out-of-date page invites the person to press again. */
  readonly submit: ReactNode;
  readonly formRef: RefObject<HTMLFormElement | null>;
}

/**
 * A refused form's summary, rendered first inside the form, before its fields, on a line of its own in any layout. Each
 * response inserts a new one (keyed by `seq`), so the same refusal twice is announced twice.
 */
export function RefusalSummary(props: RefusalSummaryProps) {
  return <Summary key={props.state.seq ?? 0} {...props} />;
}

function Summary({ state, fromBrowser, submit, formRef }: RefusalSummaryProps) {
  const itemId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  // Each issue's target, read from the page for the state it was read for (null before: the server render), and the
  // name a hidden field gives an issue with no target.
  const [placement, setPlacement] = useState<{ readonly state: FormState; readonly targets: readonly (Placed | null)[]; readonly hidden: readonly (string | null)[] } | null>(null);
  const shown = refused(state);
  useLayoutEffect(() => {
    const form = formRef.current;
    if (form === null || !shown) {
      return undefined;
    }
    // In this order: secrets emptied, targets read and named, hand-written controls marked, then the focus.
    emptySecrets(form);
    const issues = state.issues ?? [];
    const targets = issues.map((issue) => resolveIssue(form, issue.field));
    const undo = targets.map((target, index) => (target === null ? null : markByHand(target.control, `${itemId}-${String(index)}`)));
    setPlacement({ state, targets, hidden: issues.map((issue, index) => (targets[index] === null ? hiddenName(form, issue.field) : null)) });
    const only = issues.length === 1 ? targets[0] : null;
    (only?.control ?? summaryRef.current)?.focus();
    return () => {
      for (const restore of undo) {
        restore?.();
      }
    };
  }, [state, shown, formRef, itemId]);
  if (!shown) {
    return null;
  }
  const read = placement?.state === state ? placement : null;
  const targets = read?.targets ?? null;
  const kind = state.locked === true ? 'locked' : state.unconfirmed === true ? 'unconfirmed' : 'error';
  return (
    <Alert variant="destructive" data-state={kind} data-slot="refusal-summary" ref={summaryRef} tabIndex={-1} className="col-span-full basis-full w-full">
      <AlertTitle>{kind === 'locked' ? 'Account locked' : kind === 'unconfirmed' ? 'Not confirmed' : 'Not done'}</AlertTitle>
      <AlertDescription>
        <RefusalLead state={state} placed={targets === null ? null : targets.filter((target) => target !== null).length} fromBrowser={fromBrowser} submit={submit} />
        {state.issues === undefined || state.issues.length === 0 ? null : (
          <ul className="mt-1 list-disc pl-5">
            {state.issues.map((issue, index) => {
              const target = targets?.[index] ?? null;
              const hidden = read?.hidden[index] ?? null;
              return (
                <li key={`${issue.field}:${String(index)}`} id={`${itemId}-${String(index)}`}>
                  {target !== null ? <ItemLink target={target} message={issue.message} /> : hidden === null ? capitalised(issue.message) : `${hidden}: ${issue.message}`}
                </li>
              );
            })}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The summary's lead: the connection, the out-of-date page, or the action's error as summaryLead chooses it. Exported
 * for a form with a summary of its own (the export form), so its leads read the same.
 */
export function RefusalLead({ state, placed, fromBrowser, submit }: { readonly state: FormState; readonly placed: number | null; readonly fromBrowser: boolean; readonly submit: ReactNode }) {
  if (state.unconfirmed === true) {
    return <p>The connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “{submit}” again.</p>;
  }
  if (state.stale === true) {
    // The flag, never the server's words, which end in a reload for the forms that do not read the page again (next.ts).
    // Only a press the person just made on this page may be invited again: any other post may not be theirs.
    return fromBrowser ? (
      <p>This page was out of date, so nothing was saved. It is up to date now: press “{submit}” again.</p>
    ) : (
      <p>This page was out of date, so nothing was saved. Check the form, then send it again if you still mean to.</p>
    );
  }
  const lead = summaryLead(state, placed);
  return lead === null ? null : <p>{lead}</p>;
}

/** An item's link to its field: the focus goes to the control, and its label or legend scrolls into view; the URL stays. */
function ItemLink({ target, message }: { readonly target: Placed; readonly message: string }) {
  function follow(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    target.control.focus({ preventScroll: true });
    target.heading.scrollIntoView({ block: 'center' });
  }
  return (
    <a href={target.control.id === '' ? '#' : `#${target.control.id}`} onClick={follow} className="underline underline-offset-2">
      {target.name === null ? capitalised(message) : `${target.name}: ${message}`}
    </a>
  );
}
