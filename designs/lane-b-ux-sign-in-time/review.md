# Review: co-001/ux-sign-in-time design (UX PR 6)

One adversarial review of `designs/lane-b-ux-sign-in-time.md` (1,529 lines, read whole) and the three scouts' reports,
against the code at `83d71fd6` in `/home/user/ux-sign-in-time`, the queue entry (`lane-b-ux-review.md:242-254`),
UX-012 (`:1800-1818`), UX-128 (`:3928-3946`), `synthesis/prs.json` order 6 and the item prompt. Two lenses:
`.claude/agents/security-reviewer.md` and `.claude/agents/ux-brand-reviewer.md`. 2026-11-01.

## What was checked, and holds

- **Cites.** About 90 file:line cites were read at `83d71fd6`, every one in sections 2.2, 2.6, 3 and 4.5. All of them
  hold, within a line. They include:
  - `pending.ts:15-17`, `:23-26`, `:33-37`; `seal.ts:39-46`, `:43`, `:57-66`; `sessions.ts:20`, `:78`
  - `routes/sign-in.ts`: `:22-38`, `:50-53`, `:86`, `:91-122`, `:124`, `:135-140`, `:145-152`, `:158-163`,
    `:172-175`, `:201-204`, `:228-231`, `:270-278`, `:306-308`, `:319-322`, `:346`
  - `auth/sign-in.ts:44-50`, `:119-134`, `:163-178`, `:230-237`, `:251`
  - the five sign-in pages and `notice.tsx:6-31`
  - `next.ts:20-22`, `:25`, `:27-38`, `:60`; `handler.ts:47-49`; `sign-in-for.ts:9-17`
  - `field.tsx:20-25`, `:68-75`, `:82`, `:92`; `form-issues.tsx:175-181`, `:577`, `:591`
  - `hardware-key.tsx:62-64`, `:89-95`, `:144-152`; `action-form.tsx:89`, `:163`
  - `alert.tsx:6-14`, `:18-19`; `refusal-notice.tsx:38-55`; `words.ts:9-11`; `download-refusal-words.ts:69`
  - `schemas.ts:22`; `rate-limit.ts:39`; `services.ts:183`; `playwright.config.ts:92`, `:126`;
    `security-headers.ts:69`, `:83`
  - `identity.ts:7-8`, `:11`, `:14`, `:23`, `:41-42`, `:82`, `:108`; `infra/test/identity.test.ts:109`;
    `primitives.test.ts:65-77`
  - `dev-provider.ts:25-26`, `:47-48`, `:88-90`
  - `sign-in-routes.db.test.ts:49`, `:58-73`, `:86-110`, `:150`, `:172`, `:182-186`, `:217-224`, `:234`
  - `synthetic-personas.ts:31-32`, `:142-155`; `db/src/seed.ts:87`; `onboarding.ts:119`
  - `matrix.ts:502-508`; `registry.ts:731-738`; `types.ts:9`; `common.ts:18`; `fixtures.test.ts:33-44`;
    `test-matrix.md:353-365`
  - ADR 0016 `:3` and `:30-31`; ADR 0077 `:47`, `:67`, `:142-150` and `:246`; ADR 0056 `:57`; `sessions.md:17`
  - `test-support/browser.ts:75-80`; `forms-harness.tsx:16`, `:29-32`, `:48`, `:54`, `:272`
  - the tour's `invitedShots` (`tour.spec.ts:1307-1395`)
- **#42.** Read from the REST API: open, draft, head `be63bdc2`, 219 files (3 pages of files). `comm -12` of that list
  with every path in section 3 gives only the three shared documents. On `be63bdc2`, `identity.ts:11` and `:14` are
  unchanged. `e2e/helpers.ts`'s `addVirtualKey` there returns a `VirtualKey`, so `await addVirtualKey(page)` still
  compiles, and its `refusal()` selector is unchanged.
