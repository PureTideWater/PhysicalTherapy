# co-001/ux-forms, Scout A: how a form is submitted, tested in a real browser

Versions read from `/home/user/ux-forms/node_modules`: next 16.4.1, react 19.3.1, react-dom 19.3.1, playwright 1.56.1.

**The test app.** It is a minimal Next app at `scratchpad/mech-app`. Its `node_modules` are symlinks into the worktree's pnpm store, so nothing was installed from the network. It ran as a production build (`next build`, then `next start -p 3417`) and was driven by Playwright's Chromium. Each run happened under `flock /tmp/laneb-heavy.lock`: one command started the server, ran the driver and stopped the server.

**The server action, `save`.** It has the shape of `runAction`. It waits 700 ms. It returns `{error, issues:[title, pick]}` to refuse, or `{error}` alone when the title is `nofield`. It calls `redirect('/<variant>?notice=saved')` when the title is `ok`, and `redirect('/elsewhere?notice=moved')` when the title is `away`. When the title is `cookie`, it sets a cookie and then refuses.

**The page.** It is a server component that renders a hidden `requestKey` with a fresh `randomUUID()` on every server render, as FormKeys does. It has one field of each type:
- text with a `defaultValue`
- a select with a `defaultValue`
- a textarea
- a checkbox
- a checkbox group named `x[]`
- a radio pair
- a date
- a password
- a text field with `autocomplete="one-time-code"`

**The client form.** It is a copy of ActionForm: `useActionState(serverAction, {})`, a summary, an inline `FieldError` that reads the refusal from context, a submit button that uses `useFormStatus`, and a focus effect.

Logs, scripts and raw outputs are in `scratchpad/progress/scout-mechanics.md` and `scratchpad/drive/*.out`. `scratchpad` means `/tmp/claude-0/-home-user-PhysicalTherapy/41255adc-382e-5323-a809-0f2d8619b682/scratchpad`.

## Findings in brief

1. **What causes the reset.** React resets every form whose function action it dispatches itself. It requests the reset before the action runs, whatever the action returns.
2. **The fix is confirmed.** Calling `preventDefault` in `onSubmit` and then `startTransition(() => formAction(new FormData(form, submitter)))`, with `action={formAction}` kept:
   - keeps every field after a refusal, including the password and the code, so those two must be cleared on purpose;
   - keeps both pending flags working;
   - sends exactly one server call.
3. **Success needs no reset code.** A `redirect()` from the server action rejects the action's promise. Next's RedirectBoundary catches it and remounts the segment, so the form comes back with its defaults and the new request key. This held for a redirect to the same path, to the identical URL, to another path, and for a form inside a layout.
4. **Without JavaScript the post still works.** The refused page shows the summary and the inline errors, but every value is lost. That is the accepted cost of never echoing values from the server.
5. **Double submit.** A ref set synchronously in `onSubmit` is the only guard that stops two presses in one frame. Today's `disabled` button does not stop them. A guard on the pending state does not either.
6. **Focus.** With `aria-disabled`, focus stays on the button while the form is pending. With `disabled`, it falls to `<body>`. After a refusal, the effect moves focus reliably to the first invalid field or to the summary.
7. **`$ACTION_` fields.** With JavaScript, the FormData built from the DOM includes the four `$ACTION_` hidden fields, and the server receives them. Without JavaScript it does not. `form.ts`'s `$ACTION` filter is needed.

---

## Q1. Does today's `<form action={formAction}>` reset every field after a refusal?

**Experiment.** In variant `action-disabled` I filled every field, submitted a refused value, waited for the summary and read every control.

**Observed.** Every field went back to its default:

| Field | After the refusal |
|---|---|
| title | `default title` |
| select | `b` |
| textarea | empty |
| checkbox | unticked |
| `x[]` group | unticked |
| radio | back to r1 |
| date | empty |
| password | empty |
| code | empty |

The summary and both inline errors showed. Focus moved to `title`, which was now empty. Confirmed.

**Why**, in `react-dom/cjs/react-dom-client.development.js` 19.3.1:
- **`extractEvents$1` (l.20725-20797)** is the form-action event plugin. Its listener runs after the `onSubmit` handlers. If `nativeEvent.defaultPrevented` is **false** and the form's `action` prop is a function, it does the following:
  - calls `event.preventDefault()`;
  - builds `new FormData(form, submitter)`;
  - calls `startHostTransition(fiber, pendingState, action, formData)`.
