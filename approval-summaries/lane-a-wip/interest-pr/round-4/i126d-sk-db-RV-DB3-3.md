# RV-DB3-3 skeptic
- started; cloning
- clone r4-sk-db-RV-DB3-3 @ 98bb9c00 (head moved past 9824f4e9). Runbook :320/:324/:335 lines as cited; migration header :51-57 says "a page reading the ledger waits" + "(REPEATABLE READ: Reconciliation among them)" -- generic class, explicitly non-exhaustive; header has NO "Reconciliation or ROI statement" cause list.
- verified: practice.home oneSnapshot (practice.ts:217); dashboard() reads ledger_entry (practiceRecoveredPeriods->ledgerEntries) then ledger_match (queuesOf->unmatchedItems NOT EXISTS). Mechanism holds.
- other RR ledger readers also unnamed: practice.cases.case (triage.ts:402), practice.abstraction.ledger (specialist.ts:111). So list is illustrative ("among them").
- previous image (8a722f80 and origin/claude/build-platform) Home is oneSnapshot too and reads both tables; page.tsx:123 shows queues.unmatched. Mechanism holds; no repo test cited, no pnpm install / DB probe needed (RV-DB2-5 probe already reproduced the RR-empty read).
- runbook :319-321 already says "any open transaction that has read either table refuses a try ... a page that reads the ledger (...)": Home is in that class. :324 and header :54 and ADR 0084 D16 :213 say "Reconciliation among them" (non-exhaustive). Header has no named cause list, so "the header says the same" is wrong. Only :335 is a narrow cause sentence; operator remedy unchanged (finding concedes).
- text is this PR's own (9824f4e9 / f4bd94d3), but nothing false; naming Home would not complete the list (case page, ledger review also RR).
VERDICT: real=false (illustrative list, no false statement, no operator action changes; header/ADR need no change). Clone removed.
