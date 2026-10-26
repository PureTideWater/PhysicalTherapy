# Slice A: the API slices B, D and E were built against

One spec, merged from builders B, D and E (build part 1) and checked against design sections 2.1, 2.3, 2.7, 3.2 to
3.6, 4.1, 4.6 and 5.3 (`/home/user/ops/designs/lane-b-ux-forms.md`). No builder conflicted with another or with the
design on a signature. The one difference from the design's text, D's local `inFlight` refs, is under "Not exported".
Paths are under `apps/web/src/`.

`Issue` is `import type { Issue } from '../lib/http/route'` (`{ readonly field: string; readonly message: string }`).

## `lib/http/next.ts`

```ts
export interface ActionState {
  readonly error?: string;
  readonly invalid?: boolean;            // #50's
  readonly issues?: readonly Issue[];
  readonly locked?: boolean;
  readonly stale?: boolean;              // new (3.5a)
  // `problems` REMOVED. Slice B's StepResult no longer sends it (lib/routes/sign-in.ts).
}
```
- `runSignInStep` keeps returning the route's `StepResult` as the `ActionState`. B's StepResult is
  `{ redirect } | { error; locked?; issues? }`, which is assignable.
- The invalid lead is 'Fix the fields listed here, then try again.' at both sites (:162, :180). `csrf_refused`, or an
  invalid outcome whose only issue is `requestKey`, becomes `{ error: 'This page was out of date, so nothing was saved.', stale: true }`.

## `components/action-form.tsx`

```ts
export function ActionForm(props: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  readonly submit: ReactNode;
  readonly children?: ReactNode;
  readonly variant?: 'default' | 'outline' | 'destructive';
  readonly className?: string;
  /** Client-only: called in onSubmit after the in-flight check and before the guard is set; false sends nothing (4.6). */
  readonly beforeSubmit?: (form: HTMLFormElement) => boolean;
  // #50's props kept (refreshOnError, ...). `labels` REMOVED (C2 removes the one caller, settings/pricing).
}): JSX.Element;
```
- Used by: D `components/screening/split-form.tsx` (`beforeSubmit` calls `flushSync` and `.focus()`, then returns
  false). Until the prop exists, the file has 4 `no-unsafe-*` lint errors at split-form.tsx:148 and a typecheck error.
- Markup E's e2e asserts:
  - `RefusalSummary` is rendered before `{children}`, so it is the first child of the form that is not a hidden input.
    It is an `Alert` with `tabIndex={-1}`, `data-slot="refusal-summary"`, `className` `col-span-full basis-full w-full`,
    `data-state` `error | locked | unconfirmed`, and `key={state.seq ?? 0}`.
  - The title reads "Not done", "Account locked" or "Not confirmed".
  - Each item is `<li id><a href="#{control id}">{name}: {message}</a></li>`. A click calls `preventDefault`, so the URL
    does not change.
  - The leads, exactly:
    - one issue placed: "Fix the field listed here, then try again."
    - several issues placed: "Fix the fields listed here, then try again."
    - a dropped connection: "The connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “{submit}” again."
    - a stale page after the person's own press: "This page was out of date, so nothing was saved. It is up to date now: press “{submit}” again."
    - a stale page from any other post: "This page was out of date, so nothing was saved. Check the form, then send it again if you still mean to."
  - The button gets `aria-disabled={pending || undefined}` and is never `disabled`. Its words never change.
    `<PendingStatus pending={pending} />` goes inside the button's wrapper `<div className="flex flex-wrap items-center gap-2">`.
  - Secrets are emptied: `[data-secret]`, plus `input[type=password]` and `[autocomplete=one-time-code]` as the fallback.
  - Focus moves to the one placed control, or else to the summary. For a group key (`components` resolving to
    `components[]`), the control is the first box.

## `components/form-issues.tsx` (`'use client'`)