- **`startHostTransition` (l.9326-9345)** wraps the action as `function () { requestFormReset$1(formFiber); return action(formData); }`. The reset is requested before the action runs, unconditionally, whatever the action returns.
- **`requestFormReset$1` (l.9381-9394)** dispatches an update to the form fiber's hidden reset-state hook.
- **`TransitionAwareHostComponent` (l.8142-8153)** flags the fiber (`flags |= 1024`) when that state changes.
- **At commit, `recursivelyResetForms` (l.16338-16351)** calls the DOM `form.reset()`. This happens when the transition commits, which is after the async action settles. That is why the values vanish exactly when the refusal appears.
- **The other branch.** If `defaultPrevented` is **true** and `currentEventTransitionLane !== 0` (`onSubmit` called `startTransition` synchronously in the same event), the plugin calls `startHostTransition(fiber, pendingState, null, formData)` instead. The action is a `noop`, so there is no dispatch and no reset. It only gives the form its pending status, which `useFormStatus` reads, entangled with the caller's transition. Q2 relies on this branch.
- **The public `requestFormReset(form)`** (`react-dom.development.js` l.426) leads to `Internals.d.r`, then to `requestFormReset$1` (client l.30655-30660). It logs an error when it is called outside a transition (`ReactSharedInternals.T === null`).

## Q2. With `onSubmit` + `preventDefault` + `startTransition(formAction(new FormData(form, submitter)))`, and `action={formAction}` kept

**Experiment.** I ran the same fill and refusal in variant `submit-disabled`. I counted server calls and logged both pending flags on every change.

**Observed.**
- **Values.** Every field kept its value: title `bad`, select `c`, textarea, checkbox, `x[]` = two, radio r2, date `2026-01-15`, **password `Secret-1`, code `123456`**.
  - So the password and the one-time code must be cleared deliberately after a refusal. This is WCAG 3.3.7's security exception, and the orchestrator's rule never to echo a password or a code.
- **Pending.** `useActionState`'s `pending` and `useFormStatus().pending` were both true from the press (+3 ms) until the refusal arrived, and false after it. This is the `defaultPrevented` branch above.
- **Server calls.** One per submit. React does not also dispatch.
- **Condition.** `startTransition` must be called **synchronously** inside `onSubmit`. If it is called after an `await`, as `upload-form.tsx`'s async block does, `currentEventTransitionLane` is 0. `useFormStatus` is then never pending, although `useActionState`'s `pending` still works.

## Q3. Success: does the form keep stale text after a redirect, and is the request key renewed?

**Experiments.** I tested four variants:
- `action`: today's code;
- `submit`: the Q2 pattern;
- `rfr`: a client wrapper around the action that calls `requestFormReset(form)` when it catches the redirect;
- `key`: calls `form.reset()` when the DOM `requestKey` differs from the one submitted.

I tested five cases, logging mount and unmount and comparing the request key with the server-rendered key:
- a success redirect to the same path with `?notice=saved`;
- a redirect to the **identical** URL (from `?notice=saved` to `?notice=saved`);
- a redirect to another path, then Back;
- a form rendered in a **layout** (`/lay` to `/lay?notice=saved`, twice);
- a refusal from an action that sets a cookie, which makes Next refresh the tree.

**Observed.**
- **Every variant, in every success case:** the form subtree **unmounts and remounts**. Every field is at its default, `useActionState` is back to `{}`, and the request key equals the newly rendered server key.
  - This happens even for the identical URL, so the cause is not a changed page key.
  - Next 16.4.1 `server-action-reducer.js` l.236-258: on a redirect the action promise is **rejected** with a redirect error marked `handled = true`. Its own comment: "This will effectively reset the state of the component that called the action as the error boundary will remount the tree".
  - `useActionState` throws that error during render. `redirect-boundary.js` l.57-66 catches it without navigating a second time and renders its children afresh.
  - The client does see the thrown redirect: the `rfr` wrapper logged `wrapped-rejected digest=NEXT_REDIRECT;push;/rfr-disabled?notice=…`. The dispatched action never resolves on a redirect; it rejects.
  - No console errors appeared.
- **Back after a redirect elsewhere:** a fresh mount with a new key, no stale text.
- **Form in a layout:** remounted with its defaults, but the request key was **not** renewed, because the layout is not re-rendered.
  - In the app, FormKeys is rendered only by pages: 52 `page.tsx` files, `shell.tsx` and `contracts/forms.tsx`, and no layout renders Shell. So this does not occur today.
  - Rule worth keeping: never render FormKeys in a layout.
