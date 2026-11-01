# ux-r3-ux-r3-03 verify (done)
- roi/[statementId]/page.tsx:141-146 at 87691be4: every actionable case link text is "Case" -> confirmed.
- Diff 43565235..87691be4: card, list and link predate the PR; PR changed only aria-label/title (ACTIONABLE_OPEN_LABEL), note, empty line. Finding's "card is new here" is false.
- Verdict: real, nit, pre-existing; fix = "Case N of M" (reconciliation/page.tsx:183 pattern), payer/plan later.
