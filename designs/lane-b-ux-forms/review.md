# co-001/ux-forms: adversarial design review

Reviewed: `designs/lane-b-ux-forms.md` (1276 lines) and the three scout reports, against the code in
`/home/user/ux-forms` at `4d99df8`, React 19.3.1 and Next 16.4.1 as installed, PR #42's file list
(`/tmp/claude-0/pr42-files.txt`) and head (`origin/co-001/pr-06b-mail-streams`, 13f59b1), and the file lists of the other
open pull requests (#48 to #54, fetched with `gh api .../pulls/<n>/files`).

New experiments ran in the mechanics scout's app (`scratchpad/mech-app`, production build, Chromium, under the lock).
The drivers and their output are in `scratchpad/drive/r1.cjs`, `r1.out`, `r2.cjs`, `r2.out`, `r3.cjs` and `r3.out`.
An `app/error.jsx` was added to the app so it mirrors `apps/web/src/app/error.tsx`. `scratchpad` is
`/tmp/claude-0/-home-user-PhysicalTherapy/41255adc-382e-5323-a809-0f2d8619b682/scratchpad`.

**Verdict:** the mechanism is the right one, and it is the best option rather than the cheapest. It keeps values in the
browser, posts the same with or without JavaScript, has one source for names, and fixes all 112 forms in one place. The
alternatives are fairly rejected.

Three findings block the build:
- 1: a #42 end-to-end test breaks;
- 2: a #42 file is in the file list;
- 3: an open pull request rewrites the same core component.

Eleven should be fixed before building and eight are nits. None needs a migration.

---

## Blocking

### 1. The new `FieldError` breaks #42's screening test, which this PR cannot edit
- **Severity:** blocking.
- **Evidence:**
  - Design 3.3 puts the icon and "Error:" inside the element whose id is `${id}-error`.
  - `apps/web/e2e/screening.spec.ts:718` and `:724` assert `page.locator('#field-zip-error').toHaveText(notLoaded)`. That is an exact match on the message alone.
  - The upload form feeds that element through `Field`'s `error` prop (`components/screening/upload-form.tsx:179`).
  - After this PR the element's text is "Error: PaidWhole has not loaded…", so both assertions fail, both on this branch and after #42 merges.
  - `screening.spec.ts` is a #42 file.
  - Design 8.5 checked only the `aria-describedby` order (`:717`), not the text.
- **Fix:** keep `<p id="${id}-error">` as the message alone. Render the icon and the visible "Error:" as siblings inside one wrapper `<div data-field-error class="flex …">`.
  - Leave `aria-describedby` exactly as it is (`field-zip-error field-zip-hint`, which `:717` asserts).
  - `aria-invalid` already makes a screen reader say "invalid entry", so the spoken prefix is not needed.
  - Do not use a separate prefix id in `aria-describedby`: that breaks `:717`.
  - Do not use CSS `::before` content: that is failure technique F87.
  - Update FRM-04's wording and test 5 of 8.2 to match.

### 2. `apps/worker/src/billing/billing.db.test.ts` is a #42 file, and the PR does not need to touch it
- **Severity:** blocking (hard constraint).
- **Evidence:**
  - The design lists the file in slice B's tests (7.2) and in 8.5 ("the no-payment-method message's new words").
  - It is line 1 of the intersection with `pr42-files.txt` (checked by script).
  - Its only assertion on that message is `rejects.toThrow(/no payment method on file/)` (`billing.db.test.ts:442`). The new wording, "the organization has no payment method on file: ask its administrator…", still matches.
- **Fix:** remove the file from 7.2, 8.5 and the file count. State that `:442`'s pattern holds the new words unchanged.
  - Also align the console's own sentence with the new words. `app/console/billing/page.tsx:76` says "(its administrator adds one in Settings first)" while the refusal will say "under Billing". This file is not #42's, so the change goes in slice D.

### 3. Open PR #50 rewrites `action-form.tsx`, the file this design replaces, and the design never mentions it
- **Severity:** blocking. A builder working from this design would drop a shipped prop, or the second PR to merge would conflict on the core file.
- **Evidence:**
  - #50 (`co-001/superseded-rerun`) adds `refreshOnError` to ActionForm.
  - It also adds a `RefreshAfterRefusal` child that calls `router.refresh()` after each refusal, rendered before `{children}` (patch fetched from `pulls/50/files`).
  - Design 7.1 rewrites the component, with no landing order and no mention of the prop.
- **Fix:**
  - Name the landing order (#50 first is simpler).
  - Carry `refreshOnError` into the new ActionForm, keeping `RefreshAfterRefusal` as its own component so tests outside the router still render.
  - Add one FRM-01 harness case: a refusal followed by a refresh keeps the typed values, and the hidden request key is renewed. Scout A's cookie-refusal run (Q3) already shows that a refreshed tree keeps uncontrolled values.
  - Finding 13 lists the collisions on the page files.

## Should fix

### 4. A dropped connection still throws away everything typed
- **Severity:** should-fix.
- **Evidence:** the experiment `r1.cjs` aborted the action's POST (`route.abort('internetdisconnected')`) on the design's mechanism (the variant `ref-aria`). In `r1.out`, R1:
  - `useActionState` rethrows;
  - the app's error boundary replaces the page;
  - "Try again" remounts the form with every field at its default.

  `apps/web/src/app/error.tsx` is the boundary in the real app. FRM-01 and the design are silent on this case, although "slow networks" is the case people meet most on phones.
- **Fix (best option):**
  - Keep `action={serverFormAction}` from `useActionState(serverAction)` for the post without JavaScript and for pre-hydration replay.
  - Dispatch from `onSubmit` to a second `useActionState` whose action wraps the server action. It rethrows Next's own errors (`unstable_rethrow`) and any error that carries a server `digest`, so a server failure still reaches `error.tsx` with its reference.
  - For an error with no digest (the network), it returns `{ error: 'Not sent: the connection to PaidWhole dropped. What you typed is still here. Check your connection, then try again.' }`.
  - The form shows the state of whichever hook last ran. A rethrown redirect still remounts the form (scout A's `rfr` variant).
  - Prove it in `mech-app` before building, then add a FRM-01 step that aborts the POST with `page.route`.
  - If this is not taken, ADR 0077 must list it under "Not covered".

### 5. A second identical refusal is silent
- **Severity:** should-fix (WCAG 4.1.3).
- **Evidence:** the experiment `r1.cjs` R2. Enter in the refused field, then Enter again: the summary is the same DOM node, with 0 mutations, and 0 `focusin` events (`r1.out`).
  - An `Alert` whose role is `alert` and whose text does not change is not announced again.
  - `focus()` on the field that already has focus does nothing.
  - So a screen-reader user hears "Working…" from the new status and then nothing.
  - The design keeps "the same Alert as today" (3.5).
- **Fix:**
  - Key `RefusalSummary` by a counter that grows with each response (`key={attempt}`), so the alert is inserted again and announced.
  - When focus is already on the target, move it to the summary and back, or rely on the remounted alert.
  - Add a harness test: two identical refusals produce two insertions of `[data-slot=alert]`.

### 6. Focus moved to a field or the summary can sit under the sticky header (WCAG 2.2 SC 2.4.11)
- **Severity:** should-fix.
- **Evidence:**
  - The shell's header is `sticky top-0 h-14` (`components/shell.tsx:315`).
  - The experiment `r3.cjs` scrolled the target to y=10, under a 56 px sticky header, then called `focus()`. Chromium did not scroll, and the target stayed at top 10 (`r3.out`).
  - With `html { scroll-padding-top: 72px }` it moved to 356.
  - An off-screen target is centred (`r2.out`), so the failure is the near-the-top case. That is exactly where a summary that is "first in the form" lands when the form is short.
  - Design 3.5 handles only the summary's links (`scrollIntoView` centred). The effect's own focus (3.6) is unprotected.
- **Fix:**
  - One unlayered rule in `packages/ui/src/styles.css` (not a #42 file): `html { scroll-padding-top: calc(3.5rem + 1rem); }`. It covers every `focus()`, every summary link and fragment navigation, on every page, #42's included.
  - Add an e2e assertion that the focused field's top is below the header's bottom after a refusal at 390 px. This is also PR 7's "focus not hidden" case.

### 7. The summary's lead says "Fix the field listed here" when no field is listed
- **Severity:** should-fix (3.3.1 and 3.3.3; the words are misleading).
- **Evidence:**
  - `parse` turns a missing or garbled request key into `invalid` with one issue, `requestKey`, "reload the page and try again" (`lib/http/invoke.ts:107`).
  - Root refinements, contract-workflow refusals and database rules are keyed `input` (`invoke.ts:84`, `:310`, `:320`).
  - Scout B's section 3 lists more than twenty keys that name no control: `refused`, `pattern`, `releaseNo`, `runId`, `caseLineId`, `entryId`, `reportId`, `match` and others.
  - Every one becomes `invalid`, and design 3.5 sets the lead by counting issues on the server. The page then reads "Fix the field listed here, then try again." over an item that is no field, sometimes over "Reload the page and try again".
- **Fix:**
  - In `next.ts`, map a refusal whose only issue is `requestKey` to an error with no issues (see finding 10).
  - Count only issues whose key is not `input` or `requestKey` and is not one of the known record keys. Choose the sentence by that count: one field, "Fix the field listed here, then try again."; several, "Fix the fields listed here, then try again."; none, "Not done for the reason below." followed by the messages.
  - A safer variant needs no server-side list: let `RefusalSummary` choose the lead in the browser once targets are resolved, with the server's count-based sentence kept as the version shown without JavaScript.
  - Test it with a `pattern` refusal (opening a case below the materiality) and a `refused` one.

### 8. "First in the form" puts the summary inside each caller's grid or row, which moves the fields
- **Severity:** should-fix (layout shift on refusal; reading order on a phone).
- **Evidence:** the `className` values of `<ActionForm>`:
  - 6 two-column grids (`grid gap-3 md:grid-cols-2` ×5, `sm:grid-cols-2` ×1);
  - 5 `flex flex-wrap items-end` rows (ROI, reports);
  - 6 plain `flex` rows: the users page's row forms, and `MatchForm` with `className="flex"`.

  In a two-column grid the alert takes the first cell and every field moves one cell along. In a row it sits to the left of the fields. The new `PendingStatus` adds one more child to each form's grid or flex container.
- **Fix:**
  - Give the summary `col-span-full basis-full w-full`, so it takes its own line in a grid or a wrapping row.
  - Render `PendingStatus` inside the button's existing wrapper `<div>` (`flex items-center gap-2`), not as a new child of the form.
  - Add a refused two-column grid form (`contracts`' tag form) and a refused flex-row form to 10.1's screenshot rows.

### 9. Show password: what the browser's spelling services read, and a contradiction
- **Severity:** should-fix (security).
- **Evidence:**
  - Chrome's Enhanced Spell Check and Edge's Microsoft Editor send the contents of text fields to the vendor's cloud service, and they skip `type=password`. Shown as `type=text`, a password is sent too (the 2022 "spell-jacking" disclosure).
  - Design 5.3 sets none of `spellCheck={false}`, `autoCorrect="off"` or `autoCapitalize="none"`.
  - Design 5.3 also says that a capture-phase listener turns the field back to `type=password` before the data is read, and that afterwards "it stays in whichever mode the person chose". If the listener changes only the DOM, `aria-pressed="true"` then sits on a hidden password. If the listener changes React state, the mode does not stay.
  - Design 2.3 clears by `type === 'password'`, which misses the field whenever React renders it as text.
- **Fix:**
  - The input always carries `spellCheck={false} autoCorrect="off" autoCapitalize="none"`.
  - On submit, set `shown` to false through state (`flushSync` in the capture listener), so the DOM and `aria-pressed` agree.
  - Clear secrets by a marker the component writes (`data-secret`, on every `PasswordField` and on any `autocomplete="one-time-code"` field), not by type.
  - Keep `PasswordField` uncontrolled. Clearing a controlled input from an effect would be undone by the next render. State this.
  - Add the attributes to FRM-07 and to test 9 of 8.2.

### 10. A stale CSRF token or request key ends in "Reload the page", which now throws away the values this PR keeps
- **Severity:** should-fix (3.3.7; the 3.3.7 exception covers asking again for a secret, not retyping a whole form).
- **Evidence:**
  - `guardMessage` for `csrf_refused` says "Reload the page and try again" (`next.ts:76-78`), and so does the `requestKey` issue (`invoke.ts:107`).
  - `pageCsrfToken()` comes from the session cookie (`components/form-keys.tsx`). After the session changes (signed in again in another tab), the page's token is stale. Reloading fixes the token and empties the form.
- **Fix (best option):**
  - For these two refusals, ActionForm calls `router.refresh()`, the same component #50 adds for `refreshOnError`. `FormKeys` renders a fresh token and key in place, and the uncontrolled fields keep their values (scout A's Q3 cookie case).
  - The words become: "Your session changed after this page opened. Press {submit} again." Mark this with a flag in `ActionState` (for example `stale: true`), not by matching words.
  - Add a FRM-01 step: change the hidden CSRF value, submit, see the refusal, press again, and the save goes through with the values intact.

### 11. Emptied secret fields are emptied silently
- **Severity:** should-fix (a requirement not taken).
- **Evidence:**
  - `flows-other-01`'s fix reads "clear only the secret fields on purpose (password, six-digit code), and say so under them". A search of the design ("say so", "emptied", "cleared") finds no message.
  - Without a message, a sighted person may think the password is still there (a password manager's dots can look the same), and a screen reader hears only an empty field.
- **Fix:**
  - When the form shows a refusal, each secret field renders a hint line tied by `aria-describedby`, after the error and before the existing hint: "Emptied for your security: type it again." (or, for the code, "Emptied: type the code your app shows now.").
  - Add it to 10.2's strings and to FRM-07.

### 12. The ROI double-press step races the server
- **Severity:** should-fix (test precision).
- **Evidence:**
  - Design 8.4 step 4 presses Enter twice "while the first is pending". The refusal is an `InputError` thrown by the handler (`lib/routes/roi.ts:60`) and returns in tens of milliseconds on a local server, so the second press often lands after the first has settled.
  - Then two requests are correct, and the assertion of one request fails, or the test passes for the wrong reason.
  - The step also says "the button keeps focus" although the presses are Enter in First day, so the button never has focus.
- **Fix:**
  - Hold the POST with `page.route('**/reports/roi', …)` until the assertions on the pending state are done, then release it.
  - Press the button by keyboard (focus it, then Space) to assert that it keeps focus. Assert Enter-in-field separately.

### 13. The page files, `triage.spec.ts` and `words.ts` collide with four more open Lane B pull requests
- **Severity:** should-fix (plan).
- **Evidence:** the intersection of the design's files with the open pull requests' file lists:
  - **#54** (materiality-cents) edits `cases/page.tsx`, including the very `:177` and `:181` materiality inputs slice C1 moves onto `Field` (it changes their `defaultValue` to `dollarsForInput`). It also edits `lines/[lineId]/page.tsx` and `e2e/triage.spec.ts`, where it adds a step that this design's write-off step sits beside.
  - **#51** edits `abstraction/ledger/page.tsx`, `cases/[caseId]/page.tsx`, `submissions/page.tsx` and `reconciliation/page.tsx`.
  - **#52** edits `packet/page.tsx`, `packet/[versionId]/review/page.tsx`, `lines/[lineId]/page.tsx`, `lib/copy/words.ts` and `words.test.ts`. The design adds `listed()` to `words.ts`.
  - **#49** edits `coverage/page.tsx`, where this design adds `FormKeys` and a `CheckboxGroup`.
  - Every open pull request touches `test-matrix.md`, `matrix.ts` and `registry.ts`. LANES rule 6 covers these.

  Lists: `scratchpad/review/pr{49..54}-files.txt`.
- **Fix:**
  - Add a section "Open pull requests that touch these files" with each overlap and a landing order. Recommended: after #50, #51, #54 and #52, then merge `claude/build-platform` into this branch (LANES rule 6: never rebase).
  - Have slices C1 and C2 re-read those pages at the merged head rather than at `4d99df8`'s line numbers.
  - Check #49's form after its merge: whether it adds `FormKeys` first, and whether the defect claimed in 7.4 still stands.

### 14. Two recommended wordings from the findings are not taken, or not reported as departures
- **Severity:** should-fix (the orchestrator's rule: take the recommended option, or report why not).
- **Evidence:**
  - `words-other-01` writes its replacements as sentences with a full stop and a capital ("Organization: this form takes no patient information. Remove anything …, then send again."). The design keeps the colon house form "{name}: {lower-case instruction}" for every message (10.3) and gives its reason, but does not list it as a departure from the recommendation.
  - `words-other-01`'s "Your name: enter your name, up to 200 characters." is not taken where the field is not #42's: request-audit's `contactName` is `requiredText(200)` (`lib/routes/onboarding.ts:110`), whose maximum message stays "at most 200 characters". The field's `maxLength={200}` makes this message rare.
- **Fix:**
  - Give `requiredText`'s maximum message the instruction form ("enter at most 200 characters").
  - List in 9.3's report to the co-founder each recommended wording the design replaces, with its reason. The colon form is defensible, but it is a departure, and it must be reported as one.

## Nits

### 15. The tidy rule strips any trailing parenthetical
- **Evidence:** `tools/brand-copy/scan.ts:150` expressly allows "Recovered principal, net (posted)", the shape brand.md requires for "recovered". The runtime tidy rule (3.4) would print "Recovered principal, net:". No form label has that shape today (`roi.test.tsx:16` is a figure label), but the static lint cannot see a runtime strip.
- **Fix:** never strip a parenthetical that holds "posted" or "deposited". Better, strip only a closed list: "(optional)", "(dollars)", "(days)", "(month)", and a label's note when the label marks it up as one.

### 16. The legend wins over a checkbox's own label in a fieldset of independent booleans
- **Evidence:** the versions page's "Medicare adjustments the contract incorporates" fieldset holds four independent booleans: `applyMppr`, `applyAssistantReduction`, `applySequestration` and `applyNcci` (`abstraction/versions/[versionId]/page.tsx:231-236`). Rule 2 of 3.4 would name a refusal of `applyNcci` "Medicare adjustments…", not "NCCI edits".
- **Fix:** use the legend only when the issue's target is a group: a `RadioNodeList`, or a key shared by more than one control.

### 17. Session expiry while a form is open
- **Evidence:** `runAction` redirects to `/sign-in` and the values are lost. The design is silent on this case.
- **Fix:** record in ADR 0077's "Not covered" that this is accepted, because typed text is never kept in browser storage (PHI).

### 18. Pre-hydration replay resets the form
- **Evidence:** React replays a submit made before hydration through `startHostTransition(formInst, …, action, formData)` (`react-dom-client.development.js:26585-26618`). That path requests the reset and bypasses `onSubmit`, so the guard and `beforeSubmit` do not run.
- **Fix:** record it in ADR 0077's "Not covered".

### 19. A dead "Show" button without JavaScript
- **Fix:** render the toggle `hidden` until mounted. This also drops one tab stop for the post without JavaScript.

### 20. A strict-mode trap in the design's own e2e
- **Evidence:** in e2e step 3, `getByRole('button', { name: 'Show new password' })` also matches "Show new password again" (a substring match).
- **Fix:** use `exact: true`.

### 21. More `role="status"` regions
- **Evidence:** `PendingStatus` adds a `role="status"` region to every form. Scoped `getByRole('status')` locators exist at `packets.spec.ts:223`, `uploads.spec.ts:43` and `reconciliation.spec.ts:58`.
  - None of them shares a region with an ActionForm in the state it asserts (at :223 the Export button is gone while the export is in progress), so nothing breaks today.
- **Fix:** give the pending status `data-slot="pending-status"` (the design already does) and record this check.

### 22. Test precision
- **Evidence and fix:**
  - "The page contains no `organizationName`" (8.4 step 1) is ambiguous, because `name="organizationName"` is in the HTML. Assert that the visible text does not contain it.
  - Add the submissions form's "Partially accepted" select to an e2e refusal. It is `narrow-practice-1-07`'s case where a reset would record the wrong payer response.

## Attacks the design survives (checked)

- **Success resets the form.** Next's redirect remount resets every case (scout A Q3). `find app -name layout.tsx` gives two layouts, and neither renders `FormKeys`, `Shell` or `ActionForm`. No action returns a success without a redirect: every `'use server'` export goes through `runAction` or `runSignInStep`, whose `ok` redirects. The packet `actions.ts:24` return is a refusal.
- **Double submit.** The `inFlight` ref stops a same-frame double press (scout A Q5). React's listener does nothing when `onSubmit` prevented the submit without starting a transition, so a guarded press sends nothing.
- **Two forms on a page.** Each form has its own provider. No `form=` attribute is used anywhere in `apps/web/src`, so no field sits outside its form.
- **The coverage review form.** It really has no `FormKeys` (`coverage/page.tsx:283`; `FormKeys` only at `:307` and `:326`). The route is `kind: 'action'` (`lib/routes/models.ts:168-169`).
- **Request audit without JavaScript.** It needs no request key. `public_form` skips a null address (`lib/http/rate-limit.ts:79`), so the e2e run is not throttled.
- **Dependencies.** `vitest` and `@playwright/test` are declared in `apps/web/package.json`, so the harness adds no lockfile change. CI-05's global setup (`vitest.config.ts:29,75`) stops Chromium being skipped silently. Mutation testing covers only the money packages (`stryker` configs).
- **Scope.**
  - There is no migration. Apart from finding 2, no #42 file is touched other than the rule-6 shared documents.
  - `e2e/a11y.ts` is not edited, so nothing collides with PR 7.
  - Notices and row-control names stay out.
  - ADR 0077 is free (no open pull request adds it).
  - #48 bumps neither React nor Next.
  - All 31 finding ids are cited.
- **Pending state and the brand.**
  - The summary keeps "Not done", so `contracts.spec`, the tour's `refused()` and `onboarding.spec.ts:539` still match.
  - No e2e test asserts an emptied field (`grep toHaveValue('')` finds none).
  - The danger mark uses `--destructive`, that is `--pw-danger`, not `--pw-short`, and adds no hex.
