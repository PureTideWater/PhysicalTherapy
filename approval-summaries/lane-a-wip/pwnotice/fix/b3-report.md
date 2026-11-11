# B3 (records and infra): final report

All nine items are done as plain changes in `/home/user/pwnotice`; nothing is committed. 16 files changed, all on my list (730 insertions, 240 deletions). I reconciled every sentence against the other builders' files as they stood at 06:47 UTC; files they change after that are unchecked.

State at finish:
- Infra and observability suites green (32 files, 904 tests).
- eslint clean on my seven TypeScript files; `tsc --noEmit` clean for infra, observability and synth.
- Copy lint passes ("603 files read"); `pnpm -s lint:logs` passes ("1195 files scanned").
- No database of mine left, no scratch file in the worktree.
- **One red left for you:** `packages/synth/src/fixtures.test.ts` is `1 failed | 22 passed (23)`. The failure is `fixtures/synthetic/SGN-16/expected.json`, which waits on your `pnpm synth --all`.

## Per item: files, red, green

**1. ADR 0091**
- File: `/home/user/pwnotice/docs/adr/0091-tell-an-accounts-address-when-its-password-changes-from-an-outbox-the-database-writes-in-the-changes-own-transaction.md`. Style and decision numbering kept; new last section "Review round of 2026-11-11".
- Red: none (a record).
- Green: the repository has no docs link check, so I wrote one. Result "9 files, 18 links, 71 paths, 14 cited runbook sections; 0 bad" in `<W6 scratchpad>/fix/b3/link-check-3.out`.

**2. Deploy runbook**
- File: `/home/user/pwnotice/docs/runbooks/deploy-and-rollback.md`, section "Password-changed notices".
- Red: none.
- Green: its three SQL statements ran as `tp_operator` on a database migrated from empty with the 49 delivered migrations (`<W6 scratchpad>/fix/b3/runbook-sql-final.out`). `packages/db/src/migrate.test.ts`, which reads this runbook, passes with `controls.test.ts` (2 files, 35 tests).

**3. Deliverability runbook**
- File: `/home/user/pwnotice/docs/runbooks/deliverability.md`, section 1's outbox paragraph and alarm row, and 3.10.
- Red: none.
- Green: its three statements ran in the same file. The `RecordFailed` case was re-run against the job as finally delivered: `<W6 scratchpad>/fix/b3/exp-record-failed-final.out` (five copies, a `password notice record failed` line per try, the undelivered line at the fifth, attempt code `DB_23514`).

**4. Support-mail runbook**
- File: `/home/user/pwnotice/docs/runbooks/support-mail.md`.
- Red: none.
- Green: its statement ran. What a reply, forward and automatic reply become at the desk is in `<W6 scratchpad>/fix/b3/screen-reply.out`.

**5. Incident-response runbook**
- File: `/home/user/pwnotice/docs/runbooks/incident-response.md`: section 0, section 2, the sessions-not-ended section, the new section "A password reset whose provider sign-out failed", weekly review steps 4 to 6.
- Red: none.
- Green: its statements ran (the new one returns `hardware_key_registered` and `sign_in`). What End membership does is in `<W6 scratchpad>/fix/b3/exp-end-membership.out` and `<W6 scratchpad>/fix/b3/exp-invite-again.out`. No SQL is given for the break-glass session.

**6. Infra**
- Files: `/home/user/pwnotice/infra/lib/security-events.ts`, `/home/user/pwnotice/infra/lib/constructs/monitoring.ts`, `/home/user/pwnotice/infra/lib/constructs/mail-streams.ts`, `/home/user/pwnotice/infra/test/monitoring.test.ts`, `/home/user/pwnotice/infra/test/mail-streams.test.ts`.
- What changed: a ninth count `PasswordResetProviderSignOutFailed` on the line `security event: password reset provider sign-out failed` (1 in 300 s) with its alarm description; the `PASSWORD_NOTICE_UNDELIVERED` description per UX-04 (d); line 266 per UX-08.
- Red: `pnpm -s exec vitest run --project unit infra/test/mail-streams.test.ts infra/test/monitoring.test.ts` gave `17 failed | 132 passed (149)` (`<W6 scratchpad>/fix/b3/red-infra-1.out`). The alarm-words test added afterwards gave `3 failed | 93 passed (96)` (`<W6 scratchpad>/fix/b3/red-monitoring-2.out`).
- Green: the same two files `149 passed (149)`. `pnpm -s exec vitest run --project unit infra packages/observability` gave 32 files, `904 passed (904)` (`<W6 scratchpad>/fix/b3/green-infra-all-3.out`).

