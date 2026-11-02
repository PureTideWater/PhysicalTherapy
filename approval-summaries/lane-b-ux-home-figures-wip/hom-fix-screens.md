# hom-fix-screens progress
Started fresh (no earlier progress). Worktree /home/user/ux-home-figures at 87691be4, clean.
## Done
- Code edits written (not yet verified): triage/display.tsx (OutOfFigure, ActionableLinesOn, NetExpected, listed(), "no line (all N written off)"), lib/triage/queries.ts (NetExpectedState, netExpectedOf, CaseSummary.netExpectedState) + queries.test.ts, case page, packet page, cases page (Counted, none (all N written off), struck-through words), reconciliation/display.tsx (notes, proofLevelWords posted no parens), headline.tsx (none yet, quarter nowrap, ActionableNote), recovered-words.ts, ROI page link names; tests: triage display.test, headline.test, reconciliation display.test.
- Next: tsc/eslint/unit tests, lint:copy, e2e specs, ADR notes.
- MISTAKE: ran npx prettier (not a repo tool; default width 80) on my files, reformatting them; reverted them with git checkout and am reapplying the edits. Never run prettier here.
- Reapplied all edits via scripts in /tmp/claude-0/-home-user-PhysicalTherapy/e9e32b44-ea9a-56f5-83b4-9164e617462b/scratchpad/fixscripts (a_triage.py, b_screens.py, c_tests.py) on HEAD versions; diff now small.
- Verified: web tsc exit 0; worker tsc exit 0; eslint --max-warnings 0 on 13 touched files exit 0; vitest unit (triage, dashboard, reconciliation, reports components + lib/triage/queries.test.ts) 6 files 57 passed; pnpm lint:copy pass (540 files).
- e2e edits: reconciliation.spec HOM-04 pinned $0.00 + exact stale note, stage[\s-]*(five|5) on home (allTextContents minus help) + pinned help exception, case page, reconciliation; ledger-patient-share :62 and :91 new notes.
- Next: e2e run 1 = reconciliation.spec alone (build), run 2 = E2E_PREBUILT=1 reconciliation+ledger-patient-share+triage+packets+monitoring; log in scratchpad/hom-fix-e2e-*.log
- e2e attempt: started run under flock; then stopped the wrapper to shorten Reconciliation's Payer approved note (kill of the remaining playwright/next pids was refused by the auto-mode classifier), so the orphaned playwright run of reconciliation.spec continues WITHOUT the lock, log hom-fix-e2e-1.log (build finished before the note edit; reconciliation.spec does not assert the Reconciliation note).
- Reconciliation note now 'what payers agreed to pay to date, never the patient’s share; only <level> cash counts as recovered' (same length as before); home note keeps 'deposited or not'. display.test + ledger-patient-share.spec:62 updated.
- e2e run 1 (reconciliation.spec alone, build at the earlier note wording, run outside the lock after the wrapper stop): 1 passed (2.6m); HOM-04 pinned $0.00 + stale note passed.
- After the note change: vitest unit 16 files 147 passed (web components + lib/triage + worker reconcile/report); eslint --max-warnings 0 on touched files + 2 specs exit 0; lint:copy pass.
- e2e run 2 under flock (fresh build; reconciliation, ledger-patient-share, triage, packets, monitoring; PG18 5433, tp_e2e_homfix, port 3192, 2 workers): 7 passed (4.3m); tp_e2e_homfix dropped. HOM-04 stable over 2 runs at $0.00.
- DONE: all screens-part findings. ADR notes appended to hom-fix-adr-notes.md.
