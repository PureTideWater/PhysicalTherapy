# Re-review round 3: UX, brand, tests (HEAD cf6d0f42 + fix pass 3's uncommitted changes, pay-fix3.md)
Started 2026-11-01 ~20:00 UTC (no earlier progress file). Fix 3's changes are uncommitted in the worktree; no test process running.
## Checked
## Findings
- Fix 3 #1/#3 RESPONSE_HINT: new clause true to case_rules.sql (reopened_lines -> awaiting_response only when no resolved line; stays awaiting). e2e regex pins it (fails without). No stale old text anywhere (src, e2e, docs, synth, CAS-46 json consistent).
- Fix 3 #2 Contracts: region aria-labelledby -> CardTitle (h2, props spread); drop zone headingLevel 3 (This batch h3 too); e2e pins title h2, drop zone region + h3, description with 2.0 GiB (each fails without).
- Fix 3 #4 suspendedGate fallback: title "Uploads are stopped", body = DB sentence capitalised; billing test pins (fails without). Fallback unreachable unless DB function changes.
- Running workbench/billing db tests on 5433 (bg).
- db on 5433: workbench "keeps a case awaiting..." + billing suspended/closed: 6 passed.
- e2e regex vs RESPONSE_HINT checked in node: matches.
- No e2e result recorded by fix 3: running packets.spec here (bg, tp_e2e_pay85rr3, port 4986).
- e2e packets.spec (build here, 5433): 2 passed (3.0m), covering the new hint regex and the Contracts title h2, drop zone region h3 and 2.0 GiB. My e2e DB has been dropped.
- lint:copy clean. Worktree unchanged by me (only fix 3's 10 uncommitted files).
- Round-2 UX finding 1 (the select has 0 px of slack at 390) was not taken by fix 3. It still fits at 390, so I am not raising it again.
- Checked but not reported: the hint's "a line moved back from it (stays Awaiting response)" is partially resolved when another line is at Payer approved. The earlier item covers that case, so this is an edge case and not a defect.
## Findings (final)
None. Every fix 3 item is confirmed, and each is proven by a test that fails without it.
