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
