# RV-DB1-1 skeptic
- clone created; started
- head 0755a533 (contains 9824f4e9); guard test added by PR (9824f4e9). Regex check node: one-line 1, two-line 0, arg-form 0. Both current loops (20261109090000, 20261110090000) one-line, found. 24 two-line USING raises in migrations. No other guard (db tests check NOWAIT only for their own migration).
- next: pnpm install + run vitest with a dummy two-line-loop migration to reproduce silent pass
- vitest src/migrate.test.ts as-is: 21 passed. Probe migration 20261231000000_zz_probe.sql with a NOWAIT loop whose raise is two-line and whose message is NOT in the runbook: 21 passed (silently unchecked). Same file with one-line raise (control): 1 failed. Probe removed, tree clean.
- two-line USING ERRCODE count is 24 across 8 migrations (finding said 13; count off, claim stronger).
- VERDICT: real=true (nit). Clone removed.
