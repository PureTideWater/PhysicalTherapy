# design-ss01-database progress
- started 2026-10-27; clone at scratchpad/designs/ss01-database
## Read (ops)
- LANES.md: claim row :185 (co-001/ss-01-suspension-refusal; ADR 0080 if needed; BIL-07..BIL-10; synth module 15), Handed :255-262.
- status file lane-b-ux-suspended-standing-status.md, design lane-b-ux-suspended-standing.md (SS-01..SS-14).
- ux-review §5: only UX-004 is about suspension (reason closed list: unpaid invoice, customer's request, security hold, agreement ended; optional note; time; audited). Related, no-migration: UX-046 (C-058) console suspend confirm tick ("Suspend X: 1 practice stops new runs"), UX PR 78 co-001/ux-console-confirm (after #42).
## Next: DB migrations/functions in clone
## DB facts (base e908c21)
- billing.sql:266-279 organization_run_refusal(uuid) SQL STABLE DEFINER: status suspended/closed text, else billing_standing suspended. Words "once a platform administrator reinstates it" at :271.
- billing.sql:281-293 practice_run_refusal(uuid) plpgsql DEFINER: practice_in_scope check, then owning org only (p.organization_id). Granted EXECUTE to tp_app :408.
- billing.sql:295-322 refuse_new_work_while_suspended() trigger fn: owning org only; triggers on pricing_run, audit_report, report_document, roi_statement, digest, source_document (parent null), packet_version export (exported_at null->not null). No later migration adds triggers or recreates these 3 fns (grep).
- tenancy.sql:19-27 organization(kind group|firm|internal, status active|suspended|closed); no status trigger beyond kind_fixed; policy organization_platform_admin_update :494 (tp_app, platform admin), GRANT UPDATE(name,billing_customer_ref,status) :597.
- grant table tenancy.sql:95-116 (organization_id, practice_id, starts/ends, revoked_at).
- TS callers: apps/worker/src/billing/refusal.ts:28 practiceRunRefusal; worker.ts:148 (RUN_STARTING_JOBS monitor,reconcile,digest,packet_export); web lib/http/invoke.ts:501 (route wrapper) and :297 (55000->suspended); routes/practice.ts:167; routes/uploads.ts:112; lib/billing/runs.ts (list of refused routes).
- #42 dunning.ts:234 reinstated only checks billing_standing, not organization.status (SS-08); messages :103-104,:111-112.
- #42 migration :803-810 recreates policy audit_event_record (reserved actions list) - shared if this item reserves an audit action.
- console.ts (#42 unchanged there) setOrganizationStatus :90-113 (organization.manage, input organizationId+status, audit organization_status_set). Console page card :54-76 claims "every practice of the organization".
- ADR 0050:118 "a firm's own invoices and its suspension rules come [milestone 12]" (decider founder).
## Probe DB tp_design_ss01_1 (migrated from empty via main checkout e908c21 tsx migrate --dev-login; drop at end)
- world: scratchpad/probes/ss01-world.sql (+ -2), probes/ss01-probe.sql
- REPRODUCED: firm F (grant in force on group G's practice P) suspended -> practice_run_refusal(P) NULL; digest + top-level source_document insert for P succeed. Firm closed -> NULL too. Group suspended -> refusal text + 55000 on digest.
- closed firm's principal still reaches P via grant (effective_practice_access ignores grantee org status) - observation.
- every non-deleted practice has an owning group (tenancy_hardening.sql:229 practice_has_owner); firms reach practices only by grants.
- PRD:67 practice has admin "even when a firm pays"; PRD:68 org pays invoices; PRD:223 firms invoiced per granted practice; PRD:99 practice leaves a firm by ending grant.
- probe2: a firm CAN be billing-suspended today (tp_billing inserts a firm invoice; account.ts subscribe :272 and issueAuditInvoice :337 accept firms; console rows :398 group+firm) -> organization_run_refusal(F) = nonpayment text, granted P still NULL. #56 standing.ts:8 claim "nonpayment cannot arise for a firm before m12" is false at the DB level.
- probe2: tp_app platform admin can UPDATE organization closed->active and suspend the INTERNAL org: no DB transition guard; only console.ts:100-106 refuses.
- grants may be held by groups too (effective_practice_access 'grant' branch kind IN group,firm) -> refusal should consider any grantee org in force with roles? (scope roles empty = no access)
- words shown to people: next.ts:170 "Not started: <reason>."; uploads.ts:116 "Uploads are paused: <reason>."; p/[practiceId]/page.tsx:164-171 alert (capitalised reason + "The organization's administrator sees the standing ... Settings, Billing" - wrong for a firm-caused refusal); OUTCOME_NAMES :137 "Refused: the organization is suspended". Tests pin words: billing.db.test.ts:312,339; billing-routes.db.test.ts:415,430,441,489,504,550; console-routes.db.test.ts:685; route-tests/define.ts:154; worker.test.ts:322.
- model calls (model_proposal, model_budget_hold) are not refused by any suspension (adjacent gap, not SS-01).
- audit_event: purpose CHECK '^[a-z][a-z0-9_]{0,63}$' (can carry reason code, not note); append-only; organization.manage = platform_admin only.
- ADR 0055:56 reinstated stage from paid_at >= suspension time; :65 console suspends via same run refusal.
- FOUNDER RULING Q13 (HANDOFF.md:443, 2026-10-21): "for the billing PR, not 6b: suspension waits for a delivered dunning notice or an operator-recorded contact." UNBUILT (#42 ADR 0050 amendment: "whether it should wait ... is Q13, for the billing pull request"). Touches billing_standing (billing.sql:247-260) read by organization_run_refusal, account.ts:114,:344, dunning.ts:214-215 (#42).
- #42 dunning stage lists: dunning_notice_recipient_stage CHECK (#42 mig :637), billing_open_dunning_notice stage list (:687), invoice.dunning_stage CHECK (billing.sql:100), DUNNING_NOTICE_STAGES TS. SS-08 via words chosen at send time needs no migration (tp_billing SELECT organization.status, billing.sql:238). tp_billing definer list pinned by billing.db.test.ts:662-676 (#42).
- #42 recreates: audit_event_record policy (:803-810), notification_kind_check (:797-800). SS-01 recreates neither unless it reserves an audit action / adds a notification kind.
## Next: #42 applied DB probe (tp_design_ss01_2), domain model/functions regen facts, db tests list, final report
- tp_design_ss01_2 migrated with #42 (scratchpad/probes/migrate42.mts + pr42-migrations); refusal fns + billing_record_audit md5 identical base vs #42; 7 refusal triggers.
- PROTOTYPE (rolled back, probes/ss01-prototype.sql): internal practice_work_refusal(uuid) used by practice_run_refusal + trigger; grantee clause on grant in force + o.status IN (suspended, closed): refusal returned for group admin, digest insert 55000, revoking the grant lifts at once; plan uses grant_by_practice + organization_pkey. tp_owner reads grants via grant_resolver (SELECT true).
- grant.revoke = practice_admin only (settings.ts:217). practice_grants() returns grantee name/kind, not status (adding status = DROP+CREATE, return type).
- billing_usage_counts counts grants in force without the roles condition (billing.sql:356-360) -> same predicate for the grantee clause.
- Names in RAISE messages reach Postgres's server log (no log settings in infra/lib/constructs/database.ts:131); keep org names out of DB words.
- standing.ts:7-9 maps a firm's billing suspension to past_due (no runs refused) by design; billing.ts closed firm notice omits "no new run starts" -> grantee clause should read status only, not billing standing, unless ADR 0050:118 amended (founder).
- No path closes an org anywhere (routes, jobs, seed, e2e, runbooks); only owner SQL in tests (console-routes.db.test.ts:690).
## Next: write final report
- probe DBs tp_design_ss01_1/_2 DROPPED. Report delivered.