```ts
export const FormIssuesContext: React.Context<{ readonly issues: readonly Issue[]; readonly refused: boolean }>; // default { issues: [], refused: false }
export function useFieldIssue(name: string | undefined, issueFor?: readonly string[]): string | undefined;      // joins several with "; "
export function fieldName(label: string): string;                                                              // 3.4's tidy rule; keeps "(posted)"/"(deposited)"
export function FieldError(props: { readonly id: string; readonly error: string | undefined }): JSX.Element | null;
export function PendingStatus(props: { readonly pending: boolean }): JSX.Element;
export function RefusalSummary(/* internal to ActionForm and version-form; props are slice A's choice */): JSX.Element | null;
export function useGuardedSubmit(/* slice A's choice: ActionForm and C1's version-form use it */): unknown;
```
- `FieldError` markup (E and D's billing test depend on it):
  `<div data-field-error className="flex items-start gap-1.5 text-sm text-destructive"><ErrorIcon/><span aria-hidden="true" className="font-semibold">Error:</span><p id={`${id}-error`}>{message}</p></div>`.
  The element with id `{id}-error` holds the message alone.
- `PendingStatus` markup, exactly:
  `<p role="status" className="text-sm text-muted-foreground" data-slot="pending-status">{pending ? 'Working…' : ''}</p>`.
  It reads no context, so D's Stripe form, which is not an ActionForm, can use it. D's billing test matches `role="status"`
  and `data-slot="pending-status"` in any order, with empty content.
- The emptied note is `<p id="{id}-emptied" data-slot="emptied-note" className="text-sm text-muted-foreground">`. It
  reads "Emptied for your security: type it again." for a password and "Emptied for your security." for a code. It
  renders only while `refused` is true, and its id goes in `aria-describedby` after the error and before the hint.
  Before any refusal, the description of New password must equal its hint exactly (E).

## `components/field.tsx` (`'use client'`)

```ts
export function Field(props: { readonly label: string; readonly name: string; readonly hint?: string; readonly error?: string;
  readonly errorName?: string; readonly issueFor?: readonly string[] } & ComponentProps<'input'>): JSX.Element;
export function SelectField(props: { readonly label: string; readonly name: string;
  readonly options: readonly { readonly value: string; readonly label: string }[]; readonly hint?: string; readonly error?: string;
  readonly errorName?: string; readonly issueFor?: readonly string[] } & Omit<ComponentProps<'select'>, 'children'>): JSX.Element;
export function TextAreaField(props: { readonly label: string; readonly name: string; readonly hint?: string; readonly rows?: number;
  readonly error?: string; readonly errorName?: string; readonly issueFor?: readonly string[] } & ComponentProps<'textarea'>): JSX.Element;
export function CheckboxField(props: { readonly name: string; readonly label: ReactNode; readonly errorName: string; readonly hint?: string;
  readonly value?: string; readonly defaultChecked?: boolean; readonly required?: boolean; readonly id?: string }): JSX.Element;
export function CheckboxGroup(props: { readonly legend: string; readonly issueKey: string;
  readonly options: readonly { readonly name: string; readonly value?: string; readonly label: ReactNode; readonly defaultChecked?: boolean; readonly required?: boolean }[];
  readonly hint?: string }): JSX.Element;
```
- The default id stays `field-${name}`. `errorName` is written as `data-error-name`, and `issueFor` as `data-issue-for`
  (space-joined).
- `Field` writes `data-secret` when `autoComplete === 'one-time-code'` (B's code fields depend on it).
- `CheckboxField`'s wrapper carries `data-slot="checkbox-field"` and `data-invalid` when refused. The fieldset of
  `CheckboxGroup` carries `data-invalid` when refused, holds `[data-field-error]` after the legend and hint, and its
  `aria-describedby` names the message and hint. Its own layout is used: D passes no `className`.
- Callers in build part 1:
  - B: `Field` on the sign-in pages (`label`, `name`, `type`, `autoComplete`, `inputMode`, `maxLength`, `hint`,
    `required`).
  - D:
    - `CheckboxGroup` on console/status, with every option named `components[]` and `issueKey="components"`.
    - `CheckboxField` ×2 on account/notifications.
    - `hint` on `Field` and `TextAreaField` on support, console/compliance and console/organizations.

## `components/password-field.tsx` (`'use client'`)

```ts
export function PasswordField(props: { readonly label: string; readonly name: string; readonly showName: string;
  readonly hint?: string; readonly error?: string; readonly errorName?: string; readonly issueFor?: readonly string[];
  readonly id?: string } & Omit<ComponentProps<'input'>, 'type'>): JSX.Element;
```
- B passes `label`, `name`, `showName` (" password", " new password", " new password again"), `autoComplete`,
  `required`, `minLength` and `hint`.
- E asserts the following:
  - The toggle is named "Show new password" exactly, through visible text plus `showName` in an sr-only span, never
    `aria-label`. It carries `aria-pressed` and stays `hidden` until mounted.
  - The input carries `spellcheck="false"`, `autocorrect="off"` and `autocapitalize="none"`, plus `data-secret`, and is
    back to `type=password` after a submit (capture-phase listener, `flushSync(() => setShown(false))`).

## `packages/ui` (E's CSS assertions)
- A refused input, select or text area has a 2 px border in the colour `var(--destructive)` computes to.
- Below 48rem, inputs are at least 16 px. At 1280 px, an `Input` is exactly 14 px (`text-sm`).

## Not exported, by decision of the build-1 check
- **`useGuardedSubmit` stays out of the hardware key and Stripe.** Design 7.1 says those two "use its `inFlight` guard
  only". D wrote a local `useRef` guard in each (`hardware-key.tsx`, `stripe-payment-method.tsx`, ConfirmForm and the
  start button) instead. Neither has a server action for `useGuardedSubmit` to take, and the guard is one ref, so
  exporting a separate guard hook would add API for nothing. Slice A does not need to expose the ref. If the
  orchestrator wants the design's literal wording, slice A would export `useInFlight(): MutableRefObject<boolean>`, and
  D's two files change by one line each.
- **The hardware key's status line is a local `<p role="status" data-slot="pending-status">`.** Its words are 4.4's,
  not 'Working…', so it is not `PendingStatus`.
