# Status: Queues item 37, the key registry (Lane A)

## RESUME-BLOCK (2026-11-12, W44, session_019i9ifCbvaBHG1q7YBdjKGM): the web half's FLOW is built (cut A, items 1 and 2); the code SCREEN and cut B are NOT started

**WIP `co-001/wip-key-registry` dde86284** (one commit on e85c3b40). No PR is open. No migration was touched. W44
handed over at about 250k tokens, most of it reading. The successor needs this block, W43's below (its "exact next
step" items 3 to 6 are what is left) and W33's (signatures, refusals).

### What W44 built (W43's items 1 and 2)
- `apps/web/src/lib/auth/sign-in.ts`:
  - `authenticated()` reads `sign_in_hardware_keys` (one read, only for a key sign-in or an account that must hold a
    key) in place of `provider.hasHardwareKey`, which is gone from the interface and both providers.
  - A key sign-in, section 5's four steps: `registeredKey()` (well formed; a live row, else `sign_in_key_refused`
    `removed` or `not_registered`, the paging line `security event: removed hardware key used` for a removed one, and
    `cleaned()` with the grant; the app's own `verifyAuthenticationResponse` against the row's public key, counter
    zero, a failure logged as `security event: hardware key assertion refused by the registry` with the error's class
    name only and recorded `assertion`); then `openSession` with the digest. `user_session_hardware_key_live` is
    answered `expired` and recorded `removed`; `user_session_key_registration_closed` is answered
    `hardware_key_required` with the warn line `security event: code session refused while key registration is closed`.
  - The plumbing: `beginKey` seals `assertion` (the options' challenge) in the pending key step; `completeKey` passes
    the response and it down; a key step with no `assertion` (the previous image's) starts again (`expired`).
  - Registration: `judgeRegistration()` (`hardware_key_registration_judge` as the account) before
    `beginKeyRegistration` and before `completeKeyRegistration` ask the provider; `recorded()` verifies the
    registration response itself (the challenge sealed as `creation`) and calls `hardware_key_record` with the code's
    digest; a failure of either removes the key at the provider with the grant, logs `hardware key registered at the
    provider but not recorded` (`user_id`, `request_id`, `error_code` the constraint or a class name, `outcome_code`
    removed or not_removed) and answers `key_not_registered`. The flow no longer writes `hardware_key_registered`
    itself (the function does; the event's purpose is now empty, not `webauthn`). ADR 0093 D6's path is unchanged.
  - The code: `answerRegistrationCode(pending, typed, context)`; the pending `register_key` step gains `creation`,
    `codeRequired` and `code` (the digest in hex, only after `open`); a new refusal reason `registration_code`.
- `apps/web/src/lib/auth/registration-code.ts` (new): the alphabet (32 symbols, no 0 1 I O), `newRegistrationCode()`
  (8 symbols, `crypto.randomInt`), `normalizeRegistrationCode`, `isRegistrationCodeShaped`, `registrationCodeDigest`.
  **Cut B's console route uses `newRegistrationCode` and `registrationCodeDigest` from here.**
- `sessions.ts`: `openSession` carries `keyCredentialSha256` (the INSERT names the column, null for a code session);
  `KEY_NOT_LIVE_CONSTRAINT`, `KEY_REGISTRATION_CLOSED_CONSTRAINT`, `refusedConstraint()`.
- `provider.ts`, `cognito-provider.ts`, `dev-provider.ts`, `dev-store.ts`: `listHardwareKeys(grant)` (credential ID
  and creation time; Cognito's by `ListWebAuthnCredentials`, paged); the twin stores `createdAt`.
- `SignInDependencies.webauthn { rpId, origin }` (required); `services.ts` fills it from the configuration
  (`ServiceParts.rpId`, the origin's host when absent). `KEY_USER_VERIFICATION_REQUIRED = true` is the one constant.
- `apps/web/src/lib/routes/sign-in.ts`: ONLY the refusal's words, so the switch is whole (see the screen list). **The
  code screen itself is not built: a closed account that reaches `/sign-in/register-key` today is sent back to the
  same page with no options (nothing registers, nothing opens; a dead end until item 3 is built).**

### What is green, and what is not known
- `apps/web/src/lib/auth/sign-in.db.test.ts`: **72 passed** on PostgreSQL 18 (20 of them new or restated). Seen
  failing first: the file did not load without `registration-code.ts`, then 14 failed on missing behaviour, with the
  type errors naming `webauthn`, `answerRegistrationCode`, `codeRequired` and `creation`. `registration-code.ts` (a
  pure helper the tests import) was written between those two runs; nothing else preceded its tests.
- The web's type-check passed before the last two test-only edits.
- **NOT known when this block was written:** `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`, the web's unit tests
  and the web's other database tests (the route tests that sign in with a key are the likely breakage: every key
  sign-in now needs a registry row, and a hand-made `key` pending needs `assertion`) were running in W44's background
  when the context ran out; a later commit of this file gives the result if W44 saw it. **Until then count them as not
  run on dde86284. `pnpm test:db` whole and the full local suite were not run by W44.** W43's whole-suite result on
  e85c3b40 is in W43's block, if it was added.
- Tests restated, none skipped or loosened: the first key test's event is `hardware_key_registered:` (no purpose);
  SGN-17's "audit write fails" case is now "the registry's record fails": removed at the provider, the new line,
  `key_not_registered` (it threw before); SEC-20's hand-made key step carries an `assertion`.
- Numbers used: SGN-20, SGN-21, SGN-26, SGN-27 (the flow's cases). None other taken.

### Session open: the round trips (acceptance)
A password-and-code sign-in of an account that need not hold a key: **none added** (no statement changed but the
INSERT's column list). A key sign-in: **one read added** (`sign_in_hardware_keys`), as section 5 states, and nothing
else on the accepted path (the app's verification is local). A password-and-code sign-in of an account that must
hold a key: the same one read **replaces** the provider's network call. `resolveSession` is untouched.

### The exact next step
1. See the background checks through on dde86284 (commands in W43's and W33's machine notes); fix what the route
   tests need. Then W43's item 3: the code screen and `routes/sign-in.ts` (the register-key page shows the code form
   when the sealed step has `codeRequired` and no `code`; a server action with a Zod schema calls
   `answerRegistrationCode`; the `registration_code` refusal keeps the step and the typed value is not echoed;
   `isRegistrationCodeShaped` is for the field's own message, before the database is asked).
2. W43's items 4 and 5 (cut B, none started): the four console routes, the removal of `signOutAtProviderAfterCommit`
   and the reset's `globalSignOut`, the two alarms swapped. Then item 6.

### Named points for the two reviews (W44 adds; W43's and W33's stand)
- **Auth review, a property of `hardware_key_registration_judge` the web works around:** called with no code for a
  closed account with a usable opening, it counts a try. `account_key_registration_closed` is granted to no role, so
  the web cannot ask "closed?" for free. The flow therefore reads closed from the registry's rows (any row and none
  live means every key was removed) and seals `codeRequired`, and answers the code screen without asking the
  database; reaching the screen counts no try (tested). **The one case it cannot see: a removal confirmed for an
  account that never had a key row** (closed, no rows). Its first visit to the register-key step asks `judge` with no
  code and, if an opening stands, spends one of the five tries. Small; a free "closed?" answer would need a grant,
  so it is recorded for the contract migration, not built.
- **Auth review:** `codeRequired` and `code` live in the sealed step, but nothing trusts them: `judge` runs before
  each provider call and `hardware_key_record` judges again under the lock (the forged-step test).
- **Auth review:** the cleaning skips a provider credential whose ID is not canonical base64url of 16 to 1,023 bytes
  (never deleted). Whether Cognito's `CredentialId` in `ListWebAuthnCredentials` is exactly the browser's `id` is
  unverified from here; if it is not, the cleaning deletes nothing (the safe side) and removed keys stay at the
  provider, where they still open nothing.
- **Auth review:** the cleaning measures "older than 15 minutes" from the attempt's start (the database's clock)
  against the provider's creation time: two clocks.
- **Auth review:** a registration that fails for a reason that is not a refusal (the database unreachable) now
  answers `key_not_registered` after removing the key, where the base threw; the error's class name is logged.
- **Not done, W43's item 6:** the relying-party tie (the web refusing to start when the pool's and the app's
  differ) and the infra test tying `KEY_USER_VERIFICATION_REQUIRED` to the pool's setting.

### For the UX and brand review: what a person sees that W44 changed
- **Sign-in, the register-key step, one new error text** (`MESSAGES.registration_code`, `routes/sign-in.ts`): "That
  code did not open registration. Check the code PaidWhole gave you and try again." The same words for no opening
  and a wrong code. A refusal keeps the step (the person may type again); a refresh keeps it too (the sealed cookie).
  **No screen shows it yet: the code form is not built.**
- A key sign-in with an unknown or removed key, or one the registry's check refuses: the existing wrong-credential
  words ("That did not match."), no new text. A key step sealed by the previous image: the existing restart.
- A code sign-in of an account whose registration is closed and that need not hold a key: the existing
  hardware-key-required page.
- No other screen, email or PDF changed.

### Machine notes
As W33's, below; `pnpm install --offline --frozen-lockfile` was needed once here for W43's new worker dependency.
W44 holds nothing else: no PR, no subagent, no scheduled task; one background check run that ends on its own.

## RESUME-BLOCK (2026-11-12, W43, session_019i9ifCCuiEbFzA2DZGJFA1): step 3 is cut in two; the JOB half is built; next is the WEB half

**WIP `co-001/wip-key-registry` e85c3b40** (one commit on 969ac389). No PR is open. No migration was touched. The
successor needs this block, W33's block below (the functions' signatures, the refusals' names, the lock order), the
note's sections 16, 2, 5 and 8, and the files named here. Step 3 was plainly more than one session; it was cut at the
handlers/job line (told to the orchestrator at the start).

### What W43 built (the job half)
- `apps/worker/src/platform/provider-sign-outs.ts`: `runProviderSignOuts`. One run: (1) claim one row, call the
  provider with no transaction open, record `done` or `failed` for the try it names, for 8 seconds; (2) the overdue
  sweep, the paging line `security event: provider sign-out not delivered` (`sign_out_id`, `user_id`, the cause's
  `request_id`, `error_code` LATE or GAVE_UP) written **before** `operator_provider_sign_out_reported`; (3)
  `operator_key_removals_expire`; (4) `operator_provider_sign_outs_expire`. Each step in its own try; the run throws
  `ProviderSignOutRunFailed` naming the failed steps after the others ran.
- `apps/worker/src/platform/cognito-sign-out.ts`: the adapter (`AdminUserGlobalSignOut`, 10 second abort,
  `UserNotFoundException` read as `no_such_user`) and development's twin (asks no one).
- `apps/worker/src/platform/hardware-key-notices.ts`: `sendHardwareKeyNotices`, the password notice's job re-pointed,
  plus one branch: a claim that answers `undelivered` (AddressChanged) sends nothing, logs it and commits.
- `packages/auth-mail/src/words.ts`: `HARDWARE_KEY_NOTICE_SUBJECTS`, `hardwareKeyNoticeLines` (three kinds).
- `apps/worker/src/jobs/platform.ts`: the two jobs `provider_sign_outs` and `hardware_key_notices`, each `* * * * *`,
  payload `z.strictObject({})`. `PlatformDependencies.providerSignOut` (absent: the job throws
  `NoProviderSignOutError`); `wiring.ts` always gives it.
- `apps/worker/src/config.ts`: `providerSignOut` from `COGNITO_USER_POOL_ID`, **required in production**;
  `infra/lib/constructs/compute.ts` sets it on the platform task. `apps/worker/package.json` gains
  `@aws-sdk/client-cognito-identity-provider` (the web's version; the lockfile gained three lines;
  `pnpm toolchain:check` and `pnpm actions:check` passed).
- Log fields added (`packages/observability/src/fields.ts`): `sign_out_id`, `outcome_code`, `hardware_key_notice_id`.
  `MAIL_LOG_CODES.keyNoticeUndelivered = 'KEY_NOTICE_UNDELIVERED'`, a seventh platform mail code with its metric filter
  and alarm (`infra/lib/mail.ts`, `monitoring.ts`). `infra/test/application-role.test.ts` scans the worker's adapter.
  `tools/screening-capacity/watched-paths.txt` regenerated by its own generator (three files more).

### What is green (on e85c3b40)
- `apps/worker/src/platform/provider-sign-outs.db.test.ts` (15) and `hardware-key-notices.db.test.ts` (10), with the
  platform's other database tests: 8 files, 76 passed, 1 skipped. Infra: 29 files, 816 passed. The worker's, the mail
  words', the log fields' and the tools' unit tests: 1,132 passed in the last run of the worker and the two tools.
  `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`: 0 errors.
- **`pnpm test:db`, whole, on e85c3b40: started by W43, not finished when this block was written; the result is added in a later commit of this file, and until it is, the whole suite counts as NOT run on the job half.**
- Numbers used: **JOB-08** only (the worker's rows). JOB-06 and JOB-07 are the database's (W32's). None other taken.
- **Said plainly:** `provider-sign-outs.ts` was written before its tests (a slip against "tests first"). Its tests
  were then seen failing only where the job was not yet registered (`handlers.provider_sign_outs is not a function`)
  and on one wrong expectation of the test's own. The key-notice tests failed first on their own seeding and on one
  wrong assumption (a successful send counts no try), not for missing behaviour. The two reviews should weigh the
  tests on what they assert, not on having been red.

### Acceptance, as far as the job half goes
- **Idempotent and safe to retry (16.6):** proved by the tests: a crash after the claim, after the provider's answer,
  while `failed` is recorded, between the sweep's mark and its line, and between the line and its acknowledgement; a
  stale worker's `done` and `failed`; two overlapping runs; a failing expiry step. The call is at-least-once by design.
- **Session open: no round trip added.** W43 changed no file under `apps/web`; W33's count stands (none added).
- **Safe with the previous image running:** the job half adds two job types and reads nothing the previous image
  writes differently. Not verified by W43: what the previous worker image does with the two new schedules during a
  rollback (the rows wait in the outbox meanwhile, and the previous web image still calls the provider itself).
- Synthetic data only: every address is `@synthetic.test`, every subject and ID a random UUID.

### The exact next step: the web half (none of it started)
1. `apps/web/src/lib/auth/sign-in.ts`, tests first in `sign-in.db.test.ts` (SGN-21, SGN-26's flow cases, SGN-27, the
   flow's SGN-19): `authenticated()` reads `sign_in_hardware_keys` in place of `provider.hasHardwareKey`; the key
   sign-in's four steps of section 5 (well-formed response; live row or `sign_in_key_refused` plus the cleaning with
   the grant; the app's own assertion check with `@simplewebauthn/server`, which needs the challenge sealed at
   `beginKey` and the response passed down from `completeKey`; `openSession` with the digest and the
   `user_session_hardware_key_live` refusal answered as a stale session). Registration: `hardware_key_registration_judge`
   before `beginKeyRegistration` and before `completeKeyRegistration` asks the provider (decision 7 below W33's
   block), the app's own verification of the registration response for the public key, then `hardware_key_record`
   with the code's digest; a failure removes the key at the provider with the grant. The provider interface needs a
   way to list credentials with their creation time (the cleaning) in both `cognito-provider.ts` and `dev-provider.ts`.
2. `apps/web/src/lib/auth/sessions.ts`: `openSession` carries `key_credential_sha256`.
3. The code screen ("the code PaidWhole gave you", the same screen with or without an opening) and
   `apps/web/src/lib/routes/sign-in.ts`; the pending step carries the code's digest only after `judge` said `open`.
4. The four console routes (`console.request_key_removal`, `confirm`, `cancel`, `open_key_registration`) with
   `acting_session` from the request's resolved session, the one-time code made by the web (8 of 32 symbols,
   `crypto`), shown once, only its SHA-256 passed; the list from `hardware_key_removals()`; tests in
   `console-routes.db.test.ts`.
5. Remove `signOutAtProviderAfterCommit` (both End membership routes) and the reset's `provider.globalSignOut` call
   in `endedByReset`; their tests and the two web lines go; in `infra/lib/security-events.ts` the alarms
   `MembershipEndProviderSignOutFailed` and `PasswordResetProviderSignOutFailed` are replaced by
   `ProviderSignOutNotDelivered` on the **platform** log group (the words are `PROVIDER_SIGN_OUT_NOT_DELIVERED` in
   `provider-sign-outs.ts`; the existing reset alarms read the web log group, so this one is built like the mail-code
   alarms), plus the `removed hardware key used` alarm.
6. Then the note's later steps: the relying-party and user-verification ties, the e2e spec, ADR 0095, the test-matrix
   rows, the runbooks, the two reviews, the PR.

### Left open in the job half (small, each for the next session or a ruling)
- **The failed-try line has no cause `request_id`** (section 7 names one): `operator_provider_sign_out_claim()` does
  not return it and the migrations are closed. The line carries `sign_out_id` and `user_id`; the LATE and GAVE_UP
  lines carry the cause's request. Enough without a migration change, in W43's reading; the orchestrator may rule.
- Section 7 asks the build to confirm that the platform schedule's missed-run alarm covers `provider_sign_outs`: not
  checked.
- The worker's tests assert `operator_key_removals_expire` is called and that its failure stops nothing; they do not
  expire a real lapsed request (W32's database tests hold the function).
- No runbook text yet for `KEY_NOTICE_UNDELIVERED`; its alarm's words point at the incident runbook's hardware-key
  section, which step 6 writes.

### For the UX and brand review: what a person sees that W43 added (emails only; no screen changed)
Three emails, the `account` variant, no link, Reply-To the support address, the account footer, subject followed by
the product's name: "Your hardware keys were removed", "Registration of a new hardware key is open", "A new hardware
key was registered" (`packages/auth-mail/src/words.ts`, `hardwareKeyNoticeLines`). **The `removed` email departs from
section 7's words on purpose:** v3 (16.2) closed registration after a removal, so "the next sign-in ... then registers
a new key" would be untrue; it says support opens registration and gives a one-time code. One operator alarm text
(`KEY_NOTICE_UNDELIVERED`).

### Named points for the build's two reviews (W33's three stand, below; W43 adds)
- **Auth review:** the job trusts the adapter's reading of `UserNotFoundException` as `no_such_user`, which marks
  the row done with no sign-out; a pool ID that names the wrong pool would turn every row into that answer. The
  worker and the web take the pool from the same stack output; nothing checks it at start.
- **Auth review:** `removed`'s email tells the reader that support gives a one-time code. Whether an email should
  say that a code exists at all (it tells a mailbox thief what to ask support for) is a wording decision.
- **Database review:** the run's 8 seconds are counted from the first claim, and each call may take 10 seconds more;
  the operator pool has two connections and this job holds one for the run, as `password_notices` does.
- **Wording review:** the step-failed line's `error_code` is `<step>:<error name>` (for example `sign_outs:Crash`),
  a compound code where every other line carries one name.

### Machine notes
As W33's, below. W43 holds nothing else: no PR, no subagent, no scheduled task.

## The earlier block (2026-11-12, W33, session_019i9ifBTTYtTEJn5cydNmex): the database half; still the reference for the functions, refusals, lock order and measurements

**WIP `co-001/wip-key-registry` 969ac389** (the base 1f652b6f, #156 included, merged in). No PR is open. The successor
needs this block, the note (`designs/lane-a-key-registry.md` v3; section 16 rules) and the files named here.

### What exists
- **Migrations, created by the co-founder's typed `/new-migration key_registry` and `key_registry_validate` in W33's
  session (2026-11-12):** `packages/db/migrations/20261115090000_key_registry.sql` and
  `20261115091000_key_registry_validate.sql`. They sort after #156's `20261114090000`. Applied nowhere but local
  scratch databases. **Any further change to either file needs the co-founder's command again** (the hook's marker).
- **Tables:** `hardware_key`, `hardware_key_removal`, `hardware_key_notice`, `provider_sign_out` (no `practice_id`;
  FORCE ROW LEVEL SECURITY, one policy for `tp_owner`, no privilege for `tp_app` or `tp_operator`);
  `user_session.key_credential_sha256` (insertable by `tp_app`); `mail_send`'s two kind CHECKs admit
  `hardware_keys_removed`.
- **Functions for the web (`tp_app`), signatures exact:** `hardware_key_record(new_credential bytea, new_public_key
  bytea, code_sha256 bytea, began timestamptz, request text) -> (key_id, first_after_removal)`;
  `hardware_key_registration_judge(code_sha256, began, request) -> text` (`not_closed` | `open` | `refused`);
  `sign_in_hardware_keys(target_user) -> (credential_sha256, public_key, removed)`;
  `sign_in_key_refused(target_user, why, request)` (`not_registered` | `removed` | `assertion` | `malformed`);
  `hardware_key_removal_request(target_user, acting_session, request) -> uuid`;
  `hardware_key_removal_confirm(removal, acting_session, request) -> (keys_removed, sessions_ended)`;
  `hardware_key_removal_cancel(removal, acting_session, request) -> boolean`;
  `hardware_key_removals() -> (removal_id, user_id, requested_by, requested_at, expires_at, state, decided_by,
  decided_at, live_keys, registration_open_until, registration_closed)`;
  `hardware_key_registration_open(removal, acting_session, code_sha256, request) -> timestamptz`.
- **For the jobs (`tp_operator`):** `operator_provider_sign_out_claim() -> (sign_out_id, account_id, subject, try)`,
  `_done(sign_out, try, outcome, request) -> boolean` (`signed_out` | `no_such_user`), `_failed(sign_out, try,
  error_name, request)`, `operator_provider_sign_outs_overdue(request) -> (sign_out_id, account_id,
  cause_request_id, code)` (`LATE` | `GAVE_UP`), `operator_provider_sign_out_reported(sign_out, code)`,
  `operator_provider_sign_outs_expire(at_most)`, `operator_key_removals_expire(at_most, request)`;
  `operator_key_notices_stale(at_most, request)`, `operator_key_notices_due(at_most)`,
  `operator_key_notice_claim(notice) -> (user_id, email, kind, event_at, undelivered)`,
  `operator_key_notice_sent(notice, message_id, request)`, `operator_key_notice_failed(notice, error_name, permanent,
  request)`. `operator_record_mail_event` and `operator_mail_expire` replaced in place (signatures unchanged).
- **Refusals the handlers map to words (SQLSTATE 23514 with this constraint name unless said):**
  `hardware_key_sign_in_not_before`, `hardware_key_one_live`, `hardware_key_credential_once` (23505),
  `hardware_key_registration_closed`, `hardware_key_removal_not_own_account`, `hardware_key_removal_open_once`
  (23505), `hardware_key_removal_two_people`, `hardware_key_removal_in_time`, `hardware_key_removal_decided`,
  `hardware_key_removal_requester_left`, `hardware_key_registration_not_closed`,
  `hardware_key_registration_open_once`, `hardware_key_removal_target_acts`, `user_session_hardware_key_live`,
  `user_session_key_registration_closed`, `user_session_key_digest`, `membership_ended_is_recorded_by_the_end`; not
  a platform administrator seven days in the role with a fresh key session: 42501; no such account or removal: P0002.
- **Also changed:** the Drizzle schema (`packages/db/src/schema/identity.ts`, `operations.ts`, `index.ts`: the four
  tables, the column, `MAIL_KINDS`), `packages/db/domain-model/areas.json`, `cross-check.ts` (the bytea custom type),
  and the regenerated `docs/product/domain-model.md` and `packages/db/functions` (35 files written). **The approval
  line is blank.** A later migration edit or schema change means regenerating again.

### What is green
- `pnpm test:db`, whole, on PostgreSQL 18: **173 files, 10,372 passed, 1 skipped, 0 failed** (30 minutes here; give
  it a budget over 25). That includes W32's 26, the catalog test and the cross-tenant test (both read the live
  catalog, so the four tables are covered), `pnpm db:domain-model --check`, `pnpm typecheck` and `pnpm lint`.
- **Tests changed, each to state the new truth, none skipped or loosened:**
  - `packages/db/src/key-registry.db.test.ts`: SGN-23's seeded stale session moves `expires_at` with `started_at`.
  - `packages/db/src/sign-in-not-before.db.test.ts` (ADR 0093 D4, the orchestrator's ruling of 06:55 UTC): "does not
    check a row with no start" stays; "nor locks" became what is locked (FOR NO KEY UPDATE: a second taker is refused,
    a key-share lock passes), until the transaction's end.
  - `packages/db/src/password-notice.db.test.ts`: the mail recorder's live body is 20261111090000's with exactly
    three additions. `hardening.db.test.ts` and `migrate.db.test.ts`: the reserved actions and the table list.
  - `apps/web/src/lib/auth/sign-in.db.test.ts`, SGN-19's two cases ("open until Queues item 37"): the step begun
    before End membership is now refused (`step_before_reset_mfa`, `step_before_reset_register_key`).

### Measured (step C; synthetic rows: 1,000,000 `audit_event`, 1,000,000 `mail_send`, 200,000 `user_session`)
- **File 1, whole, quiet database: 107 and 127 ms** (two runs); its five table locks are held for less than that.
  The note's bound (well under a second) holds. Beside a transaction that had read `user_session` and written
  `audit_event` and stayed open 4 s: applied 4.1 s after it started (it retried each second, NOWAIT), and a read of
  `user_session` plus a write of `audit_event` made meanwhile took 54 ms: nothing queued behind the migration.
- **File 2: 649 ms whole** (72, 424 and 324 ms a validation; SHARE UPDATE EXCLUSIVE); an insert into `mail_send`
  during a validation took 47 ms.
- **The session-open path: no round trip added** (no application statement changed; the check rides the session's
  INSERT in the trigger). One session insert with a start, alone: 1.03 ms before, 1.05 ms after. Eight in parallel
  for ONE account: 5.6 ms before, 6.4 ms after (they already queued on the account's row since ADR 0093). The
  previous image's insert (no start), eight in parallel for one account: 1.9 ms before, 5.8 ms after: it now queues
  on the same row, which is the ruling's point 3. No bound of the note is broken.
- **No deadlock:** 20 s, 12 clients, one target account: session inserts, End membership, a recorded reset, removal
  requests and confirmations mixed: 24,757 transactions, 0 failed, **0 deadlocks**, 1,426 removals confirmed, and no
  open session begun at or before the mark. **The lock order, for the note and ADR 0095:** a membership row (End
  membership only), then the account's `"user"` row (FOR NO KEY UPDATE), then the removal row, then key rows, then
  session rows, then outbox and notice rows. No path takes the account's row and then a membership row; the
  confirmation reads `membership` without a lock and locks only the target's account, never an administrator's.

### Decisions the migration takes beyond the note (each to be said in ADR 0095 and the PR)
1. `hardware_key_removal.address_sha256` (SHA-256 of the removal's ID, a colon, the lower-cased address at the
   request): the note's `"user".updated_at` moves with every sign-in and with the confirmation itself, so it cannot
   say whether the address changed. The notice's claim compares the digest and fails the notice as `AddressChanged`
   (reported; the row returned has no address and `undelivered = true`: the job logs it and commits).
2. `hardware_key_notice.event_at`, not `removed_at` (two of three kinds are not removals).
3. `operator_mail_expire` replaced in place so key notices expire (the note gave the column and no reader).
4. `hardware_key_removals()` asks `organization.manage`, not the seven days: a new administrator sees the list.
5. Two more helpers granted to no role: `hardware_key_opening_usable(uuid, timestamptz)`,
   `hardware_key_notice_report_undelivered(uuid, text)`. Code digests are compared after a second SHA-256 each side.
6. `operator_record_mail_event` keeps its seven columns: an undelivered key notice is on the audit log
   (`hardware_key_notice_undelivered`), not in a result column.
7. `hardware_key_record` raises on a wrong code, so it counts no try; only `judge` counts. **The flow must call
   `hardware_key_registration_judge` first** and pass the digest on only after `open`.
8. `provider_signed_out` does not record which outcome (`signed_out` or `no_such_user`); the job's log line should.

### Named points for the build's two reviews
- **Auth review (the ruling's point 4):** every session insert now takes the account's row, the previous image's
  included, which ADR 0093 D4 had left unlocked on purpose ("it would then always land after the reset, never
  swept"). What D4 protected still holds for the new image (its inserts carry a start and are refused after the
  mark). For the previous image's no-start insert during a deploy or a rollback, the lock makes "lands after the
  reset, unswept" certain where it was a matter of timing; against that, a removal's confirmation now always sees
  or refuses it. ADR 0095 needs the dated section amending D4 that says so, and "What the founder should know"
  a line (ADR 0093 was approved with #142).
- **Auth review:** `hardware_key_record` is an uncounted check of a code digest for whoever holds the application
  role (decision 7); the 40 bits and the hour bound it.
- **Database review:** `membership_removal_target_holds` holds while a request is `requested`, including one past
  its 24 hours that the job has not yet marked expired (at most a minute).

### What is left of item 37 (the note's steps 3 to 7; none started)
The handlers and `sign-in.ts` plumbing; the four console routes; the code screen; the worker's `provider_sign_outs`
and `hardware_key_notices` jobs and the sign-out adapter; removing `signOutAtProviderAfterCommit` and the reset's
call; the rest of the tests (SGN-21, SGN-22, SGN-26, the flow's SGN-19 and SGN-27, the notice's five functions,
JOB-08, the migration's own preflight and lock-loop tests); the two build reviews; ADR 0095; the test-matrix rows;
the runbooks; the PR with `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs
list` and the approval line posted as a suggestion, never written.

### Machine notes
PostgreSQL 18 stops when the container sleeps: `cd / && runuser -u postgres -- /opt/pg18/bin/pg_ctl -D
/root/pgdata18 -l /root/pgdata18/server.log -w start -o "-p 5433 -k /tmp"`. Database tests:
`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm -s vitest run --project db <files>`.
One slip, corrected at once and told: W33's first marker trap used a relative path after a `cd`, so the marker
outlived one command; nothing but W33's own rename was written while it stood. Use an absolute path in the trap.
**W33 holds nothing else:** no PR, no subagent, no scheduled task; its scratch databases and files are disposable.

## The earlier block (2026-11-12, W32, session_019i9ifC7PLenwLnTRu7ZVhZ; handed over at about 240k tokens)

- **Brief:** build item 37 from the note; the orchestrator's brief of 2026-11-12 06:20 UTC (steps 1 to 7) stands for
  the successor. Rulings: Q1 yes, Q3 yes; Q2 is the founder's. No PR until the orchestrator says #156 has merged.
- **The note:** `designs/lane-a-key-registry.md` **v3** (build-ops 83be44b6 or later). **Section 16 rules** where it
  differs from sections 2 to 14: one live key an account; registration after a removal closed until opened with a
  one-time code; a code session of a closed account refused in Postgres; the target of an open request changes no
  internal membership; the acting session as an argument (`actor_key_session`); the outbox's late and given-up arms.
- **Step 1, done:** `reviews/lane-a-key-registry-review-delta1.md` (R1 to R11; two blocking, both taken; it ran no
  SQL). Every finding verified and placed in section 16's table. No second round on the note. To the queue from it: a
  backup key from inside a session; an operator retry of a given-up sign-out; a second person for End membership in
  the internal organization; seven days measured on the person's key, not the membership row.
- **Step 2, half done. WIP `co-001/wip-key-registry` c0c43f2d** (base 93e137f9), two files, failing first (26 tests,
  each because the objects do not exist; type-check and lint clean):
  - `packages/db/src/key-registry.db.test.ts`: SEC-25, SEC-26, SEC-27, SGN-20, SGN-23, SGN-24, SGN-25, SGN-27.
  - `packages/db/src/provider-sign-out.db.test.ts`: JOB-06, JOB-07, SGN-19's database rows.
  They fix the names the migration must use: the function signatures (SEC-25's table, including the three helpers
  `account_removes_keys(uuid)`, `actor_key_session(uuid)`, `account_key_registration_closed(uuid)` and the two
  finality functions `hardware_key_is_final()` and `hardware_key_removal_is_final()`), and every constraint name.
  They were never run against a migration: expect to adjust details (for example `wait_minutes` after a claim).
- **BLOCKED: the migration.** `/new-migration` cannot be run by a session (the skill is for a person's typed command
  only; the hook refuses any write under `packages/db/migrations` without its marker). Told to the orchestrator
  2026-11-12. It needs the co-founder to type `/new-migration key_registry` in the building session, or their word
  there. No migration file, marker or draft SQL exists anywhere. Nobody routes around it.
- **Not started:** the rest of step 2's tests (SEC-25's lists in `catalog`, `cross-tenant`, `migrate.db.test.ts` and
  `hardening.db.test.ts`; SGN-21, SGN-22, SGN-26 and the flow's SGN-19 and SGN-27 in `sign-in.db.test.ts`; the
  notice's five functions; JOB-08; the migration tests); steps 3 to 7 entire (handlers, the four console routes, the
  flow's own assertion check and the code screen, the worker's two jobs and adapter, the measurements, the domain
  model, the two build reviews, ADR 0095, the test-matrix rows, the runbooks, the PR description).
- **What does not need the migration, for the successor to start on:** `sign-in.ts` plumbing (the challenge sealed at
  `beginKey`, the response passed to `authenticated()`, the app's own assertion and registration verification, the
  relying-party check), the dev provider twin's listing and deleting of credentials, the worker's sign-out adapter
  and job with fakes, the removal of `signOutAtProviderAfterCommit` and the reset's call.
- **Machine notes:** PostgreSQL 18 answers on `localhost:5433` and the `/tmp` socket, not `/var/run/postgresql`; run
  database tests with `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm -s vitest run --project db
  <file>`. The setup script moves the checkout to `claude/build-platform`: check out the WIP branch after it.
- **Numbers:** ADR 0095; SGN-20 to SGN-27; SEC-25 to SEC-27; JOB-06 to JOB-08. None released, none added.
- **For "What the founder should know" (to carry into the PR text):** a rollback leaves staff unable to sign in until
  roll-forward; staff re-register keys once at deploy, and no removal is possible until two administrators have;
  Q2 (at least three platform administrators, each seven days in the role); after a removal the member needs a
  one-time code from an administrator, by voice, to register the next key; one key an account for now.
- **W32 holds nothing else:** no PR, no open subagent, no scheduled task.
