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
- F4 VERIFIED: triage.ts:448 enqueue only; queries.ts:547 enqueue packet_export only; uploads.ts:364 retry enqueue intake; uploads.ts:339 complete (practice.uploads.complete, not run-starting; continues started upload). Other enqueues: settings.ts:414 reconcile (set_proof_level), :720 monitor (pricing_location), reconciliation.ts:334 reconcile (save_template), console.ts:474 monitor: practice's own jobs (owner-gated in worker). MemoryQueue.jobs records type (route-tests world). DISPOSITION: TAKE: words in 0/1.3/ADR; registry test in define.ts: any route whose ok call queues triage|packet_export|intake|price|audit_report|report_document|roi_statement is in RUN_STARTING_ROUTES or in CONTINUES_STARTED_WORK {practice.uploads.complete}. DB stop for those three: separate decision, not taken (reason: pg-boss own connection; a guarded request row = new table per job; handler gate + registry test suffices; record in ADR 0080 open points).
- F5 VERIFIED (R3/H4 to non-members vs D6). DISPOSITION: TAKE, in DB: practice_work_hold owner cause = 'on_hold' for non-members (suspended + nonpayment alike), reason null; closed stays 'closed' for all (whether it restarts, never why). New R6 neutral sentence; H13 home for non-members; G1 'account with PaidWhole is on hold'.
- F6: TAKE: C7 from history row from_status 'active' AND at = status_since (same txn now()); else legacy line; plus 'Reason changed by {email} on {date}' from latest suspended->suspended row after status_since. BIL-08 test w/ second admin.
- F7: TAKE: security_hold hint + ADR 0080.
- F8 VERIFIED (dunning.ts sendOne reads only invoice; runDunning downgrade at stage time). TAKE: sendOne reads billing_standing (tp_billing GRANT SELECT billing.sql:264); reinstated + standing suspended -> 'Another invoice is still unpaid...' BIL-10 case.
- F9 VERIFIED page.tsx:164-171 (old suffix incl. monitoring). TAKE: rewrite 4.7 (rollback lasts as long as it lasts; grantee suffix wrong on monitoring); accept in ADR 0080; R4/R5 say 'through its grant'.
- NEXT: probe revised practice_work_hold on tp_design_ss01_30 (X, Y, control, analyst+firm mixed, non-member owner neutral); then edit design.
- [x] DB tp_design_ss01_30 migrated (45, #42 15189a50) + ss01-world.sql
- [x] PROBE run: probes/ss01-revise-proto.sql + ss01-revise-probes.sql (rolled back) on tp_design_ss01_30. Results: S0 unpaid_invoice refused 23514; F principal alone: stopped all 5, R4 everywhere, upload+pricing 55000; X: same (stopped all 5); Y: stopped {mapping.edit,case.work,posting.reconcile,file.upload} (phi.export denied by viewer in union), upload+pricing 55000; Z analyst(G)+principal(F): stopped {mapping.edit,posting.reconcile,phi.export}; case.work/file.upload null, upload RECORDED, pricing_run 55000, old-image practice_run_refusal R4 (fail closed); W analyst+firm_analyst: no hold; G admin no hold; V1 grant.approve -> 22023; J1 job null; O2 G suspended: F principal on_hold/R6, Z+G admin suspended+customer_request R1; O4 nonpayment: F principal on_hold R6, G admin nonpayment R3; O5 job R6; C3 attribution suspended_by=A, reason_changed_by=B; K1 codes 13, last organization_suspended.
- NEXT: capacity check (optional), then edit design.
- capacity (probes/ss01-revise-capacity.sql inside proto txn): F granted 2,001: practice_run_refusal_for 6.9/3.5/3.3 ms, practice_run_refusal 3.4, practice_run_hold 3.5, open_practice_scope 3.7 ms.
- #42 file list now 212 files (progress/ss01-revise-42files.txt). NOT #42: invoke.ts, uploads.ts, refusal.ts, runs.ts, readiness.ts, services.ts, export-attempts.ts, worker.ts, define.ts, world.ts, page.tsx, billing.ts, account.ts, seed.ts. #42: console.ts dunning.ts practice.ts settings.ts tenancy.ts areas.json billing.db.test.ts worker.test.ts test-matrix synth matrix/registry.
- line fixes: practice.ts home call is :252 (design said :166-167); policy :863-870; pause/resume :1216/:1235.
- define.ts:146-160 nonpayment route test picks any allowed actor in worldB -> with F5 a firm persona reads R6: test must pick a group member for R3 and add a firm persona reading R6.
- DECISIONS for rewrite: F4 DB stop for triage/export/retry NOT recommended (afterCommit loses triage w/o schedule; job re-check needs 2nd access definition); gate asks Postgres; registry test. SS-08 effect 4 values: runs, billing_held (group active, standing suspended at send), held, none; billing_held words for pre-suspension stages + reinstated. Words: R1 member 'your organization'; R6 neutral; H13 non-member; stopped list words mapping.edit 'pricing runs', case.work 'triage, reports', posting.reconcile 'ROI statements', phi.export 'packet exports', file.upload 'uploads'. C4 hint no-nonpayment; F7 static hint. C7 three lines.
- NEXT: rewrite design file in full (Write), then add section 18 After the design review.
- word pins with actors: billing.db.test.ts:313,:340 job scope -> R6 now; billing-routes.db.test.ts:414-550 group admin/uploader (members) -> R1/R3 (builders check each actor); console-routes.db.test.ts:685 check actor; define.ts:154 -> R3 for group persona, R6 otherwise. worker.test.ts:325 mock unchanged query.
- backup of pre-revision design: progress/ss-01-suspension.pre-revise.md
- WRITING full revised design now (sections 0-18).
- WRITTEN: full revised design at /home/user/ops/designs/ss-01-suspension.md (sections 0-18). NEXT: proofread/consistency check (grep unpaid_invoice, 'every path', line refs, H-ids), drop DB tp_design_ss01_30, StructuredOutput.
## Dispositions (final)
- F1 taken (per-permission hold; stopped; practice_run_refusal_for; trigger map; X/Y/Z/W tests)
- F2 taken (drop unpaid_invoice; B5 retired; rulings named touched-and-kept)
- F3 taken (packet_export_refusal_codes recreated, code LAST not before verifier_failed: reason given)
- F4 taken (precise words; row 11; registry test + CONTINUES_STARTED_WORK; DB stop not built D18, handed on)
- F5 taken (on_hold cause for non-members in PG; R6/H13; G1 neutral; property test)
- F6 taken (C7 from row from_status active & at=status_since; reason-changed line)
- F7 taken (C4 hint; ADR 0080)
- F8 taken + widened (billing_held effect all stages)
- F9 taken (4.7 rewritten; accepted in ADR 0080)
- [x] DB tp_design_ss01_30 DROPPED
- DONE: design revised (1289 lines, sections 0-18); fixes after proofread: BIL-07 export row (worker.test.ts gate + export-attempts db), D8 :1216-1256. Remaining: StructuredOutput.