- **Refusal with a cookie set:** the values were kept and nothing remounted, but the **request key changed**, because the tree was refreshed. So the `key` strategy would wipe a refusal: rejected.
- **`rfr`:** works, but it is redundant (the remount already resets the form). It also forces a client wrapper around the action, which removes the `$ACTION_REF`/`$ACTION_KEY` hidden fields, so the no-JavaScript post stops working. It also calls `requestFormReset` outside a transition, after the `await`, which React warns about in development. Rejected.

**Recommendation: no reset code.** Rely on Next's documented remount on redirect, and keep passing the **server action itself** to `useActionState`, never a client wrapper. The success-to-same-path, success-to-another-path and refusal cases all behave correctly with the Q2 pattern alone. Pin this with tests (sketch below).

## Q4. Without JavaScript (`javaScriptEnabled: false`)

**Experiment.** In `action-disabled`, `submit-disabled` and `lay` (they share the same markup): refuse, then succeed, then refuse again on the success page.

**Observed.**
- **The post works.** `useActionState(serverAction)` renders `$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1` and `$ACTION_KEY`, so the browser posts to the page and Next runs the action.
- **The refused page** is a 200 at the same URL. It shows:
  - the **summary**;
  - the **inline field errors**: the context is filled from `useActionState`'s server-rendered state;
  - **every value lost**: defaults, password empty;
  - a **new request key**: the page was rendered again.
- **Success:** redirected to `?notice=saved` with the notice and the defaults.
- **A second refusal from that page:** works again.
- **Server calls:** one per post.

**Implications for the design.**
- **Lost values without JavaScript.** They could be kept only by echoing them from the server, which the security rule forbids. Recommendation: accept the loss.
- **One source for labels (design question 3).**
  - Anything computed in an effect, such as reading `control.labels[0]` from the DOM, does not exist without JavaScript. In this experiment's copy, the summary names fields by `labels[issue.field] ?? issue.field`, so a DOM-read label would fall back to the raw key on the no-JavaScript page.
  - Each field already knows its own label at render time. So the inline error rendered by Field, SelectField and TextAreaField from context is correct in both modes.
  - The summary must either take its names from a source available during render, or, when no name is known at render, show the message without a key. It must never show the key.
  - This is an input for the design scout. I tested only that inline errors rendered from context do show without JavaScript.

## Q5. Double submit and pending

**Experiment.** I submitted, then tried three ways of submitting again:
- a second click 100 ms later, forced past the button's state;
- Enter in a text field while pending;
- two `.click()` calls in the same task, which is a same-frame double press, before React commits.

I counted server calls for each variant.

| Variant | Same-frame double | Second click while pending | Enter while pending |
|---|---|---|---|
| `action-disabled` (today) | **2** | 1 | 1 |
| `action-aria`, no guard possible | – | – | **2** |
| `submit-disabled` | **2** | 1 | 1 |
| `submit-aria`, no guard | – | – | **2** |
| `submit-aria-guard`, guard on `pending` state | **2** | 1 (guarded) | 1 (guarded) |
| `ref-aria`, ref guard | **1** (guarded) | 1 (guarded) | 1 (guarded) |
| `ref-disabled`, ref guard | **1** (guarded) | 1 | 1 |

- **`disabled`** stops later presses and implicit submission: HTML does not submit when the default button is disabled. It does not stop two presses inside one frame.
- **A guard on React state** misses the same frame too: `pending` is not yet true when the second submit event arrives.
- **Queued actions.** Without a guard, `useActionState` queues the second action and runs it after the first. The server's request key makes a replay do nothing, but the person sees "This form was already submitted" for a press they did not mean.
- **Testing note.** Playwright's `click()` treats `aria-disabled="true"` as disabled and refuses to click. Tests must use `{force: true}` or the keyboard.
- **Best guard:** an `inFlight` ref, set synchronously in `onSubmit` and cleared when `pending` returns to false. A remount clears it after a redirect. This allows `aria-disabled` with no loss of protection.

## Q6. Focus

**Observed.**
- **While pending.** With `disabled`, focus is on `BODY` at +80 ms and +150 ms, in both the `action` and `submit` variants, so today's code drops it. With `aria-disabled`, focus stays on `#go` throughout.
- **After a refusal.** In every variant, `useEffect(() => {…}, [state])` moved focus reliably:
  - to the first invalid control (`title`);
  - or, for a refusal that names no field, to the summary (`tabIndex={-1}`).
