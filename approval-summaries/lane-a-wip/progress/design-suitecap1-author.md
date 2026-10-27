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
