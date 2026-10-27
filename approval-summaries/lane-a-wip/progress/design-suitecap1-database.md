# design-suitecap1-database progress

Clone: scratchpad/designs/suitecap1-database at e908c21 (origin/claude/build-platform)

## Read so far
- status file lane-b-release-content-checks-status.md:21 (SUITE-CAP-1, price fits 804 MiB/1024; windows query 10-13 s cold advisory), :38 (stored windows -> Lane A with #8)
- LANES.md:186 (claim: branch co-001/suite-cap-1-triage-locks, ADR 0083, CAS-40..42, synth module 5, release 900008 only if needed), :264-270 (handoff)
- line_status_rules versions: 20261019160000:344-378 (orig, lock :351), 20261022090000:42-73 (lock :49), 20261023120000:550-579 (latest, lock :557). Also line_status_ledger_rules 20261023120000:587-606; line_status_belongs 20261022090000:76-90.
- Other per-line advisory: 'ledger_line:' 20261027090000:246 (check what), 'ledger_evidence:' 20261026090000:188 / 20261027090000:172
- #42 (mail_streams) touches NO line_status/triage/case function; touches set_updated_at, reject_change, app_actor_group_practice_ids, app_actor_is_platform_admin, submit_screening etc.
## Writers of line_status (non-test)
- apps/worker/src/triage/execute.ts:329-344 advanceStages (multi-row INSERT..SELECT, flagged/validated/actionable, set_by NULL), called :437 flagged, :443 validated, :456 actionable; whole triage in ONE txn (executeTriage :480) under 'triage:<practice>' advisory (lockPractice :396)
- apps/worker/src/triage/patterns.ts:157,173 openCaseOnPattern (person; triage lock; multi-row actionable)
- apps/worker/src/reconcile/stages.ts:61 insertStage row-by-row in syncLineStages :72-102 (callers reconcile/pass.ts:45 (job, set_by null), manual.ts:65,:255 (person)); reconcile holds 'ledger:<practice>' lock (reconcile/ledger.ts:17), NOT triage lock
- apps/web/src/lib/routes/triage.ts:528 reopenLineAction (person reopen; NO practice lock; UPDATE case_line first :522 then INSERT line_status)
- Report inline triage: apps/worker/src/report/* calls triageInScope (to confirm)
## Hypotheses to probe
- seq identity default evaluated BEFORE the BEFORE-row trigger takes the lock -> seq order can invert vs commit order (latent bug today)
- per-practice lock in row trigger -> deadlock with web reopen (case_line row lock then line_status) vs triage (flagged insert then closeWindows UPDATE case_line)
- 'ledger_line:' per-line advisory in ledger_entry_within_line (20261027090000:246) = same class hazard for reconcile at real size
- Other callers: report/generate.ts:73 triageInScope inline (same txn as audit_report FOR UPDATE :57); monitor/job.ts:32 closePassedWindows (triage lock, no line_status write); web workbench.ts:70 openCaseOnPattern; web reconciliation.ts:261 etc -> worker/ledger manual (syncLineStages with actor)
- Infra: prod RDS db.t4g.medium (environments.ts:156), staging small, dev micro; parameter group only rds.force_ssl + TLS (infra/lib/constructs/database.ts:128-132): max_locks_per_transaction default 64. Harness PG: max_connections=200, no max_locks (tools/screening-capacity/containers.ts:229-268)
- No statement_timeout/lock_timeout anywhere in repo.
- PRECEDENT: ADR 0060 (docs/adr/0060*.md:128-133,195,239) + apps/worker/src/parse/loader.ts:47-50,132 TRACE_LOCK_BUCKETS=64: per practice x bucket advisory locks, taken ascending up front; era-export.large.db.test.ts:101-155 asserts peak advisory locks <= 64 via pg_locks. Rejected 'one lock per practice' there because it would serialize a practice's loads.
- ADR 0038:65 says triage 'an advisory lock per practice'; ADR 0042:114 reconcile one txn under practice advisory lock.
- release-capacity.yml read (weekly cron 29 3 * * 2; fails on any job not complete).
## Probes (db tp_design_suitecap1_1, migrated from empty at e908c21, 44 migrations; local PG 18.4: max_locks_per_transaction 64, max_connections 100, autovacuum_worker_slots 16, max_worker_processes 8, max_wal_senders 10 -> nominal 64*135=8,640 slots)
- Seed: 2 synthetic practices (replica mode), P1 120k service lines, P2 1k.
- P1 REPRO: tp_app, one INSERT..SELECT 'flagged': 12k ok (0.70 s), 14k ok (0.81 s), 16k/18k/20k -> ERROR 53200 out of shared memory at line_status_rules line 8 PERFORM pg_advisory_xact_lock. ~59 us/row linear as tp_app.
- P2 NOISY NEIGHBOUR: while P1 txn holds 14,000 advisory locks, P2's 1,000-line insert fails 53200 in 30 ms (cross-tenant blast radius). Relation-lock query in a 3rd session still ok (fast path).
- As superuser (RLS bypass) the per-row current-stage SELECT has no practice_id -> cannot use line_status_by_line (practice_id, service_line_id, seq DESC) -> O(N^2): 5k 1.06 s, 8k 3.1 s, 12k 8.0 s. Under tp_app the RLS predicate supplies practice_id. Fix candidate: add s.practice_id = NEW.practice_id to the lookup.
- Trigger list on line_status: line_status_rules (BEFORE ROW), line_status_ledger_rules (BEFORE ROW), line_status_belongs (AFTER ROW), line_status_refresh_cases (AFTER STATEMENT, transition table, SECURITY DEFINER, UPDATE "case" -> case row locks; 20261023090000:837-845), never_deleted, no_truncate.
- IDENTITY probe: a BEFORE ROW trigger sees NEW.seq already assigned (identity default precedes BEFORE ROW triggers) and CAN reassign a GENERATED ALWAYS identity (NEW.seq := ...) -> fix can take seq after the lock (nextval needs USAGE on line_status_seq_seq for tp_app, or a definer helper).
- SEQ INVERSION REPRO (probe delay trigger line_status_a_probe_delay, fires before line_status_ledger_rules/line_status_rules alphabetically): B 'validated' got seq 145469 then waited; A 'flagged' seq 145470 committed first; B then passed its check vs flagged and committed with the LOWER seq. Readers (seq DESC LIMIT 1) see 'flagged'; a second 'validated' (145471) then PASSED the trigger -> duplicate forward event without reopen. Today's per-line lock orders the checks but not seq. Real window: identity default -> line_status_ledger_rules (ledger_line_stage() for ledger stages) -> lock.
- Readers of current stage by seq DESC: 16 TS sites in 10 files (web remittances/monitoring/reconciliation/dashboard/triage queries, routes/settings.ts, routes/triage.ts, worker report/content.ts, triage/execute.ts, reconcile/stages.ts) + SQL fns (case_rules, ledger_line_stage, packet_version_*, priced_line_deadline_status, case_next_window_deadline_status). Changing the order key is wide; keep seq and make it lock-ordered.
- Release-capacity scenario (tools/release-capacity/scenario.ts:43-76, run.ts:426-457): A 100k measured, B 20k priced+triaged in setup, B report concurrent, then A triage then A report. NO reconcile phase -> ledger per-row locks unmeasured.
- Reconcile sibling hazard: ledger_entry_within_line 'ledger_line:'||service_line (20261027090000:246) + ledger_entry_within_evidence 'ledger_evidence:'||row (20261027090000:172) + per-line line_status locks in syncLineStages -> up to ~3 locks per line in one reconcile txn.
