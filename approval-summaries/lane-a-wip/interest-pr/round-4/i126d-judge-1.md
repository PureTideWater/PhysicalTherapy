# i126d judge 2 of 3 (file judge-1): F-M2-1 / DB2-1 (LED-R1 widening, interest-chains.ts:194)
Started 2026-11-07 05:58 UTC. Clone: scratchpad/r4-judge1. DB: tp_i126d_judge1_<n>.
## Status
- [ ] clone + install
- [ ] read design s4/4.1, ADR 0084, code
- [ ] test written + run at 9824f4e9
- [ ] run with c49367c5 behaviour
- [ ] verdict
- [x] clone + install (r4-judge1 at 9824f4e9)
- [x] read design D2/D4/D5/4.1, 9.2 (PRD 13 text), 10.1, ADR 0084 D5 (head + c49367c5), code (interest-chains.ts:194, interest.ts attributeInterest, remittances.ts recordInterest)
## Test
Generator: scratchpad/judge1-gen/gen.py -> fixtures/synthetic/ZZJ (clone only); test scratchpad/judge1-gen/zz-judge1.db.test.ts; runner scratchpad/judge1-gen/run.sh
Shape: LED-23 original O (L1,L2) -> ZZJ/c1.835 (R rev O; C1 ...230092 approves L1 80, L2 80; no interest) -> third check: R2 rev C1, C2 ...230093 (F8 C1) carries L1 only paying 90 (approved), K other patient, one PLB L6 3.00; reconcile after each.
### Head 9824f4e9 (progress/i126d-judge-1-head.out)
claim matches: C1->L1 approved, C1->L2 approved (standing), C2->L1 approved. approved: L1 3400, L2 3000.
- named C2 + AMT I 3.00: draw claims [C1,C2,R2]; L1 159 (C2) + L2 141 (C1), allocated
- unnamed + AMT I 3.00: draw claims [C2,R2]; L1 300 (C2), not allocated
- named C2, no AMT I: L1 159 + L2 141
- named C1 + AMT I: L1 159 + L2 141
- named O + AMT I: draw [C1,C2,O,R,R2]; L1 159 + L2 141
### Head with line 194 = reached (pre-84534029 rule) (progress/i126d-judge-1-reached.out)
- named C2 (+/- AMT I): draw [C2]; L1 300 not allocated. unnamed: L1 300. named C1: [C1,R2] L1 159 + L2 141 (both name C1). named O: draw [O,R], nothing written (LED-R1).
### c49367c5 itself (worktree r4-judge1-base; progress/i126d-judge-1-base.out)
- identical to "reached": named C2 L1 300; unnamed L1 300; named C1 159/141; named O 0.
=> the widening (84534029) moved named-C2 from L1 300 to L1 159 + L2 141; c49367c5 got it right.
PR body (REST, head 9824f4e9) line 73 itself says F-M2-1 "goes past the design's words ... not fixed at 9824f4e9".
Leaning: REAL (granted PRD 13 text via 10.1 b4: "case lines of the claims ... the PLB L6 names"; L2 is not C2's case line; c49367c5 right).
Next: try fix = reached claims + their descendants within the chain read (row's walk-back path meets a reached claim); run probe + interest.db.test.ts.
### Candidate fix (scratchpad/judge1-gen/fix.diff): namedClaimIds = chain claims read whose walk-back path meets a reached claim (reached + descendants)
progress/i126d-judge-1-fix.out: named C2 -> L1 300 (C2, not allocated); unnamed L1 300; named C1 159/141; named O 159/141 (LED-R1 kept).
zz-judge1 + interest.db.test.ts + ledger-oracle.db.test.ts: 3 files, 45 tests passed (rc=0).
LED-24 (DB2-1 skeptic's probe, run on the fixed clone; progress/i126d-judge-1-fix-led24.out): named F2 -> L2 540 (= unnamed, = c49367c5); named F1 -> L1 240 + L2 300 (= c49367c5 amounts). 6/6 ran.
tsc --noEmit -p apps/worker/tsconfig.json with the fix: clean.
## Verdict: REAL (should-fix), defect introduced by 84534029 (LED-R1 widening)
- Granted text (10.1 b2 "names a claim"; b4 -> PRD 13 per design 9.2: "against the case lines of the claims it is for (the claims the PLB L6 names ...)"): L6 naming C2 -> C2's case lines = L1 only. Head puts 141 on L2 (C2 does not carry L2; match names C1, reversed in the same check), flags both allocated.
- c49367c5 and the head's own unnamed path both write L1 300 (not allocated). The PR body at 9824f4e9 itself lists F-M2-1 as "past the design's words ... not fixed".
- DB2-1's refutation fails: named-vs-unnamed parity is not the test; the granted text makes the lines those of the claims named, and the widening breaks it for the named latest correction.
Expected vs observed (cents): named C2 -> expected L1 +300 (C2, not allocated), L2 0; observed head L1 +159 (C2, alloc) + L2 +141 (C1, alloc).
Fix (in 10.1's files): progress/i126d-judge-1-fix.diff.txt + red db test of this shape (LED-23 fixture via synth + expected.json row), ADR 0084 D5 and PR body line 73 reworded.
Artifacts: progress/i126d-judge-1-{head,reached,base,fix,fix-led24}.out, -zz-judge1.db.test.ts.txt, -gen.py.txt, -fix.diff.txt
- cleanup: clone + worktree removed; dbs tp_i126d_judge1_1..5 dropped
