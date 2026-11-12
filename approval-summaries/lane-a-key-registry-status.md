# Status: Queues item 37, the key registry (Lane A)

## RESUME-BLOCK, the database half (2026-11-12, W33, session_019i9ifBTTYtTEJn5cydNmex): WAITING for the co-founder's typed commands

- **State:** step A done. Nothing of the migration is in the repository: no file, no marker. W33 waits in its own
  session for the co-founder to type `/new-migration key_registry` and then `/new-migration key_registry_validate`
  (two files: the note's 9.1 and 9.2; the second must be its own file so the first one's exclusive locks are released
  before any scan).
- **WIP `co-001/wip-key-registry` 7e0192af** (base 93e137f9): W32's 26 tests plus one correction (SGN-23's seeded
  stale session moves `expires_at` with `started_at`; `user_session_twelve_hours` refused the seed).
- **The draft** is complete and lives only on W33's machine, outside the repository (the scratchpad's
  `key_registry.template.sql`, `build_sql.py`, `key_registry.sql`, `key_registry_validate.sql`). **If W33's container
  is lost the draft is lost**: a successor writes it again from the note (about 900 lines; the points below are what
  the note does not say). Checked without writing into the repository: both files apply on a database migrated to
  the base, and **the 26 tests pass, 26 of 26**, against it (the runner's reads of the migrations directory answered
  from a scratch copy by a local preload).
- **Decisions the draft takes beyond the note (the safer side; each to be said in ADR 0095 and the PR):**
  1. `hardware_key_removal.address_sha256` (SHA-256 of the removal's ID, a colon, the lower-cased address at the
     request). The note's 7 wanted the notice sent only to the address the account had when the removal was requested
     and offered `"user".updated_at`; that column moves with every sign-in and with the confirmation's own mark, so it
     can never answer. `operator_key_notice_claim` compares the digest, fails the notice as `AddressChanged`, reports
     it, and returns the row with no address and `undelivered = true`.
  2. `hardware_key_notice.event_at`, not the note's `removed_at`: two of the three kinds are not removals.
  3. `operator_mail_expire(integer)` replaced in place (one DELETE added) so key notices expire as password notices
     do; the note gave the table an `expires_at` and nothing that reads it.
  4. `hardware_key_removals()` asks `app_actor_platform_permitted('organization.manage')`, not the seven days: a new
     administrator sees the list (IDs and times) and can act on nothing.
  5. Helpers granted to no role beside the three the tests name: `hardware_key_opening_usable(uuid, timestamptz)` and
     `hardware_key_notice_report_undelivered(uuid, text)`. Code digests are compared after a second SHA-256 of each side.
  6. `operator_record_mail_event` keeps its seven result columns (the note: signature unchanged): an undelivered key
     notice is on the audit log (`hardware_key_notice_undelivered`), not in a column. The job reads it there.
  7. `hardware_key_record` raises on a wrong code and so counts no try (its count would roll back); only
     `hardware_key_registration_judge` counts. The flow must call `judge` first, as the note says.
- **Found by one run of the whole database suite against the draft, for step B:**
  - **A conflict to rule on (told to the orchestrator):** the note's 16.3 takes the account's row lock on every session
    insert; `packages/db/src/sign-in-not-before.db.test.ts` ("neither checks nor locks a row with no start", ADR 0093
    D4) asserts that the previous image's insert is not locked, and fails. The draft follows 16.3 (without the lock a
    previous-image insert in a transaction open across a request and its confirmation is never swept). Step B changes
    that one assertion to the new truth and ADR 0095 amends 0093 D4, unless the orchestrator rules otherwise.
    **Ruled by the orchestrator, 2026-11-12 06:55 UTC: follow 16.3, on four conditions.** (1) Change only the "nor
    locks" half of that test; "neither checks" (no reset comparison for a row with no start) stays as it is, and a new
    assertion pins what is locked, in which mode (the weakest that serialises against a removal: say why FOR UPDATE
    is or is not needed; the draft takes FOR NO KEY UPDATE, the mode every other taker of the row uses), and that it
    is released at the transaction's end. (2) ADR 0095 amends D4 in a dated section: what D4 protected and why that
    still holds. (3) Step C measures parallel session inserts for one account (the wait added) and shows no deadlock
    with End membership or a confirmation, the lock order stated in the note and the ADR; a wait or an order that
    breaks the note's bound is a blocker. (4) **A named point for the build's auth review**, and a line in "What the
    founder should know" (ADR 0093 was approved with #142).
  - `packages/db/domain-model/areas.json`: the four tables need an area. `MAIL_KINDS` and `MAIL_STREAM_KINDS`
    (`packages/db/src/schema/operations.ts`) need `hardware_keys_removed` after `password_changed`
    (`packages/db/src/mail.db.test.ts`).
  - `apps/web/src/lib/auth/sign-in.db.test.ts`, SGN-19's two cases, assert ADR 0094's open case (a step begun before
    End membership still opens a session). The mark now closes it: they are rewritten to the refusal, not skipped.
  - Not yet read: the lists in `catalog`, `cross-tenant`, `migrate.db.test.ts`, `hardening.db.test.ts`.
- **Left of the database half after the commands:** fill the two files through the skill; the Drizzle schema; the
  lists above; `pnpm test:db` whole; the lock and round-trip measurements (step C); `pnpm db:domain-model --out
  --strict` with the approval line blank (step D).

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
