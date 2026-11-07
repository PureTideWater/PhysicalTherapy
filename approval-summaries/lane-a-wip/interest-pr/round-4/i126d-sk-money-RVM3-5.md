# i126d skeptic RVM3-5 (design doc out of step)
- started; design file lives in /home/user/ops (separate repo), last commit e682aa56
- PR head now 98bb9c00 (not 9824f4e9). Design is NOT in PR #126's diff: it lives in /home/user/ops on branch claude/build-ops (last touched e682aa56); no designs/ dir in the repo.
- Evidence facts hold: grep zero hits for mayYetHold/outOfReach/unplaced/MONEY-R4-1/R2M2-1/RV-DB2-1; design.patch applies cleanly (unapplied), lacks MONEY-R4-1/R2M2-1/RV-DB2-1; 4.1 renumbered-reversal row still says "C2's 540 again" while interest.test.ts pins nothing written.
- But the in-PR records are current: ADR 0084:131-152 states F1 waiting, interestUnplaced (R2M2-1), interestOutOfReach (MONEY-R4-1), unplaced share (RV-DB2-1); test-matrix LED-23 states the renumbered reversal adds no interest.
- Design is a dated pre-build "Design contract, 2026-10-27, against e908c21"; LANES pipeline has no rule to rewrite it after build; grant covers 10.1 "as written", which the finding concedes is unwidened. No test, amount or check affected.
- VERDICT: real=false (record gap in an out-of-repo ops document, not a defect in this PR's own change).
