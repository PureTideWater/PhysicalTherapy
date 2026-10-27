# design-ss01-review progress (adversarial reviewer of /home/user/ops/designs/ss-01-suspension.md)
Started 2026-10-27 run 1.
Clone: $P/designs/ss01-review (to create)
## Status
- [x] read design in full (1020 lines; sections 0-17)
- [ ] clone + fetch
- [ ] read sources (security-reviewer.md, billing.sql, #42 console.ts, dunning.ts, pages)
- [ ] probe DB tp_design_ss01_r1
## Leads (open/closed)
## Findings so far
## Checked and sound
- [x] clone $P/designs/ss01-review at #42 head 098636e3 (base e908c21 unchanged)
## Leads (run 1)
- L1 OPEN->FINDING (probe pending): role union. scope.ts:141-160 accessByPractice unions roles across ALL paths; require.ts:84-91 checks the union. Design's practice_work_hold holds only when EVERY path is a held grant; so a person with ownership (practice_admin/viewer) or an active F2 grant with a lesser role + suspended F grant (firm_principal) starts work with F's roles. Fix: hold per path/role: run-starting permission computed from unheld paths only (route) + trigger maps table->permission over unheld roles.
- L2 FINDING (verify): design 5.4 'no migration' for packet_export_refused purpose organization_suspended is wrong: audit_event_packet_export_attempt (deadline_verification...sql:1521-1541) requires purpose = ANY(packet_export_refusal_codes()) (12 codes, :1506-1510) and a db test compares PACKET_EXPORT_REFUSALS to it. Needs function recreated in migration.
- L3 grantee hold in Postgres only on person-written tables: triage (job only, triage.ts:443-450) and packet export (job sets exported_at; queries.ts:526-555) are handler-only for grantees. Design ten-lines #2 overclaims.
- L4 D6 vs R3/H4: owner nonpayment words disclose group's unpaid invoice to firm people while D6 hides unpaid_invoice reason. inconsistency.
- [x] DB tp_design_ss01_20 migrated from empty through #42 (45 migrations) + probes/ss01-world.sql; proto = probes/ss01-review-proto.sql (design sec 4 as written; rolled back; -v review_extra=<file> for extra probes)
- L1 CONFIRMED (probe R1/R2): X = group practice_admin + F firm_principal, F suspended via setter: refusal NULL, app_actor_permitted mapping.edit/file.upload/case.work = t (ownership path alone: f), upload row recorded. Y = F principal + F2 viewer (F2 grant roles [viewer]): refusal NULL, mapping.edit t, upload recorded. Control: F principal alone refused (R4). => BLOCKING.
- L3 confirmed by code: enqueue uses pg-boss own connection (uploads/queue.ts PgBossQueue), so refusing the route's audit insert would not undo a queued triage/export job; grantee triage+export are handler-only.
- L2 CONFIRMED (probe): 'organization_suspended' = ANY(packet_export_refusal_codes()) -> f (12 codes); export-attempts.db.test.ts:163 pins TS==DB in order; :165 pins EXPORT_REQUEST_REFUSALS keys; EXPORT_REQUEST_REFUSALS is Record<ExportReadinessReason> (services.ts:472) -> typecheck. Worker gate (worker.ts:146-151) runs before try: audit 23514 -> job throws, retried, not recorded refused.
- L5 FINDING (founder rulings): manual reason unpaid_invoice: PRD:223 (30 days), ADR 0050 (ends when paid), Q13 (waits for delivered notice/recorded contact; HANDOFF.md:578). Design sec 9 says Q13 untouched; B5 says paying doesn't reinstate. -> blocking: drop or gate+auto-lift; name rulings.
- L6 nit: C7 'Suspended by {email} on {date}' misattributes after a reason change by another admin.
- L7 nit: security_hold firm keeps reading/downloading PHI; C4 label suggests protection.
- L8 nit: SS-08 send-time effect ignores billing_standing; another invoice reaching 30 days within retry window -> 'started again' while billing hold. (pre-existing narrow)
- closed leads: Zod \p{Cc} vs PG [[:cntrl:]] (en_US.utf8: U+2028 not cntrl in PG; consistent); seed uses SET LOCAL ROLE tp_owner (owner path ok); practice.organization_id nullable (owner CTE inner join ok); route-test pattern uses worldB after other tests (ok).
- L1 also: route-test world firm personas are single-path (world.ts:384-432), so BIL-07 per-route passes with L1 present.
- L9 nit: previous image's home (page.tsx:164-171) appends 'uploads, pricing runs, monitoring ... start again once it is resolved. The organization's administrator sees...' after R4 during deploy/rollback: wrong for grantee holds (monitoring never stopped).
- closed: #56 closed words promise no reopen (billing.ts:210-225, CLOSURE_TICKET) -> design sec 8 claim holds.
- DB tp_design_ss01_20 DROPPED.
## Findings (final): F1 role-union bypass (blocking); F2 unpaid_invoice vs PRD:223/ADR0050/Q13 (blocking); F3 packet_export_refusal_codes needs migration (should_fix); F4 grantee triage/export/retry handler-only, overclaim (should_fix); F5 D6 vs R3/H4 nonpayment disclosure (should_fix); F6 C7 misattribution (nit); F7 security_hold label (nit); F8 SS-08 billing standing at send (nit); F9 previous-image home words (nit)
- NEXT: StructuredOutput
