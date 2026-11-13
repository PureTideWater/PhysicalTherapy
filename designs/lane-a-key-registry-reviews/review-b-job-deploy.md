# Review B: the job, the outbox and deploy safety (Queues item 37, co-001/wip-key-registry ad684695, base 1f652b6f)

Read only. Nothing was run, measured or edited apart from this file. Line numbers are at ad684695.
Scope: provider_sign_outs and hardware_key_notices jobs, the outbox functions, the two migrations' locks, infra alarms,
the deploy and rollback runbook. Auth, the two-person rule, the one-time code and tenant isolation are left to the other reviewer.

## Confirmed by reading the code

### B1 (high): with a slow provider and a backlog, nothing pages for hours, and untried rows are never given up
- apps/worker/src/platform/provider-sign-outs.ts:120-137; packages/db/functions/operator_provider_sign_out_claim.sql:17-24;
  operator_provider_sign_out_failed.sql:17; operator_provider_sign_outs_overdue.sql:16-22.
- How it happens: Cognito hangs, so every call ends at the 10 s abort (cognito-sign-out.ts:13,27-31). The run checks
  its budget before each claim, so it makes one call that takes 10 s, goes past 8 s and stops: one try a minute.
  The claim orders by next_attempt_at. A queued row has next_attempt_at = queued_at, which is in the past. A tried row
  has now()+1 min after `failed`. So fresh rows always come first, and with N rows queued each row gets its first try
  about N minutes in. LATE needs attempts >= 4, so the first LATE comes after about 3N to 4N minutes (200 rows: more
  than 10 hours). GAVE_UP by age needs attempts >= 4 too (ruling 16.6), so a row still untried at 24 hours is never
  given up and never paged. The only lines in that time are warn lines (`provider sign-out attempt failed`), and no
  alarm counts them. The run does not throw, so JobFailedOnLastAttempt stays silent. ProviderSignOutsNotRunning stays
  OK because the run line is written. The design's "late at about 21 minutes" is true only for a row alone in the queue.
- Verification: a test in apps/worker/src/platform/provider-sign-outs.db.test.ts. Queue 20 rows. Use an adapter that
  advances the injected clock by 10 s and throws `AbortError`. Run 20 times, moving the database clock 1 minute between
  runs (or set next_attempt_at as the owner). Assert `operator_provider_sign_outs_overdue` has returned at least one LATE
  by run 6. This fails today.
- Smallest fix, APP-ONLY: add a metric filter and alarm on the platform group for `$.msg = "provider sign-out attempt
  failed"` (for example at least 3 in 15 min, operator topic). Optionally stop the run after the first AbortError.
  The full fix is NEEDS-MIGRATION: make the sweep mark a row LATE by age (undone and queued_at more than 15 min ago,
  whatever attempts says), and allow GAVE_UP by age with no minimum number of tries.

### B2 (high; point 20, NEEDS-MIGRATION, recorded): a reset whose transaction fails twice queues no provider sign-out
- apps/web/src/lib/auth/sign-in.ts:1183-1215 (endedByReset), and the trigger WHEN clause at
  packages/db/migrations/20261115090000_key_registry.sql:559-562.
- What is lost: Cognito holds the new password. The audit event never committed, so no provider_sign_out row exists.
  The previous web called AdminUserGlobalSignOut after every completed reset, recorded or not; this web calls it nowhere.
  So the provider's refresh and access tokens issued before the reset stay good until they expire, or until a person
  acts. That includes a provider grant for a key-registration step begun before the reset. The app's own sessions and
  the mark were never the provider sign-out's job, and they are already lost in this case (that is ADR 0091 D15's
  existing gap).
- Is the alarm and runbook step enough? The alarm PasswordResetSessionsNotEnded, with its words updated, does page.
  The runbook step (docs/runbooks/incident-response.md:162-200, step 3) is enough only by a side effect it never names:
  "press End membership" now queues a sign-out through the trigger. Where the membership must stay, the founder's
  break-glass disables the account at Cognito. The step never says "sign the user out at Cognito", and its own text
  says a disable leaves some things open. tp_operator has no way to queue a sign-out.
  APP-ONLY now: say in step 3 that End membership queues the sign-out, and that on the founder's branch the founder
  runs AdminUserGlobalSignOut as well as the disable.
