# i126d-sk-db-RV-DB2-4 (skeptic)
started 2026-11-07T09:45:50Z

- clone r4-sk-db-RV-DB2-4 at origin head 9c68a4be (no install needed: finding is about PR text; no db used)
- body fetched (309 lines): stale facts all confirmed (f1b603ca at 4/172/198/272, 35e53da4 at 49/272, 9824f4e9 as head 145/188/201, F-M2-1/F-M2-2/DB-C1 'not fixed', no MONEY-R4-1/RV-DB1-1 rows; also 112/202/204/303 stale). head dm line 7469 = 72e62104, migration c44a0c65. 0 comments/reviews.
- CI 9c68a4be: all done; only 'domain model' (blank approval line) + 'all green' fail.
- timing: fix-r1 pushed 9c68a4be ~09:20 (suite done 09:20:43); review fetched body 09:21 -> before body step. i126d-fix-r1.md lists 'Open: PR body (body step) should add MONEY-R4-1 and RV-DB1-1'. i126c-body.md shows body step is the round-end step.
- #104 suggestion posted 09:36 on 11-04 (6.5h after open, after rounds); #110 posted 11-05 03:27 (after rounds) -> suggestion is posted once on final head; not at intermediate heads.
- base 8a722f80 is ancestor of head (merged in c256fee7): branch up to date, so the body step + suggestion on the final head is next.
- VERDICT: real=false. Facts reproduce, but it is the round's pending body step (a record updated after the round's reviews, as in i126c-body), not a defect of the PR's change; code/schema/doc consistent at head (dm 72e62104 matches schema; CI fails only on the blank approval line). Suggestion is posted once on the final head (#104, #110 practice); none due at an intermediate head. Body-step checklist: lines 4,49,72,102,104,112,145,172,188-204,210,228-230,272,303 + rows for MONEY-R4-1, RV-DB1-1, 0755a533 (#126 hex), c256fee7 (#131); then suggestion for the final head's hash at line 7469.
- clone removed
