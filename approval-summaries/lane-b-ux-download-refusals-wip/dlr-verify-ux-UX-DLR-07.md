# Verify UX-DLR-07 (codes field placeholder) at 63aaa7f4
Status: started. Clone: scratchpad/verify-ux07
## Checked so far
- letter.tsx:143-158 at 63aaa7f4: placeholder="97110, 97530" on Input with className font-mono tabular-nums; hint #letter-codes-hint repeats "such as 97110, 97530" and "Leave blank to ask for the whole schedule."
- Base e908c214 coverage/page.tsx:450: same placeholder, proportional face, hint only "Leave blank to ask for the complete schedule." -> PR authored the duplication and the mono face; letter.tsx is a new file in this PR.
- Placeholder colour: Input (packages/ui/src/components/input.tsx) sets none; Tailwind 4.3.3 preflight ::placeholder = color-mix(in oklab, currentcolor 50%, transparent); ink #0D1E3A over white -> #868E9C = 3.30:1 (computed). Dark ~4.95:1. Measurement confirmed.
- Checklist: .claude/agents/ux-brand-reviewer.md:73 "Text 4.5:1 ..., placeholders too" (BRAND.md:154); :40 "Formats on the field, not in a placeholder (3.3.2)".
- ADR 0077 D9 (ux-forms branch): pattern field states format in its hint. Hint does it here.
- Tests: no unit/e2e test reads the placeholder (letter.test.tsx, e2e/download-refusals.spec.ts); deletion breaks nothing.
- Shots: crops/letter-contract-1280.png and coverage-default-letter-ba.png show grey mono "97110, 97530" above a hint with the same example; error-letter-contract keeps payer+contract filled so an empty codes field's grey example sits among kept values.
- Partial refutation: "same face as entered codes" is not new (a placeholder always inherits the input's face; at base both were sans). 3.3.2 is met (the hint states the format), so only 1.4.3 + checklist :73 are violated. Contrast is pre-existing but on a line this PR authored in a new file.
- Design doc and ADR 0079 say nothing of the placeholder; no visual baseline covers coverage; head 53c7224f still has it.
## Verdict
REAL, should-fix (no information lost: hint at 6.43:1 carries it). Fix: delete letter.tsx:146; add expect(codes.has('placeholder')).toBe(false) in letter.test.tsx after :83.
Status: DONE
