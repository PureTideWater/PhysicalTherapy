# design-interest-revise progress
Started 2026-10-27 (run 1). Revising /home/user/ops/designs/ledger-interest-once.md after review (verdict build with changes; F1-F8, N1-N3).
Clone: scratchpad/designs/interest-revise (to create).
## Findings: verification + disposition (fill as verified)
## Edits made to design
## Next
- read design in full; verify each finding against code; edit design; add section "After the design review"
- Clone created: scratchpad/designs/interest-revise (base e908c21). #42 head now 8aa45a46 (54 commits): ledger_match_rules, practice_in_scope, app_actor_*, ledger_entry_rules/_within_line/_within_evidence byte-identical to base (sha256 checked). #42 shared files: reconciliation-001.md, test-matrix.md, matrix.ts, registry.ts, watched-paths.txt (+ domain-model, functions dir).
- Read design fully (1068 lines).
## Verification (run 1)
- F1 VERIFIED (code: D2 step4 per (L6,claim); allocateByWeight(540,[0,300])=[0,540] in allocation.ts:42-60 no cap; loader adoptOrphanReversals out-of-order). TAKE: once per L6 gross + per-claim subcap; take-back capped at sum held; properties + 3 db tests.
- F2 VERIFIED (D2 pools positive AMT I only; probe alloc). TAKE: net per correction pair in R (V.reversal_of=X, X.superseded_by=C2, both in R) before e().
- F3 VERIFIED by reviewer probe S2 (probe1.out). TAKE take-back via X's backward chain + DB rule = standing interest match naming NEW.claim_id. PAID part: take MODIFIED: lines with standing claim match naming Y, approved ones first, else every line Y covers (restatement); DB rule = standing claim match any outcome naming NEW.claim_id. NOTE split-remittance sub-claim (C2 no_change after lone V in R1) doubtful: lone reversal recoups and baselines return to original so C2 in R2 is approved (ADR 0067 reversal rule) -> say so.
- F4 VERIFIED (everMatched keys new match by L6; old claimInterest re-tries; probe S3). TAKE recommended: RETURN NULL for exact legacy job shapes; persons RAISE; db test both IDs; type-level both IDs.
- F5 VERIFIED: brand.test.ts:144 + web roi page.tsx:108 same sentence. TAKE. Note: "#46" in design = Verified seal ISSUE #46 (queued, not started); PR #46 was db-function-diffs (merged). Coordinate under rule 6.
