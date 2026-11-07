# i126e-rv-db-1 progress (security/db review of PR #126 since 9c68a4be)
Clone: /tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad/r5-db-1 at origin 87ce6146
## Checked
## Found
- install done. PR commits since base: 1fadbc11 576fb237 f4bd94d3 a8211003 47eb9f51 bdb218f1 e2fbbb75 7ace47e6 87ce6146 (+ base merges 98bb9c00, 75cb2b70)
- migration diff since base: header comment only (lines 50-57); no functions/*.sql changed since base (none exist? check)
- ATTRIBUTION_CLAIMS unchanged since base (widened at 84534029); ADR At-size text new (measurement claims) - to verify
- checked: pass.ts log (fields allowlisted: job_id practice_id error_code record_count; no PHI); InterestUnsettled message no PHI; attemptErrorCode maps code
- checked: re-walk adds no SQL; inserts same as before (ledger_match_rules / ledger_entry_within_interest use ledger_match_by_line, ledger_entry_by_evidence/by_line); ledgerMatches ORDER BY seq uses ledger_match_by_seq
- checked: interestRoom bound proof (claimMatches fixed in pass; chains via chainOf(claimId)) - holds
- checked: runbook 603.0 s sourced (CI run 42307508461, round-4 notes); 05:10 UTC schedule = platform.ts '10 5 * * *'
- checked: ADR ATTRIBUTION_CLAIMS numbers match i126e/logs explain (773-907 ms widened; 580-649 narrow; index unused) run as tp_app under withJobScope (RLS on)
- checked: migration sha256 561e3001 = domain-model Appendix D row 48
- checked: check:fixtures 0, synth --all 0 written, lint:logs 0; fresh DB tp_i126e_rvdb1_1 migrate 0, db:domain-model --check 0 and --strict 0 (functions 382 match)
- checked: migration header RR/RC snapshot text accurate (RR snapshot taken before parse-analysis lock wait; RC exec snapshot after); runbook 333.2 s/603.0 s/05:10 sourced; ADR At-size numbers match i126e logs
- checked: no new SQL in PR code since base; trigger queries indexed (claim_once, ledger_entry_by_evidence/by_line, ledger_match_by_line)
- checked: interestRoom >= entries proof: interestWrites reached = all written lines; claimMatches fixed; chain keys via chainOf(claimId)
- checked: new LED-24 835s synthetic
## Found
- F1 (should-fix, matrix vs code): LED-23 row (test-matrix.md LED-23; matrix.ts:331; added 7ace47e6) "a named PLB L6 above its claim's AMT I first pays the remittance's other reported interest, and what no claim takes is counted nowhere" contradicts attributeInterest step 4 (interest.ts ~315: named L6's leftover returns to the chain it names) and unit test interest.test.ts:137 'F' (6.00 named C, AMT I 5.40 -> draw 6.00 to C, unattributed []). ADR 0084:118 says (4) returns, (5) unnamed rest nowhere.
- F1 more evidence: interest.test.ts:326 'returns a named PLB L6 the pool left to the chain it names' (A 5.40 naming C AMT I 0, K 2.00 -> K 2.00, C 3.40, unattributed []).
- checked: migrate.test.ts 26/26 green in clone; re-walk depth cost (walks = cascade depth, not chains; heavy shape 3 walks) - no defect
- cleanup: drop tp_i126e_rvdb1_1, remove clone
- cleanup done
