# hom-rereview-engine (round 4)
started; reading diff
- E1: measured test now writes off one line and reopens another (line_status seq) inside counted(); passes (home-figures.db.test 5/5). Fixed.
- E2: ledgerTotalsOver exported; practiceLedgerTotals + recoveredPeriods both use it; test compares to it. Fixed.
- R1: standing rule matches lineLedgerStage's undone idiom; reversals exact (stages.ts:145), only reverseMatch reverses and it reverses the match's adjustments too -> adjusted-survivor only in generator. OK.
- E3: netExpectedOf + NetExpected; tests per branch pass.
- R3: doc comments updated in 3 places. R2: ADR/test comment.
- unit tests (4 files, 31) pass.
- (resumed) E3 partition: ACTIONABLE_NOW_OF lines+moved_on+stale=open_lines, so no_line with open>0 always names a cause. OK.
- R1 edge: adjust of a reversed entry refused by adjustEntry (manual.ts:233-238); reverseMatch reverses adjustments too -> recovered>0 with firstOn null unreachable in app.
- Reran: worker recovered-periods 4/4; web queries.test + triage/display + headline 27/27.
- Findings: nit queries.ts:66 recoveredSince doc stale; nit recovered-periods.test.ts:107 comment says "nothing posted yet".
DONE
