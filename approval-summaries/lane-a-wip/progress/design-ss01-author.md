# design-ss01-author progress
Started 2026-10-27. Output: /home/user/ops/designs/ss-01-suspension.md
Clone: $P/designs/ss01-author
## Status
- [ ] clone + fetch
- [ ] read sources (status file, ux-suspended-standing design, ux-review §5, LANES.md entry, pr6b design for style)
- [ ] verify code (billing.sql functions, console.ts, dunning.ts on #42, pages)
- [ ] probe (own db tp_design_ss01_10)
- [ ] write sections
## Outline
(tbd)
## Open points
- [x] clone + fetch ($P/designs/ss01-author; base e908c21; #42 head now 098636e3, merge-base e908c21, 188 files: progress/ss01-author-pr42files.txt; #42 migration saved progress/ss01-author-mail42.sql)
- [x] read sources: LANES.md (row 185 claim; Handed to Lane A), status file, ux-suspended-standing design SS-01..14, ux-review §5 (UX-004), UX-046 (PR 78), UX-203 (PR 79), UX-204
- verified: billing.sql:268-318 functions/triggers, :405-409 grants; tenancy.sql:19-27 organization, :95-118 grant, :490-497 org policies, :595-597 grants; console.ts on #42 :82-114 setOrganizationStatus; console org page :54-76 card, :324 grant 'in force'; refusal.ts, runs.ts, invoke.ts:294-300,:500-504, worker.ts:146-151
- #42 drops billing_owner_emails; worker.ts NOT a #42 file; console org page NOT #42; console.ts IS #42
## Decisions so far (02:50)
- SS-01 option: B (actor-scoped): a suspended/closed grantee's MEMBERS start no new work at granted practices; practice's own staff + its jobs unaffected. Reason: PRD:61 tenant principle; no product path ends a grant before M12 (settings.ts:46-48 grants are view-only) so option A strands the practice; acceptance "a suspended organization can read but not run" met for the firm's members. Owner refusal unchanged (practice-wide). Grantee clause on status only (not billing standing): 0050:118 defers firm nonpayment.
- DB: internal practice_work_hold(practice) definer (owner refusal; else if app_actor_is_person() and every path from effective_practice_access() for that practice is a grant whose grantee is suspended/closed -> grantee cause). practice_run_refusal(uuid) text kept (old image + worker), recreated on it; new practice_run_hold(uuid) structured for pages; trigger fn recreated; RAISE carries no names; CONSTRAINT = run_refused_<cause> house pattern (#42 uses named refusals).
- Stored reason: organization.suspended_reason + suspended_at (nullable; legacy rows null) + append-only organization_status_change (note, actor, reason, from/to) platform-admin only; definer console_set_organization_status(org,status,reason,note); revoke tp_app UPDATE(status); guard trigger: closed final, internal stays active, status only via setter (or owner).
- Reasons: suspend unpaid_invoice|customer_request|security_hold|agreement_ended; reinstate resolved|in_error.
- SS-08: words at send time from organization.status (+ kind) in sendOne; also firm dunning words claim no run effects; billing_suspended/reinstated audits only for groups (TBD).
- Reopen: no; guards only.
- grants view only before M12: settings.ts:46-48 confirms.
