# pr42v review-security (PR #42 at c37fa7cc) progress
Started 2026-10-27. Clone: $P/pr42v/review-security
## Leads
## Findings
## Checked sound
- Clone at c37fa7cc, pnpm install done (exit 0). Read: findings md, integrate/prepare/build-* reports, functions diff, migration diff, routes.ts submit.
## Lead L1 (OPEN, likely blocking): S4 precheck reopens S1's silent oracle wider
- routes.ts:632 screening_submit_mail_refusal (list check) runs BEFORE submit_screening's ZIP checks (submit_screening.sql:37-46).
  Bad ZIP + listed address -> ADDRESS_REFUSED; bad ZIP + unlisted -> ZIP message; nothing recorded/sent. Any client, no budget needed.
  Before the fix ZIP came first (no oracle). TODO: prove with routes.db probe test.
- L1 PROVEN (probe zz-oracle-probe.db.test.ts on tp_pr6b4v_security_1, result scratchpad/pr42v/sec-probe1.json): ZIP 00099 / 00012 + listed gmail -> ADDRESS_REFUSED (contactEmail); + unlisted -> zip messages; prospect/upload/run/audit counts 0/0/0/1 unchanged; 0 mails; validations spent only for unlisted (2). At 098636e: no precheck in routes.ts, submit_screening raises ZIP before any insert -> no oracle. => FINDING F1 (blocking: regression of S1, broader: any client, zero setup).
## Lead L2 (S2 canonical) 
- Property probe packages/db/src/zz-canonical-probe.db.test.ts: 59,852 random (attack pieces + any Unicode, seed 4242): 0 mismatches. Exhaustive single code points x4 contexts: 1 code point differs, U+A7F1 (Unicode 17, Node 24.22 ICU 78 maps NFKC->'S'; PG 18.4 Unicode 16 leaves it). Unreachable: SCREENING_EMAIL regex (routes.ts:120) stores ASCII only. => nit F-canon-skew.
- Form: prospectFields trim().toLowerCase() + ASCII dot-atom regex -> stored addresses ASCII; NFKC only matters for rate-count of refused input.
- OPEN: +tag dropped at every domain => bounce of victim+x@<no-subaddressing provider, e.g. yahoo.com/aol/att.net> lists victim@... for 365 days (poisoning). Check Yahoo '+' support; check ADR text.
- OPEN: iCloud me.com/mac.com/icloud.com aliases escape (nit).
