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
- L2b PROVEN: temp it in screening.db.test.ts (71/71 pass, restored): bounce (no_email) of victim+zz@clinic-noplus -> victim@clinic-noplus refused screening_contact_undeliverable, refusal row reason bounced, 365 days. ADR 0065:99-101 weighs only "a mailbox whose own name holds a +", not a +tag spelling that bounces because the server lacks sub-addressing (cPanel/DirectAdmin/SmarterMail; Yahoo unclear). => FINDING should_fix (poisoning a legitimate address for 365 days, by any submitter, with MEDIUM+keep or cap spent).
## Lead L3 web-entries guard: CLOSED sound
- TS-resolver walk (scratchpad/pr42v/tools/walk.mjs, Bundler resolution, all workspace pkgs, value imports): 212 entries, 716 modules, 81 worker modules, 0 value imports of @tp/db or @tp/db/testing anywhere reached. Guard's walk: 82 worker modules, superset (extra packets/html.ts via conservative regex). No miss.
- Mutation: streams.ts + value import of @tp/db -> guard fails naming "apps/worker/src/mail/streams.ts (imported by apps/worker/src/billing/dunning.ts)"; restored (git status clean but probes).
- No instrumentation.ts/middleware.ts exist; src-root files are entries (proxy.ts). Observation: guard flags only apps/worker modules and only bare @tp/db (not @tp/db/testing nor packages/*) - CI build is the backstop; not a finding.
## Lead L4 S3 validation account: reading
- Trust: AccountPrincipal(app account) + ArnEquals aws:PrincipalArn=app role + StringNotEquals PrincipalAccount!=self; role allows only ses:GetEmailAddressInsights; trail WRITE_ONLY. App role: Deny GetEmailAddressInsights, Deny sts:AssumeRole own-account roles, conditional Allow AssumeRole on MailValidationRoleArn. Rule ReleaseNeedsAddressValidationRole. Web config requires ARN deployed. Session name fixed. errorName only in logs. Residual (90d event history, org trail, readOnly check) in ADR 0065 + runbook + data-retention.
## Lead S6: sound (DigestSendFailed carries sendErrorName only).
- L1 variant 2 PROVEN (sec-probe2.json): valid ZIP, SES MEDIUM: listed -> ADDRESS_REFUSED, unlisted -> MAILBOX_UNCONFIRMED; nothing recorded/sent. Same root cause (precheck reads list before address checks + ZIP).
- Wording nit candidate: retention.ts pages say address deleted with result (30 d) but validation account event history keeps it 90 d (ADR residual 1 defers to counsel O4).
- Definers (catalog on tp_pr6b4v_security_1): all new/recreated owner tp_owner, search_path pg_catalog, public, pg_temp, PUBLIC revoked; grants exact: screening_submit_mail_refusal tp_app, operator_mail_cutoff tp_operator, operator_mail_streams tp_operator, console_mail_streams tp_app, operator_record_mail_event tp_operator; invokers no grant; screening_run_bounce_budget gone. SOUND.
- S3 synth (production): trust/role/trail/app deny+conditional allow/rule as designed. infra+web+worker unit 10 files 216 pass. SOUND.
- iCloud aliasing confirmed (tidbits/appleinsider 2012: all three domains deliver to one account, names reserved). nit.
## FINDINGS (final)
- F1 blocking: precheck list-before-ZIP/address-checks oracle (2 variants proven)
- F2 should_fix: +tag bounce poisons base mailbox 365 d (proven)
- F3 nit: iCloud aliases escape key
- F4 nit: U+A7F1 TS/SQL skew; agreement test fixed table
- F5 nit: prospect pages say address deleted; AWS event history 90 d
NEXT: cleanup (drop tp_pr6b4v_security_1 + any test DBs, delete clone), StructuredOutput.
- CLEANUP DONE: tp_pr6b4v_security_1 dropped (no other tp_ DBs), clone deleted. /home/user/pr6b4 untouched. Evidence kept in scratchpad/pr42v/sec-*.json, walk-*.json, synth-dump.json, tools/walk.mjs.
