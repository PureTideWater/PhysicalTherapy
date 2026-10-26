# co-001/ux-forms: forms keep what the person typed, and name the refused field

The UX baseline review's first pull request. Branch `co-001/ux-forms`, cut from `claude/build-platform` at `4d99df8`;
worktree `/home/user/ux-forms`. Every file:line below was read at `4d99df8`. The requirements are the 31 findings in
`/tmp/claude-0/ops/mine.md`, each named by its id in backticks. The three scouts' reports sit beside this file
(`designs/lane-b-ux-forms/scout-{mechanics,inventory,surfaces}.md`). Where a scout and the code (or LANES.md)
disagree, this design follows the code and says so.

Revised after the adversarial review (`designs/lane-b-ux-forms/review.md`, 22 findings). Every finding is applied or
answered; section 12 lists each with its disposition. Two new experiments back the revision: `drive/r4.cjs` and
`drive/r4.out` in the scratchpad (the dual-hook submit of 2.1, on the mechanics scout's Next 16.4.1 app, production
build, Chromium), and the open pull requests' file lists recomputed from git (`review/pr{48..54}-files.git.txt`;
the REST lists the review used were stale for #50).

Reserved for this PR: ADR 0077, test-matrix rows FRM-01 to FRM-08. No synth case. **No migration** (section 11).

**Lands after #50** (`co-001/superseded-rerun`), which rewrites `action-form.tsx` and `next.ts` and creates
`action-form.test.tsx`; and opens for review only once #49, #51, #52 and #54 have merged and `claude/build-platform`
has been merged into this branch (section 7.9).

## Contents

1. The defect and its cause
2. The mechanism
3. The error model
4. Pending, loading, the hardware key, the uploader and the split form
5. Fields: 16 px controls, the code, Show password, format hints
6. Sign-in
7. Files, in build slices, and what waits for #42
8. Tests
9. Docs
10. Visible changes and every string a person sees
11. No migration; proposals outside the PR
12. Review and dispositions

