# Final code review: cf6d0f42..13e4e2fe (PR #85), correctness/security/money
Started 2026-11-01. Read diff, pay-fix3.md, pay-rerev-3, pay-ux-delta, pay-fix-ux.
- fix3 items 1-4 present in diff (hint+ADR+matrix+synth+expected; workbench test; contracts aria/h3+e2e; suspendedGate fallback+billing test). Checking truth vs case_rules.sql next.
- Hint vs case_rules.sql: precedence written-off-all > resolved/partial (line at payer_approved/recovered) > reopened_lines (awaiting_response) > answer. Words true; "leaves it as it is" holds since line_status_refresh_cases recomputes the case on every line_status change.
- Workbench test: would fail without the reopened_lines branch (Accepted alone gives resolved). Proves the clause.
- suspendedGate fallback: only fallback path changed; known keys unchanged; caller passes non-null refusal. Billing db test pins it.
- exportsEmptyNextStep: order matches Uploader (PermissionState first, then gate); unit tests 3.
- Contracts: CardTitle forwards id (packages/ui card.tsx), id unique on page; headingLevel 3 supported by Uploader; e2e pins names/levels.
- No new app query, no tenancy/authorization/ledger/stage path touched; no migration, nothing in packages/pricing. pay-suite: full suite passed on 13e4e2fe.
- fix3 items 1-4 all present in 13e4e2fe.
## Result
No findings. No probe files created. DONE
