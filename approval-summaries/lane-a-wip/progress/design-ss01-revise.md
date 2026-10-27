# design-ss01-revise progress (revise /home/user/ops/designs/ss-01-suspension.md after review)
Started 2026-10-27 run 1.
Clone: $P/designs/ss01-revise (to create)
## Status
- [ ] read design in full
- [ ] clone + fetch
- [ ] verify each finding F1..F9
- [ ] probe DB tp_design_ss01_30 (if needed)
- [ ] edit design
- [ ] add "After the design review" section
## Dispositions
- [x] read design in full (1020 lines)
- [x] clone $P/designs/ss01-revise; #42 head NOW 15189a50 (was 098636e3): 36 commits; design-relevant: settings.ts (+undeliveredReason, usersSettingsPage only), mail_streams.sql audit_event_record policy now :863-870 (action list unchanged: 7 reserved), console_pause/resume at :1216/:1235. console.ts, dunning.ts, practice.ts, tenancy.ts, areas.json unchanged since 098636e3.
- F1 VERIFIED by code: scope.ts:141-160 unions roles; app_actor_permitted = roles_permit(array_agg roles over effective_practice_access). roles_permit has allow AND no deny (viewer denies phi.export). Route perms: pricing create/rerun mapping.edit; triage case.work; reports.generate case.work; documents case.work; roi posting.reconcile; packet.export phi.export; uploads request/retry file.upload. Trigger tables: only pricing_run (mapping.edit) and audit_report (case.work) have permission policies in PG.
  DISPOSITION F1: TAKE. Design: practice_work_hold returns `stopped text[]` (run-starting perms the person holds here only via held grants: roles_permit(all,p) AND NOT roles_permit(unheld,p) over run_starting_permissions()); new IMMUTABLE run_starting_permissions() (5 perms, pinned to RUN_STARTING_ROUTES perms); practice_work_refusal(target, wanted) (NULL = any stopped); new tp_app practice_run_refusal_for(uuid,text) for route+uploads page (raises 22023 for perm outside list); practice_run_refusal(uuid) = wanted NULL (old image + worker; fail-closed for mixed paths during rollback); trigger maps TG_TABLE_NAME->perm (pricing_run mapping.edit, audit_report/report_document case.work, roi_statement posting.reconcile, source_document file.upload, packet_version phi.export, digest NULL), ELSE raise. Words say "through its grants".
- F2 VERIFIED: PRD:223, ADR 0050:64-72 (ends at invoice.paid), HANDOFF.md:578 Q13; reason list is UX-004's proposal (not a ruling; co-founder ruled only words). DISPOSITION: TAKE best: drop unpaid_invoice; name PRD:223/ADR0050/Q13 as touched-and-kept in sec 9/12/PR desc.
- F3 VERIFIED: packet_export_refusal_codes() 12 codes (deadline...sql:1525), granted tp_app; trigger 23514; export-attempts.db.test.ts:163,:165; EXPORT_REQUEST_REFUSALS Record<ExportReadinessReason>. DISPOSITION: TAKE; append 'organization_suspended' LAST (after verifier_failed: "then the worker gate's"), exclude from ExportReadinessReason and :165 filter.