- The exact change that would close it (NEEDS-MIGRATION):
  (a) Widen `provider_sign_out_reason` (and the reserved audit actions) to add `password_reset_unrecorded`.
  (b) Add a function `provider_sign_out_unrecorded_reset(request text) RETURNS void`: SECURITY DEFINER, SET search_path
      pg_catalog, public, pg_temp, revoked from PUBLIC, GRANT EXECUTE to tp_app only. It requires app_actor_id(). It
      inserts the audit row (actor_kind user, action password_reset_unrecorded, object the actor), and the trigger's
      WHEN is widened to that action, so the outbox row keeps riding its own audit row.
  (c) endedByReset calls it in its own withActor transaction after the second failure. That transaction has no lock
      on the account and no session work, so it can succeed when the first two failed on a lock timeout or the session
      update.
  The residual case is the database being unreachable, and only an operator path covers it:
  `operator_provider_sign_out_request(account uuid, request text)`, GRANT EXECUTE to tp_operator, named in step 3.

### B3 (medium): the operator pool is still 2 connections, and the new jobs hold a connection through the provider call
- apps/worker/src/pools.ts:27 (unchanged); apps/worker/src/jobs/platform.ts:327-345 (withOperator for the whole run);
  provider-sign-outs.ts:129 (the call runs while the client is checked out); packages/db/src/connect.ts:17 (connect
  timeout 10 s).
- How it happens: six platform jobs now run every minute (support_grant_notices, mail_events, dunning_notices,
  password_notices, provider_sign_outs, hardware_key_notices), and each pg-boss type has its own loop, so they run at
  the same time. Under load, provider_sign_outs holds a connection for up to about 18 s (8 s budget plus one 10 s call),
  and hardware_key_notices and password_notices hold one for up to 8 s plus a send each. A third job waits more than
  10 s, its pool.connect fails, and that attempt fails.
  For provider_sign_outs this happens before runProviderSignOuts, so no run line is written. A few minutes of it raises
  ProviderSignOutsNotRunning while the job is in fact running and starved. The opposite case: provider_sign_outs is the
  job starved, and a busy notice backlog delays the sign-outs.
- Verification: a unit test in apps/worker/src/jobs/platform.test.ts. Give the pool max 2. Run two handlers whose
  clients are held for 15 s. Assert that provider_sign_outs still completes (today it rejects with the pool timeout).
  Or check by reading that the infra connection budget (infra/lib/connections.ts) counts 2.
- Smallest fix, APP-ONLY: in signOuts, take a client for each step (claim, done or failed) and release it during the
  provider call; or raise OPERATOR_POOL_CONNECTIONS and the budget.

### B4 (medium): "no such user" counts as done, and nothing checks that it is the right pool or counts how often it happens
- apps/worker/src/platform/cognito-sign-out.ts:34-36; operator_provider_sign_out_done.sql:19-29;
  apps/worker/src/config.ts readProviderSignOut.
- How it happens: if the worker had another existing pool ID in the same region (an environment mix-up, a stack
  rename, a manual task-definition override), every AdminUserGlobalSignOut answers UserNotFoundException. Every row is
  marked done and audited `provider_signed_out` (the audit row has no outcome, decision 8). The only trace is an info
  line `outcome_code: no_such_user`. Nothing pages.
  A wrong region or a pool that does not exist answers ResourceNotFoundException, which counts as a failure and pages
  LATE, so that case is safe. compute.ts:349-350 takes the ID from the same construct as the web, which makes the
  mix-up unlikely in CDK-built tasks. In development (NODE_ENV not production, ID unset) the twin marks everything
  `signed_out`.
- Verification: a unit test in cognito-sign-out.test.ts that names the risk. Better, an infra assertion in
  infra/test/monitoring.test.ts that a metric filter on `$.outcome_code = "no_such_user"` exists, with an alarm at
  3 or more in 15 min.
- Smallest fix, APP-ONLY: that alarm. Optionally a start-up probe (AdminGetUser on a known staff subject, or
  DescribeUserPool, which needs a new IAM action) that refuses to start on the wrong pool.

