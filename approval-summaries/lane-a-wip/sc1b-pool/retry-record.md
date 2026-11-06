# SC1b CAS-42.5 attempt-2 investigation (inv-retry)
Started 2026-11-04 ~21:05 UTC. Target: 3ac856d56001ab8e41449b007278a9839bd1ab6f (PR #110), run 41901463895.
No earlier progress file existed.

## Reading (code at 3ac856d5)
- R1 apps/worker/src/main.ts:139 `openPool(config.databaseUrl, 4)`: ONE app pool of 4 for every practice job AND job_run
  recording (databaseJobRuns(pool), main.ts:168). packages/db/src/connect.ts: CONNECTION_TIMEOUT_MS 10,000 (ADR 0055:
  "a starved pool answers with an error"), IDLE_TIMEOUT_MS 30,000. pg-pool 3.14: FIFO waiters; a waiter past 10 s gets
  Error('timeout exceeded when trying to connect') (no code).
- R2 worker.ts startWorker: one boss.work loop per JOB_TYPE (12), localConcurrency 1 except parse_835 (PARSE_CONCURRENCY 4,
  registry.ts:167): up to 11 + 4 = 15 practice jobs at once on 4 connections. pg-boss 12.38 has its OWN pool (queue
  login, pg default max 10, connectionTimeoutMillis 10 s from main.ts) for fetch/complete/send.
- R3 Each practice attempt (worker.ts runJob): runs.started (withJobScope on the app pool; NOT caught: a pool timeout fails
  the attempt), startsRun gate (withJobScope), handler's transactions, recordEnd (caught: logs JOB_RUN_NOT_RECORDED warn).
  attempt() logs only the LAST attempt's failure (JOB_FAILED); an earlier failure is not logged at all.
- R4 Connection holds: price = one transaction for the whole run (execute.ts priceRun, ~100-130 s at 100k lines); audit_report
  = one transaction for triage + gather + Chromium print + write (generate.ts:57); parse_835 = open() txn (short), pass 1
  with NO connection (CPU), pass 2 = one txn for the second stream parse + load (job.ts:203).
- R5 1b's diff vs origin/claude/build-platform in apps/worker + connect.ts: heap.ts (observer only), worker.ts (job heap
  line in attempt's finally), triage/report query shapes. Pool size, concurrency, timeouts UNCHANGED by 1b.
- R6 pg-boss retry: retryDelay 30, backoff: attempt 2 starts 30-60 s after attempt 1 fails (plans.js: 30*(1+random)).
  A price: phase 178.5 = t_fail + 30..60 + poll + 128.1 => attempt 1 failed within ~20 s of the phase start.
- R7 C's four 835s: distinct trace buckets (19/41/48/47 for indexes 1-4? computed: 1->41, 2->48, 3->47, 4->34), so no
  advisory-lock wait between them; they share payee CAPC and plans SYNPLAN-CAPACITY-C-1/2 (upserts).
- R8 CI runner of run 41901463895 is slower across the board vs run 41848025627 (714f4335, same parse code): seed 62.4 vs
  36.5 s, release load 553.8 vs 406.4, D price 128.4 vs 107.2, E price 211.8 vs 145.0; parses 13.1 vs 5.0-5.6 s (concurrent),
  15.3-15.4 vs 4.5-4.9 s (together). No parse/loader/migration change between d219e97d and 3ac856d5.
- R9 No statement_timeout / idle_in_transaction_session_timeout / lock_timeout anywhere (git grep): a Postgres-side kill is
  not a candidate.
- R10 pg-boss keeps a failed attempt's serialized error (name, message, stack, own props such as code) in pgboss.job.output
  while the job waits in state 'retry'; completion overwrites it with null. A harness polling pgboss.job each second sees it.

## Reproduction
- Local route uses the caller's Postgres (unthrottled, no netem; no `ip`/`tc` here), worker already at 0.5 vCPU by
  cgroup v1 quota (ProcessRuntime). Every earlier local run passed (parses 6.3-7.8 s).
- 21:50-22:07 local FULL_SIZE run, worker at 0.25 vCPU (local-only override), stopped after the concurrent phase
  (scratchpad/inv-retry/local/run-before-kept.log): DID NOT REPRODUCE: all six attempt 1 (A price 127.4 s, B report
  67.0 s, parses 16.4-19.2 s); the probe shows price and report took connections first (~1-2 s), and the four parses
  cycled through the other two with load transactions of 4-8 s, every wait under 10 s (local Postgres is fast; CI's is 2
  vCPU with a 2 ms round trip, so its parse loads hold a connection longer). db tp_sc1b_rt_31 and its suffixed logins
  dropped by the harness. The 'after' local run was skipped as uninformative (the before side passed). Local release,
  image dirs and out data removed. Mechanism reproduced deterministically instead by worker.db.test.ts (11 of 15).

## Runs
- NOTE: my scratch probe db test (21:09) used tp_sc1b_rt_1 on 5433; the sibling inv-recon's tp_sc1b_rt_1/_2 are on its
  private cluster 5497, so no collision. From here my databases on 5433 use tp_sc1b_rt_31 and up.
- 21:22 LOCAL A/B queued (scratchpad/inv-retry/local/prep.sh, waiting on the heavy lock behind inv-recon's profile):
  worker image dirs img-before (rc clone = 226264fc: 3ac856d5's worker + the probe) and img-after (fix clone), release
  dir local/release. Then run with the worker at TP_DIAG_WORKER_CPUS=0.25 (local-only override standing in for CI's
  slower runner; rc clone run.ts, never pushed) and TP_DIAG_STOP_AFTER_CONCURRENT=1 (stop after the concurrent phase).
- 21:10 WIP co-001/wip-sc1b-retry-1 = 226264fc (parent 3ac856d5; harness only: tools/release-capacity/retry-probe.ts +
  run.ts 14 lines). Clone: scratchpad/inv-retry/wip. Probe prints `[retry-probe]` lines: FAILED ATTEMPT (job id, queue,
  retry_count, error class, SQLSTATE, kind POOL_WAIT_TIMEOUT / POOL_CONNECT_TIMEOUT / PGBOSS_EXPIRED / CODE_x / OTHER,
  job_run started/finished vs started_on, stack locations), per-second worker-login backends in the concurrent and
  together phases (every 15 s otherwise), worker warn/error lines, and at stop each job's job_run timing.
  Checked: tsc -p tools 0, eslint 0, pure functions + an end-to-end probe run on a scratch db (tp_sc1b_rt_1, dropped).
  Pre-push: fixture guard + gitleaks clean. No local smoke (heavy lock held by the sibling inv-recon).
- 21:10:48 DISPATCHED release-capacity.yml on it (mcp run_workflow, 204): RUN 41913629020, head_sha 226264fc (matches).
  Resume: mcp actions_get get_workflow_run 41913629020; jobs: list_workflow_jobs; log: get_job_logs; grep '[retry-probe]'.

- 21:53:45 RUN 41913629020 COMPLETED failure (job 126867416010; log saved scratchpad/inv-retry/ci/capacity-job.log,
  1,667 lines). CONFIRMED (same mechanism, other jobs): verdict fail on exactly 3 checks, all attempt 2 in the LARGE JOBS
  TOGETHER: A audit report 2 (28042486), C parse 7 (4fa62ae9), C parse 8 (cd3d508d); concurrent phase all attempt 1
  this time (parses 8.0 s). Probe: each FAILED ATTEMPT = Error, no code, kind POOL_WAIT_TIMEOUT ('timeout exceeded when
  trying to connect'), frames pg-pool/index.js:45 < transaction@packages/db/src/authz/scope.ts:104 (pool.connect) <
  Object.audit_report / Object.parse_835 (the handler's context.transaction) < runJob < attempt; job_run started +0.0/
  +0.2 s (runs.started got a connection at once) and finished +11.8/+12.6/+12.7 s (retrying, JOB_FAILED).
  Per-second backends (worker login; pids with verb '?' at the leader's xact age are parallel workers, not pool
  connections): together phase 21:44:42.8 four pool connections held by E price/D triage (131, 552: minutes-long) and C
  parses 5/6 (555, 556: INSERTing 21:44:43.8-21:44:54.1, idle after COMMIT 21:44:55); the report and parses 7/8 queued
  for a connection from ~21:44:43 and failed at ~21:44:53-54, a second before 555/556 committed. Concurrent phase
  21:29:12.5-13.5: the 4 parses (fetched first, 0.5 s poll) held all 4 connections ~7 s; A price (94afc06e) and B report
  (efb37dc4) waited ~7 s for theirs (got 131/302 at 21:29:19.5) -- under 10 s here, over it on run 41901463895 (parses
  13.1 s). Worker warn/error lines: none (no JOB_RUN_NOT_RECORDED). Everything else passed: working set 753.8 MiB over the
  run (921.6 line), live heap max 277, locks 22, A actionable 30,795/30,795, F posted 2,000/2,000; windows advisory 51.5 s.

## Fix (draft, local only; clone scratchpad/inv-retry/fix, branch inv-retry-fix from 3ac856d5, NOT pushed)
- registry.ts PRACTICE_JOB_SLOTS = sum of workOptions(type).localConcurrency ?? 1 over JOB_TYPES = 11 + 4 = 15.
- worker.ts practicePool(url, options) = openPool(url, PRACTICE_JOB_SLOTS, options); main.ts uses it (was openPool(.., 4)).
  Timeout 10 s kept (ADR 0055) for a database that cannot give a connection at all.
- worker.ts attempt(): every failed attempt logs warn 'job attempt failed' {job_id, job_type, error_code:
  attemptErrorCode(error)} (DB_POOL_TIMEOUT / DB_CONNECT_TIMEOUT / DB_CONNECTION_TERMINATED / DB_<SQLSTATE> / carried code
  / <Class>Error in UPPER_SNAKE / UNCLASSIFIED); never the message; guarded (never replaces the job's error).
- Nested-transaction scan (TS AST over apps/worker/src): no syntactic nesting of context.transaction/withJobScope, so one
  connection per attempt at a time holds.
- FAILING FIRST (21:16): with practicePool at 4 and no warn call: worker.db.test.ts 'the practice pool' FAILS (11 of 15
  attempts 'timeout exceeded when trying to connect', 1 s hold, 250 ms timeout); worker.test.ts 2 FAIL (no attempt
  line; expected 4 to be 15). With the fix: worker.test.ts 26 passed, worker.db.test.ts 5 passed.

- 21:24 harness part of the fix: checks.ts attemptFailures(lines) reads 'job attempt failed' codes by job ID;
  JobOutcome.failedAttempts (optional); the attempt>1 reason appends "(its failed attempts logged DB_POOL_TIMEOUT)" or
  "(... logged no `job attempt failed` line)"; run.ts attaches them. The check itself is unchanged (still fails).
  Failing first: checks.test.ts 2 fail without it; tools/release-capacity 61 passed with it.
- docs/runbooks/ci.md "A job completed on attempt 2 or 3" rewritten for the new line and codes.
- Checks so far on the fix tree: tsc apps/worker 0, tsc -p tools 0, eslint 0 (8 files), lint:logs 1,134 ok, lint:copy 569 ok,
  screening watched.test 6 passed (no new import: watched list unchanged).

- 21:30 also: practicePool exported from @tp/worker/runtime and used by apps/web/e2e/worker.ts (was openPool(.., 4),
  "as main.ts wires it"); tsc apps/web (incl. e2e) clean; infra monitoring.test 89 passed; monitor.db + chain.db 37 passed.
- Interim patch saved: scratchpad/inv-retry/fix.patch (git diff 3ac856d5 in the fix clone). ADR 0083 subsection drafted
  at scratchpad/inv-retry/adr-draft.md (EVIDENCE_SENTENCE to fill from the CI probe).
- Connection budget (pools are lazy, idle 30 s): web/task app 10 + billing 4 + esign 2 + model 5 + boss producer 2 = 23;
  worker 4->15 + boss 10 = 14->25; platform operator 2 + boss 10 = 12; screening sweep 2 + 3x2 + boss 10 = 18.
  Worst case all full: prod (2 web) 90->101 on db.t4g.medium; dev/staging (1 web) 67->78 (dev db.t4g.micro default
  max_connections is far lower than prod's: note as a caveat).

- 22:04 FIX COMMITTED LOCALLY (not pushed) in scratchpad/inv-retry/fix: 3faf5545 on 3ac856d5. PATCH:
  scratchpad/inv-retry/fix.patch (git format-patch, 641 lines, sha256 3cff0f1d84ef8ca3...; `git apply --check` clean
  on a fresh 3ac856d5). 12 files: worker.ts, registry.ts, main.ts, runtime.ts, apps/web/e2e/worker.ts,
  worker.test.ts, worker.db.test.ts, checks.ts, checks.test.ts, run.ts, ADR 0083 (new "#### The practice pool,
  2026-11-04" before Alternatives), docs/runbooks/ci.md. No migration, no domain model change.
  Re-run on the commit: worker.test + tools/release-capacity + watched.test 93 passed; worker.db.test 5 passed;
  tools/ci/browser-build, print-pictures, tools/test/workflows 168 passed; lint:copy ok.

- The WIP run's notify job (the workflow's own step) updated the "Release capacity test failing" issue, as on the
  earlier failed dispatches. WIP branch co-001/wip-sc1b-retry-1 (226264fc) kept on origin (delete nothing).
- STATUS: COMPLETE. Next (for the orchestrator): apply fix.patch in 1b's fix round, then CAS-42.5 again on the new head.

## Recommendation
- ROOT CAUSE (confirmed by run 41913629020's probe): the practice worker's app pool (main.ts openPool(.., 4)) is smaller
  than the jobs it runs at once (11 queues x 1 + PARSE_CONCURRENCY 4 = 15); long holders (price, audit_report, triage:
  one connection for minutes; parse pass 2: one for its whole load) leave later jobs queued in pg-pool, and a wait past
  CONNECTION_TIMEOUT_MS (10 s) fails the attempt with 'timeout exceeded when trying to connect' from the handler's
  transaction (scope.ts transaction -> pool.connect). Not 1b's code (1b changed no pool/concurrency/timeout); surfaced by
  the real-size concurrent/together phases on slower runners. BITES PRODUCTION: infra compute.worker = one task, 0.5
  vCPU, WORKER_JOBS=practice, same main.ts pool; any 5th job needing a connection while 4 long ones hold theirs fails
  after 10 s; three such attempts fail the job (a parse marks its document failed; JOB_FAILED alarm).
- FIX (right by the code): right-size the pool to the worker's total practice concurrency (PRACTICE_JOB_SLOTS = 15,
  derived from workOptions), keep the 10 s timeout for a database that cannot give one (ADR 0055). pg-boss has its own
  pool (queue login, default 10) for fetch/complete/send, so it needs nothing from the app pool. Rejected: bounding
  concurrency to 4 (serializes job types: a 10-min reconcile or a 2-min price would block parses and the chain; the
  registry/ADR intend every queue's loop at once + 4 parses); waiting without a timeout (head-of-line blocking behind
  minutes-long holders inside pg-boss's 15-min expiry, and a starved database would hang jobs instead of failing).
- Plus: log every failed attempt's code (warn 'job attempt failed', job_id/job_type/error_code; lint:logs ok), and the
  weekly summary appends the codes to the attempt-2 reason, so the job log alone says why next time.