**7. Log-field comment**
- File: `/home/user/pwnotice/packages/observability/src/fields.ts` (comment only).
- Red: none.
- Green: lint:logs passes; observability tests are in the 904.

**8. SGN-16**
- Files: `/home/user/pwnotice/docs/product/test-matrix.md` and `/home/user/pwnotice/packages/synth/src/cases/matrix.ts` (same 2,443-character assertion, title unchanged). `registry.ts` is unchanged: no new test file exists.
- Red: at HEAD `matrix.ts` does not hold the new row.
- Green: the worktree does (`<W6 scratchpad>/fix/b3/matrix-row-parity.out`); the parity test is among the 22 that pass.

**9. Other records**
- Files: `/home/user/pwnotice/docs/adr/0014-audit-log-retention-classes-and-platform-jobs.md` (amendment), `/home/user/pwnotice/docs/adr/0065-send-mail-in-three-ses-streams-record-each-messages-delivery-send-notices-from-an-outbox-and-pause-the-screening-stream-alone.md` (note), `/home/user/pwnotice/docs/adr/0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md` (one bullet).
- Left as another change's: ADR 0081's quote of #125's original words (a sentence follows it); the web's locked refusal that says "from this address" (`apps/web/src/lib/routes/sign-in.ts`); the migration's header (B2's); `docs/product/domain-model.md` (generated).

## Not done, and why

- **Nothing that needs AWS.** The four Logs Insights queries, the alarms in an account, SES and Cognito were not run. The field names in the queries are the ones the delivered log calls write.
- **Not my files:** the database and e2e suites, and a whole-repository typecheck.
- **The synth generator**, as instructed.
- **ADR 0088's D7 table and SEC-23's row** are not edited for the ninth count. D15 says so, as it did for the eighth. Say if you want them edited.
- **`registry.ts`'s SGN-16 list** does not gain `packages/auth-mail/src/render.test.ts` or `apps/worker/src/mail/mail.test.ts`, which now hold the lines, the Reply-To and the text footer. The ADR names them "beside SGN-16's list".

## Found, not foreseen by the rulings

