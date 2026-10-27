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
