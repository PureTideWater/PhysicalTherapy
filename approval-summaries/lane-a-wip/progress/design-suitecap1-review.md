# design-suitecap1-review progress
Started 2026-10-27. Reviewing /home/user/ops/designs/suite-cap-1-triage-locks.md (78 KB, 988 lines, mtime 17:01).
Clone: scratchpad/designs/suitecap1-review (base e908c21; #42 head 8aa45a46 fetched; design cites 098636e3).
Design read in full (run 2).
## Leads opened (to check)
L1 definer trigger + FORCE RLS: helpers/seeds that insert line_status without app.practice_ids (superuser/owner) now fail on head insert?
L2 backfill: practice table RLS -> array_agg empty -> empty head -> stage regression; migrate.ts isolation level / lock_timeout
L3 'ledger_line:'/'ledger_evidence:' keys used elsewhere (paired locks) -> D8 breaks pairing?; all ledger_entry writers under lockLedger?
L4 harness check 64 advisory locks vs loader TRACE_LOCK_BUCKETS (+1 practice lock = 65?) ; CAS-41.4 sampler during pricing
L5 cursor_tuple_fraction plan risk for DECLARE CURSOR
L6 report/triage isolation level (REPEATABLE READ -> 40001 on ON CONFLICT)
L7 insertStage savepoint/catch semantics vs lock release
L8 catalog rules on SECURITY DEFINER / indexes leading practice_id
L9 #42 / SS-01 / interest design touching line_status_rules or ledger functions
L10 large tests run in CI on PRs? CI max_locks setting
L11 pgboss retry_count / archive
L12 line_status_ledger_rules reads before lock
## Leads closed (sound)
## Findings so far
- (run 2) DB tp_design_suitecap1rev_1 on 5433 migrated at e908c21 + design mig.sql (probes/suitecap1rev/). DROP AT END.
## Closed sound (run 2)
- L1: test helpers use asOwner (sets app.practice_ids) -> definer head insert passes RLS. tp_owner NOBYPASSRLS; practice_resolver lets owner read all practices (backfill OK).
- L6: all stage writers READ COMMITTED (oneSnapshot refused for mutations invoke.ts:465; jobs plain BEGIN).
- L7: insertStage no savepoints.
- L3: 'ledger_line:'/'ledger_evidence:' only in the two triggers; all insertEntry callers under lockLedger (pass.ts:39, manual.ts:48).
- L11: pg-boss 12 has retry_count.
- Probes (race.cjs): r1 refused, r2 order fixed + 3rd refused, first-event race (rollback/commit) OK, multirow same line OK, cross-tenant -> immediate 42501 on line_status_head (no wait; better than today), person reopen vs forward refused, savepoint rollback releases.
- Backfill: head == latest for pre-migration rows (2 practices).
## Open now
- 'submission:' per-case advisory locks in case triggers -> per-case lock count in triage/reconcile at many patterns?
- (run 2, cont.) Closed: 'submission:' locks are per submission/case insert (not triage). #42 head 8aa45a46 migration: no line_status/ledger/claim overlap. SS-01: no overlap. D8: both ledger triggers check practice_in_scope before lock (no cross-tenant wait). LATERAL advanceStages uses index under empty stats (probe lateral.sql on tp_design_suitecap1rev_2: 20k actionable 2.7 s). 'extra table' divergence informational. migrationsDir option exists for CAS-40.6. PDF is summary-only (no per-line Chromium blowup). price.large runs 100k on PRs (CI precedent ok). Repo public -> 4-CPU runners.
## Findings so far
- F1 (should_fix): memory headroom. G2 report heap 483/560 MiB (86%) under flag, probes used stand-in PDF (no Chromium installed here: no ms-playwright cache), chain peak in #49 already 803.9 MiB (78.5%) > design's own 70% streaming trigger; trigger measured on container memory while binding limit is V8 heap 560. "Not now" for streaming contradicts its own trigger; no headroom test.
- F2 (nit): 4.7/12 "seconds" table-lock wait: LOCK TABLE waits for in-flight triage/report txn (report holds txn while printing PDF; up to job expiry 15 min) and queues all stage writers (reopen requests -> ALB 180 s). No lock_timeout anywhere.
- F3 (nit): 14 "a large practice's page would take seconds" vs measured 19-23 s.
- F4 (should_fix): one worker task (environments.ts:111 desiredCount 1), every JOB_TYPE worked concurrently (worker.ts:236, batchSize 1 each) -> practice X's 100k audit report (G2 heap 483) + practice A's 100k triage (213) or pricing in the same process = >560 MiB heap -> V8 OOM crash kills all in-flight jobs of all practices. Harness chain runs triage/report alone; concurrent phase has only B's 20k report. Cross-tenant fault moves from lock table to heap. Fix: streaming now / heavy-job semaphore + concurrent large-job harness phase.
- F5 (should_fix): rollback/deploy window: previous image on new schema passes the lock and its whole-read report OOMs the worker (probe E: FATAL heap OOM in gatherReport) where today it fails 53200 cleanly; 4.7 says "works as before". Fix: ship D12-D14,D16 in a preceding app-only PR (no schema dep), or runbook guard.
- F6 (nit): CAS-40.5 property "any stage, by no one" vs line_status_ledger_rules (payer stages need ledger entries) & tp_app restrictive policy/reason enc CHECK -> model must include ledger rule or restrict domain.
- Closed: CAS budgets binding in PR CI has precedent (price.large <120 s). CAS/ADR numbers free (CAS-39 last; ADR 0073 last on base and #42).
- F7 (nit): CAS-41.3 wall-clock ratio -> use pg_stat_xact_user_tables.seq_scan delta on line_status (deterministic).
- F8 (nit): section 9/11 omit triage_never_deleted.sql and triage_no_truncate.sql (their "Trigger function of:" headers gain line_status_head rows).
- Closed: restore drill counts as owner with all practices (reads head fine). cursor plan: G2 used DECLARE CURSOR, candidates 32.7 s vs 35.3 s whole read.
- CLEANUP DONE: dropped tp_design_suitecap1rev_1 and _2. Clone node_modules installed (offline). STATUS: reporting.