- **After a successful redirect.** Focus is on `BODY`, because of the remount. Moving focus to a notice belongs to the later Notice PR.

**Recommendation.**
- Keep the button focusable (`aria-disabled`, not `disabled`), with the ref guard from Q5.
- Put "Working…" in a polite `role="status"` region that exists from the first render.
- Keep the focus effect keyed on `state`. It runs after the refusal commits, by which point the summary and the inline errors exist.
- Clear the secrets in the same effect, before moving focus.

## Q7. Does FormData from the DOM include the `$ACTION_` hidden fields, and does it matter?

**Observed.** In the client log and the server's received keys, in JavaScript mode:
- `new FormData(form, submitter)` includes `$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1` and `$ACTION_KEY`, because they are server-rendered for the no-JavaScript post.
- The server action **receives all four**.
- After a client remount (after a redirect) they are no longer in the DOM.
- In no-JavaScript mode the action received **none**: Next decodes and strips them.

**Effect.**
- `apps/web/src/lib/http/form.ts`'s `name.startsWith('$ACTION')` filter is necessary and must stay. Without it the route's input would carry framework fields.
- Nothing else depends on them.
- `upload-form.tsx`'s `new FormData(form)` already relies on the filter.

---

## The recommended mechanism, as a code sketch for ActionForm

```tsx
'use client';
// Server action passed straight in, never wrapped: that keeps the no-script post ($ACTION_REF/$ACTION_KEY) and lets
// Next's redirect rejection remount the form on success (server-action-reducer.js; RedirectBoundary).
const [state, formAction, pending] = useActionState(action, {});
const formRef = useRef<HTMLFormElement>(null);
const inFlight = useRef(false); // set in the submit event itself: stops a second press even within one frame

useEffect(() => {
  if (!pending) inFlight.current = false;
}, [pending]);

const onSubmit = (event: FormEvent<HTMLFormElement>) => {
  // React's form-action listener sees defaultPrevented and only marks the form pending: no second dispatch, no reset.
  event.preventDefault();
  if (inFlight.current) return;
  inFlight.current = true;
  const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
  startTransition(() => formAction(data)); // synchronous, so useFormStatus is pending as well
};

useEffect(() => {
  const form = formRef.current;
  if (form === null || state.error === undefined) return undefined;
  // WCAG 3.3.7's exception and the no-echo rule: a refused secret is never kept.
  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement && (element.type === 'password' || element.autocomplete === 'one-time-code')) {
      element.value = '';
    }
  }
  // …mark the invalid controls as today, then focus the first one, or the summary.
}, [state]);

return (
  <Refusal.Provider value={state /* the fields' inline errors render from this, with JS or without */}>
    <form ref={formRef} action={formAction} onSubmit={onSubmit}>
      {children}
      {/* summary */}
      <div role="status" aria-live="polite">{pending ? 'Working…' : ''}</div>
      <Button type="submit" aria-disabled={pending || undefined}>{submit}</Button>
    </form>
  </Refusal.Provider>
);
```

## Tests to pin it (the FRM series)

These are e2e or Playwright tests against the real app, with synthetic data.
1. **Refusal keeps values:** text, select, textarea, checkbox, `x[]`, radio and date are kept; password and one-time code are empty. Focus is on the first refused field, or on the summary when no field is named.
2. **Success to the same path:** the fields are back at their defaults, and the request key has changed.
3. **Success to another path, then Back:** a fresh form.
4. **Same-frame double press:** `page.evaluate(() => { b.click(); b.click(); })` gives one server call.
5. **Enter while pending:** one call, and focus stays on the button.
6. **No JavaScript** (`javaScriptEnabled: false`): the refusal shows the summary and the inline errors and no raw key; success redirects with the notice.

## Things to flag

- **No migration needed.**
- **No file of PR #42 is touched.** The mechanism lives in `apps/web/src/components/action-form.tsx` and fixes every ActionForm page, #42's included. `upload-form.tsx` is in #42 and already keeps its values; its `startTransition` runs after an `await`, so its `useFormStatus` would not be pending. That is noted for after #42 merges and is not needed now.
- **A condition to state in the code comment, or in ADR 0077:** the success reset depends on Next's redirect-rejection remount, so the action passed to `useActionState` must be the server action itself, never a wrapper.
- **Not tested:** `runSignInStep` can end without a redirect and return the step's data. In that case the form keeps its values, and secrets are cleared only when the returned state has an `error`. The design should decide whether a password is cleared on a non-error, non-redirect step.
