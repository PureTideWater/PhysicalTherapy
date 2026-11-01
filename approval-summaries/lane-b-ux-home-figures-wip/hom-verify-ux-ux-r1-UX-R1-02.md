# R1-02 verify (done)
Clone: scratchpad/vR02 at 87691be4.
Checked: display.tsx:86-89 PAYER_APPROVED_HOME_NOTE; headline.tsx:63-69; packages/ledger/src/totals.ts:89-94 payerApproved = min(approved, max(proved, approved+recouped)) -> cumulative, includes proved cash; recoupment after proof leaves approval at 30. Shot hom-screens-after p.home.default.1280: Payer approved $30.00 / Recovered (deposited) $12.00 / notification "took back -$18.00".
Base 43565235 page.tsx:214 note was "not cash until it posts" (same pending reading, and wrong level) -> pre-existing, PR improved it but rewrote the note so it is in scope.
Verdict: REAL, should-fix (not blocking). Overstatement: reader infers the $18 gap pending, not "another $30".
Fix gap: same reading in PAYER_APPROVED_NOTE (display.tsx:80-83); display.test.tsx:370-371 also asserts "only once it is ${level}" and must change.
