# Database review of the design: a sign-in step begun before a password reset is refused after it (v1)

2026-11-11. Lens: the database. Design: `/home/user/ops/designs/lane-a-step-before-reset.md`. Tree: the worktree
`/home/user/step-before-reset` at fadadf4b (49 migrations), read only. Method: the design's SQL drafted from its D1
to D4 and D7 (appendix), applied to a migrated scratch database on the local PostgreSQL 18.4, and driven by 2 to 24
concurrent connections as the application role's login (`tp_app_dev`) and as the owner; a copy without the draft is
the control. The repository's test suites were not run. The three scratch databases are dropped.

**Counts: 1 blocking, 3 should-fix, 7 notes.** "D1" to "D9" below are the design's sections; findings are "DB-D1" on.

## Findings

### DB-D1 (blocking). The account's row is taken after a device row and after session rows: the design adds lock cycles, and a failed sign-in's count can be the one PostgreSQL ends

The design adds two edges to the lock graph: openSession now always asks for the account's row (the insert trigger)
while it holds a device row (`UPDATE user_device`, `apps/web/src/lib/auth/sessions.ts:72`, then the insert, `:75`);
and the reset asks for session rows a second time (the sweep) while it holds the account's row, after a first pass
(`revoke_user_sessions`, `sign-in.ts:536`) that held session rows before it. Three existing orders close cycles with
them: `resolve_session()` (session, then device: `packages/db/functions/resolve_session.sql:20`, `:53`),
`sign_in_failed()` (FOR UPDATE on the account's row, `sign_in_failed.sql:21`, which waits for every KEY SHARE a
request's key holds, `apps/web/src/lib/http/invoke.ts:276`, and keeps the row's place in line while it waits), and
any other caller of `revoke_user_sessions()` (`routes/settings.ts:1103`, `routes/console.ts:789`).

Scenario, scripted (`deadlock.mjs`), one account, one browser:
1. The reset's transaction begins and runs `revoke_user_sessions()`.
2. A sign-in commits meanwhile: session S on device D (the case the sweep exists for).
3. A second sign-in on that browser runs openSession's device statement: it holds D's row.
4. A request with S's cookie: `resolve_session()` locks S, then waits for D's row.
5. The reset records its event: the stamp takes the account's row; the sweep waits for S.
6. The second sign-in inserts its session: the insert trigger waits for the account's row.

Evidence. With the draft: `wait graph: ["open2 -> reset","reset -> resolve","resolve -> open2"]`; after
`deadlock_timeout` (1 s) `resolve: 40P01 deadlock detected`. The same six steps on the tree before the change:
`wait graph: ["resolve -> open2"]`, all three complete. Under deliberately unrealistic contention (`stress.mjs`: every
transaction that touches an account's row, sessions and devices, as its real statement sequence; 24 connections, 2
accounts; one run each, counts vary by run, 50 to 96 deadlocks for the design over four runs):

| 30 s (last two columns 25 s) | tree before | design | design, account's row first | first in openSession only | first in the reset only |
| --- | --- | --- | --- | --- | --- |
| operations completed | 5,331 | 2,466 | 23,781 | 3,004 | 3,998 |
| deadlocks | 73 | 74 | 1 | 29 | 111 |
| with `sign_in_failed` in the cycle | 0 | 54 | 0 | 0 | 110 |
| `sign_in_failed` ended by PostgreSQL | 0 | 32 | 0 | 0 | 28 |
| resets that failed both tries | 0 | 5 | 0 | 3 | 0 |
| live sessions begun at or before their mark | n/a | 0 | 0 | 0 | 0 |

