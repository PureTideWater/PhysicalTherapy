# PR #126 security/tenant-isolation review (revint-sec)
Started 2026-11-05. Head c49367c5a52862560c5d2eecf511c6969495e8b3. Base f7d609cc (merge-base).
Clone: scratchpad/revint-sec; install --frozen-lockfile exit 0.
## Checked (read)
- functions diffs: ledger_entry_within_interest.sql (new; INVOKER, search_path pg_catalog..pg_temp, owner tp_owner, REVOKE PUBLIC, no set_config, no EXECUTE, no grant), ledger_match_rules.sql (3 changes: seq in tuple, RETURN NULL skip for job one-record interest, interest branch). No hazard from SKILL list.
- migration 20261110090000: no table/policy/grant change; seq identity (tp_app INSERT col list excludes seq); CHECKs.
- worker: interest-chains.ts (all queries filter practice_id=$1; walk recursion relies on RLS + final filter), remittances.ts, ledger.ts (ORDER BY seq), public.ts.
- web: queries.ts (takes_back subquery, reportedInterest in same oneSnapshot practiceRoute scope), page.tsx, display.tsx (trace/payer/paidOn shown as MatchItem already does regardless of phi), specialist.ts text, roi page text. Routes unchanged: reconciliation report.read, ledger review ledger.adjust.
- LedgerError messages constant (no PHI).
## Checks run
- catalog inspect tp_intpr_sec_1 (migrated 48): seq col tp_app SELECT only; ledger_match_seq_seq owner tp_owner no acl; triggers order rules<evidence<interest<line; both fns INVOKER, search_path ok, acl tp_owner only, not leakproof; RLS forced on ledger_match/entry/claim/provider_adjustment/remittance; policies unchanged; only schema public.
- pnpm -s lint:logs: 1160 files, exit 0. pnpm -s check:fixtures: 369 guard / 4202 searched, exit 0.
- db:domain-model --check on tp_intpr_sec_1: matches, functions match 382 names, exit 0. --summary-since: 2 files, 0 flagged.
- vitest db: catalog, cross-tenant, hardening, interest.db, reconciliation-routes.db: 5 files 1277 passed, exit 0.
- RUNNING: route-tests/ + viewer-phi.db (log revint-sec-db2.log)
## TODO
- drop tp_intpr_sec_1 at end
## Findings so far
(none yet)
## More checked (2026-11-05 ~05:45)
- ledger_match_rules interest branch: old claim-of-its-remittance check replaced by standing claim/interest match in NEW.practice_id with same claim+line; base case claim kind validated against remittance of practice -> still tenant-scoped.
- web adjust 23514 passthrough (specialist.ts:158) pre-existing; new trigger messages constant, no values.
- ADR 0084:259 known gap provider_adjustment.reference plaintext: pre-existing, recorded; PR hashes tokens in memory, logs/stores none.
- No model ids/S3 keys/URL params added; no new routes; route permissions unchanged (reconciliation report.read; ledger review ledger.adjust).
- Tentative: no security defect found in PR change.
- vitest db route-tests/ (12 files) + snapshot + viewer-phi: 14 files 7069 passed, 432 s, exit 0.
- tp_intpr_sec_1 dropped. DONE: no security defect found; returning structured result.
