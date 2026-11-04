# UX PR 7 design: Forgot your password, a way back in from the sign-in page

`co-001/ux-sign-in-recovery`, worktree `/home/user/ux-sign-in-recovery`, base df4daff7 (#92, UX PR 6, merged as
4eaf7124, is in the base). Written 2026-11-04 by acting S4 from three scouts (code, provider, copy; in the item's
scratch `sgn7/`). Line numbers are at df4daff7. Status file:
`/home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-status.md`.

**Review folded (2026-11-04).** A security review (SEC-B1, SEC-S1, SEC-N1 to N7) and a UX and brand review (UXR-01 to
UXR-13), each finding checked by a skeptic, are folded in: all 22 confirmed, none refuted. The record is
`designs/lane-b-ux-sign-in-recovery-review.md`; the scouts are in `designs/lane-b-ux-sign-in-recovery/scout-*.md`. The
two changes of substance: a code is sent only to an active account that has enrolled a second factor (SEC-B1, 4.2), and
phase 2 can always be left with "Use a different email" (UXR-01, 2.2). Finding IDs are cited where a section changed.

Corrections to the sources, taken throughout:
- The rate limiter is `apps/web/src/lib/http/rate-limit.ts` (`sign_in` at :39: 30 per client address per 5 minutes,
  20 per account per 15 minutes), not `lib/rate-limit.ts`.
- The locked words are `lib/routes/sign-in.ts:73` (`MESSAGES.locked`) and `app/sign-in/notice.tsx:18` (`REASONS.locked`).
- UX-006 (1) names `record_security_event()`. The web role cannot call it (`REVOKE ALL ... FROM PUBLIC`, no grant to
  tp_app; only triggers call it). The two events are audit events through `SignInFlow.audit()` (`lib/auth/sign-in.ts:97-99`),
  as `password_changed` is (:193). No migration (4.8).
- An unknown address has no actor, so it records nothing (the insert policy requires `actor_id = app_actor_id()`). The
  timing difference this makes is closed by the request floor (4.2).

No migration, no IAM change, no infra change. `ForgotPassword` and `ConfirmForgotPassword` are public client calls on a
client with no secret (`identity.ts:114`) and `preventUserExistenceErrors: true` (:115); the IAM pin test
(`infra/test/application-role.test.ts:18-22`) matches only `Admin*` commands and stays green.

---

## 1. Scope

**Closes**
- **UX-006 (C-005) part (1):** "Forgot your password?" on `/sign-in`. It is a reset by emailed code. It answers the same
  for every address, uses the `sign_in` bucket, records `password_reset_requested` and `password_reset_completed`, and
  still asks for the second factor afterwards.
- **UX-006 part (5):** the sign-in help line, as a list, with three departures reported (2.1).
- **UX-006 part (2), the line only:** the lost-factor line on `/sign-in/mfa` and `/sign-in/hardware-key`. Its second
  sentence describes UX PR 65's console reset, which does not exist yet, so it is held back (2.3).
- **UX-066 (C-075):** the locked words name the support address, in the refusal, the key page's `Problem` and the
  `?reason=locked` notice.
