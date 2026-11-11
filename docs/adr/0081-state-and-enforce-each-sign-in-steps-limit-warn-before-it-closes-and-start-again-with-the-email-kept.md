# 0081. State and enforce each sign-in step's limit, warn before it closes, and start again with the email kept

- **Status:** accepted (`co-001/ux-sign-in-time`, the UX baseline review's sixth pull request; UX-012's now part,
  C-007, and UX-128's step marker, C-042). Amends
  [0016](0016-sign-in-through-an-auth-provider-with-application-held-sessions-and-devices.md) (a step now closes at the
  limit that binds, counted from its challenge, and a second sealed cookie keeps the email); adds to
  [0077](0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md)
  (its one exception: the sign-in email, rendered back after a step closes); reverses none of their rulings. UX PR 7
  (`co-001/ux-sign-in-recovery`) adds an amendment section of its own, with SGN-05 to SGN-08, whose A4 and Not covered
  [0088](0088-a-confidential-cognito-client-and-second-factor-enrolment-only-inside-a-live-invitation.md) amends.
  `co-001/auth-emails` adds the code-email amendment, with SGN-13 to SGN-15. `co-001/email-lockup-plate` amends
  [0058](0058-serve-email-art-from-the-static-host-hold-the-brands-colors-fonts-and-words-with-checks-and-compare-the-header-and-cover-with-baselines.md)
  (the worker's email lockup is the art on a White plate, and its first-deploy check names the plated files).
- **Date:** 2026-11-01
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings have the build take each recommended option and wording without asking (UX-128's marker
  form and every wording of this decision, with its departures from the review's words); the build (Lane B). Each
  reversible by the founder
- **PRD sections:** 6 (Identity and sessions; Cross-cutting: accessibility, every error with a next step), 7 (Sign-in
  and MFA); `docs/product/sessions.md`; test matrix SGN-01 to SGN-08 (SGN-05 to SGN-08 the amendment's); ADRs
  [0012](0012-aws-foundation-from-shared-cdk-constructs.md),
  0016 and 0077

## Context

No sign-in step said it had a time limit, and none warned before it ended. Two clocks run on each step after the
password, and the page showed neither: the provider's challenge, Cognito's sign-in session of 3 minutes
(`infra/lib/constructs/identity.ts`, `authSession`, Cognito's minimum; the dev provider's `CHALLENGE_MS` is its twin),
and the pending cookie `tp_sign_in` of 5 minutes (15 for key registration, whose provider limit is the access token's
15). The pending value held no time: the seal's expiry was the cookie's, and a refused new password rewrote the cookie
with a fresh 5 minutes while Cognito's 3 ran on. So the server could not say how long was left, and a dead step
rendered as live from minute 3 to minute 5: a correct code pressed there landed on `/sign-in?reason=step_expired` with
the Email field empty.

The email lived only in the pending step, which the expiry cleared. After enrolment closed, an invited person was not
told which password now worked: the new one had been saved before enrolment, so the temporary one was refused, each try
counting toward the ten-failure lock, and the chosen one led to enrolment with a new setup key, the first left behind
in the authenticator app. And the invited person was never told how many steps remained (UX-128). No test saw any of
it: the route test moved its clock 6 minutes, past both clocks at once, and checked only the redirect, and the e2e
journeys passed each step in seconds.

WCAG 2.2.1 (A, a timing that is adjustable), 2.2.6 (AAA, taken as practice: the duration stated at the start), 3.3.7
(redundant entry) and 4.1.3 (status messages) apply.

## Decision

- **D1. One limit, from one constant.** `apps/web/src/lib/auth/step-limits.ts`, a leaf module with no runtime imports,
  holds the provider's challenge (180 s) and grant (900 s), the pending cookie's lives, `stepSeconds` (the shorter of
  the provider's and the cookie's: 3 minutes on new password, enrolment and code, 15 on key registration) and
  `warningSeconds` (two minutes on a step of ten or more, one otherwise). Each length is a `Record` over every step the
  flow's `Pending` names, so a step added later fails the type check until it is given its lengths. The dev provider
  reads the same constants, and `step-limits.test.ts` reads infra's source text and fails when the two differ. The
  hardware-key sign-in step, one ceremony of seconds, is enforced like the rest and states nothing.
- **D2. The server closes the step at that limit**, counted from a start taken before the provider was asked
  (`startedAt`, from the server's clock, sealed beside the flow's step as an added property, so a release before and
  a release after read each other's values). No rewrite renews it: a refused new password and key registration's
  options re-seal the start they read, and the cookie's own expiry and Max-Age count from it too. `pendingOf` treats a
  step at or past its limit as no step, so a page or a press after it starts again before any provider call, and counts
  no failure: no `sign_in_failed`, no audit event, no change to the lock. The provider's own `expired` stays the
  backstop. A step sealed before the deploy has no start, shows no countdown and is left to the provider and the
  seal's 5 minutes, for at most one deploy window.
- **D3. Each step states its limit before the work**, as a sentence rendered by the server: "This step stays open for 3
  minutes." (15 on key registration), its minutes from the constant through `counted()`. On enrolment it sits above
  the setup key. A page rendered later in the step (a reload, a return, a phone that discarded the tab), more than five
  seconds below the limit by the server's count for that request, states the time left instead: "This step closes
  within 2 minutes.", the minutes rounded up after "within", so the sentence stays true for as long as it is on screen;
  rounded down it would turn false while it stood. Within the warning the first render already shows the warning's
  phrase. The server and the browser render it alike from the same numbers, and the status stays empty until the
  browser's first count. No ticking count: a per-second count is auto-updating content beside the work (2.2.2), and
  adds pressure while a person copies a 32-character key.
- **D4. One polite warning** at `warningSeconds` left, in a `role="status"`, `aria-atomic` region (`StepTimer`,
  `data-slot="step-timer"`) present and empty from the first render, below the form and outside it, with no box and no
  margin until it speaks. It is said once, never while the page is hidden (a person who comes back after zero hears only
  that the step closed), never by moving the focus, with nothing animated. It says what Start again costs and keeps
  ("If you need more time, start again: your email is kept, and you type your password again."), and on enrolment that
  the setup key will change. The limit sentence above the work shows the same state in a few words ("This step closes
  within a minute.", "This step has closed.", on enrolment "This step and its setup key have closed."), its three
  phrases stacked in one grid cell sized from the first render, so a phone with its keyboard up shows the warning
  beside the field without anything moving; the sentence is not a live region, so the warning is said once, by the
  region. The browser counts on the smaller of its wall and monotonic clocks, anchored per deadline so a re-render
  keeps its first count, and takes off the latency between the server's render and the page's load; the server
  decides.
- **D5. At zero** the same region says once that the step has closed, with Start again; nothing redirects, the form
  stays usable (its button is never `disabled`), and the next press or a reload lands on `/sign-in?reason=step_expired`.
  The setup key is not hidden: the sentence directly above it says it has closed with the step, and the closed words say
  it no longer works.
- **D6. Start again ends the step and keeps the email.** Start again is a button, styled as an outline button, in a
  form whose action (`restartStep`, the public route `sign_in.restart`) ends the step the person is leaving before the
  sign-in page renders: it deletes `tp_sign_in`, gives key registration's grant back to the provider, keeps
  `tp_sign_in_email`, and goes to `/sign-in?reason=restarted`, a new reason. So the setup key, the code's challenge and
  the key-registration grant open nothing for whoever presses Back or opens the step's address next, at a shared
  computer. It is a POST from the step's own form: origin-checked as every sign-in step is, counted in the `mfa`
  bucket by the pending step it names (never an account), with no audit event, as a step that closes at its limit has
  none; a refusal (its rate limit, which codes and key ceremonies spend too) still deletes `tp_sign_in` and goes to the
  sign-in page, so Back opens nothing; only the grant waits, to lapse at the step's limit. The form and its button are
  one element in the warning and at zero, so a person who tabbed to it keeps the focus; once pressed it says
  "Working…" beside the status, never in it, and a second press sends nothing. The
  email is kept in `tp_sign_in_email`: sealed under its own purpose (`sign-in-email`), HttpOnly,
  Secure, SameSite=Lax, Path=/; written only after the provider accepted the password (never for the hardware-key step,
  whose options are issued for any address), until 15 minutes past the step's limit, counted from its start; read only
  by the sign-in page on `step_expired` and `restarted`; ended by a session, a lock, a key required or registered, an
  account found disabled or removed after a proven step, and any first step that opens none, and kept through an
  expiry and Start again, which is what it is for. It also says which password works
  (`use`: the temporary one, or the one chosen in this attempt, written before the setup key is asked for, so an expiry
  on that call still says "chosen"), and the notice on arrival takes the focus once, when nothing holds it: the notice
  itself (`ArrivalNotice`), a `role="note"`, never also a live region, so a client navigation that inserts it filled
  and then focuses it reads it once; the other reasons stay a polite status that takes no focus. This is the
  one value the server renders back into a form, an exception to ADR 0077 D1, and the one value kept between pages
  outside the server, an exception to 0077's "typed text is never kept in browser storage"; it is the person's own
  sign-in address, never patient information, and is never in a URL, a log, an error or a job payload. The notice says
  the email is filled in and never prints it. On the hardware-key page the two restart reasons read in the key's terms
  ("Start again with your hardware key.").
- **D7. The invited paths are numbered by the server**, from the provider's answer and the account row the flow already
  reads, sealed with the step: "Step 1 of 2" and "Step 2 of 2" for an invited customer, "Step 1 of 3" to "Step 3 of 3"
  for an invited staff member, as the caption of the step's heading (`StepHeading`), so a screen reader and a list of
  headings read "Step 1 of 2: Choose a password". The first screen cannot know the path, and saying it would tell which
  addresses are invited, so it carries none; nor does an everyday sign-in, or a restart with one step left.
- **D8. What WCAG 2.2.1 still leaves unmet.** A Cognito sign-in session cannot be turned off, adjusted by the person or
  refreshed, and Start again needs the password, which is not the simple action 2.2.1's extension asks for; keeping the
  password between steps to make it one is refused. So the steps meet 2.2.1 in part, now and after UX PR 66's 15
  minutes, and the remainder is recorded for combined audit #103's manual checks, with one more: on a phone with the
  keyboard up, the warning's full words and Start again can sit under the keyboard (the sentence's cue above the work
  stays in view).

## Alternatives considered

- **A ticking count** ("2:13 left"). Auto-updating content beside the work, needing its own hide control, and pressure
  during a transcription task.
- **A local clock time** ("open until 10:42"). The server cannot render it without the person's time zone, so it would
  change after hydration.
- **Extend.** Cognito cannot refresh a sign-in session; faking it means keeping the password, which is refused.
- **The email in the pending cookie, kept longer.** The expiry clears it, and lengthening it lengthens what it carries
  (Cognito's session, the TOTP secret, the key grant) and makes a dead step look live.
- **The email in browser storage.** Needs script, misses the expiries the server finds, and any script on the origin can
  read it; ADR 0077 keeps nothing typed there.
- **The email in the URL.** An identifier in the history, the logs and a shared link.
- **A signed, not sealed, cookie.** The address readable in base64 in the cookie viewer or a saved HAR.
- **A cookie path of `/sign-in`.** It gains no confidentiality, and a delete whose path differs from the set's silently
  fails, so the cookie would outlive the session or lock that should end it.
- **SameSite=Strict.** It stops only a cross-site GET of a page that cannot be framed or cached, and breaks the house's
  cookie rule (`docs/product/sessions.md`).
- **Writing the kept email in `writePending`.** It also writes the hardware-key step for any typed address, so the
  cookie would be mintable for any address.
- **A deadline from the cookie's own life, or a sealed deadline.** The cookie's is reset by a refused new password and
  is 5 minutes, not 3; a sealed deadline would not take a new length on deploy, where a sealed start does.
- **`startedAt` in the flow's `Pending`.** It edits the union and every flow method UX PR 7 extends; the added property
  does the same with none of those hunks.
- **Disabling the form, or redirecting, at zero.** A disabled form locks out a live step if the browser's count runs
  early; a redirect is a change of context the person did not ask for (3.2.5), cutting a screen reader off.
- **A same-page refusal at zero.** Two presses where one does, and the closed words said twice, once assertively.
- **Start again as a link to `/sign-in?reason=restarted`** (this decision's first form). It changes nothing, so the step
  the person chose to leave stays usable to its limit: at a shared computer, Back reopens the setup key, the code's
  challenge or key registration's grant, with which a passer-by could register their own key on a staff account. The
  next first step does clear it, but only if someone submits one.
- **A GET that ends the step** (a route handler at a link). A GET that changes state: Next prefetches a link in view,
  which would end a live step during its warning, and another site's top-level link (SameSite=Lax sends the cookie)
  could end someone's step.
- **A route handler for the POST.** The sign-in steps are server actions run through their routes (`runSignInStep`),
  which the registry test holds, and a server action works the same from the browser's form; a handler would add a
  path and a redirect of its own for one button.
- **A request key and an audit event on Start again.** It ends only the browser's own step, names no account, and
  changes no record: a step that closes at its limit writes none either.
- **A test knob for time.** A time override of a security limit in the production artifact; the server is tested on
  the injected clock it already has, the browser on Playwright's clock, and one end-to-end test waits the real 3
  minutes.
- **The marker as its own line** ("Step 1 of 2: choose a password" over "Choose a password"). It prints the step's name
  twice.
- **A count from the URL or the page.** The page cannot know the path, and a URL could be crafted to show a wrong
  count.

## Consequences

- The 3-to-5-minute window in which a dead step looked live is gone. The five-minute cookie of 0016 stays, as the outer
  bound, and a step closes at 3 minutes (15 for key registration).
- The limit a step states, the limit its warning counts to and the limit that applies are one number. UX PR 66 changes
  constants only, and the pin test makes infra and the constant move together.
- UX PR 7 reuses `StepTimer`, `StepHeading`, `advance` and the kept-email helpers, under D6's rule (written only after
  a secret is proven); a new `Pending` step must be given its lengths in `step-limits.ts` (the type check fails until it
  is).
- Two cookies are now cleared together wherever an attempt ends (`clearSignIn`). Any first-step submission ends the
  attempt before it, so the moment anyone else uses the form, the first person's kept address and live step are gone,
  and an unknown address and a wrong password write the same two deletions.
- At a shared computer, the next person who opens `/sign-in?reason=step_expired` or `?reason=restarted` within 18
  minutes of an abandoned step or a Start again (30 after key registration) sees the first person's address filled in;
  never a password, a code, a step or a session. Accepted: an address is a semi-public identifier, and the step pages already show it
  for the pending cookie's life.
- A rolling deploy may answer a Start again served by the new release from the old one, which knows neither its action
  nor `restarted`, and does not clear the kept email at a session; each is bounded by one deploy window and the
  cookie's own life.
- Start again ends the step server-side before the sign-in page renders; a step a person simply walks away from still
  stays usable until its limit, as before this decision.
- The SGN rows of the test matrix hold the behaviour, each file the rows it asserts: `step-limits.test.ts` (SGN-01,
  SGN-02), `dev-provider.test.ts` (SGN-01), `pending.test.ts` (SGN-01, SGN-03), the routes' database tests on an
  injected clock (SGN-01, SGN-03, SGN-04; Start again ending each step and giving the grant back), the sign-in flow's database test (SGN-04), the timer's unit tests (SGN-01,
  SGN-02) and browser-harness tests (SGN-02, and SGN-03 for the arrival focus), the notice's and heading's unit test
  (SGN-03, SGN-04), and `apps/web/e2e/sign-in-time.spec.ts` (SGN-01 to SGN-04), with four personas of its own, one of
  whose steps closes in real time.

## Not covered

- **Without JavaScript** the limit is stated and the email kept, but no warning comes, and so no Start again: the next
  press after the limit starts again.
- **The hardware-key sign-in step** (one ceremony of seconds) is enforced, not stated.
- **A lock reached during the warning** leaves the timer counting, outside its form; its words stay true (the step does
  close), and Start again leads to "Account locked" on the first step.
- **WCAG 2.2.1 in full** (D8); the 15-minute session (UX PR 66); the copy button and the QR code that make enrolment
  fit (UX PRs 20 and 86).

## Not verified here

- Whether Cognito restarts its 3 minutes on `AssociateSoftwareToken`'s session: there is no user pool in this lane.
  The start is taken before the first call, which is right either way.
- Cognito's own expiry: the dev provider is its twin, read from the same constant.
- Screen readers by hand (NVDA and JAWS with Chrome, VoiceOver with Safari on macOS and iOS): the announcements follow
  the ARIA the tests assert, and are listed for the manual checks of combined audit #103, with one more: the arrival
  notice heard once, after Start again and after a closed step's press.
- iOS Safari's timers in a background tab: the visibility rule covers the return. Whether a real iOS or Android
  keyboard leaves the sentence's cue in view is checked by hand there; the tests assert it at 390 by 500 px.

## Amendment: the forgotten password (UX PR 7, co-001/ux-sign-in-recovery, 2026-11-04)

- **A1. A reset is a timed sign-in step.** `/sign-in/forgot-password` requests a code by email (the provider's
  `requestPasswordReset`: Cognito `ForgotPassword`, the dev twin's mirror) and seals a `reset` step holding the typed
  address; the code and the new password go to `confirmPasswordReset` (`ConfirmForgotPassword`). The step's lengths are
  the code's hour and a 15-minute cookie, so it states and enforces 15 minutes and warns at two (D1-D5); Send a new
  code opens it again without typing, and "Use a different email" ends it at any time with the address not kept. Its
  warning and closed words are its own (`StepTimer`'s `words`), since nothing is kept before the code is proven. The
  code email states 15 minutes; the provider's hour is not shown. Any refusal of the confirm, a password-only one
  (mismatch, policy) included, empties the code with both passwords: the form empties every secret field on every
  refusal, one rule across the sign-in forms (WCAG 3.3.7's security exception), so no submitted code is left on a page
  that may be left unattended, and the code, still valid, is copied again from the email (review UXB-N3).
- **A2. Every address gets the same answer and the same timing class, and the app asks the provider for a code only
  for an account that already has a second factor (on the app's path; see Not covered).** The provider is asked only
  for an active account with `mfa_enrolled`; every other address (unknown, invited, a password set but no factor
  enrolled, disabled) does the same lookup and skips the send. Its
  account-only refusals are swallowed, and the request is padded to `RESET_REQUEST_FLOOR_MS` (1,500 ms) in a `finally`,
  so a thrown path answers at the floor too. Any other failure of the send or of the request's audit write (an
  `InternalErrorException`, a network failure) is logged as `password reset request failed` at error with
  `{ request_id, error_code }` only and answered `code_sent` like every other path, at the floor: only an account
  reaches either, so a 500 there would tell the accounts apart whenever the provider fails (review S-3). An outage is
  seen in that log, not by the person, whose notice already reads "If an account uses the address you typed".
  Every code problem is one refusal; the password policy is checked before
  the provider. The reset matches or exceeds the password step's enumeration resistance; it is not a platform-wide
  guarantee: the password step already discloses that an account exists and is locked (the locked refusal comes before
  the provider, and a wrong password writes `sign_in_failed` for a known account only), a known, accepted disclosure
  that predates UX-066.
- **A3. One rate limit.** Both actions count in the `sign_in` bucket by the address (the confirm's checked against the
  sealed one), so reset requests and sign-in attempts for an address share one 15-minute count; a flood of requests
  can hold a sign-in for that long, as wrong passwords can. The bound on code guessing is a rate, not a per-code
  count: about 64 to 80 guesses per account per hour with no end, in parallel across accounts, since a new request
  sends a new code; whether it voids the earlier one, and Cognito's per-code and per-request caps, are unverified.
- **A4. A wrong reset code is not a sign-in failure.** It counts toward no lock and writes no event: counting would mark
  real accounts by timing and let anyone lock an account. Sustained guessing shows instead as a run of
  `password_reset_requested` events for one user, and refused codes and the reset routes' rate-limit refusals log at
  warn with the request ID only. ADR 0088 D7 alarms on them per user (`password reset requested`, 5 or more in an hour,
  through a contributor rule keyed on the user ID) and runs the per-user query weekly
  (`docs/runbooks/incident-response.md`, "Weekly sign-in review").
- **A5. After a reset** every application session of the account ends (`revoke_user_sessions`, the user as actor,
  retried once), the provider signs the user out everywhere (a failure there is logged and does not fail the reset),
  the lock stays, and the second factor is asked at the next sign-in. The mailed code is the authorization; Postgres
  confines the actor-scoped transaction to the named user's own rows, and the request-time transaction holds only the
  audit insert. The kept
  email (D6) is written only now, with `use: 'chosen'`, and not for a locked or disabled account. Two reasons are
  appended: `password_reset` and `password_reset_locked`.
- **A6. Events.** `password_reset_requested` (purpose `unverified_request`, written for an account only) and
  `password_reset_completed` (`email_code`) are audit events with the user as actor. `record_security_event()` is
  callable by triggers only; making them `security_event` rows is a migration left to Lane A.
- **A7. The way forward on every step.** The sign-in help list, the lost-factor lines on the code and key steps, and the
  locked words name the support address (UX-066). A closed hardware-key step returns to the key surface
  (`KEY_RESTART`).
- **Alternatives considered:** a separate hour-long reset cookie (a second sealed state outside D1's tables, untimed,
  with no warning); the request deferred with `after()` or a job (errors unseen; the email in a payload); a lockout
  count on reset codes; unlocking on reset; a refusal split by cause; the confirm counted by its cookie; a code for
  every account (it lets a mailbox holder enrol their own factor on an account with none); a keyed hash of the email
  in logs for correlation (a stable pseudonym; the per-user audit trail does the job).
- **Not covered:**
  - the branded code email and a "password changed" email (Lane A, #42 files);
  - an invited person who lost the temporary password (their organization's administrator resends it);
  - a person who set a password but never enrolled a second factor cannot reset it, and Cognito's `RESEND` no longer
    works for a `CONFIRMED` user, so their administrator sends the invitation again, which opens seven new days in
    which they sign in with their own password and enrol (ADR 0088 D3); one who has forgotten that password goes to
    the founder's break-glass session (`docs/runbooks/support-mail.md`, "Sign-in help tickets"), since deleting the
    Cognito user and inviting again cannot complete for an existing account (ADR 0088, Not covered); a console factor
    reset (UX PR 65) must issue its own re-enrolment right (ADR 0088 D3);
  - second-factor and key resets (UX PRs 65 and 8): until UX PR 65 lands, lost-authenticator tickets are held at the
    desk with no resolution, and lost-key tickets until UX PR 8 or a key-reset path exists
    (`docs/runbooks/support-mail.md`, "Sign-in help tickets");
  - a sign-in begun with both factors less than 3 minutes before a reset (Cognito's auth session) can still open an
    app session after the revoke; a reset time checked against `auth_time` would close it (a migration, Lane A);
  - SEC-B1 holds on the app's path only until ADR 0088's second release makes the client confidential (D1). The
    pool's app client is public (`generateSecret: false`) and recovery is `EMAIL_ONLY`, so a caller who knows the
    client ID (an identifier: the environment, stack outputs, any ID token's `aud`) can call `ForgotPassword` and
    `ConfirmForgotPassword` directly. That goes past the gate, the `sign_in` limit and the `password_reset_*` audit,
    and it revokes no app session. The same client lets a caller run `InitiateAuth` directly, past the app's
    ten-failure lock. This was so on base 24531dc2, before this amendment. A Cognito `CONFIRMED` user with no factor
    could then be taken over through the app's own enrolment, which took the attacker's TOTP and, for staff, their
    key; ADR 0088 D3 closes that now: a factor is enrolled only inside a live invitation, on the account matched by
    both the enrolling Cognito subject and the email, so a code obtained that way and redeemed on the app's own
    confirm route (proposal P-2) no longer leads to an enrolment either. The `CustomMessage` trigger of proposal P-1
    was not built (ADR 0088, Alternatives considered).
- **Not verified here:** Cognito's attempt and request caps (the per-code cap on `ConfirmForgotPassword`, a
  `LimitExceededException` after some number of wrong codes, is what bounds guessing in production; the dev twin's
  five tries model it and are not evidence of it), its code's hour and replacement, its p99 for
  `ForgotPassword` against the floor, and whether `ConfirmForgotPassword` revokes tokens (both are revoked regardless):
  there is no user pool in this lane. The founder's pool smoke check includes one real `ForgotPassword` delivery,
  counts the wrong codes `ConfirmForgotPassword` takes before `LimitExceededException`, and reads the
  `password reset request timed` distribution. For combined audit #103's manual checks: the "Check your
  email" notice heard once (and again after Send a new code), the "Password changed" notice heard once, the help list
  read as a list.

## Amendment: the code email and every Cognito message (co-001/auth-emails, 2026-11-05)

Closes the forgotten-password amendment's "Not covered" item on the branded code email (the "password changed" email
it names goes to ADR 0091, below) and its "Revisit when" line "Lane A brands the code email".

- **B1. A CustomMessage trigger sets every message.** Without one, Cognito's forgot-password email shares the pool's
  verification template with every other code. The pool's CustomMessage trigger (`infra/lib/constructs/cognito-messages.ts`,
  made by `Identity`) now sets each source's subject and message. It runs the inline source that `@tp/auth-mail`
  (`packages/auth-mail`) renders from the same words the dev twin and the copy lint read, so the words exist once:
  Node 22 on arm64, 128 MB, 3 seconds (under Cognito's 5-second wait), no VPC, no SDK, no network, one environment
  variable (`APP_SIGN_IN_URL`), a role of its own that may write only its own log group (`/tp/<env>/cognito-messages`,
  no managed policy), invoked only by `cognito-idp.amazonaws.com` for this pool and this account. It refuses nothing,
  so it tells nothing about an account (unlike ADR 0088's rejected P-1 (a)). Infra takes its first workspace
  dependency for it; the alternative, a copy of the words in infra held equal by a test, would be two copies.
  - Rejected: a CustomEmailSender trigger. It would allow a multipart text and HTML body with SES tags, but it needs a
    KMS key and a KMS and an SES call per message inside Cognito's 5 seconds: a network dependency on the path of
    every code.
- **B2. The words of every source** (`packages/auth-mail/src/words.ts`; house voice, BRAND.md 1; none is legal text):
  the reset code's are the recovery design's section 2.5 word for word, with one sentence added after its 15 minutes
  ("Your PaidWhole code"; "Your code to choose a new PaidWhole password is {####}. Enter it on the page that sent it
  within 15 minutes. If you asked more than once, use the newest code. If you did not ask for it, ignore this email:
  your password is unchanged."). The added sentence is decision O-8 (Lane A's orchestrator as the brand owner's
  delegate, co-001/email-lockup-plate): it holds whether or not Cognito voids an earlier code when a second is asked
  for, which is not verified, so neither the email nor the reset page's warning says that a new request replaces
  the code. The invitation and its
  resend ("Your PaidWhole invitation") give Cognito's `{username}` once without saying what it is ("Your account is
  {username}. Sign in with the address this email came to and this temporary password:", since in an email-attribute
  pool it may be the internal name), the temporary password on its own line, the sign-in page as plain text and its 7
  days (`INVITATION_DAYS`), and an authenticator app (ADR 0088 D3's path). The attribute update and verification,
  sign-up, resend-code and sign-in-code sources have true words though only the first two can fire in this pool. The
  footer of every message: "PaidWhole never asks you to send your password or a code to anyone, by email, phone or
  chat: enter a code only on the PaidWhole page that asked for it." (It ends messages that themselves carry a code, so
  it says what never happens and where a code goes, not that PaidWhole never asks for one.) The 7 days, 15 minutes
  (the reset step, A1) and 3 minutes (the sign-in session) are held to `identity.ts` and `step-limits.ts` by tests.
  - The pool's own verification and invitation templates are the same frame's generic fallback ("Your PaidWhole code
    is {####}. Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your
    account changes."), since every code source shares the verification template: reset-specific words never go
    there.
- **B3. The frame.** The worker's mail frame without its header: text-first (each paragraph a `<p>`, so the HTML reads
  as the text does with its tags stripped), no remote asset (no image, font, stylesheet or `url(`), so no header art
  and, by BRAND.md 7, no wordmark typed in its place; the brand's colors from `tokens.ts`; every code in Plex Mono,
  whole on one line. No message has a link: the invitation names `https://<AppDomainName>/sign-in` as plain text, with
  no query and no fragment, and no code or address is ever in a URL. Phase 2's sender reads "PaidWhole
  <MailFromAddress>", as the worker's does. Nothing about the SES stream changes: Cognito's mail still goes through the
  transactional set untagged, under its suppression, bounce and probe rules (ADR 0065).
- **B4. Failure.** The handler writes Cognito's own `{####}` (and `{username}`) once each, through a replacer function.
  On any doubt (an unknown source, no request or response, a parameter that is not a placeholder, an invitation whose
  sign-in page is not `https://<host>/sign-in`, any thrown error) it returns the event unchanged, so Cognito sends the
  pool's branded fallback, and logs one line, `COGNITO_MESSAGE_FALLBACK` with a closed reason and the source only when
  it is a CustomMessage name. It never reads `request.userAttributes` and never logs the event. If the function cannot
  run, Cognito fails the call (`UnexpectedLambdaException`, `UserLambdaValidationException`,
  `InvalidLambdaResponseException`): the provider rethrows it, so a reset request answers "Check your email" at its
  floor and logs the failure, and an invitation fails in front of its administrator. The function's errors and
  throttles, and each fallback, alarm the operator (docs/runbooks/deliverability.md, 3.9). The fallback
  filter is a term (`"COGNITO_MESSAGE_FALLBACK"`), not a JSON selector: the runtime writes the line as text with a
  prefix. Only an active, enrolled account reaches Cognito and the trigger, so a reset request answered after its floor
  could tell an account from none by its timing: `password reset request over floor` is counted on the web log group
  (`PasswordResetRequestOverFloor`, beside ADR 0088 D7's filters) and alarms at 3 in 3600 s. On the first deploy the
  invoke permission is created just after the pool names the function (it names the pool's ARN), a window of seconds
  in which a code email fails as above.
- **B4a. The address cannot be swapped with a token.** The pool keeps the verified address in force until a new one is
  confirmed (`keepOriginal: { email: true }`), and the web client may write no attribute (`writeAttributes` empty):
  the app writes attributes only through Admin calls with server credentials, and answers `NEW_PASSWORD_REQUIRED` with
  the password alone. So a stolen access token can neither change the address at once nor lock its owner out of
  sign-in and reset. The attribute-update and verification words stay, unreachable from the app, as the other
  unreachable sources' do.
- **B5. The dev twin delivers what Cognito delivers.** The development provider's invitation and reset outboxes write
  each message's subject, text and HTML from `@tp/auth-mail`, and the e2e journeys read the temporary password and the
  reset code from the message's own words. SGN-13 to SGN-15.
- **Not covered:**
  - the "password changed" email. Its words (`passwordChangedLines`: when, as the screens write a time, that every
    session ended and the second factor still holds, and "write to <support address> from this address now"; no link and no
    "from where") and the worker template's `account` variant are built and tested here, and nothing sends them. Its
    kind is refused by `mail_send`'s CHECK constraints and no mail-sending role may read a user's address, so it needs
    a migration: an outbox row the database writes in the reset's own transaction (a trigger on `audit_event` for
    `password_reset_completed`), sent by a platform job on the transactional stream as kind `password_changed`.
    [ADR 0091](0091-tell-an-accounts-address-when-its-password-changes-from-an-outbox-the-database-writes-in-the-changes-own-transaction.md)
    sends it so, with SGN-16 (`co-001/password-changed-notice`), once the founder approves the domain model
    (CO-02). Not for the invitation's first password;
  - dark rules in email. A client that inverts colors made the worker's lockup PNG close to unreadable; the brand
    owner's delegate decided (O-5, co-001/email-lockup-plate) that the worker's lockup sits on a fixed White plate in
    every variant, not a reversed variant and not a dark rule. Since such a client inverts the plate's cells too, the
    plate's ground is the art's own pixels (review finding UX-S1): the email files are the 1200w art composited onto an
    opaque White rounded plate (`tools/brand-email-plate`, BRAND.md 7). The user pool's mail has no header (B3), so no
    plate;
  - the organization's name in the invitation.
- **Not verified here** (no user pool in this lane; the founder's pool smoke check, phase 2 on staging, with a
  synthetic account): that Cognito sends the trigger's message as an HTML-only body (the raw MIME `Content-Type`); that
  it accepts the display-name `From`; that a resend fires `CustomMessage_AdminCreateUser`; that it substitutes the
  parameters once and sends the pool's template when the response is unchanged; a real reset's cold start against the
  1,500 ms floor; that a forced fallback raises `CognitoMessageFallback` and its alarm; that
  CloudFormation accepts the client's empty `WriteAttributes` and a first sign-in (`NEW_PASSWORD_REQUIRED`) still
  completes with it (if it is refused, the list names every attribute but `email`); what the invitation's `{username}` becomes (the
  address or the pool's internal name; the words hold either way), in the trigger's message and the pool's own
  invitation template; a temporary password with `<` or `&` rendering whole (Cognito substitutes it raw into the HTML after
  the trigger returns); whether a first reset code still works after a second is requested (request two reset codes
  and confirm whether the first still works; the email's words and the reset page's warning hold either way); and
  Cognito's subject (140) and
  message (20,000) limits and CloudFormation's limit on an inline `ZipFile` (the source is 14.2 KB, 14,171 bytes; the
  tests cap it at 16 KiB), which are quoted from memory: AWS's documentation was not reachable from this session. If
  the inline limit binds, the source goes as `Code.fromAsset` of the same text. Outside the pool, for the worker's mail
  on staging: open a worker email in Gmail for iOS and in Outlook.com, both in dark mode, and confirm the lockup sits on
  White and is legible; and confirm that
  `https://<StaticDomainName>/brand/paidwhole-lockup-horizontal-tagline-email-plate-1380w.png` and, for a prospect's
  mail, `https://<StaticDomainName>/brand/paidwhole-lockup-horizontal-email-plate-1380w.png` each answer 200 with
  `Cross-Origin-Resource-Policy: cross-origin` (ADR 0058's first-deploy check, for the plated files). The renders of an
  inverting client were made for the review, outside the repository, and are not proof of these clients; the
  repository checks the art's pixels (`plateHolds`: the served PNG is opaque inside the rounded plate and White across
  the plate's padding; `tools/brand-email-plate` and `apps/web/e2e/brand.spec.ts`).

## Revisit when

- UX PR 66 lands: the constants, and the code step kept at 5 minutes by the app once Cognito allows 15.
- Cognito offers a way to refresh a sign-in session: then Extend, and 2.2.1 in full.
- UX PR 65 lands (the mfa line's second sentence).
- Lane A adds a security_event function. (The code email is branded: the code-email amendment.)
- ADR 0091's pull request lands: the password-changed email is sent.
- Cognito adds a CustomMessage source, or AWS changes the trigger's event: its words, or the fallback's reason codes.
- The floor's log shows runs over it, or the `password reset request timed` p99 nears the floor: raise it.
- ADR 0088's second release (the confidential client) reaches production: the Not covered bullet on the app's path
  goes.
- UX PR 65 lands: end live reset codes on a factor clear, or re-check the gate on confirm (P-2), with a refused account
  answered by the one code refusal at a wrong code's timing.
- UX PR 65 adds a console factor reset (it must issue its own re-enrolment right, ADR 0088 D3).
- Combined audit #103's manual checks report.
- UX PR 14's Notice replaces the region's look.
