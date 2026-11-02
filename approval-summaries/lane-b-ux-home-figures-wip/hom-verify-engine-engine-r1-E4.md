# Verify engine-r1-E4 (reconciliation-001 Ledger semantics lacks a "not an exception" note) at 87691be4
Checked (clone scratchpad/rev-engine at 87691be4):
- reconciliation-001.md:464-469 Ledger semantics: no mention of PR 93 / ADR 0082. PR does not touch the file.
- Freeze checks literally hold: packages/ledger unchanged (git diff --quiet), no migration, roi_statement DDL none.
- statements.ts:97-101,119 OPEN_CASES_ACTIONABLE feeds roiStatement() ACTIONABLE_NOW: meaning of actionable_open_cents changes from 2026-11-01.
- ADR 0082 Decision 6 (l.86-98) and Consequences (l.138-139) record the meaning change, but grep finds no "exception"/"freeze" in ADR 0082.
- PR body l.133 leaves open "whether the stored figures' new meaning needs a freeze exception".
- Precedent: "Not an exception to a check above" lines in reconciliation-001 exist only for founder rulings (PR 6b-x, CI F-series); no UX PR / ADR 0072-0083 recorded there.
- Finding's "not a #42 file" is wrong: pr42-files.txt:97 lists reconciliation-001.md; #42 adds ~10 lines near l.638 (rule 6 merge).
Verdict: real, nit. Better fix: one sentence in ADR 0082 Decision 6 (a #93-owned file) stating not an exception and why; close PR body row; reconciliation-001 line optional.