### B5 (medium): ProviderSignOutsNotRunning will almost certainly page in the deploy that creates it, and pages again at OK
- infra/lib/constructs/monitoring.ts (diff, `providerSignOutsNotRunningAlarm`: treatMissingData BREACHING, 2 x 300 s,
  addAlarmAction and addOkAction); infra/lib/security-events.ts PROVIDER_SIGN_OUTS_NOT_RUNNING_ALARM.
- The filter pattern `$.msg = "provider sign-outs run"` matches the line exactly. That line is
  provider-sign-outs.ts:193, at info. The logger default is info, LOG_LEVEL is set nowhere, and the logger writes
  `msg` (packages/observability/src/logger.ts:74). It goes to the platform log group, and the line is written when a
  step (the claim included) throws. So the match is sound.
- But the metric filter only counts from its creation, and missing data breaches. If the new platform task's first
  line does not land in the alarm's first evaluated window, the alarm goes to ALARM. The runbook (deploy-and-rollback.md:600-602)
  says "can raise once". It should say "expect it", and also that the OK action pages a second time.
- A run that fails before its body writes no line: pool.connect failing, as in B3, or NoProviderSignOutError
  (platform.ts:329). A hung run is heard after 10 min (pg-boss expiry is 15 min). The line count is about 1,440 a day,
  which is acceptable.
- Verification: infra/test/monitoring.test.ts already checks the shape. No code test can show the first-deploy page;
  the runbook text is the fix. APP-ONLY (runbook). Optional: TreatMissingData.NOT_BREACHING plus a separate heartbeat
  dependency, but that loses the "platform down" case, so keep BREACHING and fix the words.

### B6 (low): a failed attempt's warning carries no cause request_id, and the step-failure error_code is a compound value
- provider-sign-outs.ts:136 (point 27, recorded: the claim does not return request_id; NEEDS-MIGRATION to add it).
- provider-sign-outs.ts:176 logs `error_code: "<step>:<ErrorName>"`. A pg error's `name` is `error`, so a database
  failure logs as `sign_outs:error` and the SQLSTATE is lost.
- Smallest fix, APP-ONLY: log a `sqlstate` code where `error.code` matches /^[0-9A-Z]{5}$/, if the allowlist takes the
  field (a reviewed change to fields.ts). IDs only either way: no subject, address or message is logged.

### B7 (note): overlapping runs of the sweep can deadlock with each other
- operator_provider_sign_outs_overdue.sql:16-22: two UPDATEs over many rows, with no ORDER BY and no SKIP LOCKED.
- Two runs overlap only on a pg-boss retry next to the next minute's run. Each run's UPDATE takes row locks in the
  order of its own scan, so a 40P01 is possible. It fails only the `overdue` step (logged, the run throws, pg-boss
  retries), and the paging line comes on the next run (at least once), so nothing is lost.
- NEEDS-MIGRATION to remove it (lock the rows in id order in a CTE). Recorded only.

### B8 (note): rollback has effects beyond "no staff sign-in"
- docs/runbooks/deploy-and-rollback.md:641-654. What the runbook states is true: the previous image's key session
  without a digest is refused for a registry account (migration lines 461-476), and customers on a code are unaffected.
- Effects the runbook does not list. Under the previous platform image:
  (1) Nothing expires removal requests (operator_key_removals_expire is called only by the new job), so
      membership_removal_target_holds keeps a target's internal memberships frozen past 24 hours. The previous web
      surfaces that 23514 as a 500. This is moot while that staff account cannot sign in, but it is not stated.
  (2) hardware_key_notice rows go stale. On roll-forward the stale sweep reports them all as KEY_NOTICE_UNDELIVERED,
      which pages.
  (3) With the new infra kept, a failed provider call by the previous web pages nobody by name, and no job delivers
      its row; only the generic ProviderSignOutsNotRunning pages. The runbook's "nothing is lost" (line 610) holds for
      the rolling deploy, not for a rollback.
- The previous image writes nothing the new schema refuses outside sessions. Its End membership writes ends_at = now()
  (base settings.ts:1102), which passes the trigger's `m.ends_at = now()`. Its TOTP session for an account whose
  registration is closed is refused (user_session_key_registration_closed), which fails closed. I found no row the
  previous image leaves that the new image misreads: rows queued during a rollback are claimed later, are never given
  up untried, and a late global sign-out is harmless.
