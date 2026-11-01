# ux-r2-ux-r2-04 verification (statement-html.ts:117 pluralisation / "Its")
Checked at 87691be4 (clone rev-ux, read-only):
- statement-html.ts:117 renders `${ACTIONABLE_OPEN_NOTE} ` + (0: 'No case was being worked...' | 1: 'Its 1 case: X.' | n: 'Its n cases: X, Y.'). All counts render correct English; only divergence from counted() is thousands grouping (1,000+ open cases in one statement: not realistic).
- Same file's linkedEntries (statement-html.ts:76-77, pre-existing) uses identical "Its N ..." hand-pluralised pattern; "Its" in this document consistently means the figure under its h2.
- ACTIONABLE_OPEN_NOTE (report/recovered-words.ts:35) ends "Not recomputed from its links." -- "links" is plural, so singular "Its" cannot take it as antecedent; both "its" refer to the figure.
- No statement-html unit test exists in apps/worker/src/reconcile.
Verdict: not real as a defect (no wrong or misleading output). At most a consistency nit; not worth a change in this PR.
