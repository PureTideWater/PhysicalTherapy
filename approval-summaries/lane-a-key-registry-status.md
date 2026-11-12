# Status: Queues item 37, the key registry (Lane A)

## RESUME-BLOCK (2026-11-12, W33, session_019i9ifBTTYtTEJn5cydNmex): the database half is DONE; next is the note's step 3 (handlers and the job)

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
