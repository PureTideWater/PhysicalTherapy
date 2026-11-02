# ux-r2-05 verify
- cases/page.tsx:58-59 at 87691be4 says "a written-off line is struck through and out of it"; the Cases list renders no line-through/<s>/<del> anywhere (grep). Strike-through lives in cases/[caseId]/page.tsx:86,214.
- Base wording also claimed strike-through ("a line past its window is struck through"); PR rewrote it and kept the inaccuracy. Design L191, L316 carry same text.
Verdict: REAL, nit, fix as proposed (plus design §D8 and the p.cases.default row).