- **UXS-01 (left by #92):** a closed hardware-key step returns to the key surface (`KEY_RESTART`), not the password page.

**Leaves**
- UX PR 8 `ux-account-security`: part (4), the Sign-in and security page. It reuses this PR's provider calls.
- UX PR 65 `ux-second-factor-reset`: part (2)'s console reset, its `AdminSetUserMFAPreference` grant and email. It then
  appends part (2)'s second sentence to the mfa line.
- UX PR 67 `ux-header-menus`: the account menu link.
- UX PR 75 `ux-users-page`: part (3), the Locked badge.
- UX PR 64 `ux-sign-in-words`: replaces the `HardwareKeyRequirement` card. This PR keeps it in place, puts the forgot
  link directly below the sign-in card, above the `HardwareKeyRequirement` card, and the key link and help list after
  it, so PR 64 swaps only that card (UXR-03).
- UX PR 65 `ux-second-factor-reset` also inherits two notes from this PR: a console factor reset must clear
  `mfa_enrolled`, or the gap SEC-B1 closed reopens (4.2); and lost-authenticator tickets are held at the desk until it
  lands (runbook, 7; UXR-07). The PR body names that as a reason UX PR 65 matters.
- **Lane A or the founder:**
  - Branded words for Cognito's code email (`userVerification` in `identity.ts`, a #42 file). Proposed words are in 2.5.
  - A "your password was changed" email: a worker job carrying `user_id` only.
  - If wanted later, a migration that records the two events as `security_event` rows.

`components/hardware-key.tsx` is in the review's file list. It needs **no change**: the locked words arrive as the server's
error string, and the component follows any redirect (`:92-95`), so `KEY_RESTART` works unchanged. The PR body says so.

---

## 2. The flow and its words

House voice: sentence case, "we" on public pages, no "please", no contractions, ’ for apostrophes, "{instruction}:
{what follows}". Counts through `counted()`, lists through `listed()` (`lib/copy/words.ts`). Copy says "reset", never
"recover", "recovery" or "recovered" (`pnpm lint:copy` flags "recovered"); "recovery" stays in code names only. The
person's address is never in a URL, a notice's text, an error, a `mailto:` subject or body, or a log.

### 2.1 `/sign-in` (`app/sign-in/page.tsx`)

The sign-in card is unchanged, and so is the `HardwareKeyRequirement` card. In order (UXR-03):
1. Directly below the sign-in `</Card>` and above `<HardwareKeyRequirement />`, not inside `CardContent`: a link,
   **"Forgot your password?"**, to `/sign-in/forgot-password`. This is the conventional entry point, next to the
   password field it serves. The reason is reading order and what is visible after a refusal at 390 px, not Tab order:
   the alert holds nothing focusable, so Tab goes from Continue to the link either way.
2. The `HardwareKeyRequirement` card, unchanged.
3. The existing "Sign in with a hardware key" link.
4. A visually small heading 2, **"Help signing in"**, over a `<ul>` (`text-sm text-muted-foreground`, one item per
   question, links underlined):
   1. "Invited by your organization? Use the email and temporary password from your invitation."
   2. "Forgot your password? **Reset it by email**." The link goes to `/sign-in/forgot-password`. *(D-1)*
   3. "Lost your authenticator app? Write to **<support address>** from the address you sign in with." The address is a
      `mailto:` link, as `status/page.tsx:82` does it, with no subject or body. *(D-3)*
   4. "Lost a hardware key? Sign in with your second key. If you have none, write to **<support address>** from the
      address you sign in with." *(D-2; clause order UXR-10)*
   5. "New to PaidWhole? **Request an audit**." The link goes to `/request-audit`.
   6. "**Service status**". The link goes to `/status`.

Departures from the ruled words. The build takes them under the co-founder's delegation of 2026-10-25, and the PR body
reports them in one list:

| ID | Ruled | Taken | Why |
| --- | --- | --- | --- |
| D-1 | "Forgot your password? Use the link above." | "Forgot your password? Reset it by email." (the item is the link) | WCAG 1.3.3: "above" means nothing to a screen reader's links list |
| D-2 | "Lost a hardware key? Sign in with your second key." | adds "If you have none, write to <support address> from the address you sign in with." | Nobody can add a second key until UX PR 8. Without the addition the line leaves a one-key staff member with no next step (PRD :256). It promises no key reset |
| D-3 | "Lost your authenticator app? Write to <support address>." | adds "from the address you sign in with" | Part (2)'s own words. Support opens a ticket only from the account's address (`console/tickets/page.tsx:34`) |
| D-4 | `?reason=locked`: "...from this address..." | "...from the address you sign in with..." | That notice shows no address, so "this address" refers to nothing |

**Locked (UX-066).** `MESSAGES.locked` becomes `lockedMessage(supportEmail)`:
- The refusal summary on `/sign-in`, and the key page's `Problem` ("Account locked"), read: "This account was locked
  after ten failed attempts. Write to <support address> from this address to have it unlocked." The address is plain
  text, because the summary is a string; the help list holds the link.
- The `?reason=locked` notice uses D-4's words.
- No locked string ever offers the reset as a way to unlock: a reset does not lift the lock (4.6).

**New reasons**, appended to `SIGN_IN_REASONS` (:41-54) and `REASONS` after `restarted`, with nothing reshaped:
- **`password_reset`.** An `ArrivalNotice`, focused once. Its words are chosen by whether an email is kept, as
  `wordsOf` does for the restart reasons (UXR-09).
  - Title: "Password changed".
  - Text, email kept (UXR-08): "Your password is changed, and every session of this account has ended. Your email is
    filled in: sign in with your new password and the code from your authenticator app. If you sign in with a hardware
    key, use it as before."
  - Text, no email kept (a disabled account, which SEC-B1 makes reachable only if the status changed between request
    and confirm): "Your password is changed, and every session of this account has ended. Sign in with your new
    password and the code from your authenticator app. If you sign in with a hardware key, use it as before."
- **`password_reset_locked`.** An `ArrivalNotice` with no email kept (a lock ends the kept email, ADR 0081 D6).
  - Title: "Password changed".
  - Text: "Your password is changed, and every session of this account has ended. This account is locked after ten
    failed attempts: write to <support address> from the address you sign in with to have it unlocked." (UXR-13 d)
  - Only someone who proved the mailbox reaches it, so it enumerates nothing.

`signInPage` (:257-269) reads the kept email for `password_reset` as well as `step_expired` and `restarted`. It returns
`supportEmail` (`services.supportEmail`, `services.ts:81`).

### 2.2 `/sign-in/forgot-password` (new page)

The page has two phases, chosen by the server from the sealed `tp_sign_in`:
- No live `reset` step: phase 1, the request.
- A live `reset` step: phase 2, the code and the new password.

Its page reasons are `code_sent` and `step_expired`, each tied to its phase (UXR-12): `code_sent` renders only in
phase 2 and `step_expired` only in phase 1, and a reason in the other phase is ignored (a Back or a bookmark to
`?reason=code_sent` after the step closed shows a plain phase 1). Metadata title: "Reset your password". The page uses the sign-in
layout (Paper ground, stacked lockup, nothing else decorative), with `StepHeading setup={null}`.

**Phase 1, the request**

| State | Words and behaviour |
| --- | --- |
| Empty | H1 "Reset your password". Card title "Your email" (UXR-13 a: not a second "Email" above the field's label). Description: "Enter the email you sign in with. If it has an account, we send it a code for choosing a new password. Invited and not signed in yet? Use the temporary password from your invitation instead." (UXR-13 b, UXR-06) Field "Email" (`type="email"`, `autoComplete="username"`, required). Submit "Send code". Below the card, a link "Back to sign in" |
| Pending | ux-forms D5: "Working…", with the button `aria-disabled` |
| Malformed email | The ux-forms summary "Check the fields marked below." with "Email: enter an email address". The email is kept (ADR 0077, #74) |
| Rate limited | "Too many attempts in a short time. Wait {minutes} and try again." (`lib/http/next.ts:60`). It is counted on the typed address, so it reads the same whether or not the address has an account |
| Out of date, CSRF or connection | ux-forms D10's words |
| `?reason=step_expired` | An `ArrivalNotice`: "That step closed. Enter your email for a new code." The email is not filled (4.5) |
| Sent | The same for every address: a redirect to `?reason=code_sent`, phase 2 |

**Phase 2, the code and the new password**

| State | Words and behaviour |
| --- | --- |
| Arrival (`code_sent`) | An `ArrivalNotice`, focused once, `role="note"`, keyed by the sealed step's `startedAt` so that a successful Send a new code mounts it afresh and it takes the focus again (UXR-05). Title "Check your email". Text: "If an account uses the address you typed, we sent it a six-digit code. It can take a few minutes: check your spam folder too." (UXR-11) The address is never in the notice |
| Default | H1 "Choose a new password". Card title: the address this browser typed, from the sealed step, as `/sign-in/mfa` shows it, with `[overflow-wrap:anywhere]` so a long address wraps at 390 px (UXR-13 c). Description: "Enter the code from the email, then choose a new password." The limit sentence comes from `StepTimer`: "This step stays open for 15 minutes." Fields, all labelled with hints tied by `aria-describedby`: "Six-digit code" (`inputMode="numeric"`, `autoComplete="one-time-code"`, hint "Six digits from the email. Spaces are fine."); "New password" (`PasswordField`, Show, `autoComplete="new-password"`, hint from `PASSWORD_MIN_LENGTH` as on `new-password/page.tsx:35`); "New password again". A hidden `email` input with `autoComplete="username"` holds the address. Submit "Save password" |
| Below the form | A heading-free short list, "No email?", the same for every address (UXR-06): "Check your spam folder." / "Typed the wrong address: **Use a different email**." / "Invited by your organization and not finished setting up: use the temporary password from your invitation, or ask your organization’s administrator to send a new invitation." / "Still nothing: **Send a new code**." The two bold items are the two controls below the list, not links |
| Send a new code | An `ActionForm` (`variant="outline"`, submit "Send a new code", the hidden email) on `resetRequestStep`, keyed by the step's `startedAt` (UXR-05). Same answer, bucket and floor as phase 1. Its `RefusalSummary` sits above its button and takes the focus: rate limited shows the counted wait with the step still live; out of date, CSRF and connection use ux-forms D10's words. "Working…" shows through the 1,500 ms floor. Success redirects to `?reason=code_sent`, and the keyed notice takes the focus. It keeps the address |
| Use a different email | A POST button (`variant="outline"`) in its own form, visible in every timer phase (UXR-01), bound to `useDifferentEmailStep`: it runs `restartSignIn`, which ends the step and clears the cookie, and redirects to a plain phase 1 with the Email field **empty**. Nothing is prefilled: the typed address is unproven and never kept (ADR 0081 D6, `KEEPS_EMAIL.reset = false`, 4.5) |
| Back to sign in | Below the card, a POST button styled as a link, bound to `backToSignInStep`: it runs `restartSignIn` and redirects to `/sign-in` (no reason, no kept email). A plain link would leave the step live, so "Forgot your password?" would land on phase 2 again (UXR-01) |
| StepTimer | The reset page passes `restart={null}`, so the status shows no Start again of its own (no second button doing what Use a different email does), and `words` (UXR-02, below). Its title and limit sentence are unchanged |
| Pending | "Working…" |
| Any code refusal (wrong, expired, used, replaced, too many tries, unknown address) | One refusal: summary "That did not match.", with the issue on Six-digit code: "the code did not match, or it has expired: check it, or send a new code". The code and both passwords are emptied, with ux-forms' note. The refusal is never split by cause, because splitting would enumerate (4.4) |
| Password rules | "Choose a stronger password.", with `passwordIssue` on New password (`routes/sign-in.ts:112-114`). It is checked before the provider is called |
| Passwords differ | The issue on New password again: "the two passwords do not match: type the same password in both fields" (:354) |
| Warning (`words.warning`) | Replaces `StepTimer`'s default sentence, which is false here ("your email is kept"): "If you need more time, send a new code below: it replaces the code already sent, and the step opens again for 15 minutes." (UXR-02) |
| Closed (`words.closed`) | "Send a new code below to continue, or use a different email." The title already says the step has closed. Send a new code still works at zero, since the hidden email needs no typing |
| Done | A redirect to `/sign-in?reason=password_reset`, or `password_reset_locked` when the account is locked (2.1) |

Who gets no code, with the same "Check your email": an unknown address; an invited person (Cognito
`FORCE_CHANGE_PASSWORD`); a person who set a password but never enrolled a second factor; a disabled account (SEC-B1,
4.2). The "No email?" list and phase 1's sentence tell the invited cases what to do on this page; every address sees
them, so they enumerate nothing.

**`StepTimer` change (UXR-01, UXR-02).** `components/step-timer.tsx` (not a watched path) gains two props:
- `words?: { readonly warning: string; readonly closed: string }`, which **replaces** `spokenWords`' default sentence.
  When it is set, `notes` is not used.
- `restart` becomes `((form: FormData) => void | Promise<void>) | null`. `null` leaves out the Start again form and its
  pending row; the status still speaks its title and words.

The password, MFA and register-key steps pass neither change and keep their words; their tests are unchanged.

### 2.3 Lost-factor lines

Each line sits below the card, outside `StepTimer`, in `text-sm text-muted-foreground`.
- **`/sign-in/mfa`:** "Lost your authenticator app? Write to **<support address>** from the address you sign in with."
  `mfaPage` (:389-400) returns `supportEmail`.
- **`/sign-in/hardware-key`:** "Lost your hardware key? Sign in with your second key. If you have none, write to
  **<support address>** from the address you sign in with." (UXR-10) It sits above today's "No key registered yet? ..." line.
  `hardwareKeyPage` (:417-424) returns `supportEmail`.

UX PR 65 appends "A platform administrator checks with your organization’s administrator, resets your two-step
verification, and you set it up again at your next sign-in." when the console reset exists.

### 2.4 UXS-01

- `KEY_RESTART = { redirect: '/sign-in/hardware-key?reason=step_expired' }` sits beside `RESTART` (:249).
- `verifyHardwareKey` (:478-479) returns `KEY_RESTART` when no live `key` step remains.
- `settle`'s `expired` branch (:185-188) returns `KEY_RESTART` when `from?.step === 'key'`.
- The page already says "That sign-in step closed. Start again with your hardware key." (`notice.tsx:31`), focused once.

There are no copy changes for UXS-01.

### 2.5 The code email (Cognito's, not this PR's words)

Cognito sends the code with its default template, which is unbranded. Proposed words for Lane A, to go into
`identity.ts`'s `userVerification` in a #42-side change:
- Subject: "Your PaidWhole code"
- Body (UXR-04): "Your code to choose a new PaidWhole password is {####}. Enter it on the page that sent it within 15
  minutes. If you did not ask for it, ignore this email: your password is unchanged."

The page closes the step at 15 minutes and a new request replaces the code, so the email promises 15 minutes; the
provider's hour (3600 s) stays in the ADR (A1, "Not verified here") and `step-limits.ts`, never in words a user sees.
The dev twin's outbox message uses these words, so the e2e reads the code the same way Lane A's template will deliver it.
For Lane A: unless a CustomMessage trigger is set, Cognito's forgot-password email uses the pool's shared verification
template, so reset-specific words in `userVerification` must be checked against the other verification messages.

---

## 3. Provider interface and implementations

### 3.1 `lib/auth/provider.ts`

Add after `resendInvitation` (:90):

```ts
/** Sends a reset code if the address names a user who can reset. Resolves the same for every address. */
requestPasswordReset(email: string): Promise<void>;
/** Sets a new password with the mailed code. Every code problem is one 'rejected'. */
confirmPasswordReset(email: string, code: string, password: string): Promise<PasswordResetResult>;

export type PasswordResetResult =
  | { readonly kind: 'reset' }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'invalid_password'; readonly problems: readonly PasswordProblem[] };
```

Neither name starts with `Admin`.

### 3.2 Cognito (`cognito-provider.ts`)

- `ForgotPasswordCommand({ ClientId, Username: email })`. There is no `SecretHash` and no `UserContextData` (the
  Essentials plan ignores it).
- `ConfirmForgotPasswordCommand({ ClientId, Username: email, ConfirmationCode: code, Password })`. Call
  `passwordProblems(password)` first, as `setNewPassword` does (:201-204). On problems, return `invalid_password`
  without calling Cognito.

| Call | Error (`error.name`) | Mapped to | Why |
| --- | --- | --- | --- |
| ForgotPassword | none | resolve | `CodeDeliveryDetails.Destination` is never read, shown or logged |
| ForgotPassword | `UserNotFoundException`, `NotAuthorizedException` (invited or disabled in Cognito), `InvalidParameterException` (no verified email), `LimitExceededException`, `CodeDeliveryFailureException`, `TooManyRequestsException` | resolve, after `logger.warn('password reset request not delivered', { error_code, request_id })` | Each happens only for real accounts, or is a quota; showing any of them enumerates |
| ForgotPassword | anything else (`InternalErrorException`, `ResourceNotFoundException`, network) | rethrow; the flow catches it, logs `password reset request failed` at error with `{ request_id, error_code }` only, and answers `code_sent` at the floor (S-3, session ruling 2026-11-04) | Our failure. SEC-B1 sends only for an active, enrolled account, so a 500 here would tell accounts apart during an outage; the log is where an outage shows. The notice already reads "If an account uses the address you typed" |
| ConfirmForgotPassword | none | `reset` | Returns no tokens and no session |
| ConfirmForgotPassword | `CodeMismatchException`, `ExpiredCodeException`, `LimitExceededException`, `TooManyFailedAttemptsException`, `UserNotFoundException`, `NotAuthorizedException` | `rejected` | An unknown user gets a mismatch or an expiry. A limit only ever reaches a real account, so it must not differ |
| ConfirmForgotPassword | `InvalidPasswordException` | `invalid_password` with problems `[]` | As :208-211. It is unreachable while the pinned policy matches `passwordProblems` |
| ConfirmForgotPassword | anything else | rethrow | |

Logs carry `error_code` (`error.name`) and IDs only, never `error.message`.

The flow calls `requestPasswordReset` only for an active, enrolled account (SEC-B1, 4.2), so Cognito's simulated answer
for an unknown user is no longer on the path. The swallowing in row 2 stays: the app and Cognito can disagree (an
account disabled in Cognito only, an unverified email), and showing such a refusal would enumerate. Row 2's swallowing
can also hide a pool-wide misconfiguration, where every request says "Check your email" and no mail arrives (SEC-N6):
Lane A is asked for a log-metric alarm on `password reset request not delivered` by `error_code`, and the founder's pool
smoke check includes one real `ForgotPassword` delivery ("Not verified here", 5).

### 3.3 Dev twin (`dev-provider.ts`, `dev-store.ts`, `server/services.ts`)

**`DevUserRecord`** gains optional fields, so existing stores and the seed still load:
```ts
reset?: { codeHash: string; expiresAt: number; attempts: number }
```

**`requestPasswordReset`**
- It always does the same work: draws a code with `crypto.randomInt(0, 1_000_000)`, zero-padded to six digits, and
  hashes it (`sealer.sign('dev-reset', code)`).
- It stores and delivers the code only for a known record with `temporary !== true`. That mirrors the simulated success
  for an unknown address and Cognito's silent refusal of invited users. The flow's gate (4.2) already keeps a
  not-enrolled record from reaching it; the twin's own guard is kept as a second line (SEC-B1).
- A new request replaces the code. `expiresAt` is now plus `PASSWORD_RESET_CODE_SECONDS` (3600, in `step-limits.ts`).

**`confirmPasswordReset`**
- It checks `passwordProblems` first.
- It returns the one answer `rejected` for any of these: an unknown email, no code, a wrong code, an expired code, a
  used code, or attempts at `DEV_RESET_ATTEMPTS` (5).
- It compares the code's hash with `crypto.timingSafeEqual` on equal-length buffers (SEC-N4).
- A wrong code increments `attempts`. At the cap the code is invalidated.
- On success, inside `store.update`, it sets `passwordHash` (scrypt, `this.cost`) and deletes `reset`. It keeps
  `totpSecret`, `totpLastStep`, `credentials` and `temporary: false`, so the next sign-in still asks for the code or key.

**Delivery** is a new **optional** option, `deliverResetCode?(email, code)`. It defaults to a no-op, so about 35 test
constructors stay unchanged. `services.ts` wires it to a `devResetOutbox` that writes
`<auth dir>/reset-outbox/<ts>-<uuid>.json` with `{ email, code }`, mode 0600.
- It is a sibling directory, not inside `outbox/`, because `e2e/onboarding.spec.ts:41-52` reads every entry there as an
  invitation.
- The world and page-services test harnesses pass a capture where a test needs the code.
- It holds synthetic accounts only.

The dev `globalSignOut` stays a no-op, so the provider sign-out is proven by a spy in `sign-in.db.test` (6.1, SEC-N4),
not by the e2e.

---

## 4. Security

### 4.1 Shape and protections

Both actions are server actions run through registered public routes (`runSignInStep`, `publicRoute`):
- `sign_in.reset_request`, input `{ email: emailAddress }`.
- `sign_in.reset_confirm`, input `{ email: emailAddress, code: sixDigitCode, password, confirm }`, with the `refine` from
  :352-354.

Each gets a Zod schema, the origin check (`invoke.ts:382`, which is the CSRF defence along with Next's server-action
origin check and SameSite=Lax cookies), the `sign_in` rate limit, and its audit events. The page is POST-only: no GET
changes state, and "Send a new code", "Use a different email" and "Back to sign in" are POST buttons. The two leave
actions (`useDifferentEmailStep`, `backToSignInStep` in `app/sign-in/actions.ts`) run the existing `restartSignIn` route
and redirect by their own destination, as `restartStep` does (`actions.ts:29-32`), so no new route is registered for
them.

**Authorization and practice scope (SEC-N3).** There is no role and no practice scope: the person is unauthenticated,
and no tenant table is touched. **The provider's code check is the authorization.** Postgres does not independently
prove a code was checked: the handler sets `app.actor_id` to the named account (`withActor(pool, user_id)` after
`sign_in_account(email)`), so `revoke_user_sessions()`' `target_user = app_actor_id()` and the audit insert policy are
met by construction. What Postgres does is confine an actor-scoped transaction to that user's own rows. So the
request-time transaction holds the audit insert alone and never calls `revokeUserSessions`, and a db test asserts that a
request changes no `user_session` row. Middleware decides nothing.

### 4.2 Enumeration and timing (request)

For every address, the request does the same steps:
1. Parse, check the origin, and apply the rate limit.
2. Look up `sign_in_account(email)`. The row carries `status` and `mfa_enrolled` (`sign-in.ts:62-67`).
3. **Send only to an account that can safely reset (SEC-B1):** call `provider.requestPasswordReset(email)` only when the
   account exists with `status = 'active'` and `mfa_enrolled = true`. Every other path (unknown, invited, set a password
   but never enrolled, disabled) does the same lookup, skips the send, and is padded by the same floor. A locked active
   enrolled account still gets a code (R-4).
4. Write the audit event `password_reset_requested`, for an account only (4.8), whether or not a code was sent.
5. Seal a `reset` step with the typed email.
6. Redirect to `?reason=code_sent`.

*Why the gate.* A person who was invited, answered `NEW_PASSWORD_REQUIRED` and stopped at TOTP enrolment is a Cognito
`CONFIRMED` user with a verified email (`cognito-provider.ts:332`) and no factor, while the app row is still `invited`
and `mfa_enrolled = false` (set true only in `record_sign_in_with_mfa`, `tenancy_hardening.sql:491`), and the dev twin's
`temporary` is already false (`dev-provider.ts:145`). Cognito would deliver a code; `start()` admits an `invited`
account inside its 7 days (`sign-in.ts:171-176`); the pool answers `MFA_SETUP` for a user with no factor. So someone in
that mailbox could reset, enrol their own authenticator, and, for an internal user, go on to `register_key` with their
own key. "MFA is still required after a reset" holds only for an account that already has a factor, so only such an
account gets a code.

Every address gets the same status, cookies, redirect and words. **The handler is padded to a floor (SEC-N2):**
- `RESET_REQUEST_FLOOR_MS = 1500`, measured from entry on the flow's injected `now()`, sleeps the remainder through an
  injected `sleep()` (defaults: `Date.now`, `setTimeout`).
- The floor is applied in a `finally` around steps 2-5, so the sleep runs before a return **and** before a rethrow. A
  failed send or audit write, which only real accounts reach, is caught, logged `password reset request failed` at
  error with `{ request_id, error_code }`, and answered `code_sent` like every other path (S-3); only a failed lookup,
  which every address makes, still rethrows. The sleep runs after every pool
  client is released, so a padded request holds no connection.
- The floor covers the lookup, the audit transaction, the skipped or real send, and swallowed errors.
- Every run logs `password reset request timed` at info with `{ request_id, elapsed_ms }` (`elapsed_ms` is allowlisted,
  `observability/fields.ts:62`), so the distribution is visible, not just the overruns. A run over the floor also logs
  `password reset request over floor` at warn with the same fields, so operations can raise the constant. Neither log
  carries an address or an account.

Rejected alternatives:
- Next's `after()`: provider errors become invisible, and it cannot be tested through `invoke`.
- A job: the payload would carry the email, which is forbidden.

### 4.3 Rate limit

Both actions use `sign_in` with `rateAccount: (input) => input.email`. The confirm takes its email from the hidden field,
and the handler checks it equals the sealed step's email; a mismatch is the code refusal, with no provider call. Keying
the confirm by the cookie (`pendingAccount`) is rejected, because each new request would mint a fresh count.

The effect:
- **Code guessing is bounded as a rate, not per code (SEC-S1).** Reset requests and code guesses share 20 hits per
  account per 15 minutes (`lib/http/rate-limit.ts:39-41`), plus 30 per client address per 5 minutes, which many
  addresses avoid. A new request replaces the code, so rotating codes resets any per-code cap; with a 5-try cap (the
  dev twin's) a round is 1 request and 5 guesses. That is about 64 to 80 guesses per account per hour, with no end, in
  parallel across accounts, against 10^6 codes: roughly 1,500 to 1,900 a day per account. Cognito's per-code and
  per-request caps are unverified. A hit changes the victim's password and ends their sessions; the second factor still
  blocks entry (SEC-B1 makes that true for every account that gets a code).
- **Detection.** `password_reset_requested` is written per real account, with the user as actor, on every request, so
  sustained guessing shows as a run of those events for one user (one per 5 or so guesses). The owed check (Lane A): an
  alarm or a weekly-security-review query on `password_reset_requested` per `user_id` per day above a stated threshold,
  such as 10. It is keyed by `user_id`, so no email or email hash goes in a log. If wanted later, a migration makes these
  `security_event` rows (R-8).
- **Logs.** Every `rejected` confirm logs `password reset code refused` at warn with `{ request_id, error_code }`, and the
  reset routes' rate-limit refusals log `password reset rate limited` at warn with `{ request_id }` (in the reset route
  wrappers, as `restartSignIn` wraps its route; `invoke.ts` is not changed). Both cost the same for every address, so they
  add no timing class. No keyed hash of the email (`rateSubjectHash`) goes in a log: it is a stable pseudonym of an
  address, and the per-user audit trail already gives the correlation.
- Mail volume is bounded by the same account count and, beneath it, Cognito's per-user throttle (swallowed).
- The WAF's sign-in rule covers `/sign-in/*` (`edge.ts:62`), so the page stays under `/sign-in/`.
- Accepted, and stated in the ADR: reset requests and sign-in attempts for one address share one 15-minute count, so a
  flood of requests can hold a victim's sign-in for up to 15 minutes, as wrong passwords already can.

### 4.4 Codes and attempts (confirm)

- The password policy is checked before the provider for every address.
- All code problems are one refusal (3.2), so unknown and known addresses, and wrong, expired and limited codes, cannot
  be told apart.
- **A wrong reset code is not a sign-in failure.** It does not call `sign_in_failed`, does not count toward the
  ten-failure lock, and writes no audit event. Counting would add a database write for known accounts only (a timing
  class) and would let anyone lock a victim with ten wrong codes. The rate in 4.3 bounds guessing instead, and the
  request events and warn logs there make it visible. A refused code does no account lookup.
- The success path differs in timing. Only the holder of the mailed code reaches it.

### 4.5 The pending step and the kept email

The reset is a new `Pending` step: `{ step: 'reset', email }`, with `startedAt` as ADR 0081 D2 adds it. Its lengths in
`step-limits.ts`:
- `PROVIDER_SECONDS.reset = PASSWORD_RESET_CODE_SECONDS` (3600).
- `COOKIE_SECONDS.reset = RESET_COOKIE_SECONDS` (900).
- So `stepSeconds` is 15 minutes, and the warning comes 2 minutes before the end.

The cookie carries only the typed address and a start. It holds no Cognito session. 15 minutes rather than the code's hour
is the safer bound at a shared computer, and Send a new code opens the step again without typing, so the shorter limit
costs one press.

The forced changes, all made:
- `STEP_PAGES.reset = '/sign-in/forgot-password'`.
- `setupOf` gets `case 'reset': return undefined`.
- The dev `Step` type.
- `abandon` gets a no-op case.
- `restartSignIn` returns `/sign-in/forgot-password` for a `reset` step (as its outcome; the reset page's own actions,
  `useDifferentEmailStep` and `backToSignInStep`, then redirect to the forgot page and to `/sign-in`, since a form
  action's `redirect` decides where the browser goes, 4.1). Its `abandon` for `reset` is a no-op, and it clears the
  cookie on every path, rate-limited included (`routes/sign-in.ts:320-329`).
- `settle`'s `expired` from `reset` goes to `/sign-in/forgot-password?reason=step_expired`.

**Kept email.** `settle`'s kept-email write (:160) becomes an exhaustive `KEEPS_EMAIL: Record<StepName, boolean>`, with
`key` and `reset` set false, so any later step must choose. The reset's typed address is unproven, so it is **never
kept** until `ConfirmForgotPassword` succeeds (ADR 0081 D6). After that it is written with `use: 'chosen'`, and not at
all for a locked or disabled account, where D6 ends it.

### 4.6 After a reset (`SignInFlow.confirmPasswordReset`)

1. `provider.confirmPasswordReset`. On `rejected` or `invalid_password`, return the refusal.
2. On `reset`, look up `sign_in_account(email)`. With an account, one `withActor(pool, user_id)` transaction does two
   things:
   - `revokeUserSessions(scope, user_id)`, which ends every open `user_session` (`revoked`). A thief's session dies on
     its next request.
   - The audit event `password_reset_completed`.
3. `provider.globalSignOut(cognito_sub)`, which is `AdminUserGlobalSignOut` and already granted. It revokes any live
   Cognito tokens (the precedent is `settings.ts:1085-1089`). **Its failure is caught (SEC-N1):** log
   `security event: password reset provider sign-out failed` at error with `{ user_id, request_id, error_code }` and go
   on to step 5. The app sessions are already ended and the app keeps no Cognito tokens (grants are released at sign-in,
   `sign-in.ts:154`), so the person's outcome does not depend on this call, and they are told the reset worked rather
   than shown a 500 with a spent code.
4. `logger.warn('security event: password reset completed', { user_id, request_id })`. It is not added to the infra
   burst alarm list.
5. Clear the pending step. A locked account goes to `password_reset_locked`; any other account goes to `password_reset`,
   with the email kept unless the account is disabled, and the notice's words follow whether it was kept (2.1, UXR-09).

**Not done:**
- **No unlock.** A reset proves the mailbox, not the second factor. Unlocking would give a mailbox thief ten more code
  guesses per reset. The lock stays the platform administrator's (`unlock_user`).
- **No change to MFA.** The next sign-in goes through `start()` (:163-181), so it refuses a locked account before the
  provider and then asks for the code or key (Cognito pool `mfa: REQUIRED`; the dev twin keeps TOTP and keys). This holds
  because only an active account with an enrolled factor ever gets a code (4.2, SEC-B1); an account with no factor would
  be offered enrolment instead, which is why it gets none.
- **No reset time on the user row (SEC-N5).** Someone who holds the old password and the second factor and began a
  sign-in less than 3 minutes before the reset (`authSessionValidity`, `identity.ts:14`) can answer the challenge after
  the revoke and open a fresh app session (`authenticated()` opens one with no reset-time check, `sign-in.ts:154-155`).
  Accepted and stated in the ADR's "Not covered": the window is 3 minutes and needs both factors. A later fix is a reset
  time on the user row that `authenticated()` checks against `auth_time` (a migration, Lane A).

If step 2's transaction fails after Cognito accepted the reset, then (R-3):
- Retry the transaction once.
- If the retry fails too, log `security event: password reset sessions not ended` at error level with
  `{ user_id, request_id }`, still call step 3 (with its own catch), and return the generic "Sign-in could not continue.
  Start again." So live sessions survive only a double failure.

### 4.7 Logging and PHI

- No log, URL, error, job payload or `mailto:` ever carries the email, the code, the new password, the masked
  `Destination`, Cognito's `error.message` or the cookie value.
- Logs use the allowlisted fields: `user_id`, `request_id`, `error_code`, `elapsed_ms`. `pnpm lint:logs` applies.
- Page reasons in the URL are closed codes.
- The support address is PaidWhole's, not PHI, so it may sit in strings.

### 4.8 Audit events

Both events go through `SignInFlow.audit(user_id, action, request_id, purpose)`, with `objectType: 'user'`. The purpose
must match `^[a-z][a-z0-9_]{0,63}$`.
- **`password_reset_requested`**, purpose `unverified_request`. The actor is the account *named*, not a proven person,
  and the purpose says so. It is written whenever an account exists, whether or not a code was sent (4.2); an unknown
  address has no actor and records nothing, and the floor hides that. It is also the per-user signal for sustained code
  guessing (4.3, SEC-S1).
- **`password_reset_completed`**, purpose `email_code`. It is written in the revoke transaction.

The ADR records that these are `audit_event` rows, not `security_event` rows, and why.

---

## 5. ADR 0081 amendment

The amendment is appended as a section `## Amendment: the forgotten password (UX PR 7, co-001/ux-sign-in-recovery,
2026-11-04)`, before "Revisit when". The status line's promise (:8-9) is kept, and the PRD and matrix list gains SGN-05
to SGN-08. The section text:

> - **A1. A reset is a timed sign-in step.** `/sign-in/forgot-password` requests a code by email (the provider's
>   `requestPasswordReset`: Cognito `ForgotPassword`, the dev twin's mirror) and seals a `reset` step holding the typed
>   address; the code and the new password go to `confirmPasswordReset` (`ConfirmForgotPassword`). The step's lengths are
>   the code's hour and a 15-minute cookie, so it states and enforces 15 minutes and warns at two (D1-D5); Send a new
>   code opens it again without typing, and "Use a different email" ends it at any time with the address not kept. Its
>   warning and closed words are its own (`StepTimer`'s `words`), since nothing is kept before the code is proven. The
>   code email states 15 minutes; the provider's hour is not shown.
> - **A2. Every address gets the same answer and the same timing class, and a code goes only to an account that already
>   has a second factor.** The provider is asked only for an active account with `mfa_enrolled`; every other address
>   (unknown, invited, a password set but no factor enrolled, disabled) does the same lookup and skips the send. Its
>   account-only refusals are swallowed, and the request is padded to `RESET_REQUEST_FLOOR_MS` (1,500 ms) in a `finally`,
>   so a thrown path answers at the floor too. Every code problem is one refusal; the password policy is checked before
>   the provider. The reset matches or exceeds the password step's enumeration resistance; it is not a platform-wide
>   guarantee: the password step already discloses that an account exists and is locked (the locked refusal comes before
>   the provider, and a wrong password writes `sign_in_failed` for a known account only), a known, accepted disclosure
>   that predates UX-066.
> - **A3. One rate limit.** Both actions count in the `sign_in` bucket by the address (the confirm's checked against the
>   sealed one), so reset requests and sign-in attempts for an address share one 15-minute count; a flood of requests
>   can hold a sign-in for that long, as wrong passwords can. The bound on code guessing is a rate, not a per-code
>   count: about 64 to 80 guesses per account per hour with no end, in parallel across accounts, since a new request
>   replaces the code; Cognito's per-code and per-request caps are unverified.
> - **A4. A wrong reset code is not a sign-in failure.** It counts toward no lock and writes no event: counting would mark
>   real accounts by timing and let anyone lock an account. Sustained guessing shows instead as a run of
>   `password_reset_requested` events for one user, and refused codes and the reset routes' rate-limit refusals log at
>   warn with the request ID only. An alarm or weekly-security-review query on those events per user per day is owed
>   (Lane A).
> - **A5. After a reset** every application session of the account ends (`revoke_user_sessions`, the user as actor,
>   retried once), the provider signs the user out everywhere (a failure there is logged and does not fail the reset),
>   the lock stays, and the second factor is asked at the next sign-in. The mailed code is the authorization; Postgres
>   confines the actor-scoped transaction to the named user's own rows, and the request-time transaction holds only the
>   audit insert. The kept
>   email (D6) is written only now, with `use: 'chosen'`, and not for a locked or disabled account. Two reasons are
>   appended: `password_reset` and `password_reset_locked`.
> - **A6. Events.** `password_reset_requested` (purpose `unverified_request`, written for an account only) and
>   `password_reset_completed` (`email_code`) are audit events with the user as actor. `record_security_event()` is
>   callable by triggers only; making them `security_event` rows is a migration left to Lane A.
> - **A7. The way forward on every step.** The sign-in help list, the lost-factor lines on the code and key steps, and the
>   locked words name the support address (UX-066). A closed hardware-key step returns to the key surface
>   (`KEY_RESTART`).
> - **Alternatives considered:** a separate hour-long reset cookie (a second sealed state outside D1's tables, untimed,
>   with no warning); the request deferred with `after()` or a job (errors unseen; the email in a payload); a lockout
>   count on reset codes; unlocking on reset; a refusal split by cause; the confirm counted by its cookie; a code for
>   every account (it lets a mailbox holder enrol their own factor on an account with none); a keyed hash of the email
>   in logs for correlation (a stable pseudonym; the per-user audit trail does the job).
> - **Not covered:**
>   - the branded code email and a "password changed" email (Lane A, #42 files);
>   - an invited person who lost the temporary password (their organization's administrator resends it);
>   - a person who set a password but never enrolled a second factor cannot reset it, and Cognito's `RESEND` no longer
>     works for a `CONFIRMED` user, so their administrator removes and re-invites them; a console factor reset (UX PR 65)
>     must clear `mfa_enrolled`, or this gap reopens;
>   - second-factor and key resets (UX PRs 65 and 8): until UX PR 65 lands, lost-authenticator tickets are held at the
>     desk with no resolution, and lost-key tickets until UX PR 8 or a key-reset path exists
>     (`docs/runbooks/support-mail.md`, "Sign-in help tickets");
>   - a sign-in begun with both factors less than 3 minutes before a reset (Cognito's auth session) can still open an
>     app session after the revoke; a reset time checked against `auth_time` would close it (a migration, Lane A);
>   - an alarm on `password reset request not delivered` by `error_code`, and the per-user query on
>     `password_reset_requested` (A4), are owed by Lane A.
> - **Not verified here:** Cognito's attempt and request caps, its code's hour and replacement, its p99 for
>   `ForgotPassword` against the floor, and whether `ConfirmForgotPassword` revokes tokens (both are revoked regardless):
>   there is no user pool in this lane. The founder's pool smoke check includes one real `ForgotPassword` delivery and
>   reads the `password reset request timed` distribution. For combined audit #103's manual checks: the "Check your
>   email" notice heard once (and again after Send a new code), the "Password changed" notice heard once, the help list
>   read as a list.

"Revisit when" swaps "UX PR 7 amends this decision" for:
- "UX PR 65 lands (the mfa line's second sentence)."
- "Lane A brands the code email or adds a security_event function."
- "The floor's log shows runs over it."
- "UX PR 65 adds a console factor reset (it must clear `mfa_enrolled`)."

---

## 6. Tests

Each test is written failing-first in its slice (7).

### 6.1 Unit and database

**`dev-provider.test.ts`:**
- A code for a known active record, delivered once and stored hashed.
- No code and no error for an unknown or invited record.
- A not-enrolled record (password set through `setNewPassword`, no TOTP): the twin's own guard sends a code, so the
  flow's gate is what stops it; this test pins the twin's behaviour and the flow tests below pin the gate (SEC-B1).
- A new request replaces the code.
- The code compare uses `timingSafeEqual` (a spy, or a length-mismatch case that does not throw) (SEC-N4).
- A used, expired (`PASSWORD_RESET_CODE_SECONDS`) or capped code is `rejected`.
- Policy problems come back before the code is checked.
- Success keeps TOTP and credentials.

**`cognito-provider.test.ts`:**
- The exact command inputs, with no `SecretHash`.
- Every row of 3.2's mapping.
- `Destination` is never in a log.
- `invalid_password` returns without sending a command.

**`step-limits.test.ts`:** `stepSeconds('reset') = 900` and `warningSeconds = 120`.

**`sign-in-routes.db.test.ts`** (models: the enumeration test :460-489, lockout :233, key options :291):
- The request for a known, unknown, invited, not-enrolled (password set, no TOTP), disabled and locked address gives the
  same redirect, the same cookies written and deleted, and the same data. All resolve at the floor on the injected
  clock. A throwing provider and a throwing audit insert each get the unknown address's answer, cookies, floor and page,
  with one `password reset request failed` error line of IDs only (S-3).
- A code is delivered only for the active enrolled and the locked active enrolled address; none for unknown, invited,
  not-enrolled or disabled (SEC-B1).
- A rejected confirm logs `password reset code refused` with neither the address nor the code; a rate-limited reset
  request logs `password reset rate limited` with the request ID only (SEC-S1).
- A request changes no `user_session` row (SEC-N3).
- A rate-limited Send a new code from phase 2 shows the counted wait on phase 2 with the step still live (UXR-05).
- `useDifferentEmailStep` and `backToSignInStep` on a reset step clear the cookie and redirect to
  `/sign-in/forgot-password` and `/sign-in` (UXR-01).
- The request counts in `sign_in` by the address, shared with password attempts.
- The confirm: a wrong, expired, reused or capped code, an unknown address and a tampered hidden email all give one
  refusal. The tampered email makes no provider call.
- A wrong code calls no `sign_in_failed`.
- A weak password puts its issue on New password.
- Success gives `password_reset` with the email kept, and the account's sessions revoked. A locked account gives
  `password_reset_locked` with no kept email. The next sign-in asks for the code.
- The reset step never writes `tp_sign_in_email`.
- The restart and an expired step land on the forgot page.
- The locked words carry the support address, in the action error and in the key options.
- UXS-01: :287's expectation becomes `KEY_RESTART`, and a provider-`expired` key step also gives `KEY_RESTART`.

**`sign-in.db.test.ts`:**
- `password_reset_requested:unverified_request` and `password_reset_completed:email_code`.
- No event for an unknown address.
- The lock is untouched, and `revoke_user_sessions` ran.
- A spy on `provider.globalSignOut` sees one call with the account's `cognito_sub` after the revoke commits, and none on
  `rejected` (SEC-N4). A `globalSignOut` that throws still lands on `password_reset` and logs the sign-out failure
  (SEC-N1). A revoke transaction that fails once is retried and succeeds (R-3).

**`notice.test.tsx`:**
- `locked` with the address (D-4 words).
- `password_reset` (with and without a kept email, UXR-09) and `password_reset_locked`, each an `ArrivalNotice`.
- The forgot page's `code_sent` and `step_expired`, each only in its own phase and ignored in the other (UXR-12).
- The "No email?" list and phase 1's invitation sentence are the same for every address (SGN-05's sameness, UXR-06).

**`step-timer.test.tsx`** (UXR-02): with `words` set, the warning and closed status say only those words, with no
default sentence and no note; with `restart={null}`, no Start again form and no pending row render. The existing cases
are unchanged.

**`registry.test.ts`** passes once the routes are registered.

### 6.2 Browser, e2e, axe and copy

**`e2e/sign-in.spec.ts`:** "a forgotten password is reset and the second factor is still asked". The steps: request,
read the code from `reset-outbox/`, set a new password, land on `/sign-in` with the email filled and the notice focused,
sign in with the new password, and get asked for the code. The old password is refused. The URL never holds the email.
A second case: reach phase 2 in the open phase, press Use a different email, land on phase 1 with an empty Email field,
and reload `/sign-in/forgot-password` to find phase 1 still (no live step) (UXR-01). A third: a successful Send a new
code focuses the "Check your email" notice again (UXR-05).

**`e2e/sign-in-time.spec.ts`:**
- axe (WCAG 2.1 A and AA, at 1280 and 390, no sideways scroll), next to :221-243, on:
  - the forgot page's phase 1 (empty and refused);
  - phase 2 (default, refused, warning shown and closed, on Playwright's clock), at 390 px with one 60-character
    synthetic address so the card title is seen to wrap (UXR-13 c);
  - `/sign-in` with the help list and with `password_reset`;
  - `/sign-in/mfa` and `/sign-in/hardware-key` with their lines.
- A stale key step reached by the flow lands on the key page (UXS-01).

**Other files:**
- `e2e/font-hosts.spec.ts:17`: add `/sign-in/forgot-password`.
- `scripts/synthetic-personas.ts:157-164`: a `reset` persona of its own, separate from `lockout`, because it spends the
  `sign_in` account count.
- Copy: `pnpm lint:copy`, `pnpm lint:logs`, `pnpm typecheck`, `pnpm lint`.

### 6.3 Test-matrix rows

These go word for word in `docs/product/test-matrix.md` (after SGN-04) and `packages/synth/src/cases/matrix.ts:625-648`,
as four no-file entries of module 19 (`fixtures.test.ts:33` checks they match). The section intro's "reserved for the
seventh" becomes "are the seventh's (a forgotten password)".

| ID | Case | Assertion |
| --- | --- | --- |
| SGN-05 | A reset is asked for alike for every address | `/sign-in/forgot-password` sends a known, an unknown, an invited, a not-enrolled (password set, no second factor), a disabled and a locked address to the same "Check your email" with the same status, cookies, words and help text; a code is sent only to an active account with an enrolled second factor (locked included), and the provider's refusals for real accounts are answered as success; the request takes at least its 1,500 ms floor on every path, a thrown one included; it counts in the `sign_in` bucket by the typed address, shared with password attempts, and its refusal reads alike; `password_reset_requested` is recorded for an account and nothing for an unknown address; the address is in no URL, notice, error or log, and the code's masked destination is never shown |
| SGN-06 | The code and the new password | The code step is a sealed sign-in step that states 15 minutes, warns at two in its own words and closes at its limit; the policy is checked before the provider; a wrong, expired, used, replaced or over-tried code and an unknown address get one refusal on the code field, with the code and both passwords emptied; a wrong code counts no failure and locks nothing; the confirm counts in `sign_in` by the sealed address and a changed address is refused without the provider; Send a new code opens the step again without typing and shows its own refusals, and Use a different email ends it at any time, with the address not kept; the dev twin holds the code hashed, for an hour, single use, five tries |
| SGN-07 | After a reset the second factor is still asked | A reset ends every session of the account and signs it out at the provider (a provider sign-out failure is logged and does not fail the reset), records `password_reset_completed`, keeps the lock, the authenticator and the keys, and lands on the sign-in page with the email filled and a notice focused once, written only now (never for a locked or disabled account, whose notice names the support address); the next sign-in with the new password asks for the code, and the old password is refused |
| SGN-08 | Every sign-in step has a way forward | The sign-in page lists help as a list with a reset link that names itself, the code and key steps say where to write about a lost factor from the address one signs in with, the locked words name the support address in the refusal, the key page and the notice, and a closed hardware-key step returns to the key page; the reset page in both phases, the sign-in page, the code step and the key step pass axe (WCAG 2.1 A and AA) at 1280 and 390 px |

---

## 7. Files and slices

These land in order. The first item under each slice is its failing-first test.

**Slice A: UXS-01 and UX-066**
- Test: `sign-in-routes.db.test.ts` (:287 changed to `KEY_RESTART`; the locked error carries `support@synthetic.test`),
  and `notice.test.tsx` (locked).
- Code:
  - `lib/routes/sign-in.ts`: `KEY_RESTART`, `settle` `expired`, `lockedMessage`, `supportEmail` in the page data.
  - `app/sign-in/notice.tsx`: the `supportEmail` prop and the locked words.

**Slice B: provider**
- Test: `dev-provider.test.ts` and `cognito-provider.test.ts`.
- Code:
  - `lib/auth/provider.ts`, `cognito-provider.ts`, `dev-provider.ts` and `dev-store.ts`.
  - `lib/auth/step-limits.ts`: `PASSWORD_RESET_CODE_SECONDS` and `RESET_COOKIE_SECONDS`.
  - `lib/server/services.ts`: `devResetOutbox`.
  - The `world.ts` and `page-services.ts` captures.

**Slice C: flow and routes**
- Test: `step-limits.test.ts`, `sign-in.db.test.ts` and `sign-in-routes.db.test.ts` (enumeration, floor, bucket,
  confirm, after-reset).
- Code:
  - `lib/auth/sign-in.ts`: the `reset` step, `requestPasswordReset`, `confirmPasswordReset`, the `now` and `sleep`
    deps, `abandon`.
  - `step-limits.ts`: the tables.
  - `lib/routes/sign-in.ts`: the reasons, `STEP_PAGES`, `setupOf`, `KEEPS_EMAIL`, the restart redirect, the
    `forgotPasswordPage`, `resetRequest` and `resetConfirm` routes, and `SIGN_IN_ROUTES`.
  - `app/sign-in/actions.ts`: `resetRequestStep`, `resetConfirmStep`, `useDifferentEmailStep`, `backToSignInStep`.
  - The reset route wrappers' rate-limit warn log (4.3).

**Slice D: pages and words**
- Test: `notice.test.tsx` (the new reasons), `components/step-timer.test.tsx` (`words`, `restart={null}`) and the e2e
  reset journey.
- Code:
  - `components/step-timer.tsx`: the `words` prop and a nullable `restart` (UXR-01, UXR-02; not a watched path).
  - `app/sign-in/forgot-password/page.tsx` (new): the two phases, the "No email?" list, Send a new code as an
    `ActionForm`, Use a different email, Back to sign in.
  - `app/sign-in/page.tsx`: the link and the help list.
  - `mfa/page.tsx` and `hardware-key/page.tsx`: the lines.
  - `notice.tsx`: the reasons and the forgot surface.

**Slice E: docs and the rest of the tests**
- The ADR 0081 amendment (5).
- `docs/runbooks/support-mail.md`: a "Sign-in help tickets" section (UXR-07; not a watched path, checked against
  `tools/screening-capacity/watched-paths.txt`). Working from ticket and user IDs only, never message text:
  - (a) Locked: check with the organization's administrator that the request is genuine, then Unlock in the console
    (`/console/organizations/<id>`), which writes its own audit event. A password reset never lifts the lock.
  - (b) Lost authenticator: no reset exists yet. Tell the person it is not yet possible from the console and that we
    will write when it is; promise no date. Record the ticket ID so UX PR 65 can work through those tickets.
  - (c) Lost hardware key with no second key: no administrator path (Cognito passkeys), and re-inviting is refused for
    an accepted invitation (`settings.ts:1124`, `console-onboarding.ts:202`), so escalate the ticket ID to the founder.
    Not described as a re-invitation.
  - (d) Never act on mail from an address that is not the account's own (already refused as `unknown_sender`).
  - (e) A person who set a password but never enrolled a factor and cannot reset (SEC-B1): their organization's
    administrator removes and re-invites them.
- `test-matrix.md` and `matrix.ts` (6.3).
- The axe cases in `sign-in-time.spec.ts`, `font-hosts.spec.ts` and the persona.
- Then `pnpm test`, `pnpm test:db`, `pnpm test:e2e`, `pnpm lint:copy`, `pnpm lint:logs`, `pnpm typecheck` and
  `pnpm lint`.

The PR body is filled from `.github/pull_request_template.md`. Its contents:
- The D-1 to D-4 list.
- What the PR leaves to others (1), including why UX PR 65 matters: lost-authenticator tickets are held at the desk
  until it lands, and it must clear `mfa_enrolled` (UXR-07, SEC-B1).
- The findings folded from the design reviews, by ID, with a pointer to the review record.
- `hardware-key.tsx` unchanged, and why.
- The review screens. Before is `TOUR_REF=df4daff7`; new ids are recorded as skipped "a 404 on this ref", and
  `sign-in-hardware-key.key-step-closed`'s before is the password page.
- The tour steps needed on `claude/build-ops`: a reset persona, reading the reset outbox, `toStepPhase` for the warning
  and closed states, and a shared clock.

The size is about 700 lines with tests, above the review's 380, because of the forced `Pending` changes, the floor, the
`StepTimer` props and the phase 2 controls.

---

## 8. Screening capacity

The PR touches watched paths:
- `apps/web/src/lib/auth/{provider,cognito-provider,dev-provider,dev-store,sign-in,step-limits}.ts`
- `apps/web/src/lib/routes/sign-in.ts`
- `apps/web/src/lib/server/services.ts`
- `packages/synth/src/cases/matrix.ts`

It does not touch `lib/http/rate-limit.ts` (no new bucket) or `lib/http/invoke.ts`. The review's additions,
`components/step-timer.tsx` and `docs/runbooks/support-mail.md`, are not in `tools/screening-capacity/watched-paths.txt`. On the private repository's 2-CPU runner the gate stops with
RUNNER_TOO_SMALL, so **the merge waits on the founder's runner decision (#102)**. Design, build, reviews and
verification proceed. No watched file is avoided at the cost of the design.

---

## 9. Risks and open questions

Each item has a recommended answer, chosen as the safer option.

- **R-1. The floor is too low for real Cognito.** Timing would separate a real send from a skipped one.
  *Recommended:* 1,500 ms, in a `finally`, with the per-run `elapsed_ms` log and the over-floor log (4.2, SEC-N2). The founder's pool smoke check measures it before launch, and
  the ADR lists it under "Not verified here".
- **R-2. Shared count lets a flood hold a victim's sign-in for 15 minutes.** *Recommended:* accept it and state it
  (A3). A new bucket edits a #42 file and only moves the problem.
- **R-3. Cognito resets the password but the revoke transaction fails.** *Recommended:* retry the transaction once; if
  that fails, still sign out at the provider, log at error level with IDs, and answer the generic failure (SEC-N1).
  A provider sign-out failure on its own is logged and does not fail the reset. The person signs in with the new password, and an
  operator sees the log. A retry queue would need a job carrying `user_id`; leave it as a follow-up if the log ever
  fires.
- **R-4. A locked account still gets a code.** *Recommended:* yes, for a locked account that is active and enrolled.
  Skipping is safe from timing for any account, because the floor covers it (4.2, which now skips the send for every
  account without a factor); the reason to send is the person: the reset completes, the lock stays, and they are told
  how to unlock (`password_reset_locked`).
- **R-5. An invited person, or one who set a password but never enrolled, gets "Check your email" and no code.**
  *Recommended:* accept it. The forgot page itself says what to do: phase 1's sentence and phase 2's "No email?" list
  name the temporary password and the organization's administrator, and every address sees them (UXR-06). Resending
  an invitation stays with the administrator (`settings.users.resend_invitation`, `console.resend_invitation`), never a
  public page: it changes a temporary password the administrator may have shared.
- **R-6. The request event names an unproven actor.** *Recommended:* the `unverified_request` purpose, and the ADR
  says so.
- **R-7. The 15-minute step is shorter than the code's hour.** *Recommended:* keep 15 minutes. It is the safer bound at
  a shared computer, and Send a new code reopens the step without typing.
- **R-8. The `security_event` rows UX-006 asked for.** *Recommended:* audit events now. Lane A adds a function later if
  the weekly security review needs them in that table.
- **R-9. "Send a new code" and "Use a different email" both below the form.** *Recommended:* both, with distinct
  roles, visible in every timer phase: Send a new code (an `ActionForm` with its own refusals) keeps the address, and
  Use a different email ends the step at any time with the address not kept. `StepTimer`'s own Start again is left out
  on this step (`restart={null}`), so no two buttons do the same thing (UXR-01, UXR-02, UXR-05).
- **R-10. The unbranded Cognito email.** *Recommended:* ship with it. The words in 2.5 go to Lane A, and the page
  promises no wording of the email.
- **R-11. The per-user detection query is owed, not built (SEC-S1).** *Recommended:* ship with the events and warn logs,
  and ask Lane A for the alarm or weekly-review query on `password_reset_requested` per `user_id` per day (threshold
  about 10) and the `password reset request not delivered` alarm (SEC-N6). Neither blocks the merge.
