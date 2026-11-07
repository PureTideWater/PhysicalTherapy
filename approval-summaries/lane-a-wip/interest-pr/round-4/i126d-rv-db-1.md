# i126d-rv-db-1 progress (review round 1, lens: db/perf/security since d2fdd106)
## Checked
## Found
- clone at scratchpad/r4-db-1, HEAD 0755a533 (branch moved past 9824f4e9: c7f152cc F-M2-1, 8a6d0f26 F-M2-2, 7dcca319 DB-C1 header, a9abf3fb dm regen, c256fee7 base merge, 0755a533). install done.
- read: security-reviewer.md; i126d/*.json
- migration header (7dcca319): text accurate vs code (ledger_entry not rewritten, ledger_match rewritten by ADD COLUMN identity); sha256 c44a0c65... matches domain-model appendix D. Only oneSnapshot routes are read-only (invoke.ts:468 refuses mutation). OK.
- runbook section + guard test: message format matches migrate.ts:150 + cli/migrate.ts:35. Guard regex one-line only (818/861 raises one-line; 13 two-line) -> weak nit at most.
- F-M2-2 holdings index (8a6d0f26): incremental addInterestHeld equivalent to old heldInterest (match added before held; corrections only in initial read, as before). OK so far.
- TODO: plans at size for ATTRIBUTION_CLAIMS (walked CTE, rc join, root_reversal) CAS-42.3 shape + take-back-heavy; PHI in logs/errors.
- PLANS (probe zz-rvdb1, scratch only; out progress/i126d-rv-db-1-plans.out): ATTRIBUTION_CLAIMS head vs d2fdd106 tail, in job scope (RLS):
  2,000 chains S=203: CAS-42.3 shape 70->85 ms; take-back heavy 95-106 -> 114-128 ms.
  20,000 chains S=2,010: CAS 683 -> 773-922 ms; take-back heavy (62,000 rows, 10% unlinked reversals) 871-950 -> 1,089-1,302 ms.
  All by index (claim_once, claim_by_payer_claim_control_number, claim_by_superseded, claim_pkey for rc, ledger_match_by_remittance); walked = GroupAggregate over up; no seq scan. Not a defect.
- c256fee7 merge: no conflict hunks (--cc empty). 0755a533: comments/test names only.
- PHI in logs/errors: no logging, Error or throw added in the delta's code.
- domain-model --check and --check --strict pass on fresh tp_i126d_rvdb1_1 (dropped); packages/db/functions unchanged since d2fdd106 (header-only change).
- restore-drill countRows (REPEATABLE READ) runs on the restored instance only: not affected by DB-C1 window.
- Candidate nit: migrate.test.ts guard regex is one-line-format dependent (misses `RAISE ... '\n USING ERRCODE`, as this migration's own preflight at :67-68 is written).
- Cleanup: clone removed; probe test saved as progress/i126d-rv-db-1-zz-rvdb1.large.db.test.ts.txt; my DBs dropped (tp_i126d_rvdb1_1; harness tp_test_ dropped; pre-existing tp_test_* untouched).
- RESULT: no blocking/should-fix in lens; 1 nit (guard regex format-dependent).
