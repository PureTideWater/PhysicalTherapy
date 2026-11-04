# Review: co-001/ux-sign-in-recovery design (UX PR 7)

Two adversarial reviews of `designs/lane-b-ux-sign-in-recovery.md`, against the code at df4daff7 in
`/home/user/ux-sign-in-recovery`: a security review (SEC-) and a UX and brand review (UXR-). A skeptic checked each
finding against the design and the code. 2026-11-04, acting S4 (Lane A's account). The scouts the design was written
from are in `designs/lane-b-ux-sign-in-recovery/scout-{code,copy,provider}.md`.

**Result:** 22 findings, all confirmed, none refuted. 2 blocking (SEC-B1, UXR-01), 7 should-fix (SEC-S1, UXR-02 to
UXR-07), 13 nits. All 22 are folded into the design. Where the skeptic gave a corrected fix, the corrected fix is the
one taken. Where two corrected fixes pulled against each other (UXR-01, UXR-02, UXR-06 on which control ends the step),
the reconciliation is stated under each finding.

## Blocking

### SEC-B1. A reset lets a mailbox holder enrol their own second factor on an account that set its password but never enrolled one
- **Verdict:** real. Confirmed in the code: `dev-provider.ts:145` sets `temporary:false` before enrolment; the app row
  stays `invited`, `mfa_enrolled` false until `record_sign_in_with_mfa` (`tenancy_hardening.sql:491`); `start()` admits
  an invited account inside 7 days (`sign-in.ts:171-176`); Cognito delivers to a `CONFIRMED` user with a verified email
  (`cognito-provider.ts:332`) and the pool answers `MFA_SETUP` for a user with no factor (`identity.ts:78`). An internal
  user would go on to `register_key` with the attacker's key.
- **Taken as proposed.** 4.2 step 3: `provider.requestPasswordReset` only for `status = 'active'` and
  `mfa_enrolled = true`; every other path does the same lookup, skips the send, and is padded by the floor. The twin's
  `temporary` guard stays (3.3). 4.6 "No change to MFA" now says why it holds. 4.8: the request event is written for any
  account, sent or not. Tests: a not-enrolled case in `dev-provider.test`, `sign-in-routes.db.test` (same answer, no code)
  and SGN-05's address list. ADR: A2 restated, "Not covered" names the non-enrolled person (administrator removes and
  re-invites; `RESEND` fails for `CONFIRMED`), alternatives list "a code for every account". Note to UX PR 65 (clear
  `mfa_enrolled` on a console factor reset) in 1, "Not covered", "Revisit when" and the PR body. R-4 reconciled as the
  skeptic asked: the floor makes skipping safe for any account; locked enrolled accounts get a code for the person's
  sake, not for timing. 2.2 and R-5 list who gets no code.

### UXR-01. Phase 2 has no way to change a mistyped address
- **Verdict:** real. `step-timer.tsx:209-227` renders Start again only while `said !== null` (warning or closed), so for
  about 13 minutes phase 2 has no control that ends the step, and "Forgot your password?" lands on phase 2 again.
- **Taken with the corrected fix.** 2.2: "Use a different email", a POST button visible in every timer phase, bound to a
  new `useDifferentEmailStep` that runs `restartSignIn` and redirects to a plain phase 1 with the Email field empty (no
  prefill, keeping ADR 0081 D6 and `KEEPS_EMAIL.reset = false`). StepTimer's own Start again is left out on this step
  (`restart={null}`, 2.2 "StepTimer change"), so no two buttons do the same thing. "Back to sign in" below the phase 2
  card is a POST (`backToSignInStep`) that ends the step and goes to `/sign-in`. 4.1 and 4.5: both actions redirect by
  their own destination, as `restartStep` does (`actions.ts:29-32`), so `restartSignIn` needs no new route. R-9 amended.
  Tests: the e2e (press Use a different email, empty field, reload stays on phase 1), a db test of both actions clearing
  the cookie and redirecting, SGN-06's clause "Use a different email ends it at any time, with the address not kept".
  - *Fold note:* the design had said `restartSignIn` redirects a reset step to the forgot page; in the code the action
    layer redirects (`restartStep` always to `RESTARTED`), so 4.5 now says the route's outcome names the forgot page and
    the reset page's own actions decide the redirect.

