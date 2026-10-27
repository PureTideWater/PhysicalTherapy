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
