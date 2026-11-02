# Re-review round 1: correctness, security, money (fix commit 2865db68)
Started 2026-11-01 ~19:20 UTC (resumed run, no prior file).
## Checked
## Findings
- S2-N1/U2-r2-5 hint vs case_rules.sql: checked, words true (ELSE -> resolved for denied w/o reopen; info_requested/denied+reopen -> awaiting; partial -> partially_resolved; lines decide first). OK.
- S2-N2 receivedOn: no default; zod refuses missing/blank/empty on field. OK (calendar validity same as before, regex only; pre-existing).
- ux85-1 suspendedGate keys: byte-identical to organization_run_refusal.sql's three texts. Fallback keeps raw text. OK.
- S2-N3 grouping: uploaded_by = app_actor_id(); intake zip entries inherit uploader; top-level only anyway. thisCase whole, limit over the rest. groupOf covers new group. OK.
- Tests read: workbench S2-N* tests, contracts/reconciliation/billing gate tests: assertions match fixes. Rerunning workbench S2-N tests on 5433 (background).
- Candidate finding R1 (polish): route never bounds receivedOn to [submission's submitted_on, today UTC]; only the form's min/max do. ADR D1 says "bounded by the submission and today". A crafted post with a future date pushes next_window_ends_on and the case deadline (packet export gate) later. payer_response_rules / CHECK don't bound it either. Pre-existing, but the fix made the date the person's own entry and the ADR now claims a bound.
- Workbench S2-N tests rerun on 5433: 3 passed.
- R1 confirmed by code: recordPayerResponse checks only isIsoDate; payer_response CHECK only next_window >= received_on. Severity polish (crafted post by an authorized person only). Fix in handler (submissions.ts): read submitted_on with the submission check; refuse receivedOn > today UTC or < submitted_on on its field.
- Other fixes (ux85-2/5/7, U2-r2-2/3/6/7, n1/n4/n6/n7) verified in diff; no regression found (UploadGate title threads through every gate constructor; typecheck reported clean; e2e region names updated).
DONE: verdict all fixes hold; one polish finding R1.
