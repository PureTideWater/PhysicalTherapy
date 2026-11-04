# UX PR 7 (sign-in recovery): code scout at df4daff7

Worktree `/home/user/ux-sign-in-recovery`. All paths are repo-relative unless absolute. Line numbers are at df4daff7.
Two corrections to the sources: the rate limiter is `apps/web/src/lib/http/rate-limit.ts` (not `lib/rate-limit.ts`),
with `sign_in` at :39. The locked words in `notice.tsx` are at :18 (the review cited :17 on an older commit).

## 1. The sign-in flow end to end

### 1.1 Pages (`apps/web/src/app/sign-in/`)

| File | Lines | What it does today | PR 7 |
| --- | --- | --- | --- |
| `layout.tsx` | 18 | Paper ground, stacked lockup (:9-17). Covers any new page under `sign-in/` | none (the new page inherits it) |
| `page.tsx` | 52 | `loadPublicPage(signInPage)` → `{reason, email, use}` (:16); `SignInNotice` (:20); card "Email and password" (:21-32), Email `defaultValue={email}` (:28); `HardwareKeyRequirement` (:33); "Sign in with a hardware key" link (:34-38); help line "New here? Request an audit. Trouble signing in? Check the service status." (:39-49) | add "Forgot your password?" link (below the card, per #92 design 3.5: "its forgot-password link and help lines go below the card"); replace the help line :39-49 with UX-006 (5)'s words; pass `supportEmail` |
| `mfa/page.tsx` | 34 | `StepHeading` (:18); card with email, `StepTimer` wrapping `ActionForm` (:19-31). No lost-factor line | add UX-006 (2)'s line **outside the card**, after :31 (design 3.5); needs `supportEmail` from `mfaPage` |
| `hardware-key/page.tsx` | 37 | `SignInNotice reason surface="key"` (:17); `HardwareKeyRequirement` (:18); card with `<HardwareKeySignIn/>` (:19-27); "No key registered yet? Sign in with your password and code once to register it." (:28-34) | add the lost-key / lost-authenticator line (UX-006 (2)'s line, "Lost a hardware key? Sign in with your second key." family); `supportEmail` for the locked words |
| `new-password/page.tsx` | 44 | pattern to copy for the reset form: `StepHeading`, `StepTimer ... restart={restartStep}`, `ActionForm`, two `PasswordField`s with `PASSWORD_MIN_LENGTH` hint (:19-39) | none; template for the new page |
| `enroll/page.tsx`, `register-key/page.tsx` | 55, 41 | other steps | none |
| `notice.tsx` | 97 | `REASONS` (:7-20; `step_expired` :15; `locked` :18 "This account is locked after ten failed attempts. A platform administrator can unlock it."), `RestartReason` :23 / `isRestart` :25, `RESTARTS` (:28-34; key words :31, :33), `PASSWORD_TO_USE` (:37-40), `wordsOf` (:43-54), `SignInNotice({reason, kept, surface})` (:62-84; `ArrivalNotice` for restart reasons :77, `Alert role="status"` otherwise :79-83), `HardwareKeyRequirement` (:87-97) | new reason(s) in `REASONS` (a `Record<SignInReason,…>`, so the typecheck forces it); UX-066 locked words with the support address (`REASONS` is static: `SignInNotice` needs a `supportEmail` prop, or `locked` is built in a function); decide whether the new reason (password reset done) is an `ArrivalNotice` (extend `isRestart`/`RestartReason` or a sibling) and its `kept` words |
| `step-heading.tsx` | 24 | `StepHeading({setup, children})` | reuse on the new page (`setup={null}`) |
| `actions.ts` | 33 | `'use server'`: `signInStep` :10, `newPasswordStep` :14, `enrollStep` :18, `mfaStep` :22, `restartStep` :30-33 (`redirect(RESTARTED.redirect)`) | add the reset server actions (request, confirm), each `runSignInStep(route, form)`; `registry.test.ts:164` requires every server action to run a registered action route |
| `forgot-password/page.tsx` | new | | the reset request form (email) and, after it, the code + new password form (one page with two states, or a second page for the pending step; the review lists only this one new page) |

Note: `?reason=locked` has no producer anywhere (`grep reason=locked` finds nothing). The locked words a person sees
come from `MESSAGES.locked` in the route (1.2) as an action error or a key-options error; `REASONS.locked` is only
reachable by typing the URL. Both must change (UX-066).

### 1.2 Routes (`apps/web/src/lib/routes/sign-in.ts`, 559 lines; watched)

- Imports :1-26 (pending helpers :3-17, `SIGN_IN_COOKIE` :19, `Pending` types :20, `stepSeconds/warningSeconds` :21,
  `emailAddress, sixDigitCode` :26).
- `SIGN_IN_REASONS` :41-54 (append the new reason after `restarted` :53, as #92 said: "PR 7 appends its own reasons
  the same way"); `reasonParams` :59.
- `StepResult` :69 (`{redirect}` or `{error, locked?, final?, issues?}`).
- `MESSAGES` :71-77: `credentials` :72, **`locked` :73** (UX-066), `no_account` :74, `invitation_expired` :76.
  `MESSAGES` is a static object; the locked words need `context.services.supportEmail` (exists: `Services.supportEmail`
  `lib/server/services.ts:81`, default `'support@synthetic.test'` :200, from config :236), so `settle`'s locked branch
  (:192-194) builds it.
- `StepTime` :80-87, `SetupMarker` :90.
- **`STEP_PAGES` :92-98**, a `Record<Pending['step'], string>`: a new `Pending` step needs its page here.
- `WRONG_CODE` :109 (`field: 'code'`), `passwordIssue` :112-114 (reuse for the reset's password policy refusal).
- **`setupOf` :120-133**: exhaustive `switch` over `Pending['step']` with no default; a new step needs a `case` (return
  `undefined`: not numbered).
- **`settle` :149-207**:
  - pending branch :155-173. **:160 `if (pending.step !== 'key')` writes the kept email** for every pending step but
    the key: a reset step reached by any typed address must be excluded here too (ADR 0081 D6's rule, "written only
    after a secret is proven"). `use` :161 (`'temporary'|'chosen'`) and `passwordSaved` :157.
  - `signed_in` :174-176; `invalid_password` :177-179 (rewrites the pending with its meta; the reset's weak password can
    reuse this shape); `key_registered` :180-182.
  - refused :183-205: **`expired` :185-188** (`clearPending`, redirect `/sign-in?reason=step_expired`) is UXS-01's
    second half; `hardware_key_required` :189-191; **`locked` :192-194** (UX-066); `credentials` :195-196;
    `invitation_expired` :197-198; `no_account` :199-202; `key_not_registered` :203-204. `RefusalReason` additions
    (if any) land here too (exhaustive).
- `advance` :210-218 (stamps `at` before the provider call; reuse for the reset actions).
- `pendingOf` :224-235 (step-kind check + limit check), `stepPage` :241-247.
- **`RESTART` :249** (`/sign-in?reason=step_expired`); `RESTARTED` :252. UXS-01 adds `KEY_RESTART`
  (`/sign-in/hardware-key?reason=step_expired`) beside them.
- `pendingAccount` :255 (raw sealed cookie string as the account subject).
- **`signInPage` :257-269**: reads the kept email only for `step_expired | restarted` (:266). Add the new reason there,
  and return `supportEmail`.
- `signInWithPassword` :271-289 (`rateLimit: 'sign_in'` :275, `rateAccount: input.email` :276, `clearSignIn` on every
  non-pending first step :284-286). The reset request copies this shape (`sign_in` bucket, account = typed email).
- `restartRoute`/`restartSignIn` :300-329 (`mfa` bucket, `clearPending`, `signIn.abandon`). If the reset form is a
  timed step with `StepTimer`, its Start again goes through this unchanged (the `abandon` switch, sign-in.ts :273-277,
  does nothing for steps other than `register_key`).
- `newPasswordPage`/`chooseNewPassword` :331-359 (the closest model for the confirm step: `rateLimit: 'sign_in'` :348,
  `pendingAccount` :349, password + confirm `refine` :352-354).
- `mfaPage` :389-400: add `supportEmail` to its data for the lost-authenticator line.
- **`hardwareKeyPage` :417-424**: `{reason}` only; add `supportEmail`.
- `hardwareKeyOptions` :428-450: `clearKeptEmail` :440; a locked account → `settle` → `{error: MESSAGES.locked,
  locked}` (:443-445) — UX-066's "hardware-key options result" is this, server side, so the address arrives in the error
  string with no component change.
- **`verifyHardwareKey` :466-482: `RESTART` at :479** — UXS-01's first half (→ `KEY_RESTART`); the `advance` at :480
  passes `from = pending` (step `key`), so a provider `expired` reaches `settle` :185 with `from.step === 'key'`.
- `registerKeyPage` … `registerHardwareKey` :484-541 (their `RESTART`s stay: key registration starts on `/sign-in`).
- **`SIGN_IN_ROUTES` :543-559**: register the new page and action routes; `lib/routes/index.ts:33,:62` spreads it;
  `registry.test.ts:127-179` checks every page.tsx/action has a registered route at its path.

`publicRoute` (`lib/http/invoke.ts:376-405`): origin check :382, parse, `guard(..., {account: spec.rateAccount?.(input,
request)})` :389, handler. `common()` :345-372 refuses a public POST with no `rateLimit` (:351). `rateAccount` gets
`(input, request)` only (no sealer), so a confirm step keyed by the email would need the email in the input or the raw
cookie (`pendingAccount`). Public routes write their own audit events (no `audit:` spec, :348 exempts public).

`runSignInStep` (`lib/http/next.ts:230-244`): refusals via `refusedInput` :166-; non-ok → `'Sign-in could not continue.
Start again.'` :238; `{redirect}` → `redirect()` :240-242.

### 1.3 The flow service (`apps/web/src/lib/auth/sign-in.ts`, 278 lines; watched)

- **`Pending` union :44-50** (`new_password | mfa_setup | mfa | key | register_key`). A reset step added here forces
  `STEP_PAGES`, `setupOf`, `step-limits.ts`'s two `Record`s and anything else keyed by `StepName` to change (by design:
  ADR 0081 D1).
- `RefusalReason` :52; `FlowResult` :54-60.
- `account()` :92-95 (`sign_in_account(email, sub)`, SECURITY DEFINER, granted to tp_app).
- **`audit()` :97-99**: `withActor(pool, userId)` + `recordAuditEvent({action, objectType: 'user', objectId: userId,
  purpose, requestId})`. The actor is the account's own user (as `password_changed` :193 does). This is how
  `password_reset_requested` / `password_reset_completed` can be written with no DDL (see 1.8).
- `failure()` :102-118 (`sign_in_failed(user, stage, request)`; `stage` must be `password|mfa|hardware_key`,
  `sign_in_failed.sql` :18-20 raises otherwise: a wrong reset code can count only as `password`, or not at all).
- `after()` :120-135, `authenticated()` :137-160 (locked/disabled/hardware-key rules; `provider.release`).
- **`start()` :163-181**: locked refused before the provider (:165-167), disabled → `credentials` (:168-170), invited
  with an expired invitation (:173-178). After a reset the next sign-in goes through here, so **MFA is still asked**
  (the provider's `secondFactor`, dev-provider :117-121; Cognito's pool requires MFA, identity.ts:78) and a locked
  account stays locked.
- `newPassword()` :183-196 (audit `password_changed` :192-194 only when the account exists and the step did not
  expire): the model for `confirmPasswordReset`.
- `beginKey` :232-239, `completeKey` :241-246, `abandon` :273-277.
- New methods go here: `requestPasswordReset(email, context)` and `confirmPasswordReset(pending|email, code, password,
  context)`, calling two new provider methods and recording the two events; plus, on completion, ending the user's
  sessions (1.5).

### 1.4 Provider interface and its two implementations (all watched)

**`apps/web/src/lib/auth/provider.ts` (93)**: `AuthStep` :33-47, `NewPasswordStep` :49 (reuse
`invalid_password`), `AuthProvider` :64-93. Add two methods after `resendInvitation` :90 (e.g.
`beginPasswordReset(email): Promise<{challenge} …>` and `completePasswordReset(challenge, code, newPassword):
Promise<'done' | rejected | expired | invalid_password>`), shaped so the request's answer cannot differ by address.

**`apps/web/src/lib/auth/cognito-provider.ts` (362)**:
- Imports :1-15 (add `ForgotPasswordCommand`, `ConfirmForgotPasswordCommand`).
- Error sets: `REJECTED` :87 (already holds `PasswordResetRequiredException`: an account Cognito forces to reset reads as
  a wrong password today), `WRONG_CODE` :89, `STALE` :91. The reset needs its own mapping: ForgotPassword →
  `UserNotFoundException` (masked by the pool), `NotAuthorizedException` (a FORCE_CHANGE_PASSWORD invited user),
  `InvalidParameterException` (no verified email), `LimitExceededException`, `CodeDeliveryFailureException`,
  `TooManyRequestsException`: all must answer like success (enumeration). ConfirmForgotPassword →
  `CodeMismatchException`, `ExpiredCodeException`, `InvalidPasswordException` (→ `invalid_password`, as :208-211),
  `LimitExceededException`, `TooManyFailedAttemptsException`, `UserNotFoundException`.
- `setNewPassword` :200-214 is the model (`passwordProblems` first :201, `InvalidPasswordException` → problems `[]`).
- `resendInvitation` :347-357, `globalSignOut` :359-361 (`AdminUserGlobalSignOut`, already in the web role's three
  admin actions, `infra/lib/constructs/application-role.ts:14`: ending Cognito tokens after a reset needs no IAM change).
- Pool facts (read only, `infra/lib/constructs/identity.ts`): `accountRecovery: EMAIL_ONLY` :91; app client
  `generateSecret: false` :114 (no SECRET_HASH), `preventUserExistenceErrors: true` :115 (ForgotPassword for an unknown
  user answers a simulated delivery); `mfa: REQUIRED` :78; `authSession` 3 min :14. No custom message templates in
  identity.ts: the reset email is Cognito's default text ("Your password reset code is …") — a #42 file, for Lane A /
  the founder if branded words are wanted. Cognito's reset code lives 1 hour (not set in infra, so `step-limits.test.ts`
  :26 has nothing to pin it to).

**`apps/web/src/lib/auth/dev-provider.ts` (320)**:
- `DevAuthOptions` :39-47: `deliverInvitation` :44 is **required**, and about 35 test files construct `DevAuthProvider`
  with it (every `*.db.test.ts` under `lib/routes`, `lib/http/rate-limit.db.test.ts:131`, `scripts/seed.db.test.ts:40`,
  `lib/screening/test-support/page-services.ts:43`, `route-tests/world.ts:258` …). A new delivery hook
  (`deliverResetCode`) must be **optional** (default: no-op, or the same outbox) or the PR edits ~35 files.
- `CHALLENGE_MS`/`GRANT_MS` :49-50 from `step-limits.ts`; `Step` :52 (add `'reset'`), `challenge()`/`open()` :90-97
  (`dev-challenge` seal, expiry `CHALLENGE_MS`; a reset code needs its own lifetime constant, e.g. one hour, mirrored
  from Cognito).
- `nobody()` :68-70: the timing twin for an unknown email (same scrypt cost). The reset request must do equal work for
  a known and an unknown address (seal a challenge for `sub: null`, as `beginKeySignIn` :186-194 does; deliver only when
  known, which is a file write the unknown path does not do).
- `signIn` :123-133, `setNewPassword` :135-147 (hash + `store.update(... temporary: false)`): the reset's completion is
  the same update; it must leave `totpSecret` and `credentials` as they are (MFA still required).
- `resendInvitation` :306-315 (skips `temporary !== true`): the reset should skip `temporary === true` records (an
  invited user has no password to reset; Cognito refuses them too).
- The reset code must be single-use and attempt-limited (Cognito stops after a few wrong codes): hold a hash of the code,
  its expiry and an attempt count on the record (1.4 dev-store), never the code in clear.

**`apps/web/src/lib/auth/dev-store.ts` (132)**: `DevUserRecord` :19-29. Add an **optional** reset field (e.g.
`reset?: { codeHash, expiresAt, attempts }`); records are built in `scripts/seed.ts`, `e2e/mail.ts`,
`dev-provider.test.ts` `record()` :52-63, `sign-in.db.test.ts`, `sign-in-routes.db.test.ts`, so optional keeps them.
`update()` :72-85 is the atomic read-modify-write to use.

**Dev delivery** (`apps/web/src/lib/server/services.ts`, watched): `devOutbox(directory)` :104-110 writes
`{email, temporaryPassword}` JSON files into `<auth dir>/outbox`; `provider()` :112-127 wires it (:125).
`e2e/onboarding.spec.ts:41-52` reads that outbox and takes the **last** message for an email as its temporary
password: a reset message written to the same outbox in the same shape would be misread. Use a distinct shape
(`{email, resetCode}`) and filter on it, or a sibling directory; the e2e reads it the same way (`E2E_DEV_AUTH_DIR`,
`e2e/env.ts:26`).

### 1.5 Pending sealing, step limits, kept email, sessions

**`apps/web/src/lib/auth/step-limits.ts` (53; watched)**: `PROVIDER_CHALLENGE_SECONDS` :12, `PROVIDER_GRANT_SECONDS`
:14, `PENDING_COOKIE_SECONDS` :16, `REGISTRATION_COOKIE_SECONDS` :17, `KEPT_EMAIL_EXTRA_SECONDS` :19;
**`PROVIDER_SECONDS` :25-31 and `COOKIE_SECONDS` :32-38** (`Record<StepName, number>`): a reset step needs both (the
typecheck says so; #92 design 3.5). `stepSeconds` :46-48 (min), `warningSeconds` :51-53 (≥10 min → 2 min warning).
A one-hour provider code with a 15-minute cookie would state 15 minutes and warn at 2.

**`apps/web/src/lib/auth/pending.ts` (181; watched)**: `StepMeta` :77-84, `readPending` :115, `writePending` :123-126
(expiry from `startedAt`), `stepClosesAt` :129, `clearPending` :133, **`writeKeptEmail` :141-145** (the reset writes it
only after ConfirmForgotPassword succeeds: design 3.5), `readKeptEmail` :148-159, `clearKeptEmail` :162,
`clearSignIn` :167, `writeSession` :173. `KeptEmail.use` is `'temporary'|'chosen'` (:90-96): after a reset the right
word is the new password (`'chosen'` fits; or a third value, which widens `readKeptEmail`'s check :155 and
`PASSWORD_TO_USE` in notice.tsx).

**`apps/web/src/lib/auth/sessions.ts` (208; watched)**: cookies :18-22 (`tp_sign_in`, `tp_sign_in_email`);
`revokeUserSessions(scope, userId)` :205-208 → `revoke_user_sessions()` (`packages/db/functions/revoke_user_sessions.sql`),
which admits `target_user = app_actor_id()` and sets `end_reason = 'revoked'`: a completed reset can end the person's
open sessions inside `withActor(pool, userId)` with no DDL. Its other callers: `routes/settings.ts:1085`,
`routes/console.ts:570`.

### 1.6 Rate limits (`apps/web/src/lib/http/rate-limit.ts`, 133; watched, a #42 file per UX-006)

`RateBucket` :18, `RATE_BUCKETS` :20, **`sign_in` :39 (address 30/300 s, account 20/900 s)**, `mfa` :40 (address
30/300, account 10/300). Use `rateLimit: 'sign_in'` with `rateAccount: (input) => input.email` on the request (shares
the account count with password attempts for that address: `rateSubjectHash` :71-73 hashes `sign_in:account:<value>`),
and on the confirm either the email (if the form carries it) or `pendingAccount`. No new bucket (UX-006: a new bucket
edits the #42 file). Tests of the buckets: `lib/http/rate-limit.db.test.ts` (constructs a `DevAuthProvider` at :131).

### 1.7 Hardware-key surface and UXS-01

`apps/web/src/components/hardware-key.tsx` (176): `post()` :20-24 (non-2xx → "The sign-in step was refused. Start
again."); `Problem` :33-49 (locked title "Account locked" :45, message as plain text :46); **`HardwareKeySignIn`
:69-129**: options :84-89 (`begun.locked`, `begun.error`), `startAuthentication` :90, verify :91, **`done.redirect` →
`window.location.assign` :92-95** (follows whatever `verifyHardwareKey` returns, so UXS-01's fix is server-only);
`HardwareKeyRegistration` :131-176 (follows `redirect` :146-148, :155-157).

UXS-01 (`/home/user/ops/designs/lane-b-ux-sign-in-time.md:1837`; verify note
`/home/user/ops/approval-summaries/lane-b-ux-sign-in-time-wip/sgn-verify-ux-UXS-01.md`): "the fix lives in
`lib/routes/sign-in.ts` (`verifyHardwareKey`'s `RESTART` and `settle`'s `expired` when `from?.step === 'key'`), not
`components/hardware-key.tsx`, for UX PR 7 with the finding's `KEY_RESTART`, a database test and the tour state reached
by the flow". Places:
- add `KEY_RESTART = { redirect: '/sign-in/hardware-key?reason=step_expired' }` beside `RESTART` (`routes/sign-in.ts:249`);
- `verifyHardwareKey` :478-479: `pending === undefined ? KEY_RESTART : …`;
- `settle` `expired` :185-188: return `KEY_RESTART` when `from?.step === 'key'` (the kept email is never written for the
  key step, so `clearPending` alone is right there too);
- the landing already exists: `hardware-key/page.tsx:17` renders `SignInNotice surface="key"`, whose `step_expired` words
  are "That sign-in step closed. Start again with your hardware key." (`notice.tsx:31`) as an `ArrivalNotice`;
- **existing assertion that changes**: `lib/routes/sign-in-routes.db.test.ts:287` (`verifyHardwareKey` with a fresh
  browser expects `/sign-in?reason=step_expired`); :277-278 are key *registration* and stay.
`hardware-key.tsx` itself needs no change for UXS-01 or UX-066 (the locked error string comes from the server). It may
change only if the support address is to be a link inside `Problem`, or for a "Forgot your password?" line (not on the
key surface: staff keys are passkeys with no password step there).

### 1.8 Audit and security events (DB, read only; no migration)

- `audit_event` (`packages/db/migrations/20261015140500_audit_and_operations.sql`): `action` CHECK is a pattern :9,
  `purpose` a pattern :15, so `password_reset_requested` / `password_reset_completed` need no DDL. `actor_kind` CHECK
  :8 and `audit_event_actor` :18 (`system` or an actor). Insert policy `audit_event_record` :47-51: **`actor_id =
  app_actor_id()`**, so tp_app can record an event only with an actor set: `withActor(pool, userId)` (as
  `SignInFlow.audit`, sign-in.ts :97-99; `withActor`, `packages/db/src/authz/scope.ts:165-180`, actorKind `'user'`).
  **An unknown address can record nothing** (no actor), which is the enumeration-safe answer but a timing difference
  (one transaction) the design must neutralise or accept.
- `record_security_event()` (`packages/db/functions/record_security_event.sql`; migration
  `20261015180000_tenancy_hardening.sql:90`): `REVOKE ALL … FROM PUBLIC` and **no GRANT to tp_app**; it is called only
  from SECURITY DEFINER triggers (`grant_security_events`, `support_grant_security_events`, …). So UX-006's "through
  `record_security_event()`" is not callable from the web; the in-repo pattern is `recordAuditEvent` with the user as
  actor (`password_changed`, `mfa_enrolled`, `hardware_key_registered`). Making them `security_event` rows (as
  `sign_in_failed.sql` :40-46 writes `failed_mfa_burst` / `account_locked` with actor_kind `system`) would need a new
  SECURITY DEFINER function or grant: a migration, for Lane A. No app code reads `security_event` rows (grep), and no
  action allowlist exists (`password_changed` appears only in sign-in.ts:193 and sign-in.db.test.ts:135).
- Logs: `this.deps.logger.warn('security event: …', { user_id, request_id })` (sign-in.ts :112, :115, :157) — the
  allowlisted shape (`packages/observability/fields.ts`; `pnpm lint:logs`). Never the email.

### 1.9 Copy and brand

- `.claude/rules/brand.md` (tokens only, no hex; focus `--pw-focus`); BRAND.md:122 (sign-in: stacked lockup, Paper
  ground, nothing else decorative) is held by `layout.tsx`.
- `pnpm lint:copy` = `tools/brand-copy/index.ts` (`scan.ts` reads every string literal and JSX text in apps/web: no
  "AI", no "recovered" without posted/deposited, no brand words typed out). Reset words are unaffected but run it.
- Words fixed by the co-founder's ruling (`/home/user/ops/designs/lane-b-ux-review.md`): help line UX-006 (5) (:1686
  finding, Fix (5)): "Invited by your organization? Use the email and temporary password from your invitation. Forgot
  your password? Use the link above. Lost your authenticator app? Write to <support address>. Lost a hardware key? Sign
  in with your second key. New to PaidWhole? Request an audit. Service status."; lost-factor line (2): "Lost your
  authenticator app? Write to <support address> from the address you sign in with. A platform administrator checks with
  your organization's administrator, resets your two-step verification, and you set it up again at your next sign-in.";
  UX-066 (:2750): "This account was locked after ten failed attempts. Write to <support address> from this address to
  have it unlocked." Existing tests that match on `locked after ten failed attempts` (routes test :245, e2e
  `sign-in.spec.ts:56`) still match the new words; "A platform administrator can unlock it" is asserted nowhere.
- `mailto:` pattern for the address: `app/status/page.tsx:82`, `app/maintenance/page.tsx:30`, `app/support/page.tsx:52`.

## 2. Every place PR 7 changes or adds (checklist)

| # | File:line | Change |
| --- | --- | --- |
| 1 | `apps/web/src/lib/auth/provider.ts:90` (after `resendInvitation`) | two methods: begin and complete a password reset |
| 2 | `apps/web/src/lib/auth/cognito-provider.ts:1-15`, new methods near :200/:347, error sets :87-91 | `ForgotPasswordCommand`, `ConfirmForgotPasswordCommand`; error mapping (1.4); `passwordProblems` first |
| 3 | `apps/web/src/lib/auth/dev-provider.ts:39-47` (optional `deliverResetCode`), :52 (`Step`), new methods near :135/:306 | mirror: code hashed, single use, attempt-limited, one-hour life, skip temporary records, equal work for an unknown address |
| 4 | `apps/web/src/lib/auth/dev-store.ts:19-29` | optional reset field on `DevUserRecord` |
| 5 | `apps/web/src/lib/auth/step-limits.ts:12-38` | the reset code's provider length constant and both `Record`s gain the new step |
| 6 | `apps/web/src/lib/auth/sign-in.ts:44-52`, new methods after :196 | `Pending` reset step (if the code form is a sealed step); `requestPasswordReset`, `confirmPasswordReset` with `password_reset_requested` / `password_reset_completed` through `audit()` :97; on completion `revokeUserSessions` (sessions.ts:205) and optionally `provider.globalSignOut` |
| 7 | `apps/web/src/lib/routes/sign-in.ts:41-54` | append the new reason (e.g. `password_reset`) |
| 8 | `…/routes/sign-in.ts:73`, :192-194 | UX-066 locked words with `services.supportEmail` |
| 9 | `…/routes/sign-in.ts:92-98`, :120-133 | `STEP_PAGES` and `setupOf` for the new step |
| 10 | `…/routes/sign-in.ts:160` | exclude the reset step from the kept-email write; write the kept email only on reset success |
| 11 | `…/routes/sign-in.ts:185-188`, :249, :478-479 | UXS-01: `KEY_RESTART` |
| 12 | `…/routes/sign-in.ts:257-269`, :389-400, :417-424 | `signInPage` reads the kept email for the new reason too; `supportEmail` in the sign-in, code and key pages' data |
| 13 | `…/routes/sign-in.ts` new routes before :543; `SIGN_IN_ROUTES` :543-559 | `sign_in.forgot_password_page` (page `/sign-in/forgot-password`), request action (`sign_in` bucket, account = email), confirm action (`sign_in` bucket), each with Zod input (`emailAddress`, `sixDigitCode`, password + confirm refine as :352-354) |
| 14 | `apps/web/src/app/sign-in/actions.ts:6`, new exports after :24 | the two server actions |
| 15 | `apps/web/src/app/sign-in/forgot-password/page.tsx` (new) | request form; code + new password form under `StepTimer` with its own `limitSeconds` and `notes`, `StepHeading` |
| 16 | `apps/web/src/app/sign-in/page.tsx:16`, :20, below :32, :39-49 | forgot-password link below the card, help line (5), `supportEmail` |
| 17 | `apps/web/src/app/sign-in/notice.tsx:7-20` (:18), :23-54, :62-84 | new reason's words, locked words with the address (prop), arrival focus for the new reason if it is one |
| 18 | `apps/web/src/app/sign-in/mfa/page.tsx:15`, after :31 | lost-authenticator line outside the card |
| 19 | `apps/web/src/app/sign-in/hardware-key/page.tsx:12`, :28-34 | lost-key line; `supportEmail` |
| 20 | `apps/web/src/components/hardware-key.tsx` | likely none (see 1.7); listed by the review for UX-066, which the server string covers |
| 21 | `apps/web/src/lib/server/services.ts:104-110`, :125 | a dev outbox for reset codes in a shape the onboarding reader ignores (watched file) |
| 22 | `apps/web/scripts/synthetic-personas.ts:157-164` | a reset persona (and its comment), alone because it counts toward the `sign_in` account bucket |
| 23 | `docs/adr/0081-…md:8-9`, new amendment section, :216-222 | the amendment (status line already promises it; "Revisit when … UX PR 7 amends") |
| 24 | `docs/product/test-matrix.md:395-407` (intro :399-400) and `packages/synth/src/cases/matrix.ts:625-648` | SGN-05 to SGN-08 rows, word for word in both (`packages/synth/src/fixtures.test.ts:33`); matrix.ts is watched |

## 3. Existing tests to extend

Unit / database (`pnpm test`, `pnpm test:db`):
- `apps/web/src/lib/routes/sign-in-routes.db.test.ts` (687): harness `servicesWith` :68-84 (pass a `deliverResetCode`
  capture; `createServices` accepts `supportEmail`, services.ts:154), `Browser` cookie jar :93-, `step`/`json` helpers.
  Add: request answers alike for a known, unknown, invited, disabled and locked address (same data, same cookies
  written/deleted, as SGN-03's enumeration test :460-489 does); `sign_in` bucket counts it (cf. lockout :233-248);
  confirm with a wrong / expired / reused code, a weak password (issue on its field), success → `/sign-in?reason=…`
  with the kept email, sessions ended, the next sign-in asks the code; UX-066 words in the locked error (:233-248,
  :291-305 key options). UXS-01: change :287 and add a stale-key and provider-expired key case → `KEY_RESTART`.
- `apps/web/src/lib/auth/sign-in.db.test.ts` (293): events list helper (:135 shape `action:purpose`); add the two
  events, no event for an unknown address, sessions revoked, lock untouched.
- `apps/web/src/lib/auth/dev-provider.test.ts` (265): `provider()` :25-50 (add the delivery capture); reset for known /
  unknown / temporary record, code single use, attempts, expiry at the constant (cf. SGN-01 :84-95), TOTP and keys kept.
- `apps/web/src/lib/auth/cognito-provider.test.ts` (272): scripted client :25-39, `make()` :47-50; add
  `ForgotPasswordCommand` / `ConfirmForgotPasswordCommand` inputs (ClientId, Username, ConfirmationCode, Password; no
  SecretHash) and every error mapping.
- `apps/web/src/lib/auth/step-limits.test.ts` (39): the new step's lengths (:11-24).
- `apps/web/src/lib/auth/pending.test.ts` (116): kept email written only on success (if a helper changes).
- `apps/web/src/app/sign-in/notice.test.tsx` (105): new reason's words; locked words with the address; key surface.
- `apps/web/src/lib/routes/registry.test.ts` :127-179: passes once the page/actions are registered (no edit expected).
- `apps/web/src/lib/http/rate-limit.db.test.ts`: bucket behaviour (no change expected).

Browser / e2e (`pnpm test:e2e`):
- `apps/web/e2e/sign-in.spec.ts` (108): add "a forgotten password is reset and the second factor is still asked"
  (helpers `enterPassword`, `signInWithTotp`, `refusal` from `e2e/helpers.ts:32,44,66`; the code from the dev outbox as
  `onboarding.spec.ts:41-52` reads invitations). The lockout test :54-63 keeps matching.
- `apps/web/e2e/sign-in-time.spec.ts` (525): axe on sign-in states :221, :235, :243 (`expectAccessible`,
  `atPhoneWidth` from `e2e/a11y.ts:11,108`); add axe for `/sign-in/forgot-password` (both states, 1280 and 390 px) and
  `/sign-in` with the new help line; a stale key step landing on the key page (UXS-01's tour state "reached by the
  flow"), or in `e2e/hardware-key.spec.ts` (virtual key helpers `addVirtualKey`, `signInWithKey`, helpers.ts:77,86).
- `apps/web/e2e/font-hosts.spec.ts:17` `PUBLIC_PAGES`: add `/sign-in/forgot-password`.
- `apps/web/e2e/copy.spec.ts:20-40` and `brand.spec.ts:299`: sign-in page words (no edit expected).
- Browser harness `apps/web/src/components/step-timer.browser.test.tsx`: only if the reset form passes new `notes`.

## 4. Gates and watched paths

`tools/screening-capacity/watched-paths.txt`: `lib/auth/*` :62-73, `lib/http/rate-limit.ts` :89, `sign-in-for.ts` :93,
`lib/routes/sign-in.ts` :97, `lib/server/services.ts` :114, `packages/db/src/authz/*` :295-300,
`packages/synth/src/cases/matrix.ts` :475. The merge waits on the founder's runner decision (#102). Pre-existing facts
the design should know: `UX PR 1` (`ux-forms`) merged as #74 (165c599), so `ActionForm` already keeps the typed email
after a refusal (`components/action-form.tsx:23-28`; ADR 0077): the stated dependency is met. No migration, no IAM
change, no infra change is needed for the code as mapped, unless the design wants the events as `security_event` rows
(a grant or function: Lane A) or branded Cognito reset email (identity.ts, a #42 file).

## 5. Open points for the design (from the code)

1. Timing class: a known address does a `sign_in_account` read, an audit transaction and the provider call (dev: a
   file write); an unknown one skips the transaction and the write. Options: a fixed response floor, equal work in both
   paths, or the event after the response.
2. Confirm-step guessing: Cognito caps attempts itself; the dev twin needs a cap. `rateAccount` sees the raw cookie, so a
   fresh request (new cookie) resets a `pendingAccount` count; the request itself is bounded by `sign_in`'s account
   limit on the email (20/900 s).
3. Whether a wrong reset code counts toward the ten-failure lock (`sign_in_failed` stage `password` only; no new stage
   without DDL).
4. A locked account: answer alike; whether to send a code at all (a reset never unlocks: `start()` :165).
5. Sessions after a reset: `revokeUserSessions` (allowed for the user as actor) and Cognito `globalSignOut` (already
   granted); the kept email written only after success, with `use` = the new password.
6. Pending reset step in `tp_sign_in` (reuses `StepTimer`, Start again, `pendingOf`) vs. a cookie of its own; either
   way the reset step never writes `tp_sign_in_email` (settle :160).