## Should fix

### SEC-S1. Sustained code guessing is weakly visible, and the stated bound is per code rather than over time
- **Verdict:** real in part. The bound is a rate (codes rotate); detection is weak, not absent, because
  `password_reset_requested` is written per real account on every request.
- **Taken with the corrected fix.** 4.3 and A3 restate the bound as about 64 to 80 guesses per account per hour with no
  end, in parallel; "under 100 guesses in a code's hour" is removed. 4.3 "Detection" and A4 name the per-user signal and
  the owed Lane A alarm or weekly-review query (per `user_id` per day, threshold about 10). Warn logs: `password reset
  code refused` `{ request_id, error_code }` and `password reset rate limited` `{ request_id }`, in the reset route
  wrappers (not `invoke.ts`). No `rateSubjectHash(email)` in logs. A test that a rejected confirm logs neither address
  nor code. R-11 added. 4.4 keeps no lock and no lookup on a refused code.

### UXR-02. StepTimer cannot say the reset step's warning and closed words, and its button contradicts them
- **Verdict:** real. `spokenWords` appends `notes` after its fixed "your email is kept" sentence; nothing replaces it.
- **Taken with the corrected fix, reconciled with UXR-01.** `step-timer.tsx` and its test join slice D and the file
  list. `StepTimerProps.words` replaces the default sentence (`notes` unused when set). Warning: "If you need more time,
  send a new code below: it replaces the code already sent, and the step opens again for 15 minutes." Closed: "Send a new
  code below to continue, or use a different email." (the skeptic's "or start again to use a different email" becomes
  "or use a different email", since UXR-01 makes that the control on screen and removes StepTimer's Start again on this
  step). Send a new code stays below the form, not inside the status. 2.2 rows name `words`. Unit test: with `words`, no
  default sentence and no note; existing steps unchanged.

### UXR-03. "Forgot your password?" sits below the staff card
- **Verdict:** real; the Tab-order part is overstated (the alert holds nothing focusable).
- **Taken with the corrected fix.** 2.1 item 1: directly after the sign-in `</Card>`, before `<HardwareKeyRequirement />`,
  not inside `CardContent`. The key link and the help list stay after the alert. 1 "Leaves" reworded; PR 64 still swaps
  one element. The rationale names reading order and visibility, not Tab.

### UXR-04. The code email said "one hour"; the page closes at 15 minutes
- **Verdict:** real.
- **Taken as proposed.** 2.5 body: "Enter it on the page that sent it within 15 minutes." The dev outbox and the e2e
  match; the hour stays only in the ADR and `step-limits.ts`. Lane A's side note (Cognito's shared verification template
  without a CustomMessage trigger) is recorded in 2.5.

### UXR-05. Send a new code had nowhere to show its refusals or pending state
- **Verdict:** real; the "notice focused again" part needed more than a redirect.
- **Taken with the corrected fix.** 2.2 "Send a new code" row: an outline `ActionForm` on `resetRequestStep` with the
  hidden email, its `RefusalSummary` above the button, D10's words, "Working…" through the floor. The `ArrivalNotice`
  and the form are keyed by the step's `startedAt` so a successful resend remounts the notice and it takes the focus.
  Tests: a rate-limited resend keeps phase 2 live with the counted wait; the browser shows the refocused notice.

