# hom-fix-docs progress
Started fresh 2026-11-01. Inputs read: hom-fix-adr-notes.md (money + screens sentences), findings E3/E4/R2/UX-R1-03/ux-r2-01, ADR 0082, HOM rows.
## Plan
1. ADR 0082: D5 net expected (E3/UX-R1-01), D6 freeze sentence (E4), D8 firstOn standing + ledgerTotalsOver + "none yet" (R1, E2, ux-r3-01), Consequences net + R2 partial recoupment, HOM-01 measured, Revisit/follow-ups (reconciliation-001 after #42, Lane A remaining ask, audit report net, WholeDates widen, PDF case links, help.ts pin).
2. test-matrix HOM-01/02/04 + matrix.ts same text; registry HOM-02 assertedBy; pnpm synth --all under lock.
## Done
- ADR 0082 edited (D5 net expected, D6 freeze sentence, D8 firstOn standing + ledgerTotalsOver + none yet, Consequences E1 measured/net/R2, tests named, Revisit: #42 reconciliation-001 + help pin, Lane A remaining ask, audit report net). Script: scratchpad/adr82_edit.py
- test-matrix HOM-01/02/04 and matrix.ts updated identically; registry HOM-02 assertedBy + 3 tests. Next: synth --all under lock, fixtures test, lint:copy, verify-content
- synth --all: only HOM-01/02/04 expected.json changed. lint:copy 0, verify-content 0, synth vitest 185/185, eslint 0, tsc 0. DONE.
