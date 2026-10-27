# 0077. Submit forms from the browser, keep what was typed, name each refused field by its label, and size controls for phones

- **Status:** accepted (`co-001/ux-forms`, the UX baseline review's first pull request); amends
  [0056](0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md) (the type
  scale's phone exception, decision D6)
- **Date:** 2026-10-26 (revised 2026-10-27 after the security and accessibility review and the UX and brand review)
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings of 2026-10-25 (about 21:27 and 21:34 UTC) have the build improve as it goes and take each
  recommended wording and visible change without asking; the build (Lane B). Each reversible by the founder
- **PRD sections:** 6 (Cross-cutting: accessibility, labels, every error with a next step; PRD.md:256); test matrix
  FRM-01 to FRM-08; ADRs [0017](0017-one-route-wrapper-a-route-registry-and-the-persona-matrix-as-data.md) (request
  keys),
  [0053](0053-onboard-customers-through-recorded-agreements-gate-every-request-on-csrf-rate-limits-terms-and-maintenance-and-keep-soc2-evidence-as-a-checked-map.md)
  (CSRF, the Content-Security-Policy) and 0056

## Context

The UX baseline review (31 findings) found that every `<ActionForm>` came back empty after a refusal. The tour showed
it on 37 refused forms. The worst cases recorded the wrong thing on a second press: the write-off form put "Window
passed" back after "Other" was refused and unticked the consequence box; the console's model flag form put back "Kill
switch (every model feature off)" for everyone; pricing settings and the billing organization put back the stored ZIP
and the test routing number, valid-looking values beside an error that described the value the person had typed.

The cause is React 19's form action. `<form action={formAction}>` from `useActionState` makes React's form listener
wrap the action as `requestFormReset(form); return action(formData)`: the reset is requested before the action runs,
whatever it returns, and the DOM's `form.reset()` is called when the transition commits, which is exactly when the
refusal appears. When an `onSubmit` handler calls `preventDefault` and starts a transition itself, the listener takes
its other branch: it only marks the form pending, and requests no reset. The screening upload form and the hardware
key form already submitted that way and kept their values. No test saw the reset, because every e2e journey refilled
each field with `fill()`, `check()` or `selectOption()` after a refusal, and axe ran only on pages as loaded.

The review also found that the summary named each field by its route key (`organizationName: …`) or by a per-page
label table only one page kept; that only `Input` showed an invalid state, by hue alone (1.54:1 between its two
borders); that a pending button was `disabled`, which dropped focus to the page, and changed its words in no live
region; that a dropped connection replaced the page with the error screen and remounted the form empty; that a page
whose CSRF token or request key was out of date asked the person to reload, which now throws away what this decision
keeps; that every control was 14 px, so iOS Safari zoomed the page into any focused field; that the six-digit code
refused the "123 456" an authenticator app copies; and that several fields checked by `pattern` never said the format.

## Decision

- **D1. Submit from the browser, keep `<form action>` for the post without JavaScript.** A form keeps
  `<form action>` on a `useActionState` over the **unwrapped** server action, so the post without JavaScript and
  React's replay of a press made before hydration still carry Next's `$ACTION_*` fields. It dispatches from `onSubmit`
  (`preventDefault`; `startTransition(() => dispatch(new FormData(form, submitter)))`, synchronous, so the form's own
  pending state turns on) to a second `useActionState` whose action calls the same server action. React then never
  resets the form on a refusal, and nothing typed is echoed back: `ActionState` carries no value, only `duplicate`,
  `error`, `invalid`, `issues`, `locked` and `stale`. The second hook turns a dropped connection (fetch's `TypeError`
  with no `digest`) into a "Not confirmed" state, and rethrows everything else, Next's redirect included. A dropped
  press pins its request key: every later press sends that key, even after a refresh in place renders a new one (the
  export's status, a page out of date), until a press is saved (the redirect) or fails on the server, or the page shows
  another person (D10), because the server may have saved under it and only the same key makes another press do
  nothing (ADR 0017). A refusal keeps the pin, since it can come before the key is read and so says nothing of the
  dropped press; the version form's two actions share one pin, as they share the guard below, and one count of
  responses, so the form shows the answer that came last and, while one button's press is out, never the other's older
  answer. A key used before is answered `duplicate`, which pins it too and is titled "Already sent", never "Not done"
  (nor is the note a Re-run's row leaves when the refresh removes it), over the server's words "This form was already
  sent, so nothing new was saved. Reload the page to see the result."; only a form with `refreshOnError` (Re-run,
  Accept) reads the page again for it, whose fields are all hidden and whose pin holds, so no fresh key is ever sent
  under the kept values. An outcome the adapter has no words for is a plain refusal, never "Already sent". A success
  resets the form through Next's redirect remount, with no reset code of its own. Two conditions keep that true, and
  `components/action-form.tsx`'s header comment states both: the hook on `<form action>` takes the server action
  itself, never a client wrapper; and `<FormKeys/>` is rendered by pages, never by a layout, or a second submit after a
  success would replay the old request key. A ref, not React state, guards a second press: it is the only guard that
  stops two presses in one frame.
- **D2. Secrets are emptied after a refusal, and the field says so.** Every control the shared components mark
  `data-secret` (a `PasswordField`, and a `Field` whose `autoComplete` is `one-time-code`) is emptied after every
  refusal, before anything is marked or focused (WCAG 2.2 3.3.7's exception for security fields), with any
  `input[type=password]` and `[autocomplete=one-time-code]` a page wrote by hand. A note under each says why: "Emptied
  for your security: type it again." (a password) or "Emptied for your security." (a code, whose error already gives
  the next step, and a password no press of its form can make succeed, whose summary says what to do instead). The
  server says which refusals those are: a locked account (`locked`), and, by `ActionState.final`, an invitation that
  expired (refused before any password is checked, so the right one is refused too) and a sign-in that must start
  again. Never a refusal whose words are a wrong password's, which would tell which addresses have accounts. After a
  dropped connection on a form that held a secret, the lead says what went: "What you typed is still here, except
  passwords and codes: check your connection, type them again, then press “{submit}” again." Both secret components
  stay uncontrolled. A code, like a password (D8), turns off spell checking, autocorrect and autocapitalisation, which
  `Field` writes with `data-secret` after the caller's props.
- **D3. A refused field is named by the label the person sees, read from the page.** The summary resolves each issue
  to its control (the name, the name with `[]`, a `data-issue-for` that lists the key, then the key's part before its
  first `.`) and names it by the control's `data-error-name`, else a group's legend when the issue names a group, else
  the control's own label. One rule tidies the name: white space collapsed, one trailing parenthetical and a trailing
  colon dropped, never a parenthetical that says posted or deposited. No form keeps a table of labels, and no code
  path prints a key. A hidden field is no target, so its issue is the message alone, unless the field carries its own
  `data-error-name` (the run an Accept or Re-run button names, #50's words, read after it: "This run: …"): its item
  then reads "{name}: {message}", is never a link, is never focused and is never counted as a field placed. A box a
  checkbox group lists under its own key (`applyNcci`, `confirm_<id>`) is the group's: its message shows inside the
  group, and the summary names it by the box's own label, or by the legend when the group is a list confirmed item by
  item (`itemized`), whose labels are sentences. The summary is first in the form, on a line of its own in any grid or
  row, keyed per response so the same refusal twice is announced twice. A row form wraps while it shows a refusal (one
  unlayered rule), so the summary takes a line of its own above the controls; a column form (`flex-col`,
  `flex-col-reverse`) never does, because Chromium sizes a wrapping column's line to its widest item, and a select
  with a long option then pushes the page past a phone's width; `form-hints.test.ts` fails on a form whose direction
  is set behind a breakpoint, which the rule's classes could not read. The hardware-key sign-in, a form of its own,
  shows its problem first too, before the email, and is a post, so a press before the page is live never puts the
  email in the address. The summary's lead counts the issues that name a field ("Fix the field listed
  here, then try again.", "Fix the fields listed here, then try again.", or none). Under each refused field the shared
  components show "Error:" and an icon beside the message, the element that describes the field holding the message
  alone. One unlayered CSS rule marks every refused control with a 2 px border in the danger color, and a refused
  checkbox or group with a 2 px rule down its left edge: a change of width and of words, never of hue alone.
- **D4. Focus after a refusal.** Exactly one issue on a field focuses that field; anything else (several issues, an
  issue with no field, a refusal with no issue, a dropped connection, a page out of date, a form cleared for another
  person) focuses the summary.
  `html { scroll-padding-top: calc(3.5rem + 1rem) }`, the sticky header's height and a 16 px gap, keeps the focused
  element in view (WCAG 2.2 2.4.11) on every page.
- **D5. A pending submit keeps its button.** The button is `aria-disabled`, never `disabled`, so it keeps focus; its
  words do not change; a polite status inside the button's wrapper says "Working…".
- **D6. Form controls are 16 px below the md breakpoint.** One unlayered rule in `packages/ui/src/styles.css` sets
  text inputs, selects and text areas to 16 px below 48rem, where the rail folds into the header's Menu, so iOS Safari
  does not zoom the page on focus; from md up they keep the dense 14 px of 0056's type scale. The viewport never sets
  `maximum-scale`, so pinch zoom stays (WCAG 1.4.4). The larger text never widens a page: in the base layer, so a
  class still wins, a select is no wider than its box (`max-width: 100%`), and a box that holds one may shrink to its
  column and is no wider than its container (`:where(:has(> select)) { min-width: 0; max-width: 100% }`; without the
  second, a box in a column that sizes to its content, as the uploader's drop zone does, takes the long option's
  width), which reaches hand-written selects and #42's pages through the stylesheet. FRM-08's specs measure it at 390
  px (`atPhoneWidth`), the uploads drop zone among them, with the ERA export's system list shown. Where a select cuts
  its chosen text short, a `SelectField` given `showChosen` shows that text whole on a line under it: measured in the
  browser against a hidden copy of the select that holds that one option, so the browser's own arrow and padding
  count; `aria-hidden`, since a screen reader reads the select's value whole; and absent wherever nothing is cut (no
  line at 1280 px, none on a select wide enough at 390 px). The copy is styled through the CSSOM, which the
  Content-Security-Policy's `style-src` does not govern; no `style` attribute is written in markup.
- **D7. A six-digit code is accepted as an authenticator app copies it.** Spaces and hyphens are dropped before the
  six digits are checked, and the code fields carry no `pattern`, whose generic browser message no paste with a space
  could get past.
- **D8. Password fields offer Show** (NIST SP 800-63B 5.1.1.2), named by their own words ("Show password", "Show new
  password", "Show new password again"), never by an `aria-label`. The input always turns off spell checking,
  autocorrect and autocapitalisation, so a shown password never reaches a browser's cloud spelling service, and it is
  turned back to `type=password`, through its own state, before the form's data is read. No caller can undo that: the
  props type leaves out `type`, `spellCheck`, `autoCorrect`, `autoCapitalize` and `ref`, and the component writes them,
  with `data-secret`, after the caller's props, so a cast cannot either (a caller's `ref` would replace the one that
  hides the password before the data is read). Pressed, the toggle looks pressed: a rule in the text's colour on the
  inset surface (`aria-pressed:border-foreground aria-pressed:bg-secondary` on the outline button), its word "Show"
  and its name unchanged; in forced colours (a Windows contrast theme), whose palette would make both looks one, a
  pressed button takes the system's `Highlight` and `HighlightText` (one unlayered rule).
- **D9. Every field checked by `pattern` states its format in its hint**, held by `components/form-hints.test.ts`. A
  hint is 14 px (`text-sm`), the size of the message beside it on 0056's type scale, because the password policy, the
  no-patient-information rule and the formats are read there. A hint written beside a hand-written control uses the
  shared `Hint` too (the uploader's system list, the pursuit cost's rule, the packet reference, a share link), whose
  `className` adds layout only; the same test fails on any text a control's `aria-describedby` names that is written
  at 12 px, except the screening upload's two, a #42 file, until it takes `Hint` after #42 merges.
- **D10. A page whose CSRF token or request key is out of date is read again in place, and a form whose page then
  shows another person is cleared.** `next.ts` maps `csrf_refused` and a refusal whose only issue is `requestKey` to
  `{ error, stale: true }`; the form calls `router.refresh()`, which renders a fresh token and key while the
  uncontrolled fields keep their values. Only a refusal of the person's own press, with the same person still signed
  in, invites pressing again ("It is up to date now: press “{submit}” again."); a post this page did not start reads
  "Check the form, then send it again if you still mean to.", because the outcome cannot tell a stale token from a
  wrong origin. The flag, never the words, decides: ActionForm, the version form and the export form write those
  sentences themselves, while the server's `error` ends in "Reload the page and try again." for a form that does not
  read the page again (the screening upload, until it adopts this pattern after #42). Any page read again in place (a
  page out of date, the export's status, an upload, `refreshOnError`) renders for whoever is signed in now, and
  someone else may have signed in from another tab of the same browser, which the sign-in page does not turn away.
  `loadPage` puts an opaque mark of the person into a request-scoped slot (React's `cache`): an HMAC of the
  lower-cased email under the server's sealer, purpose `form-actor`, the same for every session of theirs and another
  for anyone else. `FormKeys` renders it on a `hidden` `span` that is never posted; no route reads it and nothing logs
  it. When the mark changes or goes after a commit, a form that holds anything of the first person's (a field typed
  in, or a response shown) mounts its fields afresh from the page, secrets and controlled fields included, lets the
  pinned key go (D1), and shows "Form cleared": "The person signed in on this browser changed, so this form was
  cleared.", after "This page was out of date, so nothing was saved." or the dropped connection's sentence when one
  came first. It invites no press, which would be sent as the person signed in now. A form untouched and showing
  nothing is left alone, so a page of row forms announces the change once; the same person signed in again keeps the
  mark, and nothing changes. The export form only stops inviting a press; the split form starts its two lists again
  from the page.
- **D11. The split form shows its problems as the person types and says them only when they rest** (WCAG 4.1.3: a
  live check stays quiet while the person types). Its visible list (`#split-problems`) is no live region: it changes
  with each key and stays the faulty fields' description. A visually hidden `role="status"` line, on the page from the
  first render, says the problems a second after the last change to either list, at once when the person leaves a
  list, and again, as a new node, on every press while they stand, so a press that moves no focus is still heard.
  Unchanged words are not said again after a pause or a leave, a line with nothing wrong empties silently, and the
  problems a page opens with are never said.

## Alternatives considered

- **The server echoes the values.** `ActionState` would carry the submitted entries and each field would read them
  back. It sends what the person typed back in a response, the very text a no-patient-information check refused
  included, and still loses a group's and a radio's state unless each component learns to read it.
- **Controlled fields through a context.** Every form's fields rewritten as controlled components (112 forms, 48 raw
  controls among them), and a post without JavaScript shows no value at all.
- **Write the values back after the reset.** The reset happens and is undone: a flash of empty fields, a race with the
  focus, and per-type restore code that cannot restore a file.
- **Remount the form on a new request key, or reset it on the caught redirect.** A refusal that sets a cookie renders a
  new key and would be wiped; and a client wrapper on `<form action>` drops the fields the post without JavaScript
  needs. Both are redundant on success, which the redirect remount already resets.
- **A single hook.** A dropped connection then shows the error page and the form comes back empty.
- **Names from the render.** A summary above the fields renders before them, so no field can give it a label in the
  same render without an impure registry; moving the summary after the fields and up with CSS breaks reading and
  focus order (WCAG 1.3.2, 2.4.3).
- **A closed list of label notes to drop.** The notes vary ("(when named)", "(estimate)", "(for an approval)"), so a
  list would misname fields or need markup on labels across many files; the one note a strip must keep is the
  brand's posted or deposited.
- **A separate id or CSS content for "Error:".** A separate id changes the `aria-describedby` an existing test asserts
  exactly; CSS content may or may not be read by assistive technology (failure F87).
- **`text-base md:text-sm` on each component.** Raw controls and pages outside the shared components would stay at
  14 px, and each new control would have to remember it.
- **Turn browser validation off (`noValidate`).** Kept for later: the server's words for "required", an email and a
  pattern are not all instructions yet.
- **Let the pinned key go on any answer from the server.** A refusal can come before the key is read (a parse refusal,
  or a claim rolled back with the work), so a dropped press, a refusal and a refresh would send a fresh key and could
  save twice.
- **Clear only after a refusal for a page out of date, or keep the values and say who signed in.** The export status's
  polling refresh shows another person with no refusal at all; and a kept value is one press from being sent as
  someone else.
- **A live problem list in the split form** (the UX baseline's best fix for `a11y-other-09`). It speaks mid-word as
  the person types, even of a code they never typed: beside a non-facility 03, the 3 of a facility 31 is read as 03,
  and the list says "Place of service 03 is listed as both facility and non-facility."; the 0 of a 02 says "Each place
  of service is a two-digit code from 01 to 99."
- **The chosen text under every select below md.** It shows the same words twice wherever the select is wide enough:
  on most phones wider than 390 px, and on tablets.

## Consequences

- A refused form keeps every value but the secrets, with JavaScript; without it, the page comes back with the summary
  and each field's own message, every value lost and a new request key rendered (the same as before this decision,
  now with the messages).
- `ActionForm`'s `labels` prop and the pricing settings page's `FORM_LABELS` are removed: the page's own labels are the
  one source.
- `components/field.tsx` is a client module, so its fields read the refusal from context; a server page may pass it
  only serialisable props, which TypeScript and Next's build enforce.
- Playwright's `click()` waits on an `aria-disabled` button; a test that presses while pending uses the keyboard.
- The summary is an `Alert` whose `data-slot` is `refusal-summary` (the props it is given come after the Alert's own
  slot), so it carries no `[data-slot="alert"]`: `e2e/helpers.ts`'s `refusal()` matches both slots, and a locator for
  a form's refusal uses `[data-slot="refusal-summary"]`.
- The summary's titles are "Not done", "Account locked", "Not confirmed", "Already sent" and "Form cleared";
  `contracts.spec.ts` and the tour still find "Not done" over every refusal that did nothing.
- `SelectField` takes option groups (`{ group, options }`), so a raw select with `optgroup`s (Coverage's contract) is a
  `SelectField` like any other.
- Mail to the support address opens a ticket and no field hint reaches it, so the support card says the
  no-patient-information rule for mail and describes the address's link with it; a ticket refused for patient
  information, and a status-page incident refused for an identifier, name every field that holds one at once.
- The FRM rows of the test matrix hold the behaviour: a browser harness over the real components in the unit project,
  and `apps/web/e2e/forms-keep-input.spec.ts` with five personas of its own.

## Not covered

- **A press made before hydration** is replayed by React through the server hook, bypassing `onSubmit`: the in-flight
  guard does not run, and a refusal of that press resets the form, as before. The window is the page's first moments,
  and the post itself still works.
- **A session that ends while a form is open** sends the person to sign in, and what was typed is lost, on purpose:
  typed text is never kept in browser storage, because it may hold patient information.
- **Without JavaScript, what was typed is lost on a refusal.** The post still reaches the action once, and the page
  comes back with the summary and each field's own message, but every field is empty and a new request key is
  rendered: keeping the values would mean echoing them from the server, which D1 rules out.
- **A hand-written form outside `ActionForm` and the version form** pins no key after a dropped press. The export form
  needs none: a drop there shows the error screen, which invites no press, and `requestExportOnce` makes a repeated
  request one; it does watch the person's mark (D10), as the split form, an `ActionForm`, does. #42's upload form
  neither pins its key nor watches the mark, until it adopts this pattern after #42.

## Not verified here

- iOS Safari's zoom itself: the captures and CI run Chromium, and the computed font size is what is asserted.
- Screen readers by hand: the announcements follow the ARIA the tests assert, and are listed for the manual 3.3.7 and
  3.3.8 checks of the accessibility pull request (combined audit #103).

## Revisit when

- React or Next changes the form-action reset or the redirect remount: the FRM-01 and FRM-02 tests fail first.
- The words pass after pull request #42 lets browser validation be turned off, and #42's upload form adopts the pinned
  key and the person's mark.
- The route outcome can tell a stale CSRF token from a wrong origin, so a page out of date may invite a press after a
  post without JavaScript too.