### UXR-06. "No email?" led only to resending
- **Verdict:** real; the original fix cited UXR-01's control before it was adopted.
- **Taken with the corrected fix, reconciled with UXR-01.** Since UXR-01 is adopted, the list's wrong-address item names
  "Use a different email" (the skeptic's text named Start again, which this step no longer shows). The list, the same for
  every address: spam folder; wrong address, Use a different email; invited and not finished setting up, the temporary
  password or a new invitation from the administrator (covering SEC-B1's not-enrolled person too); still nothing, Send a
  new code. No third control. Phase 1's description gains "Invited and not signed in yet? Use the temporary password
  from your invitation instead." The code_sent notice is unchanged. "Phase 1 never says anything about invitations" is
  removed; R-5 rewritten. A test that the help text is the same for known, unknown and invited addresses.

### UXR-07. The lost-factor lines lead to tickets the desk cannot resolve
- **Verdict:** real, small.
- **Taken with the corrected fix.** A "Sign-in help tickets" section in the existing `docs/runbooks/support-mail.md`
  (slice E): locked (check with the organization's administrator, Unlock in the console), lost authenticator (not yet
  possible, no date promised, ticket ID recorded for UX PR 65), lost key with no second key (escalate to the founder; not
  a re-invitation), never act on another address's mail, plus SEC-B1's not-enrolled case. ADR "Not covered" and the PR
  body say tickets are held until UX PRs 65 and 8. Page words unchanged. `docs/runbooks` checked: not a watched path.

## Nits (all taken)

| ID | Finding | How the design takes it |
| --- | --- | --- |
| SEC-N1 | A `globalSignOut` failure after a reset was unspecified | 4.6 step 3 catches it, logs at error with `{ user_id, request_id, error_code }`, continues; R-3 retries the revoke once; db test |
| SEC-N2 | The floor must cover thrown paths and record its distribution | 4.2: floor in a `finally`, sleep after pool clients are released, `password reset request timed` at info on every run; db test with a throwing audit write |
| SEC-N3 | "Postgres checks its own part" overstated | 4.1 and A5 reworded: the code check is the authorization, Postgres confines the actor-scoped transaction; request transaction is audit-only; db test that a request changes no `user_session` |
| SEC-N4 | Dev code check and provider sign-out need tests | `timingSafeEqual` in the twin (3.3); a `globalSignOut` spy in `sign-in.db.test` (6.1) |
| SEC-N5 | An in-flight Cognito auth session can open a session after the revoke | Accepted, 4.6 and ADR "Not covered" (3 minutes, both factors); a reset time on the user row named as the later fix (Lane A) |
| SEC-N6 | Swallowed ForgotPassword errors can hide a pool-wide outage | 3.2 keeps the swallowing; Lane A alarm asked; one real delivery in the founder's smoke check ("Not verified here") |
| SEC-N7 | The password step already discloses existence and lock | A2 states the reset matches or exceeds the password step's resistance and names the accepted disclosure |
| UXR-08 | "then your code or hardware key" describes no real flow | 2.1 `password_reset` text: "...with your new password and the code from your authenticator app. If you sign in with a hardware key, use it as before." |
| UXR-09 | "Your email is filled in" for a disabled account | 2.1: words chosen by whether an email is kept; 4.6 step 5; notice test both ways |
| UXR-10 | Hardware-key line's clause order | 2.1 item 4, 2.3 and D-2: "Sign in with your second key. If you have none, write to <support address> from the address you sign in with." |
| UXR-11 | "this address" before any address is heard | code_sent text: "If an account uses the address you typed, ..." |
| UXR-12 | Page reasons not tied to their phase | 2.2: `code_sent` only in phase 2, `step_expired` only in phase 1, otherwise ignored; notice tests |
| UXR-13 | Small words and layout | (a) phase 1 card title "Your email"; (b) "we send it a code for choosing a new password"; (c) `[overflow-wrap:anywhere]` on the address title and a 60-character synthetic address in the 390 px axe case; (d) "This account is locked after ten failed attempts" in `password_reset_locked` |

## Left open for a person

None blocks the build. Recorded in the design's section 9:
- R-11 (SEC-S1, SEC-N6): Lane A owes the per-user `password_reset_requested` alarm or weekly-review query and the
  not-delivered alarm. Recommended: ship without them, ask Lane A.
- The merge still waits on the founder's runner decision (#102), as before the review.
