# hom-rereview-engine (round 4)
started; reading diff
- E1: measured test now writes off one line and reopens another (line_status seq) inside counted(); passes (home-figures.db.test 5/5). Fixed.
- E2: ledgerTotalsOver exported; practiceLedgerTotals + recoveredPeriods both use it; test compares to it. Fixed.
- R1: standing rule matches lineLedgerStage's undone idiom; reversals exact (stages.ts:145), only reverseMatch reverses and it reverses the match's adjustments too -> adjusted-survivor only in generator. OK.
- E3: netExpectedOf + NetExpected; tests per branch pass.
- R3: doc comments updated in 3 places. R2: ADR/test comment.
- unit tests (4 files, 31) pass.
