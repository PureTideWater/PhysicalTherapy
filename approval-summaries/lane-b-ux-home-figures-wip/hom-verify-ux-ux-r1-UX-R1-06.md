# ux-r1-UX-R1-06 verify (87691be4)
- cases/page.tsx:58 at 87691be4: `across {openCases} {openCases === 1 ? 'case' : 'cases'}` - present; PR diff vs 43565235 rewrote this paragraph (moved to line 58), so it is in scope.
- Checklist (.claude/agents/ux-brand-reviewer.md:78): counts through <Counted/> or, with no mono, counted().
- Singular/plural is correct today; only failure is no thousands grouping (>=1000 open cases: unrealistic) and not in mono beside <Money> (mono). Consistency defect only.
- Verdict: real, nit. Better fix: <Counted value={openCases} one="case" /> (exported by components/remittances/display, already imported for Money), since the sentence sets the amount in mono.
