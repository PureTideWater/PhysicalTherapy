# password-changed-notice: the fix round's rulings (W6, 2026-11-11)

Three reviews of f8560588 (the same tree as the branch head 68895f0f, which only adds the base merge and the
regenerated provenance line): security and sign-in (`reviews/sec/findings.md`, SEC-01 to SEC-09), database, mail and
deploy (`reviews/db/findings.md`, DB-01 to DB-11), UX and brand (`reviews/ux/findings.md`, UX-01 to UX-13). Each
finding was checked against the code or its evidence before this was written. Every finding is real; none is "not a
defect". What follows is what is built in this round, by whom, and what is deferred and where it is tracked.

## The rulings that needed a decision (W6, under the co-founder's standing instruction; each reversible by the founder)

R1. **SEC-01 (ADR 0091 D10's gate).** Both cases are true: (a) a sign-in step that proved the old password before a
reset opens a session when its second factor is answered after it (the step's 3 minutes); (b) a key-registration step
begun before a reset registers a hardware key after it when the provider's sign-out had no effect (its 15 minutes).
Option (b) of D10 (a narrower line carried from the provider's sign-out result) is NOT taken: it would cover only case
(b), the rarer one, leave case (a) untouched, and cost what D10 already said (the web, the words, a race with the
claim). The real close is to refuse to open a session or register a key from a step begun before the account's latest
completed reset; it changes sign-in and the "user" row, so it is its own reviewed change (SEC-N5's place in Schema PR 6;
it needs no fact about Cognito's auth_time) and it is REQUIRED BEFORE LAUNCH. In this pull request: D10 says both cases
plainly; SGN-16 gains both as cases (tests that record what a step begun before a reset can do today, named so the
close flips them); `security event: password reset provider sign-out failed` is counted, alarmed and given a runbook
step, so case (b) pages a person. The email keeps "Every session of this account has ended." (the sign-in screen's own
sentence). The pull request's description puts this to the founder as a trade-off with its exact alternative (hold
this pull request until the close is built into it).

R2. **SEC-02.** Built: `confirmPasswordReset` looks the account up BEFORE the provider's confirm, so a database that
cannot be reached changes nothing at the provider and every failure after the password changed has the user's ID and
ends in D15's line. The answer for an address with no app account stays as it is (the provider's confirm still runs).

R3. **SEC-03.** Built, option (1): the claim also returns `mfa_enrolled`, and line 2's second sentence is sent only to an
enrolled account. Not enrolled: line 2 is "Every session of this account has ended." alone. D10 also says plainly that
"tokens live only in the sealed cookie" and "only the app can start ForgotPassword" hold once the client is
confidential (ADR 0088's release N+1, ruling 15: before the first customer invitation). The staging smoke list gains
the `WriteAttributes` check.

R4. **The email's words** (UX-02, UX-03; words.ts is edited after all). Exactly:
  1. `The password for your ${brandName} account was changed at ${utcMinute(changedAt)}, with a code sent to this address.` (unchanged)
  2. enrolled: `Every session of this account has ended. Signing in still asks for your authenticator code or hardware key.` (unchanged); not enrolled: `Every session of this account has ended.`
  3. `If you changed it, ignore this email.`
  4. `If you did not, write to ${supportEmail} now from the address you sign in with, and tell your organization’s administrator. We will help you secure the account.` (the apostrophe as the file's other lines write one)
Why: line 3 was untrue for a locked account, which is told on purpose; line 4's one route ends in silence for a sender
whose domain SES cannot verify and for a disabled account, so it names a second route that needs no inbound mail, in
the screens' own words ("the address you sign in with").

R5. **Reply-To** (SEC-09, UX-01 (2)). Built: this one kind is sent with Reply-To the support address (a per-message
`replyTo` on the mail message; the stream's sender is unchanged), as the screening stream has by the founder's ruling
Q12. Disclosed in the description for the founder to refuse. The withheld ticket's subject naming the notice (UX-01
(2), second half) is deferred: it changes the support inbox's PHI screen (ADR 0055), which is its own reviewed change.

R6. **SEC-04 / UX-06.** The runbooks name what exists: End membership (Console, Organizations, the organization, End
membership beside the person: it ends every session of the user and signs them out at the provider) and, when the
membership must stay or the account must be disabled at the provider, the founder's break-glass by user ID. No SQL
for the break-glass session is invented here. Section 2's "Console → Users" line is corrected with them.

R7. **SEC-07 / DB-02.** Built: a record that fails after SES accepted the message counts as a try
(`operator_password_notice_failed(notice, 'RecordFailed', false, request)` in a new transaction, then the error is
rethrown, so the job still fails). At most five copies, no head-of-line wait. The runbook gains `RecordFailed`.

R8. **SEC-08.** Built: `operator_password_notice_sent()` reads only a mail record of kind `password_changed`.

R9. **DB-07.** Built: the preflight compares the SHA-256 of each replaced function's stored body and of the policy's
whole expression with the values of the base, not substrings.

R10. **DB-08.** Built: a run stops claiming new notices once it has spent 8 seconds sending; the next run takes the rest.

R11. **UX-10.** Built: the text alternative of the `account` variant ends with that variant's footer.

## Built in this round, by owner (nobody commits; W6 reads the diff and commits)

### B1: worker, web, auth-mail, tools (code and their tests, failing first)
- DB-01 `apps/worker/src/platform/mail-events.ts`: the lines for what the record returned (the four undelivered
  lines) are written BEFORE `source.remove`; nothing else moves (`pausedNow` and the counters stay). Test in
  `mail-events.db.test.ts`: a source whose `remove` rejects once after a bounce's record; one
  `PASSWORD_NOTICE_UNDELIVERED` line over the two runs (none today).
- R7 `apps/worker/src/platform/password-notices.ts` and its tests; a fifth failed record logs the undelivered line
  (reason `RecordFailed`) before the rethrow.
- R10 the 8-second bound, with a clock the tests can set.
- R3/R4 `packages/auth-mail/src/words.ts` (`passwordChangedLines(changedAt, supportEmail, secondFactorEnrolled)`), its
  tests and snapshots; the worker reads `mfa_enrolled` from the claim (fourth column, after `changed_at`).
- R5 a per-message `replyTo` in `apps/worker/src/mail/mail.ts` (SES sender, local sender, memory sender), set to the
  support address by `passwordNoticeMessage`; tests.
- R11 `mailBody` for the `account` variant; test.
- R2 `apps/web/src/lib/auth/sign-in.ts` and a failing-first case in `sign-in.db.test.ts` (from
  `reviews/sec/exp4_lookup_fails.ts`).
- R1 two SGN-16 cases in `sign-in.db.test.ts` (from `reviews/sec/exp1_step_after_reset.ts` and
  `exp10_grant_after_reset.ts`), each named as an open residual that the close flips.
- UX-08 `apps/web/src/app/console/mail/page.tsx:17`: `Transactional (invitations, codes, digests, password-changed notices)`, and any test that pins it.
- UX-12 `tools/brand-copy/scan.ts` COPY_FILES gains `apps/worker/src/platform/password-notices.ts`; `scan.test.ts`'s pinned list.
- `apps/web/e2e/sign-in.spec.ts` and `e2e/mail.ts`: the journey's assertions follow the new words.
- DB-10 (the worker's half): `password-notices.db.test.ts:175-176`, a wider floor.
- The database tests of the worker need B2's migration: wait for the file `scratchpad/fix/migration-ready` before running any.

### B2: the migration and packages/db (through the marker route; tests failing first)
- R3 `operator_password_notice_claim()` returns `(user_id, email, changed_at, mfa_enrolled)`.
- R8 the kind filter in `operator_password_notice_sent()`; a test (a bounced probe's ID leaves the notice `sent`).
- R9 the preflight's hashes (computed on a database migrated to the base's 48 migrations); a test case for each of the
  preflight's refusals (DB-06, second half).
- DB-03 the header's words: jobs and sign-ins wait and proceed; a signed-in request waits up to its three-second lock
  timeout and is then refused as busy with nothing saved (ADR 0092's amendment, #137); every audited read as well as
  every audited mutation; the measured window (about 0.3 s with 500,000 mail records); the rollout sentence names no
  order the stack does not have; "the web is unchanged" becomes what R2 and UX-08 make true; the dead-letter queue
  keeps an event 14 days (DB-09).
- DB-04 the lock-loop test waits for a new try and asserts the backend holds no lock on the three tables while it
  sleeps (the mutant `reviews/db/loop-mutant.sql` must fail it).
- DB-06 a test that the whole file, applied in one transaction on a database at the previous head, holds relation
  locks on pre-existing tables that are exactly the loop's three (`reviews/db/locks-at-end.sql`).
- DB-10 (the database half): `password-notice.db.test.ts:710-714`, ten seconds inside the cutoff.
- When the migration file is in place and `password-notice.db.test.ts` passes, create `scratchpad/fix/migration-ready`.
- Do NOT regenerate `docs/product/domain-model.md` or `packages/db/functions`: W6 does, once, at the end.

### B3: the records and infra
- ADR 0091: D10 (R1, R3), D15 (R2), D5 (R5, R11), the residue (R7: "one more copy for each run whose record fails, five
  at most"), D9 and Consequences (UX-04: notices that fail while the alarm is raised share its page; DB-01's order),
  D11 (DB-03), D12 (DB-09: 14 days; how to list who waits), A-1 (UX-13), "Revisit when" (SEC-05; the close of R1 as
  required before launch), the staging smoke list (R3; SEC-07: a real SES message ID is recorded), the lines as R4
  writes them, and every "the web is unchanged".
- Runbooks: `deploy-and-rollback.md` (DB-03, DB-05, DB-09, UX-04 (b)); `deliverability.md` 3.10 (UX-04 (a), UX-05 (a),
  UX-13, `RecordFailed`, SEC-17's two slips: a worker-side error's name; the reset that matches the line's notice);
  `support-mail.md` (UX-01 (1), R6, UX-05, replies now arrive by Reply-To and an automatic reply is not a "not me");
  `incident-response.md` (R6 in section 2 and the new section; SEC-06's weekly step; a new step for the provider
  sign-out's page: look in the audit log, as the operator role, for `hardware_key_registered` or `sign_in` by that user
  after the line's time, and contain with R6's control if there is one).
- Infra: the web's line `security event: password reset provider sign-out failed` joins the counted lines with an
  alarm and its description (R1); `monitoring.ts`'s `PASSWORD_NOTICE_UNDELIVERED` description (UX-04 (d));
  `mail-streams.ts:266` (UX-08); `packages/observability/src/fields.ts:55`'s comment (UX-13); their tests.
- `docs/product/test-matrix.md` SGN-16 (the two residual cases, the not-enrolled line, the reply address), with
  `packages/synth/src/cases/matrix.ts` and `registry.ts` if their text or test lists change (`pnpm synth --all` is run
  by W6 at the end).
- Every SQL statement a runbook gives is run first, as the operator role, on a copy of the template database.

## Deferred, each tracked in `approval-summaries/lane-a-auth-emails-status.md` ("Follow-ups") and the description
- The close of SEC-01 (refuse a step begun before the account's latest completed reset): its own change, required
  before launch (the orchestrator queues it).
- UX-01 (2), second half: a withheld ticket that names the notice (the support inbox's PHI screen, ADR 0055).
- UX-05 (b): the console shows a member's and a requester's user ID. UX-06's alternative: a console control that
  disables a user.
- UX-07 and UX-11: the shared email template keeps a date whole and wraps a long address (every email's HTML changes).
- UX-09: the notice's age beside its UTC time (with the baseline's UX-027).
- DB-11 is the description's own: it names the five new grants to `tp_operator` and the definer trigger function.
