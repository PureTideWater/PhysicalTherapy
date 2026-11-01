# Re-review round 2: correctness, security, money (HEAD cf6d0f42)
Started 2026-11-01 ~19:20 UTC (no earlier progress file).
## Checked
## Findings
- S2-N1 hint vs case_rules.sql: matches for answer kinds; lines-decide clause omits a line the ledger moved back from payer_approved/recovered (reopened_lines -> awaiting_response regardless of answer). Candidate polish.
- S2-N2 receivedOn: empty/missing refused with RECEIVED_ON_EMPTY; range still enforced by payer_response_belongs; window from received_on (payer_response_rules) - hint true. OK.
- S2-N3 grouping SQL: uploaded_by NOT NULL; app_actor_id(); this_case partition unlimited; other partition limit 50 ordered unused, by_others, other_cases. OK.
- Lock: DOCUMENT_USE_LOCK exported, same text, still taken before check in both. No import cycle. OK.
- Upload gate titles: texts match organization_run_refusal.sql exactly; fallback kept. OK.
- response-card / letter status / duplicate-not-chosen: logic reviewed, no auto-choose override. OK.
- Re-ran workbench-routes db tests -t "S2-N" on 5433: 3 passed (Received on refusals, window from date, Denied resolves, grouping, this-case whole).
- No stale "Drop zone"/"(uploaded here)" references outside the test that asserts absence.

## Findings
1. polish: RESPONSE_HINT lines-decide clause omits a line the ledger moved back from Payer approved/Recovered (case_rules.sql reopened_lines -> awaiting_response before any answer branch; line_status_ledger_rules lets reconcile do it with set_by NULL). "Accepted" then leaves the case "Awaiting response", not "Resolved". Fix: add to the clause, e.g. "or a line moved back from “Payer approved”, which keeps it “Awaiting response”", ADR D1 likewise.
Verdict: all fixes confirmed; one polish.
