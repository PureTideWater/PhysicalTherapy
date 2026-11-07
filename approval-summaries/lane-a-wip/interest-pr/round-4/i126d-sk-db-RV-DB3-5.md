# RV-DB3-5 skeptic: started 2026-11-07T12:49:05Z
Head checked: origin/co-001/ledger-interest-once = 98bb9c00 (past 9824f4e9).
Evidence holds as fact: designs/ledger-interest-once.md last changed e682aa56 (2026-10-27), ops clean; no mayYetHold/unplaced/out-of-reach terms; ADR 0084:132-155, 296-301 carry the rules.
But: the design is in /home/user/ops, not in PR #126; the finding's own fix is "in the ops repository". The in-repo record (ADR 0084, in 10.1's file list) is current. The design is a dated pre-build record (Reviews 1-2, section 16); no ops rule found requiring designs to track the build. fix-round.json open_items[0] already records the design drift as outside the PR's write scope. The "within 10.1" question is a separate finding.
VERDICT: real=false (not a defect in this PR's own change).
clone removed
