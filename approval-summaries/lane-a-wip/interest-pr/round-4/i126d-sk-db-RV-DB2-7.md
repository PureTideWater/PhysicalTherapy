# RV-DB2-7 skeptic\n- started; cloning
- clone at origin head 9c68a4be; guard (migrate.test.ts:76,84,117) is this PR's diff (5a78e33f, 9824f4e9)
- regexes: lockLoopFailures needs ERRCODE='lock_not_available'; locksWithNowait needs LOCK TABLE. Both spellings together escape (by reading).
- repo convention: every migration uses LOCK TABLE and named ERRCODEs only (no numeric SQLSTATE anywhere); no lint enforces it
- next: verify PG18 accepts both spellings; run vitest with a planted migration in clone
- PG 18.4 confirmed: `LOCK m IN SHARE MODE NOWAIT` accepted; RAISE ... ERRCODE='55P03' caught as lock_not_available
- guard.mjs rerun: both spellings together -> loops [] nowait false; each alone caught
- no other generic check (ledger-interest/line-status db tests look only at own migration)
- next: vitest with probe migrations (A: both spellings; B,C controls)
- vitest probes (clone at 9c68a4be): LOCK+55P03 -> 24/24 pass (escapes); LOCK TABLE+55P03 -> fails at :117; LOCK+lock_not_available -> fails runbook-quote case
- widened regex (LOCK\s+(?:TABLE\s+)?) matches only the two existing lock-loop migrations: no false positives
- clone removed; db tp_i126d_skdb7_1 dropped
VERDICT: real=true (nit). Could not refute; caveat: needs two departures from house style at once (no migration uses numeric ERRCODE or LOCK without TABLE).
