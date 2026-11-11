B1a: all nine items are built, each with a failing-first test, and everything of mine is green. Nothing committed; no scratch file is left in the worktree and no database of mine is left.

Proof outputs are in `<W6 scratchpad>/fix/b1a/` (file names below are in that directory). Commands, all run from `/home/user/pwnotice` under `flock /tmp/laneb-heavy.lock`:
- unit: `pnpm -s exec vitest run --project unit <file>`
- db: `DATABASE_URL=postgres://postgres:test@localhost:5433/tp_pwn_w6_1 pnpm -s exec vitest run --project db <file>`

Final state: eslint clean on my 16 changed source files; `tsc --noEmit` exit 0 in `packages/auth-mail`, `apps/worker`, `tools` and `apps/web`; `pnpm -s lint:logs` and `pnpm -s lint:copy` pass; 75 unit files / 1,031 tests pass across the worker, auth-mail and the two lint tools; the seven worker database files that send mail pass (112 tests).

## Per item

**1. DB-01**
- Files: `/home/user/pwnotice/apps/worker/src/platform/mail-events.ts` (the four not-delivered lines now precede `options.source.remove(message)`; header step 4), `/home/user/pwnotice/apps/worker/src/platform/mail-events.db.test.ts` (two cases).
- Red: db `mail-events.db.test.ts -t "DB-01"` before the move: 2 failed | 15 skipped; the lines over the two runs were `[]` (`db01-red.out`).
- Green: 2 passed | 15 skipped; whole file 17 passed. The reviewer's `lost-page.mts` on a freshly migrated copy went from 0 to 1 `PASSWORD_NOTICE_UNDELIVERED` line (`proofs/lost-page.after.out`). Four order mutants each fail a case.