1. **A single failing record does not trip the failed-job alarm.** One notice's failed record fails one attempt, then the notice backs off, so pg-boss's retry 30 seconds later succeeds. The page is the `RecordFailed` line at the fifth try, up to 81 minutes later. Three notices failing together would trip it. This is from the queue options and the code, not run with pg-boss. The records claim only that the attempt fails.
2. **End membership fails when the provider's sign-out fails.** It is one transaction with the sign-out: if the provider refuses, the page errors and nothing is ended. That is the exact situation of the new page, so the runbook sends that case to the founder.
3. **A key registered in D10's case (b) is removed by nothing the operator has.** Neither a reset nor End membership removes it. The runbook sends it to the founder in every case; it belongs in the close's scope.
4. **A user ID alone does not find the member.** The console's organization page lists members by sign-in email and shows no user ID. The runbooks give a practice lookup by SQL, then the founder (UX-05 (b) is deferred).
5. **Settings cannot restore a role after End membership.** It refuses an address that already has an account, so only a platform administrator's console Send invitation does (it restores at once and mails nothing). UX-06's "the administrator invites them again" would have been wrong.
6. **End membership is refused for an organization's only practice administrator.**
7. **Support mail after containment.** A membership-ended account's mail still opens tickets; a disabled account's does not (`unknown_sender`). The playbook's order follows from that.
8. **Most replies arrive withheld.** With Reply-To, a reply that quotes the email, a forward, or a new message naming the time is withheld by the PHI screen; only a reply with the quote removed is readable. Until UX-01 (2)'s second half is built, the desk cannot tell these from other withheld mail. The playbook says how to answer them.
9. **DB-05's per-table vacuum check cannot work as the operator role.** `pg_stat_progress_vacuum` shows `tp_operator` that a vacuum runs but not on which table (`<W6 scratchpad>/fix/b3/vacuum-visibility.out`). The runbook gives a database-wide count.
10. **`operator_password_notices_due(100)` does not list everyone who waits in a rollback.** It lists only notices due a try and inside the cutoff. I added an audit-log statement, and a paragraph for notices pending from before the rollback (the job's last minute, a retry in progress, or the job already broken).
11. **"Five copies at most" is not absolute.** A try that cannot be counted either (database lost between SES's answer and the record) leaves the notice due. Consequences says so.
12. **A third completed reset neither queues nor pages:** Cognito applies the confirm and its answer never reaches the app (from B1b's report; unproven without a user pool). D15 records it; a counted line could cover it.
13. **A plain `Error` is counted as a refused send though SES accepted the message.** The SES sender throws it when SES accepts a message without an ID. The runbook says the worker's own error names mean "most often" before SES.
14. **The audit log cannot tell whose sign-in it was.** On the provider sign-out page, the person's own sign-in after their reset looks like another party's. The runbook says contain first, then ask.
15. **Two stale wordings fixed in my files:** `mail-streams.ts`'s header said "eight" counted lines (now nine), and the `PasswordResetSessionsNotEnded` description said "end the account's access" (now "sessions", which is what the control does; pinned).

## Sentences that depend on another builder's work

**B1a (worker, auth-mail, tools)**
- The four email lines as quoted in ADR 0091 D5 and D10, ADR 0081's bullet, SGN-16's row and the support playbook. They rest on `passwordChangedLines(changedAt, supportEmail, secondFactorEnrolled)`; checked word for word.
- "Reply-To the support address (a per-message `replyTo`)" in D5, D6, ADR 0065's note, deliverability section 1, the support playbook and SGN-16.
- "The `account` variant's footer ends both alternatives" (`mailBody`), and "`words.ts` and `mail.ts` are edited for these; the template's frame is unchanged" (D5). The `template.ts` diff is a comment only.
- The R7 behaviour in D6, D8, D13, the residue, ADR 0014's amendment, 3.10's `RecordFailed` case, SGN-16 and the `fields.ts` comment:
  - a failed record is counted as `RecordFailed`, never permanent, in a new transaction, then rethrown;
  - `password notice record failed` (warn) marks each such try;
  - the fifth try logs the undelivered line before the rethrow;
  - a try that cannot be counted leaves the notice due;
  - an error before the send is uncounted.
  `password-notices.ts` changed at 06:35; I re-read it in full and re-ran the experiment afterwards.
- "A run stops claiming notices once it has spent 8 seconds sending (`PASSWORD_NOTICE_RUN_MS`)" in D6, ADR 0014 and SGN-16.
- "Each line is written once its report has committed: in `mail_events`, before the event's message is deleted from the queue" (D9, deliverability).
- "`password notice sent` with the same `password_notice_id`; a notice never recorded as sent has no such line" (3.10 step 2), and the deploy runbook's "leave out each reset the platform log shows sent".
- "The copy lint reads the job's file" (review-round section).
- "What proves it": the worker tests named there.

**B1b (web)**
- "The web's reset looks the account up before it asks Cognito to change the password": Context, D1, D12, D15, the deploy runbook (forward deploy and the third rollback bullet), SGN-16.
- Both counted lines, their fields, and "the sign-out that follows every completed reset": D10, D15, the `security-events.ts` docblocks, both alarm descriptions, the new runbook section's step 1. `infra/test/monitoring.test.ts` pins the exact `logger.error(...)` call text in `sign-in.ts`, so an edit there fails my test.
- "SGN-16 holds both cases as tests … named so that the close flips them" (D10, Consequences, SGN-16's row).
- The console label naming the notices (D1, D12, deploy runbook), and the same four kinds in my bounce alarm's words.
- D15's third unreported reset (item 12 above).

**B2 (migration, packages/db)**
- The claim's four columns with `mfa_enrolled` fourth, and no status filter (D4, SGN-16).
- `_sent` reads only a `password_changed` record (D8).
- The preflight compares the SHA-256 of two stored bodies and the policy's whole WITH CHECK "with the values of a database migrated to the 48 migrations before this one" (D11).
- "About 0.3 seconds measured with 500,000 mail records", who waits, and "refused as busy" after three seconds (D11, Consequences, deploy runbook). These match the header, unchanged since 06:21.
- The failure message and 55P03 quoted in D11 and the runbook.
- What `operator_password_notices_due(100)` returns.
- The database tests named in "What proves it" and the review-round section. `password-notice.db.test.ts` was still changing at 06:41; I checked the names at 06:47.

**You (W6)**
- "The pull request's description puts it to the founder" (D5's Reply-To; D10's trade-off and its exact alternative).
- "DB-11 is the pull request description's."
- "Each tracked in `approval-summaries/lane-a-auth-emails-status.md` ("Follow-ups")". The file in `/home/user/ops` already lists them.