Findings answered, by section: 2 answers `a11y-other-01`, `a11y-practice-1-03`, `a11y-practice-2-01`,
`flows-other-01`, `narrow-other-01`, `narrow-practice-1-07`, `narrow-practice-2-01` and `flows-practice-33`.
3 answers `a11y-other-02`, `a11y-other-09` (the group half), `a11y-practice-1-01`, `a11y-practice-1-02`,
`a11y-practice-2-02`, `narrow-other-12`, `narrow-practice-1-08`, `narrow-practice-2-06`, `words-other-01` (the
mechanism, and the rewrites outside #42) and `words-other-03`. 4 answers `a11y-practice-1-04` (the pending half),
`a11y-other-26`, `a11y-practice-1-17` (the component half), `a11y-other-07`, `a11y-other-09` (the split-form half)
and `a11y-practice-1-20`. 5 answers `narrow-other-09`, `narrow-practice-2-10`, `a11y-other-05`, `narrow-other-23`
and `a11y-other-20` (outside #42). 6 answers `a11y-other-08` and `words-other-29`. `a11y-other-15` (upload-form.tsx)
waits for #42 whole (section 7.8).

---

## 1. The defect and its cause

**What a person sees.** After any refusal, every field of an `<ActionForm>` is empty or back at its default. The tour
shows it on 37 refused-form shots (scout-inventory section 6). The worst cases:

- The write-off form puts "Window passed" back after "Other" was refused, and unticks the consequence box. Clearing
  "Why" and submitting again records a false reason on the line (`a11y-practice-1-03`).
- `console.models.error` resets Flag to "Kill switch (every model feature off)" for Everyone. Typing 500 as the message
  asks then submits a kill switch for everyone (`a11y-other-01`).
- Pricing settings and the billing organization put back the stored 27601 and the test routing number 110000000, a
  valid-looking value marked invalid beside the error (`a11y-practice-2-01`, `narrow-other-01`).
- ROI puts back the suggested quarter, a valid period, beside "the period ends on or after its first day"
  (`narrow-practice-2-01`).

**Where.** `apps/web/src/components/action-form.tsx:32` takes `formAction` from `useActionState(action, {})`, and
`:65` passes it as `<form action={formAction}>`. `ActionState` carries no values
(`apps/web/src/lib/http/next.ts:124-129`). A refusal returns state (`runAction`, `next.ts:148-175`;
`runSignInStep`, `:177-193`); a success calls `redirect()`.

**Why, in React 19.3.1** (`node_modules/react-dom/cjs/react-dom-client.development.js`, read by scout A and checked
here):

- `extractEvents$1` (l.20725-20797) is the form-action listener. It runs after `onSubmit` handlers. When
  `nativeEvent.defaultPrevented` is false and the form's `action` is a function, it calls `preventDefault`, builds
  `new FormData(form, submitter)` and calls `startHostTransition(fiber, pending, action, formData)`.
- `startHostTransition` (l.9326-9345) wraps the action as
  `function () { requestFormReset$1(formFiber); return action(formData); }`. The reset is requested **before** the
  action runs, whatever the action returns.
- `requestFormReset$1` (l.9381-9394) queues a state update; `TransitionAwareHostComponent` (l.8142-8153) flags the
  form; `recursivelyResetForms` (l.16338-16351) calls the DOM's `form.reset()` when the transition commits, that is,
  exactly when the refusal appears.
- The other branch: when `defaultPrevented` is true and `onSubmit` started a transition synchronously, the listener
  calls `startHostTransition(fiber, pending, null, formData)`. The action is a no-op: no second dispatch, **no
  reset**. It only marks the form pending for `useFormStatus`.

**Evidence.**
- Scout A, a production build of a minimal Next 16.4.1 app in Chromium: today's pattern resets text, select,
  textarea, checkbox, an `x[]` group, a radio pair, a date, a password and a one-time code (`drive/q123.out`).
- Scout C, an in-repo browser harness on the real `ActionForm` and `Field`: the refused ZIP `0001` comes back as the
  default `27601` (`harness/`).
- The product already does it right in one place: the screening upload form submits from `onSubmit` with
  `preventDefault` and `startTransition` (`apps/web/src/components/screening/upload-form.tsx:118-141`), and the tour's
  `screening.error-zip` and `screening.error-no-phi` keep their values. The hardware-key form keeps its controlled
  email the same way (`apps/web/src/components/hardware-key.tsx:70-79`).

**Why no test saw it.** The e2e journeys refill every field after a refusal with `fill()`, `check()` and
`selectOption()`, which overwrite (`e2e/helpers.ts:29-33`, `onboarding.spec.ts:291-299`,
`contracts.spec.ts:140-147`, whose comment even says "The refused form is reset"). axe runs on pages as loaded and
never after a refusal.

**The same cause outside ActionForm.** `components/packets/version-form.tsx:118` is `<form action={writeDispatch}>`
with the same reset: its prompt-pay select (:125) and its `attach:<id>` checkboxes (:139) go back after a refusal
(`flows-practice-33` names this file). Its narrative editor is controlled (`narrative-editor.tsx:19,27`) and survives.

---

## 2. The mechanism

### 2.1 Chosen: dispatch from `onSubmit`, keep `action=` for the post without JavaScript

In `ActionForm` (through `useGuardedSubmit`, section 7.1), two `useActionState` hooks over the same server action:

```tsx
// 1. The server action itself, never a wrapper: <form action> renders the $ACTION_* fields from it, so the post
//    without JavaScript and React's replay of a press made before hydration still reach the action.
const [serverState, formAction, serverPending] = useActionState(action, {});
// 2. The same action called from the browser, so a dropped connection becomes a state the form shows, never the
//    error page (review finding 4; proved in drive/r4.out, D2 and D3).
const [clientState, dispatch, clientPending] = useActionState(
  async (previous: FormState, data: FormData): Promise<FormState> => {
    const seq = (previous.seq ?? 0) + 1;            // a new number per response: the summary is keyed by it (3.5)
    try {
      return { ...(await action(previous, data)), seq };
    } catch (error) {
      unstable_rethrow(error);                      // Next's redirect and not-found: the redirect remount of 2.2
      if (!(error instanceof TypeError) || 'digest' in error) throw error;   // a server failure keeps error.tsx and its reference
      return { unconfirmed: true, seq };            // fetch's TypeError, no digest: the connection dropped
    }
  },
  {},
);
const [source, setSource] = useState<'server' | 'browser'>('server');
const state = source === 'browser' ? clientState : serverState;   // whichever hook last ran
const pending = serverPending || clientPending;
const inFlight = useRef(false);
useEffect(() => { if (!pending) inFlight.current = false; }, [pending]);

function onSubmit(event: FormEvent<HTMLFormElement>): void {
  event.preventDefault();                           // React's listener now only marks the form pending: no reset
  if (inFlight.current) return;                     // a second press, even in the same frame, sends nothing
  if (beforeSubmit !== undefined && !beforeSubmit(event.currentTarget)) return;   // the split form (4.6)
  inFlight.current = true;
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  const data = new FormData(event.currentTarget, submitter);
  startTransition(() => { setSource('browser'); dispatch(data); });   // synchronous in onSubmit: useFormStatus pends too
}

<form ref={formRef} action={formAction} onSubmit={onSubmit} …>
```

`FormState` is `ActionState & { readonly seq?: number; readonly unconfirmed?: true }`: the two client-only fields
never come from the server, so `ActionState` (2.7) still carries nothing the person typed.

What each part does, and the evidence:

- **No reset on a refusal.** React's listener sees `defaultPrevented` and takes the no-op branch (section 1). Scout A:
  every field, the password and the code included, kept its value (`drive/q2.out`). Scout C: the refused `0001`
  stays.
- **No echo from the server.** The values never leave the browser except in the post itself. `ActionState` gains
  no value, only the flags of 2.7. No refused text (which may be what the no-PHI check caught: `support.error`,
  `request-audit.error`) comes back in a response.
- **One server call per submit.** React does not dispatch a second time (scout A counted calls; `drive/r4.out` D1
  and D6 count one call through the browser hook and one without JavaScript).
- **A dropped connection keeps everything.** Today, and with a single hook, a failed POST makes `useActionState`
  rethrow, `app/error.tsx` replaces the page, and "Try again" remounts the form empty (review finding 4, `r1.out` R1).
  With the browser hook (`r4.out` D2): no error page, every field kept, the summary focused, and a second press, once
  the connection is back, reaches the action. Its words (10.2) say "Not confirmed", never "Not sent": the response may
  be what dropped, after the server saved. A second press then replays the same request key, which does nothing and
  answers "This form was already submitted. Reload the page to see the result." (ADR 0017), so nothing is saved
  twice. A server failure still reaches `error.tsx` with its digest (`r4.out` D3), and a redirect still remounts the
  form (D4, and scout A's `rfr` variant).
- **Which state shows.** Only the server hook runs without JavaScript and for a pre-hydration replay; only the
  browser hook runs once `onSubmit` has dispatched. `source` flips to `browser` inside the same transition, so the
  form never shows a stale state of the other hook (`r4.out` D1, D2, D6).
- **Both pending flags hold** for the whole request: the hooks' `pending` and `useFormStatus().pending`.
  `startTransition` must be called synchronously in `onSubmit`; after an `await` the form's own pending never turns
  on (scout A; `upload-form.tsx` does this, which matters only after #42).
- **`new FormData(form, submitter)`** gives the same entries React's own submit would, the submitter's name and value
  included (version-form's `intent` buttons need it). With JavaScript, the DOM's `$ACTION_REF_1`, `$ACTION_1:0`,
  `$ACTION_1:1` and `$ACTION_KEY` hidden fields are in it and reach the action; `formInput` already drops every name
  starting `$ACTION` (`apps/web/src/lib/http/form.ts:10`). That filter is now load-bearing and gets a comment saying
  so.
- **The `inFlight` ref** is the only guard that stops two presses in one frame (scout A, Q5: today's `disabled`
  button lets 2 through; a guard on React state also lets 2 through; the ref lets 1). A remount after a redirect
  clears it.
- **File inputs** (the agreement's signed PDF, `console/organizations/[organizationId]/page.tsx:291`) are in the
  FormData as `File` entries; `formUpload` (`next.ts:131-141`) reads them as before.

### 2.2 Success: no reset code

A successful action calls `redirect()`. Next rejects the action's promise with a redirect error marked handled
(`next/dist/client/components/router-reducer/reducers/server-action-reducer.js` l.236-258, whose comment says the
error boundary "will remount the tree"). `useActionState` throws it; `RedirectBoundary`
(`redirect-boundary.js` l.57-66) catches it and renders the segment afresh. Scout A saw the form unmount and remount,
every field at its default, `useActionState` back to `{}`, and a new request key, in every case:

- a redirect to the same path with `?notice=`;
- a redirect to the identical URL (so the cause is not a changed page key);
- a redirect to another path, then Back;
- a form rendered in a layout (fields reset, but the request key is not renewed there, because the layout does not
  render again).

So a create form (invite, note, rate record, incident) never shows the last entry after it is saved. Scout B's worry
that "nothing resets on success" is answered by scout A's run; no `form.reset()` is added.

Two conditions keep this true, and the code says both in ActionForm's header comment and in ADR 0077:

1. The hook whose dispatcher is on `<form action>` takes the **server action itself**, never a client wrapper. A
   wrapper there would drop the `$ACTION_*` hidden fields the post without JavaScript needs. The browser hook may wrap
   it (2.1), because it is only ever dispatched from `onSubmit`, and it rethrows the redirect (`unstable_rethrow`),
   so a success through it remounts the form exactly as before (`drive/r4.out` D4: defaults, `?notice=saved`, a new
   request key).
2. `<FormKeys/>` is rendered by **pages only, never by a layout**, or a second submit after a success would replay the
   old request key. Today FormKeys is rendered by 52 pages, `shell.tsx` (rendered per page; no layout renders Shell)
   and `components/contracts/forms.tsx`; the only layouts are `app/layout.tsx` and `app/sign-in/layout.tsx`, which
   render no form.

### 2.3 Secrets are cleared after a refusal, on purpose

With no reset, a refused password and a refused one-time code would stay. WCAG 2.2 3.3.7 exempts security fields,
and the orchestrator's rule is never to keep a password or a code. In the refusal effect, before anything is marked
or focused, ActionForm empties every control in the form that carries **`data-secret`**. The marker is written by
the components, never by a page: `PasswordField` always writes it, and `Field` writes it whenever its
`autoComplete` is `one-time-code` (both code fields are `type` text, `app/sign-in/mfa/page.tsx:24`,
`enroll/page.tsx:34`, so a rule on `type=password` would keep the code, scout B; and a `PasswordField` shown as text
would be missed by a rule on the type, review finding 9). A refused code is spent anyway; codes rotate every 30
seconds. The fallback for a hand-written control (3.8) also empties any `input[type=password]` and any
`[autocomplete=one-time-code]`, so a secret field added later without the shared components is still emptied.

Both secret components stay **uncontrolled**: the effect empties the DOM value, and a controlled input would have
its value written back by the next render.

**Said under the field** (`flows-other-01`'s "and say so under them"; review finding 11). While the form shows a
refusal, each secret field renders a note under its control, tied by `aria-describedby` after the error and before
the hint: **"Emptied for your security: type it again."** (a password) or **"Emptied for your security."** (a code,
whose next step is already its error, "enter the code your authenticator app shows now", 6.2, or its hint, so the
note does not say it twice). It is `<p id="{id}-emptied" data-slot="emptied-note"
className="text-sm text-muted-foreground">`, so a sighted person does not take a password manager's dots for the
old value, and a screen reader hears why the field is empty. Without JavaScript the post comes back with every field
empty and the same note under the secret fields, which is still true.

Scout A left one case open: a sign-in step that ends without a redirect. `runSignInStep` returns the route's
`StepResult` (`next.ts:192`), which is `{ redirect } | { error, … }` (`lib/routes/sign-in.ts:41`), and a redirect
throws. So every step that comes back to the form carries `error`, and the effect always clears the secrets. Nothing
else to decide.

The email stays (`a11y-other-01`). The simulator's routing, account and card numbers are synthetic test values
(`components/billing/payment-method-card.tsx`) and stay like any other field.

### 2.4 Without JavaScript

The post still works: `action={formAction}` renders the `$ACTION_*` hidden fields, the browser posts to the page,
Next runs the action and renders the page again (scout A, Q4, `javaScriptEnabled: false`). On a refusal:

- the summary and every field's own inline error show, because the fields read the refusal from context during the
  server render (section 3);
- the summary's items show each message without a field name (the names are read from the page in the browser,
  section 3.4) and never a key;
- every value is lost and a new request key is rendered. Keeping the values would mean echoing them from the server,
  which this design forbids (2.5). A refresh losing unsent input is normal; PRD.md:256's "no screen depends on
  client-side state that a refresh loses" is about what a screen shows, not about a half-typed form.

A success redirects and shows its notice. Two surfaces work only with JavaScript and stay so: the split form (its
inputs are unnamed and the browser builds `settings`, `split-form.tsx:54-73,94`) and the hardware key (WebAuthn).

The Show toggle of `PasswordField` (5.3) renders `hidden` until the component has mounted, so the page without
JavaScript has no dead button and one tab stop fewer.

### 2.4a Accepted, and recorded in ADR 0077's "Not covered"

- **A press before hydration.** React replays a submit made before the page hydrated through
  `startHostTransition(formInst, …, action, formData)` (`react-dom-client.development.js:26585-26618`). That path
  bypasses `onSubmit`, so the `inFlight` guard and `beforeSubmit` do not run, and it requests the reset: a refusal of
  such a press empties the form, as today. The window is the page's first moments, and the post itself still works
  (review finding 18).
- **The session ends while a form is open.** `runAction` redirects to `/sign-in`, and what was typed is lost. Kept on
  purpose: typed text is never written to browser storage, because it may hold PHI (review finding 17).

### 2.5 Alternatives considered, and why each is rejected

| Option | What it is | Why rejected |
| --- | --- | --- |
| Server echo (`flows-practice-33`'s first option) | `ActionState.values` carries the submitted non-secret entries; each field's `defaultValue` reads them, keyed so React remounts the field | Sends what the person typed back in a response: a refused no-PHI field returns the very text the check caught, into React's flight payload and any proxy or log that sees it. Needs a per-field secret list on the server, a key scheme to force remounts, and still loses a checkbox group's and a radio's state unless each component learns to read it. More code, a worse privacy property, and no gain over keeping the values where they already are. |
| Controlled fields through a context (`flows-practice-33`'s second option) | Every field's value lives in React state held by ActionForm | Rewrites all 112 forms' fields into controlled components, including 48 raw controls and #42's pages (impossible without touching #42). Controlled inputs need JavaScript to show any value, so a post without JavaScript gets nothing. The browser already holds the values; React state would copy them. |
| Write the values back after the reset (`a11y-practice-2-01`, `narrow-practice-2-01`) | Capture the FormData in `onSubmit` without preventing it; after the refusal commits, write each named value back | Lets the reset happen and then undoes it: a visible flash of empty fields, a race with the focus effect, and per-type restore code (select, radio, checkbox groups, `x[]`, dates, files cannot be restored at all). Also re-dispatches nothing new: strictly worse than not resetting. |
| Key remount on the request key | Reset the form when the rendered request key differs from the one sent | Scout A, Q3: an action that sets a cookie and refuses makes Next refresh the tree and renders a new key, so this would wipe a refusal. Also redundant on success (2.2). |
| `requestFormReset` on the caught redirect | A client wrapper catches the redirect error and resets the form | Redundant (the remount already resets), and the wrapper removes the `$ACTION_*` fields, so the post without JavaScript stops working; React also warns because it runs outside a transition (scout A, Q3, variant `rfr`). |
| Turn browser validation off (`noValidate`), all errors from the server | GOV.UK's choice | Kept for later (section 11). The server's words for "required", an email and a pattern are still terse in #42's files, so turning the browser's checks off now would surface more weak messages, not fewer. Native validation stays; the format hints of section 5.4 answer the browser's generic "Please match the requested format". |

### 2.6 Security analysis

- **Nothing is echoed.** `ActionState` is `{ error?, invalid?, issues?, locked?, stale? }` (2.7). Issues carry a field key and the
  rule's own words, never a value (`invoke.ts` comments at :300-320: "the rule's own words (never a value)").
- **Secrets are cleared** after every refusal (2.3), by the `data-secret` marker, and a `PasswordField` turns itself
  back to `type=password` through its own state before the form's data is read (section 5.3). A shown password
  never reaches a browser's cloud spelling service: the input always carries `spellCheck={false}`,
  `autoCorrect="off"` and `autoCapitalize="none"` (5.3).
- **A dropped connection** is caught only when it is fetch's `TypeError` with no `digest`; every other error is
  rethrown, so a server failure keeps reaching `error.tsx` with its reference, and nothing about the failure is
  logged in the browser (2.1).
- **A stale CSRF token or request key** is answered by reading the page again (`router.refresh()`), which renders
  a fresh token and key from the server in place; the token is still never computed by a script (3.5a).
- **Nothing new is logged.** No log line is added. The client code writes no `console.*`. The browser harness tests
  run on synthetic values only.
- **CSRF and replay are unchanged.** The request key and CSRF token still come from `FormKeys`, rendered on the
  server (`components/form-keys.tsx:11-18`); a replay of the same key does nothing (ADR 0017). The `inFlight` guard
  means a double press no longer produces "This form was already submitted" for a press the person did not mean.
- **Response headers do not change** (ADR 0053/0055). Every new mark uses classes and SVG attributes, never a
  `style` attribute: CSP `style-src` is `'self'` plus a nonce (`lib/http/security-headers.ts:60`).
- **PHI** stays where it was: in the person's own browser and in the post. No URL, key, filename or job payload
  changes.

### 2.7 `ActionState` after this PR

```ts
export interface ActionState {
  readonly error?: string;
  /** The error is the lead of an invalid form, which the browser may choose again from the issues it places (#50; 3.5). */
  readonly invalid?: boolean;
  readonly issues?: readonly Issue[];
  readonly locked?: boolean;
  /** The page's CSRF token or request key was out of date: the form reads the page again (3.5a). */
  readonly stale?: boolean;
}
```

`invalid` is #50's (it lands first, section 7.9) and is kept. `stale` is new. `problems` is removed: the password
policy becomes an issue on the password field (section 6), and ActionForm's `It needs …` line
(`action-form.tsx:81`) goes with it.

---

## 3. The error model

### 3.1 What exists today

- ActionForm's effect looks each issue up with `form.elements.namedItem(issue.field)` and handles only a single
  input, select or text area that is not hidden (`action-form.tsx:42-46`). It sets `aria-invalid` and puts the
  summary item's id first in `aria-describedby` (:47-50), then focuses the first marked control or the summary (:52).
- The summary renders **after** the fields (:66-84), names each issue `labels[issue.field] ?? issue.field` (:76), and
  leads with "Check the fields marked below." (`next.ts:162`, `:180`). Only one page passes `labels`:
  `app/p/[practiceId]/settings/pricing/page.tsx:23` (`FORM_LABELS`, used at :97 and :112).
- `Field` can print a message under its control (`FieldError`, `components/field.tsx:11-17`), but only from its own
  `error` prop, which no ActionForm feeds. `SelectField` has `error` but no `hint` and passes no other props
  (:47-86); `TextAreaField` has no `error` (:89-116). `field.tsx` is a server component.
- The only invalid look is `aria-invalid:border-destructive` on `Input` (`packages/ui/src/components/input.tsx:11`):
  grey `#808996` to red `#B5452E`, 1.54:1 between the two, so a change of hue alone. Selects, text areas and the raw
  controls get no mark.
- 49 raw controls sit inside ActionForms (48 in 19 files outside #42; one in #42's users page), plus the versions
  page's local `Checkbox` (`abstraction/versions/[versionId]/page.tsx:46-53`) and the controlled template mapper
  (scout B section 2; spot-checked at `account/notifications/page.tsx:45,49`, `reconciliation/page.tsx:42,45`,
  `cases/page.tsx:177,181`).

### 3.2 The context

A new client module, `apps/web/src/components/form-issues.tsx`:

```ts
'use client';
/** The refusal a form is showing: its issues ([] when none) and whether it shows one at all (the emptied notes, 2.3). */
export const FormIssuesContext = createContext<{ readonly issues: readonly Issue[]; readonly refused: boolean }>({ issues: [], refused: false });

/**
 * The messages a refusal gives the control named `name`: an issue whose key is the name, the name without a
 * trailing [] (a checkbox group posts components[]; the route names "components"), a key in `issueFor`, or a
 * key under one of those with a dotted index ("kept.3"). Several messages are joined with "; ".
 */
export function useFieldIssue(name: string | undefined, issueFor: readonly string[] = []): string | undefined;
```

ActionForm wraps its `<form>` in `<FormIssuesContext value={{ issues: state.issues ?? [], refused: state.error !==
undefined || state.unconfirmed === true }}>` (memoised on `state`). A field outside any ActionForm reads no issue and
shows nothing. Each ActionForm has its own provider, so the per-row forms (console status, incidents,
the reconciliation matches) never mark each other's fields.

Because the context is filled from `useActionState`'s state, the inline messages render on the server too: the post
without JavaScript shows them (scout A, Q4 confirmed this on the mechanism's copy).

### 3.3 The components

`components/field.tsx` becomes a client module (`'use client'`), so its fields can read the context. Every caller
passes strings, numbers, booleans and option arrays, and no caller passes an event handler from a server component
(checked: `grep '<(Field|SelectField|TextAreaField)[^>]*\bon[A-Z]'` finds none), so nothing breaks at the
server-to-client boundary. Each field takes the message from its `error` prop when given (the screening upload form,
a #42 file, passes it), otherwise from `useFieldIssue(name, issueFor)`.

| Component | Change | Props added |
| --- | --- | --- |
| `Field` | Reads the context; renders `FieldError` under the control; `aria-invalid` and `aria-describedby` (error id first, then the emptied note of a secret field, then the hint: the order `e2e/screening.spec.ts:717` checks for the ZIP, which is no secret); writes `data-secret` when `autoComplete` is `one-time-code` (2.3) | `errorName?`, `issueFor?` |
| `SelectField` | Same; gains a hint and passes any other `<select>` prop through (`onChange`, `disabled`, `autoComplete`) | `hint?`, `errorName?`, `issueFor?`, `...ComponentProps<'select'>` |
| `TextAreaField` | Same | `error?`, `errorName?`, `issueFor?` |
| `CheckboxField` (new) | One checkbox and its label (a sentence, often a consequence), the message under it, `aria-invalid` and `aria-describedby` on the box | `name`, `label: ReactNode`, `errorName: string` (required: the label is a sentence), `hint?`, `value?`, `defaultChecked?`, `required?`, `id?` |
| `CheckboxGroup` (new) | `<fieldset>` and `<legend>`, the message inside the fieldset after the legend (and hint), the fieldset's `aria-describedby` naming the message and hint | `legend`, `issueKey` (the route's key: `components`, `kept`), `options: { name, value?, label, defaultChecked?, required? }[]`, `hint?` |
| `PasswordField` (new, `components/password-field.tsx`) | Section 5.3 | as `Field`, plus `showName` |

`FieldError` becomes:

```tsx
<div data-field-error className="flex items-start gap-1.5 text-sm text-destructive">
  <ErrorIcon />  {/* 14 px inline SVG, a circle with an exclamation mark, aria-hidden, focusable=false, currentColor */}
  <span aria-hidden="true" className="font-semibold">Error:</span>
  <p id={`${id}-error`}>{message}</p>
</div>
```

The element whose id is `${id}-error` holds **the message alone**, as today. `e2e/screening.spec.ts:718` and `:724`
(a #42 file this PR cannot edit) assert `#field-zip-error` `toHaveText(notLoaded)`, an exact match, and the upload
form feeds that element through `Field`'s `error` prop (`upload-form.tsx:179`); a prefix inside it would fail both
(review finding 1). The visible "Error:" and the icon are siblings in the wrapper, so a sighted person still reads
"Error:" in words beside the colour (WCAG 1.4.1). A screen reader does not need the prefix: `aria-invalid="true"` is
announced as "invalid entry" before the description, so the visible word is `aria-hidden` and not read twice. Two
other ways were rejected: a separate prefix id in `aria-describedby` changes the attribute `:717` asserts exactly
(`field-zip-error field-zip-hint`), and CSS `::before` content would put the word where assistive technology may or
may not read it (failure F87).

It is never an `<Alert>`: `refusal(page)` in `e2e/helpers.ts:63-65` matches every `[data-slot="alert"]` in strict
mode, so a second alert would break `sign-in.spec.ts:57,61`, `onboarding.spec.ts:294,298,299` and
`contracts.spec.ts:116,145,210` (scout B). The icon follows the repository's precedent of a hand-drawn inline SVG
(`components/uploads/format-flag.tsx:12-16`); there is no icon library, and adding one would touch `pnpm-lock.yaml`,
a #42 file.

`errorName` is written to the control as `data-error-name`. `issueFor` is written as `data-issue-for` (space-joined).
Both live on the control itself, beside its label, so there is still one place a field is named (design question 3).

### 3.4 The name a summary item uses: the label the person sees

**One source: the page.** When a refusal arrives, ActionForm resolves each issue to a target in the form and reads
the target's name from the DOM, in this order:

1. **Target.** `form.elements.namedItem(key)`, then `namedItem(key + '[]')`, then the first element whose
   `data-issue-for` lists the key (a fieldset may carry it), then the same three for the key's part before its first
   `.`. A `RadioNodeList` resolves to its first element. A hidden input (`type=hidden`) is no target, unless another
   control declares it through `data-issue-for`.
2. **Name.** The target's `data-error-name`; else, **when the issue names a group** (the key resolved to a
   `RadioNodeList`, to a `name[]` shared by more than one control, or through a fieldset's `data-issue-for`), the
   enclosing `<fieldset>`'s `<legend>` text; else `target.labels[0]`'s text; else, for a fieldset, its legend's text.
   A single checkbox in a fieldset of independent booleans is therefore named by its own label: the versions page's
   "Medicare adjustments the contract incorporates" holds `applyMppr`, `applyAssistantReduction`,
   `applySequestration` and `applyNcci` (`abstraction/versions/[versionId]/page.tsx:231-236`), and a refusal of
   `applyNcci` reads "NCCI edits: …", not the legend (review finding 16).
3. **Tidy.** Collapse white space, drop one trailing parenthetical (" (ZIP+4 if Medicare needs one)",
   " (dollars)", " (optional)", " (for “Other” only)") and a trailing colon. **Never** drop a parenthetical that
   holds "posted" or "deposited": brand.md requires "recovered" to carry one of them, and `tools/brand-copy/scan.ts:150`
   allows the label "Recovered principal, net (posted)" because of it; a runtime strip is invisible to that static
   lint (review finding 15). The rule is a pure function, `fieldName(label)` in `form-issues.tsx`, unit-tested on the
   parenthetical labels in the forms today (39 `label="…(…)"` props and 20 `<Label>` or `<legend>` texts at
   `4d99df8`; the test lists a sample of each shape) and on the "(posted)" and "(deposited)" cases. A closed list of
   strippable notes was weighed and rejected: the notes vary ("(when named)", "(estimate)", "(lines)", "(for an
   approval)", "(earliest open window)"), so a list would either misname a dozen fields or need markup on labels
   across nine files, while the one thing a strip must never lose is the brand's qualifier.

So "Billing ZIP (ZIP+4 if Medicare needs one)" is named "Billing ZIP", which is exactly what `FORM_LABELS` said, so
`FORM_LABELS` and the `labels` prop are **removed** (design question 3: no per-form table). "Per line (dollars)" is
"Per line", "NPI (optional)" is "NPI", "Why (for “Other” only)" is "Why", "Components affected" names the
`components[]` group, and a consequence checkbox is named by its `errorName` ("Confirmation").

The names are read in a layout effect, so they exist only with JavaScript. Before they are read (the server render,
the post without JavaScript, and the first client render, which the layout effect replaces before paint) each item
shows its message alone. A key is never shown, in any mode: there is no code path that prints `issue.field`.

**Why not a render-time source.** A summary above the fields renders before them, so no field can tell it its label
during the same render without an impure registry; moving the summary after the fields in the DOM and up with CSS
would break reading and focus order (WCAG 1.3.2, 2.4.3). The page's own labels are the one source that cannot drift,
and the post without JavaScript still has every message, beside its field.

### 3.5 The summary

`RefusalSummary` (in `form-issues.tsx`) renders **first inside the form, before the fields**, so its words about
place are true and a screen reader meets it first. It is the same `Alert` as today (`variant="destructive"`,
`tabIndex={-1}`, `data-state` `error`, `locked` or `unconfirmed`); the Alert's role and kinds are the later Notice
PR's.

- **Its own line in any layout** (review finding 8). 17 callers give `<ActionForm>` a grid or a row: six two-column
  grids (`grid gap-3 md:grid-cols-2` ×5, `sm:grid-cols-2` ×1), five `flex flex-wrap items-end` rows (ROI, reports)
  and six plain `flex` rows (the users page's row forms, `MatchForm`). The summary carries
  `className="col-span-full basis-full w-full"` and `data-slot="refusal-summary"`, so in a grid it spans every column
  and in a wrapping row it takes a line of its own; no field moves to another cell when a refusal appears. The six
  rows that do not wrap (console status's row, the users page's two row forms and console support's grant row, both
  #42 pages, and the two `className="flex"` forms) would squeeze their controls beside a full-width item, so one
  unlayered rule in `packages/ui/src/styles.css` lets a flex form wrap while it shows a refusal:
  `form:has(> [data-slot='refusal-summary']) { flex-wrap: wrap; }`. A grid ignores it, and a column form has no
  height for it to wrap into. It reaches #42's row forms through the stylesheet, without touching their files.
- **Announced every time** (review finding 5). `drive/r1.out` R2: pressing Enter twice in a refused field gives the
  same summary node with 0 mutations, and focusing the field that already has focus fires nothing, so a second
  identical refusal is silent after "Working…". The summary is rendered with `key={state.seq ?? 0}` (2.1): each
  response inserts a new alert, which is announced. Focus then moves as 3.6 says; when the target already has focus,
  the new alert carries the announcement.

```
Not done                                              <- AlertTitle; "Account locked" when locked; "Not confirmed" (2.1)
Fix the field listed here, then try again.            <- the lead (below)
 • Billing ZIP: five digits, or ZIP+4 such as 27601-1234      <- a link to the field
```

- **Title** stays "Not done": `contracts.spec.ts` filters on it, and the tour's `refused()` matches it
  (`tour.spec.ts:536`). "Account locked" is unchanged. A dropped connection (2.1) reads **"Not confirmed"**, because
  the server may have saved.
- **Lead.** `next.ts` sets an `invalid` outcome to `{ error: 'Fix the fields listed here, then try again.', invalid:
  true, issues }` in both `runAction` (:162) and `runSignInStep` (:180), replacing "Check the fields marked below."
  (`words-other-03`'s recommended sentence; `invalid` is #50's flag). The summary chooses the lead itself, through
  `summaryLead(state, placed)` (#50's function, extended; review finding 7):
  - not an invalid form: the action's error as given (CSRF, rate limit, role, not found, suspended, already
    submitted: unchanged words);
  - an invalid form, by the number of issues that name a field: **one**, "Fix the field listed here, then try
    again."; **several**, "Fix the fields listed here, then try again."; **none**, no lead: the messages stand alone
    under "Not done" (#50's rule for issues on hidden fields).
  - Which issues name a field: in the browser, those the layout effect placed on a visible control (3.4, step 1;
    `placed`); before that (the server render, the post without JavaScript), every issue whose key is neither
    `input` (root refinements, contract-workflow refusals, database rules: `invoke.ts:84`, `:310`, `:320`) nor
    `requestKey`. So a refusal keyed `pattern` (a case below the materiality), `refused`, `runId` or any of the
    twenty keys in scout B's section 3 never sits under "Fix the field listed here" in the browser; without
    JavaScript, only those record keys can, and the item itself still reads as the rule's own words.
- **Items.** A resolved, named issue is `<li id><a href="#{control id}">{name}: {message}</a></li>`. A resolved
  target with no readable name is the message alone, still a link. An issue with no target (`input`, `refused`,
  `pattern`, `platform`, `release`, the hidden ids, scout B section 3's table) is the message alone, not a
  link, its first letter capitalised. The `<li>` ids stay `${useId()}-${index}`.
- **Links.** A click (or Enter) calls `preventDefault`, focuses the control with `preventScroll`, and scrolls its
  label (or legend) into view with `block: 'center'`, so the question shows above the field on a phone. The URL does
  not change.
- `It needs …` (the password policy, `action-form.tsx:81`) is gone; the policy is an issue on its field (section 6).

### 3.5a A page that is out of date: read it again, keep the values

A stale CSRF token (`guardMessage`, `next.ts:76-78`, "… Reload the page and try again.") or a missing or garbled
request key (`invoke.ts:107`, an `invalid` outcome with the one issue `requestKey`, "reload the page and try again")
today ends in "Reload the page", and a reload now throws away what this PR keeps (review finding 10; WCAG 3.3.7's
exception covers asking again for a secret, not retyping a form). `pageCsrfToken()` follows the session cookie
(`components/form-keys.tsx`), so signing in again in another tab is enough to make a page's token stale.

- `next.ts` returns, for `csrf_refused` and for an `invalid` outcome whose only issue is `requestKey`,
  `{ error: 'This page was out of date, so nothing was saved.', stale: true }` (no issues). The flag marks it, never
  the words.
- ActionForm renders #50's `RefreshAfterRefusal` when `refreshOnError` is set **or** `state.stale` is true; for a stale
  state it calls `router.refresh()` without noting a takeover. `FormKeys` renders a fresh token and key in place, the
  uncontrolled fields keep their values (scout A's Q3 cookie case; `drive/r4.out` D5: every value kept, a new request
  key), and the summary, its focus and its state stay.
- The summary's lead then reads **"This page was out of date, so nothing was saved. It is up to date now: press
  “{submit}” again."**, where `{submit}` is the form's own button words (the `submit` prop, which may hold a
  `<Money/>` figure). ActionForm writes the second sentence, and only when the refused post came from this page's
  own `onSubmit` (the browser hook, 2.1), that is, from a press the person just made.
- **The safer wording for any other post** (security trade-off, taken the safer way). `csrf_refused` also answers a
  post whose origin is wrong (`guard`, `invoke.ts:151-156`), and the outcome does not say which check failed;
  telling it apart would change the outcome's shape that the generated route tests assert exactly
  (`route-tests/define.ts:169-172`, `toEqual({ status: 'csrf_refused' })`). Next itself refuses a server-action post
  whose Origin differs from the Host before the action runs, so in practice this state is a stale token; but a page
  rendered from the server hook (the post without JavaScript, a pre-hydration replay, or a post that did not start
  on this page) cannot prove the person pressed anything. It reads **"This page was out of date, so nothing was
  saved. Check the form, then send it again if you still mean to."** A one-button form (End membership, Unlock,
  Approve this version) therefore never invites a press the person did not start. The fields are empty in that case
  anyway (nothing is echoed, 2.6), so a second press sends only what the person types.
- The secrets are emptied, as after any refusal (2.3).

### 3.6 Focus after a refusal

The rule: **when the refusal has exactly one issue and it resolves to a control, focus that control; otherwise focus
the summary.**

- One issue: the control's label, its invalid state and its message are read together on focus ("Billing ZIP, edit
  text, invalid entry, five digits, or ZIP+4 such as 27601-1234"), and the person can type at once. This keeps
  `onboarding.spec.ts:541`'s `toBeFocused()` true.
- Several issues, or one the page cannot place, or none (a CSRF or rate-limit refusal, the first sign-in step): the
  summary is focused, as GOV.UK does, so the count of problems and the list of links are heard first, and each link
  takes the person to its field.
- Focus is moved in the same layout effect, after the secrets are cleared and the names read.
- **Never under the sticky header** (WCAG 2.2 2.4.11; review finding 6). The shell's header is `sticky top-0 h-14`
  (`components/shell.tsx:315`). `drive/r3.out`: a target already in the viewport but under a 56 px sticky header
  (top 10) stays there on `focus()`; with `html { scroll-padding-top: 72px }` Chromium scrolls it to 356. An
  off-screen target is centred anyway (`r2.out`), so the failure is the near-the-top case, which is exactly where a
  short form's summary lands. One unlayered rule in `packages/ui/src/styles.css`:
  `html { scroll-padding-top: calc(3.5rem + 1rem); }` (the header's height and a 16 px gap). It covers every
  `focus()`, every summary link and every fragment link, on every page, #42's included, without touching
  `shell.tsx`. The 16 px on pages with no header (sign-in) only lowers where a scrolled target stops.
- A dropped connection (2.1) and a page out of date (3.5a) have no issue: the summary is focused.
- **Without JavaScript** nothing moves focus: the page loads at its top, and the summary is the first thing in the
  form, before its fields. (The shell has no skip link today, `components/shell.tsx`; it is a #42 file, so a skip link
  is a proposal in section 11.)
- After a **success**, the redirect remounts the page and focus starts at the top. Moving it to the notice is the
  Notice PR's (`a11y-practice-1-04`'s second half).

### 3.7 The mark, not colour alone

One rule in `packages/ui/src/styles.css`, **unlayered** (globals.css imports `@tp/ui/styles.css` outside any layer,
`apps/web/src/app/globals.css:7`, so an unlayered rule outranks every Tailwind utility and reaches raw controls and
#42's pages without touching them):

```css
/*
 * A refused control: the danger color and a 2 px outline, never alone: the field's own "Error:" line names the
 * problem in words (WCAG 1.4.1, 3.3.1). Unlayered, so it wins over a control's utilities, raw controls included.
 */
:is(input, select, textarea)[aria-invalid='true']:not([type='checkbox'], [type='radio']) {
  border-color: var(--destructive);
  border-width: 2px;
}
/* A refused checkbox, radio group or checkbox group: a 2 px rule down its left edge, beside its "Error:" line. */
:is(fieldset, [data-slot='checkbox-field'])[data-invalid] {
  border-inline-start: 2px solid var(--destructive);
  padding-inline-start: 0.75rem;
}
```

- `--destructive` is `--pw-danger` (`styles.css:28`), the token for a failure that is not a payment status
  (`packages/brand/src/tokens.css:43-46`), never the data colour `--pw-short`. No new hex.
- Contrast (scout C): danger text on White 5.45:1, on its tint 4.71:1, on raised 5.13:1; dark 6.87:1 and 5.86:1. The
  2 px border makes the change one of width as well as hue; the words make it one of text.
- `input.tsx:11` drops `aria-invalid:border-destructive`, so the rule has one home.
- Inputs are `box-sizing: border-box` (Tailwind's preflight), so the 2 px border does not change a field's height.

### 3.8 Raw controls, groups and what stays a fallback

- **Raw controls move onto the shared fields** in every file outside #42 (section 7, slices C and D; 48 controls in 19
  files, the versions page's local `Checkbox`, and the attestation lists). The template mapper is controlled and
  stays as it is, but reads `useFieldIssue('template')` and `useFieldIssue('column_…')` to print its messages and set
  `aria-invalid` (its fieldset carries `data-invalid`).
- **Checkbox groups.** `components[]` on console status becomes a `CheckboxGroup` with `issueKey="components"`;
  `keep:<n>` on coverage one with `issueKey="kept"`; the two attestation lists (`confirm_<id>`, which have neither
  fieldset nor legend today) become `CheckboxGroup`s with the legends "Confirm each item before you sign" (report) and
  "Confirm each item before you attest" (packet); the versions page's Medicare adjustments use its existing legend
  (:231-232); version-form's evidence list uses its legend "Attach to the evidence list". The group's message sits
  inside the fieldset, after the legend; focus goes to the first box.
- **The route's group message.** `componentList` (`lib/routes/support.ts:392-395`) passes `undefined` through, so
  Zod's "Invalid input: expected array, received undefined" wins over "choose at least one component"
  (`a11y-other-09`). The preprocess maps `undefined` and `''` to `[]`. The route test's `sample` input stays valid.
- **The fallback.** A control no shared field renders (#42's users page :85 confirm box; anything added later by
  hand) is still marked by ActionForm's effect as today: `aria-invalid` on it, and the summary item's id first in its
  `aria-describedby`. The effect skips any control that already carries `aria-invalid="true"` from its component.
  The cleanup restores both attributes when the next state arrives (as `action-form.tsx:53-62` does now).

### 3.9 What a screen reader hears

The pricing settings ZIP, refused (one issue; focus goes to the field):

> "Not done. Fix the field listed here, then try again. Billing ZIP: five digits, or ZIP+4 such as 27601-1234, link."
> (the alert, announced as it appears)
> "Billing ZIP (ZIP+4 if Medicare needs one), edit text, invalid entry, 0001, five digits, or ZIP+4 such as
> 27601-1234. Five digits, or ZIP+4 such as 27601-1234."

The correspondence form with two refused fields (focus goes to the summary):

> "Not done. Fix the fields listed here, then try again. List, 2 items. Name: …, link. Phone: …, link."

Following the first link:

> "Name, edit text, invalid entry, SYNTHETIC@OFFICE, …" (the message; "Error:" is shown, and `aria-invalid` says it)

Console status with no component ticked (focus goes to the first box):

> "Components affected, group, choose at least one component. Uploads, checkbox, not checked."

A rate-limited sign-in (no issue; focus goes to the summary):

> "Not done. Too many attempts in a short time. Wait 15 minutes and try again."

The sign-in password after a wrong password (focus goes to the summary; following Tab to the field):

> "Password, secure edit text, Emptied for your security: type it again."

The same refusal twice: the second response inserts a new alert (3.5), so it is announced again.

While pending, from the status line beside the button (section 4.1): "Working…".

---

## 4. Pending, loading, the hardware key, the uploader and the split form

### 4.1 Pending: the button stays focusable, a status line says it is working

Today the button is `disabled={pending}` and its words turn into "Working…" (`action-form.tsx:86-87`). Disabling the
focused button drops focus to `<body>` (scout A, Q6: `BODY` at +80 ms and +150 ms), and the new words are in no live
region (`a11y-practice-1-04`).

After this PR:

- The button is `aria-disabled={pending || undefined}`, never `disabled`. It keeps focus for the whole request (scout
  A: `#go` stayed focused). Its words do not change, so its accessible name does not change under the person.
- The `inFlight` ref (2.1) is the guard: a click, Enter in a field (implicit submission still fires `submit`, since
  the button is not disabled) and a same-frame double press all return early. Scout A counted 1 server call in each
  case.
- `PendingStatus` (new, in `form-issues.tsx`): `<p role="status" className="text-sm text-muted-foreground"
  data-slot="pending-status">{pending ? 'Working…' : ''}</p>`, rendered beside the button from the first render, so the
  change from empty to "Working…" is announced politely. It goes **inside the button's existing wrapper `<div>`**
  (`action-form.tsx:85`), which becomes `flex flex-wrap items-center gap-2`, never as a new child of the form: a new
  child would take a cell of each caller's grid or a slot of its row (review finding 8).
- **Scoped status locators checked** (review finding 21): `packets.spec.ts:223`, `uploads.spec.ts:43` and
  `reconciliation.spec.ts:58` use `getByRole('status')` inside a region; none of those regions holds an ActionForm in
  the state each asserts (at :223 the Export button is gone while the export runs). `data-slot="pending-status"`
  lets a later scoped locator exclude it.
- `buttonVariants` (`packages/ui/src/components/button.tsx:25`) gains
  `aria-disabled:cursor-not-allowed aria-disabled:opacity-50`, the look `disabled:` already has. An inactive control
  is exempt from 1.4.3's contrast minimum.
- Tests: Playwright's `click()` treats `aria-disabled="true"` as disabled and waits; a test that presses while pending
  uses the keyboard or `{ force: true }` (scout A).

The same pattern goes into the other forms that copy ActionForm's pending button: `version-form.tsx:64`,
`export-status.tsx:103` and Stripe's `ConfirmForm` (`stripe-payment-method.tsx:221-222`, `disabled={pending ||
stripe === null}`, and its error alert gets `tabIndex={-1}` and focus when it appears, as `SetupNotice` already does at
:144-160).

### 4.2 The version form and the export form

- **`components/packets/version-form.tsx`** moves to the same mechanism: `onSubmit` with `preventDefault`, the
  `inFlight` guard and `new FormData(form, submitter)`; a submitter carrying `data-intent="model_draft"` is dispatched
  to `modelDispatch`, any other to `writeDispatch`, and `clicked` is set from the submitter (not from `onClick`). Each
  of the two actions gets 2.1's pair of hooks through `useGuardedSubmit`, so a dropped connection keeps the narrative,
  the select and the ticks there too, with one `inFlight` guard across both. The
  model button keeps its function `formAction` and the others their `name="intent"`, so the post without JavaScript
  still reaches the right action. Its prompt-pay select becomes a `SelectField` and its evidence list a
  `CheckboxGroup` ("Attach to the evidence list"). Its own summary (`:150-162`, which prints `{issue.field}:`) is
  replaced by `RefusalSummary` and `FormIssuesContext`, so it names fields and marks them like every other form.
- **`components/packets/export-status.tsx`** has hidden fields only (nothing to keep). Its pending button takes 4.1's
  pattern, and its "other issues" list (`:93`) shows each message alone, never `{issue.field}:`. Its export refusal
  reasons (`data-export-refused`) are unchanged.

### 4.3 Loading (`a11y-other-26`, `a11y-practice-1-17`, the component half)

`LoadingState` (`packages/ui/src/states/loading-state.tsx:18-39`) is `role="status" aria-live="polite"
aria-busy="true"`, inserted with its sr-only label already inside (:20-27). `aria-busy` asks assistive technology to
hold the region's announcements until it turns false, and it never does: Next replaces the whole `loading.tsx`. A live
region created with its text is often not announced at all. Sighted people see no words.

After this PR (`packages/ui/src/states/loading-state.tsx`, and a new client file
`packages/ui/src/states/loading-announcement.tsx`):

```tsx
<div data-slot="loading-state" className={cn('flex flex-col gap-3', className)}>
  <p role="status" className="sr-only"><LoadingAnnouncement label={label} /></p>   {/* empty at first, the label after mount */}
  <div className="flex items-center gap-3" aria-hidden="true">
    <StateMark />
    <div data-slot="progress-bar" …>…</div>
    <span className="text-sm text-muted-foreground" data-slot="loading-label">{label}</span>
  </div>
  {rows}
</div>
```

- No `aria-busy` anywhere in it.
- The status region exists before its words: `LoadingAnnouncement` (`'use client'`) renders an empty string, then the
  label after mount, so the change is announced.
- The label is shown as text beside the bar. It sits in the `aria-hidden` row so it is not read twice.
- `@tp/ui` is in `transpilePackages` (`apps/web/next.config.ts`), so a `'use client'` file inside it works; it is the
  package's first.
- Out of this PR (section 11): `aria-busy` on each loading `<main>`, a still frame of the shell while loading (needs
  `shell.tsx`, a #42 file), and a persistent live region in `app/layout.tsx`.

### 4.4 The hardware key (`a11y-other-07`)

`components/hardware-key.tsx` (not #42):

- Both buttons (`:83-85` sign-in, `:126-128` registration) become `aria-disabled={busy || undefined}` with a ref
  guard, and keep their words ("Sign in with hardware key", "Register hardware key").
- A status line present from the first render says, while busy: **"Waiting for your hardware key. Touch it, then
  confirm with its PIN or fingerprint."**, and is empty otherwise.
- On a failure, focus moves to the `Problem` alert (`tabIndex={-1}`), as ActionForm does for its summary.
- `Problem` takes its title from the caller: sign-in keeps "Not signed in" (or "Account locked"); registration's
  failure reads **"Not registered"** (today it says "Not signed in", `:32` used at `:124`).
- The email stays controlled and is kept, as today.

### 4.5 The uploader (`a11y-practice-1-20`)

`components/uploads/uploader.tsx:376-387`: the `sr-only` file input gains `tabIndex={-1}` and `aria-hidden="true"`.
"Choose files" (:388-390) stays the one control and opens the picker. Scout C tested it: `getByLabel('Choose files to
upload')` still finds the input and `setInputFiles` works, so the ~20 e2e calls (uploads, packets, era-exports) need
no change; Tab goes straight to "Choose files"; axe's `aria-hidden-focus` passes with `tabindex=-1`. No `<label for>`
points at the input (`grep upload-files` finds only its own id).

### 4.6 The split form (`a11y-other-09`, the split-form half)

`components/screening/split-form.tsx` (not #42; its server route `lib/screening/routes.ts:1292` is #42's, so the fix
is in the browser only):

- **Per-field problems.** `splitSettings` (:32-51) also says which list each problem concerns: an invalid code, the
  list it is in; a code in both lists, both; no code at all, the facility list.
- **A live region from the first render.** `<div id="split-problems" role="status">` always renders; the `<ul>`
  (:109-115) goes inside it when there are problems. Each `CodesField` at fault gets `aria-invalid` and
  `aria-describedby="split-problems {id}-hint"`, and so the 3.7 mark.
- **No post with problems.** ActionForm gains an optional client-only prop
  `beforeSubmit?: (form: HTMLFormElement) => boolean`, called in `onSubmit` after the in-flight check and before the
  guard is set (2.1). The split form passes one
  that, when the lists have problems, shows them (even with both fields empty: "List at least one place of service."),
  focuses the first field at fault and returns false, so nothing is sent. "Approve this split" stays enabled.
- **A server issue on `settings`** (a hidden input) is placed through `data-issue-for="settings"` on the facility
  field, so the summary names "Facility places of service" and links to it.
- The form stays JavaScript-only, as it is by design.

---

## 5. Fields

### 5.1 16 px controls below the md breakpoint (`narrow-other-09`, `narrow-practice-2-10`)

Input is `text-sm` (14 px) at every width (`input.tsx:11`), as are the shared select (`field.tsx:75`), the shared
text area (`field.tsx:106`) and about 35 raw selects and 12 raw text areas (scout C section 5). iOS Safari zooms the
page into any focused control under 16 px and leaves it zoomed.

**One unlayered rule** in `packages/ui/src/styles.css`, beside the base field rule (:75-80):

```css
/*
 * Below the md breakpoint, where the rail folds into the header's Menu (ADR 0056), form controls are 16 px, so iOS
 * Safari does not zoom the page on focus (ADR 0077); from md up they keep the dense 14 px. The viewport's
 * maximum-scale stays unset (WCAG 1.4.4). Unlayered, so it wins over every control's text-sm, raw controls included.
 */
@media (width < 48rem) {
  input:not([type='checkbox'], [type='radio'], [type='hidden'], [type='file'], [type='submit'], [type='button'], [type='reset'], [type='range'], [type='color'], [type='image']),
  select,
  textarea {
    font-size: 1rem;
  }
}
```

- **Why a rule, not classes.** `text-base md:text-sm` on Input, SelectField and TextAreaField would leave every raw
  control and #42's pages at 14 px, and each new control would have to remember it. The rule is one source and
  cannot drift. Unlayered CSS outranks Tailwind's `@layer utilities` whatever the specificity (Tailwind 4.3.3;
  `globals.css:7` imports this file outside any layer).
- **Why md (48rem), not sm.** md is the app's one small-screen boundary (the rail folds at md, ADR 0056 line 45), and
  it covers small tablets in portrait as well as phones. The two findings named sm and md; this takes the one the
  layout already uses.
- `app/layout.tsx:29`'s viewport keeps no `maximum-scale`, so pinch zoom stays (WCAG 1.4.4).
- The new e2e spec asserts a computed `font-size` of at least 16 px at 390 px on an input, a select and a text area
  (section 8.4).

### 5.2 The six-digit code accepts what an authenticator app copies (`a11y-other-05`)

Authenticator apps show and copy a code as "123 456". Today the browser's `pattern="[0-9]{6}"` blocks it before submit
with its generic "Please match the requested format." (`mfa/page.tsx:24`, `enroll/page.tsx:34`), and the server's
`sixDigitCode` only trims the ends (`lib/routes/schemas.ts:23`).

- **Schema** (`lib/routes/schemas.ts:23`):
  ```ts
  /** A code as an authenticator app shows or copies it ("123 456", "123-456"): spaces and hyphens are dropped. */
  export const sixDigitCode = z
    .string()
    .max(32)
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'enter the six digits your authenticator app shows'));
  ```
- **Every caller:** `enrollTotp` (`lib/routes/sign-in.ts:191`, `input: z.object({ code: sixDigitCode })`) and
  `answerMfa` (`:218`). There is no other code field: `p/[practiceId]/claims/page.tsx:76`'s `name="code"` is a CPT
  filter on a GET form and does not use the schema (scout C).
- **Both fields** (`mfa/page.tsx:24`, `enroll/page.tsx:34`): remove `pattern` (constraint validation runs before the
  submit event, so with it no paste with a space ever reaches `onSubmit`); add `maxLength={12}` and
  `hint="Six digits. Spaces are fine."`; keep `inputMode="numeric"`, `autoComplete="one-time-code"` and `required`.
- The route test `sign-in-routes.db.test.ts:151` (`'abc'` is invalid) still holds; a new case signs in with the code
  written "123 456".

### 5.3 Show password: yes (`narrow-other-23`)

Decided: a `PasswordField` with a show toggle on the sign-in password and on both new-password fields. NIST SP
800-63B (5.1.1.2) recommends offering to show a password while it is typed, it lowers the commonest phone refusal
(the two passwords differ), and it is off until the person presses it, so the safer choice is to offer it. Password
managers keep working.

`components/password-field.tsx` (`'use client'`):

- It renders `Field`'s markup (label, input, hint, the inline error, the emptied note of 2.3) with `type` `password`
  or `text`, the same `autoComplete` the page gives, and `data-secret`. It stays uncontrolled (2.3).
- **What a browser's spelling service reads** (review finding 9). Chrome's Enhanced Spell Check and Edge's Microsoft
  Editor send the contents of text fields to the vendor's cloud service and skip `type=password`; a password shown
  as `type=text` would be sent too (the 2022 "spell-jacking" disclosure). The input therefore always carries
  `spellCheck={false}`, `autoCorrect="off"` and `autoCapitalize="none"`, in both modes.
- The toggle is `<button type="button" aria-pressed={shown} aria-controls={id}>`, its visible text **"Show"**, followed
  by a visually hidden part that completes its name: `showName` (" password", " new password", " new password again").
  Its accessible name is therefore "Show password", "Show new password" or "Show new password again", which starts
  with its visible word (WCAG 2.5.3). Pressed, it reads "Show password, toggle button, pressed".
- **Named by its text, never an `aria-label` or `aria-labelledby`**: `getByLabel('Password')` matches labels and
  aria-labels as a case-insensitive substring (`e2e/helpers.ts:32`, `onboarding.spec.ts:168,292,297`) and would find
  two elements in strict mode.
- **Before the data is read** it turns the field back to `type=password` **through its own state**: a capture-phase
  `submit` listener on its form, which runs before ActionForm's `onSubmit` builds the FormData, calls
  `flushSync(() => setShown(false))`. The DOM's `type` and the toggle's `aria-pressed` therefore always agree (a
  listener that changed only the DOM would leave `aria-pressed="true"` on a hidden password), and a password manager
  sees a password field when the form submits.
- After any submit the field is hidden again, and after a refusal ActionForm empties it (2.3); the person presses
  Show again to see what they type next. This replaces the first draft's "it stays in whichever mode the person
  chose", which contradicted the listener.
- The toggle renders `hidden` until the component has mounted (2.4): without JavaScript it would be a dead button.
- No `style` attribute (CSP). The toggle is a `variant="outline" size="sm"` Button beside the input.

### 5.4 Format hints (`a11y-other-20`, outside #42)

Every field that refuses by `pattern` states the format in its hint, so `aria-describedby` carries it and the
browser's generic message is never the only guide:

| Field (file:line) | Hint |
| --- | --- |
| SHA-256, `console/compliance/page.tsx:191` | "The document's SHA-256, 64 hexadecimal characters." (the terms page's wording, `console/terms/page.tsx:68`) |
| NPI (optional), `console/organizations/[organizationId]/page.tsx:108` | "Ten digits." |
| Tax ID, last four (optional), same file :109 | "The last four digits." |
| Stated year (when locked), `p/[practiceId]/abstraction/versions/[versionId]/page.tsx:204` | "Four digits, such as 2026." |
| Carrier (when named), same file :213 | "Five digits." |
| Locality (when named), same file :214 | "Two digits." |
| Change in dollars, `p/[practiceId]/abstraction/ledger/page.tsx:31` (a raw input today; becomes a `Field`) | "Dollars and cents, such as 12.50; a minus sign lowers the amount, such as -12.50." |
| Six-digit code (both) | section 5.2 |

On `/support` (`app/support/page.tsx`, not #42) the no-patient-information rule moves from the card's description
into the Subject and Message hints: **"No patient names, dates of birth, member IDs or claim numbers. Name the screen
and the record's ID."** (`a11y-other-20`'s recommended words.)

A unit test holds it: `apps/web/src/components/form-hints.test.ts` parses every `.tsx` under `apps/web/src` with the
TypeScript compiler API and fails on any JSX element with a `pattern` attribute and neither `hint` nor
`aria-describedby`. Its allowlist holds one file, `app/console/support/page.tsx` (Ticket, :56), a #42 file, with the
comment "remove after #42 merges" (section 7.8).

---

## 6. Sign-in (`a11y-other-08`, `words-other-29`)

None of these files is #42's: `app/sign-in/**`, `lib/routes/sign-in.ts`, `lib/routes/schemas.ts`,
`lib/auth/cognito-provider.ts`.

### 6.1 The first step is unchanged

`MESSAGES.credentials` and `MESSAGES.no_account` (`lib/routes/sign-in.ts:44,46`) keep the same vague words, "That did
not match. Check the email, the password or the code, and try again.", with no field marked, so a wrong password and
an unknown email stay indistinguishable (account enumeration). The hardware-key fallback (:250) and `locked` keep
theirs. After this PR the first step keeps the email and empties the password, and focus goes to the summary (no
issue).

### 6.2 The code steps name the code

`enrollTotp` (:182-196) and `answerMfa` (:209-223) run only with the sealed pending cookie, which proves the email and
password, so naming the code as the wrong part leaks nothing. `settle` (:64-108) gains an optional third argument,
`{ credentials?: Issue }`; the two code steps pass
`{ field: 'code', message: 'enter the code your authenticator app shows now' }`, and a `credentials` refusal then
returns:

```ts
{ error: 'That did not match.', issues: [{ field: 'code', message: 'enter the code your authenticator app shows now' }] }
```

- The summary reads "Not done / That did not match. / Six-digit code: enter the code your authenticator app shows
  now"; the code field is emptied (2.3), marked, described and focused (one issue).
- "That did not match" is kept on purpose: `e2e/helpers.ts:49` finds a refused code by it, and
  `sign-in-routes.db.test.ts:152` expects `stringContaining('did not match')` in `data.error`. Neither changes.
- `StepResult` (:41) becomes `{ redirect } | { error, locked?, issues? }`; `runSignInStep` already returns it as the
  `ActionState` (`next.ts:192`).
- The lock still counts each failure: nothing changes in `lib/auth/sign-in.ts`.

### 6.3 The password step names the password

- **Policy.** `settle`'s `invalid_password` case (:84-86) returns
  `{ error: 'Choose a stronger password.', issues: [{ field: 'password', message }] }`, where `message` is
  `it still needs ${listed(problems)}` ("it still needs an uppercase letter, a digit and a symbol"), joined with commas
  and a final "and" by a new `listed()` in `lib/copy/words.ts` (`words-other-29`). For the user pool's own refusal
  (`cognito-provider.ts:209`, `InvalidPasswordException`), the provider returns `problems: []` and the message is
  **"the sign-in service refused it: choose a different password"**, since "it still needs a password the user pool
  accepts" says nothing (`cognito-provider.test.ts:139` changes with it).
- **Mismatch.** The `confirm` refinement (:164) says **"the two passwords do not match: type the same password in
  both fields"**; both fields are emptied after the refusal, so the instruction fits.
- **The policy on the field.** `new-password/page.tsx:28` gains
  `hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a lowercase letter, an uppercase letter, a digit and a symbol.`}`;
  the card's description (:21-24) becomes "Your invitation to PaidWhole came with a temporary password. Choose your
  own." The rules stay visible, now tied to the field.
- **Required.** The password's `min(1, 'required')` (:138, :163) and `requiredText` (`schemas.ts:19`) say
  **"fill this in"** in place of "required", so an empty field reads "Password: fill this in". `requiredText` serves
  32 schemas, #42's routes among them, so this reaches #42's forms without touching their files.
- **Too long.** `requiredText`'s maximum message becomes an instruction too: **"enter at most {n} characters"** in
  place of "at most {n} characters" (review finding 14). Request audit's `contactName` is `requiredText(200)`
  (`lib/routes/onboarding.ts:110`), so it reads "Your name: enter at most 200 characters", the instruction form of
  `words-other-01`'s "Your name: enter your name, up to 200 characters." No test asserts the old words (`git grep`
  finds none outside #42's screening tests, whose own messages are not `requiredText`'s).
- The route test `sign-in-routes.db.test.ts:169` changes from `problems: arrayContaining(['a digit'])` to
  `issues: [{ field: 'password', message: expect.stringContaining('a digit') }]`.

---

## 7. Files, in build slices, and what waits for #42

Six slices, each with its own files: no file is in two slices, so builders can work in parallel. Slices B to E code
against the component API this design fixes (sections 3.2, 3.3, 4.1, 4.6, 5.3); the branch typechecks and its tests
pass once all six are in. Paths are under `apps/web/src/` unless they start with `apps/`, `packages/`, `docs/` or
`.claude/`. None of these files is #42's, except the three shared documents in slice E, which LANES.md rule 6
lets both lanes change (section 7.7); intersection with `/tmp/claude-0/pr42-files.txt` checked by script after
the revision. Building starts once #50 has merged and `claude/build-platform` has been merged into this branch
(7.9): slice A then starts from #50's `action-form.tsx`, `next.ts` and `action-form.test.tsx`, not from `4d99df8`'s.
Slices C1 and C2 re-read each page at the merged head before editing, because #49, #51, #52 and #54 change them;
the line numbers below are `4d99df8`'s and are a guide, not an address.

### 7.1 Slice A: the form core

| File | Change |
| --- | --- |
| `components/action-form.tsx` | 2.1's two hooks and guarded submit, 2.3's secrets, `FormIssuesContext`, `RefusalSummary` first in the form (keyed by `seq`), `PendingStatus` inside the button's wrapper and an `aria-disabled` button; the `labels` prop removed; `beforeSubmit?` added (4.6). From #50, kept: `refreshOnError`, `RefreshAfterRefusal` (now also rendered for a `stale` state, 3.5a), `RefusalTakeover`, `noteRefusal`, `takesFocus`, and `summaryLead`, extended to choose the lead by the issues placed (3.5). Header comment states 2.2's two conditions |
| `components/form-issues.tsx` (new, client) | `FormIssuesContext`, `useFieldIssue`, `fieldName` (3.4's tidy rule), `FieldError` and its icon, the emptied note (2.3), `RefusalSummary` (summary, layout effect: clear `data-secret` fields, resolve and name targets, fallback marks, focus), `PendingStatus`, `useGuardedSubmit` (the two hooks, the `inFlight` ref and the `onSubmit` builder of 2.1, shared with the version form; the hardware key and Stripe's form use its `inFlight` guard only) |
| `components/field.tsx` | `'use client'`; `Field`, `SelectField`, `TextAreaField` read the context; `Field` writes `data-secret` for a one-time code; new `CheckboxField`, `CheckboxGroup` (3.3) |
| `components/password-field.tsx` (new, client) | 5.3 |
| `lib/http/next.ts` | `ActionState`: #50's `invalid` kept, `stale` added, `problems` removed (2.7); the invalid lead at :162 and :180 (3.5); `csrf_refused` and a `requestKey`-only refusal become the `stale` state (3.5a) |
| `lib/http/form.ts` | A comment on the `$ACTION` filter (:10): with JavaScript the DOM's FormData carries the framework's fields, so the filter is required |
| `packages/ui/src/components/button.tsx` | `aria-disabled:` look (4.1) |
| `packages/ui/src/components/input.tsx` | drops `aria-invalid:border-destructive` (3.7) |
| `packages/ui/src/styles.css` | four unlayered rules: the invalid mark (3.7), the 16 px rule (5.1), `scroll-padding-top` (3.6), and a flex form wraps while it shows a refusal (3.5) |
| `packages/ui/src/components/components.test.tsx` | the button's `aria-disabled` classes |
| `components/action-form.test.tsx` (#50's) | `summaryLead`'s new cases (8.2) |
| `components/action-form.browser.test.tsx` (new) | section 8.2 (a new file, so nothing collides with #50's static tests) |
| `components/form-issues.test.ts` (new) | `fieldName` (3.4) |
| `components/fields.test.tsx` (new) | static markup of each field with and without an issue (8.2) |
| `components/test-support/browser.ts`, `forms-harness.tsx`, `forms-harness.html` (new) | the in-repo browser harness (8.2) |

### 7.2 Slice B: sign-in and the server's words

| File | Change |
| --- | --- |
| `app/sign-in/page.tsx` | Password becomes a `PasswordField` (`showName=" password"`) |
| `app/sign-in/mfa/page.tsx`, `app/sign-in/enroll/page.tsx` | the code field: no `pattern`, `maxLength={12}`, the hint (5.2) |
| `app/sign-in/new-password/page.tsx` | both fields `PasswordField`s; the policy in the hint; the card's description shortened (6.3) |
| `lib/routes/sign-in.ts` | `StepResult` with `issues`; `settle`'s `credentials` option; the code steps pass it; the policy and mismatch as issues; "fill this in" (6.2, 6.3) |
| `lib/routes/schemas.ts` | `sixDigitCode` (5.2); `requiredText`'s "fill this in" and "enter at most {n} characters" (6.3) |
| `lib/auth/cognito-provider.ts` | `InvalidPasswordException` returns `problems: []` (6.3) |
| `lib/copy/words.ts` | `listed(items)`: "a", "a and b", "a, b and c" |
| `lib/routes/billing.ts` | the routing and account number messages (10.3) |
| `lib/routes/onboarding.ts` | the request-audit no-patient-information message (10.3) |
| `lib/routes/compliance.ts` | the evidence date message (10.3) |
| `lib/routes/console-onboarding.ts` | the terms version message (10.3) |
| `lib/routes/support.ts` | `componentList` maps a missing value to `[]` (3.8) |
| `apps/worker/src/billing/account.ts` | the no-payment-method message (10.3) |
| Tests: `lib/routes/sign-in-routes.db.test.ts`, `lib/auth/cognito-provider.test.ts`, `lib/copy/words.test.ts`, and a `support` route case for no component | section 8.5. `apps/worker/src/billing/billing.db.test.ts` is a #42 file and is **not** touched: its one assertion on the message, `rejects.toThrow(/no payment method on file/)` (:442), matches the new words unchanged (review finding 2) |

### 7.3 Slice C1: practice pages, cases to reports

Raw controls onto the shared fields (line numbers from scout B's section 2, at `4d99df8`):

| File | Controls |
| --- | --- |
| `app/p/[practiceId]/cases/page.tsx` | selects :77, :144; inputs :177, :181 (#54 changes these two materiality inputs' `defaultValue` to `dollarsForInput`: keep #54's value when moving them onto `Field`) |
| `app/p/[practiceId]/cases/[caseId]/page.tsx` | selects :115, :208 (write-off Reason); inputs :218, :235; checkbox :221 (`CheckboxField`, `errorName="Confirmation"`); text area :271 |
| `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx` | selects :79, :307, :326, :338; inputs :75, :90, :94, :317, :321; checkboxes :98, :348; text area :354 |
| `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` | text area :415 |
| `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx` | the `confirm_<id>` list :322 as a `CheckboxGroup` ("Confirm each item before you attest") |
| `app/p/[practiceId]/lines/[lineId]/page.tsx` | text area :299 |
| `app/p/[practiceId]/reports/page.tsx` | select :98; month input :198 |
| `app/p/[practiceId]/reports/[reportId]/review/page.tsx` | the `confirm_<id>` list :110 as a `CheckboxGroup` ("Confirm each item before you sign") |
| `app/p/[practiceId]/pricing-runs/page.tsx` | month inputs :87, :91 |
| `components/packets/version-form.tsx` | 4.2 |
| `components/packets/export-status.tsx` | 4.2 |

### 7.4 Slice C2: practice pages, abstraction to settings

| File | Change |
| --- | --- |
| `app/p/[practiceId]/abstraction/ledger/page.tsx` | input :31 (a `Field` with the hint of 5.4), text area :35, checkbox :38 (`CheckboxField`) |
| `app/p/[practiceId]/abstraction/regulations/page.tsx` | checkbox :93 |
| `app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx` | checkbox :123; text areas :265, :320, :464; the local `Checkbox` (:46-53, used :233-236) replaced by a `CheckboxGroup` under the existing legend (:231-232); hints at :204, :213, :214 (5.4) |
| `app/p/[practiceId]/coverage/page.tsx` | the review form (:283) gains `<FormKeys />` (below); `keep:<n>` and `dismiss` (:290, :297) as a `CheckboxGroup` (`issueKey="kept"`) and a `CheckboxField` |
| `app/p/[practiceId]/reconciliation/page.tsx` | text area :42, checkbox :45 |
| `app/p/[practiceId]/settings/agreements/page.tsx` | checkbox :72 |
| `app/p/[practiceId]/settings/proof-level/page.tsx` | checkbox :59 |
| `app/p/[practiceId]/settings/pricing/page.tsx` | `FORM_LABELS` (:23) and both `labels=` (:97, :112) removed |
| `components/contracts/forms.tsx` | text area :84 |
| `components/reconciliation/template-mapper.tsx` | reads `useFieldIssue` for `template` and each `column_*` select, prints `FieldError`, sets `aria-invalid`; its fieldset carries `data-invalid` |

**A defect not in mine.md, fixed here (blocking).** The coverage checklist review form
(`app/p/[practiceId]/coverage/page.tsx:283`) renders no `<FormKeys />`. Its route
(`lib/routes/models.ts:167-172`, `practice.coverage.review_evidence`) is a practice mutation: `parse` refuses a missing
request key (`lib/http/invoke.ts:107`) and `guard` refuses a missing CSRF token (:154), and `nextRequest` sets no
`csrfToken` for a server action, so every submit is refused. No e2e test submits it
(`models-routes.db.test.ts:580` calls the route directly), and the tour never refuses it. Confirmed in the code; the fix
is one line, in a file this slice changes anyway.

### 7.5 Slice D: console, account, support and the other surfaces

| File | Change |
| --- | --- |
| `app/console/status/page.tsx` | the `components[]` fieldset (:114-122) as a `CheckboxGroup` (`issueKey="components"`) |
| `app/console/billing/page.tsx` | :76's "(its administrator adds one in Settings first)" becomes "(its administrator adds one under Billing first)", the same place the refusal names (10.3; review finding 2) |
| `app/console/compliance/page.tsx` | hint at :191 (5.4) |
| `app/console/organizations/[organizationId]/page.tsx` | hints at :108, :109 (5.4) |
| `app/account/notifications/page.tsx` | checkboxes :45, :49 as `CheckboxField`s |
| `app/support/page.tsx` | the Subject and Message hints; the card's "Never send…" sentence moves into them (5.4) |
| `components/hardware-key.tsx` | 4.4 |
| `components/uploads/uploader.tsx` | 4.5 |
| `components/screening/split-form.tsx` | 4.6 |
| `components/billing/stripe-payment-method.tsx` | 4.1 (ConfirmForm's button, status line, alert focus; the start error's focus) |
| `packages/ui/src/states/loading-state.tsx`, `packages/ui/src/states/loading-announcement.tsx` (new) | 4.3 |
| Tests: `packages/ui/src/states/states.test.tsx`, `components/screening/forms.test.tsx`, `components/billing/billing.test.tsx` (if its markup assertions move), `components/form-hints.test.ts` (new) | section 8.5 |

### 7.6 Slice E: the end-to-end spec, personas and documents

| File | Change |
| --- | --- |
| `apps/web/e2e/forms-keep-input.spec.ts` (new) | section 8.4 |
| `apps/web/scripts/synthetic-personas.ts` | four personas and their comment (8.4); `scripts/seed.ts:32` seeds them and `seed.db.test.ts:37` follows the list |
| `apps/web/e2e/triage.spec.ts` | a refused write-off before the successful one (8.4); written beside #54's new step, after #54 merges |
| `apps/web/e2e/packets.spec.ts` | in the step at :420, a refused "Partially accepted" response before the recorded one (8.4; review finding 22) |
| `apps/web/e2e/contracts.spec.ts` | the comment at :140-141 ("The refused form is reset…") rewritten: the form keeps what was typed and the refill overwrites it |
| `docs/adr/0077-…md` (new), `docs/adr/0056-…md`, `docs/brand/BRAND.md` | section 9 |
| `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts` | FRM-01 to FRM-08 (8.1) |

### 7.7 The test matrix is not blocked (scout C was wrong here)

Scout C said FRM-01 to FRM-08 cannot land because `test-matrix.md`, `matrix.ts` and `registry.ts` are #42 files.
LANES.md rule 6 (`/home/user/ops/LANES.md:29-33`, and its Queues note at :91) names exactly these as shared documents
that both lanes change, the PR merged second keeping both. The repository did so while #42 was open: the BIL rows
(`5ca22632`, `co-001/bank-account-first`) and the DBF rows (`95ee88fe`). So the FRM rows land in this PR, in a new
section, with `none(…)` registry entries naming their tests. `reconciliation-001.md` is not edited (section 9.3).

### 7.8 After #42 merges, and what each loses until then

A small follow-up PR, `co-001/ux-forms-after-42`, queued "after #42 merges":

| File (#42) | Change | Until then |
| --- | --- | --- |
| `components/screening/upload-form.tsx` | `a11y-other-15`'s three gaps (the "Not sent" alert tied to the file input, focus on a refused file, "Reading the file" in the status region); retire its `FIELD_NAMES` table (:55-64) for 3.4's label reading; call `startTransition` before any `await` so `useFormStatus` is pending; the `aria-disabled` button | The screening form already keeps its values (it uses this pattern) but names fields from its own table, and its file field's gaps stay. It gets 3.7's mark and 5.1's 16 px from the stylesheet now. |
| `app/console/support/page.tsx` | Ticket's hint "Letters, digits and hyphens, as in SYN-1234." (:56); remove it from `form-hints.test.ts`'s allowlist | Its two forms keep values, show inline errors and name fields through ActionForm and the shared fields now; only the Ticket hint waits. |
| `app/settings/organizations/[organizationId]/users/page.tsx` | the raw confirm checkbox (:85) as a `CheckboxField` | Marked by ActionForm's fallback (aria-invalid, described by the summary item), with no inline message and no left rule. |
| `lib/routes/console.ts` | `words-other-01`'s email message (:517) | The summary reads "Email: an internal user cannot join a practice group or a firm; support access is a support grant", named but not reworded. |
| `lib/routes/settings.ts`, and `lib/zip.ts` (not #42's, but its `ZIP_CODE_FORMAT` is asserted by #42's `lib/screening/routes.db.test.ts:427`, so it moves with #42's files) | the ZIP wording ("enter five digits, or a ZIP+4 such as 27601-1234") in one change across the product | "five digits, or ZIP+4 such as 27601-1234", named "Billing ZIP". |
| `lib/screening/routes.ts` | `NO_PATIENT_INFORMATION` (:280) brought to the request-audit form's new words; `contactName` (:1181) | The screening's convert form keeps today's words; request-audit's change now (10.3). The two read differently until then. |
| `components/shell.tsx`, each `loading.tsx` | proposals in section 11 | |

### 7.9 Open pull requests that touch these files, and the landing order

Computed from git (`git diff --name-only $(git merge-base origin/claude/build-platform pr/<n>) pr/<n>`, saved as
`review/pr{48..54}-files.git.txt`) and intersected with this design's files (review finding 13; the REST list for #50
that the review used held 25 of its 44 files and missed `next.ts` and `action-form.test.tsx`):

| PR | Branch | Files shared with this design | What it means here |
| --- | --- | --- | --- |
| #50 | `co-001/superseded-rerun` | `components/action-form.tsx`, `lib/http/next.ts`, `components/action-form.test.tsx` (it creates it) | It rewrites the core: `refreshOnError`, `RefreshAfterRefusal`, `RefusalTakeover`, `noteRefusal`, `takesFocus`, `summaryLead`, `ActionState.invalid`, a `useLayoutEffect`. This design keeps all of them (7.1) and builds on them. **Must merge first**; slice A starts from its files. |
| #54 | `co-001/materiality-cents` | `app/p/[practiceId]/cases/page.tsx` (the :177 and :181 materiality inputs slice C1 moves), `lines/[lineId]/page.tsx`, `e2e/triage.spec.ts` | Slice C1 keeps #54's `dollarsForInput` values; the write-off step goes beside #54's step. |
| #51 | `co-001/pr-15b-ledger-payment-terms` | `abstraction/ledger/page.tsx`, `cases/[caseId]/page.tsx`, `submissions/page.tsx`, `reconciliation/page.tsx`, `e2e/packets.spec.ts` | Slices C1, C2 and E re-read these at the merged head. |
| #52 | `co-001/figures-in-words` | `packet/page.tsx`, `packet/[versionId]/review/page.tsx`, `lines/[lineId]/page.tsx`, `lib/copy/words.ts`, `words.test.ts`, `e2e/packets.spec.ts` | `listed()` is added beside #52's changes to `words.ts`. |
| #49 | `co-001/release-content-checks` | `coverage/page.tsx` | After it merges, check whether the review form still lacks `FormKeys` (7.4) before adding it. |
| #48, #53 | `co-001/ci-deps`, `co-001/model-eval-gate` | the three shared documents only | LANES.md rule 6. |

Every open pull request also touches `test-matrix.md`, `matrix.ts` and `registry.ts` (LANES.md rule 6: the PR merged
second keeps both).

**Landing order.** #50 first, then build (slices A, B, D and E's new files, and the parts of C1 and C2 on pages no
other PR touches). Before opening this PR for review: #49, #51, #52 and #54 merged, `claude/build-platform` merged
into this branch (LANES.md rule 6: merge, never rebase), slices C1 and C2 finished on those pages at the merged head,
and the full suite green. If one of the four is still open when everything else is ready, this PR waits for it: it is
the second to merge on every shared file, so it takes the conflicts, and a page moved onto the shared fields twice is
worse than a short wait.

---

## 8. Tests

### 8.1 Test matrix: a new section, "Forms (FRM)"

Added to `docs/product/test-matrix.md` after "Database function diffs (DBF)", and to `packages/synth/src/cases/matrix.ts`
word for word (`packages/synth/src/fixtures.test.ts:33` holds the two identical; the id fits its
`[A-Z]{2,3}-\d{2}` pattern):

```
## Forms (FRM)

| ID | Case | Assertion |
| --- | --- | --- |
| FRM-01 | A refused form keeps what was typed | Text, a select, a text area, a checkbox, a checkbox group, a radio, a date and a month keep the person's values after a refusal, and a valid default never replaces a refused value; a password and a one-time code are emptied, and a note under each says so; the action's state carries no value the person typed; a dropped connection keeps every value and says the save is not confirmed; a page whose CSRF token or request key is out of date is read again in place, and a second press saves with the values intact |
| FRM-02 | A saved form starts fresh | After a success that redirects to the same page, to the same address or to another page, the form shows its defaults, shows no refusal and carries a new request key |
| FRM-03 | A press while the form is working | Two presses in one frame, a second click and Enter in a field each send one request; the button keeps focus, is aria-disabled and keeps its words; a polite status beside it says "Working…" |
| FRM-04 | A refused field is named, described and marked | The summary is first in the form, on a line of its own, under "Not done"; its lead is "Fix the field listed here, then try again." for one field, "Fix the fields listed here, then try again." for several, and absent when no issue names a field; each item names its field by the label the person sees (a trailing parenthetical dropped unless it says posted or deposited; a group by its legend, a single box by its own label), links to it, and never shows a key; an issue with no field shows its message alone; under the field, "Error:" beside the message, the element that describes the field holding the message alone; the control is aria-invalid with a 2 px border in the danger color; the same refusal twice is announced twice |
| FRM-05 | Focus after a refusal | One issue on a field focuses that field; several issues, an issue with no field, a refusal with no issue, a dropped connection or a page out of date focus the summary; a link in the summary focuses its field; the focused element is never under the sticky header |
| FRM-06 | A refused form without JavaScript | The post reaches the action once; the page shows the summary and each field's own message, and no key; a success redirects with its notice |
| FRM-07 | Sign-in refusals | A wrong password keeps the email, empties the password and marks no field; a wrong code empties and marks the code field under "That did not match."; a code written "123 456" signs in; a weak password and two passwords that differ are issues on their own fields, the policy in the field's hint; Show password reveals and hides the text, is named by its words, turns off spell checking, autocorrect and autocapitalisation, and is hidden again, with aria-pressed false, before the form's data is read |
| FRM-08 | Phone-width controls and a refused form's accessibility | At 390 px an input, a select and a text area are at least 16 px; at 1280 px they are 14 px; a refused form passes axe (WCAG 2.1 A and AA) at both widths |
```

`packages/synth/src/cases/registry.ts`, after the DBF entries, each `none(1, …)` (milestone 1: the web app and its
sign-in, as SEC-15):

| Id | Why no file | `assertedBy` |
| --- | --- | --- |
| FRM-01 | "The forms are refused in a browser harness with in-memory actions, and on synthetic sign-ins and practices the seed creates; no file." | `apps/web/src/components/action-form.browser.test.tsx`, `apps/web/e2e/forms-keep-input.spec.ts`, `apps/web/e2e/triage.spec.ts`, `apps/web/e2e/packets.spec.ts` |
| FRM-02 | "A synthetic persona's support ticket is saved after a refusal; no file." | `apps/web/e2e/forms-keep-input.spec.ts` |
| FRM-03 | as FRM-01 | `apps/web/src/components/action-form.browser.test.tsx`, `apps/web/e2e/forms-keep-input.spec.ts` |
| FRM-04 | as FRM-01 | `apps/web/src/components/action-form.browser.test.tsx`, `apps/web/src/components/action-form.test.tsx`, `apps/web/src/components/form-issues.test.ts`, `apps/web/src/components/fields.test.tsx`, `apps/web/e2e/forms-keep-input.spec.ts` |
| FRM-05 | as FRM-01 | `apps/web/src/components/action-form.browser.test.tsx`, `apps/web/e2e/forms-keep-input.spec.ts` |
| FRM-06 | "The public request form is posted from a browser with scripts off; no file." | `apps/web/e2e/forms-keep-input.spec.ts` |
| FRM-07 | "Synthetic personas sign in through the local identity provider; no file." | `apps/web/src/lib/routes/sign-in-routes.db.test.ts`, `apps/web/src/components/action-form.browser.test.tsx`, `apps/web/e2e/forms-keep-input.spec.ts` |
| FRM-08 | "The public request form and a synthetic practice's form are measured and scanned in the browser; no file." | `apps/web/e2e/forms-keep-input.spec.ts` |

Every test that asserts a row names the row's id in its title, as the repository's tests do.

### 8.2 Unit tests in a real browser, with no new dependency

**Tooling (scout C, section 6, tried in scratch).** The unit project has no DOM environment: no jsdom, happy-dom,
`@testing-library` or `@vitest/browser` in any `package.json`. `// @vitest-environment happy-dom` fails ("Cannot find
package 'happy-dom'"), and adding it would change `pnpm-lock.yaml`, a #42 file. `renderToStaticMarkup` (the
repository's component tests) cannot run effects, focus or a submit. What resolves from `apps/web` today:
`@playwright/test` 1.56.1 (its `chromium`), `react-dom/client`, and `createViteServer` from `vitest/node`.

So `components/test-support/browser.ts` exports `withHarness(run)`: it starts `createViteServer` (`configFile: false`,
`root` the test-support folder, `server.port: 0`, its own `cacheDir`) over `forms-harness.html`, whose entry
`forms-harness.tsx` renders the real `ActionForm`, `Field`, `SelectField`, `TextAreaField`, `CheckboxField`,
`CheckboxGroup` and `PasswordField` with `createRoot`, and in-memory async actions that refuse or succeed as the
test sets through `window`. It launches `chromium` from `@playwright/test`, runs the test, and closes both. The
describe block skips when `existsSync(chromium.executablePath())` is false, which is right on a developer's machine;
on CI the unit project's global setup (`tools/test/ci-chromium.ts`, CI-05) already fails a run without Chromium, so the
tests cannot silently skip there. Scout C's two scratch tests passed in 2.6 s under `vitest run`.

The harness wraps the form in Next's `AppRouterContext` (`next/dist/shared/lib/app-router-context.shared-runtime`)
with a stand-in router that counts `refresh()` calls, so `RefreshAfterRefusal` (3.5a) runs outside a Next app.
Its in-memory actions can also throw: a `TypeError('Failed to fetch')` stands for a dropped connection (what
`drive/r4.out` D2 logged), an `Error` with a `digest` for a server failure.

`components/action-form.browser.test.tsx` (new; each title cites its FRM id):

1. **FRM-01** A refusal keeps a text field (with a `defaultValue`, typed over), a select, a text area, a checkbox, a
   `CheckboxGroup`, a radio pair, a date and a month; it empties a `PasswordField` (in either mode) and an
   `autocomplete="one-time-code"` `Field`, and a hand-written `type=password` input (the fallback); each secret
   field shows its emptied note, named in its `aria-describedby` after the error; the refused ZIP `0001` stays `0001`,
   not its default `27601`.
2. **FRM-01** The action receives the submitter's name and value (a form with two named submit buttons), and the
   state the action returns carries no field value.
3. **FRM-01** A dropped connection: no error is thrown out of the form, every value stays, the summary reads "Not
   confirmed" and is focused; the next press reaches the action. A server failure (an error with a `digest`) is
   rethrown to the nearest error boundary.
4. **FRM-01** A `stale` state: the stand-in router's `refresh()` is called once, the values stay, the lead ends
   "press “Save” again." (the form's own button words); a refusal with `refreshOnError` still notes its takeover
   (#50's behaviour, unchanged).
5. **FRM-03** Two `click()` calls in one `evaluate` send one action call; Enter in a field while pending sends none;
   the focused button keeps focus and has `aria-disabled="true"`; the status reads "Working…" while pending and is
   empty after; the status is inside the button's wrapper, not a child of the form.
6. **FRM-04** The summary is the form's first element, with `data-slot="refusal-summary"`; in a
   `grid md:grid-cols-2` form every field keeps its column after the refusal, and a `flex` row form wraps; the lead
   is the singular sentence for one placed field, the plural for two, and absent for a lone issue keyed `pattern`
   and for one keyed `refused`; items read "Billing ZIP: …" for a field labelled "Billing ZIP (ZIP+4 if Medicare
   needs one)", "Components affected: …" for a group's issue keyed `components` with boxes named `components[]`,
   "NCCI edits: …" for one box of a fieldset of independent booleans, "Confirmation: …" for a `CheckboxField` with
   that `errorName`; no item contains any issue key (the test checks every key it sent).
7. **FRM-04** Each field shows "Error:" and its message under it; the element `#{id}-error` holds the message alone
   (the shape `screening.spec.ts:718` asserts); the control has `aria-invalid="true"` and its `aria-describedby` names
   the message first, then the hint; a raw control with no component is marked by the fallback and described by its
   summary item; the next state removes every mark.
8. **FRM-04** The same refusal twice: two insertions of `[data-slot="alert"]` (a `MutationObserver` counts them).
9. **FRM-05** One issue focuses its field; two issues focus the summary; an issue with no field focuses the summary;
   pressing an item's link focuses its field and leaves `location.hash` unchanged; with a 56 px sticky header and
   `html { scroll-padding-top }` from the real stylesheet, a field near the top that is focused ends below the
   header's bottom. (The harness page links `packages/ui/src/styles.css` as plain CSS: the browser ignores its
   Tailwind at-rules, and its unlayered rules, the ones this PR adds, apply as in the app.)
10. **FRM-04** A `CheckboxGroup` with an issue: the message is inside the fieldset after the legend, the fieldset's
    `aria-describedby` names it, the fieldset has `data-invalid`, focus is on its first box.
11. A `beforeSubmit` that returns false sends nothing (the split form's case).
12. **FRM-07** `PasswordField`: Show sets `aria-pressed="true"` and `type="text"`; the input has `spellcheck="false"`,
    `autocorrect="off"` and `autocapitalize="none"` in both modes; a submit turns it back to `type="password"` with
    `aria-pressed="false"` before the action receives the data; its accessible name is "Show password"; the toggle
    is `hidden` in the server markup and shown after mount.

`components/action-form.test.tsx` (#50's, static): `summaryLead` returns the singular, plural or no lead by the
number of issues placed, and, with no placement yet, by the issues whose key is neither `input` nor `requestKey`;
its existing cases (a refusal whose issues are all on hidden fields stands alone) still hold.

`components/form-issues.test.ts` (new): `fieldName` drops one trailing parenthetical and a trailing colon, collapses
white space, and keeps "Recovered principal, net (posted)" and "… (deposited)" whole.

`components/fields.test.tsx` (static markup, no browser): each field rendered inside `FormIssuesContext` with an issue
shows the message and `aria-invalid`, and without one shows neither; `Field`'s `aria-describedby` order is error then
hint (the order #42's `screening.spec.ts:717` checks), and `#{id}-error`'s text is the message alone (`:718`, `:724`);
`data-error-name`, `data-issue-for` and, for a one-time code, `data-secret` are written.

### 8.3 Other unit tests

- `packages/ui/src/states/states.test.tsx`: LoadingState has `role="status"`, no `aria-busy`, the label as visible
  text in `data-slot="loading-label"`, and an empty status in static markup (the announcement arrives after mount).
  The `aria-busy="true"` expectation (:26) is removed.
- `packages/ui/src/components/components.test.tsx`: the button's variants include the `aria-disabled:` classes.
- `components/screening/forms.test.tsx`: `splitSettings` keeps its shape (:52-75 unchanged); a new `splitFaults`
  says which list each problem concerns; the form's markup has a `role="status"` region with
  `id="split-problems"` from the first render.
- `components/form-hints.test.ts` (new): every JSX element with `pattern` has `hint` or `aria-describedby`; the
  allowlist is `app/console/support/page.tsx` alone, marked for removal after #42.
- `lib/copy/words.test.ts`: `listed([])` is "", `listed(['a'])` "a", `listed(['a','b'])` "a and b",
  `listed(['a','b','c'])` "a, b and c".

### 8.4 The end-to-end spec: `apps/web/e2e/forms-keep-input.spec.ts`

It imports `e2e/helpers.ts` and `e2e/a11y.ts` read-only (and `e2e/env.ts`, a #42 file, only through them, as
`playwright.config.ts` already does). It does not edit `a11y.ts` (no tag change, no helper there; PR 7 and ci-browser
build on it). Form helpers it needs live in the spec.

**Personas**, added to `apps/web/scripts/synthetic-personas.ts` with a clause in its header comment ("and, for the
forms journey, a viewer who signs in with a wrong password and code, an invited viewer who chooses a password, a
billing manager of the other group and a platform administrator, each alone"), because refusals count toward the
ten-failure lock and specs run in parallel:

| Key | Organization, role | Used for |
| --- | --- | --- |
| `forms-signin` | group, viewer | sign-in refusals |
| `forms-invited` | group, viewer, `invited: true` | the new-password step |
| `forms-manager` | other_group, billing_manager | ROI and the support ticket |
| `forms-admin` | internal, platform_admin | console status (hardware key) |

**Tests** (each `test.step` cites its FRM id):

1. **Request an audit, refused, with and without JavaScript (FRM-01, FRM-04, FRM-05, FRM-06, FRM-08).** No persona
   (a public form; `public_form` is limited per address, and no proxy is trusted in e2e, so it never applies).
   - Fill all eight fields with synthetic values, Organization "SYNTHETIC CLINIC 2026-01-01" (a date shape, refused
     as patient information, as the tour does at `tour.spec.ts:1023`), and send.
   - The other seven fields hold what was typed, and Organization still reads "SYNTHETIC CLINIC 2026-01-01".
   - The summary is the form's first child, reads "Not done", "Fix the field listed here, then try again." and
     "Organization: this form takes no patient information: remove anything that looks like an identifier, a date or a
     phone number, then send it again"; the page's visible text (`page.locator('main').innerText()`) contains no
     `organizationName` and no other key (the `name=` attributes are in the HTML, so the test reads the text, not the
     markup).
   - Organization is focused, `aria-invalid="true"`; its error line shows "Error:" and `#{id}-error` reads "this form
     takes…".
   - `expectAccessible(page, 'Request an audit, refused')`, then `atPhoneWidth` with the same refusal shown.
   - At 390 px, the computed `font-size` of Organization (input), "How you bill" (select) and "Payers you bill" (text
     area) is at least 16 px; at 1280 px it is 14 px.
   - In a `browser.newContext({ javaScriptEnabled: false })`: the same post reaches the action (the page comes back
     with the summary), each refused field shows its error line, the summary has no key, and the fields are empty
     (accepted, 2.4).
2. **Sign-in (FRM-01, FRM-05, FRM-07).** `forms-signin`.
   - A wrong password: Email keeps the address, Password is empty, no field has `aria-invalid`, the summary is focused
     and reads "That did not match. Check the email, the password or the code, and try again."
   - The right password, then the code "000000": the code field is empty, `aria-invalid="true"`, focused; the summary
     reads "That did not match." and "Six-digit code: enter the code your authenticator app shows now".
   - The right code typed as "123 456" (`personaTotpCode`, split by a space): signed in.
3. **Choose a password (FRM-07).** `forms-invited`, through its temporary password.
   - New password's hint reads "At least 12 characters, with a lowercase letter, an uppercase letter, a digit and a
     symbol." and describes the field.
   - "Show new password" (`getByRole('button', { name: 'Show new password', exact: true })`: without `exact` it also
     matches "Show new password again" and fails strict mode) toggles `aria-pressed` and the field's type.
   - "syntheticpassword" twice: both fields empty; New password marked and focused; "Choose a stronger password." and
     "New password: it still needs an uppercase letter, a digit and a symbol".
   - Two different strong passwords: "New password again: the two passwords do not match: type the same password in
     both fields", that field marked and focused.
4. **A practice form (FRM-01, FRM-03, FRM-04, FRM-08).** `forms-manager` on `/p/{practiceId('other')}/reports/roi`.
   - First day 2026-09-30, Last day 2026-04-01, Generate: both dates are still the ones typed (not the suggested
     quarter); Last day is marked and focused; the item reads "Last day: …".
   - Requests are counted with `page.on('request')` (POSTs carrying the `next-action` header). The refusal comes back
     in tens of milliseconds on a local server, so the POST is **held**: `page.route('**/reports/roi', …)` keeps the
     first POST until the pending assertions are done, then `route.continue()` releases it. While it is held: the
     button, focused and pressed with Space, keeps focus, is `aria-disabled` and keeps its words; Space again sends
     nothing; the status reads "Working…". Separately, Enter pressed twice in First day while a POST is held sends
     one request. Released, the refusal shows; one request per press sequence in each case.
   - At 390 px, after the refusal, the focused field's `boundingBox().y` is at or below the bottom of the
     `[data-slot="app-header"]` (2.4.11).
   - The field's computed `border-top-width` is 2px and its colour the danger token's.
   - `expectAccessible` on the refused form, and `atPhoneWidth`.
   - Nothing is generated: the refusal is checked before anything is written, so no other spec's practice data moves.
5. **A dropped connection, a page out of date, and a saved form starts fresh (FRM-01, FRM-02, FRM-05).**
   `forms-manager` on `/support?from=remittances`, Subject, category and message filled:
   - The first POST is aborted (`page.route` → `route.abort('internetdisconnected')`): no error page; "Not
     confirmed" and its lead show, focused; every value kept. The route is removed.
   - The hidden `csrfToken` is changed in the page (`evaluate`), then sent: the summary reads "This page was out of
     date, so nothing was saved. It is up to date now: press “Open ticket” again." (the form's button words,
     `support/page.tsx:49`); every value kept; the hidden token differs from the one written, that is, the page was
     read again.
   - A Subject containing "date of birth" is refused (the tour's case, `tour.spec.ts:1720`); Subject, category and
     message keep what was typed.
   - The Subject is corrected and the ticket opens; after the redirect the notice shows, Subject and message are
     empty, no "Not done" shows, and the `requestKey` hidden value differs from the one before. The ticket is the
     persona's own ("Your tickets"), read by no other spec.
6. **A checkbox group (FRM-04, FRM-05).** `forms-admin` (`registerKeyAndSignIn`) on `/console/status`: Open incident
   with a Title and a First update and no component: Title and First update kept; the summary reads "Components
   affected: choose at least one component"; the fieldset has `data-invalid` and its error line; the first box is
   focused. The incident is not opened.

**`apps/web/e2e/triage.spec.ts`**: in the step at :118, before the write-off that succeeds, a refused one: Reason
"Other", the box ticked, Why left empty, Write off: Reason still reads "Other" (not "Window passed"), the box is still
ticked, Why is marked and focused (FRM-01, `a11y-practice-1-03`'s blocking case). Then Why is filled and the write-off
goes through as today. The persona (`triage-manager`) and practice are the spec's own. Written after #54 merges,
beside its new step (7.9).

**`apps/web/e2e/packets.spec.ts`**: in the step at :420 (the payer's letter recorded as a partial acceptance), before
the response that is recorded: Response "Partially accepted" (`partial`) with Amount accepted left empty, Record
the response: Response still reads "Partially accepted" (a reset would record the wrong payer response,
`narrow-practice-1-07`), Amount accepted is marked and focused, and its item reads "Amount accepted: what the payer
accepted, in dollars and cents" (the route's message, `lib/routes/submissions.ts:237`, the label's "(accepted or
partial only, dollars)" dropped). Then the amount is filled and the step goes on as today (FRM-01; review finding 22).

### 8.5 Existing tests that change

| Test | Change |
| --- | --- |
| `lib/routes/sign-in-routes.db.test.ts:169` | `problems: arrayContaining(['a digit'])` becomes an `issues` entry on `password` containing "a digit"; new cases: a code "123 456" and "123-456" accepted; a wrong code's `issues` name `code`; :152's `stringContaining('did not match')` stays |
| `lib/auth/cognito-provider.test.ts:139` | `problems: []` |
| `apps/worker/src/billing/billing.db.test.ts` (#42) | **not touched**: `:442`'s `/no payment method on file/` matches the new words unchanged |
| `components/action-form.test.tsx` (#50's) | `summaryLead`'s new cases (8.2); its takeover cases unchanged |
| `e2e/packets.spec.ts:420-432` | the refused partial response before the recorded one (8.4) |
| `lib/http/http.test.ts` (#42) | **not touched**: it asserts route outcomes (`invoke.ts:107`'s `requestKey` issue, `csrf_refused`), which this PR leaves as they are; only `next.ts` maps them to the `stale` state |
| `packages/ui/src/states/states.test.tsx:22-36` | 8.3 |
| `e2e/contracts.spec.ts:140-141` | the comment only; its refill (`fill`, `selectOption`) passes either way |
| `e2e/onboarding.spec.ts:536-542` | **unchanged and still passing**: the item still reads "Billing ZIP: five digits, or ZIP+4 such as 27601-1234" (the label's parenthetical dropped), the field is marked and, as the only issue, focused |
| `e2e/helpers.ts:49` | unchanged: the code step's lead keeps "That did not match" |
| `e2e/sign-in.spec.ts:55-63`, `onboarding.spec.ts:291-299` | unchanged: the first step's words are unchanged and `fill()` overwrites the kept email |
| The route tests' `sample` inputs (`lib/routes/route-tests/*`) | `support.ts`'s preprocess and `sixDigitCode` keep every `sample` valid; `pnpm test:db` must pass |

No spec depends on the button's "Working…" words (checked: `grep 'Working…'` in `e2e` finds nothing). Playwright's
`toBeDisabled()` (`packets.spec.ts`, `unattested.spec.ts`, `contracts.spec.ts`) honours `aria-disabled`, and those
buttons are not ActionForm's pending button anyway.

The screen tour (`tools/lane-b-screen-tour/capture/tour.spec.ts`, on claude/build-ops) needs no change: its
`refused()` (:536) matches "Not done".

---

## 9. Docs

### 9.1 ADR 0077 (needed)

`docs/adr/0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md`.
It is needed: the submission pattern has two conditions a later change could break without a test failing at once
(the server action passed unwrapped; FormKeys never in a layout), the label rule replaces a prop pages used, and the
phone exception amends a brand ADR. In the form of 0073 (Status, Date, Deciders, PRD sections; Context, Decision,
Alternatives considered, Consequences, Not verified here, Revisit when):

- **Status:** accepted (`co-001/ux-forms`, the UX baseline review's first PR); amends
  [0056](0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md) (the type
  scale's phone exception).
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings of 2026-10-25 (about 21:27 and 21:34 UTC) have the build improve as it goes and take each
  recommended wording and visible change without asking; the build (Lane B). Each reversible by the founder.
- **PRD sections:** 6 (Cross-cutting: accessibility, labels, every error with a next step, PRD.md:256); test matrix
  FRM-01 to FRM-08; ADRs 0017 (request keys), 0053 (forms, CSRF, CSP), 0056.
- **Decisions:**
  - D1. A form keeps `<form action>` on a `useActionState` over the **unwrapped** server action (the post without
    JavaScript and the pre-hydration replay), and dispatches from `onSubmit` (`preventDefault`;
    `startTransition(() => dispatch(new FormData(form, submitter)))`) to a second `useActionState` whose action calls
    the same server action, so React never resets the form on a refusal and nothing typed is echoed back. The
    second hook turns a dropped connection (fetch's `TypeError`, no digest) into a "Not confirmed" state and rethrows
    everything else, Next's redirect included. Success resets through Next's redirect remount. FormKeys is rendered
    by pages, never by a layout.
  - D2. After a refusal, every field marked `data-secret` (a password; a one-time code) is emptied (WCAG 2.2 3.3.7's
    exception), and a note under it says so.
  - D3. A refused field is named by the label the person sees, read from the page (a trailing parenthetical dropped,
    never one that says posted or deposited; a group by its legend, a single box by its own label; `errorName` on
    the control when its label is a sentence); no form keeps a table of labels, and no key is ever shown. The
    summary is first in the form on a line of its own, keyed per response so a repeated refusal is announced again;
    its lead counts the issues that name a field. Each field shows "Error:" beside its message, the described element
    holding the message alone; one CSS rule marks every refused control with a 2 px danger border.
  - D4. Focus after a refusal: the field, when there is exactly one issue on a field; the summary otherwise. A
    `scroll-padding-top` the height of the sticky header keeps the focused element in view (WCAG 2.2 2.4.11).
  - D5. A pending submit keeps the button focusable (`aria-disabled`), guards a second press with a ref, and says
    "Working…" in a polite status inside the button's wrapper.
  - D10. A page whose CSRF token or request key is out of date is read again in place (`router.refresh()`, #50's
    `RefreshAfterRefusal`), keeping what was typed; only a refusal of the person's own press invites pressing again.
  - D6. Form controls are 16 px below the md breakpoint (48rem), 14 px from md up, by one unlayered rule in
    `packages/ui/src/styles.css`; the viewport never sets `maximum-scale`.
  - D7. A six-digit code is accepted with spaces or hyphens; no `pattern` on the code fields.
  - D8. Password fields offer Show (NIST SP 800-63B 5.1.1.2), named by their own words.
  - D9. Every field checked by `pattern` states its format in its hint, held by a test.
- **Alternatives considered:** section 2.5's table, the render-time label source (3.4), class-based 16 px (5.1), a
  single hook (a dropped connection then shows the error page and empties the form, `drive/r1.out` R1), a closed list
  of strippable label notes (3.4), a separate prefix id or CSS content for "Error:" (3.3).
- **Not covered:** a press made before hydration is replayed by React through the server hook and its refusal resets
  the form (2.4a); a session that ends while a form is open sends the person to sign in and loses what was typed,
  on purpose, since typed text is never kept in browser storage (2.4a).
- **Not verified here:** iOS Safari's zoom itself (the captures and CI are Chromium; the computed size is asserted);
  screen readers by hand (the announcements in 3.9 follow the ARIA the tests assert, and are listed for PR 7's manual
  3.3.7 and 3.3.8 checks, combined audit #103).
- **Revisit when:** React or Next changes the form-action reset or the redirect remount (the FRM-01 and FRM-02 tests
  fail first); the words pass after #42 lets browser validation be turned off (section 11).

### 9.2 ADR 0056 and BRAND.md

- `docs/adr/0056-…md:3`: the status becomes "accepted; amended by [0058](…) and [0077](…)".
- After its type-scale sentence (:48-50, "tables and dense controls 14"), an italic note in 0058's style
  (:104-105): *"Amended by [0077](…) (decision D6): below the md breakpoint, form controls are 16 px, so iOS Safari
  does not zoom the page when a field takes focus; from md up they stay 14."* The sentence itself is not rewritten.
- `docs/brand/BRAND.md` section 5, the "Body and UI" row's notes: "16/24 body; 14 in dense tables **and form controls
  from 768 px up (16 below; ADR 0077)**; labels 500; buttons 600".

### 9.3 docs/product and reconciliation-001

- `docs/product/test-matrix.md`: the FRM section (8.1). Nothing else in `docs/product` changes: the PRD's
  cross-cutting line (PRD.md:256) already says what this PR delivers.
- `docs/product/reconciliation-001.md` is not edited (as 0073 did not). Its "What must not change, as checks"
  (:440-486, read only) that this PR touches:
  - **Security program:** `pnpm test:db` passes, the generated route tests exercising the changed sign-in, support
    and schemas inputs (`sample` stays valid, 8.5).
  - **Response headers** (ADR 0053/0055): unchanged; no `style` attribute is added (2.6).
  - **The role and permission matrix:** untouched. No route's permission changes.
  - **Engine, ledger, content pipeline, applied migrations, AUDIT-01, milestones:** untouched.
- The rulings this PR takes (every wording in section 10, Show password, the focus rule, md as the phone boundary) are
  recorded in ADR 0077 and reported to the co-founder in one list, per his ruling of 2026-10-25 (about 21:34 UTC).
  That report names, as **departures**, each recommended wording the design replaces, with its reason (review
  finding 14):

| Recommended (finding) | Taken instead | Why |
| --- | --- | --- |
| Sentences after the name, with a capital and a full stop: "Organization: this form takes no patient information. Remove anything …, then send again." (`words-other-01`, every rewrite) | One lower-case clause chain after the name, the house form "{name}: {instruction}": "Organization: this form takes no patient information: remove anything that looks like an identifier, a date or a phone number, then send it again" | The summary prints "{label}: {message}" for every route's message, and the same message is the API's `issues[].message`, where it has no label in front; a lower-case clause reads correctly in both, and one form across 112 forms does not drift. The words are the recommended ones. |
| "Organization: SYNTHETIC BILLING FIRM has no payment method on file. Ask its administrator …" (`words-other-01`) | "the organization has no payment method on file: ask its administrator to add one under Billing, then issue the invoice" | A refusal carries the rule's words, never a value (`invoke.ts:306-307`); the organization is the one the person just chose, on the same screen. |
| "Your name: enter your name, up to 200 characters." (`words-other-01`) | "Your name: enter at most 200 characters" (and "Your name: fill this in" when empty) | `contactName` is `requiredText(200)`, shared by 32 schemas; one instruction per rule ("fill this in", "enter at most {n} characters") serves them all. The field's `maxLength={200}` makes the long case rare. |
| "Name: enter the organization’s name."; "Reason: say what the ticket needs, with no patient details." (`words-other-01`) | "Name: fill this in"; "Reason: fill this in" | The same shared rule; the label already says what goes in. The reason field's no-patient rule is its hint. |
| "New password again: the two passwords do not match. Type the same password in both fields." (`words-other-01`) | "New password again: the two passwords do not match: type the same password in both fields" | The house form above; the words are the recommended ones. |
| "Check the fields marked below." → "Fix the fields listed here, then try again." (`words-other-03`) | Taken; made singular for one field, and no lead when no issue names a field (#50's rule) | A lead about fields over items that are not fields is false (review finding 7). |
| `zip`, `email` (console), the screening's messages (`words-other-01`) | Wait for #42 (7.8) | Their files are #42's. |
| "Not sent: the connection to PaidWhole dropped." (review finding 4, not a mine.md wording) | Title "Not confirmed"; "The connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “{submit}” again." | The response may be what dropped, after the server saved; "Not sent" could be false. A second press is safe (ADR 0017). |
| "Reload the page and try again" (today's CSRF and request-key words) | 3.5a's two sentences | A reload now throws away what this PR keeps. |

---

## 10. Visible changes and every string a person sees

### 10.1 Before and after screenshots

With `tools/lane-b-screen-tour`, `TOUR_REF` set to the base (`4d99df8`) and then the head, at 1280 px and 390 px
(light; dark marked "tokens only"):

| Route | States | What changes |
| --- | --- | --- |
| `/sign-in` | default, `error-wrong-password`, `error-locked` | email kept, password empty; Show password; summary first |
| `/sign-in/mfa`, `/sign-in/enroll` | default, `error` | the code hint; the code marked, "That did not match." with its item |
| `/sign-in/new-password` | default, `error-mismatch`, `error-policy` | the policy in the hint; Show on both fields; each refusal on its own field |
| `/sign-in/hardware-key`, `/sign-in/register-key` | default, error | the status line while waiting; "Not registered" |
| `/request-audit` | `error` | values kept; "Organization: …"; the error line; 16 px at 390 |
| `/support` | default, `error` | the no-patient-information hints; values kept |
| `/console/status` | `error` | the group marked, its message; Title kept |
| `/console/models` | `error` | Flag and Applies to keep the budget choice (no kill switch for everyone) |
| `/console/practices/[practiceId]` | `error` | ZIP `0001` kept, not `27601` |
| `/console/organizations/[organizationId]` | default, `error` | NPI and Tax ID hints; invited email kept |
| `/console/terms`, `/console/compliance` | default, `error` | values kept; the compliance SHA-256 hint |
| `/settings/billing/[organizationId]` | `error` | routing `12345` kept, not `110000000`; the new message |
| `/settings/organizations/[organizationId]/users` (#42 page) | `error` | values kept, field named (through ActionForm) |
| `/p/[practiceId]/cases/[caseId]` | `error` (write-off) | Reason stays "Other", box ticked, "Why" named and marked |
| `/p/[practiceId]/cases/[caseId]/submissions` | `error` | "Partially accepted" kept; the select marked |
| `/p/[practiceId]/abstraction/ledger` | `error-adjust-zero` | amount, reason and tick kept; the amount's hint |
| `/p/[practiceId]/reports/roi` | `error` | the typed period kept, not the suggested quarter |
| `/p/[practiceId]/settings/pricing` | `error` | ZIP kept; named "Billing ZIP" with no labels table |
| `/p/[practiceId]/settings/correspondence` | `error` | all nine fields kept; summary focused (two issues) |
| `/p/[practiceId]/contracts` | default; `error` (the tag form, `grid gap-3 sm:grid-cols-2`, `components/contracts/forms.tsx:44`) | the uploader: one tab stop; refused, the summary spans both columns and no field changes column |
| `/console/status` | `error-row` (a component's status row, `className="flex items-end gap-2"`, refused) | the row wraps: the summary on its own line above the select and "Set" |
| `/support` | `error-unconfirmed`, `error-stale` | "Not confirmed" and "This page was out of date" with every value kept (the tour aborts the POST and alters the hidden token, as 8.4 step 5 does) |
| `/sign-in` | `error-wrong-password` at 390 | "Emptied for your security: type it again." under Password |
| `/console/screening` | `error` | the split's live problems and marked fields |
| any `loading.tsx` route (`/settings/billing`, `/p/[practiceId]/cases`) | loading | the label shown beside the bar |
| `/p/[practiceId]/coverage` | checklist review | now submits (FormKeys) |

Every refused state shows the summary at the top of the form and the "Error:" line under each field.

### 10.2 New and changed strings (exact)

| Where | Before | After |
| --- | --- | --- |
| Summary lead (`next.ts:162`, `:180`; chosen in the browser, 3.5) | "Check the fields marked below." | "Fix the field listed here, then try again." (one issue on a field) / "Fix the fields listed here, then try again." (several) / no lead (no issue names a field) |
| Summary item | "{key}: {message}" | "{label}: {message}", or "{Message}" alone for an issue with no field |
| Under a refused field | (nothing) | "Error:" (shown, beside the icon) and "{message}" |
| Under an emptied password, after a refusal | (nothing) | "Emptied for your security: type it again." |
| Under an emptied six-digit code, after a refusal | (nothing) | "Emptied for your security." |
| A dropped connection (title, lead) | the error page ("Something went wrong") | "Not confirmed"; "The connection to PaidWhole dropped before an answer came back. What you typed is still here: check your connection, then press “{submit}” again." |
| A stale CSRF token or request key, after the person's own press | "This form could not be checked against your session (it may have come from another site, or your session changed). Reload the page and try again." / "requestKey: reload the page and try again" | "This page was out of date, so nothing was saved. It is up to date now: press “{submit}” again." |
| The same, from a post this page did not start (no JavaScript, a replay) | as above | "This page was out of date, so nothing was saved. Check the form, then send it again if you still mean to." |
| Too long (`requiredText`) | "at most {n} characters" | "enter at most {n} characters" |
| Console billing, the audit invoice line (`console/billing/page.tsx:76`) | "(its administrator adds one in Settings first)" | "(its administrator adds one under Billing first)" |
| Pending (ActionForm, version form, export form, Stripe) | the button's words become "Working…" | the button keeps its words; a status beside it says "Working…" |
| Hardware key, while waiting | the button's words become "Waiting for the key…" | the button keeps its words; a status says "Waiting for your hardware key. Touch it, then confirm with its PIN or fingerprint." |
| Hardware key registration failure title | "Not signed in" | "Not registered" |
| Loading | the label for screen readers only | the same label also shown beside the bar |
| Code fields' hint | (none) | "Six digits. Spaces are fine." |
| `sixDigitCode` message | "the six-digit code from your authenticator app" | "enter the six digits your authenticator app shows" |
| Wrong code (code steps) | "That did not match. Check the email, the password or the code, and try again." | lead "That did not match."; item "Six-digit code: enter the code your authenticator app shows now" |
| First sign-in step, locked, hardware key | unchanged | unchanged |
| Password policy | "Choose a password that meets the policy." / "It needs an uppercase letter, a digit, a symbol." | lead "Choose a stronger password."; item "New password: it still needs an uppercase letter, a digit and a symbol" |
| User pool's own refusal | "It needs a password the user pool accepts." | "New password: the sign-in service refused it: choose a different password" |
| Mismatch | "the two passwords differ" | "the two passwords do not match: type the same password in both fields" |
| New password hint | (none; the rules in the card) | "At least 12 characters, with a lowercase letter, an uppercase letter, a digit and a symbol." |
| New password card | "Your invitation … Choose your own: at least 12 characters, with …" | "Your invitation to PaidWhole came with a temporary password. Choose your own." |
| Show password | (none) | "Show" (named "Show password", "Show new password", "Show new password again") |
| Empty required field (`requiredText`, sign-in password) | "required" | "fill this in" |
| Console status, no component | "Invalid input: expected array, received undefined" | "choose at least one component" (the existing words, now reached) |
| Attestation lists' legends (new) | (none) | "Confirm each item before you sign" (report); "Confirm each item before you attest" (packet) |
| Consequence checkboxes' summary name | (the key `confirm`) | "Confirmation" |
| `/support` Subject and Message hints | (none) | "No patient names, dates of birth, member IDs or claim numbers. Name the screen and the record's ID." |
| `/support` card | "… Never send a patient's name, date of birth, member ID or claim number: name the screen and the record's ID from its address instead." | the last sentence moves into the hints |
| Format hints | (none) | 5.4's table |

### 10.3 Server messages reworded in this PR (`words-other-01`, outside #42)

| Key, file:line | Before | After |
| --- | --- | --- |
| `routingNumber`, `lib/routes/billing.ts:224` | "a nine-digit routing number" | "enter the nine digits of the routing number" |
| `accountNumber`, same line | "an account number" | "enter the account number, 4 to 17 digits" |
| `organizationId`, `apps/worker/src/billing/account.ts:289` | "the organization has no payment method on file; its administrator adds one in Settings first" | "the organization has no payment method on file: ask its administrator to add one under Billing, then issue the invoice" (no organization name: a refusal carries the rule's words, never a value, `invoke.ts:306-307`) |
| request audit, `lib/routes/onboarding.ts:34` | "this form takes no patient information: remove anything that looks like an identifier, a date or a phone number" | the same, then ", then send it again" |
| `occurredOn`, `lib/routes/compliance.ts:151` | "evidence is recorded for what has happened" | "the date is after today: enter the day it happened, today or earlier" |
| `version`, `lib/routes/console-onboarding.ts:316` | "letters, digits and . _ -" | "use only letters, digits, dots, underscores and hyphens, such as 2026-11" |
| `confirm`, `lib/routes/sign-in.ts:164` | "the two passwords differ" | 10.2 |
| `subject`, `lib/routes/support.ts:243` | unchanged (its words already give a next step; only its key goes) | |

Every one keeps the house form "{name}: {lower-case instruction}" the summary prints. All are checked against
`.claude/rules/brand.md`, BRAND.md and CO-11: no "AI", no "owed", "underpaid" or "recovered", no ProofPack; `pnpm
lint:copy` runs on them.

---

## 11. No migration; proposals outside the PR

### 11.1 No migration

Nothing here touches `packages/db`: no table, column, function, policy or grant changes. The changed schemas are Zod
input schemas in `apps/web/src/lib/routes` (`sixDigitCode`, `requiredText`'s message, `componentList`'s preprocess,
messages) and one message in `apps/worker/src/billing/account.ts`. The sign-in flow's records, the lock count and the
audit events are unchanged. `docs/product/domain-model.md` is not regenerated and needs no approval line. No file of
`packages/db/migrations` or `content/releases` is touched. This is not a schema PR, so Lane B may build it. The
revision adds no schema either: the dropped connection and the stale page live in the browser and in `next.ts`'s
mapping of outcomes that already exist (`csrf_refused`, the `requestKey` issue); the route outcome type, the request
key's recording (ADR 0017) and every guard are unchanged.

### 11.2 Proposals (outside this PR's files; improve as you go)

1. **After #42** (7.8): the upload form's three gaps and its label table; Ticket's hint; the users page's checkbox;
   the ZIP, email, screening and settings message rewrites, in one pass with `lib/zip.ts`.
2. **The Notice PR** (already planned): the `?notice=` confirmation takes focus and a `role="status"`, so focus after a
   success lands on it (`a11y-practice-1-04`'s second half); the Alert's role and kinds.
3. **Turn browser validation off** (`noValidate` on ActionForm) once every server message gives a next step (after the
   words pass in 1), so every refusal shows in the one pattern this PR builds.
4. **Loading frames** (`a11y-practice-1-17`, the page half): `aria-busy` on each loading `<main>`, a still frame of
   the shell while loading (needs `shell.tsx`, #42), and a persistent live region in `app/layout.tsx`.
5. **A skip link** in the shell (`shell.tsx`, #42): "Skip to the content", first in the page.
6. **The write-off's default reason**: the Reason select opens on "Window passed" even for a line whose window is open
   (`narrow-practice-1-07`'s note). A flows fix: open on no choice ("Choose a reason") so the person picks one.
7. **Combined audit #103 / PR 7**: cite FRM-01 and FRM-07 as its first manual 3.3.7 and 3.3.8 cases, and add the
   refused states to its route visits; FRM-05's header check is its first 2.4.11 case.
8. **Tell a stale token from a wrong origin** in the route outcome (`csrf_refused` with a reason), so a page out of
   date could invite a press even after a post without JavaScript (3.5a). It changes an outcome the security
   program's generated route tests assert exactly (`route-tests/define.ts:169-172`) and #42's `http.test.ts`, so it
   is its own reviewed change, after #42.
9. **The screen tour** (`tools/lane-b-screen-tour`, on claude/build-ops) gains the states 10.1 adds:
   `error-unconfirmed` and `error-stale` (an aborted POST and an altered hidden token), a refused grid form and a
   refused row form.

### 11.3 Risks, and what holds each

| Risk | Hold |
| --- | --- |
| A later change wraps the server action or renders FormKeys in a layout, and a saved form keeps stale text or replays its key | ADR 0077 D1 and ActionForm's header comment; FRM-02's e2e fails first |
| A React or Next upgrade changes the reset or the redirect remount | FRM-01 (harness and e2e) and FRM-02 (e2e) |
| `field.tsx` as a client module: a server page passes a function prop | TypeScript and Next's build refuse it; none does today |
| A second `[data-slot="alert"]` breaks the strict `refusal()` helper | The field's message is a `<p>`, never an Alert; the e2e suite runs |
| Names read from the page are wrong for an odd label | The tidy rule is unit-tested; `errorName` on the control overrides; no key can ever print |
| The unlayered rules reach a control that should stay 14 px on a phone | They cover form controls only, by element and type; FRM-08 measures both widths |
| Building in six slices against an API written down here | Section 3.3's props are the contract; the branch typechecks and tests once all six are in, before review |
| The two hooks drift: the form shows one hook's state after the other ran | `source` flips inside the dispatching transition (2.1); harness tests 3 and 4 and `drive/r4.out` D1, D2, D6 |
| #50 or another open PR lands a change to the same core files after this design was written | 7.9's order: build only after #50 merges; open only after #49, #51, #52 and #54, re-reading their pages at the merged head |
| A refresh for a stale page loops | `RefreshAfterRefusal` runs once per state (its effect depends on `state`); a refresh leaves the state as it is |
| The harness's Vite server or Chromium is slow or missing | It skips off CI without Chromium; on CI CI-05's setup fails the run instead; scout C measured 2.6 s |

---

## 12. Review and dispositions

The adversarial review (`designs/lane-b-ux-forms/review.md`) raised 22 findings: 3 blocking, 11 should-fix, 8 nits.
Each was checked against the code at `4d99df8` (and #50's head, `a3c583d`) before it was applied. All 22 are
applied; two are applied in a different form than the review proposed, with the reason given. One more fact came out
of the checking and is applied too (row 23).

| # | Finding | Disposition | Where, and why |
| --- | --- | --- | --- |
| 1 | `FieldError`'s "Error:" inside `#{id}-error` breaks #42's `screening.spec.ts:718`, `:724` | **Applied** | 3.3: `#{id}-error` holds the message alone; "Error:" (`aria-hidden`) and the icon are siblings in a `data-field-error` wrapper; `aria-describedby` unchanged. Checked: both lines are exact `toHaveText(notLoaded)`. FRM-04, 3.9, 8.2 tests 7 and `fields.test.tsx` follow. |
| 2 | `billing.db.test.ts` is a #42 file and need not change | **Applied** | 7.2, 8.5: removed; `:442`'s `/no payment method on file/` still matches. The console's sentence (`console/billing/page.tsx:76`) now says "under Billing", slice D, 10.2. |
| 3 | Open #50 rewrites `action-form.tsx` | **Applied, wider** | #50 also changes `next.ts` (`ActionState.invalid`) and creates `action-form.test.tsx`, which the REST list the review used did not show (row 23). The design lands after #50 (header, 7.9), keeps every #50 export (7.1), builds the lead on #50's `summaryLead` (3.5), reuses `RefreshAfterRefusal` for stale pages (3.5a), and puts its browser tests in a new `action-form.browser.test.tsx`. The refresh case is 8.2 test 4 and `drive/r4.out` D5. |
| 4 | A dropped connection throws away everything typed | **Applied, proved first** | 2.1: the second `useActionState` over the same action, with `unstable_rethrow` and a digest check, tightened to fetch's `TypeError`. Proved in the mechanics app (`drive/r4.cjs`, `r4.out`): D2 keeps every value with no error page and the retry works; D3 still reaches the error boundary; D4 still remounts on success; D6 still posts without JavaScript. Wording changed from the review's "Not sent" to "Not confirmed", because the response may be what dropped after a save (a second press replays the key and does nothing, ADR 0017). FRM-01, 8.2 test 3, 8.4 step 5, ADR D1. |
| 5 | A second identical refusal is silent | **Applied** | 3.5: `RefusalSummary` keyed by `seq`, a number the browser hook adds per response; when focus is already on the target, the new alert carries the announcement. 8.2 test 8 counts two insertions; FRM-04. |
| 6 | Focus can sit under the sticky header (2.4.11) | **Applied** | 3.6: `html { scroll-padding-top: calc(3.5rem + 1rem) }`, unlayered, in `packages/ui/src/styles.css`. 8.2 test 9 (harness), 8.4 step 4 (390 px, the real header); FRM-05; ADR D4. |
| 7 | "Fix the field listed here" over items that are no field | **Applied (the review's safer variant)** | 3.5: the browser chooses the lead from the issues it placed, through #50's `summaryLead`; no lead when none names a field; before placement, the count leaves out `input` and `requestKey`. A `requestKey`-only refusal becomes the stale state (3.5a). 8.2 test 6 covers `pattern` and `refused`. |
| 8 | "First in the form" lands inside each caller's grid or row | **Applied, extended** | 3.5: `col-span-full basis-full w-full`. The review's classes alone would squeeze the six rows that do not wrap, so one unlayered rule lets a flex form wrap while it shows a refusal (`form:has(> [data-slot='refusal-summary'])`), which also reaches #42's row forms. 4.1: `PendingStatus` inside the button's wrapper. 10.1 adds the tag form (grid) and console status's row; 8.2 test 6. |
| 9 | Show password and spelling services; the listener contradiction; clearing by type | **Applied** | 5.3: `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="none"` always; `flushSync(() => setShown(false))` in the capture listener, so `type` and `aria-pressed` agree; "stays in whichever mode" removed. 2.3: clear by `data-secret`, uncontrolled, stated. FRM-07, 8.2 tests 1 and 12. |
| 10 | Stale CSRF token or request key ends in "Reload the page" | **Applied, with a safer wording split** | 3.5a: `stale: true` from `next.ts` (a flag, not words), `router.refresh()` through `RefreshAfterRefusal`. The invitation to "press “{submit}” again" shows only after the person's own press (the browser hook); any other post reads "Check the form, then send it again if you still mean to", because `csrf_refused` also answers a wrong origin and the outcome cannot say which without changing what the generated route tests assert (proposal 11.2.8). FRM-01, 8.2 test 4, 8.4 step 5. |
| 11 | Emptied secret fields are emptied silently | **Applied** | 2.3: "Emptied for your security: type it again." (password), "Emptied for your security." (code: its error or hint already gives the next step, so it is not said twice), in `aria-describedby` after the error. 10.2, FRM-01, 3.9. |
| 12 | The ROI double press races the server | **Applied** | 8.4 step 4: the POST is held with `page.route` until the pending assertions are done; the button is pressed with Space for the focus assertion; Enter-in-field asserted separately. |
| 13 | Page files, `triage.spec.ts` and `words.ts` collide with #49, #51, #52, #54 | **Applied** | 7.9: the table of overlaps (recomputed from git) and the landing order; 7 intro and C1: re-read at the merged head, keep #54's `dollarsForInput`; 7.6: the triage step beside #54's. |
| 14 | Two recommended wordings not taken or not reported | **Applied** | 6.3: `requiredText`'s maximum becomes "enter at most {n} characters". 9.3: a table of every recommended wording replaced, with its reason, for the report to the co-founder (the colon house form; no organization name in a refusal; the generic required and length rules). |
| 15 | The tidy rule strips any trailing parenthetical | **Applied in part; closed list rejected** | 3.4: a parenthetical that says "posted" or "deposited" is never dropped, with a unit test. The closed list was not taken: today's labels carry 59 parentheticals of many shapes ("(when named)", "(estimate)", "(lines)", "(for an approval)"), so a list would misname fields or need markup across nine files, while the brand risk the finding names is exactly the posted-or-deposited one. |
| 16 | The legend wins over a box's own label in a fieldset of independent booleans | **Applied** | 3.4 step 2: the legend names only a group issue (a `RadioNodeList`, a shared `name[]`, or `data-issue-for` on the fieldset); `applyNcci` reads "NCCI edits". 8.2 test 6. |
| 17 | Session expiry while a form is open | **Applied** | 2.4a and ADR 0077's "Not covered": accepted, typed text is never kept in browser storage. |
| 18 | Pre-hydration replay resets the form | **Applied** | 2.4a and ADR 0077's "Not covered". |
| 19 | A dead Show button without JavaScript | **Applied** | 2.4, 5.3: `hidden` until mounted; 8.2 test 12. |
| 20 | Strict-mode trap on "Show new password" | **Applied** | 8.4 step 3: `exact: true`. |
| 21 | More `role="status"` regions | **Applied** | 4.1: the check recorded (`packets.spec.ts:223`, `uploads.spec.ts:43`, `reconciliation.spec.ts:58` unaffected); `data-slot="pending-status"` kept. |
| 22 | Test precision: "no `organizationName`"; the "Partially accepted" case | **Applied** | 8.4 step 1 reads the visible text; `packets.spec.ts`'s step at :420 gains the refused partial response (slice E; a file #51 and #52 also change, so it lands after them, 7.9). |
| 23 | (Found while checking 3) #50's real file list | **Applied** | The REST list held 25 of #50's 44 files. Every open pull request's list was recomputed from git (`review/pr{48..54}-files.git.txt`); the other intersections match the review's. |

"Attacks the design survives" (review, last section) were re-read against the revision: the redirect remount, the
double-submit guard, per-form providers, the coverage form's missing `FormKeys`, request audit without JavaScript,
no new dependency, scope (no migration, no #42 file beyond the rule-6 documents, `e2e/a11y.ts` untouched), and the
brand checks all still hold. The revision adds no dependency (`next/navigation`'s `unstable_rethrow` and
`react-dom`'s `flushSync` are already installed), no migration and no #42 file.
