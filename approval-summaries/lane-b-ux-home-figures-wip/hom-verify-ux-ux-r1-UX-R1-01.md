# ux-r1-UX-R1-01 verify (87691be4) - DONE
Verdict: real, should-fix (severity right); fix refined.
Checked: queries.ts:377 (base used c.actionable_cents, now actionable_now_cents); packages/triage/src/cases.ts:88-90 netExpectedValue = actionable - cost, no floor;
ACTIONABLE_NOW excludes moved-on (payer_approved/recovered) and stale lines (queries.ts:313-320); case.pursuit_cost_cents fixed at creation (case_rules.sql:29-31) so non-null whenever settings had a rate.
page.tsx:115-126 renders negative amount with "(actionable less the pursuit cost)". Design D6 / table row 317 chose this rule; audit report content.ts:906-908 same rule (pre-existing, report column also negative for moved-on cases).
Refinement: branch on actionableNowLines === 0 and name why (moved on / stale / written off) via outOfFigureWords, not "Nothing left to pursue" (stale lines still need pursuit after re-check).