- **Files.** Every file a slice names exists at `83d71fd6`, or is marked new: `step-limits.ts`, its test,
  `pending.test.ts`, `step-timer.tsx`, its two tests, `arrival-focus.tsx`, `step-heading.tsx`,
  `e2e/sign-in-time.spec.ts` and ADR 0081. No file is in two slices.
- **SGN rows and registry.**
  - Each row matches `fixtures.test.ts`'s pattern `^\| ([A-Z]{2,3}-\d{2}) \| (.*) \| (.*) \|$` and contains no `|`.
  - Each entry has `none`'s shape (`registry.ts:27`), at milestone 1, as FRM-07 is. Milestone 1 is under
    `BUILT_THROUGH_MILESTONE` (5), so each entry must name its tests, and every entry does.
  - Every `assertedBy` path exists or is new in this PR.
  - `'SGN'` in `CASE_MODULES` and `SGN: 19` in `MODULE_NUMBER` are the only module enumerations. `git grep` finds no
    other place.
  - `fixtures/synthetic/SGN-0n/expected.json` is generated, as FRM-07's and DLR's are.
- **Security lens. These hold:**
  - The kept-email cookie is sealed under its own purpose, HttpOnly, Secure, SameSite=Lax and `Path=/`, through the
    unchanged adapters. Its lifetime is absolute, counted from the step's start, and it is read only on two reasons.
  - Enumeration:
    - The cookies written for an unknown address and for a wrong password are identical.
    - The kept email is written only after the password is proven, never by `hardwareKeyOptions`.
    - `keyRequired` comes from the row already read, and only on a pending result.
  - The deadline comes from the server's clock (`services.now()`, real in production at `services.ts:183`). No test
    knob is added; the dev provider runs only under `TP_ALLOW_LOCAL_PROVIDERS=e2e`.
  - No log line, error message or URL carries the email. The rate limits and the lock are unchanged.
- **UX lens. These hold:**
  - `role="status"`, present and empty from the first render, never `alert` or `timer`, and outside the form.
  - No ticking count.
  - The phase is the smaller of the wall clock and the monotonic clock.
  - Nothing redirects at zero, and the button stays `aria-disabled`, never `disabled`.
  - The words are within brand and CO-11, and the departures from the review's recommended words are listed.

## Findings