**2. R7**
- Files: `/home/user/pwnotice/apps/worker/src/platform/password-notices.ts` (`send()`'s catch; `PASSWORD_NOTICE_RECORD_FAILED = 'RecordFailed'`), `password-notices.test.ts` (six cases), `password-notices.db.test.ts` (two cases).
- Red: unit `password-notices.test.ts` against the old job: 14 failed | 9 passed, all six R7 cases among them (`pn-unit-red.out`). Db: a scratch copy of the db file against HEAD's job (removed): 5 failed | 7 passed, both R7 cases among them (`pn-db-red.out`).
- Green: unit 23 passed; db 12 passed. Reviewer's `resend.mts`: 1 failed run, 1 message, `attempts: 1, due: false` (was 6, 6, `attempts: 0, due: true`). `head-of-line.mts`: "6 runs, 1 failed: the first account was sent 1 messages; the second account, behind it, 1" (was 6 failed, 6 and 0).

**3. R10**
- Files: `password-notices.ts` (`PASSWORD_NOTICE_RUN_MS = 8_000`, `PasswordNoticeOptions.now?: () => number`, real clock by default), the same two test files.
- Red: in the runs above, three of the four unit cases and the db case fail on the old job. The fourth unit case (clock starts at sending, not at the sweep) passes on the old job and is killed by a mutant.
- Green: as above. Reviewer's `pool.mts`: `password_notices` done in 8.2 s with 40 of 70 sent and 30 left pending; `support_grant_notices` and `dunning_notices` done in 7.7 s (both failed at 10.0 s before) (`proofs/pool.after.out`).
- The result type is unchanged: see "Not done".

**4. R3 and R4**
- Files: `/home/user/pwnotice/packages/auth-mail/src/words.ts` (`passwordChangedLines(changedAt, supportEmail, secondFactorEnrolled)`, R4's four lines exactly, apostrophe U+2019 as the sign-in screens write it; docblock), `render.test.ts`, snapshots `password-changed.{html,txt}` updated and `password-changed-not-enrolled.{html,txt}` new. Worker: the claim is read as `SELECT user_id, email, changed_at, mfa_enrolled …`; `passwordNoticeMessage` gains a fifth parameter.
- Red: unit `render.test.ts -t "the password-changed email"`: 3 failed | 1 passed | 47 skipped (`r4-red.out`). The worker's cases are in the red runs of item 2.
- Green: 4 passed | 47 skipped; whole file 51 passed.

**5. R5**
- Files: `/home/user/pwnotice/apps/worker/src/mail/mail.ts` (`MailMessage.replyTo?`; SES sends `message.replyTo ?? sender.replyTo`; the local outbox writes a `replyTo` key only when the message names one; the memory sender keeps it), `mail.test.ts`, `password-notices.ts` (`replyTo: supportEmail`), `jobs/platform.test.ts`.
- Red: unit `mail.test.ts`: 4 failed | 19 passed, two of them R5's (`r5-r11-red.out`).
- Green: 23 passed. The existing "a customer stream's message has no Reply-To" and screening cases pass unchanged.

**6. R11**
- Files: `mail.ts` (`mailBody`), `mail.test.ts`.
- Red: the other two of those 4 failures.
- Green: 23 passed. The existing byte-for-byte cases for a customer's and a prospect's text pass unchanged, and a new pin holds all three non-account shapes, with and without a link.

**7. UX-12**
- Files: `/home/user/pwnotice/tools/brand-copy/scan.ts` (COPY_FILES and its docblocks), `scan.test.ts` (the pinned real-tree list and the fixture list).
- Red: 2 failed | 42 passed (`ux12-red.out`).
- Green: 44 passed; `lint:copy` now reads 603 files (602 before) and finds nothing.

**8. DB-10, the worker's half**
- File: `password-notices.db.test.ts` (`databaseClock()`, `expectAMinuteOn()`): the next try must lie between "database clock before the run + 60 s" and "database clock after the run + 60 s".
- This is a test-only change, so the proof is by stall and mutation rather than red/green on code. With a 12-second `pg_sleep` between the run and the read, the new case passes and HEAD's fails ("expected 48 to be greater than 50") (`db10-new-stalled.out`, `db10-old-stalled.out`).
- Not weakened: a first step of 0 minutes and of 5 minutes, mutated in the test's own database, each fail it (`db10-mutant-0.out`, `db10-mutant-5.out`).

**9. Docblocks**
- Rewritten to the new behaviour: the job's header (new step 5, the 8 seconds, `mfa_enrolled`, Reply-To; "the web is unchanged" removed), the words' docblock, `mail.ts`, `template.ts` (`MAIL_FOOTERS`), `mail-events.ts` step 4, `scan.ts`, the test files' headers, and one sentence each in `config.ts` and `jobs/platform.ts`.

Eleven mutants of the job (`mutants/run.sh`) are each killed by its unit tests.

## Not done, and why
- **No count of what a run left.** The result type counts what a run did to notices, and the due list is capped at 100, so a "left" figure would be "listed and not reached", not the backlog. Nothing counts the remainder of the 100 cap either, so I left the result as it is.
- **Not run:** the e2e suite, the web's own tests, and the database suite beyond the seven worker files above.
- **`packages/synth/src/fixtures.test.ts` fails** on `SGN-16/expected.json`. That is B3's `matrix.ts` edit waiting for your `pnpm synth --all`, not my files.

## Found, not foreseen by the rulings
1. **R7 does not raise the failed-job alarm for a single bad notice.** The attempt fails once (`job attempt failed`, warn), but pg-boss retries 30 to 60 s later, by when the notice has backed off, so the retry completes and `job failed on its last attempt` is never written. The operator hears only at the fifth try, about 81 minutes after the first copy, through `PASSWORD_NOTICE_UNDELIVERED` with reason `RecordFailed`. DB-02's "the failed-job alarm still tells the operator" should not go into the ADR or runbook as written.
2. **I added one log line beyond the ruling's letter**, because of point 1: warn `password notice record failed` with `password_notice_id`, `user_id`, `error_code: 'RecordFailed'`, on each such try, before the try is recorded. Without it, tries one to four leave no line naming the notice. ADR 0091 D13 lists the job's lines, so either add it there and to runbook 3.10 or strike it (one statement, and the `recordFailedLine` assertions in the unit and db files).
3. **`RecordFailed` joins the `undelivered_reason_code` set.** The comment in `packages/observability/src/fields.ts`, ADR D9/A-1 and runbook 3.10 (B3's) should count it.
4. **DB-01's loss window remains for the pause.** As ruled, `pausedNow` stays after the delete. If the delete fails after a record that paused the screening stream, `MAIL_STREAM_PAUSED` is never logged; the next run disables the set as `MAIL_STREAM_DRIFT` (a warn). A test now pins this order.
5. **The sibling outboxes have the pre-fix DB-02 loop.** `apps/worker/src/platform/support-notices.ts:187-190` and `apps/worker/src/billing/dunning.ts:240` rethrow an error after an accepted send uncounted, and neither bounds a run by time. Base behaviour; not touched.
6. **Bare `SEC-0n` finding IDs collide with the test matrix's own SEC-01 to SEC-23 cases** (SEC-03 is "firm user after grant expiry"). My code and titles cite `docs/adr/0091, R3/R4/R7/R10/R11` and "the review of 2026-11-11, DB-01/DB-10" instead; if the ADR's last section renames the rulings, these follow. B2's `packages/db/src/password-notice.db.test.ts` has two bare ones: "(docs/adr/0091 D10; SEC-03)" and "(SEC-08)".
7. **R10's margin is 8 s plus the last send.** A single SES send slower than about 2 s still passes the pool's 10-second wait, and no timeout is set on the SES call.
8. **Names other builders may need.** The local outbox key is `replyTo` (B1b's e2e already reads it). `PASSWORD_NOTICE_RUN_MS` and `PASSWORD_NOTICE_RECORD_FAILED` are exported from `password-notices.ts`, not through `runtime.ts`.
9. **SGN-16's `assertedBy` list** omits `apps/worker/src/mail/mail.test.ts` (the SES Reply-To header, the text footer) and `packages/auth-mail/src/render.test.ts` (the exact words, both variants). The listed worker files assert the not-enrolled line and the reply address at message level.
