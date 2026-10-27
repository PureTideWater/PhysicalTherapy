# design-suitecap1-author progress
Started 2026-10-27. Output: /home/user/ops/designs/suite-cap-1-triage-locks.md
Clone: scratchpad/designs/suitecap1-author
## Status
- [x] clone (scratchpad/designs/suitecap1-author at e908c21; #42 head 098636e3, merge-base e908c21)
- [x] read LANES entry (:186, :264-271), status file, capacity summary, house style (pr6b-email-streams.md: numbered sections, D-decisions, tables, Q founder questions, open items, out of scope)
- [ ] verify scouts' claims in code
- [ ] probes
- [ ] outline
- [ ] sections written
## Notes
## Verified in code (author, 2026-10-27 ~03:00)
- line_status_rules latest 20261023120000:550-579, lock :557, lookup :558 (no practice_id). earlier 20261022090000:42-73 (:49), 20261019160000:344-378 (:351). belongs 20261022090000:76-90 (AFTER ROW). ledger_rules 20261023120000:587-606.
- table 20261019160000:132-152; seq identity :137; index line_status_by_line :152.
- execute.ts: advanceStages :326-344 (INSERT..SELECT ORDER BY service_line_id); flagged :444, closeWindows :446, candidateRows+candidateLines :447, validated :450, insertCaseLines :456/:460, actionable :464; lockPractice :396-398 taken :426; executeTriage one txn :480-482. candidateRows :210-258 reads p.trace for all, readWithAudit -> one audit_event per row.
- report generate.ts:52-100 one txn: FOR UPDATE :57, triageInScope :73, gatherReport :79, pdf/S3 :82-87, UPDATE ready :88.
- patterns.ts openCaseOnPattern :152-180, lockPractice :157, INSERT :173.
- web reopenLineAction routes/triage.ts:503-538: UPDATE case_line :523, currentStage read :526 (outside any lock), INSERT :528. currentStage = web triage/queries.ts:693-696.
- reconcile: lockLedger 'ledger:'P ledger.ts:16-18; pass.ts reconcilePractice one txn, syncLineStages :45 (check exact); stages.ts insertStage :61-70, syncLineStages :72-103 (reads current outside lock, row by row). manual.ts begin() :46-50, finish -> syncLineStages.
- ledger advisory: 'ledger_evidence:' 20261027090000:172, 'ledger_line:' :246 (trigger fns on ledger_entry). reconciliation-001.md:464-466 "No migration alters, or adds a trigger or policy to, ledger_entry..." -> changing those = ledger freeze exception (founder).
- service_line: tp_app SELECT + INSERT(cols) only, no UPDATE grant (20261016120000:485-488) "loaded records never change"; tenant policy FOR ALL any role (:436-440) -> definer owned by tp_owner still scoped by app.practice_ids. No app code row-locks or updates service_line.
- Isolation: writers are READ COMMITTED (only read-only snapshots use RR; rerun.ts:286-306 asserts RC for acceptRun).
- other per-practice advisory: pricing_current (shared/excl) 20261103090000:757-767.
- probes dir: clone/tmp-probe (seed.mts); db tp_design_suitecap1_author_1
## Run 2 (resumed after interruption)
- probe DB tp_design_suitecap1_author_1 not present (never created or dropped); tmp-probe/seed.mts exists in clone
## Run 2 decisions forming (2026-10-27 ~14:45)
- Re-read: LANES :18-19 (rule 2), :186 claim, :264-270 hand-over; status file :38 (stored windows with #8); capacity summary (A triage 48.1 s/attempt failed, report 47.2 s failed, peak 803.9 MiB whole run vs 556.7 concurrent).
- Ledger freeze (reconciliation-001.md:464-466) lists ledger_entry, ledger_match, posting_row, eft_row, roi_statement: line_status is NOT frozen -> line_status_rules change needs no exception. ledger_entry trigger fns (ledger_evidence :172, ledger_line :246 in 20261027090000) ARE frozen.
- Leaning: per-line ROW lock on a new head table (line_stage_head: one row per line, current stage + seq) taken in line_status_rules; seq reassigned after the lock (fixes inversion); zero advisory locks; no writer changes; no new waits for people; no new deadlock shapes. Practice lock (V1/V3) rejected: reopen/manual wait behind report PDF (~100 s), lazy=deadlock (scout repro), needs lock_timeout+refusal copy. service_line row lock (V2) rejected: dirties immutable PHI heap, multixacts with concurrent FK KEY SHARE (pricing rerun), VM bits, definer per row. RDS param rejected.
- Ledger part: check every ledger_entry writer holds ledger:P up front; if so recommend trigger key -> 'ledger:'||practice (re-entrant, 1 slot) under a founder freeze exception; else follow-up.
- Memory: triage holds 100k traces (candidateRows reads p.trace for all) -> consider cursor chunks keeping only CandidateLine.
- DECIDED line_status: table line_status_head (PK (practice_id, service_line_id), stage, seq), backfilled; line_status_rules SECURITY DEFINER does one INSERT .. ON CONFLICT DO UPDATE .. RETURNING old.stage, new.seq (PG18; RDS VER_18, compose postgres:18): row lock via arbiter index (no planner seq-scan risk), seq assigned after the lock (fixes inversion). Probe SQL: clone/tmp-probe/head.sql
- Migrations: one txn each, SET LOCAL ROLE tp_owner (migrate.ts:116-126); backfill precedent set_config app.practice_ids (20261101090000:49-51)
- catalog: registry list exact (catalog.db.test.ts:66+), practice_id must lead an index (catalog.ts:369)
- Next: probes A (sql: 53200 before, head after, race, inversion, deadlock shape, analyze-empty) then B (100k triage large probe test, before/after, time/mem/locks)
- PROBES DONE (tp_design_suitecap1_1 on 5433, P1 3254a631.. 120k lines, P2 85122e1b.. 2k):
  - A1 old trigger as tp_worker_dev: 12k INSERT ok 0.90 s holding 12,000 advisory locks; 20k -> 53200 at line_status_rules line 8 PERFORM (0.51 s)
  - A2 noisy neighbour: P1 holding 13,000 -> P2 2,000-line insert 53200 in 68 ms
  - A3 head variant (plpgsql needs RETURNING WITH (OLD AS prior, NEW AS next)): 20k flagged 2.55 s + 100k validated 12.5 s + 60k actionable 8.65 s = 23.7 s one txn, 0 advisory locks, 40 lock-table entries, head == latest event for all 180k (0 mismatches). Slower than scout V0 10.2 s -> need fair comparison (private cluster max_locks 1024) and variants (no FK on head, fillfactor)
  - private cluster /tmp/tp_design_suitecap1_pg5493 (PG 18.4, port 5493, max_locks 1024), db tp_design_suitecap1_2 (P1 3e804d98.. 120k, P2 c9aaebe7.. 2k). STOP + rm when done.
  - V0 180k on never-vacuumed empty line_status: 1.58+8.13+5.42 = 15.1 s, 120,000 advisory locks
  - PATHOLOGY reproduced: after VACUUM of the emptied table (reltuples 0) V0's second run stuck >9.5 min in validated insert (generic plan seq scan, O(N^2)); head variant immune (ON CONFLICT arbiter is index-driven)
  - VARIANTS (180k events: 20k flagged+100k validated+60k actionable, one txn, worker login, 2k history analyzed, 5493):
    V0 today 1.69+8.57+5.60=15.9 s 120,000 adv locks | V1 practice lock 1.73+7.89+5.25=14.9 s 1 lock | H1 head+FKs 2.38+11.65+8.41=22.4 s 0 | H2 head no FK 1.82+9.73+7.03=18.6 s 0 | H3 no FK ff50 1.93+10.99+6.76=19.7 s 0 | FLOOR (rules trigger off) 1.32+6.68+3.90=11.9 s
    -> choose H2 (no FKs on head: redundant with line_status's own FKs in the same statement; +2.7 s/180k vs today)
  - RACES (race.sh on 5493; SYNTHETIC): R1 two concurrent 'validated' one line: V0, V1, H2 all refuse the second. R2 inversion: V0 events flagged@524, actionable@525 (xmin 939, committed last), validated@526 -> current by seq = validated, then a SECOND actionable passes (flagged, actionable, validated, actionable = duplicate forward); V1 same inversion; H2: flagged@541, validated@544, actionable@545, current actionable, second actionable refused. R3 T1 stage(L3)+row R vs T2 row R+stage(L4): V0 both complete; V1 (practice lock in trigger) 40P01 deadlock detected; H2 both complete.
  - EMPTY-STATS: fresh db tp_design_suitecap1_3 (5493), H2 applied, VACUUM ANALYZE both tables (reltuples 0): 180k workload 2.0+10.5+8.4 = 20.9 s linear (V0 same state >9.5 min)
- Next: probe B (100k triage+report through the real code on 5433, before/after), file apps/worker/src/triage/probe-suitecap1.large.db.test.ts in clone
  - probe B test: clone apps/worker/src/triage/probe-suitecap1.large.db.test.ts (+ testing.ts TP_PROBE_DB_NAME patch, clone only); runner tmp-probe/probe-b.sh (dbs _4 before, _5 after on 5433); smoke 2k ok (triage 1.1 s, report ready 2.3 s, 1 advisory lock = triage:P)
- probe B launched 15:10 UTC in background (probe-b.sh > tmp-probe/probe-b.log), waiting on /tmp/laneb-heavy.lock (#42 harness tp_pr6b4_harness_2 holds it). If interrupted: rerun probe-b.sh.
- Ledger part verified: every ledger_entry insert is after lockLedger (pass.ts:39; manual.ts begin() :46-50 first stmt of matchPostingByHand :71, matchDepositByHand :101, matchClaimByHand :136, reverseMatch :178, adjustEntry :229); no SQL writer of ledger_entry. Trigger fns only in 20261026090000 + 20261027090000 (latest: within_evidence :147-201 lock :172; within_line :219-270 lock :246). -> D: key 'ledger:'||NEW.practice_id (= lockLedger key, re-entrant, 0 new slots) under founder freeze exception (Q1); else follow-up.
- Chain: SS-01 migration 20261108090000_suspension_refusal.sql -> this item 20261109090000_line_status_heads.sql (next free at build)
- Registry: none(8, 'no file', [tests]) like CAS-38/39; matrix row format | ID | Title | Expected |
## OUTLINE (doc /home/user/ops/designs/suite-cap-1-triage-locks.md; style = ss-01-suspension.md)
0 ten lines; 1 problem+evidence (1.1 code, 1.2 what lock protects, 1.3 probes); 2 options+rec; 3 decisions D1..; 4 schema (4.1 table, 4.2 fn, 4.3 ledger part, 4.4 grants, 4.5 deploy/rollback); 5 app changes (none for locks; harness; ADR 0038 unchanged); 6 sentences (none change; list verbatim); 7 tests CAS-40..42; 8 measurement (weekly + local); 9 domain model + function files; 10 founder; 11 files (#42 marked); 12 risks; 13 slices; 14 handed on/out of scope (#8 windows; reads via head; memory streaming if needed); 15 probes
- doc sections 0-6 written (15:3x); 7-15 next; probe B pending
- facts: Drizzle mirror required (migrate.db.test.ts:596-618) -> packages/db/src/schema/triage.ts (+ index.ts, #42 file); cross-tenant handles no-INSERT tables (cross-tenant.db.test.ts:212-215); runbook for release-capacity = docs/runbooks/ci.md:44-45; reportFailureText queries.ts:61-69
- probe B waiting behind #42's screening:capacity (flock, up to 90 min from 15:08)
- sections 7-15 written; 8.3/8.4 PENDING probe B
  - L1: 50,000 re-takes of one key = 1 lock-table entry
  - backfill read: 180,000 events DISTINCT ON in 0.41 s (tp_owner, all practices in scope)
- private cluster 5493 stopped and removed (15:3x)
- dropped tp_design_suitecap1_1
- PROBE B BEFORE (db _4, 5433, 15:10-15:23): priced 100k in 64.7 s; triage 47.9 s FAILED 53200 at 14,844 advisory locks (matches harness 48.1 s); heapUsed peak 569 MiB (base 56), rss peak 907 (base 541); report (inline triage) 51.1 s FAILED 53200 at 14,840; re-triage 36.1 s FAILED. => memory near worker heap 560: consider probe C with --max-old-space-size=560 after AFTER.
- FINDING (probe B AFTER, 15:31+): report's gatherReport -> lineCorrections/casePatientBalance (report/content.ts:28) -> claimLines (reconcile/remittances.ts:249-262) recursive query + correlated subquery on claim.superseded_by_claim_id with NO index: running >3 min at 100k lines. The index is 15b's handed item (LANES :276), tentatively in row 187 (interest item, waits on freeze exception). Plan: probe C = head + partial index claim (superseded_by_claim_id) WHERE NOT NULL + NODE_OPTIONS=--max-old-space-size=560 (tmp-probe/head-apply-c.sql). Recommend moving index into this item.
- PROBE B AFTER (db _5, 15:23-15:43, head trigger): priced 59.4 s; TRIAGE 254.0 s completed (66,666 validated, 33,334 actionable, 1 case), 1 advisory lock, heapUsed peak 598 MiB (base 56), rss 911; REPORT (inline triage) 749.2 s ready, heapUsed peak 770 MiB, rss 1079, ext+buf 199; RE-TRIAGE 22.4 s heap 370. => locks fixed, but time+memory NOT within worker: find the 230 s in first triage writes (case_line triggers? O(N^2)?) and the report's claimLines (no superseded index) + memory.
- CAUTION: probe B ANALYZEd line_status while EMPTY (setup) -> case_rules' per-line subqueries (20261023120000 case_rules: two correlated line_status lookups per case line, no practice_id) likely seq-scanned -> B AFTER's 254 s triage is suspect. Probes C/E/D (tmp-probe/probe-cde.sh, log probe-cde.log): no line_status ANALYZE; timing marks patched into clone execute.ts/generate.ts/content.ts (PROBEMARK lines). C head+index (db _7), E = C with --max-old-space-size=560 (_8), D head only (_9).
- PROBE C (head+claim index, line_status never analyzed; db _7; 15:45-15:53). Marks are per-module (first mark per module meaningless).
  TRIAGE 259.7 s: screened 1.3; candidates read+judged 38.0 s heap 604 MiB; validated written 8.3 s (66,666); planned 0.1; case lines 3.8 s (33,334); ACTIONABLE WRITTEN 208.0 s (33,334) <- suspect case_rules per-line line_status subqueries (20261023120000 case_rules) planned as seq scans (stats say tiny; txn's own 100k rows) via line_status_refresh_cases -> UPDATE case. heapUsed peak 626, rss 938.
  REPORT 126.0 s: inline triage ~22 s; gather 101.6 s (runLines ~25 s heap 829; deadlines+ledger 23.1 s heap 978; patientBalance 49.7 s WITH index); pdf 0.4; stored 1.5. heapUsed peak 1125 MiB, rss 1522 MiB.
  RE-TRIAGE 25.3 s heap 379.
  => memory NOT within worker (heap 560/task 1024) for report, maybe not for triage; E tests heap limit. Need: case_rules fix (practice_id + head row?), triage candidate streaming, report streaming.