- Fix: APP-ONLY (runbook lines).

## Suspected (not proven by reading)

- S1: the previous image's openSession upserts its device row before the session INSERT, and the new BEFORE INSERT
  trigger takes the account's row (migration line 462). That makes the order device then account. I found no
  new-image path that takes the account's row and then a device row, so I see no deadlock. W33's 0-deadlock run mixed
  only new-image paths (status 1125-1250). The mixed old-and-new order during a rolling deploy was not exercised.
  Verify with the W33 harness, adding the base image's openSession SQL.
- S2: the alarm-creation page (B5) depends on how CloudWatch evaluates an alarm that is all missing data at creation;
  that was not checked against AWS's documentation here.

## Checked and found sound

- Claim: one row; a MATERIALIZED CTE with FOR UPDATE SKIP LOCKED LIMIT 1. The try is counted at the claim, the lease is
  2 min, and next_attempt_at is pushed to the lease end, so a poison row goes to the back and cannot block the batch.
  attempts < 30 keeps the counter under its CHECK.
- done and failed act only when `try` is the row's attempts. A stale worker changes nothing. A worker that dies after
  Cognito answered is re-asked after the lease, which is harmless. `provider_signed_out` is written once, from the
  UPDATE that set done_at, and its audit insert does not re-fire the outbox trigger (WHEN clause).
- The sweep alone decides LATE and GAVE_UP. The paging line is written before `_reported`, so it comes at least once.
  Expiry never deletes an undone row that has not been reported.
- cognito_sub is NOT NULL UNIQUE (packages/db/src/schema/tenancy.ts:87), so no row has a null subject.
- The 10 s abort is far inside the 2 min lease, and AbortError is stored as its name.
- Job payloads are z.strictObject({}) for both jobs, with no singleton key beyond the schedule's own. Every new log
  line carries IDs and codes only (sign_out_id, user_id, outcome_code, hardware_key_notice_id, error_code). Nothing
  logs the subject, an address, a code, or provider or Postgres message text. ProviderSignOutRunFailed's message lists
  step names only. KeyNoticeSendFailed (which carries the SES error and possibly an address) is caught and never
  rethrown. The provider's subject is an opaque ID, but it is the handle an admin call needs, so it is rightly kept out
  of logs; the code does that.
- Functions: every one read has SECURITY DEFINER with search_path pg_catalog first and pg_temp last, owner tp_owner,
  and is revoked from PUBLIC. The job functions are granted to tp_operator only; the trigger function has no grant.
  None sets app.practice_ids or app.actor_id, none runs EXECUTE, none is LEAKPROOF, and the migration creates no schema.
  The new tables have FORCE RLS and no privilege for either runtime role (migration:1531-1534).
- Migration locks: five tables with NOWAIT in one subtransaction, 1 s apart, 300 tries, inside the runner's
  transaction with lock_timeout (packages/db/src/migrate.ts). Everything after the loop is catalog-only: new tables
  with indexes on empty tables, a nullable column, NOT VALID CHECKs, triggers, a policy and grants. There is no index
  build on an existing table. The validations run in a separate migration under SHARE UPDATE EXCLUSIVE.
- W33's figures (file 1: 107 and 127 ms; file 2: 649 ms at 1M rows) are consistent with the files as written: no
  migration changed after 969ac389 (git log is empty).
- Lock order: the job's paths lock only outbox rows (the claim reads "user" without a lock), so they cannot invert the
  account, then removal, then key, then session, then outbox order.
- Previous image during the rollout: its End membership and reset queue rows, and its extra provider call is harmless.
  The new web with the old worker asks nothing, but rows wait, are never given up untried, and NotRunning pages.

## Not reached

- infra/lib/connections.ts (whether the budget counts the operator pool correctly).
- The pg-boss retryLimit for platform jobs, and whether a retried run can overlap the next slot in practice (B7).
- The hardware_key notice SQL functions in detail (operator_key_notice_*): read only through the job's calls.
- The removed web alarms' tests in infra/test/monitoring.test.ts.
- docs/adr/0095's text.