The other two shapes. From the stress (PostgreSQL's DETAIL, names put for process and relation IDs): `[open] waits
for ExclusiveLock on tuple (1,2) of relation "user"; blocked by [fail]. [fail] waits for ShareLock on a transaction;
blocked by [revokeDevice]. [revokeDevice] waits for ShareLock on a transaction; blocked by [open].` Scripted
(`pair2.mjs`): a session commits between the reset's two passes, another `revoke_user_sessions()` (membership end)
locks it and waits for one the first pass holds, and the sweep waits for it: `wait graph: ["membership-end ->
reset","reset -> membership-end"]`, 40P01; on the control `["membership-end -> reset"]` and both complete.

Why it is more than a retried request. PostgreSQL ends whichever waiter's check fires first: (a) `sign_in_failed()`:
the failure is neither counted toward the lock at ten nor audited (in no run of the control; ADR 0092:118-122 keeps
sign-in unbounded so that it never gives up "a failed sign-in's count" or "a sign-in step after the provider's grant
is released"); (b) openSession, after `release(grant)` (`sign-in.ts:308`); (c) the reset: retried once, and a second
loss is `sessions_not_ended`, where nothing is stamped or swept (the design's fourth limit). The window is narrow (the
steps interleave inside single requests, milliseconds), so this will be rare in use; it is ranked blocking because a
deadlock is, because of (a) and (c), and because the tree before takes the account's row in openSession only when
`sign_in_succeeded()` or `record_sign_in_with_mfa()` has something to change, and the design takes it every time.

Smallest change: one order, the account's row first, in both transactions.
- openSession: `SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE` as the transaction's first statement, before the
  device read. The application role may lock its own row today (S1 below); a one-statement definer function if the
  design will not rest on the column grants.
- The reset: the same statement before `revokeUserSessions`. (Or inside `revoke_user_sessions()`, the design's last
  alternative: then membership end holds the member's row across its provider call, `settings.ts:1106`,
  `console.ts:792`. Not run here.)
- Both triggers stay as the database's enforcement; under this order the sweep finds only a previous image's session,
  and D1's sentence about the lock (DB-D5) becomes true.
- D8 gains the three-connection case above. Each half alone leaves cycles (table). Measured in the harness, not in the
  repository's code.

### DB-D2 (should-fix). D7 takes `"user"` in ACCESS EXCLUSIVE: one open transaction of any kind refuses a try, and a reconcile pass outlasts the loop

Migration 20261111090000 took `"user"` in SHARE ROW EXCLUSIVE, which readers do not refuse. D7 needs ACCESS EXCLUSIVE
(ADD COLUMN), copies the loop, and does not say what changes.
1. A practice job's transaction begins (`apps/worker/src/worker.ts:336`): `withJobScope` runs
   `app_actor_is_person()` (`packages/db/src/authz/scope.ts:364`), which reads `"user"`; that lock is held to the
   transaction's end. A reconcile pass is one such transaction: 603.0 s at 2,000 lines, every practice's queued
   daily at 05:10 UTC (`docs/runbooks/deploy-and-rollback.md:334-339`).
2. Each try: `LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE NOWAIT` fails for as long as any such transaction is open.
3. 300 tries: the deploy fails (55P03), changing nothing.

Evidence (`m.mjs`, M2): with one reader open after `app_actor_is_person()`, `"user" SHARE ROW EXCLUSIVE NOWAIT ->
granted`, `ACCESS EXCLUSIVE NOWAIT -> 55P03`; the same with one open transaction that inserted a `mutation_request`
(its foreign key; 66 foreign keys from 48 tables reference `"user"`). Every signed-in request's transaction reads
`"user"` through its policies (`app_actor_memberships()`), so a try needs an instant with no application transaction
open at all. Inherited from the copied loop: a VACUUM or ANALYZE of any of the three tables (autovacuum included)
refuses a try too (`refused (55P03) while a SHARE UPDATE EXCLUSIVE holder ... is on audit_event`), and NOWAIT never
cancels an autovacuum as a waiting lock would; `audit_event` only grows.

Smallest change: D7, the ADR and the runbook's new section say what refuses a try (any open transaction that touched
`"user"` in any way, a read or a foreign-key check included, or `user_session`, or wrote `audit_event`; a vacuum of
the three), that one reconcile pass outlasts the five minutes, and when to deploy (as the ledger section: no
reconcile queued or running). D8 gains the loop's case with a reader open (refused, nobody queued). The alternative, a
table of its own for the mark with the row lock still on the account's row, needs no lock on `"user"` above the
earlier migration's; it costs a table and a join for a one-time deploy, so I do not ask for it.

### DB-D3 (should-fix). Recorded at REPEATABLE READ, the event stamps the mark and a session begun before it stays live

D1: "It makes 'the event is recorded' imply 'every session ended' in the database, whatever order a caller uses".
1. A transaction at REPEATABLE READ takes its snapshot.
2. A sign-in (begun before) commits its session; its lock on the account's row is gone.
3. The first transaction runs the revoke (which does not see that session) and inserts the event: the stamp
   succeeds (the row was only locked, never changed), the sweep reads the old snapshot and ends nothing. The notice
   is queued.

Evidence (`orders.mjs`, O4): `repeatable read: revoke ended 1` (an older session) `; event recorded: yes`, mark
`06:27:25.103237`, a live session with `sign_in_began_at 06:27:25.093`. No caller does this today (`withActor` begins READ COMMITTED,
`scope.ts:274`), but the tree has a REPEATABLE READ transaction that writes audit events (`oneSnapshot`,
`scope.ts:284-289`, `:320`), and ADR 0091 D10's line to the customer rests on the implication.

Smallest change: the trigger function refuses to run unless `current_setting('transaction_isolation')` is
`read committed` (appendix). Rerun: `event recorded: 0A000`, nothing stamped, the caller's retry and D15's page apply.
One D8 case.

### DB-D4 (should-fix). `sign_in_began_at` takes any value: a start ahead of the clock passes D3 and D4 for good

1. Account X completes a reset (mark = now).
2. As the application role acting as X: `INSERT INTO user_session (..., sign_in_began_at) VALUES (..., 'infinity')`.

Evidence (`sec.mjs`, S4, S5): `own session with sign_in_began_at = infinity after X's reset -> ok`, the same for
`2099-01-01`; `sign_in_step_current(Y, 'infinity')` is true. The database's refusal is exactly as good as the value
the web sends: a step sealed from the wrong clock (the web server's, the mistake the alternatives table names), a
units slip, or a forged step defeats both checks silently and permanently, while a value too early fails loudly.

Smallest change: the trigger also refuses `NEW.sign_in_began_at > clock_timestamp()`; the function also requires
`began <= statement_timestamp()` (appendix). Rerun: both inserts `23514 user_session_sign_in_not_before`, infinity
false; and of 2,000 sign-ins with a start read from `sign_in_step_began()` none was refused (`fresh.mjs`). It also turns half of the clock limit into a refusal:
after the clock steps back, a start read before the step is ahead of the clock and is refused until the clock
passes it.

### Notes

- **DB-D5. D1's "so the mark is never before the lock was won" is false** when the holder only locked the row, the
  usual case (the insert trigger locks; `sign_in_succeeded()` changes nothing at zero failures): PostgreSQL computes
  the new row before it waits and writes it unchanged after. O1: mark `06:27:21.578513`, the holder committed after
  `06:27:23.084892`. When the holder changed the row, the value is computed again (O1's second variant). The rule does
  not need the sentence (the mark only has to follow the provider's reset, and the UPDATE starts after it): strike it,
  or take DB-D1's order, under which the reset already holds the row.
- **DB-D6. D3's "the app role holds no row-lock right on `"user"`" is false**: `tp_app` holds UPDATE on four columns
  and locks its own row (S1: `FOR NO KEY UPDATE -> ok`). SECURITY DEFINER is still right: an invoker's trigger reads
  through the caller's policies and would skip the check for a row the caller cannot see. For the ADR, the
  application role only: the insert trigger runs before the row-level policy, so acting as X an insert naming Y waits
  on Y's row and answers 23514 or 42501 by Y's mark (S3), and `sign_in_step_current()` answers for any account with
  no actor (S5). `sign_in_account()` already reads any account by email; no change asked.
- **DB-D7. The alternatives table's sequence row.** "The domain model also shows no stand-alone sequence" proves
  nothing: the generator reads tables and views only (`packages/db/src/domain-model/catalog-reads.ts:273-290`), so it
  shows no sequence object of any kind. The schema has four identity sequences (`line_status.seq`, `ledger_entry.seq`,
  `ledger_match.seq`, `support_ticket.number`) that a logical cut-over would already have to carry, so the row's first
  reason names a duty the schema has, not a new one. The clock still wins on its own ground (it does not restart
  lower). The counter's row is justified as written; the wall clock is acceptable: both readings come from the one
  primary (production is Multi-AZ, `infra/lib/environments.ts:197`; the tree configures no read replica).
- **DB-D8. Limits to add to section 5.** (a) A mark ahead of the clock (the clock stepped forward at a reset, then
  was corrected) refuses every sign-in of that account until the clock passes it; GREATEST keeps it and no
  application path lowers it (S7): a runbook line, owner SQL. (b) `sign_in_step_current()` reads its caller's
  snapshot: inside a REPEATABLE READ transaction older than the stamp it answers true (S5); call it as its own
  statement, never inside `withPublicSnapshot` or `oneSnapshot`. STABLE is otherwise right. (c) `mark IS NULL OR began
  > mark` is true for a NULL began on an account never reset: the body needs `began IS NOT NULL AND` first, and D8's
  list should name that pair.
- **DB-D9. D7's lock set is right for exactly its statements** (probe: ADD COLUMN ACCESS EXCLUSIVE; CREATE TRIGGER
  SHARE ROW EXCLUSIVE; GRANT (column) ACCESS SHARE; a SQL-language function that reads `"user"` ACCESS SHARE). A
  policy change on `audit_event` (reserving an action, if question 5 becomes an event the database writes) takes
  ACCESS EXCLUSIVE: it must then join the same NOWAIT try, or the migration waits while holding `"user"`.
- **DB-D10. What the build must update** (item 9). Drizzle: `packages/db/src/schema/tenancy.ts`
  (`"user".sign_in_not_before`) and `schema/identity.ts` (`user_session.sign_in_began_at`), or
  `migrate.db.test.ts:638` fails and the model prints 2 column differences. Generated:
  `docs/product/domain-model.md` and four new files in `packages/db/functions/` (`audit_event_sign_in_not_before`,
  `sign_in_step_began`, `sign_in_step_current`, `user_session_sign_in_not_before`); the model's lines that move:
  functions 390 to 394 (definers 180 to 183), triggers 281 to 283, `audit_event`'s 7 to 8, `user_session`'s 2 to 3,
  the column grant line, one more column "not in the dictionary" (informational). `db:domain-model --check --strict`
  on the draft: exit 1 for the regeneration only; no strict problem, no area or explanation to add. No list changes
  in `catalog.ts`, `catalog.db.test.ts`, `cross-tenant.db.test.ts`, `hardening.db.test.ts` (reserved actions: the
  event stays the web's) or `migrate.db.test.ts`'s table list; the definers pass the catalog's `search_path` rule as
  drafted. The migration's header should cite its ADR (the model prints it beside the columns).
- **DB-D11. Outside the change.** `resolve_session()` and `revokeDevice` (`sessions.ts:196-200`) already deadlock two
  ways on the tree before (`base-cycle.mjs`: `resolve -> revoke-device`, `revoke-device -> resolve`, 40P01): 26 of the
  control's 73. One statement closes it (the device touch skips a locked row: `WHERE x.id = (SELECT d.id FROM
  user_device d WHERE d.id = s.device_id FOR NO KEY UPDATE SKIP LOCKED)`); with it and DB-D1's order the stress ran
  23,277 operations with no deadlock. A queue item of its own.

## Experiments

Scripts: the scratch directory the brief named (`scratchpad/dbreview/`; session scratch, it may not persist; its full
path is in the hand-back message). Every result below is from a run of 2026-11-11.

| Script | What | Result |
| --- | --- | --- |
| `orders.mjs` O1 | The session's transaction wins the lock | The stamp waits on it (`transactionid`); after its commit the sweep ends it (`revoked`). Mark before the lock was won when the holder only locked (DB-D5) |
| O2 | The reset wins | The insert waits, re-reads, `23514 user_session_sign_in_not_before`; a start read after the stamp waits and opens; at the mark refused, one microsecond after opened |
| O3 | The previous image's insert during a reset | Nothing waits; its session stays live (the design's third limit, confirmed) |
| O4 | The event at REPEATABLE READ | DB-D3 |
| `deadlock.mjs`, `pair2.mjs`, `stress.mjs`, `base-cycle.mjs` | Lock cycles, each with the control | DB-D1, DB-D11 |
| `pairs.mjs` | Two new-device sign-ins (KEY SHARE each), a reset, a failed sign-in queued | No deadlock: the first sign-in takes NO KEY UPDATE without waiting, the reset then sweeps it, the second is refused, the failure is counted |
| `m.mjs` M1, M4 | A connection that ran `resolve_session()` before the columns existed | `active` before and after (its `%ROWTYPE` variables follow the table); `sign_in_account()`'s seven columns unchanged |
| M2, M3 | The loop against a reader | DB-D2; a read of `"user"` during the retries took 5 ms; `relfilenode` of both tables unchanged (no rewrite) |
| M5 | The previous image's insert | Opens with `sign_in_began_at` NULL, takes no lock on the account's row, `record_sign_in_with_mfa()` answers |
| `loop.mjs` | First table free, second held | 26,718 reads of `"user"` during the retries, the slowest 8.2 ms; locks taken on try 5 |
| lock probe (psql) | What each statement of D7 locks | DB-D9 |
| `sec.mjs` S2 | Acting as X: the event with actor Y; actor X and object Y; kind service; another object type | 42501; recorded and nothing stamped or ended, three times |
| S1, S3, S4, S5, S7; `fresh.mjs` | Row lock, policy order, values, the function; the guards | DB-D4, DB-D6, DB-D8; the application role cannot UPDATE either column (42501) |
| S6 | The sweep meets a sign-out in flight | It waits, then skips the row: no `user_session_end_is_final` error, `ended_at >= started_at` |
| S8 | `row_security = off` in the caller | The insert fails closed (42501) |
| `rt.mjs` | D2's value through node-postgres as a `Date`, five pairs of process and session time zones | 7,500 values, 0 mismatches both ways; an epoch number sent as timestamptz fails (22008); `to_timestamp(ms / 1000.0)` exact over 2,000,001 consecutive milliseconds |
| `db:domain-model --check --strict`, `--out` to scratch | The generator on the draft | DB-D10 |

## Checked and found sound

- D3's two orders, the re-read after the wait, and the sweep's fresh snapshot, at READ COMMITTED; `<=` refuses at
  equality; truncation moves a start to the refusing side. Across the stress runs no live session began at or before
  its account's mark.
- FOR NO KEY UPDATE is the right mode: it conflicts with the stamp and with itself and not with foreign-key checks;
  the KEY SHARE to NO KEY UPDATE step on a new device does not deadlock, even behind a queued FOR UPDATE.
- Who can fire the stamp and the sweep: the WHEN guard and `audit_event_record` leave only a transaction acting as
  the account itself; no actor ends another's sessions or moves another's mark (S2).
- The definers under FORCE: `user_owner` and `user_session_owner` admit the owner; `search_path` pinned; no EXECUTE to
  any role (`{tp_owner=X/tp_owner}`); GREATEST ignores NULL; the stamp fires `user_updated_at` alone (EXPLAIN
  ANALYZE: no status trigger), and no code in apps or packages reads `"user".updated_at`.
- The sweep under `user_session_end` and `user_session_end_is_final`; its `clock_timestamp()` never precedes a
  swept session's `started_at` (the app's own revoke, on `now()`, can, as today; no CHECK relates the two).
- The column grant: the trigger sees `sign_in_began_at` whatever the inserter may write; the policy still refuses
  another user's row; the only other inserts of sessions are tests (`identity.db.test.ts:331`,
  `hardening.db.test.ts:149`, `route-tests/world.ts:623`), all four columns; `record_sign_in_with_mfa()` unaffected.
- D7: catalog-only, no rewrite or scan; a refused or partial try queues nobody; the lock set is sufficient; the
  previous image's insert, reset, `resolve_session()` and `sign_in_account()` keep working, and a rollback keeps
  the schema.
- D2: the value survives the driver exactly, in any time zone.

## Not determined

- The logical-replication claim (sequence values are not carried) for PostgreSQL 18, and whether an RDS blue/green
  cut-over carries them: `wal_level` is `replica` locally and `www.postgresql.org` and `docs.aws.amazon.com` are not
  reachable from this session. It matches the restriction as I know it through version 18; unverified here.
- How often DB-D1's cycles occur in use: the stress enumerates cycles, it does not estimate frequency. Timings at
  real size, and how long autovacuum holds `audit_event`.
- Outside the lens, for the sign-in review: the reset stamps the account the typed email resolves to while D3 checks
  the account the subject resolves to; and D4's check cannot see a reset the provider has taken and the database has
  not yet committed, a window as long as the reset's own transaction and any lock wait in it.

## Appendix: the SQL used (the draft, with DB-D3's and DB-D4's guards marked)

```sql
-- D7: migration 20261111090000's loop, its three locks being "user" ACCESS EXCLUSIVE, user_session ACCESS EXCLUSIVE
-- and audit_event SHARE ROW EXCLUSIVE, each NOWAIT.
ALTER TABLE "user" ADD COLUMN sign_in_not_before timestamptz;
ALTER TABLE user_session ADD COLUMN sign_in_began_at timestamptz;
CREATE FUNCTION audit_event_sign_in_not_before() RETURNS trigger                                     -- D1
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN                                -- DB-D3
    RAISE EXCEPTION 'a password reset is recorded in a READ COMMITTED transaction' USING ERRCODE = 'feature_not_supported';
  END IF;
  UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp()) WHERE id = NEW.actor_id;
  UPDATE user_session SET ended_at = clock_timestamp(), end_reason = 'revoked' WHERE user_id = NEW.actor_id AND ended_at IS NULL;
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_event_sign_in_not_before AFTER INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action = 'password_reset_completed' AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id)
  EXECUTE FUNCTION audit_event_sign_in_not_before();
CREATE FUNCTION sign_in_step_began() RETURNS timestamptz                                             -- D2
LANGUAGE sql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT date_trunc('milliseconds', clock_timestamp())
$$;
CREATE FUNCTION user_session_sign_in_not_before() RETURNS trigger                                    -- D3
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mark timestamptz;
BEGIN
  IF NEW.sign_in_began_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  IF NEW.sign_in_began_at > clock_timestamp()                                                         -- DB-D4
     OR (mark IS NOT NULL AND NEW.sign_in_began_at <= mark) THEN
    RAISE EXCEPTION 'a sign-in begun at or before the account''s password reset opens no session'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_sign_in_not_before';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_session_sign_in_not_before BEFORE INSERT ON user_session FOR EACH ROW
  EXECUTE FUNCTION user_session_sign_in_not_before();
CREATE FUNCTION sign_in_step_current(target_user uuid, began timestamptz) RETURNS boolean            -- D4
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT began IS NOT NULL AND began <= statement_timestamp()                                         -- DB-D8 (c), DB-D4
     AND coalesce((SELECT u.sign_in_not_before IS NULL OR began > u.sign_in_not_before FROM "user" u WHERE u.id = target_user), false)
$$;
GRANT INSERT (sign_in_began_at) ON user_session TO tp_app;
REVOKE ALL ON FUNCTION audit_event_sign_in_not_before(), sign_in_step_began(), user_session_sign_in_not_before(),
  sign_in_step_current(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_in_step_began(), sign_in_step_current(uuid, timestamptz) TO tp_app;
-- DB-D1, first in the web's two transactions: SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE;
```