| Id | Severity | Lens | Finding |
| --- | --- | --- | --- |
| R-01 | should-fix | security / UX | The kept email says "use the temporary password" after the chosen one was saved |
| R-02 | should-fix | UX | Focus on Start again is lost at zero unless the link is the same node |
| R-03 | should-fix | UX | At 390 px with the on-screen keyboard open, the warning below the form is likely out of view |
| R-04 | should-fix | UX | The hardware-key page also renders `SignInNotice`, and the design neither lists nor words it |
| R-05 | should-fix | UX | "The empty region takes no space" is false on enrolment's flex column, and the Alert box must be conditional |
| R-06 | nit | UX | "within a minute" breaks the design's own digits-through-`counted()` rule |
| R-07 | nit | docs | ADR 0077's Status line should name 0081, as 0056's names 0077 |
| R-08 | nit | security | A rolling deploy's old task 404s `?reason=restarted` |
| R-09 | nit | UX | Render-to-mount latency on a slow phone is seconds, not "under a second" |
| R-10 | nit | security / legal | The new email cookie should be recorded for the privacy notice (#51, counsel) |
| R-11 | nit | maintainability | `StepName` written out with a `_same` check is unneeded: an `import type` is erased |
| R-12 | nit | tests | The dev provider's pin belongs in the existing `dev-provider.test.ts:83` |
| R-13 | nit | UX | `ArrivalFocus` duplicates `RefusalTakeover`; reuse its guard |
| R-14 | nit | UX | A staff member with a reset authenticator but a key is shown "Step 1 of 2" and gets no step 2 |
| R-15 | nit | security | The "Shown" row says "as the notice's words", which reads as if the notice prints the address |

### R-01 (should-fix; security and UX): the kept email can name the wrong password, the case it exists for

- **Evidence.**
  - `auth/sign-in.ts:185-193`: `newPassword` calls `setNewPassword`; on success the password is saved and `after()`
    returns pending `mfa_setup`.
  - `routes/sign-in.ts:93-98`: `settle` then calls `beginTotpSetup` (Cognito's `AssociateSoftwareToken`). If that
    answers `expired`, `settle` recurses into its `expired` branch (`:114-116`), which per design 2.6 keeps calling
    `clearPending` only.
  - So the kept email still holds what the new-password step wrote, `use: 'temporary'` (design 2.6, "`use` is
    `'temporary'` when the kept step is `new_password`").
  - The notice then says "Use the temporary password from your invitation." The password was in fact changed.
  - The window is real. The app's limit counts from `at`, before `setNewPassword`. A press at `startedAt + 179 s`
    passes `pendingOf`, Cognito accepts the password, and the next call (`AssociateSoftwareToken`) can fall past
    Cognito's own 3 minutes. The design says Cognito's restart behaviour on that session was not checked (2.2).
- **Result.** This is exactly the repro in scout-flow 1.2, case C. The person retries the temporary password, is
  refused, and each try counts toward the ten-failure lock.
- **Fix.**
  - In `settle`'s pending branch, when `from?.step === 'new_password'` and the result is not `invalid_password`,
    rewrite the kept email with `use: 'chosen'` **before** calling `beginTotpSetup`. Equivalently, `advance` writes
    it as soon as the flow returns anything after `setNewPassword` succeeded.
  - Add a server test (4.2 test 5): `beginTotpSetup` answers `expired` after a saved password, and `signInPage`
    returns `use: 'chosen'`.

### R-02 (should-fix; UX, WCAG 2.4.3): Start again must keep the focus across the change to "closed"

- **Evidence.** Design 2.4 and 2.5 put the Start again link inside the atomic region and change the region's words at
  zero. Harness test 2 (4.3) checks only that the code field keeps the focus.
- **The failure.** A keyboard or screen-reader user who tabbed to Start again during the warning, a likely moment,
  is holding it at zero. If the closed phase renders a new `<Link>` (another branch, key or wrapper), React replaces
  the node and the focus drops to `<body>`.
- **Fix.**
  - Specify that the title and words change and the link is the same element in both phases: one JSX position, no
    key.
  - Add harness test 2b: focus Start again during the warning, `runFor` past zero, and the link is still
    `document.activeElement`.

### R-03 (should-fix; UX, WCAG 2.2.1): the warning below the form may never be seen on a phone

- **Evidence.** The region goes "below the form" (2.4). Harness test 10 (4.3) checks only that it fits at 390 px and
  that nothing scrolls sideways. `atPhoneWidth` uses a 390×844 viewport (`e2e/a11y.ts:101-104`).
- **The failure.**
  - A sighted person typing the code on a phone has the on-screen keyboard up, so the visible viewport is about
    390×400.
  - The browser scrolls the focused field into view, and the region sits below the field, its hint, the button and
    the pending status.
  - The warning may be off-screen for the whole last minute. The polite announcement reaches only screen-reader
    users, so a sighted phone user is not warned.
  - Risk row 12 (section 8) defers this to UX PR 86, but it applies today, on every step.
- **Fix.**
  - Measure it. At 390×500, with the code field focused, the region's box must be inside the visual viewport when it
    speaks. Add this to harness test 10 and to e2e test 1.
  - If it fails, keep the region where it is, as the design rules, and reserve the space by `min-height` only while
    the step is in its last `warningSeconds`. Or record the gap in 2.9 for audit #103.
  - Never `scrollIntoView` and never move the focus.

### R-04 (should-fix; UX): `/sign-in/hardware-key` renders the same notice, and the design does not list it

- **Evidence.** `app/sign-in/hardware-key/page.tsx:8`, `:13`, `:17` render `SignInNotice reason={reason}` with the
  shared `reasonParams` (`routes/sign-in.ts:38`, `:254`). Section 3.3 changes `SignInNotice` to
  `({ reason, kept })`, wraps it in `ArrivalFocus` for `step_expired` and `restarted`, and says "Nothing else". The
  hardware-key page is in no slice.
- **What happens.**
  - Unless `kept` is optional, the typecheck fails.
  - If `kept` is optional, `/sign-in/hardware-key?reason=step_expired` and `?reason=restarted` show
    "…Start again from your email and password." to a person signing in with a key. That is the wrong next step, and
    it takes the focus.
  - The 3.5 hook for UX PR 7 is to send the stale `key` step exactly there (`/sign-in/hardware-key?reason=step_expired`).
- **Fix.**
  - Name `hardware-key/page.tsx` in 3.3, with `kept` optional (none there).
  - Give `SignInNotice` a `surface: 'password' | 'key'` so the key page says "That sign-in step closed. Start again
    with your hardware key." (or render `step_expired` there without the password words).
  - Record it as PR 7's starting point.
  - The tour then needs no new id. `sign-in-hardware-key.*` stays out of the sample because nothing on its default
    changes.

### R-05 (should-fix; UX): the empty region does take space on enrolment, and the Alert look must be conditional

- **Evidence.** `enroll/page.tsx:24` sets `CardContent` to `flex flex-col gap-4`. Design 2.4 has `StepTimer` render
  the sentence, the children and an empty region, and claims the empty region "takes no space".
- **The problems.**
  - If `StepTimer` returns a fragment, the empty `div` is a flex item, and `gap-4` adds 16 px under the form.
  - If it returns a wrapper, the setup key, the link and the form lose the card's `gap-4`.
  - The region's `alertVariants` classes (`border px-4 py-3`) on an empty `div` draw an empty bordered box.
  - The tempting fix, `hidden` or `empty:hidden`, removes the region from the accessibility tree. That defeats the
    present-from-the-start rule the design relies on (scout-timer 1.3).
- **Fix.**
  - `StepTimer` renders one wrapper with its own `flex flex-col gap-4` (the enrolment page drops its own).
  - The region carries no box classes and no margin until `data-phase` is `warning` or `closed`; then
    `alertVariants({ variant: 'default' })` and `mt-4` apply.
  - Never `display:none` or `visibility:hidden` on the region.
  - Harness test 3 then also asserts the region's height is 0 while open.

### R-06 (nit; UX, brand): "within a minute" against the digits rule

- **Evidence.** Section 6.1 says the words use "numbers as digits with their noun through `counted()`". The warning
  title is "This step closes within a minute", but "within 2 minutes" on key registration.
- **Fix.** Use "This step closes within 1 minute", which is `counted(1, 'minute')` and the same form as "This step
  stays open for 3 minutes." Or record "a minute" as a departure with its reason. The first is recommended: one rule
  for every count.

### R-07 (nit; docs): ADR 0077's Status line

- **Evidence.** House style: an amended ADR's Status names its amenders. 0056's Status (`0056-…md:3-5`) reads
  "amended by 0058, 0077 and 0078". Section 5.2 updates 0016's Status line, but 5.3 adds only the two italic notes to
  0077.
- **Fix.** Also change 0077's Status (`:3`) to "…; amended by [0081](…)". It is a one-line hunk, away from
  `co-001/wip-contract-phi-check-5`'s `:142-150`.

### R-08 (nit; security, reliability): a rolling deploy and the new reason code

- **Evidence.** `reasonParams` is `z.enum(SIGN_IN_REASONS)` (`routes/sign-in.ts:38`). An old task refuses
  `?reason=restarted` (design 6.2: "on the base: a 404").
  - During a rolling deploy, a Start again link served by a new task and answered by an old one shows a 404.
  - An old task's `settle` also never clears `tp_sign_in_email` at session open.
- **Fix.** Add a row to section 8: bounded by one deploy window, and the cookie by its 18 minutes. No code change.

### R-09 (nit; UX): render-to-mount latency

- **Evidence.** Section 2.4 says the browser count is "late by … under a second". On a slow phone network, the time
  from the server render to hydration can be several seconds. The warning's lead then shrinks by that much, while the
  server still closes the step on time.
- **Fix.**
  - On a full page load, subtract `performance.now() - PerformanceNavigationTiming.responseStart` from `closesIn` at
    the anchor. On a client navigation, keep today's rule.
  - Or state the real bound and that the server decides.

### R-10 (nit; security, legal): disclose the cookie

- **Evidence.** `docs/product/legal-surfaces.md:25` (a #42 file) lists the attribution cookie as a legal surface
  disclosed in the privacy notice (#51). The design adds a second sign-in cookie that holds the person's address,
  sealed, and does not consider disclosure. `tp_sign_in` already holds the address sealed, so the change in substance
  is small.
- **Fix.** Add a section 7.2 proposal for the founder and counsel: the sign-in cookies are strictly necessary and hold
  the address sealed for at most 18 or 30 minutes; the privacy notice (#51) may name them. This PR edits no legal
  text.

### R-11 (nit; maintainability): `StepName` and the `_same` assignment

- **Evidence.** Section 2.1 writes `StepName` out "so the module imports nothing". It then adds a two-way assignment
  check in `pending.ts`.
- **Why it is unneeded.** `import type { Pending } from './sign-in'` is erased at compile time, so
  `export type StepName = Pending['step']` keeps the leaf free of runtime imports (the client never imports it
  anyway). That drops the check, and the unused-variable lint risk with it.
- **Fix.** Use the type-only import. If the two-way check is kept, write it as a type, not a `const`.

### R-12 (nit; tests): where the dev provider's pin goes

- **Evidence.** `lib/auth/dev-provider.test.ts:83` already tests "expires a challenge after three minutes", with a
  hard-coded clock move. Test 4 in `step-limits.test.ts` (4.1) would duplicate it.
- **Fix.** Change the existing test to move the clock by `PROVIDER_CHALLENGE_SECONDS - 1` and then
  `PROVIDER_CHALLENGE_SECONDS`, title it SGN-01, and name `dev-provider.test.ts` in SGN-01's `assertedBy`.

### R-13 (nit; UX): `ArrivalFocus` and `RefusalTakeover`

- **Evidence.** `RefusalTakeover` (`components/action-form.tsx:153-166`) is already a `tabIndex={-1}` wrapper,
  focused on mount, with the same ring classes. It focuses only when nothing else holds the focus (`takesFocus`,
  `active === document.body`). Section 2.6's `ArrivalFocus` focuses unconditionally.
- **Fix.** Give `ArrivalFocus` the same "only when the focus is on body" guard, so a reload after the person has
  tabbed does not pull the focus. Better still, share one primitive.

### R-14 (nit; UX): the count for an active staff member

- **Evidence.** Section 2.7's table gives `mfa_setup` with `keyRequired` the value `{ at: 1, of: 2 }`. An *active*
  internal account whose authenticator was reset but which still has a key then reads "Step 1 of 2", and
  `authenticated()` (`auth/sign-in.ts:146-151`) sends it to the hardware-key sign-in with no step 2.
- **Fix.** Number `mfa_setup` from `keyRequired` only when the account is `invited`. The flow already holds
  `account.status` at `:163`; report `invited` beside `keyRequired`. Or record the case as accepted.

### R-15 (nit; security): the "Shown" row in section 2.6

- **Evidence.** The cookie table's "Shown" row says the address appears "as the notice's words". Section 6.1's words
  never print the address ("Your email is filled in…").
- **Fix.** Write "the notice says it is filled in, never the address". The address then appears once, as the field's
  value, and a builder never puts it in the live region.

## Verdict

No blocking finding. The design is sound on its core security choices, and its cites are accurate at `83d71fd6`.
Those choices are:
- the server's deadline, from before the provider call;
- the sealed, absolute, purpose-bound kept-email cookie;
- the enumeration rules, which hold.

Before building, take R-01 to R-05: one correctness gap in the password line, two keyboard and phone gaps in the
warning, a missed consumer of `SignInNotice`, and a layout claim that does not hold on enrolment. Take the nits as
improvements within scope.
