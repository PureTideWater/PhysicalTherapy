# Domain model (generated from the live schema)

> GENERATED FILE. Produced by `introspect-schema.mjs` reading the PostgreSQL catalog of a database migrated with `pnpm db:migrate`; do not edit by hand, regenerate it.

- Source: branch `claude/build-platform`, commit `dbdb7120ad16acb8269d124e67db22e7cc9bbcba`
- Migrations applied: 36; head `20261101090000_billing_review.sql`
- Database: `co_domain_model`; PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu
- Generated at: 2026-10-17T03:18:31.933Z
- Relations in schema public: 78 tables, 1 view(s); PostgreSQL enum types: 0 (every enumeration is a CHECK constraint)
- phi_table_registry: 44 tables; tenant tables with practice_id not in the registry: 4; organization- or user-scoped RLS tables: 22; global tables: 8
- Functions in public: 236 (106 SECURITY DEFINER); non-internal triggers: 211

Approval: _pending founder approval (CO-02). Approved by: ____________ Date: _____________

## Contents

1. [Table index](#table-index)
2. [PHI table registry](#phi-table-registry)
3. [Tenant tables outside the registry](#tenant-tables-outside-the-registry)
4. [Global tables](#global-tables) and [organization- or user-scoped tables](#organization--or-user-scoped-tables)
5. [Enumerations (CHECK constraints)](#enumerations-check-constraints)
6. [Encrypted columns](#encrypted-columns)
7. [Invariant triggers](#invariant-triggers)
8. [Functions](#functions)
9. [Tables](#tables) (one section each)
10. [Views](#views)

## Table index

| Table | Class | practice_id | RLS | FORCE | Policies | Triggers | tp_app | tp_operator | tp_billing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`adjustment`](#table-adjustment) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`agreement`](#table-agreement) | tenant (nullable practice_id), not PHI | uuid NULL | yes | yes | 4 | 1 | SELECT, INSERT(cols) | - | - |
| [`agreement_event`](#table-agreement-event) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 1 | 1 | - | - | - |
| [`anomaly`](#table-anomaly) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 5 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`audit_event`](#table-audit-event) | tenant (nullable practice_id), not PHI | uuid NULL | yes | yes | 5 | 2 | SELECT, INSERT(cols) | SELECT | - |
| [`audit_report`](#table-audit-report) | PHI (registered) | uuid NOT NULL | yes | yes | 3 | 6 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`audit_report_download`](#table-audit-report-download) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 4 | SELECT, INSERT(cols) | - | - |
| [`billing_event`](#table-billing-event) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 1 | 2 | - | - | SELECT, INSERT, UPDATE |
| [`billing_standing`](#table-billing-standing) | view | - | no | no | 0 | 0 | SELECT | - | SELECT |
| [`case`](#table-case) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 5 | SELECT, INSERT(cols) | - | - |
| [`case_activity`](#table-case-activity) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 4 | SELECT, INSERT(cols) | - | - |
| [`case_line`](#table-case-line) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 7 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`claim`](#table-claim) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`compliance_record`](#table-compliance-record) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`contract`](#table-contract) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`contract_calendar_event`](#table-contract-calendar-event) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | - | - |
| [`contract_question`](#table-contract-question) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`contract_version`](#table-contract-version) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`digest`](#table-digest) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`eft_row`](#table-eft-row) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols) | - | - |
| [`eval_example`](#table-eval-example) | tenant (nullable practice_id), not PHI | uuid NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | SELECT, INSERT(cols) | - |
| [`feature_flag`](#table-feature-flag) | global (no practice_id, no RLS) | - | no | no | 0 | 1 | SELECT | SELECT | - |
| [`grant`](#table-grant) | PHI (registered) | uuid NOT NULL | yes | yes | 5 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`invitation`](#table-invitation) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 2 | 2 | SELECT | - | - |
| [`invoice`](#table-invoice) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 3 | SELECT | - | SELECT, INSERT, UPDATE |
| [`job_run`](#table-job-run) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 1 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`ledger_entry`](#table-ledger-entry) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 4 | SELECT, INSERT(cols) | - | - |
| [`ledger_match`](#table-ledger-match) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`line_note`](#table-line-note) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | - | - |
| [`line_status`](#table-line-status) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 6 | SELECT, INSERT(cols) | - | - |
| [`membership`](#table-membership) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 4 | 6 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`model_budget_hold`](#table-model-budget-hold) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 0 | SELECT, INSERT(cols), DELETE | - | - |
| [`model_call`](#table-model-call) | tenant (nullable practice_id), not PHI | uuid NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols), UPDATE(cols) | SELECT, INSERT(cols) | - |
| [`model_proposal`](#table-model-proposal) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`mutation_request`](#table-mutation-request) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 2 | 0 | SELECT, INSERT(cols) | - | - |
| [`notification`](#table-notification) | PHI (registered) | uuid NOT NULL | yes | yes | 4 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`organization`](#table-organization) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 6 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | SELECT(cols), UPDATE(cols) |
| [`packet`](#table-packet) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 5 | SELECT, INSERT(cols) | - | - |
| [`packet_version`](#table-packet-version) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 8 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`parse_report`](#table-parse-report) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`patient_ref`](#table-patient-ref) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 1 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`payer`](#table-payer) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 1 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`payer_plan_mapping`](#table-payer-plan-mapping) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | - | - |
| [`payer_response`](#table-payer-response) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 6 | SELECT, INSERT(cols) | - | - |
| [`phi_table_registry`](#table-phi-table-registry) | global (no practice_id, no RLS) | - | no | no | 0 | 1 | SELECT | - | - |
| [`plan`](#table-plan) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`posting_row`](#table-posting-row) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols) | - | - |
| [`practice`](#table-practice) | PHI (registered) | id (the tenant key) | yes | yes | 4 | 6 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`priced_line`](#table-priced-line) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols) | - | - |
| [`pricing_run`](#table-pricing-run) | PHI (registered) | uuid NOT NULL | yes | yes | 4 | 4 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`prospect_request`](#table-prospect-request) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT, UPDATE(cols) | - | - |
| [`provider_adjustment`](#table-provider-adjustment) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`rate_limit_counter`](#table-rate-limit-counter) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 1 | 0 | - | - | - |
| [`rate_record`](#table-rate-record) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols), DELETE | - | - |
| [`remittance`](#table-remittance) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`report_document`](#table-report-document) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 5 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`restore_drill`](#table-restore-drill) | global (no practice_id, no RLS) | - | no | no | 0 | 2 | - | SELECT, INSERT | - |
| [`roi_statement`](#table-roi-statement) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`role_permission`](#table-role-permission) | global (no practice_id, no RLS) | - | no | no | 0 | 1 | SELECT | - | - |
| [`rule_record`](#table-rule-record) | global (no practice_id, no RLS) | - | no | no | 0 | 2 | SELECT | - | - |
| [`rule_release`](#table-rule-release) | global (no practice_id, no RLS) | - | no | no | 0 | 2 | SELECT | - | - |
| [`rule_release_withdrawal`](#table-rule-release-withdrawal) | global (no practice_id, no RLS) | - | no | no | 0 | 2 | SELECT | - | - |
| [`schema_migrations`](#table-schema-migrations) | global (no practice_id, no RLS) | - | no | no | 0 | 0 | - | - | - |
| [`service_line`](#table-service-line) | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`source_document`](#table-source-document) | PHI (registered) | uuid NOT NULL | yes | yes | 4 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`status_component`](#table-status-component) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT, UPDATE(cols) | - | - |
| [`status_incident`](#table-status-incident) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`status_incident_update`](#table-status-incident-update) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`submission`](#table-submission) | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 5 | SELECT, INSERT(cols) | - | - |
| [`subscription`](#table-subscription) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 3 | SELECT | - | SELECT, INSERT, UPDATE |
| [`subscription_claim`](#table-subscription-claim) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 2 | 3 | - | - | SELECT, INSERT, UPDATE |
| [`support_grant`](#table-support-grant) | PHI (registered) | uuid NOT NULL | yes | yes | 7 | 4 | SELECT, INSERT(cols) | - | - |
| [`support_ticket`](#table-support-ticket) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 4 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`terms_acceptance`](#table-terms-acceptance) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`terms_version`](#table-terms-version) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`usage_snapshot`](#table-usage-snapshot) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 3 | 2 | SELECT | - | SELECT, INSERT |
| [`user`](#table-user) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 4 | 4 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`user_device`](#table-user-device) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 2 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`user_session`](#table-user-session) | RLS, no practice_id (organization- or user-scoped) | - | yes | yes | 2 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |

## PHI table registry

Rows of `phi_table_registry`, and whether the registered policy is PERMISSIVE, FOR ALL, TO PUBLIC with USING and WITH CHECK exactly `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])` (`id` for `practice`).

| Table | Registered policy | Registered by migration | Policy qualifies |
| --- | --- | --- | --- |
| `adjustment` | `adjustment_tenant` | `20261016120000_remittances` | yes |
| `anomaly` | `anomaly_tenant` | `20261019160000_triage_cases_and_audit_reports` | yes |
| `audit_report` | `audit_report_tenant` | `20261019160000_triage_cases_and_audit_reports` | yes |
| `audit_report_download` | `audit_report_download_tenant` | `20261019160000_triage_cases_and_audit_reports` | yes |
| `case` | `case_tenant` | `20261019160000_triage_cases_and_audit_reports` | yes |
| `case_activity` | `case_activity_tenant` | `20261024110000_case_workbench` | yes |
| `case_line` | `case_line_tenant` | `20261019160000_triage_cases_and_audit_reports` | yes |
| `claim` | `claim_tenant` | `20261016120000_remittances` | yes |
| `contract` | `contract_tenant` | `20261016160000_contracts_and_mapping` | yes |
| `contract_calendar_event` | `contract_calendar_event_tenant` | `20261016160000_contracts_and_mapping` | yes |
| `contract_question` | `contract_question_tenant` | `20261016200000_contract_questions_and_queue` | yes |
| `contract_version` | `contract_version_tenant` | `20261016160000_contracts_and_mapping` | yes |
| `digest` | `digest_tenant` | `20261020090000_monitoring_digests_notifications` | yes |
| `eft_row` | `eft_row_tenant` | `20261023120000_recovery_ledger` | yes |
| `grant` | `grant_tenant` | `20261015140000_tenancy` | yes |
| `job_run` | `job_run_tenant` | `20261016121000_job_runs` | yes |
| `ledger_entry` | `ledger_entry_tenant` | `20261023120000_recovery_ledger` | yes |
| `ledger_match` | `ledger_match_tenant` | `20261023120000_recovery_ledger` | yes |
| `line_note` | `line_note_tenant` | `20261016120000_remittances` | yes |
| `line_status` | `line_status_tenant` | `20261019160000_triage_cases_and_audit_reports` | yes |
| `model_budget_hold` | `model_budget_hold_tenant` | `20261031090000_model_budget_holds` | yes |
| `model_proposal` | `model_proposal_tenant` | `20261029190000_model_proposals` | yes |
| `notification` | `notification_tenant` | `20261020090000_monitoring_digests_notifications` | yes |
| `packet` | `packet_tenant` | `20261023090000_packets_submissions_and_responses` | yes |
| `packet_version` | `packet_version_tenant` | `20261023090000_packets_submissions_and_responses` | yes |
| `parse_report` | `parse_report_tenant` | `20261016120000_remittances` | yes |
| `patient_ref` | `patient_ref_tenant` | `20261016120000_remittances` | yes |
| `payer` | `payer_tenant` | `20261016090000_documents_payers_plans` | yes |
| `payer_plan_mapping` | `payer_plan_mapping_tenant` | `20261016160000_contracts_and_mapping` | yes |
| `payer_response` | `payer_response_tenant` | `20261023090000_packets_submissions_and_responses` | yes |
| `plan` | `plan_tenant` | `20261016090000_documents_payers_plans` | yes |
| `posting_row` | `posting_row_tenant` | `20261023120000_recovery_ledger` | yes |
| `practice` | `practice_tenant` | `20261015140000_tenancy` | yes |
| `priced_line` | `priced_line_tenant` | `20261018090000_pricing_runs` | yes |
| `pricing_run` | `pricing_run_tenant` | `20261018090000_pricing_runs` | yes |
| `provider_adjustment` | `provider_adjustment_tenant` | `20261016120000_remittances` | yes |
| `rate_record` | `rate_record_tenant` | `20261016160000_contracts_and_mapping` | yes |
| `remittance` | `remittance_tenant` | `20261016120000_remittances` | yes |
| `report_document` | `report_document_tenant` | `20261025090000_report_documents_and_export_history` | yes |
| `roi_statement` | `roi_statement_tenant` | `20261023120000_recovery_ledger` | yes |
| `service_line` | `service_line_tenant` | `20261016120000_remittances` | yes |
| `source_document` | `source_document_tenant` | `20261016090000_documents_payers_plans` | yes |
| `submission` | `submission_tenant` | `20261023090000_packets_submissions_and_responses` | yes |
| `support_grant` | `support_grant_tenant` | `20261015140000_tenancy` | yes |

## Tenant tables outside the registry

Tables with a `practice_id` column that are not in `phi_table_registry`. The catalog test allows this only for a nullable practice_id listed in `NULLABLE_PRACTICE_ID_TABLES` (packages/db/src/catalog.ts).

| Table | practice_id | RLS / FORCE | Policies (name: command, roles) |
| --- | --- | --- | --- |
| `agreement` | uuid NULL | yes / yes | agreement_owner: ALL tp_owner<br>agreement_parties: SELECT tp_app<br>agreement_read_by_parties: SELECT (restrictive) tp_app<br>agreement_recorded_by_signers: INSERT tp_app |
| `audit_event` | uuid NULL | yes / yes | audit_event_access_log: SELECT tp_app<br>audit_event_operator_copy: SELECT tp_operator<br>audit_event_operator_read: SELECT tp_owner<br>audit_event_operator_record: INSERT tp_owner<br>audit_event_record: INSERT tp_app |
| `eval_example` | uuid NULL | yes / yes | eval_example_synthetic: ALL tp_operator<br>eval_example_tenant: ALL public |
| `model_call` | uuid NULL | yes / yes | model_call_synthetic_evaluation: ALL tp_operator<br>model_call_tenant: ALL public |

## Global tables

Tables with no `practice_id` and no registry row. The data dictionary convention: no practice_id, and the application role may not INSERT, UPDATE or DELETE.

| Table | RLS / FORCE | Policies | tp_app | tp_operator | tp_billing | Column grants |
| --- | --- | --- | --- | --- | --- | --- |
| `feature_flag` | no / no | 0 | SELECT | SELECT | - |  |
| `phi_table_registry` | no / no | 0 | SELECT | - | - |  |
| `restore_drill` | no / no | 0 | - | SELECT, INSERT | - |  |
| `role_permission` | no / no | 0 | SELECT | - | - |  |
| `rule_record` | no / no | 0 | SELECT | - | - |  |
| `rule_release` | no / no | 0 | SELECT | - | - |  |
| `rule_release_withdrawal` | no / no | 0 | SELECT | - | - |  |
| `schema_migrations` | no / no | 0 | - | - | - |  |

## Organization- or user-scoped tables

Tables with no `practice_id` that ENABLE and FORCE row-level security on another key (organization, user, or the platform).

| Table | Policies (name: command, roles) | tp_app | tp_billing |
| --- | --- | --- | --- |
| `agreement_event` | agreement_event_owner: ALL tp_owner | - | - |
| `billing_event` | billing_event_billing: ALL tp_billing | - | SELECT, INSERT, UPDATE |
| `compliance_record` | compliance_record_owner: ALL tp_owner<br>compliance_record_read: SELECT tp_app<br>compliance_record_recorded: INSERT tp_app | SELECT, INSERT(cols) | - |
| `invitation` | invitation_administrators_and_invitee: SELECT tp_app<br>invitation_owner: ALL tp_owner | SELECT | - |
| `invoice` | invoice_billing: ALL tp_billing<br>invoice_owner: SELECT tp_owner<br>invoice_owners_read: SELECT tp_app | SELECT | SELECT, INSERT, UPDATE |
| `membership` | membership_administrators_insert: INSERT tp_app<br>membership_administrators_update: UPDATE tp_app<br>membership_owner: ALL tp_owner<br>membership_self_and_administrators: SELECT tp_app | SELECT, INSERT(cols), UPDATE(cols) | - |
| `mutation_request` | mutation_request_owner: ALL tp_owner<br>mutation_request_self: ALL tp_app | SELECT, INSERT(cols) | - |
| `organization` | organization_billing_customer: UPDATE tp_billing<br>organization_billing_read: SELECT tp_billing<br>organization_members: SELECT tp_app<br>organization_owner: ALL tp_owner<br>organization_platform_admin_insert: INSERT tp_app<br>organization_platform_admin_update: UPDATE tp_app | SELECT, INSERT(cols), UPDATE(cols) | SELECT(cols), UPDATE(cols) |
| `prospect_request` | prospect_request_owner: ALL tp_owner<br>prospect_request_platform_read: SELECT tp_app<br>prospect_request_platform_review: UPDATE tp_app | SELECT, UPDATE(cols) | - |
| `rate_limit_counter` | rate_limit_counter_owner: ALL tp_owner | - | - |
| `status_component` | status_component_managed: UPDATE tp_app<br>status_component_owner: ALL tp_owner<br>status_component_read: SELECT tp_app | SELECT, UPDATE(cols) | - |
| `status_incident` | status_incident_opened_by_platform: INSERT tp_app<br>status_incident_owner: ALL tp_owner<br>status_incident_read: SELECT tp_app | SELECT, INSERT(cols) | - |
| `status_incident_update` | status_incident_update_owner: ALL tp_owner<br>status_incident_update_posted_by_platform: INSERT tp_app<br>status_incident_update_read: SELECT tp_app | SELECT, INSERT(cols) | - |
| `subscription` | subscription_billing: ALL tp_billing<br>subscription_owner: SELECT tp_owner<br>subscription_owners_read: SELECT tp_app | SELECT | SELECT, INSERT, UPDATE |
| `subscription_claim` | subscription_claim_billing: ALL tp_billing<br>subscription_claim_owner: SELECT tp_owner | - | SELECT, INSERT, UPDATE |
| `support_ticket` | support_ticket_owner: ALL tp_owner<br>support_ticket_read: SELECT tp_app<br>support_ticket_requested: INSERT tp_app<br>support_ticket_worked: UPDATE tp_app | SELECT, INSERT(cols), UPDATE(cols) | - |
| `terms_acceptance` | terms_acceptance_owner: ALL tp_owner<br>terms_acceptance_self: INSERT tp_app<br>terms_acceptance_self_and_platform_read: SELECT tp_app | SELECT, INSERT(cols) | - |
| `terms_version` | terms_version_owner: ALL tp_owner<br>terms_version_published_by_platform: INSERT tp_app<br>terms_version_read: SELECT tp_app | SELECT, INSERT(cols) | - |
| `usage_snapshot` | usage_snapshot_billing: ALL tp_billing<br>usage_snapshot_owner: SELECT tp_owner<br>usage_snapshot_owners_read: SELECT tp_app | SELECT | SELECT, INSERT |
| `user` | user_invited_by_administrators: INSERT tp_app<br>user_owner: ALL tp_owner<br>user_self_and_administrators: SELECT tp_app<br>user_self_and_platform_admin_update: UPDATE tp_app | SELECT, INSERT(cols), UPDATE(cols) | - |
| `user_device` | user_device_owner: ALL tp_owner<br>user_device_self: ALL tp_app | SELECT, INSERT(cols), UPDATE(cols) | - |
| `user_session` | user_session_owner: ALL tp_owner<br>user_session_self: ALL tp_app | SELECT, INSERT(cols), UPDATE(cols) | - |

## Enumerations (CHECK constraints)

Columns whose CHECK constraint admits a closed list of values.

| Table.column | Values |
| --- | --- |
| `agreement.kind` | `baa`, `engagement`, `terms`, `data_rights`, `dpa` |
| `audit_event.actor_kind` | `user`, `service`, `system` |
| `audit_report.status` | `queued`, `ready`, `failed` |
| `audit_report_download.file` | `pdf`, `csv` |
| `billing_event.outcome` | `received`, `applied`, `stale`, `ignored`, `unknown_customer` |
| `case.state` | `open`, `submitted`, `awaiting_response`, `partially_resolved`, `resolved`, `closed_written_off` |
| `case_activity.kind` | `note`, `assigned`, `approval_requested` |
| `case_line.written_off_reason` | `window_passed`, `payer_correct_on_review`, `not_worth_pursuit`, `duplicate`, `other` |
| `compliance_record.kind` | `policy_approval`, `access_review`, `tabletop_exercise`, `training_attestation`, `vendor_review`, `risk_analysis`, `security_official` |
| `contract.status` | `active`, `ended` |
| `contract_calendar_event.kind` | `anniversary`, `notice_deadline`, `fee_schedule_year`, `amendment` |
| `contract_question.topic` | `missing_pages`, `missing_schedule`, `undefined_method`, `scope`, `timed_units`, `windows`, `other` |
| `contract_question.status` | `open`, `answered`, `withdrawn` |
| `contract_version.status` | `draft`, `proposed`, `signed_off`, `superseded`, `approved` |
| `eval_example.source` | `synthetic`, `permitted` |
| `eval_example.purpose` | `proposeContractTerms`, `readDenialLetter`, `draftPacketNarrative`, `suggestEvidenceRequests` |
| `feature_flag.key` | `model.kill_switch`, `model.read_denial_letter`, `model.daily_budget_cents`, `platform.maintenance` |
| `feature_flag.scope` | `global`, `organization`, `practice` |
| `invoice.kind` | `subscription`, `audit`, `other` |
| `invoice.status` | `draft`, `open`, `paid`, `void`, `uncollectible` |
| `invoice.payment_method_kind` | `us_bank_account`, `card` |
| `invoice.dunning_stage` | `payment_failed`, `second_notice`, `third_notice`, `final_notice`, `suspended`, `reinstated`, `resolved` |
| `job_run.job_type` | `intake`, `parse_835`, `monitor`, `price`, `triage`, `audit_report`, `reconcile`, `digest`, `export`, `packet_export`, `roi_statement`, `report_document` |
| `job_run.outcome` | `running`, `retrying`, `succeeded`, `failed`, `refused` |
| `ledger_entry.stage` | `approved`, `posted`, `deposited`, `interest`, `reversed`, `adjusted`, `recouped` |
| `ledger_entry.evidence_kind` | `claim`, `payer_response`, `posting_row`, `eft_row`, `provider_adjustment`, `ledger_entry` |
| `ledger_match.kind` | `claim`, `posting`, `deposit`, `recoupment`, `interest` |
| `ledger_match.outcome` | `approved`, `decreased`, `no_change` |
| `ledger_match.level` | `claim`, `check`, `batch` |
| `line_status.stage` | `flagged`, `validated`, `actionable`, `payer_approved`, `recovered` |
| `line_status.reopened_from` | `flagged`, `validated`, `actionable`, `payer_approved`, `recovered` |
| `membership.role` | `practice_admin`, `billing_manager`, `analyst`, `viewer`, `firm_principal`, `firm_analyst`, `platform_admin`, `contract_specialist`, `reviewer`, `support` |
| `model_call.actor_kind` | `user`, `service`, `evaluation` |
| `model_call.purpose` | `proposeContractTerms`, `readDenialLetter`, `draftPacketNarrative`, `suggestEvidenceRequests` |
| `model_call.provider` | `bedrock`, `anthropic`, `local` |
| `model_call.outcome` | `completed`, `failed`, `timed_out` |
| `model_call.reviewer_decision` | `accepted`, `accepted_with_changes`, `rejected` |
| `model_proposal.purpose` | `proposeContractTerms`, `draftPacketNarrative`, `suggestEvidenceRequests` |
| `notification.kind` | `monitoring_run`, `digest`, `recoupment`, `follow_up` |
| `organization.kind` | `group`, `firm`, `internal` |
| `organization.status` | `active`, `suspended`, `closed` |
| `parse_report.outcome` | `loaded`, `held`, `partially_held`, `duplicate` |
| `payer_plan_mapping.mapping_kind` | `no_agreement`, `contract`, `ma_noncontracted`, `government`, `other` |
| `payer_response.kind` | `accepted`, `partial`, `denied`, `info_requested`, `reprocessed_no_change` |
| `payer_response.denial_category` | `authorization`, `visit_limit`, `modifier`, `medical_necessity`, `timely_filing`, `bundling`, `other` |
| `plan.network_status` | `in_network`, `out_of_network`, `unknown` |
| `practice.status` | `active`, `deleted` |
| `priced_line.method` | `FIXED_SCHEDULE`, `PERCENT_OF_MEDICARE`, `LESSER_OF`, `PER_VISIT`, `UNSUPPORTED` |
| `priced_line.unpriced_reason` | `NO_AGREEMENT`, `NO_MAPPING`, `AMBIGUOUS_RATE`, `NO_RATE_FOR_CODE`, `NO_PFS_VALUE`, `UNSUPPORTED_METHOD`, `SECONDARY_PAYER`, `MUE_EXCEEDED`, `UNITS_RULE_UNKNOWN`, `DATE_OUTSIDE_VERSIONS`, `REVERSED_CLAIM`, `ENGINE_ERROR` |
| `pricing_run.status` | `queued`, `running`, `complete`, `failed` |
| `prospect_request.billing_arrangement` | `in_house`, `billing_firm`, `mixed`, `other` |
| `prospect_request.status` | `new`, `contacted`, `converted`, `declined` |
| `provider_adjustment.category` | `recoupment`, `forward_balance`, `interest`, `authorized_return`, `other` |
| `rate_record.method` | `FIXED_SCHEDULE`, `PERCENT_OF_MEDICARE`, `LESSER_OF`, `PER_VISIT`, `UNSUPPORTED` |
| `rate_record.rounding` | `HALF_UP_CENT`, `HALF_EVEN_CENT`, `TRUNCATE` |
| `rate_record.proposed_by` | `specialist`, `model` |
| `remittance.bpr_credit_debit` | `C`, `D` |
| `remittance.status` | `loaded`, `held`, `duplicate` |
| `remittance.review_reason` | `trace_reused_another_date`, `trace_reused_same_date` |
| `report_document.kind` | `coverage`, `monthly_summary` |
| `report_document.status` | `queued`, `ready`, `failed` |
| `restore_drill.outcome` | `passed`, `failed` |
| `roi_statement.proof_level` | `posted`, `deposited` |
| `role_permission.role` | `practice_admin`, `billing_manager`, `analyst`, `viewer`, `firm_principal`, `firm_analyst`, `platform_admin`, `contract_specialist`, `reviewer`, `support` |
| `role_permission.effect` | `allow`, `deny` |
| `rule_record.record_type` | `pfs_rvu`, `pfs_gpci`, `conversion_factor`, `mppr_rate`, `therapy_threshold`, `assistant_modifier`, `sequestration`, `ncci_ptp`, `ncci_mue`, `carc`, `rarc`, `claim_status_code`, `state_prompt_pay`, `dispute_window`, `locality_map`, `denial_category` |
| `rule_record.verification` | `L1`, `L2`, `L3` |
| `service_line.observed_allowed_basis` | `amt_b6`, `paid_plus_pr` |
| `source_document.kind` | `x12_835`, `contract`, `exhibit`, `posting_export`, `eft_export`, `payer_letter`, `other` |
| `source_document.scan_status` | `pending`, `clean`, `flagged`, `unscannable`, `failed` |
| `source_document.status` | `awaiting_upload`, `received`, `scanned`, `stored`, `expanded`, `parse_queued`, `parsed`, `balanced`, `loaded`, `held`, `duplicate`, `quarantined`, `not_835`, `wrong_type`, `unreadable`, `too_large`, `too_compressed`, `nested_zip`, `unsafe_entry`, `encrypted`, `too_many_entries`, `failed` |
| `source_document.page_text_status` | `ready`, `unsupported_document`, `document_unreadable` |
| `status_component.key` | `web`, `sign_in`, `uploads`, `jobs`, `exports`, `billing`, `email` |
| `status_component.status` | `operational`, `degraded`, `partial_outage`, `major_outage`, `maintenance` |
| `status_incident.impact` | `minor`, `major`, `critical` |
| `status_incident.status` | `investigating`, `identified`, `monitoring`, `resolved` |
| `status_incident_update.status` | `investigating`, `identified`, `monitoring`, `resolved` |
| `submission.channel` | `payer_portal`, `fax`, `mail`, `provider_relations_email` |
| `subscription.plan` | `monthly`, `annual` |
| `subscription.status` | `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `paused` |
| `subscription_claim.plan` | `monthly`, `annual` |
| `subscription_claim.status` | `pending`, `created`, `failed`, `ended` |
| `support_ticket.category` | `question`, `problem`, `access`, `billing`, `data`, `other` |
| `support_ticket.status` | `open`, `answered`, `closed` |
| `user.status` | `invited`, `active`, `disabled` |
| `user_session.mfa_method` | `totp`, `webauthn` |
| `user_session.end_reason` | `signed_out`, `idle`, `expired`, `device_revoked`, `revoked`, `user_disabled` |

## Encrypted columns

Columns whose CHECK admits only `enc:v1:` ciphertext (application-layer encryption with the practice data key).

| Table | Columns |
| --- | --- |
| `case_activity` | `body` |
| `case_line` | `written_off_text`, `reopen_reason` |
| `claim` | `patient_control_number`, `payer_claim_control_number` |
| `contract_question` | `question`, `answer` |
| `ledger_entry` | `reason` |
| `ledger_match` | `reversal_reason` |
| `line_note` | `note` |
| `line_status` | `reason` |
| `packet_version` | `narrative` |
| `patient_ref` | `last_name`, `first_name`, `dob`, `member_id`, `group_number` |
| `payer_response` | `notes` |
| `posting_row` | `claim_reference` |
| `submission` | `reference` |

## Invariant triggers

Every non-internal trigger, its function, and the exceptions its function raises (the invariant in its own words). Triggers that only maintain `updated_at` are listed in each table section, not here.

| Table | Trigger | Definition | Raises |
| --- | --- | --- | --- |
| `adjustment` | `adjustment_references_in_practice` | `BEFORE INSERT ON adjustment FOR EACH ROW EXECUTE FUNCTION adjustment_references_in_practice()` | an adjustment belongs to a claim of the same practice<br>a line-level adjustment belongs to a line of its own claim |
| `agreement_event` | `agreement_event_append_only` | `BEFORE DELETE OR UPDATE ON agreement_event FOR EACH ROW EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `anomaly` | `anomaly_belongs` | `AFTER INSERT ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_belongs()` | an anomaly is of a pricing run of its practice |
| `anomaly` | `anomaly_never_deleted` | `BEFORE DELETE ON anomaly FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` | % rows are never deleted: triage, cases and reports keep what they recorded |
| `anomaly` | `anomaly_no_truncate` | `BEFORE TRUNCATE ON anomaly FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` | % cannot be truncated: triage, cases and reports keep what they recorded |
| `anomaly` | `anomaly_rules` | `BEFORE INSERT OR UPDATE ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_rules()` | an anomaly is recorded unreviewed<br>an anomaly's cohort and statistics never change<br>an anomaly is marked reviewed once, by a person who works anomalies, in their own name<br>an anomaly's review time is the time it was marked reviewed<br>an anomaly is converted to a validation request once, by a person who works anomalies, in their own name<br>an anomaly's validation request time is the time it was requested |
| `audit_event` | `audit_event_append_only` | `BEFORE DELETE OR UPDATE ON audit_event FOR EACH ROW EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `audit_event` | `audit_event_no_truncate` | `BEFORE TRUNCATE ON audit_event FOR EACH STATEMENT EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `audit_report` | `audit_report_belongs` | `AFTER INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_belongs()` | an audit report is of a pricing run of its practice<br>an audit report is of the pricing run in effect for its period: never a re-run nobody has accepted, nor a run since replaced |
| `audit_report` | `audit_report_never_deleted` | `BEFORE DELETE ON audit_report FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` | % rows are never deleted: triage, cases and reports keep what they recorded |
| `audit_report` | `audit_report_no_truncate` | `BEFORE TRUNCATE ON audit_report FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` | % cannot be truncated: triage, cases and reports keep what they recorded |
| `audit_report` | `audit_report_refused_while_suspended` | `BEFORE INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` | % |
| `audit_report` | `audit_report_rules` | `BEFORE INSERT OR UPDATE ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_rules()` | an audit report is requested queued<br>an audit report's practice, run and requester never change<br>only the report job generates an audit report<br>an audit report is generated before it is attested or released<br>an audit report is generated only while its pricing run is the run in effect for its period<br>an audit report's numbers and files never change once generated; a new report is generated instead<br>a ready audit report is attested once<br>an audit report is attested by a reimbursement reviewer, in their own name<br>an attestation names the SHA-256 of the report's files it was signed over<br>an attestation's time is the time it was signed<br>an audit report is released once<br>an audit report cannot be released before a reimbursement reviewer signs its attestation<br>an audit report is released by a person who works cases, in their own name<br>a release's time is the time it was released |
| `audit_report_download` | `audit_report_download_belongs` | `AFTER INSERT ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_belongs()` | a download is of a report of its practice |
| `audit_report_download` | `audit_report_download_never_deleted` | `BEFORE DELETE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` | % rows are never deleted: triage, cases and reports keep what they recorded |
| `audit_report_download` | `audit_report_download_no_truncate` | `BEFORE TRUNCATE ON audit_report_download FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` | % cannot be truncated: triage, cases and reports keep what they recorded |
| `audit_report_download` | `audit_report_download_rules` | `BEFORE INSERT OR UPDATE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_rules()` | a download record never changes |
| `billing_event` | `billing_event_kept` | `BEFORE DELETE OR UPDATE ON billing_event FOR EACH ROW EXECUTE FUNCTION billing_records_kept()` | % rows are kept<br>a usage snapshot never changes<br>a billing event is recorded once; only its outcome follows |
| `billing_event` | `billing_event_no_truncate` | `BEFORE TRUNCATE ON billing_event FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` | % rows are kept<br>a usage snapshot never changes<br>a billing event is recorded once; only its outcome follows |
| `case` | `case_belongs` | `AFTER INSERT ON "case" FOR EACH ROW EXECUTE FUNCTION case_belongs()` | a case is of a plan of its payer and practice<br>a case's rate record is of its practice |
| `case` | `case_never_deleted` | `BEFORE DELETE ON "case" FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` | % rows are never deleted: triage, cases and reports keep what they recorded |
| `case` | `case_no_truncate` | `BEFORE TRUNCATE ON "case" FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` | % cannot be truncated: triage, cases and reports keep what they recorded |
| `case` | `case_rules` | `BEFORE INSERT OR UPDATE ON "case" FOR EACH ROW EXECUTE FUNCTION case_rules()` | a case's pattern, payer, plan, rate record, materiality and pursuit estimate never change |
| `case_activity` | `case_activity_belongs` | `AFTER INSERT ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_belongs()` | a case's activity is a person's, in their own name<br>notes and assignments are a case worker's; an approval request a packet drafter's<br>a case's activity is of a case of its practice<br>a case is assigned to a person who works the practice's cases now<br>approval is requested of a version of the case's packet<br>approval is requested of the packet's current version, unapproved, once the verifier passes it |
| `case_activity` | `case_activity_no_truncate` | `BEFORE TRUNCATE ON case_activity FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` | % cannot be truncated: triage, cases and reports keep what they recorded |
| `case_activity` | `case_activity_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_rules()` | a case's activity never changes and is never deleted; a later note or assignment is a new row |
| `case_activity` | `case_activity_sets_owner` | `AFTER INSERT ON case_activity FOR EACH ROW WHEN (new.kind = 'assigned'::text) EXECUTE FUNCTION case_activity_sets_owner()` |  |
| `case_line` | `case_line_belongs` | `AFTER INSERT ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_belongs()` | a case line joins a case of its practice<br>a case line is a priced line of its own service line and practice<br>a case line joins its case written off only by triage, because its window has passed |
| `case_line` | `case_line_never_deleted` | `BEFORE DELETE ON case_line FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` | % rows are never deleted: triage, cases and reports keep what they recorded |
| `case_line` | `case_line_no_truncate` | `BEFORE TRUNCATE ON case_line FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` | % cannot be truncated: triage, cases and reports keep what they recorded |
| `case_line` | `case_line_refresh_inserted` | `AFTER INSERT ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases()` |  |
| `case_line` | `case_line_refresh_updated` | `AFTER UPDATE ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases()` |  |
| `case_line` | `case_line_rules` | `BEFORE INSERT OR UPDATE ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_rules()` | a case line joins its case actionable, or struck through because its window passed<br>a case line's case, service line and priced line never change<br>triage writes off only a line whose window has passed; a person writes off in their own name<br>a line is written off by a person who works cases, in their own name<br>a write-off changes nothing of the line's last reopen<br>a reopen clears the whole write-off<br>a written-off line is reopened by a person who works cases, in their own name<br>a reopen says why, in its own words<br>a line past its window cannot be actionable, so it is not reopened<br>a case line changes only by a write-off or a reopen |
| `claim` | `claim_references_in_practice` | `BEFORE INSERT OR UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION claim_references_in_practice()` | a reversal's link to the claim it reverses never changes once set<br>a claim's superseding correction never changes once set<br>a claim belongs to a remittance of the same practice<br>a claim names patient references of the same practice<br>a reversal reverses a claim of the same practice that is not itself a reversal<br>a claim is superseded by a corrected claim of the same practice |
| `compliance_record` | `compliance_record_append_only` | `BEFORE DELETE OR UPDATE ON compliance_record FOR EACH ROW EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `compliance_record` | `compliance_record_rules` | `BEFORE INSERT ON compliance_record FOR EACH ROW EXECUTE FUNCTION compliance_record_rules()` | evidence is recorded for what has happened |
| `contract` | `contract_rules` | `BEFORE INSERT OR UPDATE ON contract FOR EACH ROW EXECUTE FUNCTION contract_rules()` | a contract's practice and payer never change<br>a contract belongs to a payer of the same practice |
| `contract_calendar_event` | `contract_calendar_event_rules` | `BEFORE INSERT OR UPDATE ON contract_calendar_event FOR EACH ROW EXECUTE FUNCTION contract_calendar_event_rules()` | a calendar event never changes; signing off a new version derives new events<br>a calendar event belongs to a contract of the same practice |
| `contract_question` | `contract_question_rules` | `BEFORE INSERT OR UPDATE ON contract_question FOR EACH ROW EXECUTE FUNCTION contract_question_rules()` | a question is asked open, without an answer<br>a question is about a contract of the same practice<br>a question names a version of its contract<br>a question names a contract, exhibit or payer-letter document of the same practice<br>a question never changes; it is answered or withdrawn<br>an answered or withdrawn question never changes<br>a question changes only when it is answered or withdrawn<br>closing a question records who closed it and when |
| `contract_version` | `contract_version_retired_by_signed_successor` | `AFTER UPDATE ON contract_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((old.status = ANY (ARRAY['approved'::text, 'signed_off'::text])) AND (new.status = 'superseded'::text OR new.effective_to IS DISTINCT FROM old.effective_to)) EXECUTE FUNCTION contract_version_retired_by_signed_successor()` | a contract version is closed or superseded only by the sign-off of its successor |
| `contract_version` | `contract_version_rules` | `BEFORE INSERT OR UPDATE ON contract_version FOR EACH ROW EXECUTE FUNCTION contract_version_rules()` | a contract version starts as a draft<br>a contract version belongs to a contract of the same practice<br>a contract version's contract and number never change<br>a draft is approved by moving it to approved<br>a proposal carries at least one rate record<br>only a contract specialist approves a contract version<br>an approval records the approving specialist and the time<br>a version is approved as it stands; edit it first, then approve it<br>an approved version names the documents it is abstracted from<br>a version is approved once each of its rate records is verified, and it has at least one<br>every rate record's evidence is a document of its version<br>a contract version moves draft, proposed, approved, signed off, superseded, in that order<br>a version's documents are clean contract, exhibit or payer-letter documents of its practice, each named once<br>only a practice administrator or billing manager signs off a contract version<br>a sign-off records the signing user and the time and changes nothing else<br>the version a successor names is an approved or signed-off version of the same contract<br>only a successor's sign-off retires a contract version<br>a signed-off version never changes: an amendment closes its window at the amendment's start, and a correction supersedes it<br>an approved or signed-off contract version never changes; supersede it with a new version<br>a successor names an approved or signed-off version of the same contract |
| `digest` | `digest_refused_while_suspended` | `BEFORE INSERT ON digest FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` | % |
| `digest` | `digest_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON digest FOR EACH ROW EXECUTE FUNCTION digest_rules()` | a digest is never deleted<br>a digest is recorded before it is sent<br>a digest's figures never change once recorded<br>a digest is sent once<br>a digest records the time it was sent |
| `eft_row` | `eft_row_belongs` | `BEFORE INSERT ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs()` | an export row is read from its export by the reconcile job, never written by a person<br>an export row is a row of an export of its practice<br>a posting row is a row of a posting export, and an EFT row of an EFT export<br>an export row is read from an export stored with a clean malware scan, before it is loaded<br>an export row of a zip entry is read only when its zip's malware scan is clean |
| `eft_row` | `eft_row_never_changed` | `BEFORE DELETE OR UPDATE ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed()` | % rows are never changed or deleted: the ledger is append-only and a correction is a new entry |
| `eft_row` | `eft_row_no_truncate` | `BEFORE TRUNCATE ON eft_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` | % cannot be truncated: the ledger keeps what it recorded |
| `eval_example` | `eval_example_no_truncate` | `BEFORE TRUNCATE ON eval_example FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()` | % cannot be truncated: the gateway's records are kept |
| `eval_example` | `eval_example_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON eval_example FOR EACH ROW EXECUTE FUNCTION eval_example_rules()` | an evaluation example is never changed or deleted<br>a permitted evaluation example rests on the practice's signed data-rights agreement |
| `grant` | `grant_rules` | `BEFORE INSERT OR UPDATE ON "grant" FOR EACH ROW EXECUTE FUNCTION grant_rules()` | a grant goes to a practice group or a firm; internal access is a support grant<br>a grant is approved by a current practice administrator of its practice<br>a grant rests on a BAA or engagement letter of the grantee, or of the practice's group naming the practice<br>a grant is revoked by a current practice administrator of its practice<br>a grant never changes after approval; revoke it and approve a new one<br>a grant is revoked once |
| `grant` | `grant_security_events` | `AFTER INSERT OR UPDATE OF revoked_at ON "grant" FOR EACH ROW EXECUTE FUNCTION grant_security_events()` |  |
| `invitation` | `invitation_rules` | `BEFORE UPDATE ON invitation FOR EACH ROW EXECUTE FUNCTION invitation_rules()` | an invitation names its organization, membership, user and inviter for good<br>an accepted invitation stays accepted |
| `invoice` | `invoice_no_truncate` | `BEFORE TRUNCATE ON invoice FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` | % rows are kept<br>a usage snapshot never changes<br>a billing event is recorded once; only its outcome follows |
| `invoice` | `invoice_rules` | `BEFORE DELETE OR UPDATE ON invoice FOR EACH ROW EXECUTE FUNCTION invoice_rules()` | an invoice is kept<br>an invoice belongs to its organization and Stripe invoice for good<br>an invoice's status moves forward only<br>an invoice's first failed payment moves earlier only |
| `ledger_entry` | `ledger_entry_no_truncate` | `BEFORE TRUNCATE ON ledger_entry FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` | % cannot be truncated: the ledger keeps what it recorded |
| `ledger_entry` | `ledger_entry_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_rules()` | a ledger entry is never changed or deleted; a correction is a new entry<br>a specialist corrects an amount after review, in their own name, with the ledger adjustment permission<br>a person writes a ledger entry in their own name, with the reconciliation permission<br>the reconcile job writes ledger entries in no one's name<br>a ledger entry is of a case of its practice<br>a ledger entry of a line is of a line of its case<br>a correction names an entry of a counted stage, or a reversal an adjustment<br>a correction is of its entry's case, line and match<br>a correction is of an entry whose match stands; a reversed match's entries are never corrected again<br>a reversal offsets its entry exactly<br>a person reverses or adjusts an entry, with a reason<br>a correction is never allocated<br>an approval from a payer response is of a recorded response, with no match<br>an approval from a payer response is of a response accepting an amount for its case<br>an entry comes from a standing match<br>an entry carries its match's evidence, for its match's line<br>a % entry comes from a match of its kind<br>an entry is allocated when its match is |
| `ledger_entry` | `ledger_entry_within_evidence` | `BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_evidence()` | the posted or deposited entries of a posting or EFT row never sum past the row's amount<br>the posted or deposited entries of a posting or EFT row, their corrections included, never net below zero<br>a line-level posting posts only the lines of its row's code and date of service |
| `ledger_entry` | `ledger_entry_within_line` | `BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_line()` | a line's posted and deposited never exceed what was approved for it<br>an adjustment keeps its entry between zero and what the entry's evidence shows |
| `ledger_match` | `ledger_match_no_truncate` | `BEFORE TRUNCATE ON ledger_match FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` | % cannot be truncated: the ledger keeps what it recorded |
| `ledger_match` | `ledger_match_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON ledger_match FOR EACH ROW EXECUTE FUNCTION ledger_match_rules()` | a match is never deleted; it is reversed<br>a match never changes; it is reversed<br>a match is reversed once<br>a match is reversed by a person who reconciles postings, in their own name, with a reason<br>a match is recorded standing<br>a person who reconciles postings matches by hand, in their own name<br>the reconcile job matches in no one's name<br>a match is to a loaded remittance of its practice<br>a match is to a service line of its practice<br>a claim match is of a claim of its remittance, never a reversal<br>a posting match is of a posting row of its practice, and a line-level one of a claim of its remittance<br>a deposit match is of an EFT row of its practice<br>a recoupment is a PLB WO or a reversing claim of its remittance<br>interest is a PLB L6 or a claim's interest of its remittance |
| `line_note` | `line_note_references_in_practice` | `BEFORE INSERT ON line_note FOR EACH ROW EXECUTE FUNCTION line_note_references_in_practice()` | a note belongs to a service line of the same practice |
| `line_status` | `line_status_belongs` | `AFTER INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_belongs()` | a stage is set in its setter's own name<br>a stage is set on a service line of its practice<br>a stage is judged from a priced line of its own service line |
| `line_status` | `line_status_ledger_rules` | `BEFORE INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_ledger_rules()` | the ledger holds no entries that put the line at %: nothing counts as recovered without a posted or deposited entry<br>the ledger moves a line back only to the stage its entries leave it at |
| `line_status` | `line_status_never_deleted` | `BEFORE DELETE ON line_status FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` | % rows are never deleted: triage, cases and reports keep what they recorded |
| `line_status` | `line_status_no_truncate` | `BEFORE TRUNCATE ON line_status FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` | % cannot be truncated: triage, cases and reports keep what they recorded |
| `line_status` | `line_status_refresh_cases` | `AFTER INSERT ON line_status REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION line_status_refresh_cases()` |  |
| `line_status` | `line_status_rules` | `BEFORE INSERT OR UPDATE ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_rules()` | a line's stage events never change; a reopen is a new event<br>line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason<br>a reopen names the stage the line is at<br>a reopen keeps the line at its stage or moves it back; moving forward is not a reopen<br>a reopen is a person's explicit action |
| `membership` | `membership_invitation` | `AFTER INSERT ON membership FOR EACH ROW EXECUTE FUNCTION membership_invitation()` |  |
| `membership` | `membership_keeps_practice_administrator` | `AFTER DELETE OR UPDATE ON membership DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION membership_keeps_practice_administrator()` |  |
| `membership` | `membership_role_fits_organization` | `BEFORE INSERT OR UPDATE OF organization_id, role ON membership FOR EACH ROW EXECUTE FUNCTION membership_role_fits_organization()` | role % does not belong in a % organization |
| `membership` | `membership_rules` | `BEFORE INSERT OR UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION membership_rules()` | an ended membership never changes; invite the user again<br>nobody grants themselves a membership or changes their own role |
| `membership` | `membership_security_events` | `AFTER INSERT OR UPDATE OF role ON membership FOR EACH ROW EXECUTE FUNCTION membership_security_events()` |  |
| `model_call` | `model_call_no_truncate` | `BEFORE TRUNCATE ON model_call FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()` | % cannot be truncated: the gateway's records are kept |
| `model_call` | `model_call_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON model_call FOR EACH ROW EXECUTE FUNCTION model_call_rules()` | a model call is kept: its log row is never deleted<br>a model call is logged unreviewed; the reviewer's decision comes later<br>a model call is logged in the name of the transaction's actor<br>a model call never changes; only the reviewer's decision is recorded, once<br>the reviewer's decision is recorded by a person who may review the call's purpose in its practice |
| `model_proposal` | `model_proposal_no_truncate` | `BEFORE TRUNCATE ON model_proposal FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()` | % cannot be truncated: the gateway's records are kept |
| `model_proposal` | `model_proposal_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON model_proposal FOR EACH ROW EXECUTE FUNCTION model_proposal_rules()` | a model proposal is kept: it is never deleted<br>a model proposal is written unreviewed<br>a model proposal is written by the person who asked for it<br>a model proposal names a completed, unreviewed call its writer made in the practice for its purpose<br>a model proposal never changes; its review and its example are recorded once<br>a proposal is reviewed once the reviewer's decision is recorded on its model call<br>a proposal's example is a permitted example of its own practice and purpose |
| `notification` | `notification_rules` | `BEFORE DELETE OR UPDATE ON notification FOR EACH ROW EXECUTE FUNCTION notification_rules()` | a notification is never deleted<br>a notification never changes; only when it was read is recorded<br>a notification is read once<br>a notification records the time it was read |
| `organization` | `organization_kind_fixed` | `BEFORE UPDATE OF kind ON organization FOR EACH ROW EXECUTE FUNCTION organization_kind_fixed()` | organization kind is fixed at creation |
| `packet` | `packet_belongs` | `AFTER INSERT ON packet FOR EACH ROW EXECUTE FUNCTION packet_belongs()` | a packet is opened by a person who drafts packets<br>a packet is of a case of its practice that is not closed |
| `packet` | `packet_never_deleted` | `BEFORE DELETE ON packet FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` | % rows are never deleted: packets, submissions and responses keep what they recorded |
| `packet` | `packet_no_truncate` | `BEFORE TRUNCATE ON packet FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` | % cannot be truncated: packets, submissions and responses keep what they recorded |
| `packet` | `packet_rules` | `BEFORE INSERT OR UPDATE ON packet FOR EACH ROW EXECUTE FUNCTION packet_rules()` | a packet is opened with no version; writing one makes it current<br>a packet's case never changes<br>a packet's current version is the version written last |
| `packet_version` | `packet_version_becomes_current` | `AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_becomes_current()` |  |
| `packet_version` | `packet_version_belongs` | `AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_belongs()` | a packet version is written by a person who drafts packets, in their own name<br>a packet version is of a packet of its practice<br>a packet version is numbered after the last one<br>a packet of a case closed written off takes no new version<br>a packet version asks for exactly its case's lines not written off, at their priced amounts<br>a packet version is of the case's dispute level |
| `packet_version` | `packet_version_current_verifier` | `BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_current_verifier()` | a packet version is approved only once the current verifier has passed it; write the version again |
| `packet_version` | `packet_version_export_refused_while_suspended` | `BEFORE UPDATE OF exported_at ON packet_version FOR EACH ROW WHEN (old.exported_at IS NULL AND new.exported_at IS NOT NULL) EXECUTE FUNCTION refuse_new_work_while_suspended()` | % |
| `packet_version` | `packet_version_never_deleted` | `BEFORE DELETE ON packet_version FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` | % rows are never deleted: packets, submissions and responses keep what they recorded |
| `packet_version` | `packet_version_no_truncate` | `BEFORE TRUNCATE ON packet_version FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` | % cannot be truncated: packets, submissions and responses keep what they recorded |
| `packet_version` | `packet_version_rules` | `BEFORE INSERT OR UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_rules()` | a packet version is written unapproved and unexported<br>a packet version never changes once written; an edit is a new version<br>a regulation citation is confirmed once, before approval<br>a regulation's application to a case is confirmed by a contract specialist, in their own name<br>a packet version is approved once, and an approval is never withdrawn; an edit is a new version<br>a packet version the verifier failed cannot be approved<br>a packet is approved by a person who approves packets, in their own name<br>only a packet's current version is approved<br>an approval names the hash of the version it approves<br>a contract specialist confirms the regulation applies to the case before its packet is approved<br>the case's lines have changed since this version was written; a new version is written first<br>the person who drafted or last edited a packet cannot approve it<br>with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written<br>a packet version is exported once<br>only the export job exports a packet<br>exporting a packet needs an approved version<br>only a packet's current version, still asking for its case's lines, is exported |
| `parse_report` | `parse_report_references_in_practice` | `BEFORE INSERT ON parse_report FOR EACH ROW EXECUTE FUNCTION parse_report_references_in_practice()` | a parse report belongs to a document of the same practice |
| `payer_plan_mapping` | `payer_plan_mapping_rules` | `BEFORE INSERT OR UPDATE ON payer_plan_mapping FOR EACH ROW EXECUTE FUNCTION payer_plan_mapping_rules()` | a mapping never changes; correct it with a new mapping that supersedes it<br>a mapping maps a plan of the same practice<br>a mapping names a contract version of the same practice<br>a correction supersedes a mapping of the same plan<br>mappings of one plan never overlap: correct the mapping in force with a mapping that supersedes it |
| `payer_response` | `payer_response_belongs` | `AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_belongs()` | a payer response is recorded by a person who logs submissions, in their own name<br>a job records a response in no one's name<br>a payer response is to a submission of its practice<br>a payer response answers its case's latest submission<br>a payer response is received from its submission to today<br>a payer response is received on or after the submission's last one<br>a payer response's document is a document of its practice<br>a payer response's remittance is a loaded remittance of its practice |
| `payer_response` | `payer_response_never_deleted` | `BEFORE DELETE ON payer_response FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` | % rows are never deleted: packets, submissions and responses keep what they recorded |
| `payer_response` | `payer_response_no_truncate` | `BEFORE TRUNCATE ON payer_response FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` | % cannot be truncated: packets, submissions and responses keep what they recorded |
| `payer_response` | `payer_response_refresh_case` | `AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_refresh_case()` |  |
| `payer_response` | `payer_response_rules` | `BEFORE INSERT OR UPDATE ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_rules()` | a payer response never changes once recorded<br>no next dispute window is known for this case, so the denial cannot reopen it<br>the next dispute window has closed, so the denial cannot reopen the case |
| `payer_response` | `payer_response_within_asked` | `BEFORE INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_within_asked()` | a payer response accepts at most what its submission asked: the lines' variance and the interest line |
| `plan` | `plan_payer_of_practice` | `BEFORE INSERT OR UPDATE OF payer_id, practice_id ON plan FOR EACH ROW EXECUTE FUNCTION plan_payer_of_practice()` | a plan belongs to a payer of the same practice |
| `posting_row` | `posting_row_belongs` | `BEFORE INSERT ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs()` | an export row is read from its export by the reconcile job, never written by a person<br>an export row is a row of an export of its practice<br>a posting row is a row of a posting export, and an EFT row of an EFT export<br>an export row is read from an export stored with a clean malware scan, before it is loaded<br>an export row of a zip entry is read only when its zip's malware scan is clean |
| `posting_row` | `posting_row_never_changed` | `BEFORE DELETE OR UPDATE ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed()` | % rows are never changed or deleted: the ledger is append-only and a correction is a new entry |
| `posting_row` | `posting_row_no_truncate` | `BEFORE TRUNCATE ON posting_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` | % cannot be truncated: the ledger keeps what it recorded |
| `practice` | `practice_deleted_at` | `BEFORE UPDATE ON practice FOR EACH ROW EXECUTE FUNCTION practice_deleted_at()` | a practice's deletion time is the database's, set once |
| `practice` | `practice_has_administrator` | `AFTER INSERT OR UPDATE OF organization_id, status ON practice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_has_administrator()` | invite the practice group's administrator before creating or moving its practice: a practice always has an administrator |
| `practice` | `practice_has_owner` | `BEFORE INSERT OR UPDATE OF organization_id, status ON practice FOR EACH ROW EXECUTE FUNCTION practice_has_owner()` | a practice is owned by a practice group until it is deleted |
| `practice` | `practice_keeps_administrator` | `AFTER UPDATE OF organization_id ON practice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_keeps_administrator()` | a practice must always keep at least one practice administrator |
| `practice` | `practice_owned_by_group` | `BEFORE INSERT OR UPDATE OF organization_id ON practice FOR EACH ROW EXECUTE FUNCTION practice_owned_by_group()` | a practice is owned by a practice group |
| `priced_line` | `priced_line_immutable` | `BEFORE DELETE OR UPDATE ON priced_line FOR EACH ROW EXECUTE FUNCTION priced_line_immutable()` | a priced line never changes; a new run prices the line again |
| `priced_line` | `priced_line_no_truncate` | `BEFORE TRUNCATE ON priced_line FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate()` | % cannot be truncated: pricing runs and their lines are kept as they were priced |
| `priced_line` | `priced_line_rows_belong` | `AFTER INSERT ON priced_line REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION priced_line_rows_belong()` | a priced line joins an open pricing run of its practice; a complete run never changes<br>a priced line prices a service line under a mapping, version and rate record of its own practice |
| `pricing_run` | `pricing_run_no_truncate` | `BEFORE TRUNCATE ON pricing_run FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate()` | % cannot be truncated: pricing runs and their lines are kept as they were priced |
| `pricing_run` | `pricing_run_refused_while_suspended` | `BEFORE INSERT ON pricing_run FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` | % |
| `pricing_run` | `pricing_run_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON pricing_run FOR EACH ROW EXECUTE FUNCTION pricing_run_rules()` | a pricing run is never deleted<br>a pricing run starts queued<br>rule-release mismatch: a pricing run pins the newest published rule release<br>a re-run prices a complete run of its own practice again<br>a re-run prices the period and the lines of the run it prices again<br>a pricing run's practice, period, release, engine, creator and the run it prices again never change<br>a re-run is accepted by the person acting, when they accept it<br>a re-run pinned to a withdrawn rule release is never accepted; re-run it under the release in force<br>a pricing run never changes once it is complete or failed; a new release or mapping means a new run<br>only a complete re-run is accepted<br>an open pricing run records its coverage when it completes and its failure when it fails<br>a pricing run's completion records the time it completed<br>a complete pricing run's coverage counts exactly the lines it priced<br>a failed pricing run holds no priced lines<br>a pricing run moves queued, running, then complete or failed |
| `prospect_request` | `prospect_request_fixed` | `BEFORE UPDATE ON prospect_request FOR EACH ROW EXECUTE FUNCTION prospect_request_fixed()` | a prospect request is kept as it was received<br>a converted request names its organization for good |
| `provider_adjustment` | `provider_adjustment_references_in_practice` | `BEFORE INSERT ON provider_adjustment FOR EACH ROW EXECUTE FUNCTION provider_adjustment_references_in_practice()` | a provider adjustment belongs to a remittance of the same practice |
| `rate_record` | `rate_record_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON rate_record FOR EACH ROW EXECUTE FUNCTION rate_record_rules()` | a rate record's version and origin never change<br>a rate record belongs to a contract version of the same practice<br>the rate records of an approved or signed-off version never change; supersede the version<br>evidence.approved_fields is an object of field approvals<br>a rate record is verified after it is written, field by field<br>a field approval names one of the rate record's fields<br>only a contract specialist approves a rate record's fields<br>a field approval records the approving specialist and the time<br>only a contract specialist verifies a rate record<br>a verification records the verifying specialist and the time<br>a rate record is verified once each of its fields is approved<br>a rate record cannot be approved without evidence naming a document, a page, a quote and a hash<br>a rate record's evidence is a document of its version<br>a verification is recorded once |
| `remittance` | `remittance_references_in_practice` | `BEFORE INSERT ON remittance FOR EACH ROW EXECUTE FUNCTION remittance_references_in_practice()` | a remittance comes from an 835 document of the same practice<br>a remittance names a payer of the same practice<br>a remittance is reviewed against a remittance of the same practice |
| `report_document` | `report_document_belongs` | `AFTER INSERT ON report_document FOR EACH ROW EXECUTE FUNCTION report_document_belongs()` | a coverage report reads a pricing run of its practice |
| `report_document` | `report_document_no_truncate` | `BEFORE TRUNCATE ON report_document FOR EACH STATEMENT EXECUTE FUNCTION report_document_no_truncate()` | report_document cannot be truncated: a generated report keeps its figures |
| `report_document` | `report_document_refused_while_suspended` | `BEFORE INSERT ON report_document FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` | % |
| `report_document` | `report_document_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON report_document FOR EACH ROW EXECUTE FUNCTION report_document_rules()` | a report document keeps its figures; a new one is generated<br>a report document is printed after it is generated<br>a report document is generated by a person who works the practice's cases, in their own name<br>a report document keeps its figures; only its printed PDF, or the print's failure, is recorded, once<br>the print job records the printed PDF, in no one's name<br>a report document's PDF is stored under its own practice and document<br>a failed print records no PDF |
| `restore_drill` | `restore_drill_append_only` | `BEFORE DELETE OR UPDATE ON restore_drill FOR EACH ROW EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `restore_drill` | `restore_drill_no_truncate` | `BEFORE TRUNCATE ON restore_drill FOR EACH STATEMENT EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `roi_statement` | `roi_statement_no_truncate` | `BEFORE TRUNCATE ON roi_statement FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` | % cannot be truncated: the ledger keeps what it recorded |
| `roi_statement` | `roi_statement_refused_while_suspended` | `BEFORE INSERT ON roi_statement FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` | % |
| `roi_statement` | `roi_statement_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON roi_statement FOR EACH ROW EXECUTE FUNCTION roi_statement_rules()` | an ROI statement keeps its figures; a new one is generated<br>an ROI statement keeps its figures; only its printed PDF is recorded, once<br>the statement job records the printed PDF, in no one's name<br>a statement's PDF is stored under its own practice and statement<br>a statement is printed after it is written<br>an ROI statement is generated on demand by a person who reconciles postings, in their own name<br>the quarterly statement is generated in no one's name<br>an ROI statement's recovered and interest are the sums of the entries it links |
| `rule_record` | `rule_record_immutable` | `BEFORE INSERT OR DELETE OR UPDATE ON rule_record FOR EACH ROW EXECUTE FUNCTION rule_record_immutable()` | rule_release % is published: no record can be added to it<br>rule_record rows are immutable: a published release never changes; load a new release instead |
| `rule_record` | `rule_record_no_truncate` | `BEFORE TRUNCATE ON rule_record FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()` | % cannot be truncated: rule releases are immutable |
| `rule_release` | `rule_release_immutable` | `BEFORE DELETE OR UPDATE ON rule_release FOR EACH ROW EXECUTE FUNCTION rule_release_immutable()` | rule_release % is immutable: a published release never changes; load a new release instead |
| `rule_release` | `rule_release_no_truncate` | `BEFORE TRUNCATE ON rule_release FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()` | % cannot be truncated: rule releases are immutable |
| `rule_release_withdrawal` | `rule_release_withdrawal_no_truncate` | `BEFORE TRUNCATE ON rule_release_withdrawal FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()` | % cannot be truncated: rule releases are immutable |
| `rule_release_withdrawal` | `rule_release_withdrawal_rules` | `BEFORE INSERT OR DELETE OR UPDATE ON rule_release_withdrawal FOR EACH ROW EXECUTE FUNCTION rule_release_withdrawal_rules()` | a rule release withdrawal never changes; a correction is a new release<br>only the rule release in force is withdrawn<br>a withdrawal reinstates the newest published release before the one withdrawn<br>a withdrawal records the time it was made |
| `service_line` | `service_line_references_in_practice` | `BEFORE INSERT ON service_line FOR EACH ROW EXECUTE FUNCTION service_line_references_in_practice()` | a service line belongs to a claim of the same practice<br>a service line names a plan of the same practice |
| `source_document` | `source_document_refused_while_suspended` | `BEFORE INSERT ON source_document FOR EACH ROW WHEN (new.parent_document_id IS NULL) EXECUTE FUNCTION refuse_new_work_while_suspended()` | % |
| `source_document` | `source_document_rules` | `BEFORE INSERT OR UPDATE ON source_document FOR EACH ROW EXECUTE FUNCTION source_document_rules()` | a zip entry belongs to a top-level document of the same practice<br>a zip entry carries its zip's uploader<br>a zip entry is clean only when its zip's malware scan is<br>a document is scanned or queued for parse only when its malware scan is clean<br>a document's SHA-256 never changes once recorded<br>a scan verdict is never taken back<br>a malware finding is never cleared<br>a quarantined or duplicate document stays so |
| `status_component` | `status_component_rules` | `BEFORE UPDATE ON status_component FOR EACH ROW EXECUTE FUNCTION status_component_rules()` | a status component keeps its key, name and place |
| `status_incident` | `status_incident_opened` | `BEFORE INSERT ON status_incident FOR EACH ROW EXECUTE FUNCTION status_incident_opened()` |  |
| `status_incident_update` | `status_incident_update_append_only` | `BEFORE DELETE OR UPDATE ON status_incident_update FOR EACH ROW EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `status_incident_update` | `status_incident_update_moves` | `BEFORE INSERT ON status_incident_update FOR EACH ROW EXECUTE FUNCTION status_incident_update_moves()` | a resolved incident takes no more updates; open a new one |
| `submission` | `submission_belongs` | `AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_belongs()` | a submission is logged by a person who logs submissions, in their own name<br>a submission is of a version of its case's packet<br>a packet is submitted once it is exported<br>a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit<br>a submission carries the SHA-256 of the export it sent<br>a submission is dated from its export to today<br>a case closed written off takes no submission<br>a submission sends a version of the case's dispute level<br>a submission is dated on or after the case's last one<br>the payer has answered this dispute; only a denial that reopens the case starts the next level<br>the next dispute level is submitted within its window |
| `submission` | `submission_never_deleted` | `BEFORE DELETE ON submission FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` | % rows are never deleted: packets, submissions and responses keep what they recorded |
| `submission` | `submission_no_truncate` | `BEFORE TRUNCATE ON submission FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` | % cannot be truncated: packets, submissions and responses keep what they recorded |
| `submission` | `submission_refresh_case` | `AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_refresh_case()` |  |
| `submission` | `submission_rules` | `BEFORE INSERT OR UPDATE ON submission FOR EACH ROW EXECUTE FUNCTION submission_rules()` | a submission never changes once logged |
| `subscription` | `subscription_no_truncate` | `BEFORE TRUNCATE ON subscription FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` | % rows are kept<br>a usage snapshot never changes<br>a billing event is recorded once; only its outcome follows |
| `subscription` | `subscription_rules` | `BEFORE DELETE OR UPDATE ON subscription FOR EACH ROW EXECUTE FUNCTION subscription_rules()` | a subscription is kept<br>a subscription belongs to its organization and Stripe subscription for good |
| `subscription_claim` | `subscription_claim_no_truncate` | `BEFORE TRUNCATE ON subscription_claim FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` | % rows are kept<br>a usage snapshot never changes<br>a billing event is recorded once; only its outcome follows |
| `subscription_claim` | `subscription_claim_rules` | `BEFORE DELETE OR UPDATE ON subscription_claim FOR EACH ROW EXECUTE FUNCTION subscription_claim_rules()` | a subscription claim is kept<br>a subscription claim moves from pending to created or failed, and from created to ended |
| `support_grant` | `support_grant_fixed` | `BEFORE UPDATE ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_fixed()` | a support grant never changes; only its closing notice is recorded, once, and it can be ended early, once |
| `support_grant` | `support_grant_grantee` | `BEFORE INSERT ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_grantee()` | nobody grants themselves support access<br>a support grant goes to a support engineer, a contract specialist or a reimbursement reviewer with a current role |
| `support_grant` | `support_grant_security_events` | `AFTER INSERT OR UPDATE OF expires_at ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_security_events()` |  |
| `support_ticket` | `support_ticket_rules` | `BEFORE INSERT OR UPDATE ON support_ticket FOR EACH ROW EXECUTE FUNCTION support_ticket_rules()` | a ticket keeps what its requester wrote |
| `terms_acceptance` | `terms_acceptance_accepted_now` | `BEFORE INSERT ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION terms_accepted_now()` |  |
| `terms_acceptance` | `terms_acceptance_append_only` | `BEFORE DELETE OR UPDATE ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `terms_version` | `terms_version_append_only` | `BEFORE DELETE OR UPDATE ON terms_version FOR EACH ROW EXECUTE FUNCTION reject_change()` | % is append-only: % is refused |
| `terms_version` | `terms_version_published_now` | `BEFORE INSERT ON terms_version FOR EACH ROW EXECUTE FUNCTION terms_published_now()` |  |
| `usage_snapshot` | `usage_snapshot_kept` | `BEFORE DELETE OR UPDATE ON usage_snapshot FOR EACH ROW EXECUTE FUNCTION billing_records_kept()` | % rows are kept<br>a usage snapshot never changes<br>a billing event is recorded once; only its outcome follows |
| `usage_snapshot` | `usage_snapshot_no_truncate` | `BEFORE TRUNCATE ON usage_snapshot FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` | % rows are kept<br>a usage snapshot never changes<br>a billing event is recorded once; only its outcome follows |
| `user` | `user_accepts_invitations` | `AFTER UPDATE OF status ON "user" FOR EACH ROW EXECUTE FUNCTION user_accepts_invitations()` |  |
| `user` | `user_guarded_columns` | `BEFORE UPDATE OF status, hardware_key_required ON "user" FOR EACH ROW EXECUTE FUNCTION user_guarded_columns()` | only a platform administrator changes a user's status or hardware-key rule |
| `user` | `user_keeps_practice_administrator` | `AFTER UPDATE OF status ON "user" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION user_keeps_practice_administrator()` |  |
| `user_device` | `user_device_revocation_is_final` | `BEFORE UPDATE OF revoked_at ON user_device FOR EACH ROW EXECUTE FUNCTION user_device_revocation_is_final()` | a revoked device stays revoked; sign in again as a new device |
| `user_device` | `user_device_security_events` | `AFTER INSERT ON user_device FOR EACH ROW EXECUTE FUNCTION user_device_security_events()` |  |
| `user_session` | `user_session_end_is_final` | `BEFORE UPDATE OF ended_at, end_reason ON user_session FOR EACH ROW EXECUTE FUNCTION user_session_end_is_final()` | an ended session stays ended; sign in again |

## Functions

| Function | Returns | Lang | Security | Volatility | search_path / config | EXECUTE granted to | Sets app.practice_ids |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `adjustment_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `allowed_practice_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `anomaly_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `anomaly_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `app_actor_admin_practice_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_administered_organization_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_administered_user_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_group_practice_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_id()` | `uuid` | sql | invoker | stable |  | tp_app |  |
| `app_actor_is_person()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_is_platform_admin()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_memberships()` | `TABLE(organization_id uuid, organization_kind text, role text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_organization_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_organization_permitted(uuid,text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_permitted(uuid,text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_platform_permitted(text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_practice_directory()` | `TABLE(practice_id uuid, name text, organization_id uuid)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `app_actor_terms_required()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `assert_membership_fits_user(uuid,uuid)` | `void` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `assert_organization_keeps_administrator(uuid)` | `void` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `audit_report_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `audit_report_download_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `audit_report_download_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `audit_report_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `billing_owner_emails(uuid)` | `TABLE(email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_billing |  |
| `billing_record_audit(text,text,uuid,text,text)` | `void` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_billing |  |
| `billing_records_kept()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `billing_usage_counts()` | `TABLE(organization_id uuid, granted_practices integer, active_practices integer)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_billing |  |
| `case_activity_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `case_activity_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `case_activity_sets_owner()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `case_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `case_latest_submission(uuid)` | `uuid` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `case_line_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `case_line_refresh_cases()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `case_line_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `case_next_dispute_window(uuid,integer,date)` | `date` | plpgsql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `case_owner_eligible(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `case_reopened_levels(uuid)` | `integer` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `case_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `claim_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `compliance_record_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `compliance_workforce()` | `TABLE(user_id uuid, email text, roles text[])` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `console_contract_queue()` | `TABLE(practice_id uuid, name text, documents_awaiting bigint, drafts bigint, proposals_awaiting bigint, awaiting_sign_off bigint, open_questions bigint, regulations_awaiting bigint, support_grant_ends_at timestamp with time zone)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes |
| `console_grants(uuid)` | `TABLE(grant_id uuid, organization_id uuid, practice_id uuid, scope jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, agreement_id uuid, approved_by_user_id uuid, revoked_at timestamp with time zone, created_at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `console_practice_settings(uuid)` | `TABLE(practice_id uuid, organization_id uuid, name text, zip text, settings jsonb)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `console_practices(uuid)` | `TABLE(practice_id uuid, organization_id uuid, name text, status text, created_at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `console_release_runs()` | `TABLE(release_no integer, practice_id uuid, name text, runs bigint, runs_in_effect bigint, reruns bigint, reruns_accepted bigint, changed_lines bigint)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes |
| `console_restore_drills(integer)` | `TABLE(started_at timestamp with time zone, completed_at timestamp with time zone, duration_ms bigint, outcome text, catalog_problems integer, error_code text)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `console_set_practice_settings(uuid,text,jsonb)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes |
| `console_support_grants()` | `TABLE(support_grant_id uuid, practice_id uuid, user_id uuid, ticket text, reason text, created_at timestamp with time zone, expires_at timestamp with time zone, notified_at timestamp with time zone, reads bigint)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `console_support_tickets(text,integer)` | `TABLE(ticket_id uuid, number bigint, requester_email text, organizations text[], screen text, category text, subject text, message text, status text, created_at timestamp with time zone, status_changed_at timestamp with time zone)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `contract_calendar_event_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `contract_question_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `contract_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `contract_version_documents_ok(contract_version)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `contract_version_retired_by(contract_version,contract_version,text)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `contract_version_retired_by_signed_successor()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `contract_version_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `current_rule_release()` | `integer` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `current_terms_version()` | `uuid` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `data_rights_permit(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app, tp_operator |  |
| `digest_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `effective_practice_access()` | `TABLE(practice_id uuid, via text, grant_id uuid, role text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `end_support_grant(uuid)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes |
| `eval_example_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `figures_are_cents(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `figures_are_counts(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `grant_rules()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `grant_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `invitation_expired(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `invitation_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `invoice_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_entry_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_entry_within_evidence()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_entry_within_line()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_export_row_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_line_net(uuid,text)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `ledger_line_stage(uuid)` | `text` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `ledger_match_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_never_changed()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `ledger_proof_level(uuid)` | `text` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `line_note_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `line_stage_rank(text)` | `integer` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `line_status_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `line_status_ledger_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `line_status_refresh_cases()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `line_status_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `maintenance_on()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `membership_invitation()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `membership_keeps_practice_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `membership_role_fits_organization()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `membership_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `membership_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `model_call_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `model_citations_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  |
| `model_field_paths_valid(text[])` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  |
| `model_hashes_valid(text[])` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  |
| `model_proposal_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `model_records_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `model_review_permission(text)` | `text` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  |
| `monitoring_figure_codes(text)` | `text[]` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `monitoring_figure_valid(jsonb,text)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `monitoring_figures_valid(jsonb,text)` | `boolean` | plpgsql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `notification_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `open_practice_scope(uuid[])` | `TABLE(practice_id uuid, via text, grant_id uuid, role text)` | plpgsql | invoker | volatile |  | tp_app | yes |
| `operator_active_practice_ids()` | `SETOF uuid` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  |
| `operator_assert_scope(uuid)` | `void` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `operator_due_support_notices(integer)` | `TABLE(support_grant_id uuid, practice_id uuid, notice text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  |
| `operator_practice_administrator_emails(uuid)` | `TABLE(email text)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  |
| `operator_record_support_notice(uuid,text,text)` | `TABLE(recorded boolean, reads bigint)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  |
| `organization_administrator_count(uuid)` | `bigint` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `organization_kind_fixed()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `organization_kind_of(uuid)` | `text` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `organization_run_refusal(uuid)` | `text` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packet_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packet_content_valid(jsonb)` | `boolean` | plpgsql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `packet_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packet_verifier_report_valid(jsonb)` | `boolean` | plpgsql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `packet_version_becomes_current()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packet_version_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packet_version_current_verifier()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packet_version_matches_case(uuid,jsonb)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `packet_version_people(uuid)` | `TABLE(drafted_by_email text, approved_by_email text, regulation_confirmed_by_email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `packet_version_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packets_never_deleted()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `packets_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `parse_report_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `payer_plan_mapping_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `payer_response_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `payer_response_refresh_case()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `payer_response_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `payer_response_within_asked()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `person_practice_roles(uuid,uuid)` | `text[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `plan_payer_of_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `practice_access_log(uuid,text,uuid,timestamp with time zone,integer)` | `TABLE(event_id uuid, at timestamp with time zone, actor_label text, via text, action text, object_type text, object_id uuid, purpose text, ticket text)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_administrator_count(uuid)` | `bigint` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `practice_baa_on_file(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_case_workers(uuid)` | `TABLE(user_id uuid, email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_data_rights_agreement(uuid)` | `uuid` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_deleted_at()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `practice_export_count(uuid)` | `integer` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_export_history(uuid,integer,integer)` | `TABLE(event_id uuid, action text, object_type text, object_id uuid, purpose text, actor_id uuid, at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_fees_paid(uuid,date,date)` | `bigint` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_grants(uuid)` | `TABLE(grant_id uuid, grantee_name text, grantee_kind text, roles jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, revoked_at timestamp with time zone, agreement_id uuid)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_has_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `practice_has_other_packet_approver(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_has_owner()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `practice_in_scope(uuid)` | `boolean` | sql | invoker | stable |  | tp_app |  |
| `practice_keeps_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `practice_notification_recipients()` | `TABLE(user_id uuid, email text, digest_email boolean, in_app boolean)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_owned_by_group()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `practice_people_emails(uuid,uuid[])` | `TABLE(user_id uuid, email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_run_refusal(uuid)` | `text` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_set_materiality(uuid,text,text)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_set_pursuit(uuid,text,integer,integer)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `practice_setting_keys()` | `text[]` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `priced_line_immutable()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `priced_line_rows_belong()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `priced_line_shortfall_cents(uuid)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `priced_line_visit_variance_cents(uuid)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `pricing_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `pricing_run_changed_lines(uuid,uuid)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `pricing_run_in_effect(uuid)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `pricing_run_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `prospect_payers_valid(text[])` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app |  |
| `prospect_request_fixed()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `provider_adjustment_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `public_status_components()` | `TABLE(key text, name text, status text, changed_at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `public_status_incidents(timestamp with time zone)` | `TABLE(incident_id uuid, title text, impact text, components text[], status text, started_at timestamp with time zone, resolved_at timestamp with time zone, updates jsonb)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `rate_limit_take(text,text,integer,integer)` | `TABLE(allowed boolean, hits integer, retry_after_seconds integer)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `rate_record_evidence_complete(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `rate_record_fields()` | `text[]` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `rate_record_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `record_esigned_agreement(text,text,uuid,uuid,text,text,timestamp with time zone,text,text,text)` | `TABLE(agreement_id uuid, duplicate boolean)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `record_security_event(text,uuid,uuid,text)` | `void` | sql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `record_sign_in_with_mfa()` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `refuse_new_work_while_suspended()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `reject_change()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `remittance_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `report_document_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `report_document_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `report_document_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `resend_invitation(uuid)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `resolve_session(text)` | `TABLE(outcome text, ended_now boolean, session_id uuid, user_id uuid, device_id uuid, mfa_method text, started_at timestamp with time zone, expires_at timestamp with time zone, last_seen_at timestamp with time zone, user_status text, mfa_enrolled boolean, hardware_key_required boolean)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `revoke_user_sessions(uuid)` | `integer` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `roi_links_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `roi_statement_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `roles_permit(text[],text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `rule_content_no_truncate()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `rule_record_immutable()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `rule_release_immutable()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `rule_release_withdrawal_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `service_line_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `set_feature_flag(text,text,uuid,jsonb)` | `uuid` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `set_practice_posting_template(uuid,jsonb)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `set_updated_at()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `sign_in_account(text,text)` | `TABLE(user_id uuid, cognito_sub text, email text, status text, mfa_enrolled boolean, locked boolean, hardware_key_required boolean)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `sign_in_failed(uuid,text,text)` | `TABLE(failures integer, locked boolean, newly_locked boolean, burst boolean)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `sign_in_succeeded(uuid)` | `void` | sql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `source_document_rules()` | `trigger` | plpgsql | invoker | volatile |  |  |  |
| `status_component_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `status_incident_opened()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `status_incident_update_moves()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `submission_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `submission_latest_response(uuid)` | `uuid` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `submission_refresh_case()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `submission_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `submit_prospect_request(text,text,text,integer,text[],text)` | `uuid` | sql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `subscription_claim_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `subscription_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `support_grant_fixed()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `support_grant_grantee()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `support_grant_role(uuid)` | `text` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `support_grant_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `support_ticket_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `terms_accepted_now()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `terms_published_now()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `triage_never_deleted()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `triage_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `unlock_user(uuid)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `user_accepts_invitations()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_device_revocation_is_final()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_device_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_guarded_columns()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_is_customer(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_is_internal(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_is_practice_admin(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_is_support_engineer(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `user_keeps_practice_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_known_elsewhere(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `user_reaches_practice_now(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `user_session_end_is_final()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  |
| `user_settings_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |
| `uuid_half(uuid,boolean)` | `int8range` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  |

## Tables

### Table `adjustment`

<a id="table-adjustment"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `adjustment_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`amount_cents`, `claim_id`, `group_code`, `id`, `position`, `practice_id`, `quantity`, `reason_code`, `service_line_id`, `unknown_code`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `claim_id` | `uuid` | NOT NULL |  | `claim(id)` |  |
| 4 | `service_line_id` | `uuid` | null |  | `service_line(id)` |  |
| 5 | `group_code` | `text` | NOT NULL |  |  |  |
| 6 | `reason_code` | `text` | NOT NULL |  |  |  |
| 7 | `unknown_code` | `boolean` | NOT NULL | `false` |  |  |
| 8 | `amount_cents` | `bigint` | NOT NULL |  |  |  |
| 9 | `quantity` | `numeric(9,3)` | null |  |  |  |
| 10 | `position` | `integer` | NOT NULL |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `adjustment_once`: `UNIQUE NULLS NOT DISTINCT (claim_id, service_line_id, "position")`

Foreign keys:
- `adjustment_claim_id_fkey`: (claim_id) -> `claim`(id) on delete no action
- `adjustment_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `adjustment_service_line_id_fkey`: (service_line_id) -> `service_line`(id) on delete no action

Check constraints:
- `adjustment_group_code_check`: `CHECK (btrim(group_code) <> ''::text)`
- `adjustment_position_check`: `CHECK ("position" >= 1)`
- `adjustment_reason_code_check`: `CHECK (btrim(reason_code) <> ''::text)`

Indexes:
- `adjustment_by_claim`: `USING btree (practice_id, claim_id)`
- `adjustment_by_line`: `USING btree (service_line_id) WHERE (service_line_id IS NOT NULL)`
- `adjustment_once` (constraint): `UNIQUE USING btree (claim_id, service_line_id, "position") NULLS NOT DISTINCT`
- `adjustment_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `adjustment_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `adjustment_references_in_practice`: `BEFORE INSERT ON adjustment FOR EACH ROW EXECUTE FUNCTION adjustment_references_in_practice()` raises: "an adjustment belongs to a claim of the same practice"; "a line-level adjustment belongs to a line of its own claim"
- `adjustment_updated_at`: `BEFORE UPDATE ON adjustment FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `agreement`

<a id="table-agreement"></a>

- Class: tenant (nullable practice_id), not PHI; owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`document_ref`, `id`, `kind`, `organization_id`, `practice_id`, `sha256`, `signed_at`, `signer`, `version`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `practice_id` | `uuid` | null |  | `practice(id)` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | one of baa, engagement, terms, data_rights, dpa |
| 5 | `version` | `text` | NOT NULL |  |  |  |
| 6 | `signed_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 7 | `signer` | `text` | NOT NULL |  |  |  |
| 8 | `document_ref` | `text` | NOT NULL |  |  |  |
| 9 | `sha256` | `text` | NOT NULL |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `agreement_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action
- `agreement_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `agreement_document_ref_check`: `CHECK (btrim(document_ref) <> ''::text)`
- `agreement_kind_check`: `CHECK (kind = ANY (ARRAY['baa'::text, 'engagement'::text, 'terms'::text, 'data_rights'::text, 'dpa'::text]))`
- `agreement_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `agreement_signer_check`: `CHECK (btrim(signer) <> ''::text)`
- `agreement_version_check`: `CHECK (btrim(version) <> ''::text)`

Indexes:
- `agreement_by_organization`: `USING btree (organization_id)`
- `agreement_by_practice`: `USING btree (practice_id)`
- `agreement_pkey` (primary): `UNIQUE USING btree (id)`

Policies (4):
- `agreement_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `agreement_parties`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((organization_id = ANY (( SELECT app_actor_organization_ids() AS app_actor_organization_ids)::uuid[])) OR (practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`
- `agreement_read_by_parties`: RESTRICTIVE FOR SELECT TO tp_app
  - USING `((organization_id = ANY (( SELECT app_actor_organization_ids() AS app_actor_organization_ids)::uuid[])) OR (practice_id = ANY (( SELECT app_actor_group_practice_ids() AS app_actor_group_practice_ids)::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`
- `agreement_recorded_by_signers`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('agreement.record'::text) AS app_actor_platform_permitted) OR (app_actor_organization_permitted(organization_id, 'agreement.sign'::text) AND ((practice_id IS NULL) OR ((practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[])) AND (EXISTS ( SELECT 1    FROM practice p   WHERE ((p.id = agreement.practice_id) AND (p.organization_id = agreement.organization_id))))))))`

Triggers:
- `agreement_updated_at`: `BEFORE UPDATE ON agreement FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `agreement_event`

<a id="table-agreement-event"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: no privilege
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `provider_event_id` | `text` | NOT NULL |  |  |  |
| 3 | `envelope_ref` | `text` | NOT NULL |  |  |  |
| 4 | `agreement_id` | `uuid` | NOT NULL |  | `agreement(id)` |  |
| 5 | `received_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `agreement_event_provider_event_id_key`: `UNIQUE (provider_event_id)`

Foreign keys:
- `agreement_event_agreement_id_fkey`: (agreement_id) -> `agreement`(id) on delete no action

Check constraints:
- `agreement_event_envelope_ref_check`: `CHECK (envelope_ref ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`
- `agreement_event_provider_event_id_check`: `CHECK (provider_event_id ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`

Indexes:
- `agreement_event_pkey` (primary): `UNIQUE USING btree (id)`
- `agreement_event_provider_event_id_key` (constraint): `UNIQUE USING btree (provider_event_id)`

Policies (1):
- `agreement_event_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Triggers:
- `agreement_event_append_only`: `BEFORE DELETE OR UPDATE ON agreement_event FOR EACH ROW EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"

### Table `anomaly`

<a id="table-anomaly"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `anomaly_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`cohort_key`, `cohort_size`, `id`, `line_ids`, `modal_allowed_cents`, `practice_id`, `pricing_run_id`, `stats`)
- Column grant: `tp_app` UPDATE (`reviewed_by`, `validation_requested_by`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `pricing_run_id` | `uuid` | NOT NULL |  | `pricing_run(id)` |  |
| 4 | `cohort_key` | `jsonb` | NOT NULL |  |  |  |
| 5 | `cohort_size` | `integer` | NOT NULL |  |  |  |
| 6 | `modal_allowed_cents` | `bigint` | NOT NULL |  |  |  |
| 7 | `stats` | `jsonb` | NOT NULL |  |  |  |
| 8 | `line_ids` | `uuid[]` | NOT NULL |  |  |  |
| 9 | `reviewed_by` | `uuid` | null |  | `user(id)` |  |
| 10 | `reviewed_at` | `timestamp with time zone` | null |  |  |  |
| 11 | `validation_requested_by` | `uuid` | null |  | `user(id)` |  |
| 12 | `validation_requested_at` | `timestamp with time zone` | null |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `anomaly_once`: `UNIQUE (pricing_run_id, cohort_key)`

Foreign keys:
- `anomaly_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `anomaly_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id) on delete no action
- `anomaly_reviewed_by_fkey`: (reviewed_by) -> `user`(id) on delete no action
- `anomaly_validation_requested_by_fkey`: (validation_requested_by) -> `user`(id) on delete no action

Check constraints:
- `anomaly_check`: `CHECK (array_position(line_ids, NULL::uuid) IS NULL AND cardinality(line_ids) <= cohort_size)`
- `anomaly_cohort_key_check`: `CHECK (jsonb_typeof(cohort_key) = 'object'::text)`
- `anomaly_cohort_size_check`: `CHECK (cohort_size >= 1)`
- `anomaly_modal_allowed_cents_check`: `CHECK (modal_allowed_cents >= 0)`
- `anomaly_reviewed_together`: `CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))`
- `anomaly_stats_check`: `CHECK (jsonb_typeof(stats) = 'object'::text)`
- `anomaly_validation_together`: `CHECK ((validation_requested_by IS NULL) = (validation_requested_at IS NULL))`

Indexes:
- `anomaly_by_run`: `USING btree (practice_id, pricing_run_id)`
- `anomaly_once` (constraint): `UNIQUE USING btree (pricing_run_id, cohort_key)`
- `anomaly_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `anomaly_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `anomaly_belongs`: `AFTER INSERT ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_belongs()` raises: "an anomaly is of a pricing run of its practice"
- `anomaly_never_deleted`: `BEFORE DELETE ON anomaly FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` raises: "% rows are never deleted: triage, cases and reports keep what they recorded"
- `anomaly_no_truncate`: `BEFORE TRUNCATE ON anomaly FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` raises: "% cannot be truncated: triage, cases and reports keep what they recorded"
- `anomaly_rules`: `BEFORE INSERT OR UPDATE ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_rules()` raises: "an anomaly is recorded unreviewed"; "an anomaly's cohort and statistics never change"; "an anomaly is marked reviewed once, by a person who works anomalies, in their own name"; "an anomaly's review time is the time it was marked reviewed"; "an anomaly is converted to a validation request once, by a person who works anomalies, in their own name"; "an anomaly's validation request time is the time it was requested"
- `anomaly_updated_at`: `BEFORE UPDATE ON anomaly FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `audit_event`

<a id="table-audit-event"></a>

- Class: tenant (nullable practice_id), not PHI; owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: SELECT
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`action`, `actor_id`, `actor_kind`, `grant_id`, `id`, `object_id`, `object_type`, `practice_id`, `purpose`, `request_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `actor_id` | `uuid` | null |  |  |  |
| 3 | `actor_kind` | `text` | NOT NULL |  |  | one of user, service, system |
| 4 | `action` | `text` | NOT NULL |  |  |  |
| 5 | `object_type` | `text` | NOT NULL |  |  |  |
| 6 | `object_id` | `uuid` | null |  |  |  |
| 7 | `practice_id` | `uuid` | null |  |  |  |
| 8 | `grant_id` | `uuid` | null |  |  |  |
| 9 | `purpose` | `text` | null |  |  |  |
| 10 | `request_id` | `text` | null |  |  |  |
| 11 | `at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Check constraints:
- `audit_event_action_check`: `CHECK (action ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `audit_event_actor`: `CHECK (actor_kind = 'system'::text OR actor_id IS NOT NULL)`
- `audit_event_actor_kind_check`: `CHECK (actor_kind = ANY (ARRAY['user'::text, 'service'::text, 'system'::text]))`
- `audit_event_object_type_check`: `CHECK (object_type ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `audit_event_purpose_check`: `CHECK (purpose ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `audit_event_read_purpose`: `CHECK (action <> 'read'::text OR purpose IS NOT NULL)`
- `audit_event_request_id_check`: `CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`

Indexes:
- `audit_event_by_at`: `USING btree (at)`
- `audit_event_by_object`: `USING btree (object_type, object_id)`
- `audit_event_by_practice`: `USING btree (practice_id, at)`
- `audit_event_pkey` (primary): `UNIQUE USING btree (id)`

Policies (5):
- `audit_event_access_log`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[])) AND (practice_id = ANY (( SELECT app_actor_admin_practice_ids() AS app_actor_admin_practice_ids)::uuid[])))`
- `audit_event_operator_copy`: PERMISSIVE FOR SELECT TO tp_operator
  - USING `true`
- `audit_event_operator_read`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `audit_event_operator_record`: PERMISSIVE FOR INSERT TO tp_owner
  - WITH CHECK `true`
- `audit_event_record`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `((actor_id = app_actor_id()) AND (actor_kind = ANY (ARRAY['user'::text, 'service'::text])) AND (action <> ALL (ARRAY['notice_sent'::text, 'security_event'::text, 'sign_in_failed'::text, 'data_key_destroyed'::text])) AND ((practice_id IS NULL) OR (practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))))`

Triggers:
- `audit_event_append_only`: `BEFORE DELETE OR UPDATE ON audit_event FOR EACH ROW EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"
- `audit_event_no_truncate`: `BEFORE TRUNCATE ON audit_event FOR EACH STATEMENT EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"

### Table `audit_report`

<a id="table-audit-report"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `audit_report_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `practice_id`, `pricing_run_id`, `requested_by`)
- Column grant: `tp_app` UPDATE (`as_of`, `attestation`, `attested_by`, `content`, `csv_key`, `csv_sha256`, `failure_code`, `pdf_key`, `pdf_sha256`, `released_by`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `pricing_run_id` | `uuid` | NOT NULL |  | `pricing_run(id)` |  |
| 4 | `requested_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 5 | `status` | `text` | NOT NULL | `'queued'::text` |  | one of queued, ready, failed |
| 6 | `as_of` | `date` | null |  |  |  |
| 7 | `content` | `jsonb` | null |  |  |  |
| 8 | `pdf_key` | `text` | null |  |  |  |
| 9 | `pdf_sha256` | `text` | null |  |  |  |
| 10 | `csv_key` | `text` | null |  |  |  |
| 11 | `csv_sha256` | `text` | null |  |  |  |
| 12 | `generated_at` | `timestamp with time zone` | null |  |  |  |
| 13 | `failure_code` | `text` | null |  |  |  |
| 14 | `attested_by` | `uuid` | null |  | `user(id)` |  |
| 15 | `attested_at` | `timestamp with time zone` | null |  |  |  |
| 16 | `attestation` | `jsonb` | null |  |  |  |
| 17 | `released_by` | `uuid` | null |  | `user(id)` |  |
| 18 | `released_at` | `timestamp with time zone` | null |  |  |  |
| 19 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 20 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `audit_report_attested_by_fkey`: (attested_by) -> `user`(id) on delete no action
- `audit_report_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `audit_report_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id) on delete no action
- `audit_report_released_by_fkey`: (released_by) -> `user`(id) on delete no action
- `audit_report_requested_by_fkey`: (requested_by) -> `user`(id) on delete no action

Check constraints:
- `audit_report_attestation_check`: `CHECK (jsonb_typeof(attestation) = 'object'::text)`
- `audit_report_attestation_holds_no_words`: `CHECK (attestation IS NULL OR (attestation - ARRAY['format'::text, 'checklist'::text, 'pdf_sha256'::text, 'csv_sha256'::text]) = '{}'::jsonb AND (attestation ->> 'format'::text) = 'tp-attestation/1'::text AND jsonb_typeof(attestation -> 'checklist'::text) = 'array'::text AND NOT jsonb_path_exists(attestation -> 'checklist'::text, '$[*]?(@.type() != "string" \|\| !(@ like_regex "^[a-z][a-z_]{0,31}$"))'::jsonpath))`
- `audit_report_attested_together`: `CHECK ((attested_by IS NULL) = (attested_at IS NULL) AND (attested_at IS NULL) = (attestation IS NULL))`
- `audit_report_attested_when_ready`: `CHECK (attested_at IS NULL OR status = 'ready'::text)`
- `audit_report_content_check`: `CHECK (jsonb_typeof(content) = 'object'::text)`
- `audit_report_csv_key_check`: `CHECK (csv_key ~ '^practices/[0-9a-f-]{36}/reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.csv$'::text)`
- `audit_report_csv_sha256_check`: `CHECK (csv_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `audit_report_failure_code_check`: `CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `audit_report_failure_when_failed`: `CHECK ((status = 'failed'::text) = (failure_code IS NOT NULL))`
- `audit_report_pdf_key_check`: `CHECK (pdf_key ~ '^practices/[0-9a-f-]{36}/reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'::text)`
- `audit_report_pdf_sha256_check`: `CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `audit_report_ready_with_its_files`: `CHECK ((status = 'ready'::text) = (content IS NOT NULL AND as_of IS NOT NULL AND pdf_key IS NOT NULL AND pdf_sha256 IS NOT NULL AND csv_key IS NOT NULL AND csv_sha256 IS NOT NULL AND generated_at IS NOT NULL))`
- `audit_report_released_only_attested`: `CHECK (released_at IS NULL OR attested_at IS NOT NULL)`
- `audit_report_released_together`: `CHECK ((released_by IS NULL) = (released_at IS NULL))`
- `audit_report_status_check`: `CHECK (status = ANY (ARRAY['queued'::text, 'ready'::text, 'failed'::text]))`

Indexes:
- `audit_report_by_practice`: `USING btree (practice_id, created_at DESC, id)`
- `audit_report_pkey` (primary): `UNIQUE USING btree (id)`

Policies (3):
- `audit_report_requested_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(requested_by = app_actor_id())`
- `audit_report_requested_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false)`
- `audit_report_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `audit_report_belongs`: `AFTER INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_belongs()` raises: "an audit report is of a pricing run of its practice"; "an audit report is of the pricing run in effect for its period: never a re-run nobody has accepted, nor a run since replaced"
- `audit_report_never_deleted`: `BEFORE DELETE ON audit_report FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` raises: "% rows are never deleted: triage, cases and reports keep what they recorded"
- `audit_report_no_truncate`: `BEFORE TRUNCATE ON audit_report FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` raises: "% cannot be truncated: triage, cases and reports keep what they recorded"
- `audit_report_refused_while_suspended`: `BEFORE INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` raises: "%"
- `audit_report_rules`: `BEFORE INSERT OR UPDATE ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_rules()` raises: "an audit report is requested queued"; "an audit report's practice, run and requester never change"; "only the report job generates an audit report"; "an audit report is generated before it is attested or released"; "an audit report is generated only while its pricing run is the run in effect for its period"; "an audit report's numbers and files never change once generated; a new report is generated instead"; "a ready audit report is attested once"; "an audit report is attested by a reimbursement reviewer, in their own name"; "an attestation names the SHA-256 of the report's files it was signed over"; "an attestation's time is the time it was signed"; "an audit report is released once"; "an audit report cannot be released before a reimbursement reviewer signs its attestation"; "an audit report is released by a person who works cases, in their own name"; "a release's time is the time it was released"
- `audit_report_updated_at`: `BEFORE UPDATE ON audit_report FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `audit_report_download`

<a id="table-audit-report-download"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `audit_report_download_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`audit_report_id`, `downloaded_by`, `file`, `id`, `practice_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `audit_report_id` | `uuid` | NOT NULL |  | `audit_report(id)` |  |
| 4 | `file` | `text` | NOT NULL |  |  | one of pdf, csv |
| 5 | `downloaded_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 6 | `downloaded_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `audit_report_download_audit_report_id_fkey`: (audit_report_id) -> `audit_report`(id) on delete no action
- `audit_report_download_downloaded_by_fkey`: (downloaded_by) -> `user`(id) on delete no action
- `audit_report_download_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `audit_report_download_file_check`: `CHECK (file = ANY (ARRAY['pdf'::text, 'csv'::text]))`

Indexes:
- `audit_report_download_by_report`: `USING btree (practice_id, audit_report_id, downloaded_at DESC)`
- `audit_report_download_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `audit_report_download_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(downloaded_by = app_actor_id())`
- `audit_report_download_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `audit_report_download_belongs`: `AFTER INSERT ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_belongs()` raises: "a download is of a report of its practice"
- `audit_report_download_never_deleted`: `BEFORE DELETE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` raises: "% rows are never deleted: triage, cases and reports keep what they recorded"
- `audit_report_download_no_truncate`: `BEFORE TRUNCATE ON audit_report_download FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` raises: "% cannot be truncated: triage, cases and reports keep what they recorded"
- `audit_report_download_rules`: `BEFORE INSERT OR UPDATE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_rules()` raises: "a download record never changes"

### Table `billing_event`

<a id="table-billing-event"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: no privilege
- `tp_operator`: no privilege
- `tp_billing`: SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `stripe_event_id` | `text` | NOT NULL |  |  |  |
| 3 | `type` | `text` | NOT NULL |  |  |  |
| 4 | `occurred_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 5 | `organization_id` | `uuid` | null |  | `organization(id)` |  |
| 6 | `outcome` | `text` | NOT NULL |  |  | one of received, applied, stale, ignored, unknown_customer |
| 7 | `received_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `billing_event_stripe_event_id_key`: `UNIQUE (stripe_event_id)`

Foreign keys:
- `billing_event_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action

Check constraints:
- `billing_event_outcome_check`: `CHECK (outcome = ANY (ARRAY['received'::text, 'applied'::text, 'stale'::text, 'ignored'::text, 'unknown_customer'::text]))`
- `billing_event_stripe_event_id_check`: `CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]{1,250}$'::text)`
- `billing_event_type_check`: `CHECK (type ~ '^[a-z_]{1,64}(\.[a-z_]{1,64}){0,4}$'::text)`

Indexes:
- `billing_event_by_organization`: `USING btree (organization_id, received_at)`
- `billing_event_pkey` (primary): `UNIQUE USING btree (id)`
- `billing_event_stripe_event_id_key` (constraint): `UNIQUE USING btree (stripe_event_id)`

Policies (1):
- `billing_event_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`

Triggers:
- `billing_event_kept`: `BEFORE DELETE OR UPDATE ON billing_event FOR EACH ROW EXECUTE FUNCTION billing_records_kept()` raises: "% rows are kept"; "a usage snapshot never changes"; "a billing event is recorded once; only its outcome follows"
- `billing_event_no_truncate`: `BEFORE TRUNCATE ON billing_event FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` raises: "% rows are kept"; "a usage snapshot never changes"; "a billing event is recorded once; only its outcome follows"

### Table `case`

<a id="table-case"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `case_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `materiality_cents`, `pattern_key`, `payer_id`, `plan_id`, `practice_id`, `pursuit_cost_cents`, `rate_record_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `pattern_key` | `jsonb` | NOT NULL |  |  |  |
| 4 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` |  |
| 5 | `plan_id` | `uuid` | NOT NULL |  | `plan(id)` |  |
| 6 | `rate_record_id` | `uuid` | null |  | `rate_record(id)` |  |
| 7 | `owner_user_id` | `uuid` | null |  | `user(id)` |  |
| 8 | `state` | `text` | NOT NULL | `'open'::text` |  | one of open, submitted, awaiting_response, partially_resolved, resolved, closed_written_off |
| 9 | `deadline_on` | `date` | null |  |  |  |
| 10 | `materiality_cents` | `bigint` | NOT NULL |  |  |  |
| 11 | `pursuit_cost_cents` | `bigint` | null |  |  |  |
| 12 | `actionable_cents` | `bigint` | NOT NULL | `0` |  |  |
| 13 | `opened_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 14 | `closed_at` | `timestamp with time zone` | null |  |  |  |
| 15 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 16 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `case_owner_user_id_fkey`: (owner_user_id) -> `user`(id) on delete no action
- `case_payer_id_fkey`: (payer_id) -> `payer`(id) on delete no action
- `case_plan_id_fkey`: (plan_id) -> `plan`(id) on delete no action
- `case_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `case_rate_record_id_fkey`: (rate_record_id) -> `rate_record`(id) on delete no action

Check constraints:
- `case_actionable_cents_check`: `CHECK (actionable_cents >= 0)`
- `case_closed_when_closed`: `CHECK ((state = 'closed_written_off'::text) = (closed_at IS NOT NULL))`
- `case_materiality_cents_check`: `CHECK (materiality_cents >= 0)`
- `case_pattern_key_check`: `CHECK (jsonb_typeof(pattern_key) = 'object'::text)`
- `case_pursuit_cost_cents_check`: `CHECK (pursuit_cost_cents >= 0)`
- `case_state_check`: `CHECK (state = ANY (ARRAY['open'::text, 'submitted'::text, 'awaiting_response'::text, 'partially_resolved'::text, 'resolved'::text, 'closed_written_off'::text]))`

Indexes:
- `case_by_state`: `USING btree (practice_id, state, deadline_on)`
- `case_open_pattern`: `UNIQUE USING btree (practice_id, pattern_key) WHERE (state = 'open'::text)`
- `case_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `case_opened_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((NOT ( SELECT app_actor_is_person() AS app_actor_is_person)) OR COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false))`
- `case_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `case_belongs`: `AFTER INSERT ON "case" FOR EACH ROW EXECUTE FUNCTION case_belongs()` raises: "a case is of a plan of its payer and practice"; "a case's rate record is of its practice"
- `case_never_deleted`: `BEFORE DELETE ON "case" FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` raises: "% rows are never deleted: triage, cases and reports keep what they recorded"
- `case_no_truncate`: `BEFORE TRUNCATE ON "case" FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` raises: "% cannot be truncated: triage, cases and reports keep what they recorded"
- `case_rules`: `BEFORE INSERT OR UPDATE ON "case" FOR EACH ROW EXECUTE FUNCTION case_rules()` raises: "a case's pattern, payer, plan, rate record, materiality and pursuit estimate never change"
- `case_updated_at`: `BEFORE UPDATE ON "case" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `case_activity`

<a id="table-case-activity"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `case_activity_tenant`, registered by `20261024110000_case_workbench`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`body`, `case_id`, `created_by`, `id`, `kind`, `owner_user_id`, `packet_version_id`, `practice_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | one of note, assigned, approval_requested |
| 5 | `body` | `text` | null |  |  | enc:v1 |
| 6 | `owner_user_id` | `uuid` | null |  | `user(id)` |  |
| 7 | `packet_version_id` | `uuid` | null |  | `packet_version(id)` |  |
| 8 | `created_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `case_activity_case_id_fkey`: (case_id) -> `case`(id) on delete no action
- `case_activity_created_by_fkey`: (created_by) -> `user`(id) on delete no action
- `case_activity_owner_user_id_fkey`: (owner_user_id) -> `user`(id) on delete no action
- `case_activity_packet_version_id_fkey`: (packet_version_id) -> `packet_version`(id) on delete no action
- `case_activity_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `case_activity_assignment_has_no_words`: `CHECK (kind <> 'assigned'::text OR body IS NULL)`
- `case_activity_body_check`: `CHECK (body ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `case_activity_kind_check`: `CHECK (kind = ANY (ARRAY['note'::text, 'assigned'::text, 'approval_requested'::text]))`
- `case_activity_note_says_something`: `CHECK (kind <> 'note'::text OR body IS NOT NULL)`
- `case_activity_owner_only_assigned`: `CHECK (owner_user_id IS NULL OR kind = 'assigned'::text)`
- `case_activity_request_names_its_version`: `CHECK ((kind = 'approval_requested'::text) = (packet_version_id IS NOT NULL))`

Indexes:
- `case_activity_by_case`: `USING btree (practice_id, case_id, created_at)`
- `case_activity_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `case_activity_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
- `case_activity_written_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(created_by = app_actor_id())`

Triggers:
- `case_activity_belongs`: `AFTER INSERT ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_belongs()` raises: "a case's activity is a person's, in their own name"; "notes and assignments are a case worker's; an approval request a packet drafter's"; "a case's activity is of a case of its practice"; "a case is assigned to a person who works the practice's cases now"; "approval is requested of a version of the case's packet"; "approval is requested of the packet's current version, unapproved, once the verifier passes it"
- `case_activity_no_truncate`: `BEFORE TRUNCATE ON case_activity FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` raises: "% cannot be truncated: triage, cases and reports keep what they recorded"
- `case_activity_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_rules()` raises: "a case's activity never changes and is never deleted; a later note or assignment is a new row"
- `case_activity_sets_owner`: `AFTER INSERT ON case_activity FOR EACH ROW WHEN (new.kind = 'assigned'::text) EXECUTE FUNCTION case_activity_sets_owner()`

### Table `case_line`

<a id="table-case-line"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `case_line_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`case_id`, `id`, `practice_id`, `priced_line_id`, `service_line_id`, `written_off_reason`)
- Column grant: `tp_app` UPDATE (`reopen_reason`, `reopened_by`, `written_off_by`, `written_off_reason`, `written_off_text`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` |  |
| 4 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` |  |
| 5 | `priced_line_id` | `uuid` | NOT NULL |  | `priced_line(id)` |  |
| 6 | `actionable` | `boolean` | NOT NULL | `true` |  |  |
| 7 | `written_off_reason` | `text` | null |  |  | one of window_passed, payer_correct_on_review, not_worth_pursuit, duplicate, other |
| 8 | `written_off_text` | `text` | null |  |  | enc:v1 |
| 9 | `written_off_by` | `uuid` | null |  | `user(id)` |  |
| 10 | `written_off_at` | `timestamp with time zone` | null |  |  |  |
| 11 | `reopen_reason` | `text` | null |  |  | enc:v1 |
| 12 | `reopened_by` | `uuid` | null |  | `user(id)` |  |
| 13 | `reopened_at` | `timestamp with time zone` | null |  |  |  |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `case_line_once`: `UNIQUE (service_line_id)`

Foreign keys:
- `case_line_case_id_fkey`: (case_id) -> `case`(id) on delete no action
- `case_line_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `case_line_priced_line_id_fkey`: (priced_line_id) -> `priced_line`(id) on delete no action
- `case_line_reopened_by_fkey`: (reopened_by) -> `user`(id) on delete no action
- `case_line_service_line_id_fkey`: (service_line_id) -> `service_line`(id) on delete no action
- `case_line_written_off_by_fkey`: (written_off_by) -> `user`(id) on delete no action

Check constraints:
- `case_line_actionable_unless_written_off`: `CHECK (actionable = (written_off_reason IS NULL))`
- `case_line_other_says_why`: `CHECK (NOT (written_off_reason = 'other'::text) IS DISTINCT FROM (written_off_text IS NOT NULL) OR written_off_reason IS NULL)`
- `case_line_reopen_reason_check`: `CHECK (reopen_reason IS NULL OR btrim(reopen_reason) <> ''::text AND char_length(reopen_reason) <= 4000)`
- `case_line_reopen_reason_encrypted`: `CHECK (reopen_reason ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `case_line_reopened_together`: `CHECK ((reopened_at IS NULL) = (reopened_by IS NULL) AND (reopened_at IS NULL) = (reopen_reason IS NULL))`
- `case_line_system_writes_off_passed_windows`: `CHECK (written_off_reason IS NULL OR written_off_by IS NOT NULL OR written_off_reason = 'window_passed'::text)`
- `case_line_written_off_reason_check`: `CHECK (written_off_reason = ANY (ARRAY['window_passed'::text, 'payer_correct_on_review'::text, 'not_worth_pursuit'::text, 'duplicate'::text, 'other'::text]))`
- `case_line_written_off_text_check`: `CHECK (written_off_text IS NULL OR btrim(written_off_text) <> ''::text AND char_length(written_off_text) <= 4000)`
- `case_line_written_off_text_encrypted`: `CHECK (written_off_text ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `case_line_written_off_together`: `CHECK ((written_off_reason IS NULL) = (written_off_at IS NULL) AND (written_off_reason IS NOT NULL OR written_off_by IS NULL AND written_off_text IS NULL))`

Indexes:
- `case_line_by_case`: `USING btree (practice_id, case_id)`
- `case_line_once` (constraint): `UNIQUE USING btree (service_line_id)`
- `case_line_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `case_line_added_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((NOT ( SELECT app_actor_is_person() AS app_actor_is_person)) OR COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false))`
- `case_line_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `case_line_belongs`: `AFTER INSERT ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_belongs()` raises: "a case line joins a case of its practice"; "a case line is a priced line of its own service line and practice"; "a case line joins its case written off only by triage, because its window has passed"
- `case_line_never_deleted`: `BEFORE DELETE ON case_line FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` raises: "% rows are never deleted: triage, cases and reports keep what they recorded"
- `case_line_no_truncate`: `BEFORE TRUNCATE ON case_line FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` raises: "% cannot be truncated: triage, cases and reports keep what they recorded"
- `case_line_refresh_inserted`: `AFTER INSERT ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases()`
- `case_line_refresh_updated`: `AFTER UPDATE ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases()`
- `case_line_rules`: `BEFORE INSERT OR UPDATE ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_rules()` raises: "a case line joins its case actionable, or struck through because its window passed"; "a case line's case, service line and priced line never change"; "triage writes off only a line whose window has passed; a person writes off in their own name"; "a line is written off by a person who works cases, in their own name"; "a write-off changes nothing of the line's last reopen"; "a reopen clears the whole write-off"; "a written-off line is reopened by a person who works cases, in their own name"; "a reopen says why, in its own words"; "a line past its window cannot be actionable, so it is not reopened"; "a case line changes only by a write-off or a reopen"
- `case_line_updated_at`: `BEFORE UPDATE ON case_line FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `claim`

<a id="table-claim"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `claim_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`allowed_cents`, `charge_cents`, `claim_no`, `claim_status_code`, `facility_type`, `filing_indicator`, `frequency_code`, `id`, `insured_ref_id`, `interest_cents`, `paid_cents`, `patient_control_number`, `patient_ref_id`, `patient_resp_cents`, `payer_claim_control_number`, `payer_claim_control_number_hash`, `practice_id`, `received_on`, `remittance_id`, `reversal_of_claim_id`, `service_from`, `service_to`, `superseded_by_claim_id`)
- Column grant: `tp_app` UPDATE (`reversal_of_claim_id`, `superseded_by_claim_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `remittance_id` | `uuid` | NOT NULL |  | `remittance(id)` |  |
| 4 | `claim_no` | `integer` | NOT NULL |  |  |  |
| 5 | `patient_control_number` | `text` | NOT NULL |  |  | enc:v1 |
| 6 | `payer_claim_control_number` | `text` | NOT NULL |  |  | enc:v1 |
| 7 | `payer_claim_control_number_hash` | `text` | NOT NULL |  |  |  |
| 8 | `claim_status_code` | `text` | NOT NULL |  |  |  |
| 9 | `charge_cents` | `bigint` | NOT NULL |  |  |  |
| 10 | `paid_cents` | `bigint` | NOT NULL |  |  |  |
| 11 | `patient_resp_cents` | `bigint` | null |  |  |  |
| 12 | `filing_indicator` | `text` | NOT NULL |  |  |  |
| 13 | `facility_type` | `text` | null |  |  |  |
| 14 | `frequency_code` | `text` | null |  |  |  |
| 15 | `patient_ref_id` | `uuid` | NOT NULL |  | `patient_ref(id)` |  |
| 16 | `insured_ref_id` | `uuid` | null |  | `patient_ref(id)` |  |
| 17 | `service_from` | `date` | null |  |  |  |
| 18 | `service_to` | `date` | null |  |  |  |
| 19 | `reversal_of_claim_id` | `uuid` | null |  | `claim(id)` |  |
| 20 | `superseded_by_claim_id` | `uuid` | null |  | `claim(id)` |  |
| 21 | `allowed_cents` | `bigint` | null |  |  |  |
| 22 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 23 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 24 | `received_on` | `date` | null |  |  |  |
| 25 | `interest_cents` | `bigint` | null |  |  |  |

Unique constraints:
- `claim_once`: `UNIQUE (remittance_id, claim_no)`

Foreign keys:
- `claim_insured_ref_id_fkey`: (insured_ref_id) -> `patient_ref`(id) on delete no action
- `claim_patient_ref_id_fkey`: (patient_ref_id) -> `patient_ref`(id) on delete no action
- `claim_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `claim_remittance_id_fkey`: (remittance_id) -> `remittance`(id) on delete no action
- `claim_reversal_of_claim_id_fkey`: (reversal_of_claim_id) -> `claim`(id) on delete no action
- `claim_superseded_by_claim_id_fkey`: (superseded_by_claim_id) -> `claim`(id) on delete no action

Check constraints:
- `claim_claim_no_check`: `CHECK (claim_no >= 1)`
- `claim_claim_status_code_check`: `CHECK (btrim(claim_status_code) <> ''::text)`
- `claim_filing_indicator_check`: `CHECK (btrim(filing_indicator) <> ''::text)`
- `claim_not_its_own_reversal`: `CHECK (reversal_of_claim_id IS DISTINCT FROM id)`
- `claim_not_superseded_by_itself`: `CHECK (superseded_by_claim_id IS DISTINCT FROM id)`
- `claim_patient_control_number_check`: `CHECK (patient_control_number ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `claim_payer_claim_control_number_check`: `CHECK (payer_claim_control_number ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `claim_payer_claim_control_number_hash_check`: `CHECK (payer_claim_control_number_hash ~ '^[0-9a-f]{64}$'::text)`
- `claim_reversal_is_a_reversal`: `CHECK (reversal_of_claim_id IS NULL OR claim_status_code = '22'::text)`

Indexes:
- `claim_by_patient`: `USING btree (practice_id, patient_ref_id)`
- `claim_by_payer_claim_control_number`: `USING btree (practice_id, payer_claim_control_number_hash)`
- `claim_by_reversed`: `USING btree (reversal_of_claim_id) WHERE (reversal_of_claim_id IS NOT NULL)`
- `claim_once` (constraint): `UNIQUE USING btree (remittance_id, claim_no)`
- `claim_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `claim_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `claim_references_in_practice`: `BEFORE INSERT OR UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION claim_references_in_practice()` raises: "a reversal's link to the claim it reverses never changes once set"; "a claim's superseding correction never changes once set"; "a claim belongs to a remittance of the same practice"; "a claim names patient references of the same practice"; "a reversal reverses a claim of the same practice that is not itself a reversal"; "a claim is superseded by a corrected claim of the same practice"
- `claim_updated_at`: `BEFORE UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `compliance_record`

<a id="table-compliance-record"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`document_ref`, `id`, `kind`, `occurred_on`, `recorded_by`, `sha256`, `subject`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `kind` | `text` | NOT NULL |  |  | one of policy_approval, access_review, tabletop_exercise, training_attestation, vendor_review, risk_analysis, security_official |
| 3 | `subject` | `text` | NOT NULL |  |  |  |
| 4 | `occurred_on` | `date` | NOT NULL |  |  |  |
| 5 | `document_ref` | `text` | NOT NULL |  |  |  |
| 6 | `sha256` | `text` | NOT NULL |  |  |  |
| 7 | `recorded_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `compliance_record_recorded_by_fkey`: (recorded_by) -> `user`(id) on delete no action

Check constraints:
- `compliance_record_document_ref_check`: `CHECK (document_ref ~ '^[A-Za-z0-9:/._-]{1,200}$'::text)`
- `compliance_record_kind_check`: `CHECK (kind = ANY (ARRAY['policy_approval'::text, 'access_review'::text, 'tabletop_exercise'::text, 'training_attestation'::text, 'vendor_review'::text, 'risk_analysis'::text, 'security_official'::text]))`
- `compliance_record_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `compliance_record_subject_check`: `CHECK (subject ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'::text)`

Indexes:
- `compliance_record_by_kind`: `USING btree (kind, subject, occurred_on DESC)`
- `compliance_record_pkey` (primary): `UNIQUE USING btree (id)`

Policies (3):
- `compliance_record_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `compliance_record_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `( SELECT app_actor_platform_permitted('compliance.manage'::text) AS app_actor_platform_permitted)`
- `compliance_record_recorded`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('compliance.manage'::text) AS app_actor_platform_permitted) AND (recorded_by = app_actor_id()))`

Triggers:
- `compliance_record_append_only`: `BEFORE DELETE OR UPDATE ON compliance_record FOR EACH ROW EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"
- `compliance_record_rules`: `BEFORE INSERT ON compliance_record FOR EACH ROW EXECUTE FUNCTION compliance_record_rules()` raises: "evidence is recorded for what has happened"

### Table `contract`

<a id="table-contract"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `contract_tenant`, registered by `20261016160000_contracts_and_mapping`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`billing_entity`, `id`, `payer_id`, `practice_id`, `title`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` |  |
| 4 | `title` | `text` | NOT NULL |  |  |  |
| 5 | `billing_entity` | `text` | null |  |  |  |
| 6 | `status` | `text` | NOT NULL | `'active'::text` |  | one of active, ended |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `contract_payer_id_fkey`: (payer_id) -> `payer`(id) on delete no action
- `contract_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `contract_billing_entity_check`: `CHECK (btrim(billing_entity) <> ''::text AND char_length(billing_entity) <= 200)`
- `contract_status_check`: `CHECK (status = ANY (ARRAY['active'::text, 'ended'::text]))`
- `contract_title_check`: `CHECK (btrim(title) <> ''::text AND char_length(title) <= 200)`

Indexes:
- `contract_by_payer`: `USING btree (practice_id, payer_id)`
- `contract_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `contract_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `contract_rules`: `BEFORE INSERT OR UPDATE ON contract FOR EACH ROW EXECUTE FUNCTION contract_rules()` raises: "a contract's practice and payer never change"; "a contract belongs to a payer of the same practice"
- `contract_updated_at`: `BEFORE UPDATE ON contract FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `contract_calendar_event`

<a id="table-contract-calendar-event"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `contract_calendar_event_tenant`, registered by `20261016160000_contracts_and_mapping`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`contract_id`, `id`, `kind`, `note`, `on_date`, `practice_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `contract_id` | `uuid` | NOT NULL |  | `contract(id)` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | one of anniversary, notice_deadline, fee_schedule_year, amendment |
| 5 | `on_date` | `date` | NOT NULL |  |  |  |
| 6 | `note` | `text` | null |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `contract_calendar_event_once`: `UNIQUE (contract_id, kind, on_date)`

Foreign keys:
- `contract_calendar_event_contract_id_fkey`: (contract_id) -> `contract`(id) on delete no action
- `contract_calendar_event_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `contract_calendar_event_kind_check`: `CHECK (kind = ANY (ARRAY['anniversary'::text, 'notice_deadline'::text, 'fee_schedule_year'::text, 'amendment'::text]))`
- `contract_calendar_event_note_check`: `CHECK (btrim(note) <> ''::text AND char_length(note) <= 500)`

Indexes:
- `contract_calendar_event_by_date`: `USING btree (practice_id, on_date)`
- `contract_calendar_event_once` (constraint): `UNIQUE USING btree (contract_id, kind, on_date)`
- `contract_calendar_event_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `contract_calendar_event_by_sign_off`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `app_actor_permitted(practice_id, 'contract.sign_off'::text)`
- `contract_calendar_event_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `contract_calendar_event_rules`: `BEFORE INSERT OR UPDATE ON contract_calendar_event FOR EACH ROW EXECUTE FUNCTION contract_calendar_event_rules()` raises: "a calendar event never changes; signing off a new version derives new events"; "a calendar event belongs to a contract of the same practice"
- `contract_calendar_event_updated_at`: `BEFORE UPDATE ON contract_calendar_event FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `contract_question`

<a id="table-contract-question"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `contract_question_tenant`, registered by `20261016200000_contract_questions_and_queue`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`asked_by`, `contract_id`, `contract_version_id`, `id`, `practice_id`, `question`, `source_document_id`, `topic`)
- Column grant: `tp_app` UPDATE (`answer`, `closed_at`, `closed_by`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `contract_id` | `uuid` | NOT NULL |  | `contract(id)` |  |
| 4 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` |  |
| 5 | `source_document_id` | `uuid` | null |  | `source_document(id)` |  |
| 6 | `topic` | `text` | NOT NULL |  |  | one of missing_pages, missing_schedule, undefined_method, scope, timed_units, windows, other |
| 7 | `question` | `text` | NOT NULL |  |  | enc:v1 |
| 8 | `asked_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 9 | `status` | `text` | NOT NULL | `'open'::text` |  | one of open, answered, withdrawn |
| 10 | `answer` | `text` | null |  |  | enc:v1 |
| 11 | `closed_by` | `uuid` | null |  | `user(id)` |  |
| 12 | `closed_at` | `timestamp with time zone` | null |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `contract_question_asked_by_fkey`: (asked_by) -> `user`(id) on delete no action
- `contract_question_closed_by_fkey`: (closed_by) -> `user`(id) on delete no action
- `contract_question_contract_id_fkey`: (contract_id) -> `contract`(id) on delete no action
- `contract_question_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id) on delete no action
- `contract_question_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `contract_question_source_document_id_fkey`: (source_document_id) -> `source_document`(id) on delete no action

Check constraints:
- `contract_question_answer_check`: `CHECK (answer ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `contract_question_answered_with_answer`: `CHECK ((status = 'answered'::text) = (answer IS NOT NULL))`
- `contract_question_closing_recorded`: `CHECK ((status = 'open'::text) = (closed_by IS NULL) AND (closed_by IS NULL) = (closed_at IS NULL))`
- `contract_question_question_check`: `CHECK (question ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `contract_question_status_check`: `CHECK (status = ANY (ARRAY['open'::text, 'answered'::text, 'withdrawn'::text]))`
- `contract_question_topic_check`: `CHECK (topic = ANY (ARRAY['missing_pages'::text, 'missing_schedule'::text, 'undefined_method'::text, 'scope'::text, 'timed_units'::text, 'windows'::text, 'other'::text]))`

Indexes:
- `contract_question_by_contract`: `USING btree (practice_id, contract_id, status)`
- `contract_question_open`: `USING btree (practice_id, created_at) WHERE (status = 'open'::text)`
- `contract_question_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `contract_question_asked_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(asked_by = app_actor_id())`
- `contract_question_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `contract_question_rules`: `BEFORE INSERT OR UPDATE ON contract_question FOR EACH ROW EXECUTE FUNCTION contract_question_rules()` raises: "a question is asked open, without an answer"; "a question is about a contract of the same practice"; "a question names a version of its contract"; "a question names a contract, exhibit or payer-letter document of the same practice"; "a question never changes; it is answered or withdrawn"; "an answered or withdrawn question never changes"; "a question changes only when it is answered or withdrawn"; "closing a question records who closed it and when"
- `contract_question_updated_at`: `BEFORE UPDATE ON contract_question FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `contract_version`

<a id="table-contract-version"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `contract_version_tenant`, registered by `20261016160000_contracts_and_mapping`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`appeal_levels`, `contract_id`, `dispute_window_days`, `effective_from`, `effective_to`, `id`, `notice_days`, `practice_id`, `source_document_ids`, `supersedes_id`, `timely_filing_days`, `version_no`)
- Column grant: `tp_app` UPDATE (`appeal_levels`, `approved_at`, `approved_by`, `dispute_window_days`, `effective_from`, `effective_to`, `notice_days`, `signed_off_at`, `signed_off_by`, `source_document_ids`, `status`, `supersedes_id`, `timely_filing_days`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `contract_id` | `uuid` | NOT NULL |  | `contract(id)` |  |
| 4 | `version_no` | `integer` | NOT NULL |  |  |  |
| 5 | `source_document_ids` | `uuid[]` | NOT NULL | `'{}'::uuid[]` |  |  |
| 6 | `effective_from` | `date` | NOT NULL |  |  |  |
| 7 | `effective_to` | `date` | null |  |  |  |
| 8 | `status` | `text` | NOT NULL | `'draft'::text` |  | one of draft, proposed, signed_off, superseded, approved |
| 9 | `approved_by` | `uuid` | null |  | `user(id)` |  |
| 10 | `approved_at` | `timestamp with time zone` | null |  |  |  |
| 11 | `signed_off_by` | `uuid` | null |  | `user(id)` |  |
| 12 | `signed_off_at` | `timestamp with time zone` | null |  |  |  |
| 13 | `supersedes_id` | `uuid` | null |  | `contract_version(id)` |  |
| 14 | `timely_filing_days` | `integer` | null |  |  |  |
| 15 | `dispute_window_days` | `integer` | null |  |  |  |
| 16 | `appeal_levels` | `jsonb` | NOT NULL | `'[]'::jsonb` |  |  |
| 17 | `notice_days` | `integer` | null |  |  |  |
| 18 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 19 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `contract_version_number_once`: `UNIQUE (contract_id, version_no)`

Foreign keys:
- `contract_version_approved_by_fkey`: (approved_by) -> `user`(id) on delete no action
- `contract_version_contract_id_fkey`: (contract_id) -> `contract`(id) on delete no action
- `contract_version_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `contract_version_signed_off_by_fkey`: (signed_off_by) -> `user`(id) on delete no action
- `contract_version_supersedes_id_fkey`: (supersedes_id) -> `contract_version`(id) on delete no action

Check constraints:
- `contract_version_appeal_levels_check`: `CHECK (jsonb_typeof(appeal_levels) = 'array'::text)`
- `contract_version_approval_recorded`: `CHECK ((approved_by IS NULL) = (approved_at IS NULL))`
- `contract_version_approved_past_proposal`: `CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text])) = (approved_by IS NULL))`
- `contract_version_dispute_window_days_check`: `CHECK (dispute_window_days >= 1 AND dispute_window_days <= 3650)`
- `contract_version_not_its_own_successor`: `CHECK (supersedes_id IS DISTINCT FROM id)`
- `contract_version_notice_days_check`: `CHECK (notice_days >= 1 AND notice_days <= 3650)`
- `contract_version_sign_off_recorded`: `CHECK ((signed_off_by IS NULL) = (signed_off_at IS NULL))`
- `contract_version_signed_off_only_once_signed`: `CHECK (signed_off_by IS NULL OR (status = ANY (ARRAY['signed_off'::text, 'superseded'::text])))`
- `contract_version_signed_off_recorded`: `CHECK (status <> 'signed_off'::text OR signed_off_by IS NOT NULL)`
- `contract_version_source_document_ids_check`: `CHECK (array_position(source_document_ids, NULL::uuid) IS NULL AND cardinality(source_document_ids) <= 100)`
- `contract_version_status_check`: `CHECK (status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text, 'signed_off'::text, 'superseded'::text]))`
- `contract_version_timely_filing_days_check`: `CHECK (timely_filing_days >= 1 AND timely_filing_days <= 3650)`
- `contract_version_version_no_check`: `CHECK (version_no >= 1)`
- `contract_version_window`: `CHECK (effective_to IS NULL OR effective_to > effective_from)`

Exclusion constraints:
- `contract_version_windows_never_overlap`: `EXCLUDE USING gist (uuid_half(contract_id, true) WITH &&, uuid_half(contract_id, false) WITH &&, daterange(effective_from, effective_to, '[)'::text) WITH &&) WHERE (status = 'signed_off'::text OR supersedes_id IS NULL AND (status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text])))`

Indexes:
- `contract_version_by_contract`: `USING btree (practice_id, contract_id, effective_from)`
- `contract_version_by_predecessor`: `USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL)`
- `contract_version_number_once` (constraint): `UNIQUE USING btree (contract_id, version_no)`
- `contract_version_pkey` (primary): `UNIQUE USING btree (id)`
- `contract_version_windows_never_overlap` (constraint): `USING gist (uuid_half(contract_id, true), uuid_half(contract_id, false), daterange(effective_from, effective_to, '[)'::text)) WHERE ((status = 'signed_off'::text) OR ((supersedes_id IS NULL) AND (status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text]))))`

Policies (1):
- `contract_version_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `contract_version_retired_by_signed_successor`: `AFTER UPDATE ON contract_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((old.status = ANY (ARRAY['approved'::text, 'signed_off'::text])) AND (new.status = 'superseded'::text OR new.effective_to IS DISTINCT FROM old.effective_to)) EXECUTE FUNCTION contract_version_retired_by_signed_successor()` raises: "a contract version is closed or superseded only by the sign-off of its successor"
- `contract_version_rules`: `BEFORE INSERT OR UPDATE ON contract_version FOR EACH ROW EXECUTE FUNCTION contract_version_rules()` raises: "a contract version starts as a draft"; "a contract version belongs to a contract of the same practice"; "a contract version's contract and number never change"; "a draft is approved by moving it to approved"; "a proposal carries at least one rate record"; "only a contract specialist approves a contract version"; "an approval records the approving specialist and the time"; "a version is approved as it stands; edit it first, then approve it"; "an approved version names the documents it is abstracted from"; "a version is approved once each of its rate records is verified, and it has at least one"; "every rate record's evidence is a document of its version"; "a contract version moves draft, proposed, approved, signed off, superseded, in that order"; "a version's documents are clean contract, exhibit or payer-letter documents of its practice, each named once"; "only a practice administrator or billing manager signs off a contract version"; "a sign-off records the signing user and the time and changes nothing else"; "the version a successor names is an approved or signed-off version of the same contract"; "only a successor's sign-off retires a contract version"; "a signed-off version never changes: an amendment closes its window at the amendment's start, and a correction supersedes it"; "an approved or signed-off contract version never changes; supersede it with a new version"; "a successor names an approved or signed-off version of the same contract"
- `contract_version_updated_at`: `BEFORE UPDATE ON contract_version FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `digest`

<a id="table-digest"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `digest_tenant`, registered by `20261020090000_monitoring_digests_notifications`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`counts`, `id`, `period`, `practice_id`, `totals_cents`)
- Column grant: `tp_app` UPDATE (`sent_at`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `period` | `text` | NOT NULL |  |  |  |
| 4 | `counts` | `jsonb` | NOT NULL |  |  |  |
| 5 | `totals_cents` | `jsonb` | NOT NULL |  |  |  |
| 6 | `sent_at` | `timestamp with time zone` | null |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `digest_once`: `UNIQUE (practice_id, period)`

Foreign keys:
- `digest_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `digest_counts_only`: `CHECK (figures_are_counts(counts))`
- `digest_period_check`: `CHECK (period ~ '^[0-9]{4}-(0[1-9]\|1[0-2])$'::text)`
- `digest_totals_only`: `CHECK (figures_are_cents(totals_cents))`

Indexes:
- `digest_once` (constraint): `UNIQUE USING btree (practice_id, period)`
- `digest_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `digest_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `digest_refused_while_suspended`: `BEFORE INSERT ON digest FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` raises: "%"
- `digest_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON digest FOR EACH ROW EXECUTE FUNCTION digest_rules()` raises: "a digest is never deleted"; "a digest is recorded before it is sent"; "a digest's figures never change once recorded"; "a digest is sent once"; "a digest records the time it was sent"
- `digest_updated_at`: `BEFORE UPDATE ON digest FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `eft_row`

<a id="table-eft-row"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `eft_row_tenant`, registered by `20261023120000_recovery_ledger`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`amount_cents`, `batch_reference`, `deposited_on`, `fingerprint`, `id`, `practice_id`, `row_no`, `source_document_id`, `trace`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` |  |
| 4 | `row_no` | `integer` | NOT NULL |  |  |  |
| 5 | `trace` | `text` | NOT NULL |  |  |  |
| 6 | `deposited_on` | `date` | NOT NULL |  |  |  |
| 7 | `amount_cents` | `bigint` | NOT NULL |  |  |  |
| 8 | `batch_reference` | `text` | null |  |  |  |
| 9 | `fingerprint` | `text` | NOT NULL |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `eft_row_once`: `UNIQUE (practice_id, fingerprint)`
- `eft_row_position`: `UNIQUE (source_document_id, row_no)`

Foreign keys:
- `eft_row_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `eft_row_source_document_id_fkey`: (source_document_id) -> `source_document`(id) on delete no action

Check constraints:
- `eft_row_batch_reference_check`: `CHECK (char_length(batch_reference) >= 1 AND char_length(batch_reference) <= 100)`
- `eft_row_fingerprint_check`: `CHECK (fingerprint ~ '^[0-9a-f]{64}$'::text)`
- `eft_row_row_no_check`: `CHECK (row_no >= 1)`
- `eft_row_trace_check`: `CHECK (btrim(trace) <> ''::text AND char_length(trace) <= 64)`

Indexes:
- `eft_row_by_trace`: `USING btree (practice_id, trace)`
- `eft_row_once` (constraint): `UNIQUE USING btree (practice_id, fingerprint)`
- `eft_row_pkey` (primary): `UNIQUE USING btree (id)`
- `eft_row_position` (constraint): `UNIQUE USING btree (source_document_id, row_no)`

Policies (1):
- `eft_row_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `eft_row_belongs`: `BEFORE INSERT ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs()` raises: "an export row is read from its export by the reconcile job, never written by a person"; "an export row is a row of an export of its practice"; "a posting row is a row of a posting export, and an EFT row of an EFT export"; "an export row is read from an export stored with a clean malware scan, before it is loaded"; "an export row of a zip entry is read only when its zip's malware scan is clean"
- `eft_row_never_changed`: `BEFORE DELETE OR UPDATE ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed()` raises: "% rows are never changed or deleted: the ledger is append-only and a correction is a new entry"
- `eft_row_no_truncate`: `BEFORE TRUNCATE ON eft_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` raises: "% cannot be truncated: the ledger keeps what it recorded"

### Table `eval_example`

<a id="table-eval-example"></a>

- Class: tenant (nullable practice_id), not PHI; owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: SELECT, INSERT(cols)
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`expected`, `id`, `input_ref`, `permission_ref`, `practice_id`, `purpose`, `source`)
- Column grant: `tp_operator` INSERT (`expected`, `id`, `input_ref`, `permission_ref`, `practice_id`, `purpose`, `source`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `source` | `text` | NOT NULL |  |  | one of synthetic, permitted |
| 3 | `purpose` | `text` | NOT NULL |  |  | one of proposeContractTerms, readDenialLetter, draftPacketNarrative, suggestEvidenceRequests |
| 4 | `input_ref` | `text` | NOT NULL |  |  |  |
| 5 | `expected` | `jsonb` | NOT NULL |  |  |  |
| 6 | `practice_id` | `uuid` | null |  | `practice(id)` |  |
| 7 | `permission_ref` | `uuid` | null |  | `agreement(id)` |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `eval_example_permission_ref_fkey`: (permission_ref) -> `agreement`(id) on delete no action
- `eval_example_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `eval_example_expected_check`: `CHECK (jsonb_typeof(expected) = 'object'::text)`
- `eval_example_input_ref_check`: `CHECK (input_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'::text)`
- `eval_example_letters_synthetic`: `CHECK (purpose <> 'readDenialLetter'::text OR source = 'synthetic'::text)`
- `eval_example_purpose_check`: `CHECK (purpose = ANY (ARRAY['proposeContractTerms'::text, 'readDenialLetter'::text, 'draftPacketNarrative'::text, 'suggestEvidenceRequests'::text]))`
- `eval_example_source`: `CHECK ( CASE source     WHEN 'synthetic'::text THEN practice_id IS NULL AND permission_ref IS NULL     ELSE practice_id IS NOT NULL AND permission_ref IS NOT NULL END)`
- `eval_example_source_check`: `CHECK (source = ANY (ARRAY['synthetic'::text, 'permitted'::text]))`

Indexes:
- `eval_example_by_practice`: `USING btree (practice_id, created_at)`
- `eval_example_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `eval_example_synthetic`: PERMISSIVE FOR ALL TO tp_operator
  - USING `(practice_id IS NULL)`
  - WITH CHECK `(practice_id IS NULL)`
- `eval_example_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `eval_example_no_truncate`: `BEFORE TRUNCATE ON eval_example FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()` raises: "% cannot be truncated: the gateway's records are kept"
- `eval_example_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON eval_example FOR EACH ROW EXECUTE FUNCTION eval_example_rules()` raises: "an evaluation example is never changed or deleted"; "a permitted evaluation example rests on the practice's signed data-rights agreement"

### Table `feature_flag`

<a id="table-feature-flag"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: SELECT
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `key` | `text` | NOT NULL |  |  | one of model.kill_switch, model.read_denial_letter, model.daily_budget_cents, platform.maintenance |
| 3 | `scope` | `text` | NOT NULL |  |  | one of global, organization, practice |
| 4 | `scope_id` | `uuid` | null |  |  |  |
| 5 | `value` | `jsonb` | NOT NULL |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `feature_flag_once`: `UNIQUE NULLS NOT DISTINCT (key, scope, scope_id)`

Check constraints:
- `feature_flag_key_check`: `CHECK (key = ANY (ARRAY['model.kill_switch'::text, 'model.read_denial_letter'::text, 'model.daily_budget_cents'::text, 'platform.maintenance'::text]))`
- `feature_flag_maintenance_global`: `CHECK (key <> 'platform.maintenance'::text OR scope = 'global'::text)`
- `feature_flag_scope_check`: `CHECK (scope = ANY (ARRAY['global'::text, 'organization'::text, 'practice'::text]))`
- `feature_flag_scope_id`: `CHECK ((scope = 'global'::text) = (scope_id IS NULL))`
- `feature_flag_value`: `CHECK ( CASE key     WHEN 'model.daily_budget_cents'::text THEN jsonb_typeof(value) = 'string'::text AND (value #>> '{}'::text[]) ~ '^(0\|[1-9][0-9]{0,11})$'::text     ELSE jsonb_typeof(value) = 'boolean'::text END)`

Indexes:
- `feature_flag_once` (constraint): `UNIQUE USING btree (key, scope, scope_id) NULLS NOT DISTINCT`
- `feature_flag_pkey` (primary): `UNIQUE USING btree (id)`

Policies (0):
- none

Triggers:
- `feature_flag_updated_at`: `BEFORE UPDATE ON feature_flag FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `grant`

<a id="table-grant"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `grant_tenant`, registered by `20261015140000_tenancy`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`agreement_id`, `approved_by_user_id`, `ends_at`, `id`, `organization_id`, `practice_id`, `reason`, `scope`, `starts_at`)
- Column grant: `tp_app` UPDATE (`reason`, `revoked_at`, `revoked_by`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 4 | `scope` | `jsonb` | NOT NULL |  |  |  |
| 5 | `starts_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `ends_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 7 | `approved_by_user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 8 | `agreement_id` | `uuid` | NOT NULL |  | `agreement(id)` |  |
| 9 | `revoked_at` | `timestamp with time zone` | null |  |  |  |
| 10 | `revoked_by` | `uuid` | null |  | `user(id)` |  |
| 11 | `reason` | `text` | null |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `grant_agreement_id_fkey`: (agreement_id) -> `agreement`(id) on delete no action
- `grant_approved_by_user_id_fkey`: (approved_by_user_id) -> `user`(id) on delete no action
- `grant_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action
- `grant_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `grant_revoked_by_fkey`: (revoked_by) -> `user`(id) on delete no action

Check constraints:
- `grant_revocation`: `CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))`
- `grant_scope`: `CHECK (jsonb_typeof(scope) = 'object'::text AND COALESCE(jsonb_typeof(scope -> 'roles'::text), 'array'::text) = 'array'::text AND COALESCE(scope -> 'roles'::text, '[]'::jsonb) <@ '["firm_principal", "firm_analyst", "billing_manager", "analyst", "viewer"]'::jsonb)`
- `grant_window`: `CHECK (ends_at > starts_at)`

Indexes:
- `grant_by_organization`: `USING btree (organization_id)`
- `grant_by_practice`: `USING btree (practice_id)`
- `grant_pkey` (primary): `UNIQUE USING btree (id)`

Policies (5):
- `grant_approved_by_practice_administrator`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(app_actor_permitted(practice_id, 'grant.approve'::text) AND (approved_by_user_id = app_actor_id()))`
- `grant_practice_administrators_and_grantee_read`: RESTRICTIVE FOR SELECT TO tp_app
  - USING `((practice_id = ANY (( SELECT app_actor_admin_practice_ids() AS app_actor_admin_practice_ids)::uuid[])) OR (organization_id = ANY (( SELECT app_actor_organization_ids() AS app_actor_organization_ids)::uuid[])))`
- `grant_resolver`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `grant_revoked_by_practice_administrator`: RESTRICTIVE FOR UPDATE TO tp_app
  - USING `app_actor_permitted(practice_id, 'grant.revoke'::text)`
  - WITH CHECK `(app_actor_permitted(practice_id, 'grant.revoke'::text) AND (revoked_by = app_actor_id()))`
- `grant_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `grant_rules`: `BEFORE INSERT OR UPDATE ON "grant" FOR EACH ROW EXECUTE FUNCTION grant_rules()` raises: "a grant goes to a practice group or a firm; internal access is a support grant"; "a grant is approved by a current practice administrator of its practice"; "a grant rests on a BAA or engagement letter of the grantee, or of the practice's group naming the practice"; "a grant is revoked by a current practice administrator of its practice"; "a grant never changes after approval; revoke it and approve a new one"; "a grant is revoked once"
- `grant_security_events`: `AFTER INSERT OR UPDATE OF revoked_at ON "grant" FOR EACH ROW EXECUTE FUNCTION grant_security_events()`
- `grant_updated_at`: `BEFORE UPDATE ON "grant" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `invitation`

<a id="table-invitation"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `membership_id` | `uuid` | NOT NULL |  | `membership(id)` |  |
| 4 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 5 | `invited_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 6 | `sent_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `expires_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 8 | `sends` | `integer` | NOT NULL | `1` |  |  |
| 9 | `last_sent_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 10 | `accepted_at` | `timestamp with time zone` | null |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `invitation_membership_id_key`: `UNIQUE (membership_id)`

Foreign keys:
- `invitation_invited_by_fkey`: (invited_by) -> `user`(id) on delete no action
- `invitation_last_sent_by_fkey`: (last_sent_by) -> `user`(id) on delete no action
- `invitation_membership_id_fkey`: (membership_id) -> `membership`(id) on delete no action
- `invitation_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action
- `invitation_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `invitation_sends_check`: `CHECK (sends >= 1 AND sends <= 1000)`
- `invitation_window`: `CHECK (expires_at > sent_at AND expires_at <= (sent_at + '7 days'::interval))`

Indexes:
- `invitation_by_organization`: `USING btree (organization_id, created_at DESC)`
- `invitation_by_user`: `USING btree (user_id)`
- `invitation_membership_id_key` (constraint): `UNIQUE USING btree (membership_id)`
- `invitation_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `invitation_administrators_and_invitee`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((user_id = app_actor_id()) OR (organization_id = ANY (( SELECT app_actor_administered_organization_ids() AS app_actor_administered_organization_ids)::uuid[])) OR ( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted))`
- `invitation_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Triggers:
- `invitation_rules`: `BEFORE UPDATE ON invitation FOR EACH ROW EXECUTE FUNCTION invitation_rules()` raises: "an invitation names its organization, membership, user and inviter for good"; "an accepted invitation stays accepted"
- `invitation_updated_at`: `BEFORE UPDATE ON invitation FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `invoice`

<a id="table-invoice"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `stripe_invoice_id` | `text` | NOT NULL |  |  |  |
| 4 | `stripe_customer_id` | `text` | NOT NULL |  |  |  |
| 5 | `stripe_subscription_id` | `text` | null |  |  |  |
| 6 | `kind` | `text` | NOT NULL |  |  | one of subscription, audit, other |
| 7 | `number` | `text` | null |  |  |  |
| 8 | `status` | `text` | NOT NULL |  |  | one of draft, open, paid, void, uncollectible |
| 9 | `currency` | `text` | NOT NULL |  |  |  |
| 10 | `amount_due_cents` | `bigint` | NOT NULL |  |  |  |
| 11 | `amount_paid_cents` | `bigint` | NOT NULL |  |  |  |
| 12 | `amount_remaining_cents` | `bigint` | NOT NULL |  |  |  |
| 13 | `period_start` | `timestamp with time zone` | null |  |  |  |
| 14 | `period_end` | `timestamp with time zone` | null |  |  |  |
| 15 | `due_at` | `timestamp with time zone` | null |  |  |  |
| 16 | `paid_at` | `timestamp with time zone` | null |  |  |  |
| 17 | `payment_method_kind` | `text` | null |  |  | one of us_bank_account, card |
| 18 | `attempt_count` | `integer` | NOT NULL | `0` |  |  |
| 19 | `first_failed_at` | `timestamp with time zone` | null |  |  |  |
| 20 | `last_failure_code` | `text` | null |  |  |  |
| 21 | `hosted_invoice_url` | `text` | null |  |  |  |
| 22 | `dunning_stage` | `text` | null |  |  | one of payment_failed, second_notice, third_notice, final_notice, suspended, reinstated, resolved |
| 23 | `dunning_notified_at` | `timestamp with time zone` | null |  |  |  |
| 24 | `stripe_event_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 25 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 26 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `invoice_stripe_invoice_id_key`: `UNIQUE (stripe_invoice_id)`

Foreign keys:
- `invoice_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action

Check constraints:
- `invoice_amount_due_cents_check`: `CHECK (amount_due_cents >= 0)`
- `invoice_amount_paid_cents_check`: `CHECK (amount_paid_cents >= 0)`
- `invoice_attempt_count_check`: `CHECK (attempt_count >= 0)`
- `invoice_check`: `CHECK (amount_remaining_cents >= 0 AND amount_remaining_cents <= amount_due_cents)`
- `invoice_currency_check`: `CHECK (currency = 'usd'::text)`
- `invoice_dunning`: `CHECK ((dunning_stage IS NULL) = (dunning_notified_at IS NULL) AND (dunning_stage IS NULL OR first_failed_at IS NOT NULL))`
- `invoice_dunning_stage_check`: `CHECK (dunning_stage = ANY (ARRAY['payment_failed'::text, 'second_notice'::text, 'third_notice'::text, 'final_notice'::text, 'suspended'::text, 'reinstated'::text, 'resolved'::text]))`
- `invoice_hosted_invoice_url_check`: `CHECK (hosted_invoice_url ~ '^https://[a-z0-9.-]+\.stripe\.com/[A-Za-z0-9/_.~=?&%-]{1,2000}$'::text)`
- `invoice_kind_check`: `CHECK (kind = ANY (ARRAY['subscription'::text, 'audit'::text, 'other'::text]))`
- `invoice_last_failure_code_check`: `CHECK (last_failure_code ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `invoice_number_check`: `CHECK (number ~ '^[A-Za-z0-9-]{1,64}$'::text)`
- `invoice_paid`: `CHECK ((status = 'paid'::text) = (paid_at IS NOT NULL))`
- `invoice_payment_method_kind_check`: `CHECK (payment_method_kind = ANY (ARRAY['us_bank_account'::text, 'card'::text]))`
- `invoice_status_check`: `CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'uncollectible'::text]))`
- `invoice_stripe_customer_id_check`: `CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9_]{1,250}$'::text)`
- `invoice_stripe_invoice_id_check`: `CHECK (stripe_invoice_id ~ '^in_[A-Za-z0-9_]{1,250}$'::text)`
- `invoice_stripe_subscription_id_check`: `CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'::text)`
- `invoice_subscription_kind`: `CHECK (kind <> 'subscription'::text OR stripe_subscription_id IS NOT NULL)`

Indexes:
- `invoice_by_organization`: `USING btree (organization_id, created_at DESC)`
- `invoice_failing`: `USING btree (organization_id, first_failed_at) WHERE ((status = ANY (ARRAY['open'::text, 'uncollectible'::text])) AND (first_failed_at IS NOT NULL))`
- `invoice_paid_by_organization`: `USING btree (organization_id, paid_at) WHERE (status = 'paid'::text)`
- `invoice_pkey` (primary): `UNIQUE USING btree (id)`
- `invoice_stripe_invoice_id_key` (constraint): `UNIQUE USING btree (stripe_invoice_id)`

Policies (3):
- `invoice_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `invoice_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `invoice_owners_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `(app_actor_organization_permitted(organization_id, 'organization.billing'::text) OR ( SELECT app_actor_platform_permitted('billing.manage'::text) AS app_actor_platform_permitted))`

Triggers:
- `invoice_no_truncate`: `BEFORE TRUNCATE ON invoice FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` raises: "% rows are kept"; "a usage snapshot never changes"; "a billing event is recorded once; only its outcome follows"
- `invoice_rules`: `BEFORE DELETE OR UPDATE ON invoice FOR EACH ROW EXECUTE FUNCTION invoice_rules()` raises: "an invoice is kept"; "an invoice belongs to its organization and Stripe invoice for good"; "an invoice's status moves forward only"; "an invoice's first failed payment moves earlier only"
- `invoice_updated_at`: `BEFORE UPDATE ON invoice FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `job_run`

<a id="table-job-run"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `job_run_tenant`, registered by `20261016121000_job_runs`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`attempts`, `error_code`, `finished_at`, `id`, `idempotency_key`, `job_id`, `job_type`, `outcome`, `practice_id`, `singleton_key`, `started_at`)
- Column grant: `tp_app` UPDATE (`attempts`, `error_code`, `finished_at`, `outcome`, `started_at`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `job_id` | `uuid` | NOT NULL |  |  |  |
| 4 | `job_type` | `text` | NOT NULL |  |  | one of intake, parse_835, monitor, price, triage, audit_report, reconcile, digest, export, packet_export, roi_statement, report_document |
| 5 | `singleton_key` | `text` | NOT NULL |  |  |  |
| 6 | `idempotency_key` | `text` | NOT NULL |  |  |  |
| 7 | `attempts` | `integer` | NOT NULL |  |  |  |
| 8 | `outcome` | `text` | NOT NULL |  |  | one of running, retrying, succeeded, failed, refused |
| 9 | `error_code` | `text` | null |  |  |  |
| 10 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 11 | `finished_at` | `timestamp with time zone` | null |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `job_run_once`: `UNIQUE (job_id)`

Foreign keys:
- `job_run_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `job_run_attempts_check`: `CHECK (attempts >= 1)`
- `job_run_error_code_check`: `CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'::text)`
- `job_run_finished`: `CHECK ((outcome = 'running'::text) = (finished_at IS NULL))`
- `job_run_idempotency_key_check`: `CHECK (idempotency_key ~ '^[A-Za-z0-9-]{1,64}$'::text)`
- `job_run_job_type_check`: `CHECK (job_type = ANY (ARRAY['intake'::text, 'parse_835'::text, 'monitor'::text, 'price'::text, 'triage'::text, 'audit_report'::text, 'reconcile'::text, 'digest'::text, 'export'::text, 'packet_export'::text, 'roi_statement'::text, 'report_document'::text]))`
- `job_run_outcome_check`: `CHECK (outcome = ANY (ARRAY['running'::text, 'retrying'::text, 'succeeded'::text, 'failed'::text, 'refused'::text]))`
- `job_run_singleton_key_check`: `CHECK (singleton_key ~ '^[a-z0-9_]+:[0-9a-f-]{36}:[A-Za-z0-9-]{1,64}$'::text)`

Indexes:
- `job_run_by_practice`: `USING btree (practice_id, started_at DESC, id)`
- `job_run_once` (constraint): `UNIQUE USING btree (job_id)`
- `job_run_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `job_run_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `job_run_updated_at`: `BEFORE UPDATE ON job_run FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `ledger_entry`

<a id="table-ledger-entry"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `ledger_entry_tenant`, registered by `20261023120000_recovery_ledger`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`allocated`, `amount_cents`, `case_id`, `created_by`, `effective_on`, `evidence_id`, `evidence_kind`, `id`, `match_id`, `practice_id`, `reason`, `service_line_id`, `stage`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `seq` | `bigint` | NOT NULL |  |  | identity a |
| 4 | `case_id` | `uuid` | NOT NULL |  | `case(id)` |  |
| 5 | `service_line_id` | `uuid` | null |  | `service_line(id)` |  |
| 6 | `stage` | `text` | NOT NULL |  |  | one of approved, posted, deposited, interest, reversed, adjusted, recouped |
| 7 | `amount_cents` | `bigint` | NOT NULL |  |  |  |
| 8 | `evidence_kind` | `text` | NOT NULL |  |  | one of claim, payer_response, posting_row, eft_row, provider_adjustment, ledger_entry |
| 9 | `evidence_id` | `uuid` | NOT NULL |  |  |  |
| 10 | `match_id` | `uuid` | null |  | `ledger_match(id)` |  |
| 11 | `allocated` | `boolean` | NOT NULL | `false` |  |  |
| 12 | `effective_on` | `date` | NOT NULL |  |  |  |
| 13 | `created_by` | `uuid` | null |  | `user(id)` |  |
| 14 | `reason` | `text` | null |  |  | enc:v1 |
| 15 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 16 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `ledger_entry_case_id_fkey`: (case_id) -> `case`(id) on delete no action
- `ledger_entry_created_by_fkey`: (created_by) -> `user`(id) on delete no action
- `ledger_entry_match_id_fkey`: (match_id) -> `ledger_match`(id) on delete no action
- `ledger_entry_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `ledger_entry_service_line_id_fkey`: (service_line_id) -> `service_line`(id) on delete no action

Check constraints:
- `ledger_entry_allocated`: `CHECK (NOT allocated OR (stage = ANY (ARRAY['approved'::text, 'posted'::text, 'deposited'::text, 'interest'::text])))`
- `ledger_entry_correction_says_why`: `CHECK ((stage = ANY (ARRAY['reversed'::text, 'adjusted'::text])) = (reason IS NOT NULL))`
- `ledger_entry_evidence_kind_check`: `CHECK (evidence_kind = ANY (ARRAY['claim'::text, 'payer_response'::text, 'posting_row'::text, 'eft_row'::text, 'provider_adjustment'::text, 'ledger_entry'::text]))`
- `ledger_entry_evidence_of_stage`: `CHECK ( CASE stage     WHEN 'approved'::text THEN evidence_kind = ANY (ARRAY['claim'::text, 'payer_response'::text])     WHEN 'posted'::text THEN evidence_kind = 'posting_row'::text     WHEN 'deposited'::text THEN evidence_kind = 'eft_row'::text     WHEN 'recouped'::text THEN evidence_kind = ANY (ARRAY['provider_adjustment'::text, 'claim'::text])     WHEN 'interest'::text THEN evidence_kind = ANY (ARRAY['provider_adjustment'::text, 'claim'::text])     ELSE evidence_kind = 'ledger_entry'::text END)`
- `ledger_entry_matched`: `CHECK (match_id IS NOT NULL OR (evidence_kind = ANY (ARRAY['payer_response'::text, 'ledger_entry'::text])))`
- `ledger_entry_reason_check`: `CHECK (btrim(reason) <> ''::text AND char_length(reason) <= 8000)`
- `ledger_entry_reason_encrypted`: `CHECK (reason ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `ledger_entry_sign`: `CHECK ( CASE stage     WHEN 'recouped'::text THEN amount_cents < 0     WHEN 'reversed'::text THEN amount_cents <> 0     WHEN 'adjusted'::text THEN amount_cents <> 0     ELSE amount_cents > 0 END)`
- `ledger_entry_stage_check`: `CHECK (stage = ANY (ARRAY['approved'::text, 'posted'::text, 'deposited'::text, 'recouped'::text, 'reversed'::text, 'adjusted'::text, 'interest'::text]))`

Indexes:
- `ledger_entry_by_case`: `USING btree (practice_id, case_id, stage)`
- `ledger_entry_by_date`: `USING btree (practice_id, effective_on)`
- `ledger_entry_by_evidence`: `USING btree (evidence_id)`
- `ledger_entry_by_line`: `USING btree (practice_id, service_line_id, seq)`
- `ledger_entry_once_per_match`: `UNIQUE USING btree (match_id, service_line_id, stage) NULLS NOT DISTINCT WHERE ((match_id IS NOT NULL) AND (stage <> ALL (ARRAY['reversed'::text, 'adjusted'::text])))`
- `ledger_entry_pkey` (primary): `UNIQUE USING btree (id)`
- `ledger_entry_response_once`: `UNIQUE USING btree (evidence_id, service_line_id) NULLS NOT DISTINCT WHERE (evidence_kind = 'payer_response'::text)`
- `ledger_entry_reversed_once`: `UNIQUE USING btree (evidence_id) WHERE (stage = 'reversed'::text)`

Policies (1):
- `ledger_entry_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `ledger_entry_no_truncate`: `BEFORE TRUNCATE ON ledger_entry FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` raises: "% cannot be truncated: the ledger keeps what it recorded"
- `ledger_entry_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_rules()` raises: "a ledger entry is never changed or deleted; a correction is a new entry"; "a specialist corrects an amount after review, in their own name, with the ledger adjustment permission"; "a person writes a ledger entry in their own name, with the reconciliation permission"; "the reconcile job writes ledger entries in no one's name"; "a ledger entry is of a case of its practice"; "a ledger entry of a line is of a line of its case"; "a correction names an entry of a counted stage, or a reversal an adjustment"; "a correction is of its entry's case, line and match"; "a correction is of an entry whose match stands; a reversed match's entries are never corrected again"; "a reversal offsets its entry exactly"; "a person reverses or adjusts an entry, with a reason"; "a correction is never allocated"; "an approval from a payer response is of a recorded response, with no match"; "an approval from a payer response is of a response accepting an amount for its case"; "an entry comes from a standing match"; "an entry carries its match's evidence, for its match's line"; "a % entry comes from a match of its kind"; "an entry is allocated when its match is"
- `ledger_entry_within_evidence`: `BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_evidence()` raises: "the posted or deposited entries of a posting or EFT row never sum past the row's amount"; "the posted or deposited entries of a posting or EFT row, their corrections included, never net below zero"; "a line-level posting posts only the lines of its row's code and date of service"
- `ledger_entry_within_line`: `BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_line()` raises: "a line's posted and deposited never exceed what was approved for it"; "an adjustment keeps its entry between zero and what the entry's evidence shows"

### Table `ledger_match`

<a id="table-ledger-match"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `ledger_match_tenant`, registered by `20261023120000_recovery_ledger`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`allocated`, `claim_id`, `eft_row_id`, `id`, `kind`, `level`, `matched_by`, `outcome`, `posting_row_id`, `practice_id`, `provider_adjustment_id`, `remittance_id`, `service_line_id`)
- Column grant: `tp_app` UPDATE (`reversal_reason`, `reversed_by`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `kind` | `text` | NOT NULL |  |  | one of claim, posting, deposit, recoupment, interest |
| 4 | `claim_id` | `uuid` | null |  | `claim(id)` |  |
| 5 | `posting_row_id` | `uuid` | null |  | `posting_row(id)` |  |
| 6 | `eft_row_id` | `uuid` | null |  | `eft_row(id)` |  |
| 7 | `provider_adjustment_id` | `uuid` | null |  | `provider_adjustment(id)` |  |
| 8 | `remittance_id` | `uuid` | NOT NULL |  | `remittance(id)` |  |
| 9 | `service_line_id` | `uuid` | null |  | `service_line(id)` |  |
| 10 | `outcome` | `text` | null |  |  | one of approved, decreased, no_change |
| 11 | `level` | `text` | null |  |  | one of claim, check, batch |
| 12 | `allocated` | `boolean` | NOT NULL | `false` |  |  |
| 13 | `matched_by` | `uuid` | null |  | `user(id)` |  |
| 14 | `matched_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 15 | `reversed_by` | `uuid` | null |  | `user(id)` |  |
| 16 | `reversed_at` | `timestamp with time zone` | null |  |  |  |
| 17 | `reversal_reason` | `text` | null |  |  | enc:v1 |
| 18 | `evidence_id` | `uuid` | NOT NULL |  |  | generated always as `COALESCE(posting_row_id, eft_row_id, provider_adjustment_id, claim_id)` stored |
| 19 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 20 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `ledger_match_claim_id_fkey`: (claim_id) -> `claim`(id) on delete no action
- `ledger_match_eft_row_id_fkey`: (eft_row_id) -> `eft_row`(id) on delete no action
- `ledger_match_matched_by_fkey`: (matched_by) -> `user`(id) on delete no action
- `ledger_match_posting_row_id_fkey`: (posting_row_id) -> `posting_row`(id) on delete no action
- `ledger_match_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `ledger_match_provider_adjustment_id_fkey`: (provider_adjustment_id) -> `provider_adjustment`(id) on delete no action
- `ledger_match_remittance_id_fkey`: (remittance_id) -> `remittance`(id) on delete no action
- `ledger_match_reversed_by_fkey`: (reversed_by) -> `user`(id) on delete no action
- `ledger_match_service_line_id_fkey`: (service_line_id) -> `service_line`(id) on delete no action

Check constraints:
- `ledger_match_allocated`: `CHECK (NOT allocated OR kind = 'posting'::text AND level = 'check'::text OR kind = 'interest'::text)`
- `ledger_match_evidence`: `CHECK ( CASE kind     WHEN 'claim'::text THEN claim_id IS NOT NULL AND num_nonnulls(posting_row_id, eft_row_id, provider_adjustment_id, level) = 0 AND service_line_id IS NOT NULL AND outcome IS NOT NULL     WHEN 'posting'::text THEN posting_row_id IS NOT NULL AND num_nonnulls(eft_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND (level = ANY (ARRAY['claim'::text, 'check'::text])) AND (claim_id IS NOT NULL) = (level = 'claim'::text)     WHEN 'deposit'::text THEN eft_row_id IS NOT NULL AND num_nonnulls(claim_id, posting_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND (level = ANY (ARRAY['check'::text, 'batch'::text]))     ELSE num_nonnulls(claim_id, provider_adjustment_id) = 1 AND num_nonnulls(posting_row_id, eft_row_id, outcome, level) = 0 AND service_line_id IS NOT NULL END)`
- `ledger_match_kind_check`: `CHECK (kind = ANY (ARRAY['claim'::text, 'posting'::text, 'deposit'::text, 'recoupment'::text, 'interest'::text]))`
- `ledger_match_level_check`: `CHECK (level = ANY (ARRAY['claim'::text, 'check'::text, 'batch'::text]))`
- `ledger_match_outcome_check`: `CHECK (outcome = ANY (ARRAY['approved'::text, 'decreased'::text, 'no_change'::text]))`
- `ledger_match_reversal_reason_check`: `CHECK (btrim(reversal_reason) <> ''::text AND char_length(reversal_reason) <= 8000)`
- `ledger_match_reversal_reason_encrypted`: `CHECK (reversal_reason ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `ledger_match_reversed_together`: `CHECK ((reversed_at IS NULL) = (reversed_by IS NULL) AND (reversed_at IS NULL) = (reversal_reason IS NULL))`

Indexes:
- `ledger_match_by_line`: `USING btree (practice_id, service_line_id) WHERE (service_line_id IS NOT NULL)`
- `ledger_match_by_remittance`: `USING btree (practice_id, remittance_id)`
- `ledger_match_pkey` (primary): `UNIQUE USING btree (id)`
- `ledger_match_standing`: `UNIQUE USING btree (kind, evidence_id, service_line_id) NULLS NOT DISTINCT WHERE (reversed_at IS NULL)`

Policies (1):
- `ledger_match_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `ledger_match_no_truncate`: `BEFORE TRUNCATE ON ledger_match FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` raises: "% cannot be truncated: the ledger keeps what it recorded"
- `ledger_match_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON ledger_match FOR EACH ROW EXECUTE FUNCTION ledger_match_rules()` raises: "a match is never deleted; it is reversed"; "a match never changes; it is reversed"; "a match is reversed once"; "a match is reversed by a person who reconciles postings, in their own name, with a reason"; "a match is recorded standing"; "a person who reconciles postings matches by hand, in their own name"; "the reconcile job matches in no one's name"; "a match is to a loaded remittance of its practice"; "a match is to a service line of its practice"; "a claim match is of a claim of its remittance, never a reversal"; "a posting match is of a posting row of its practice, and a line-level one of a claim of its remittance"; "a deposit match is of an EFT row of its practice"; "a recoupment is a PLB WO or a reversing claim of its remittance"; "interest is a PLB L6 or a claim's interest of its remittance"
- `ledger_match_updated_at`: `BEFORE UPDATE ON ledger_match FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `line_note`

<a id="table-line-note"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `line_note_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`created_by`, `id`, `note`, `practice_id`, `service_line_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` |  |
| 4 | `note` | `text` | NOT NULL |  |  | enc:v1 |
| 5 | `created_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `line_note_created_by_fkey`: (created_by) -> `user`(id) on delete no action
- `line_note_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `line_note_service_line_id_fkey`: (service_line_id) -> `service_line`(id) on delete no action

Check constraints:
- `line_note_note_check`: `CHECK (note ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`

Indexes:
- `line_note_by_line`: `USING btree (practice_id, service_line_id, created_at)`
- `line_note_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `line_note_created_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(created_by = app_actor_id())`
- `line_note_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `line_note_references_in_practice`: `BEFORE INSERT ON line_note FOR EACH ROW EXECUTE FUNCTION line_note_references_in_practice()` raises: "a note belongs to a service line of the same practice"
- `line_note_updated_at`: `BEFORE UPDATE ON line_note FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `line_status`

<a id="table-line-status"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `line_status_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `practice_id`, `priced_line_id`, `reason`, `reopened_from`, `service_line_id`, `set_by`, `stage`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` |  |
| 4 | `seq` | `bigint` | NOT NULL |  |  | identity a |
| 5 | `stage` | `text` | NOT NULL |  |  | one of flagged, validated, actionable, payer_approved, recovered |
| 6 | `set_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `set_by` | `uuid` | null |  | `user(id)` |  |
| 8 | `reason` | `text` | null |  |  | enc:v1 |
| 9 | `reopened_from` | `text` | null |  |  | one of flagged, validated, actionable, payer_approved, recovered |
| 10 | `priced_line_id` | `uuid` | null |  | `priced_line(id)` |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `line_status_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `line_status_priced_line_id_fkey`: (priced_line_id) -> `priced_line`(id) on delete no action
- `line_status_service_line_id_fkey`: (service_line_id) -> `service_line`(id) on delete no action
- `line_status_set_by_fkey`: (set_by) -> `user`(id) on delete no action

Check constraints:
- `line_status_reason_check`: `CHECK (reason IS NULL OR btrim(reason) <> ''::text AND char_length(reason) <= 4000)`
- `line_status_reason_encrypted`: `CHECK (reason ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `line_status_reopen_says_why`: `CHECK ((reopened_from IS NULL) = (reason IS NULL))`
- `line_status_reopened_from_check`: `CHECK (reopened_from = ANY (ARRAY['flagged'::text, 'validated'::text, 'actionable'::text, 'payer_approved'::text, 'recovered'::text]))`
- `line_status_stage_check`: `CHECK (stage = ANY (ARRAY['flagged'::text, 'validated'::text, 'actionable'::text, 'payer_approved'::text, 'recovered'::text]))`

Indexes:
- `line_status_by_line`: `USING btree (practice_id, service_line_id, seq DESC)`
- `line_status_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `line_status_set_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK ` CASE     WHEN ( SELECT app_actor_is_person() AS app_actor_is_person) THEN ((NOT (set_by IS DISTINCT FROM app_actor_id())) AND (COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false) OR (COALESCE(app_actor_permitted(practice_id, 'ledger.adjust'::text), false) AND ((stage = ANY (ARRAY['payer_approved'::text, 'recovered'::text])) OR ((reopened_from = ANY (ARRAY['payer_approved'::text, 'recovered'::text])) AND (stage = COALESCE(ledger_line_stage(service_line_id), 'actionable'::text)))))))     ELSE (set_by IS NULL) END`
- `line_status_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `line_status_belongs`: `AFTER INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_belongs()` raises: "a stage is set in its setter's own name"; "a stage is set on a service line of its practice"; "a stage is judged from a priced line of its own service line"
- `line_status_ledger_rules`: `BEFORE INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_ledger_rules()` raises: "the ledger holds no entries that put the line at %: nothing counts as recovered without a posted or deposited entry"; "the ledger moves a line back only to the stage its entries leave it at"
- `line_status_never_deleted`: `BEFORE DELETE ON line_status FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()` raises: "% rows are never deleted: triage, cases and reports keep what they recorded"
- `line_status_no_truncate`: `BEFORE TRUNCATE ON line_status FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()` raises: "% cannot be truncated: triage, cases and reports keep what they recorded"
- `line_status_refresh_cases`: `AFTER INSERT ON line_status REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION line_status_refresh_cases()`
- `line_status_rules`: `BEFORE INSERT OR UPDATE ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_rules()` raises: "a line's stage events never change; a reopen is a new event"; "line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason"; "a reopen names the stage the line is at"; "a reopen keeps the line at its stage or moves it back; moving forward is not a reopen"; "a reopen is a person's explicit action"

### Table `membership`

<a id="table-membership"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`ends_at`, `id`, `organization_id`, `role`, `user_id`)
- Column grant: `tp_app` UPDATE (`ends_at`, `role`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 4 | `role` | `text` | NOT NULL |  |  | one of practice_admin, billing_manager, analyst, viewer, firm_principal, firm_analyst, platform_admin, contract_specialist, reviewer, support |
| 5 | `ends_at` | `timestamp with time zone` | null |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `membership_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action
- `membership_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `membership_role_check`: `CHECK (role = ANY (ARRAY['practice_admin'::text, 'billing_manager'::text, 'analyst'::text, 'viewer'::text, 'firm_principal'::text, 'firm_analyst'::text, 'platform_admin'::text, 'contract_specialist'::text, 'reviewer'::text, 'support'::text]))`

Indexes:
- `membership_by_user`: `USING btree (user_id)`
- `membership_open`: `UNIQUE USING btree (organization_id, user_id) WHERE (ends_at IS NULL)`
- `membership_pkey` (primary): `UNIQUE USING btree (id)`

Policies (4):
- `membership_administrators_insert`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(((organization_id = ANY (( SELECT app_actor_administered_organization_ids() AS app_actor_administered_organization_ids)::uuid[])) AND (NOT user_known_elsewhere(user_id, organization_id))) OR (( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted) AND (EXISTS ( SELECT 1    FROM organization o   WHERE ((o.id = membership.organization_id) AND (o.kind = ANY (ARRAY['group'::text, 'firm'::text])))))))`
- `membership_administrators_update`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `((organization_id = ANY (( SELECT app_actor_administered_organization_ids() AS app_actor_administered_organization_ids)::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`
  - WITH CHECK `((organization_id = ANY (( SELECT app_actor_administered_organization_ids() AS app_actor_administered_organization_ids)::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`
- `membership_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `membership_self_and_administrators`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((user_id = app_actor_id()) OR (organization_id = ANY (( SELECT app_actor_administered_organization_ids() AS app_actor_administered_organization_ids)::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`

Triggers:
- `membership_invitation`: `AFTER INSERT ON membership FOR EACH ROW EXECUTE FUNCTION membership_invitation()`
- `membership_keeps_practice_administrator`: `AFTER DELETE OR UPDATE ON membership DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION membership_keeps_practice_administrator()`
- `membership_role_fits_organization`: `BEFORE INSERT OR UPDATE OF organization_id, role ON membership FOR EACH ROW EXECUTE FUNCTION membership_role_fits_organization()` raises: "role % does not belong in a % organization"
- `membership_rules`: `BEFORE INSERT OR UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION membership_rules()` raises: "an ended membership never changes; invite the user again"; "nobody grants themselves a membership or changes their own role"
- `membership_security_events`: `AFTER INSERT OR UPDATE OF role ON membership FOR EACH ROW EXECUTE FUNCTION membership_security_events()`
- `membership_updated_at`: `BEFORE UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `model_budget_hold`

<a id="table-model-budget-hold"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `model_budget_hold_tenant`, registered by `20261031090000_model_budget_holds`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), DELETE
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`expires_at`, `held_unrounded`, `practice_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `held_unrounded` | `numeric(18,6)` | NOT NULL |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 5 | `expires_at` | `timestamp with time zone` | NOT NULL |  |  |  |

Foreign keys:
- `model_budget_hold_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `model_budget_hold_expires_after`: `CHECK (expires_at > created_at)`
- `model_budget_hold_held_unrounded_check`: `CHECK (held_unrounded >= 0::numeric)`

Indexes:
- `model_budget_hold_by_practice`: `USING btree (practice_id, expires_at)`
- `model_budget_hold_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `model_budget_hold_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

### Table `model_call`

<a id="table-model-call"></a>

- Class: tenant (nullable practice_id), not PHI; owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: SELECT, INSERT(cols)
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`actor_id`, `actor_kind`, `attempts`, `citations`, `cost_cents`, `cost_unrounded`, `error_code`, `id`, `idempotency_key`, `input_hashes`, `latency_ms`, `model_id`, `outcome`, `output_sha256`, `practice_id`, `prompt_version`, `provider`, `purpose`, `tokens_in`, `tokens_out`, `verifier_passed`)
- Column grant: `tp_app` UPDATE (`reviewer_changed_fields`, `reviewer_decision`)
- Column grant: `tp_operator` INSERT (`actor_id`, `actor_kind`, `attempts`, `citations`, `cost_cents`, `cost_unrounded`, `error_code`, `id`, `idempotency_key`, `input_hashes`, `latency_ms`, `model_id`, `outcome`, `output_sha256`, `practice_id`, `prompt_version`, `provider`, `purpose`, `tokens_in`, `tokens_out`, `verifier_passed`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | null |  | `practice(id)` |  |
| 3 | `actor_kind` | `text` | NOT NULL |  |  | one of user, service, evaluation |
| 4 | `actor_id` | `uuid` | null |  |  |  |
| 5 | `purpose` | `text` | NOT NULL |  |  | one of proposeContractTerms, readDenialLetter, draftPacketNarrative, suggestEvidenceRequests |
| 6 | `provider` | `text` | NOT NULL |  |  | one of bedrock, anthropic, local |
| 7 | `model_id` | `text` | NOT NULL |  |  |  |
| 8 | `prompt_version` | `text` | NOT NULL |  |  |  |
| 9 | `idempotency_key` | `text` | NOT NULL |  |  |  |
| 10 | `input_hashes` | `text[]` | NOT NULL |  |  |  |
| 11 | `output_sha256` | `text` | null |  |  |  |
| 12 | `tokens_in` | `integer` | NOT NULL |  |  |  |
| 13 | `tokens_out` | `integer` | NOT NULL |  |  |  |
| 14 | `cost_cents` | `bigint` | NOT NULL |  |  |  |
| 15 | `cost_unrounded` | `numeric(18,6)` | NOT NULL |  |  |  |
| 16 | `citations` | `jsonb` | NOT NULL |  |  |  |
| 17 | `verifier_passed` | `boolean` | null |  |  |  |
| 18 | `outcome` | `text` | NOT NULL |  |  | one of completed, failed, timed_out |
| 19 | `error_code` | `text` | null |  |  |  |
| 20 | `attempts` | `integer` | NOT NULL |  |  |  |
| 21 | `latency_ms` | `integer` | NOT NULL |  |  |  |
| 22 | `reviewer_decision` | `text` | null |  |  | one of accepted, accepted_with_changes, rejected |
| 23 | `reviewer_changed_fields` | `text[]` | null |  |  |  |
| 24 | `reviewed_by` | `uuid` | null |  | `user(id)` |  |
| 25 | `reviewed_at` | `timestamp with time zone` | null |  |  |  |
| 26 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `model_call_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `model_call_reviewed_by_fkey`: (reviewed_by) -> `user`(id) on delete no action

Check constraints:
- `model_call_actor`: `CHECK ((actor_kind = 'evaluation'::text) = (actor_id IS NULL))`
- `model_call_actor_kind_check`: `CHECK (actor_kind = ANY (ARRAY['user'::text, 'service'::text, 'evaluation'::text]))`
- `model_call_attempts_check`: `CHECK (attempts = ANY (ARRAY[1, 2]))`
- `model_call_citations_check`: `CHECK (model_citations_valid(citations))`
- `model_call_cost_cents_check`: `CHECK (cost_cents >= 0)`
- `model_call_cost_rounded_up`: `CHECK (cost_cents::numeric = ceil(cost_unrounded))`
- `model_call_cost_unrounded_check`: `CHECK (cost_unrounded >= 0::numeric)`
- `model_call_error_code_check`: `CHECK (error_code ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `model_call_evaluation_is_synthetic`: `CHECK ((practice_id IS NULL) = (actor_kind = 'evaluation'::text))`
- `model_call_idempotency_key_check`: `CHECK (idempotency_key ~ '^[0-9a-f]{64}$'::text)`
- `model_call_input_hashes_check`: `CHECK (model_hashes_valid(input_hashes))`
- `model_call_latency_ms_check`: `CHECK (latency_ms >= 0)`
- `model_call_model_id_check`: `CHECK (model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'::text)`
- `model_call_outcome`: `CHECK ( CASE outcome     WHEN 'completed'::text THEN output_sha256 IS NOT NULL AND verifier_passed IS NOT NULL AND error_code IS NULL     ELSE output_sha256 IS NULL AND verifier_passed IS NULL AND error_code IS NOT NULL AND citations = '[]'::jsonb END)`
- `model_call_outcome_check`: `CHECK (outcome = ANY (ARRAY['completed'::text, 'failed'::text, 'timed_out'::text]))`
- `model_call_output_sha256_check`: `CHECK (output_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `model_call_prompt_version_check`: `CHECK (prompt_version ~ '^[a-z][a-z0-9-]{0,63}/[1-9][0-9]{0,3}$'::text)`
- `model_call_provider_check`: `CHECK (provider = ANY (ARRAY['bedrock'::text, 'anthropic'::text, 'local'::text]))`
- `model_call_purpose_check`: `CHECK (purpose = ANY (ARRAY['proposeContractTerms'::text, 'readDenialLetter'::text, 'draftPacketNarrative'::text, 'suggestEvidenceRequests'::text]))`
- `model_call_review`: `CHECK ((reviewer_decision IS NULL) = (reviewed_at IS NULL) AND (reviewer_decision IS NULL) = (reviewer_changed_fields IS NULL) AND (reviewer_decision IS NULL OR outcome = 'completed'::text) AND (reviewer_decision IS NULL OR (reviewer_decision = 'accepted_with_changes'::text) = (cardinality(reviewer_changed_fields) > 0)))`
- `model_call_reviewer_changed_fields_check`: `CHECK (model_field_paths_valid(reviewer_changed_fields))`
- `model_call_reviewer_decision_check`: `CHECK (reviewer_decision = ANY (ARRAY['accepted'::text, 'accepted_with_changes'::text, 'rejected'::text]))`
- `model_call_tokens_in_check`: `CHECK (tokens_in >= 0)`
- `model_call_tokens_out_check`: `CHECK (tokens_out >= 0)`

Indexes:
- `model_call_by_practice`: `USING btree (practice_id, created_at)`
- `model_call_completed_once`: `UNIQUE USING btree (idempotency_key) WHERE (outcome = 'completed'::text)`
- `model_call_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `model_call_synthetic_evaluation`: PERMISSIVE FOR ALL TO tp_operator
  - USING `(practice_id IS NULL)`
  - WITH CHECK `(practice_id IS NULL)`
- `model_call_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `model_call_no_truncate`: `BEFORE TRUNCATE ON model_call FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()` raises: "% cannot be truncated: the gateway's records are kept"
- `model_call_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON model_call FOR EACH ROW EXECUTE FUNCTION model_call_rules()` raises: "a model call is kept: its log row is never deleted"; "a model call is logged unreviewed; the reviewer's decision comes later"; "a model call is logged in the name of the transaction's actor"; "a model call never changes; only the reviewer's decision is recorded, once"; "the reviewer's decision is recorded by a person who may review the call's purpose in its practice"

### Table `model_proposal`

<a id="table-model-proposal"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `model_proposal_tenant`, registered by `20261029190000_model_proposals`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`contract_version_id`, `id`, `model_call_id`, `packet_version_id`, `practice_id`, `proposal`, `proposed_by`, `purpose`, `source_document_id`, `verifier_passed`)
- Column grant: `tp_app` UPDATE (`eval_example_id`, `reviewed_at`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `model_call_id` | `uuid` | NOT NULL |  | `model_call(id)` |  |
| 4 | `purpose` | `text` | NOT NULL |  |  | one of proposeContractTerms, draftPacketNarrative, suggestEvidenceRequests |
| 5 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` |  |
| 6 | `source_document_id` | `uuid` | null |  | `source_document(id)` |  |
| 7 | `packet_version_id` | `uuid` | null |  | `packet_version(id)` |  |
| 8 | `proposal` | `jsonb` | NOT NULL |  |  |  |
| 9 | `verifier_passed` | `boolean` | NOT NULL |  |  |  |
| 10 | `proposed_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 11 | `reviewed_at` | `timestamp with time zone` | null |  |  |  |
| 12 | `eval_example_id` | `uuid` | null |  | `eval_example(id)` |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `model_proposal_once`: `UNIQUE (model_call_id)`

Foreign keys:
- `model_proposal_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id) on delete no action
- `model_proposal_eval_example_id_fkey`: (eval_example_id) -> `eval_example`(id) on delete no action
- `model_proposal_model_call_id_fkey`: (model_call_id) -> `model_call`(id) on delete no action
- `model_proposal_packet_version_id_fkey`: (packet_version_id) -> `packet_version`(id) on delete no action
- `model_proposal_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `model_proposal_proposed_by_fkey`: (proposed_by) -> `user`(id) on delete no action
- `model_proposal_source_document_id_fkey`: (source_document_id) -> `source_document`(id) on delete no action

Check constraints:
- `model_proposal_example_after_review`: `CHECK (eval_example_id IS NULL OR reviewed_at IS NOT NULL)`
- `model_proposal_proposal_check`: `CHECK (jsonb_typeof(proposal) = 'object'::text)`
- `model_proposal_purpose_check`: `CHECK (purpose = ANY (ARRAY['proposeContractTerms'::text, 'draftPacketNarrative'::text, 'suggestEvidenceRequests'::text]))`
- `model_proposal_subject`: `CHECK ( CASE purpose     WHEN 'proposeContractTerms'::text THEN contract_version_id IS NOT NULL AND source_document_id IS NOT NULL AND packet_version_id IS NULL     WHEN 'draftPacketNarrative'::text THEN packet_version_id IS NOT NULL AND contract_version_id IS NULL AND source_document_id IS NULL     ELSE contract_version_id IS NULL AND source_document_id IS NULL AND packet_version_id IS NULL END)`

Indexes:
- `model_proposal_by_packet_version`: `USING btree (packet_version_id) WHERE (packet_version_id IS NOT NULL)`
- `model_proposal_by_practice`: `USING btree (practice_id, created_at)`
- `model_proposal_by_version`: `USING btree (contract_version_id) WHERE (contract_version_id IS NOT NULL)`
- `model_proposal_once` (constraint): `UNIQUE USING btree (model_call_id)`
- `model_proposal_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `model_proposal_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `model_proposal_no_truncate`: `BEFORE TRUNCATE ON model_proposal FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()` raises: "% cannot be truncated: the gateway's records are kept"
- `model_proposal_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON model_proposal FOR EACH ROW EXECUTE FUNCTION model_proposal_rules()` raises: "a model proposal is kept: it is never deleted"; "a model proposal is written unreviewed"; "a model proposal is written by the person who asked for it"; "a model proposal names a completed, unreviewed call its writer made in the practice for its purpose"; "a model proposal never changes; its review and its example are recorded once"; "a proposal is reviewed once the reviewer's decision is recorded on its model call"; "a proposal's example is a permitted example of its own practice and purpose"

### Table `mutation_request`

<a id="table-mutation-request"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `request_key`, `route_id`, `user_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 3 | `request_key` | `uuid` | NOT NULL |  |  |  |
| 4 | `route_id` | `text` | NOT NULL |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `mutation_request_once`: `UNIQUE (user_id, request_key)`

Foreign keys:
- `mutation_request_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `mutation_request_route_id_check`: `CHECK (route_id ~ '^[a-z][a-z0-9_.]{0,63}$'::text)`

Indexes:
- `mutation_request_once` (constraint): `UNIQUE USING btree (user_id, request_key)`
- `mutation_request_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `mutation_request_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `mutation_request_self`: PERMISSIVE FOR ALL TO tp_app
  - USING `(user_id = app_actor_id())`
  - WITH CHECK `(user_id = app_actor_id())`

### Table `notification`

<a id="table-notification"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `notification_tenant`, registered by `20261020090000_monitoring_digests_notifications`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`counts`, `id`, `kind`, `practice_id`, `subject_id`, `totals_cents`, `user_id`)
- Column grant: `tp_app` UPDATE (`read_at`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | one of monitoring_run, digest, recoupment, follow_up |
| 5 | `subject_id` | `uuid` | NOT NULL |  |  |  |
| 6 | `counts` | `jsonb` | NOT NULL |  |  |  |
| 7 | `totals_cents` | `jsonb` | NOT NULL |  |  |  |
| 8 | `read_at` | `timestamp with time zone` | null |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `notification_once`: `UNIQUE (user_id, kind, subject_id)`

Foreign keys:
- `notification_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `notification_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `notification_counts_only`: `CHECK (figures_are_counts(counts))`
- `notification_kind_check`: `CHECK (kind = ANY (ARRAY['monitoring_run'::text, 'digest'::text, 'recoupment'::text, 'follow_up'::text]))`
- `notification_totals_only`: `CHECK (figures_are_cents(totals_cents))`

Indexes:
- `notification_by_practice`: `USING btree (practice_id, user_id, created_at DESC, id)`
- `notification_once` (constraint): `UNIQUE USING btree (user_id, kind, subject_id)`
- `notification_pkey` (primary): `UNIQUE USING btree (id)`

Policies (4):
- `notification_recipient_marks`: RESTRICTIVE FOR UPDATE TO tp_app
  - USING `(user_id = app_actor_id())`
  - WITH CHECK `(user_id = app_actor_id())`
- `notification_recipient_reads`: RESTRICTIVE FOR SELECT TO tp_app
  - USING `((user_id = app_actor_id()) OR (NOT ( SELECT app_actor_is_person() AS app_actor_is_person)))`
- `notification_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
- `notification_written_for`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((user_id = app_actor_id()) OR ((NOT ( SELECT app_actor_is_person() AS app_actor_is_person)) AND COALESCE(user_reaches_practice_now(user_id, practice_id), false)))`

Triggers:
- `notification_rules`: `BEFORE DELETE OR UPDATE ON notification FOR EACH ROW EXECUTE FUNCTION notification_rules()` raises: "a notification is never deleted"; "a notification never changes; only when it was read is recorded"; "a notification is read once"; "a notification records the time it was read"
- `notification_updated_at`: `BEFORE UPDATE ON notification FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `organization`

<a id="table-organization"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: SELECT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`billing_customer_ref`, `id`, `kind`, `name`, `status`)
- Column grant: `tp_app` UPDATE (`billing_customer_ref`, `name`, `status`)
- Column grant: `tp_billing` UPDATE (`billing_customer_ref`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `kind` | `text` | NOT NULL |  |  | one of group, firm, internal |
| 3 | `name` | `text` | NOT NULL |  |  |  |
| 4 | `billing_customer_ref` | `text` | null |  |  |  |
| 5 | `status` | `text` | NOT NULL | `'active'::text` |  | one of active, suspended, closed |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Check constraints:
- `organization_billing_customer_ref_check`: `CHECK (billing_customer_ref ~ '^[A-Za-z0-9_]{1,255}$'::text)`
- `organization_kind_check`: `CHECK (kind = ANY (ARRAY['group'::text, 'firm'::text, 'internal'::text]))`
- `organization_name_check`: `CHECK (btrim(name) <> ''::text)`
- `organization_status_check`: `CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]))`

Indexes:
- `organization_pkey` (primary): `UNIQUE USING btree (id)`

Policies (6):
- `organization_billing_customer`: PERMISSIVE FOR UPDATE TO tp_billing
  - USING `(billing_customer_ref IS NULL)`
  - WITH CHECK `true`
- `organization_billing_read`: PERMISSIVE FOR SELECT TO tp_billing
  - USING `true`
- `organization_members`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((id = ANY (( SELECT app_actor_organization_ids() AS app_actor_organization_ids)::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`
- `organization_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `organization_platform_admin_insert`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin) AND (kind = ANY (ARRAY['group'::text, 'firm'::text])))`
- `organization_platform_admin_update`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin)`
  - WITH CHECK `( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin)`

Triggers:
- `organization_kind_fixed`: `BEFORE UPDATE OF kind ON organization FOR EACH ROW EXECUTE FUNCTION organization_kind_fixed()` raises: "organization kind is fixed at creation"
- `organization_updated_at`: `BEFORE UPDATE ON organization FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `packet`

<a id="table-packet"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `packet_tenant`, registered by `20261023090000_packets_submissions_and_responses`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`case_id`, `id`, `practice_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` |  |
| 4 | `current_version_id` | `uuid` | null |  | `packet_version(id)` |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `packet_once_per_case`: `UNIQUE (case_id)`

Foreign keys:
- `packet_case_id_fkey`: (case_id) -> `case`(id) on delete no action
- `packet_current_version_fk`: (current_version_id) -> `packet_version`(id) on delete no action
- `packet_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Indexes:
- `packet_by_practice`: `USING btree (practice_id, case_id)`
- `packet_once_per_case` (constraint): `UNIQUE USING btree (case_id)`
- `packet_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `packet_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `packet_belongs`: `AFTER INSERT ON packet FOR EACH ROW EXECUTE FUNCTION packet_belongs()` raises: "a packet is opened by a person who drafts packets"; "a packet is of a case of its practice that is not closed"
- `packet_never_deleted`: `BEFORE DELETE ON packet FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` raises: "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `packet_no_truncate`: `BEFORE TRUNCATE ON packet FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` raises: "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `packet_rules`: `BEFORE INSERT OR UPDATE ON packet FOR EACH ROW EXECUTE FUNCTION packet_rules()` raises: "a packet is opened with no version; writing one makes it current"; "a packet's case never changes"; "a packet's current version is the version written last"
- `packet_updated_at`: `BEFORE UPDATE ON packet FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `packet_version`

<a id="table-packet-version"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `packet_version_tenant`, registered by `20261023090000_packets_submissions_and_responses`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`content`, `content_sha256`, `drafted_by`, `id`, `narrative`, `packet_id`, `practice_id`, `verifier_passed`, `verifier_report`, `version_no`)
- Column grant: `tp_app` UPDATE (`approved_by`, `approved_sha256`, `export_csv_key`, `export_csv_sha256`, `export_pdf_key`, `export_sha256`, `regulation_confirmed_by`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `packet_id` | `uuid` | NOT NULL |  | `packet(id)` |  |
| 4 | `version_no` | `integer` | NOT NULL |  |  |  |
| 5 | `content` | `jsonb` | NOT NULL |  |  |  |
| 6 | `citation` | `jsonb` | null |  |  | generated always as `(content -> 'citation'::text)` stored |
| 7 | `line_table` | `jsonb` | null |  |  | generated always as `(content -> 'lines'::text)` stored |
| 8 | `evidence` | `jsonb` | null |  |  | generated always as `(content -> 'evidence'::text)` stored |
| 9 | `interest_cents` | `bigint` | null |  |  | generated always as `(((content -> 'interest'::text) ->> 'total_cents'::text))::bigint` stored |
| 10 | `dispute_level` | `integer` | null |  |  | generated always as `((content ->> 'dispute_level'::text))::integer` stored |
| 11 | `narrative` | `text` | NOT NULL |  |  | enc:v1 |
| 12 | `content_sha256` | `text` | NOT NULL |  |  |  |
| 13 | `verifier_passed` | `boolean` | NOT NULL |  |  |  |
| 14 | `verifier_report` | `jsonb` | NOT NULL |  |  |  |
| 15 | `drafted_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 16 | `regulation_confirmed_by` | `uuid` | null |  | `user(id)` |  |
| 17 | `regulation_confirmed_at` | `timestamp with time zone` | null |  |  |  |
| 18 | `approved_by` | `uuid` | null |  | `user(id)` |  |
| 19 | `approved_at` | `timestamp with time zone` | null |  |  |  |
| 20 | `approved_sha256` | `text` | null |  |  |  |
| 21 | `approved_alone` | `boolean` | NOT NULL | `false` |  |  |
| 22 | `export_pdf_key` | `text` | null |  |  |  |
| 23 | `export_csv_key` | `text` | null |  |  |  |
| 24 | `export_sha256` | `text` | null |  |  |  |
| 25 | `export_csv_sha256` | `text` | null |  |  |  |
| 26 | `exported_at` | `timestamp with time zone` | null |  |  |  |
| 27 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 28 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `packet_version_numbered`: `UNIQUE (packet_id, version_no)`

Foreign keys:
- `packet_version_approved_by_fkey`: (approved_by) -> `user`(id) on delete no action
- `packet_version_drafted_by_fkey`: (drafted_by) -> `user`(id) on delete no action
- `packet_version_packet_id_fkey`: (packet_id) -> `packet`(id) on delete no action
- `packet_version_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `packet_version_regulation_confirmed_by_fkey`: (regulation_confirmed_by) -> `user`(id) on delete no action

Check constraints:
- `packet_version_alone_only_approved`: `CHECK (NOT approved_alone OR approved_by IS NOT NULL)`
- `packet_version_approval_names_its_hash`: `CHECK (approved_sha256 IS NULL OR approved_sha256 = content_sha256)`
- `packet_version_approval_needs_verifier`: `CHECK (approved_by IS NULL OR verifier_passed)`
- `packet_version_approved_sha256_check`: `CHECK (approved_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `packet_version_approved_together`: `CHECK ((approved_by IS NULL) = (approved_at IS NULL) AND (approved_at IS NULL) = (approved_sha256 IS NULL))`
- `packet_version_confirmed_together`: `CHECK ((regulation_confirmed_by IS NULL) = (regulation_confirmed_at IS NULL))`
- `packet_version_content_sha256_check`: `CHECK (content_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `packet_version_content_valid`: `CHECK (packet_content_valid(content))`
- `packet_version_export_csv_key_check`: `CHECK (export_csv_key ~ '^practices/[0-9a-f-]{36}/packets/[0-9a-f-]{36}/[0-9a-f-]{36}\.csv$'::text)`
- `packet_version_export_csv_sha256_check`: `CHECK (export_csv_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `packet_version_export_keys_its_own`: `CHECK ((export_pdf_key IS NULL OR starts_with(export_pdf_key, ((('practices/'::text \|\| practice_id::text) \|\| '/packets/'::text) \|\| packet_id::text) \|\| '/'::text)) AND (export_csv_key IS NULL OR starts_with(export_csv_key, ((('practices/'::text \|\| practice_id::text) \|\| '/packets/'::text) \|\| packet_id::text) \|\| '/'::text)))`
- `packet_version_export_needs_approval`: `CHECK (exported_at IS NULL OR approved_at IS NOT NULL)`
- `packet_version_export_pdf_key_check`: `CHECK (export_pdf_key ~ '^practices/[0-9a-f-]{36}/packets/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'::text)`
- `packet_version_export_sha256_check`: `CHECK (export_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `packet_version_exported_together`: `CHECK ((exported_at IS NULL) = (export_pdf_key IS NULL) AND (exported_at IS NULL) = (export_csv_key IS NULL) AND (exported_at IS NULL) = (export_sha256 IS NULL) AND (exported_at IS NULL) = (export_csv_sha256 IS NULL))`
- `packet_version_narrative_check`: `CHECK (narrative ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `packet_version_verifier_report_valid`: `CHECK (packet_verifier_report_valid(verifier_report))`
- `packet_version_verifier_result`: `CHECK (verifier_passed = ((verifier_report ->> 'passed'::text)::boolean))`
- `packet_version_version_no_check`: `CHECK (version_no >= 1)`

Indexes:
- `packet_version_by_packet`: `USING btree (practice_id, packet_id, version_no DESC)`
- `packet_version_numbered` (constraint): `UNIQUE USING btree (packet_id, version_no)`
- `packet_version_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `packet_version_drafted_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(drafted_by = app_actor_id())`
- `packet_version_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `packet_version_becomes_current`: `AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_becomes_current()`
- `packet_version_belongs`: `AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_belongs()` raises: "a packet version is written by a person who drafts packets, in their own name"; "a packet version is of a packet of its practice"; "a packet version is numbered after the last one"; "a packet of a case closed written off takes no new version"; "a packet version asks for exactly its case's lines not written off, at their priced amounts"; "a packet version is of the case's dispute level"
- `packet_version_current_verifier`: `BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_current_verifier()` raises: "a packet version is approved only once the current verifier has passed it; write the version again"
- `packet_version_export_refused_while_suspended`: `BEFORE UPDATE OF exported_at ON packet_version FOR EACH ROW WHEN (old.exported_at IS NULL AND new.exported_at IS NOT NULL) EXECUTE FUNCTION refuse_new_work_while_suspended()` raises: "%"
- `packet_version_never_deleted`: `BEFORE DELETE ON packet_version FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` raises: "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `packet_version_no_truncate`: `BEFORE TRUNCATE ON packet_version FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` raises: "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `packet_version_rules`: `BEFORE INSERT OR UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_rules()` raises: "a packet version is written unapproved and unexported"; "a packet version never changes once written; an edit is a new version"; "a regulation citation is confirmed once, before approval"; "a regulation's application to a case is confirmed by a contract specialist, in their own name"; "a packet version is approved once, and an approval is never withdrawn; an edit is a new version"; "a packet version the verifier failed cannot be approved"; "a packet is approved by a person who approves packets, in their own name"; "only a packet's current version is approved"; "an approval names the hash of the version it approves"; "a contract specialist confirms the regulation applies to the case before its packet is approved"; "the case's lines have changed since this version was written; a new version is written first"; "the person who drafted or last edited a packet cannot approve it"; "with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written"; "a packet version is exported once"; "only the export job exports a packet"; "exporting a packet needs an approved version"; "only a packet's current version, still asking for its case's lines, is exported"
- `packet_version_updated_at`: `BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `parse_report`

<a id="table-parse-report"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `parse_report_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`claims`, `code_list_release`, `duplicate_transactions`, `errors`, `held`, `id`, `lines`, `loaded_claims`, `loaded_lines`, `loaded_transactions`, `outcome`, `plb_total_cents`, `practice_id`, `reversals`, `source_document_id`, `transaction_outcomes`, `transactions`, `unknown_codes`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` |  |
| 4 | `outcome` | `text` | NOT NULL |  |  | one of loaded, held, partially_held, duplicate |
| 5 | `transactions` | `integer` | NOT NULL |  |  |  |
| 6 | `claims` | `integer` | NOT NULL |  |  |  |
| 7 | `lines` | `integer` | NOT NULL |  |  |  |
| 8 | `reversals` | `integer` | NOT NULL |  |  |  |
| 9 | `held` | `integer` | NOT NULL |  |  |  |
| 10 | `plb_total_cents` | `bigint` | NOT NULL |  |  |  |
| 11 | `loaded_transactions` | `integer` | NOT NULL |  |  |  |
| 12 | `loaded_claims` | `integer` | NOT NULL |  |  |  |
| 13 | `loaded_lines` | `integer` | NOT NULL |  |  |  |
| 14 | `duplicate_transactions` | `integer` | NOT NULL |  |  |  |
| 15 | `unknown_codes` | `text[]` | NOT NULL | `'{}'::text[]` |  |  |
| 16 | `errors` | `jsonb` | NOT NULL | `'[]'::jsonb` |  |  |
| 17 | `transaction_outcomes` | `jsonb` | NOT NULL | `'[]'::jsonb` |  |  |
| 18 | `code_list_release` | `integer` | null |  |  |  |
| 19 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 20 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `parse_report_once`: `UNIQUE (source_document_id)`

Foreign keys:
- `parse_report_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `parse_report_source_document_id_fkey`: (source_document_id) -> `source_document`(id) on delete no action

Check constraints:
- `parse_report_claims_check`: `CHECK (claims >= 0)`
- `parse_report_duplicate_transactions_check`: `CHECK (duplicate_transactions >= 0)`
- `parse_report_errors_check`: `CHECK (jsonb_typeof(errors) = 'array'::text)`
- `parse_report_held_check`: `CHECK (held >= 0)`
- `parse_report_lines_check`: `CHECK (lines >= 0)`
- `parse_report_loaded_claims_check`: `CHECK (loaded_claims >= 0)`
- `parse_report_loaded_lines_check`: `CHECK (loaded_lines >= 0)`
- `parse_report_loaded_transactions_check`: `CHECK (loaded_transactions >= 0)`
- `parse_report_outcome_check`: `CHECK (outcome = ANY (ARRAY['loaded'::text, 'held'::text, 'partially_held'::text, 'duplicate'::text]))`
- `parse_report_reversals_check`: `CHECK (reversals >= 0)`
- `parse_report_transaction_outcomes_check`: `CHECK (jsonb_typeof(transaction_outcomes) = 'array'::text)`
- `parse_report_transactions_check`: `CHECK (transactions >= 0)`

Indexes:
- `parse_report_by_practice`: `USING btree (practice_id, created_at DESC)`
- `parse_report_once` (constraint): `UNIQUE USING btree (source_document_id)`
- `parse_report_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `parse_report_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `parse_report_references_in_practice`: `BEFORE INSERT ON parse_report FOR EACH ROW EXECUTE FUNCTION parse_report_references_in_practice()` raises: "a parse report belongs to a document of the same practice"
- `parse_report_updated_at`: `BEFORE UPDATE ON parse_report FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `patient_ref`

<a id="table-patient-ref"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `patient_ref_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`dob`, `first_name`, `group_number`, `id`, `last_name`, `member_id`, `practice_id`, `pseudonym`)
- Column grant: `tp_app` UPDATE (`dob`, `group_number`, `member_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `pseudonym` | `text` | NOT NULL |  |  |  |
| 4 | `last_name` | `text` | null |  |  | enc:v1 |
| 5 | `first_name` | `text` | null |  |  | enc:v1 |
| 6 | `dob` | `text` | null |  |  | enc:v1 |
| 7 | `member_id` | `text` | null |  |  | enc:v1 |
| 8 | `group_number` | `text` | null |  |  | enc:v1 |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `patient_ref_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `patient_ref_dob_check`: `CHECK (dob ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_first_name_check`: `CHECK (first_name ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_group_number_check`: `CHECK (group_number ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_last_name_check`: `CHECK (last_name ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_member_id_check`: `CHECK (member_id ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_pseudonym_check`: `CHECK (pseudonym ~ '^[0-9a-f]{64}$'::text)`

Indexes:
- `patient_ref_by_pseudonym`: `UNIQUE USING btree (practice_id, pseudonym)`
- `patient_ref_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `patient_ref_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `patient_ref_updated_at`: `BEFORE UPDATE ON patient_ref FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `payer`

<a id="table-payer"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `payer_tenant`, registered by `20261016090000_documents_payers_plans`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`canonical_payer_id`, `id`, `name_raw`, `payer_id_raw`, `practice_id`)
- Column grant: `tp_app` UPDATE (`canonical_payer_id`, `name_raw`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `payer_id_raw` | `text` | NOT NULL |  |  |  |
| 4 | `name_raw` | `text` | NOT NULL |  |  |  |
| 5 | `canonical_payer_id` | `uuid` | null |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `payer_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `payer_name_raw_check`: `CHECK (btrim(name_raw) <> ''::text)`
- `payer_payer_id_raw_check`: `CHECK (btrim(payer_id_raw) <> ''::text)`

Indexes:
- `payer_by_raw_id`: `UNIQUE USING btree (practice_id, payer_id_raw)`
- `payer_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `payer_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `payer_updated_at`: `BEFORE UPDATE ON payer FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `payer_plan_mapping`

<a id="table-payer-plan-mapping"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `payer_plan_mapping_tenant`, registered by `20261016160000_contracts_and_mapping`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`contract_version_id`, `effective_from`, `effective_to`, `id`, `mapped_by`, `mapping_kind`, `plan_id`, `practice_id`, `supersedes_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `plan_id` | `uuid` | NOT NULL |  | `plan(id)` |  |
| 4 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` |  |
| 5 | `mapping_kind` | `text` | NOT NULL |  |  | one of no_agreement, contract, ma_noncontracted, government, other |
| 6 | `effective_from` | `date` | NOT NULL |  |  |  |
| 7 | `effective_to` | `date` | null |  |  |  |
| 8 | `mapped_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 9 | `supersedes_id` | `uuid` | null |  | `payer_plan_mapping(id)` |  |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `payer_plan_mapping_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id) on delete no action
- `payer_plan_mapping_mapped_by_fkey`: (mapped_by) -> `user`(id) on delete no action
- `payer_plan_mapping_plan_id_fkey`: (plan_id) -> `plan`(id) on delete no action
- `payer_plan_mapping_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `payer_plan_mapping_supersedes_id_fkey`: (supersedes_id) -> `payer_plan_mapping`(id) on delete no action

Check constraints:
- `payer_plan_mapping_mapping_kind_check`: `CHECK (mapping_kind = ANY (ARRAY['no_agreement'::text, 'contract'::text, 'ma_noncontracted'::text, 'government'::text, 'other'::text]))`
- `payer_plan_mapping_names_its_version`: `CHECK ((mapping_kind = 'contract'::text) = (contract_version_id IS NOT NULL))`
- `payer_plan_mapping_not_its_own_correction`: `CHECK (supersedes_id IS DISTINCT FROM id)`
- `payer_plan_mapping_window`: `CHECK (effective_to IS NULL OR effective_to > effective_from)`

Indexes:
- `payer_plan_mapping_by_plan`: `USING btree (practice_id, plan_id, effective_from)`
- `payer_plan_mapping_by_predecessor`: `USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL)`
- `payer_plan_mapping_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `payer_plan_mapping_mapped_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(mapped_by = app_actor_id())`
- `payer_plan_mapping_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `payer_plan_mapping_rules`: `BEFORE INSERT OR UPDATE ON payer_plan_mapping FOR EACH ROW EXECUTE FUNCTION payer_plan_mapping_rules()` raises: "a mapping never changes; correct it with a new mapping that supersedes it"; "a mapping maps a plan of the same practice"; "a mapping names a contract version of the same practice"; "a correction supersedes a mapping of the same plan"; "mappings of one plan never overlap: correct the mapping in force with a mapping that supersedes it"
- `payer_plan_mapping_updated_at`: `BEFORE UPDATE ON payer_plan_mapping FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `payer_response`

<a id="table-payer-response"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `payer_response_tenant`, registered by `20261023090000_packets_submissions_and_responses`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`amount_cents`, `denial_category`, `document_id`, `id`, `kind`, `next_window_ends_on`, `notes`, `practice_id`, `received_on`, `recorded_by`, `remittance_id`, `reopens_case`, `submission_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `submission_id` | `uuid` | NOT NULL |  | `submission(id)` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | one of accepted, partial, denied, info_requested, reprocessed_no_change |
| 5 | `amount_cents` | `bigint` | null |  |  |  |
| 6 | `document_id` | `uuid` | null |  | `source_document(id)` |  |
| 7 | `remittance_id` | `uuid` | null |  | `remittance(id)` |  |
| 8 | `received_on` | `date` | NOT NULL |  |  |  |
| 9 | `denial_category` | `text` | null |  |  | one of authorization, visit_limit, modifier, medical_necessity, timely_filing, bundling, other |
| 10 | `notes` | `text` | null |  |  | enc:v1 |
| 11 | `reopens_case` | `boolean` | NOT NULL | `false` |  |  |
| 12 | `next_window_ends_on` | `date` | null |  |  |  |
| 13 | `recorded_by` | `uuid` | null |  | `user(id)` |  |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `payer_response_document_id_fkey`: (document_id) -> `source_document`(id) on delete no action
- `payer_response_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `payer_response_recorded_by_fkey`: (recorded_by) -> `user`(id) on delete no action
- `payer_response_remittance_id_fkey`: (remittance_id) -> `remittance`(id) on delete no action
- `payer_response_submission_id_fkey`: (submission_id) -> `submission`(id) on delete no action

Check constraints:
- `payer_response_amount_when_accepted`: `CHECK ((kind = ANY (ARRAY['accepted'::text, 'partial'::text])) = (amount_cents IS NOT NULL) AND (amount_cents IS NULL OR amount_cents > 0))`
- `payer_response_category_only_denied`: `CHECK (denial_category IS NULL OR kind = 'denied'::text)`
- `payer_response_denial_category_check`: `CHECK (denial_category = ANY (ARRAY['authorization'::text, 'visit_limit'::text, 'modifier'::text, 'medical_necessity'::text, 'timely_filing'::text, 'bundling'::text, 'other'::text]))`
- `payer_response_evidence`: `CHECK (document_id IS NOT NULL OR kind = 'reprocessed_no_change'::text AND remittance_id IS NOT NULL)`
- `payer_response_job_records_reprocessed`: `CHECK (recorded_by IS NOT NULL OR kind = 'reprocessed_no_change'::text AND remittance_id IS NOT NULL)`
- `payer_response_kind_check`: `CHECK (kind = ANY (ARRAY['accepted'::text, 'partial'::text, 'denied'::text, 'info_requested'::text, 'reprocessed_no_change'::text]))`
- `payer_response_notes_check`: `CHECK (notes ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `payer_response_remittance_only_reprocessed`: `CHECK (remittance_id IS NULL OR kind = 'reprocessed_no_change'::text)`
- `payer_response_reopen_has_its_window`: `CHECK (reopens_case = (next_window_ends_on IS NOT NULL) AND (next_window_ends_on IS NULL OR next_window_ends_on >= received_on))`
- `payer_response_reopen_is_a_denial_with_a_reason`: `CHECK (NOT reopens_case OR kind = 'denied'::text AND denial_category IS NOT NULL)`

Indexes:
- `payer_response_by_submission`: `USING btree (practice_id, submission_id, received_on DESC)`
- `payer_response_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `payer_response_recorded_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(NOT (recorded_by IS DISTINCT FROM CASE     WHEN app_actor_is_person() THEN app_actor_id()     ELSE NULL::uuid END))`
- `payer_response_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `payer_response_belongs`: `AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_belongs()` raises: "a payer response is recorded by a person who logs submissions, in their own name"; "a job records a response in no one's name"; "a payer response is to a submission of its practice"; "a payer response answers its case's latest submission"; "a payer response is received from its submission to today"; "a payer response is received on or after the submission's last one"; "a payer response's document is a document of its practice"; "a payer response's remittance is a loaded remittance of its practice"
- `payer_response_never_deleted`: `BEFORE DELETE ON payer_response FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` raises: "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `payer_response_no_truncate`: `BEFORE TRUNCATE ON payer_response FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` raises: "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `payer_response_refresh_case`: `AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_refresh_case()`
- `payer_response_rules`: `BEFORE INSERT OR UPDATE ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_rules()` raises: "a payer response never changes once recorded"; "no next dispute window is known for this case, so the denial cannot reopen it"; "the next dispute window has closed, so the denial cannot reopen the case"
- `payer_response_within_asked`: `BEFORE INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_within_asked()` raises: "a payer response accepts at most what its submission asked: the lines' variance and the interest line"

### Table `phi_table_registry`

<a id="table-phi-table-registry"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `table_name` | `text` | NOT NULL |  |  |  |
| 3 | `registered_by` | `text` | NOT NULL |  |  |  |
| 4 | `policy_name` | `text` | NOT NULL |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `phi_table_registry_table_name_key`: `UNIQUE (table_name)`

Check constraints:
- `phi_table_registry_policy_name_check`: `CHECK (policy_name ~ '^[a-z][a-z0-9_]*$'::text)`
- `phi_table_registry_registered_by_check`: `CHECK (registered_by ~ '^[0-9]{14}_[a-z0-9_]+$'::text)`
- `phi_table_registry_table_name_check`: `CHECK (table_name ~ '^[a-z][a-z0-9_]*$'::text)`

Indexes:
- `phi_table_registry_pkey` (primary): `UNIQUE USING btree (id)`
- `phi_table_registry_table_name_key` (constraint): `UNIQUE USING btree (table_name)`

Policies (0):
- none

Triggers:
- `phi_table_registry_updated_at`: `BEFORE UPDATE ON phi_table_registry FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `plan`

<a id="table-plan"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `plan_tenant`, registered by `20261016090000_documents_payers_plans`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `is_medicare_advantage`, `ma_contracted`, `name`, `network_status`, `payer_id`, `plan_key`, `practice_id`)
- Column grant: `tp_app` UPDATE (`is_medicare_advantage`, `ma_contracted`, `name`, `network_status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` |  |
| 4 | `plan_key` | `text` | NOT NULL |  |  |  |
| 5 | `name` | `text` | null |  |  |  |
| 6 | `network_status` | `text` | NOT NULL | `'unknown'::text` |  | one of in_network, out_of_network, unknown |
| 7 | `is_medicare_advantage` | `boolean` | NOT NULL | `false` |  |  |
| 8 | `ma_contracted` | `boolean` | NOT NULL | `false` |  |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `plan_payer_id_fkey`: (payer_id) -> `payer`(id) on delete no action
- `plan_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `plan_ma_contracted_is_medicare_advantage`: `CHECK (is_medicare_advantage OR NOT ma_contracted)`
- `plan_name_check`: `CHECK (btrim(name) <> ''::text)`
- `plan_network_status_check`: `CHECK (network_status = ANY (ARRAY['in_network'::text, 'out_of_network'::text, 'unknown'::text]))`
- `plan_plan_key_check`: `CHECK (btrim(plan_key) <> ''::text)`

Indexes:
- `plan_by_key`: `UNIQUE USING btree (practice_id, payer_id, plan_key)`
- `plan_by_payer`: `USING btree (payer_id)`
- `plan_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `plan_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `plan_payer_of_practice`: `BEFORE INSERT OR UPDATE OF payer_id, practice_id ON plan FOR EACH ROW EXECUTE FUNCTION plan_payer_of_practice()` raises: "a plan belongs to a payer of the same practice"
- `plan_updated_at`: `BEFORE UPDATE ON plan FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `posting_row`

<a id="table-posting-row"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `posting_row_tenant`, registered by `20261023120000_recovery_ledger`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`amount_cents`, `batch`, `check_or_trace`, `claim_reference`, `fingerprint`, `id`, `payer_name`, `posted_on`, `practice_id`, `procedure_code`, `raw`, `row_no`, `service_date`, `source_document_id`, `template`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` |  |
| 4 | `row_no` | `integer` | NOT NULL |  |  |  |
| 5 | `check_or_trace` | `text` | NOT NULL |  |  |  |
| 6 | `posted_on` | `date` | NOT NULL |  |  |  |
| 7 | `amount_cents` | `bigint` | NOT NULL |  |  |  |
| 8 | `claim_reference` | `text` | null |  |  | enc:v1 |
| 9 | `procedure_code` | `text` | null |  |  |  |
| 10 | `service_date` | `date` | null |  |  |  |
| 11 | `payer_name` | `text` | null |  |  |  |
| 12 | `batch` | `text` | null |  |  |  |
| 13 | `raw` | `jsonb` | NOT NULL |  |  |  |
| 14 | `template` | `text` | NOT NULL |  |  |  |
| 15 | `fingerprint` | `text` | NOT NULL |  |  |  |
| 16 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 17 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `posting_row_once`: `UNIQUE (practice_id, fingerprint)`
- `posting_row_position`: `UNIQUE (source_document_id, row_no)`

Foreign keys:
- `posting_row_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `posting_row_source_document_id_fkey`: (source_document_id) -> `source_document`(id) on delete no action

Check constraints:
- `posting_row_batch_check`: `CHECK (char_length(batch) >= 1 AND char_length(batch) <= 100)`
- `posting_row_check_or_trace_check`: `CHECK (btrim(check_or_trace) <> ''::text AND char_length(check_or_trace) <= 64)`
- `posting_row_claim_reference_check`: `CHECK (claim_reference ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `posting_row_fingerprint_check`: `CHECK (fingerprint ~ '^[0-9a-f]{64}$'::text)`
- `posting_row_payer_name_check`: `CHECK (char_length(payer_name) >= 1 AND char_length(payer_name) <= 200)`
- `posting_row_procedure_code_check`: `CHECK (procedure_code ~ '^[A-Za-z0-9]{1,20}$'::text)`
- `posting_row_raw_check`: `CHECK (jsonb_typeof(raw) = 'object'::text AND NOT raw ? 'claim_reference'::text)`
- `posting_row_row_no_check`: `CHECK (row_no >= 1)`
- `posting_row_template_check`: `CHECK (template ~ '^[a-z][a-z0-9_]{0,63}$'::text)`

Indexes:
- `posting_row_by_check`: `USING btree (practice_id, check_or_trace)`
- `posting_row_once` (constraint): `UNIQUE USING btree (practice_id, fingerprint)`
- `posting_row_pkey` (primary): `UNIQUE USING btree (id)`
- `posting_row_position` (constraint): `UNIQUE USING btree (source_document_id, row_no)`

Policies (1):
- `posting_row_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `posting_row_belongs`: `BEFORE INSERT ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs()` raises: "an export row is read from its export by the reconcile job, never written by a person"; "an export row is a row of an export of its practice"; "a posting row is a row of a posting export, and an EFT row of an EFT export"; "an export row is read from an export stored with a clean malware scan, before it is loaded"; "an export row of a zip entry is read only when its zip's malware scan is clean"
- `posting_row_never_changed`: `BEFORE DELETE OR UPDATE ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed()` raises: "% rows are never changed or deleted: the ledger is append-only and a correction is a new entry"
- `posting_row_no_truncate`: `BEFORE TRUNCATE ON posting_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` raises: "% cannot be truncated: the ledger keeps what it recorded"

### Table `practice`

<a id="table-practice"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `practice_tenant`, registered by `20261015140000_tenancy`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`data_key_ref`, `id`, `locality_code`, `name`, `npi`, `organization_id`, `settings`, `tax_id_last4`, `zip`)
- Column grant: `tp_app` UPDATE (`locality_code`, `name`, `npi`, `settings`, `tax_id_last4`, `zip`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | null |  | `organization(id)` |  |
| 3 | `name` | `text` | NOT NULL |  |  |  |
| 4 | `tax_id_last4` | `text` | null |  |  |  |
| 5 | `npi` | `text` | null |  |  |  |
| 6 | `locality_code` | `text` | null |  |  |  |
| 7 | `zip` | `text` | null |  |  |  |
| 8 | `settings` | `jsonb` | NOT NULL | `'{}'::jsonb` |  |  |
| 9 | `data_key_ref` | `text` | null |  |  |  |
| 10 | `status` | `text` | NOT NULL | `'active'::text` |  | one of active, deleted |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 13 | `deleted_at` | `timestamp with time zone` | null |  |  |  |

Foreign keys:
- `practice_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action

Check constraints:
- `practice_data_key_ref_check`: `CHECK (data_key_ref ~ '^(kms\|local):v1:[A-Za-z0-9+/]+={0,2}$'::text)`
- `practice_deleted_at`: `CHECK ((status = 'deleted'::text) = (deleted_at IS NOT NULL))`
- `practice_has_data_key`: `CHECK (data_key_ref IS NOT NULL OR status = 'deleted'::text)`
- `practice_ledger_settings`: `CHECK ((NOT settings ? 'proof_level'::text OR ((settings ->> 'proof_level'::text) = ANY (ARRAY['posted'::text, 'deposited'::text]))) AND (NOT settings ? 'posting_export_template'::text OR jsonb_typeof(settings -> 'posting_export_template'::text) = 'object'::text))`
- `practice_name_check`: `CHECK (btrim(name) <> ''::text)`
- `practice_npi_check`: `CHECK (npi ~ '^[0-9]{10}$'::text)`
- `practice_settings_check`: `CHECK (jsonb_typeof(settings) = 'object'::text)`
- `practice_status_check`: `CHECK (status = ANY (ARRAY['active'::text, 'deleted'::text]))`
- `practice_tax_id_last4_check`: `CHECK (tax_id_last4 ~ '^[0-9]{4}$'::text)`
- `practice_zip_check`: `CHECK (zip ~ '^[0-9]{5}$'::text)`

Indexes:
- `practice_by_organization`: `USING btree (organization_id)`
- `practice_pkey` (primary): `UNIQUE USING btree (id)`

Policies (4):
- `practice_administrators_update`: RESTRICTIVE FOR UPDATE TO tp_app
  - USING `(id = ANY (( SELECT app_actor_admin_practice_ids() AS app_actor_admin_practice_ids)::uuid[]))`
  - WITH CHECK `(id = ANY (( SELECT app_actor_admin_practice_ids() AS app_actor_admin_practice_ids)::uuid[]))`
- `practice_platform_admin_insert`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin)`
- `practice_resolver`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `practice_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `practice_deleted_at`: `BEFORE UPDATE ON practice FOR EACH ROW EXECUTE FUNCTION practice_deleted_at()` raises: "a practice's deletion time is the database's, set once"
- `practice_has_administrator`: `AFTER INSERT OR UPDATE OF organization_id, status ON practice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_has_administrator()` raises: "invite the practice group's administrator before creating or moving its practice: a practice always has an administrator"
- `practice_has_owner`: `BEFORE INSERT OR UPDATE OF organization_id, status ON practice FOR EACH ROW EXECUTE FUNCTION practice_has_owner()` raises: "a practice is owned by a practice group until it is deleted"
- `practice_keeps_administrator`: `AFTER UPDATE OF organization_id ON practice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_keeps_administrator()` raises: "a practice must always keep at least one practice administrator"
- `practice_owned_by_group`: `BEFORE INSERT OR UPDATE OF organization_id ON practice FOR EACH ROW EXECUTE FUNCTION practice_owned_by_group()` raises: "a practice is owned by a practice group"
- `practice_updated_at`: `BEFORE UPDATE ON practice FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `priced_line`

<a id="table-priced-line"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `priced_line_tenant`, registered by `20261018090000_pricing_runs`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`adjustments_applied`, `contract_version_id`, `expected_allowed_cents`, `expected_unrounded`, `id`, `mapping_id`, `method`, `observed_allowed_cents`, `practice_id`, `pricing_run_id`, `rate_record_id`, `service_line_id`, `trace`, `unpriced_reason`, `variance_cents`, `window_ends_on`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `pricing_run_id` | `uuid` | NOT NULL |  | `pricing_run(id)` |  |
| 4 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` |  |
| 5 | `mapping_id` | `uuid` | null |  | `payer_plan_mapping(id)` |  |
| 6 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` |  |
| 7 | `rate_record_id` | `uuid` | null |  | `rate_record(id)` |  |
| 8 | `method` | `text` | null |  |  | one of FIXED_SCHEDULE, PERCENT_OF_MEDICARE, LESSER_OF, PER_VISIT, UNSUPPORTED |
| 9 | `expected_allowed_cents` | `bigint` | null |  |  |  |
| 10 | `expected_unrounded` | `numeric` | null |  |  |  |
| 11 | `observed_allowed_cents` | `bigint` | NOT NULL |  |  |  |
| 12 | `variance_cents` | `bigint` | null |  |  |  |
| 13 | `unpriced_reason` | `text` | null |  |  | one of NO_AGREEMENT, NO_MAPPING, AMBIGUOUS_RATE, NO_RATE_FOR_CODE, NO_PFS_VALUE, UNSUPPORTED_METHOD, SECONDARY_PAYER, MUE_EXCEEDED, UNITS_RULE_UNKNOWN, DATE_OUTSIDE_VERSIONS, REVERSED_CLAIM, ENGINE_ERROR |
| 14 | `adjustments_applied` | `jsonb` | NOT NULL | `'[]'::jsonb` |  |  |
| 15 | `window_ends_on` | `date` | null |  |  |  |
| 16 | `trace` | `jsonb` | NOT NULL |  |  |  |
| 17 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 18 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `priced_line_once`: `UNIQUE (pricing_run_id, service_line_id)`

Foreign keys:
- `priced_line_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id) on delete no action
- `priced_line_mapping_id_fkey`: (mapping_id) -> `payer_plan_mapping`(id) on delete no action
- `priced_line_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `priced_line_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id) on delete no action
- `priced_line_rate_record_id_fkey`: (rate_record_id) -> `rate_record`(id) on delete no action
- `priced_line_service_line_id_fkey`: (service_line_id) -> `service_line`(id) on delete no action

Check constraints:
- `priced_line_adjustments_applied_check`: `CHECK (jsonb_typeof(adjustments_applied) = 'array'::text)`
- `priced_line_method_check`: `CHECK (method = ANY (ARRAY['FIXED_SCHEDULE'::text, 'PERCENT_OF_MEDICARE'::text, 'LESSER_OF'::text, 'PER_VISIT'::text, 'UNSUPPORTED'::text]))`
- `priced_line_priced_amounts`: `CHECK (expected_allowed_cents IS NULL OR expected_allowed_cents >= 0 AND expected_unrounded IS NOT NULL AND abs(expected_unrounded - expected_allowed_cents::numeric) < 1::numeric AND variance_cents IS NOT NULL AND variance_cents = (expected_allowed_cents - observed_allowed_cents) AND method IS NOT NULL)`
- `priced_line_priced_or_unpriced`: `CHECK ((unpriced_reason IS NULL) = (expected_allowed_cents IS NOT NULL))`
- `priced_line_rate_names_its_version`: `CHECK (rate_record_id IS NULL OR contract_version_id IS NOT NULL)`
- `priced_line_trace_check`: `CHECK (jsonb_typeof(trace) = 'object'::text)`
- `priced_line_unpriced_amounts`: `CHECK (expected_allowed_cents IS NOT NULL OR expected_unrounded IS NULL AND variance_cents IS NULL AND window_ends_on IS NULL AND adjustments_applied = '[]'::jsonb)`
- `priced_line_unpriced_reason_check`: `CHECK (unpriced_reason = ANY (ARRAY['NO_AGREEMENT'::text, 'NO_MAPPING'::text, 'AMBIGUOUS_RATE'::text, 'NO_RATE_FOR_CODE'::text, 'NO_PFS_VALUE'::text, 'UNSUPPORTED_METHOD'::text, 'SECONDARY_PAYER'::text, 'MUE_EXCEEDED'::text, 'UNITS_RULE_UNKNOWN'::text, 'DATE_OUTSIDE_VERSIONS'::text, 'REVERSED_CLAIM'::text, 'ENGINE_ERROR'::text]))`
- `priced_line_version_names_its_mapping`: `CHECK (contract_version_id IS NULL OR mapping_id IS NOT NULL)`

Indexes:
- `priced_line_by_reason`: `USING btree (pricing_run_id, unpriced_reason)`
- `priced_line_by_service_line`: `USING btree (practice_id, service_line_id)`
- `priced_line_once` (constraint): `UNIQUE USING btree (pricing_run_id, service_line_id)`
- `priced_line_pkey` (primary): `UNIQUE USING btree (id)`
- `priced_line_underpaid`: `USING btree (practice_id, variance_cents DESC) WHERE (variance_cents > 0)`

Policies (1):
- `priced_line_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `priced_line_immutable`: `BEFORE DELETE OR UPDATE ON priced_line FOR EACH ROW EXECUTE FUNCTION priced_line_immutable()` raises: "a priced line never changes; a new run prices the line again"
- `priced_line_no_truncate`: `BEFORE TRUNCATE ON priced_line FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate()` raises: "% cannot be truncated: pricing runs and their lines are kept as they were priced"
- `priced_line_rows_belong`: `AFTER INSERT ON priced_line REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION priced_line_rows_belong()` raises: "a priced line joins an open pricing run of its practice; a complete run never changes"; "a priced line prices a service line under a mapping, version and rate record of its own practice"

### Table `pricing_run`

<a id="table-pricing-run"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `pricing_run_tenant`, registered by `20261018090000_pricing_runs`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`created_by`, `created_by_job_id`, `engine_version`, `id`, `lines_loaded_by`, `period_from`, `period_to`, `practice_id`, `release_no`, `rerun_of_id`)
- Column grant: `tp_app` UPDATE (`accepted_at`, `accepted_by`, `completed_at`, `coverage`, `failure_code`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `period_from` | `date` | NOT NULL |  |  |  |
| 4 | `period_to` | `date` | NOT NULL |  |  |  |
| 5 | `release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` |  |
| 6 | `engine_version` | `text` | NOT NULL |  |  |  |
| 7 | `created_by` | `uuid` | null |  | `user(id)` |  |
| 8 | `status` | `text` | NOT NULL | `'queued'::text` |  | one of queued, running, complete, failed |
| 9 | `coverage` | `jsonb` | null |  |  |  |
| 10 | `failure_code` | `text` | null |  |  |  |
| 11 | `completed_at` | `timestamp with time zone` | null |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 14 | `rerun_of_id` | `uuid` | null |  | `pricing_run(id)` |  |
| 15 | `lines_loaded_by` | `timestamp with time zone` | null |  |  |  |
| 16 | `accepted_by` | `uuid` | null |  | `user(id)` |  |
| 17 | `accepted_at` | `timestamp with time zone` | null |  |  |  |
| 18 | `created_by_job_id` | `uuid` | null |  |  |  |

Foreign keys:
- `pricing_run_accepted_by_fkey`: (accepted_by) -> `user`(id) on delete no action
- `pricing_run_created_by_fkey`: (created_by) -> `user`(id) on delete no action
- `pricing_run_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `pricing_run_release_no_fkey`: (release_no) -> `rule_release`(release_no) on delete no action
- `pricing_run_rerun_of_id_fkey`: (rerun_of_id) -> `pricing_run`(id) on delete no action

Check constraints:
- `pricing_run_acceptance_whole`: `CHECK ((accepted_by IS NULL) = (accepted_at IS NULL))`
- `pricing_run_accepts_complete_reruns`: `CHECK (accepted_at IS NULL OR rerun_of_id IS NOT NULL AND status = 'complete'::text)`
- `pricing_run_completed_when_complete`: `CHECK ((status = 'complete'::text) = (completed_at IS NOT NULL))`
- `pricing_run_coverage_check`: `CHECK (jsonb_typeof(coverage) = 'object'::text)`
- `pricing_run_coverage_when_complete`: `CHECK ((status = 'complete'::text) = (coverage IS NOT NULL))`
- `pricing_run_engine_version_check`: `CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,63}$'::text)`
- `pricing_run_failure_code_check`: `CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `pricing_run_failure_when_failed`: `CHECK ((status = 'failed'::text) = (failure_code IS NOT NULL))`
- `pricing_run_job_creates_first_runs`: `CHECK (created_by_job_id IS NULL OR rerun_of_id IS NULL)`
- `pricing_run_one_creator`: `CHECK ((created_by IS NULL) <> (created_by_job_id IS NULL))`
- `pricing_run_period`: `CHECK (period_from <= period_to)`
- `pricing_run_rerun_of_another`: `CHECK (rerun_of_id IS DISTINCT FROM id)`
- `pricing_run_rerun_pins_its_lines`: `CHECK ((rerun_of_id IS NULL) = (lines_loaded_by IS NULL))`
- `pricing_run_status_check`: `CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'complete'::text, 'failed'::text]))`

Indexes:
- `pricing_run_by_period`: `USING btree (practice_id, period_from, period_to)`
- `pricing_run_by_practice`: `USING btree (practice_id, created_at DESC, id)`
- `pricing_run_complete_by_practice`: `USING btree (practice_id, completed_at DESC) WHERE (status = 'complete'::text)`
- `pricing_run_pkey` (primary): `UNIQUE USING btree (id)`
- `pricing_run_reruns`: `USING btree (practice_id, rerun_of_id) WHERE (rerun_of_id IS NOT NULL)`

Policies (4):
- `pricing_run_accepted_by_actor`: RESTRICTIVE FOR UPDATE TO tp_app
  - USING `true`
  - WITH CHECK `((accepted_by IS NULL) OR ((accepted_by = app_actor_id()) AND COALESCE(app_actor_permitted(practice_id, 'mapping.edit'::text), false)))`
- `pricing_run_created_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(((created_by = app_actor_id()) AND (created_by_job_id IS NULL)) OR ((created_by IS NULL) AND (created_by_job_id = app_actor_id()) AND (NOT ( SELECT app_actor_is_person() AS app_actor_is_person))))`
- `pricing_run_created_by_mappers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((created_by IS NULL) OR COALESCE(app_actor_permitted(practice_id, 'mapping.edit'::text), false))`
- `pricing_run_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `pricing_run_no_truncate`: `BEFORE TRUNCATE ON pricing_run FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate()` raises: "% cannot be truncated: pricing runs and their lines are kept as they were priced"
- `pricing_run_refused_while_suspended`: `BEFORE INSERT ON pricing_run FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` raises: "%"
- `pricing_run_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON pricing_run FOR EACH ROW EXECUTE FUNCTION pricing_run_rules()` raises: "a pricing run is never deleted"; "a pricing run starts queued"; "rule-release mismatch: a pricing run pins the newest published rule release"; "a re-run prices a complete run of its own practice again"; "a re-run prices the period and the lines of the run it prices again"; "a pricing run's practice, period, release, engine, creator and the run it prices again never change"; "a re-run is accepted by the person acting, when they accept it"; "a re-run pinned to a withdrawn rule release is never accepted; re-run it under the release in force"; "a pricing run never changes once it is complete or failed; a new release or mapping means a new run"; "only a complete re-run is accepted"; "an open pricing run records its coverage when it completes and its failure when it fails"; "a pricing run's completion records the time it completed"; "a complete pricing run's coverage counts exactly the lines it priced"; "a failed pricing run holds no priced lines"; "a pricing run moves queued, running, then complete or failed"
- `pricing_run_updated_at`: `BEFORE UPDATE ON pricing_run FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `prospect_request`

<a id="table-prospect-request"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` UPDATE (`organization_id`, `reviewed_by`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `contact_name` | `text` | NOT NULL |  |  |  |
| 3 | `contact_email` | `text` | NOT NULL |  |  |  |
| 4 | `organization_name` | `text` | NOT NULL |  |  |  |
| 5 | `locations` | `integer` | NOT NULL |  |  |  |
| 6 | `payers` | `text[]` | NOT NULL |  |  |  |
| 7 | `billing_arrangement` | `text` | NOT NULL |  |  | one of in_house, billing_firm, mixed, other |
| 8 | `status` | `text` | NOT NULL | `'new'::text` |  | one of new, contacted, converted, declined |
| 9 | `organization_id` | `uuid` | null |  | `organization(id)` |  |
| 10 | `reviewed_by` | `uuid` | null |  | `user(id)` |  |
| 11 | `reviewed_at` | `timestamp with time zone` | null |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `prospect_request_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action
- `prospect_request_reviewed_by_fkey`: (reviewed_by) -> `user`(id) on delete no action

Check constraints:
- `prospect_request_billing_arrangement_check`: `CHECK (billing_arrangement = ANY (ARRAY['in_house'::text, 'billing_firm'::text, 'mixed'::text, 'other'::text]))`
- `prospect_request_contact_email_check`: `CHECK (contact_email ~ '^[^@ ]+@[^@ ]+$'::text AND length(contact_email) <= 254)`
- `prospect_request_contact_name_check`: `CHECK (btrim(contact_name) <> ''::text AND length(contact_name) <= 200)`
- `prospect_request_converted`: `CHECK ((status = 'converted'::text) = (organization_id IS NOT NULL))`
- `prospect_request_locations_check`: `CHECK (locations >= 1 AND locations <= 1000)`
- `prospect_request_organization_name_check`: `CHECK (btrim(organization_name) <> ''::text AND length(organization_name) <= 200)`
- `prospect_request_payers`: `CHECK (prospect_payers_valid(payers))`
- `prospect_request_review`: `CHECK ((status = 'new'::text) = (reviewed_by IS NULL) AND (reviewed_by IS NULL) = (reviewed_at IS NULL))`
- `prospect_request_status_check`: `CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'declined'::text]))`

Indexes:
- `prospect_request_by_status`: `USING btree (status, created_at DESC)`
- `prospect_request_pkey` (primary): `UNIQUE USING btree (id)`

Policies (3):
- `prospect_request_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `prospect_request_platform_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted)`
- `prospect_request_platform_review`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted)`
  - WITH CHECK `(( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted) AND (reviewed_by = app_actor_id()))`

Triggers:
- `prospect_request_fixed`: `BEFORE UPDATE ON prospect_request FOR EACH ROW EXECUTE FUNCTION prospect_request_fixed()` raises: "a prospect request is kept as it was received"; "a converted request names its organization for good"
- `prospect_request_updated_at`: `BEFORE UPDATE ON prospect_request FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `provider_adjustment`

<a id="table-provider-adjustment"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `provider_adjustment_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`amount_cents`, `category`, `fiscal_period_date`, `id`, `position`, `practice_id`, `provider_id`, `reason_code`, `reference`, `remittance_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `remittance_id` | `uuid` | NOT NULL |  | `remittance(id)` |  |
| 4 | `position` | `integer` | NOT NULL |  |  |  |
| 5 | `provider_id` | `text` | NOT NULL |  |  |  |
| 6 | `reason_code` | `text` | NOT NULL |  |  |  |
| 7 | `reference` | `text` | null |  |  |  |
| 8 | `amount_cents` | `bigint` | NOT NULL |  |  |  |
| 9 | `fiscal_period_date` | `date` | NOT NULL |  |  |  |
| 10 | `category` | `text` | NOT NULL |  |  | one of recoupment, forward_balance, interest, authorized_return, other |
| 11 | `counted` | `boolean` | NOT NULL |  |  | generated always as `(category <> 'forward_balance'::text)` stored |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `provider_adjustment_once`: `UNIQUE (remittance_id, "position")`

Foreign keys:
- `provider_adjustment_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `provider_adjustment_remittance_id_fkey`: (remittance_id) -> `remittance`(id) on delete no action

Check constraints:
- `provider_adjustment_category_check`: `CHECK (category = ANY (ARRAY['recoupment'::text, 'forward_balance'::text, 'interest'::text, 'authorized_return'::text, 'other'::text]))`
- `provider_adjustment_position_check`: `CHECK ("position" >= 1)`
- `provider_adjustment_provider_id_check`: `CHECK (btrim(provider_id) <> ''::text)`
- `provider_adjustment_reason_code_check`: `CHECK (btrim(reason_code) <> ''::text)`

Indexes:
- `provider_adjustment_by_remittance`: `USING btree (practice_id, remittance_id)`
- `provider_adjustment_once` (constraint): `UNIQUE USING btree (remittance_id, "position")`
- `provider_adjustment_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `provider_adjustment_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `provider_adjustment_references_in_practice`: `BEFORE INSERT ON provider_adjustment FOR EACH ROW EXECUTE FUNCTION provider_adjustment_references_in_practice()` raises: "a provider adjustment belongs to a remittance of the same practice"
- `provider_adjustment_updated_at`: `BEFORE UPDATE ON provider_adjustment FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `rate_limit_counter`

<a id="table-rate-limit-counter"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `bucket`, `subject`, `window_start`
- `tp_app`: no privilege
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `bucket` | `text` | NOT NULL |  |  |  |
| 2 | `subject` | `text` | NOT NULL |  |  |  |
| 3 | `window_start` | `timestamp with time zone` | NOT NULL |  |  |  |
| 4 | `hits` | `integer` | NOT NULL |  |  |  |

Check constraints:
- `rate_limit_counter_bucket_check`: `CHECK (bucket ~ '^[a-z][a-z0-9_]{0,31}$'::text)`
- `rate_limit_counter_hits_check`: `CHECK (hits >= 1)`
- `rate_limit_counter_subject_check`: `CHECK (subject ~ '^[0-9a-f]{64}$'::text)`

Indexes:
- `rate_limit_counter_by_window`: `USING btree (window_start)`
- `rate_limit_counter_pkey` (primary): `UNIQUE USING btree (bucket, subject, window_start)`

Policies (1):
- `rate_limit_counter_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

### Table `rate_record`

<a id="table-rate-record"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `rate_record_tenant`, registered by `20261016160000_contracts_and_mapping`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols), DELETE
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`contract_version_id`, `evidence`, `flags`, `id`, `method`, `parameters`, `practice_id`, `proposed_by`, `rounding`, `scope`)
- Column grant: `tp_app` UPDATE (`evidence`, `flags`, `method`, `parameters`, `rounding`, `scope`, `verified_at`, `verified_by`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `contract_version_id` | `uuid` | NOT NULL |  | `contract_version(id)` |  |
| 4 | `scope` | `jsonb` | NOT NULL |  |  |  |
| 5 | `method` | `text` | NOT NULL |  |  | one of FIXED_SCHEDULE, PERCENT_OF_MEDICARE, LESSER_OF, PER_VISIT, UNSUPPORTED |
| 6 | `parameters` | `jsonb` | NOT NULL |  |  |  |
| 7 | `flags` | `jsonb` | NOT NULL |  |  |  |
| 8 | `rounding` | `text` | null |  |  | one of HALF_UP_CENT, HALF_EVEN_CENT, TRUNCATE |
| 9 | `evidence` | `jsonb` | NOT NULL | `'{}'::jsonb` |  |  |
| 10 | `proposed_by` | `text` | NOT NULL |  |  | one of specialist, model |
| 11 | `verified_by` | `uuid` | null |  | `user(id)` |  |
| 12 | `verified_at` | `timestamp with time zone` | null |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `rate_record_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id) on delete no action
- `rate_record_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `rate_record_verified_by_fkey`: (verified_by) -> `user`(id) on delete no action

Check constraints:
- `rate_record_evidence_check`: `CHECK (jsonb_typeof(evidence) = 'object'::text)`
- `rate_record_flags_check`: `CHECK (jsonb_typeof(flags) = 'object'::text)`
- `rate_record_method_check`: `CHECK (method = ANY (ARRAY['FIXED_SCHEDULE'::text, 'PERCENT_OF_MEDICARE'::text, 'LESSER_OF'::text, 'PER_VISIT'::text, 'UNSUPPORTED'::text]))`
- `rate_record_parameters_check`: `CHECK (jsonb_typeof(parameters) = 'object'::text)`
- `rate_record_proposed_by_check`: `CHECK (proposed_by = ANY (ARRAY['specialist'::text, 'model'::text]))`
- `rate_record_rounding_check`: `CHECK (rounding = ANY (ARRAY['HALF_UP_CENT'::text, 'HALF_EVEN_CENT'::text, 'TRUNCATE'::text]))`
- `rate_record_scope_check`: `CHECK (jsonb_typeof(scope) = 'object'::text)`
- `rate_record_verification_recorded`: `CHECK ((verified_by IS NULL) = (verified_at IS NULL))`
- `rate_record_verified_with_evidence`: `CHECK (verified_by IS NULL OR rate_record_evidence_complete(evidence))`

Indexes:
- `rate_record_by_version`: `USING btree (practice_id, contract_version_id)`
- `rate_record_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `rate_record_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `rate_record_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON rate_record FOR EACH ROW EXECUTE FUNCTION rate_record_rules()` raises: "a rate record's version and origin never change"; "a rate record belongs to a contract version of the same practice"; "the rate records of an approved or signed-off version never change; supersede the version"; "evidence.approved_fields is an object of field approvals"; "a rate record is verified after it is written, field by field"; "a field approval names one of the rate record's fields"; "only a contract specialist approves a rate record's fields"; "a field approval records the approving specialist and the time"; "only a contract specialist verifies a rate record"; "a verification records the verifying specialist and the time"; "a rate record is verified once each of its fields is approved"; "a rate record cannot be approved without evidence naming a document, a page, a quote and a hash"; "a rate record's evidence is a document of its version"; "a verification is recorded once"
- `rate_record_updated_at`: `BEFORE UPDATE ON rate_record FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `remittance`

<a id="table-remittance"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `remittance_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`balance_diff_cents`, `bpr02_cents`, `bpr16_date`, `bpr_credit_debit`, `bpr_method`, `claim_count`, `gs06`, `held_reason`, `id`, `isa13`, `payee_id_qualifier`, `payee_npi`, `payer_id`, `payer_name`, `plb_total_cents`, `practice_id`, `production_date`, `receiver_id`, `review_of_remittance_id`, `review_reason`, `sender_id`, `source_document_id`, `st02`, `status`, `trn02`, `trn03`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` |  |
| 4 | `sender_id` | `text` | NOT NULL |  |  |  |
| 5 | `receiver_id` | `text` | NOT NULL |  |  |  |
| 6 | `isa13` | `text` | NOT NULL |  |  |  |
| 7 | `gs06` | `text` | NOT NULL |  |  |  |
| 8 | `st02` | `text` | NOT NULL |  |  |  |
| 9 | `trn02` | `text` | NOT NULL |  |  |  |
| 10 | `trn03` | `text` | NOT NULL |  |  |  |
| 11 | `bpr02_cents` | `bigint` | NOT NULL |  |  |  |
| 12 | `bpr_credit_debit` | `text` | NOT NULL |  |  | one of C, D |
| 13 | `bpr_method` | `text` | NOT NULL |  |  |  |
| 14 | `bpr16_date` | `date` | NOT NULL |  |  |  |
| 15 | `payer_name` | `text` | NOT NULL |  |  |  |
| 16 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` |  |
| 17 | `payee_npi` | `text` | NOT NULL |  |  |  |
| 18 | `payee_id_qualifier` | `text` | NOT NULL |  |  |  |
| 19 | `production_date` | `date` | null |  |  |  |
| 20 | `balance_diff_cents` | `bigint` | NOT NULL | `0` |  |  |
| 21 | `balanced` | `boolean` | NOT NULL |  |  | generated always as `(balance_diff_cents = 0)` stored |
| 22 | `claim_count` | `integer` | NOT NULL |  |  |  |
| 23 | `plb_total_cents` | `bigint` | NOT NULL |  |  |  |
| 24 | `status` | `text` | NOT NULL | `'loaded'::text` |  | one of loaded, held, duplicate |
| 25 | `held_reason` | `text` | null |  |  |  |
| 26 | `review_reason` | `text` | null |  |  | one of trace_reused_another_date, trace_reused_same_date |
| 27 | `review_of_remittance_id` | `uuid` | null |  | `remittance(id)` |  |
| 28 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 29 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `remittance_once`: `UNIQUE (practice_id, sender_id, isa13, trn02, bpr02_cents)`

Foreign keys:
- `remittance_payer_id_fkey`: (payer_id) -> `payer`(id) on delete no action
- `remittance_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `remittance_review_of_remittance_id_fkey`: (review_of_remittance_id) -> `remittance`(id) on delete no action
- `remittance_source_document_id_fkey`: (source_document_id) -> `source_document`(id) on delete no action

Check constraints:
- `remittance_bpr02_cents_check`: `CHECK (bpr02_cents >= 0)`
- `remittance_bpr_credit_debit_check`: `CHECK (bpr_credit_debit = ANY (ARRAY['C'::text, 'D'::text]))`
- `remittance_bpr_method_check`: `CHECK (btrim(bpr_method) <> ''::text)`
- `remittance_claim_count_check`: `CHECK (claim_count >= 0)`
- `remittance_gs06_check`: `CHECK (btrim(gs06) <> ''::text)`
- `remittance_held_reason_check`: `CHECK (held_reason ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `remittance_isa13_check`: `CHECK (btrim(isa13) <> ''::text)`
- `remittance_loads_only_balanced`: `CHECK (status <> 'loaded'::text OR balance_diff_cents = 0)`
- `remittance_not_reviewed_against_itself`: `CHECK (review_of_remittance_id IS DISTINCT FROM id)`
- `remittance_payee_id_qualifier_check`: `CHECK (btrim(payee_id_qualifier) <> ''::text)`
- `remittance_payee_npi_check`: `CHECK (btrim(payee_npi) <> ''::text)`
- `remittance_payer_name_check`: `CHECK (btrim(payer_name) <> ''::text)`
- `remittance_receiver_id_check`: `CHECK (btrim(receiver_id) <> ''::text)`
- `remittance_review_names_its_remittance`: `CHECK ((review_reason IS NULL) = (review_of_remittance_id IS NULL))`
- `remittance_review_reason_check`: `CHECK (review_reason = ANY (ARRAY['trace_reused_another_date'::text, 'trace_reused_same_date'::text]))`
- `remittance_sender_id_check`: `CHECK (btrim(sender_id) <> ''::text)`
- `remittance_st02_check`: `CHECK (btrim(st02) <> ''::text)`
- `remittance_status_check`: `CHECK (status = ANY (ARRAY['loaded'::text, 'held'::text, 'duplicate'::text]))`
- `remittance_trn02_check`: `CHECK (btrim(trn02) <> ''::text)`
- `remittance_trn03_check`: `CHECK (btrim(trn03) <> ''::text)`

Indexes:
- `remittance_by_document`: `USING btree (source_document_id)`
- `remittance_by_payer`: `USING btree (practice_id, payer_id, bpr16_date DESC)`
- `remittance_by_payment_date`: `USING btree (practice_id, bpr16_date DESC, id)`
- `remittance_by_trace`: `USING btree (practice_id, trn02)`
- `remittance_once` (constraint): `UNIQUE USING btree (practice_id, sender_id, isa13, trn02, bpr02_cents)`
- `remittance_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `remittance_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `remittance_references_in_practice`: `BEFORE INSERT ON remittance FOR EACH ROW EXECUTE FUNCTION remittance_references_in_practice()` raises: "a remittance comes from an 835 document of the same practice"; "a remittance names a payer of the same practice"; "a remittance is reviewed against a remittance of the same practice"
- `remittance_updated_at`: `BEFORE UPDATE ON remittance FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `report_document`

<a id="table-report-document"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `report_document_tenant`, registered by `20261025090000_report_documents_and_export_history`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`content`, `id`, `kind`, `period`, `practice_id`, `pricing_run_id`, `requested_by`)
- Column grant: `tp_app` UPDATE (`failure_code`, `pdf_key`, `pdf_sha256`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `kind` | `text` | NOT NULL |  |  | one of coverage, monthly_summary |
| 4 | `period` | `text` | null |  |  |  |
| 5 | `pricing_run_id` | `uuid` | null |  | `pricing_run(id)` |  |
| 6 | `requested_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 7 | `content` | `jsonb` | NOT NULL |  |  |  |
| 8 | `status` | `text` | NOT NULL | `'queued'::text` |  | one of queued, ready, failed |
| 9 | `pdf_key` | `text` | null |  |  |  |
| 10 | `pdf_sha256` | `text` | null |  |  |  |
| 11 | `failure_code` | `text` | null |  |  |  |
| 12 | `generated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 13 | `printed_at` | `timestamp with time zone` | null |  |  |  |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `report_document_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `report_document_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id) on delete no action
- `report_document_requested_by_fkey`: (requested_by) -> `user`(id) on delete no action

Check constraints:
- `report_document_content_check`: `CHECK (jsonb_typeof(content) = 'object'::text)`
- `report_document_failure_code_check`: `CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `report_document_failure_when_failed`: `CHECK ((status = 'failed'::text) = (failure_code IS NOT NULL))`
- `report_document_format`: `CHECK ((content ->> 'format'::text) = CASE kind     WHEN 'coverage'::text THEN 'tp-coverage-report/1'::text     ELSE 'tp-monthly-summary/1'::text END)`
- `report_document_kind_check`: `CHECK (kind = ANY (ARRAY['coverage'::text, 'monthly_summary'::text]))`
- `report_document_pdf_key_check`: `CHECK (pdf_key ~ '^practices/[0-9a-f-]{36}/reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'::text)`
- `report_document_pdf_sha256_check`: `CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `report_document_period_check`: `CHECK (period ~ '^[0-9]{4}-(0[1-9]\|1[0-2])$'::text)`
- `report_document_period_of_a_month`: `CHECK ((kind = 'monthly_summary'::text) = (period IS NOT NULL))`
- `report_document_ready_with_its_pdf`: `CHECK ((status = 'ready'::text) = (pdf_key IS NOT NULL AND pdf_sha256 IS NOT NULL AND printed_at IS NOT NULL))`
- `report_document_run_of_coverage`: `CHECK (kind = 'coverage'::text OR pricing_run_id IS NULL)`
- `report_document_status_check`: `CHECK (status = ANY (ARRAY['queued'::text, 'ready'::text, 'failed'::text]))`

Indexes:
- `report_document_by_practice`: `USING btree (practice_id, generated_at DESC, id)`
- `report_document_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `report_document_requested_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(requested_by = app_actor_id())`
- `report_document_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `report_document_belongs`: `AFTER INSERT ON report_document FOR EACH ROW EXECUTE FUNCTION report_document_belongs()` raises: "a coverage report reads a pricing run of its practice"
- `report_document_no_truncate`: `BEFORE TRUNCATE ON report_document FOR EACH STATEMENT EXECUTE FUNCTION report_document_no_truncate()` raises: "report_document cannot be truncated: a generated report keeps its figures"
- `report_document_refused_while_suspended`: `BEFORE INSERT ON report_document FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` raises: "%"
- `report_document_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON report_document FOR EACH ROW EXECUTE FUNCTION report_document_rules()` raises: "a report document keeps its figures; a new one is generated"; "a report document is printed after it is generated"; "a report document is generated by a person who works the practice's cases, in their own name"; "a report document keeps its figures; only its printed PDF, or the print's failure, is recorded, once"; "the print job records the printed PDF, in no one's name"; "a report document's PDF is stored under its own practice and document"; "a failed print records no PDF"
- `report_document_updated_at`: `BEFORE UPDATE ON report_document FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `restore_drill`

<a id="table-restore-drill"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `id`
- `tp_app`: no privilege
- `tp_operator`: SELECT, INSERT
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `snapshot_ref` | `text` | NOT NULL |  |  |  |
| 3 | `target_ref` | `text` | NOT NULL |  |  |  |
| 4 | `started_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 5 | `completed_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 6 | `duration_ms` | `bigint` | NOT NULL |  |  |  |
| 7 | `outcome` | `text` | NOT NULL |  |  | one of passed, failed |
| 8 | `row_counts` | `jsonb` | NOT NULL |  |  |  |
| 9 | `catalog_problems` | `jsonb` | NOT NULL |  |  |  |
| 10 | `error_code` | `text` | null |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Check constraints:
- `restore_drill_catalog_problems_check`: `CHECK (jsonb_typeof(catalog_problems) = 'array'::text)`
- `restore_drill_duration_ms_check`: `CHECK (duration_ms >= 0)`
- `restore_drill_error_code_check`: `CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'::text)`
- `restore_drill_failure_code`: `CHECK ((outcome = 'failed'::text) = (error_code IS NOT NULL))`
- `restore_drill_order`: `CHECK (completed_at >= started_at)`
- `restore_drill_outcome_check`: `CHECK (outcome = ANY (ARRAY['passed'::text, 'failed'::text]))`
- `restore_drill_row_counts_check`: `CHECK (jsonb_typeof(row_counts) = 'object'::text)`
- `restore_drill_snapshot_ref_check`: `CHECK (btrim(snapshot_ref) <> ''::text)`
- `restore_drill_target_ref_check`: `CHECK (btrim(target_ref) <> ''::text)`

Indexes:
- `restore_drill_pkey` (primary): `UNIQUE USING btree (id)`

Policies (0):
- none

Triggers:
- `restore_drill_append_only`: `BEFORE DELETE OR UPDATE ON restore_drill FOR EACH ROW EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"
- `restore_drill_no_truncate`: `BEFORE TRUNCATE ON restore_drill FOR EACH STATEMENT EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"

### Table `roi_statement`

<a id="table-roi-statement"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `roi_statement_tenant`, registered by `20261023120000_recovery_ledger`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`actionable_open_cents`, `approved_unposted_cents`, `document_key`, `fees_cents`, `generated_by`, `id`, `interest_cents`, `links`, `period_from`, `period_to`, `practice_id`, `proof_level`, `pursuit_hours`, `recovered_cents`)
- Column grant: `tp_app` UPDATE (`document_key`, `pdf_sha256`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `period_from` | `date` | NOT NULL |  |  |  |
| 4 | `period_to` | `date` | NOT NULL |  |  |  |
| 5 | `proof_level` | `text` | NOT NULL |  |  | one of posted, deposited |
| 6 | `fees_cents` | `bigint` | NOT NULL |  |  |  |
| 7 | `recovered_cents` | `bigint` | NOT NULL |  |  |  |
| 8 | `interest_cents` | `bigint` | NOT NULL |  |  |  |
| 9 | `approved_unposted_cents` | `bigint` | NOT NULL |  |  |  |
| 10 | `actionable_open_cents` | `bigint` | NOT NULL |  |  |  |
| 11 | `pursuit_hours` | `numeric(9,2)` | NOT NULL |  |  |  |
| 12 | `links` | `jsonb` | NOT NULL |  |  |  |
| 13 | `generated_by` | `uuid` | null |  | `user(id)` |  |
| 14 | `generated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 15 | `document_key` | `text` | null |  |  |  |
| 16 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 17 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 18 | `pdf_sha256` | `text` | null |  |  |  |

Foreign keys:
- `roi_statement_generated_by_fkey`: (generated_by) -> `user`(id) on delete no action
- `roi_statement_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `roi_statement_actionable_open_cents_check`: `CHECK (actionable_open_cents >= 0)`
- `roi_statement_approved_unposted_cents_check`: `CHECK (approved_unposted_cents >= 0)`
- `roi_statement_document_key_check`: `CHECK (document_key ~ '^practices/[0-9a-f-]{36}/reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'::text)`
- `roi_statement_document_with_hash`: `CHECK ((document_key IS NULL) = (pdf_sha256 IS NULL))`
- `roi_statement_fees_cents_check`: `CHECK (fees_cents >= 0)`
- `roi_statement_links`: `CHECK (roi_links_valid(links))`
- `roi_statement_pdf_sha256_check`: `CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `roi_statement_period`: `CHECK (period_from <= period_to)`
- `roi_statement_proof_level_check`: `CHECK (proof_level = ANY (ARRAY['posted'::text, 'deposited'::text]))`
- `roi_statement_pursuit_hours_check`: `CHECK (pursuit_hours >= 0::numeric)`

Indexes:
- `roi_statement_by_period`: `USING btree (practice_id, period_from DESC, generated_at DESC)`
- `roi_statement_pkey` (primary): `UNIQUE USING btree (id)`
- `roi_statement_quarterly`: `UNIQUE USING btree (practice_id, period_from, period_to) WHERE (generated_by IS NULL)`

Policies (1):
- `roi_statement_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `roi_statement_no_truncate`: `BEFORE TRUNCATE ON roi_statement FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()` raises: "% cannot be truncated: the ledger keeps what it recorded"
- `roi_statement_refused_while_suspended`: `BEFORE INSERT ON roi_statement FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()` raises: "%"
- `roi_statement_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON roi_statement FOR EACH ROW EXECUTE FUNCTION roi_statement_rules()` raises: "an ROI statement keeps its figures; a new one is generated"; "an ROI statement keeps its figures; only its printed PDF is recorded, once"; "the statement job records the printed PDF, in no one's name"; "a statement's PDF is stored under its own practice and statement"; "a statement is printed after it is written"; "an ROI statement is generated on demand by a person who reconciles postings, in their own name"; "the quarterly statement is generated in no one's name"; "an ROI statement's recovered and interest are the sums of the entries it links"

### Table `role_permission`

<a id="table-role-permission"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `role` | `text` | NOT NULL |  |  | one of practice_admin, billing_manager, analyst, viewer, firm_principal, firm_analyst, platform_admin, contract_specialist, reviewer, support |
| 3 | `action` | `text` | NOT NULL |  |  |  |
| 4 | `effect` | `text` | NOT NULL |  |  | one of allow, deny |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `role_permission_once`: `UNIQUE (role, action)`

Check constraints:
- `role_permission_action_check`: `CHECK (action ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'::text)`
- `role_permission_effect_check`: `CHECK (effect = ANY (ARRAY['allow'::text, 'deny'::text]))`
- `role_permission_role_check`: `CHECK (role = ANY (ARRAY['practice_admin'::text, 'billing_manager'::text, 'analyst'::text, 'viewer'::text, 'firm_principal'::text, 'firm_analyst'::text, 'platform_admin'::text, 'contract_specialist'::text, 'reviewer'::text, 'support'::text]))`

Indexes:
- `role_permission_once` (constraint): `UNIQUE USING btree (role, action)`
- `role_permission_pkey` (primary): `UNIQUE USING btree (id)`

Policies (0):
- none

Triggers:
- `role_permission_updated_at`: `BEFORE UPDATE ON role_permission FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `rule_record`

<a id="table-rule-record"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` |  |
| 3 | `record_type` | `text` | NOT NULL |  |  | one of pfs_rvu, pfs_gpci, conversion_factor, mppr_rate, therapy_threshold, assistant_modifier, sequestration, ncci_ptp, ncci_mue, carc, rarc, claim_status_code, state_prompt_pay, dispute_window, locality_map, denial_category |
| 4 | `key` | `jsonb` | NOT NULL |  |  |  |
| 5 | `value` | `jsonb` | NOT NULL |  |  |  |
| 6 | `effective_from` | `date` | NOT NULL |  |  |  |
| 7 | `effective_to` | `date` | null |  |  |  |
| 8 | `source` | `jsonb` | NOT NULL |  |  |  |
| 9 | `verification` | `text` | NOT NULL |  |  | one of L1, L2, L3 |
| 10 | `sha256` | `text` | NOT NULL |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `rule_record_release_no_fkey`: (release_no) -> `rule_release`(release_no) on delete no action

Check constraints:
- `rule_record_check`: `CHECK (effective_to IS NULL OR effective_to >= effective_from)`
- `rule_record_key_check`: `CHECK (jsonb_typeof(key) = 'object'::text)`
- `rule_record_record_type_check`: `CHECK (record_type = ANY (ARRAY['pfs_rvu'::text, 'pfs_gpci'::text, 'conversion_factor'::text, 'mppr_rate'::text, 'therapy_threshold'::text, 'assistant_modifier'::text, 'sequestration'::text, 'ncci_ptp'::text, 'ncci_mue'::text, 'carc'::text, 'rarc'::text, 'claim_status_code'::text, 'state_prompt_pay'::text, 'dispute_window'::text, 'locality_map'::text, 'denial_category'::text]))`
- `rule_record_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `rule_record_source_check`: `CHECK (jsonb_typeof(source) = 'object'::text)`
- `rule_record_value_check`: `CHECK (jsonb_typeof(value) = 'object'::text)`
- `rule_record_verification_check`: `CHECK (verification = ANY (ARRAY['L1'::text, 'L2'::text, 'L3'::text]))`

Indexes:
- `rule_record_by_type`: `USING btree (release_no, record_type)`
- `rule_record_identity`: `UNIQUE USING btree (release_no, record_type, key, effective_from)`
- `rule_record_pkey` (primary): `UNIQUE USING btree (id)`

Policies (0):
- none

Triggers:
- `rule_record_immutable`: `BEFORE INSERT OR DELETE OR UPDATE ON rule_record FOR EACH ROW EXECUTE FUNCTION rule_record_immutable()` raises: "rule_release % is published: no record can be added to it"; "rule_record rows are immutable: a published release never changes; load a new release instead"
- `rule_record_no_truncate`: `BEFORE TRUNCATE ON rule_record FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()` raises: "% cannot be truncated: rule releases are immutable"

### Table `rule_release`

<a id="table-rule-release"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `release_no` | `integer` | NOT NULL |  |  |  |
| 3 | `published_at` | `timestamp with time zone` | null |  |  |  |
| 4 | `manifest_sha256` | `text` | NOT NULL |  |  |  |
| 5 | `notes` | `text` | NOT NULL | `''::text` |  |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `rule_release_release_no_key`: `UNIQUE (release_no)`

Check constraints:
- `rule_release_manifest_sha256_check`: `CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `rule_release_release_no_check`: `CHECK (release_no > 0)`

Indexes:
- `rule_release_pkey` (primary): `UNIQUE USING btree (id)`
- `rule_release_release_no_key` (constraint): `UNIQUE USING btree (release_no)`

Policies (0):
- none

Triggers:
- `rule_release_immutable`: `BEFORE DELETE OR UPDATE ON rule_release FOR EACH ROW EXECUTE FUNCTION rule_release_immutable()` raises: "rule_release % is immutable: a published release never changes; load a new release instead"
- `rule_release_no_truncate`: `BEFORE TRUNCATE ON rule_release FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()` raises: "% cannot be truncated: rule releases are immutable"

### Table `rule_release_withdrawal`

<a id="table-rule-release-withdrawal"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `release_no`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` |  |
| 2 | `reinstated_release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` |  |
| 3 | `reason` | `text` | NOT NULL |  |  |  |
| 4 | `withdrawn_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `rule_release_withdrawal_reinstated_release_no_fkey`: (reinstated_release_no) -> `rule_release`(release_no) on delete no action
- `rule_release_withdrawal_release_no_fkey`: (release_no) -> `rule_release`(release_no) on delete no action

Check constraints:
- `rule_release_withdrawal_reason_check`: `CHECK (reason ~ '^[ -~]+$'::text AND length(reason) >= 8 AND length(reason) <= 500)`
- `rule_release_withdrawal_reinstates_earlier`: `CHECK (reinstated_release_no < release_no)`

Indexes:
- `rule_release_withdrawal_pkey` (primary): `UNIQUE USING btree (release_no)`

Policies (0):
- none

Triggers:
- `rule_release_withdrawal_no_truncate`: `BEFORE TRUNCATE ON rule_release_withdrawal FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()` raises: "% cannot be truncated: rule releases are immutable"
- `rule_release_withdrawal_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON rule_release_withdrawal FOR EACH ROW EXECUTE FUNCTION rule_release_withdrawal_rules()` raises: "a rule release withdrawal never changes; a correction is a new release"; "only the rule release in force is withdrawn"; "a withdrawal reinstates the newest published release before the one withdrawn"; "a withdrawal records the time it was made"

### Table `schema_migrations`

<a id="table-schema-migrations"></a>

- Class: global (no practice_id, no RLS); owner `tp_owner`; RLS disabled
- Primary key: `filename`
- `tp_app`: no privilege
- `tp_operator`: no privilege
- `tp_billing`: no privilege

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `filename` | `text` | NOT NULL |  |  |  |
| 2 | `checksum` | `text` | NOT NULL |  |  |  |
| 3 | `applied_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Check constraints:
- `schema_migrations_checksum_check`: `CHECK (checksum ~ '^[0-9a-f]{64}$'::text)`
- `schema_migrations_filename_check`: `CHECK (filename ~ '^[0-9]{14}_[a-z0-9_]+[.]sql$'::text)`

Indexes:
- `schema_migrations_pkey` (primary): `UNIQUE USING btree (filename)`

Policies (0):
- none

### Table `service_line`

<a id="table-service-line"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `service_line_tenant`, registered by `20261016120000_remittances`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`charge_cents`, `claim_id`, `id`, `line_allowed_cents`, `line_no`, `modifiers`, `observed_allowed_allocated`, `observed_allowed_basis`, `observed_allowed_cents`, `original_units`, `paid_cents`, `patient_share_cents`, `payer_plan_key`, `place_of_service`, `practice_id`, `procedure_code`, `procedure_qualifier`, `rendering_npi`, `revenue_code`, `service_date`, `service_date_to`, `units`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `claim_id` | `uuid` | NOT NULL |  | `claim(id)` |  |
| 4 | `line_no` | `integer` | NOT NULL |  |  |  |
| 5 | `procedure_qualifier` | `text` | NOT NULL |  |  |  |
| 6 | `procedure_code` | `text` | NOT NULL |  |  |  |
| 7 | `modifiers` | `text[]` | NOT NULL | `'{}'::text[]` |  |  |
| 8 | `revenue_code` | `text` | null |  |  |  |
| 9 | `charge_cents` | `bigint` | NOT NULL |  |  |  |
| 10 | `paid_cents` | `bigint` | NOT NULL |  |  |  |
| 11 | `units` | `numeric(9,3)` | null |  |  |  |
| 12 | `original_units` | `numeric(9,3)` | null |  |  |  |
| 13 | `service_date` | `date` | null |  |  |  |
| 14 | `service_date_to` | `date` | null |  |  |  |
| 15 | `place_of_service` | `text` | null |  |  |  |
| 16 | `line_allowed_cents` | `bigint` | null |  |  |  |
| 17 | `observed_allowed_cents` | `bigint` | NOT NULL |  |  |  |
| 18 | `observed_allowed_basis` | `text` | NOT NULL |  |  | one of amt_b6, paid_plus_pr |
| 19 | `observed_allowed_allocated` | `boolean` | NOT NULL | `false` |  |  |
| 20 | `patient_share_cents` | `bigint` | NOT NULL | `0` |  |  |
| 21 | `rendering_npi` | `text` | null |  |  |  |
| 22 | `payer_plan_key` | `uuid` | NOT NULL |  | `plan(id)` |  |
| 23 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 24 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `service_line_once`: `UNIQUE (claim_id, line_no)`

Foreign keys:
- `service_line_claim_id_fkey`: (claim_id) -> `claim`(id) on delete no action
- `service_line_payer_plan_key_fkey`: (payer_plan_key) -> `plan`(id) on delete no action
- `service_line_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action

Check constraints:
- `service_line_allocated_from_paid_and_share`: `CHECK (NOT observed_allowed_allocated OR observed_allowed_basis = 'paid_plus_pr'::text)`
- `service_line_dates`: `CHECK (service_date_to IS NULL OR service_date IS NOT NULL)`
- `service_line_line_no_check`: `CHECK (line_no >= 1)`
- `service_line_modifiers_check`: `CHECK (cardinality(modifiers) <= 4)`
- `service_line_observed_allowed_basis_check`: `CHECK (observed_allowed_basis = ANY (ARRAY['amt_b6'::text, 'paid_plus_pr'::text]))`
- `service_line_observed_from_b6`: `CHECK (observed_allowed_basis <> 'amt_b6'::text OR observed_allowed_cents = line_allowed_cents)`
- `service_line_observed_from_paid_and_share`: `CHECK (observed_allowed_basis <> 'paid_plus_pr'::text OR observed_allowed_cents = (paid_cents + patient_share_cents))`
- `service_line_procedure_code_check`: `CHECK (btrim(procedure_code) <> ''::text)`
- `service_line_procedure_qualifier_check`: `CHECK (btrim(procedure_qualifier) <> ''::text)`

Indexes:
- `service_line_by_plan_and_code`: `USING btree (practice_id, payer_plan_key, procedure_code)`
- `service_line_by_service_date`: `USING btree (practice_id, service_date)`
- `service_line_once` (constraint): `UNIQUE USING btree (claim_id, line_no)`
- `service_line_pkey` (primary): `UNIQUE USING btree (id)`

Policies (1):
- `service_line_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `service_line_references_in_practice`: `BEFORE INSERT ON service_line FOR EACH ROW EXECUTE FUNCTION service_line_references_in_practice()` raises: "a service line belongs to a claim of the same practice"; "a service line names a plan of the same practice"
- `service_line_updated_at`: `BEFORE UPDATE ON service_line FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `source_document`

<a id="table-source-document"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `source_document_tenant`, registered by `20261016090000_documents_payers_plans`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`content_type`, `id`, `kind`, `parent_document_id`, `practice_id`, `scan_at`, `scan_status`, `sha256`, `size_bytes`, `status`, `uploaded_by`)
- Column grant: `tp_app` UPDATE (`page_count`, `page_text_status`, `scan_at`, `scan_status`, `sha256`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `kind` | `text` | NOT NULL |  |  | one of x12_835, contract, exhibit, posting_export, eft_export, payer_letter, other |
| 4 | `s3_key` | `text` | NOT NULL |  |  | generated always as `((('practices/'::text \|\| (practice_id)::text) \|\| '/documents/'::text) \|\| (id)::text)` stored |
| 5 | `sha256` | `text` | null |  |  |  |
| 6 | `size_bytes` | `bigint` | NOT NULL |  |  |  |
| 7 | `content_type` | `text` | NOT NULL |  |  |  |
| 8 | `uploaded_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 9 | `scan_status` | `text` | NOT NULL | `'pending'::text` |  | one of pending, clean, flagged, unscannable, failed |
| 10 | `scan_at` | `timestamp with time zone` | null |  |  |  |
| 11 | `retention_class` | `text` | NOT NULL | `'records'::text` |  |  |
| 12 | `parent_document_id` | `uuid` | null |  | `source_document(id)` |  |
| 13 | `status` | `text` | NOT NULL | `'awaiting_upload'::text` |  | one of awaiting_upload, received, scanned, stored, expanded, parse_queued, parsed, balanced, loaded, held, duplicate, quarantined, not_835, wrong_type, unreadable, too_large, too_compressed, nested_zip, unsafe_entry, encrypted, too_many_entries, failed |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 16 | `page_text_status` | `text` | null |  |  | one of ready, unsupported_document, document_unreadable |
| 17 | `page_count` | `integer` | null |  |  |  |

Foreign keys:
- `source_document_parent_document_id_fkey`: (parent_document_id) -> `source_document`(id) on delete no action
- `source_document_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `source_document_uploaded_by_fkey`: (uploaded_by) -> `user`(id) on delete no action

Check constraints:
- `source_document_content_type_check`: `CHECK (content_type ~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,126}$'::text)`
- `source_document_kind_check`: `CHECK (kind = ANY (ARRAY['x12_835'::text, 'contract'::text, 'exhibit'::text, 'posting_export'::text, 'eft_export'::text, 'payer_letter'::text, 'other'::text]))`
- `source_document_not_its_own_entry`: `CHECK (parent_document_id IS DISTINCT FROM id)`
- `source_document_page_count_check`: `CHECK (page_count >= 0)`
- `source_document_page_count_when_ready`: `CHECK ( CASE     WHEN page_text_status = 'ready'::text THEN page_count IS NOT NULL     ELSE page_count IS NULL END)`
- `source_document_page_text_kind`: `CHECK (page_text_status IS NULL OR (kind = ANY (ARRAY['contract'::text, 'exhibit'::text, 'payer_letter'::text])))`
- `source_document_page_text_status_check`: `CHECK (page_text_status = ANY (ARRAY['ready'::text, 'unsupported_document'::text, 'document_unreadable'::text]))`
- `source_document_retention_class_check`: `CHECK (retention_class = 'records'::text)`
- `source_document_scan_status_check`: `CHECK (scan_status = ANY (ARRAY['pending'::text, 'clean'::text, 'flagged'::text, 'unscannable'::text, 'failed'::text]))`
- `source_document_scan_time`: `CHECK ((scan_status = 'pending'::text) = (scan_at IS NULL))`
- `source_document_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `source_document_size_bytes_check`: `CHECK (size_bytes >= 0)`
- `source_document_status_check`: `CHECK (status = ANY (ARRAY['awaiting_upload'::text, 'received'::text, 'scanned'::text, 'stored'::text, 'expanded'::text, 'parse_queued'::text, 'parsed'::text, 'balanced'::text, 'loaded'::text, 'held'::text, 'duplicate'::text, 'quarantined'::text, 'not_835'::text, 'wrong_type'::text, 'unreadable'::text, 'too_large'::text, 'too_compressed'::text, 'nested_zip'::text, 'unsafe_entry'::text, 'encrypted'::text, 'too_many_entries'::text, 'failed'::text]))`

Indexes:
- `source_document_by_parent`: `USING btree (parent_document_id, status) WHERE (parent_document_id IS NOT NULL)`
- `source_document_by_practice`: `USING btree (practice_id, created_at DESC, id)`
- `source_document_first_of_its_bytes`: `UNIQUE USING btree (practice_id, sha256) WHERE ((sha256 IS NOT NULL) AND (status <> 'duplicate'::text))`
- `source_document_pkey` (primary): `UNIQUE USING btree (id)`

Policies (4):
- `source_document_inserted_unscanned`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((scan_status = 'pending'::text) AND (sha256 IS NULL) AND ((parent_document_id IS NOT NULL) OR (status = 'awaiting_upload'::text)))`
- `source_document_requires_baa`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `( SELECT practice_baa_on_file(source_document.practice_id) AS practice_baa_on_file)`
- `source_document_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
- `source_document_uploaded_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((parent_document_id IS NOT NULL) OR (uploaded_by = app_actor_id()))`

Triggers:
- `source_document_refused_while_suspended`: `BEFORE INSERT ON source_document FOR EACH ROW WHEN (new.parent_document_id IS NULL) EXECUTE FUNCTION refuse_new_work_while_suspended()` raises: "%"
- `source_document_rules`: `BEFORE INSERT OR UPDATE ON source_document FOR EACH ROW EXECUTE FUNCTION source_document_rules()` raises: "a zip entry belongs to a top-level document of the same practice"; "a zip entry carries its zip's uploader"; "a zip entry is clean only when its zip's malware scan is"; "a document is scanned or queued for parse only when its malware scan is clean"; "a document's SHA-256 never changes once recorded"; "a scan verdict is never taken back"; "a malware finding is never cleared"; "a quarantined or duplicate document stays so"
- `source_document_updated_at`: `BEFORE UPDATE ON source_document FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `status_component`

<a id="table-status-component"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `key`
- `tp_app`: SELECT, UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` UPDATE (`changed_by`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `key` | `text` | NOT NULL |  |  | one of web, sign_in, uploads, jobs, exports, billing, email |
| 2 | `name` | `text` | NOT NULL |  |  |  |
| 3 | `position` | `integer` | NOT NULL |  |  |  |
| 4 | `status` | `text` | NOT NULL | `'operational'::text` |  | one of operational, degraded, partial_outage, major_outage, maintenance |
| 5 | `changed_by` | `uuid` | null |  | `user(id)` |  |
| 6 | `changed_at` | `timestamp with time zone` | null |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `status_component_position_key`: `UNIQUE ("position")`

Foreign keys:
- `status_component_changed_by_fkey`: (changed_by) -> `user`(id) on delete no action

Check constraints:
- `status_component_key_check`: `CHECK (key = ANY (ARRAY['web'::text, 'sign_in'::text, 'uploads'::text, 'jobs'::text, 'exports'::text, 'billing'::text, 'email'::text]))`
- `status_component_name_check`: `CHECK (btrim(name) <> ''::text)`
- `status_component_status_check`: `CHECK (status = ANY (ARRAY['operational'::text, 'degraded'::text, 'partial_outage'::text, 'major_outage'::text, 'maintenance'::text]))`

Indexes:
- `status_component_pkey` (primary): `UNIQUE USING btree (key)`
- `status_component_position_key` (constraint): `UNIQUE USING btree ("position")`

Policies (3):
- `status_component_managed`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted)`
  - WITH CHECK `(( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted) AND (changed_by = app_actor_id()))`
- `status_component_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `status_component_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Triggers:
- `status_component_rules`: `BEFORE UPDATE ON status_component FOR EACH ROW EXECUTE FUNCTION status_component_rules()` raises: "a status component keeps its key, name and place"
- `status_component_updated_at`: `BEFORE UPDATE ON status_component FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `status_incident`

<a id="table-status-incident"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`components`, `created_by`, `id`, `impact`, `title`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `title` | `text` | NOT NULL |  |  |  |
| 3 | `impact` | `text` | NOT NULL |  |  | one of minor, major, critical |
| 4 | `components` | `text[]` | NOT NULL |  |  |  |
| 5 | `status` | `text` | NOT NULL | `'investigating'::text` |  | one of investigating, identified, monitoring, resolved |
| 6 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `resolved_at` | `timestamp with time zone` | null |  |  |  |
| 8 | `created_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `status_incident_created_by_fkey`: (created_by) -> `user`(id) on delete no action

Check constraints:
- `status_incident_components_check`: `CHECK (cardinality(components) >= 1 AND cardinality(components) <= 7 AND components <@ ARRAY['web'::text, 'sign_in'::text, 'uploads'::text, 'jobs'::text, 'exports'::text, 'billing'::text, 'email'::text])`
- `status_incident_impact_check`: `CHECK (impact = ANY (ARRAY['minor'::text, 'major'::text, 'critical'::text]))`
- `status_incident_resolution`: `CHECK ((status = 'resolved'::text) = (resolved_at IS NOT NULL))`
- `status_incident_status_check`: `CHECK (status = ANY (ARRAY['investigating'::text, 'identified'::text, 'monitoring'::text, 'resolved'::text]))`
- `status_incident_title_check`: `CHECK (btrim(title) <> ''::text AND length(title) <= 120)`

Indexes:
- `status_incident_by_started`: `USING btree (started_at DESC)`
- `status_incident_pkey` (primary): `UNIQUE USING btree (id)`

Policies (3):
- `status_incident_opened_by_platform`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted) AND (created_by = app_actor_id()))`
- `status_incident_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `status_incident_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Triggers:
- `status_incident_opened`: `BEFORE INSERT ON status_incident FOR EACH ROW EXECUTE FUNCTION status_incident_opened()`
- `status_incident_updated_at`: `BEFORE UPDATE ON status_incident FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `status_incident_update`

<a id="table-status-incident-update"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `incident_id`, `message`, `posted_by`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `incident_id` | `uuid` | NOT NULL |  | `status_incident(id)` |  |
| 3 | `status` | `text` | NOT NULL |  |  | one of investigating, identified, monitoring, resolved |
| 4 | `message` | `text` | NOT NULL |  |  |  |
| 5 | `posted_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 6 | `posted_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `status_incident_update_incident_id_fkey`: (incident_id) -> `status_incident`(id) on delete no action
- `status_incident_update_posted_by_fkey`: (posted_by) -> `user`(id) on delete no action

Check constraints:
- `status_incident_update_message_check`: `CHECK (btrim(message) <> ''::text AND length(message) <= 1000)`
- `status_incident_update_status_check`: `CHECK (status = ANY (ARRAY['investigating'::text, 'identified'::text, 'monitoring'::text, 'resolved'::text]))`

Indexes:
- `status_incident_update_by_incident`: `USING btree (incident_id, posted_at)`
- `status_incident_update_pkey` (primary): `UNIQUE USING btree (id)`

Policies (3):
- `status_incident_update_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `status_incident_update_posted_by_platform`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted) AND (posted_by = app_actor_id()))`
- `status_incident_update_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Triggers:
- `status_incident_update_append_only`: `BEFORE DELETE OR UPDATE ON status_incident_update FOR EACH ROW EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"
- `status_incident_update_moves`: `BEFORE INSERT ON status_incident_update FOR EACH ROW EXECUTE FUNCTION status_incident_update_moves()` raises: "a resolved incident takes no more updates; open a new one"

### Table `submission`

<a id="table-submission"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `submission_tenant`, registered by `20261023090000_packets_submissions_and_responses`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`case_id`, `channel`, `export_csv_sha256`, `export_sha256`, `follow_up_on`, `id`, `packet_version_id`, `practice_id`, `reference`, `submitted_by`, `submitted_on`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` |  |
| 4 | `packet_version_id` | `uuid` | NOT NULL |  | `packet_version(id)` |  |
| 5 | `submitted_on` | `date` | NOT NULL |  |  |  |
| 6 | `channel` | `text` | NOT NULL |  |  | one of payer_portal, fax, mail, provider_relations_email |
| 7 | `reference` | `text` | null |  |  | enc:v1 |
| 8 | `submitted_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 9 | `follow_up_on` | `date` | NOT NULL |  |  |  |
| 10 | `export_sha256` | `text` | NOT NULL |  |  |  |
| 11 | `export_csv_sha256` | `text` | NOT NULL |  |  |  |
| 12 | `dispute_level` | `integer` | NOT NULL | `1` |  |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `submission_case_id_fkey`: (case_id) -> `case`(id) on delete no action
- `submission_packet_version_id_fkey`: (packet_version_id) -> `packet_version`(id) on delete no action
- `submission_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `submission_submitted_by_fkey`: (submitted_by) -> `user`(id) on delete no action

Check constraints:
- `submission_channel_check`: `CHECK (channel = ANY (ARRAY['payer_portal'::text, 'fax'::text, 'mail'::text, 'provider_relations_email'::text]))`
- `submission_dispute_level_check`: `CHECK (dispute_level >= 1)`
- `submission_export_csv_sha256_check`: `CHECK (export_csv_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `submission_export_sha256_check`: `CHECK (export_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `submission_follow_up_after`: `CHECK (follow_up_on >= submitted_on)`
- `submission_reference_check`: `CHECK (reference ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`

Indexes:
- `submission_by_case`: `USING btree (practice_id, case_id, submitted_on DESC)`
- `submission_by_follow_up`: `USING btree (practice_id, follow_up_on)`
- `submission_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `submission_logged_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(submitted_by = app_actor_id())`
- `submission_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `submission_belongs`: `AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_belongs()` raises: "a submission is logged by a person who logs submissions, in their own name"; "a submission is of a version of its case's packet"; "a packet is submitted once it is exported"; "a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit"; "a submission carries the SHA-256 of the export it sent"; "a submission is dated from its export to today"; "a case closed written off takes no submission"; "a submission sends a version of the case's dispute level"; "a submission is dated on or after the case's last one"; "the payer has answered this dispute; only a denial that reopens the case starts the next level"; "the next dispute level is submitted within its window"
- `submission_never_deleted`: `BEFORE DELETE ON submission FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()` raises: "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `submission_no_truncate`: `BEFORE TRUNCATE ON submission FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()` raises: "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `submission_refresh_case`: `AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_refresh_case()`
- `submission_rules`: `BEFORE INSERT OR UPDATE ON submission FOR EACH ROW EXECUTE FUNCTION submission_rules()` raises: "a submission never changes once logged"

### Table `subscription`

<a id="table-subscription"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `stripe_subscription_id` | `text` | NOT NULL |  |  |  |
| 4 | `stripe_customer_id` | `text` | NOT NULL |  |  |  |
| 5 | `stripe_price_id` | `text` | NOT NULL |  |  |  |
| 6 | `plan` | `text` | NOT NULL |  |  | one of monthly, annual |
| 7 | `status` | `text` | NOT NULL |  |  | one of incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused |
| 8 | `current_period_start` | `timestamp with time zone` | null |  |  |  |
| 9 | `current_period_end` | `timestamp with time zone` | null |  |  |  |
| 10 | `cancel_at_period_end` | `boolean` | NOT NULL | `false` |  |  |
| 11 | `canceled_at` | `timestamp with time zone` | null |  |  |  |
| 12 | `stripe_event_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `subscription_stripe_subscription_id_key`: `UNIQUE (stripe_subscription_id)`

Foreign keys:
- `subscription_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action

Check constraints:
- `subscription_period`: `CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end >= current_period_start)`
- `subscription_plan_check`: `CHECK (plan = ANY (ARRAY['monthly'::text, 'annual'::text]))`
- `subscription_status_check`: `CHECK (status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'paused'::text]))`
- `subscription_stripe_customer_id_check`: `CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9_]{1,250}$'::text)`
- `subscription_stripe_price_id_check`: `CHECK (stripe_price_id ~ '^price_[A-Za-z0-9_]{1,250}$'::text)`
- `subscription_stripe_subscription_id_check`: `CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'::text)`

Indexes:
- `subscription_by_organization`: `USING btree (organization_id, created_at DESC)`
- `subscription_pkey` (primary): `UNIQUE USING btree (id)`
- `subscription_stripe_subscription_id_key` (constraint): `UNIQUE USING btree (stripe_subscription_id)`

Policies (3):
- `subscription_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `subscription_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `subscription_owners_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `(app_actor_organization_permitted(organization_id, 'organization.billing'::text) OR ( SELECT app_actor_platform_permitted('billing.manage'::text) AS app_actor_platform_permitted))`

Triggers:
- `subscription_no_truncate`: `BEFORE TRUNCATE ON subscription FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` raises: "% rows are kept"; "a usage snapshot never changes"; "a billing event is recorded once; only its outcome follows"
- `subscription_rules`: `BEFORE DELETE OR UPDATE ON subscription FOR EACH ROW EXECUTE FUNCTION subscription_rules()` raises: "a subscription is kept"; "a subscription belongs to its organization and Stripe subscription for good"
- `subscription_updated_at`: `BEFORE UPDATE ON subscription FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `subscription_claim`

<a id="table-subscription-claim"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: no privilege
- `tp_operator`: no privilege
- `tp_billing`: SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `plan` | `text` | NOT NULL |  |  | one of monthly, annual |
| 4 | `status` | `text` | NOT NULL | `'pending'::text` |  | one of pending, created, failed, ended |
| 5 | `stripe_subscription_id` | `text` | null |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `subscription_claim_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action

Check constraints:
- `subscription_claim_plan_check`: `CHECK (plan = ANY (ARRAY['monthly'::text, 'annual'::text]))`
- `subscription_claim_status_check`: `CHECK (status = ANY (ARRAY['pending'::text, 'created'::text, 'failed'::text, 'ended'::text]))`
- `subscription_claim_stripe_subscription_id_check`: `CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'::text)`
- `subscription_claim_subscription`: `CHECK ((stripe_subscription_id IS NOT NULL) = (status = ANY (ARRAY['created'::text, 'ended'::text])))`

Indexes:
- `subscription_claim_by_subscription`: `USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL)`
- `subscription_claim_one_per_organization`: `UNIQUE USING btree (organization_id) WHERE (status = ANY (ARRAY['pending'::text, 'created'::text]))`
- `subscription_claim_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `subscription_claim_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `subscription_claim_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`

Triggers:
- `subscription_claim_no_truncate`: `BEFORE TRUNCATE ON subscription_claim FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` raises: "% rows are kept"; "a usage snapshot never changes"; "a billing event is recorded once; only its outcome follows"
- `subscription_claim_rules`: `BEFORE DELETE OR UPDATE ON subscription_claim FOR EACH ROW EXECUTE FUNCTION subscription_claim_rules()` raises: "a subscription claim is kept"; "a subscription claim moves from pending to created or failed, and from created to ended"
- `subscription_claim_updated_at`: `BEFORE UPDATE ON subscription_claim FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `support_grant`

<a id="table-support-grant"></a>

- Class: PHI (registered); owner `tp_owner`; RLS ENABLED and FORCED
- phi_table_registry: policy `support_grant_tenant`, registered by `20261015140000_tenancy`; policy qualifies: yes
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`expires_at`, `id`, `practice_id`, `reason`, `ticket`, `user_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` |  |
| 3 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 4 | `ticket` | `text` | NOT NULL |  |  |  |
| 5 | `reason` | `text` | NOT NULL |  |  |  |
| 6 | `expires_at` | `timestamp with time zone` | NOT NULL |  |  |  |
| 7 | `notified_at` | `timestamp with time zone` | null |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Foreign keys:
- `support_grant_practice_id_fkey`: (practice_id) -> `practice`(id) on delete no action
- `support_grant_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `support_grant_four_hours`: `CHECK (expires_at > created_at AND expires_at <= (created_at + '04:00:00'::interval))`
- `support_grant_reason_check`: `CHECK (btrim(reason) <> ''::text)`
- `support_grant_ticket_check`: `CHECK (ticket ~ '^[A-Za-z0-9-]{1,64}$'::text)`

Indexes:
- `support_grant_by_practice`: `USING btree (practice_id)`
- `support_grant_by_user`: `USING btree (user_id)`
- `support_grant_pkey` (primary): `UNIQUE USING btree (id)`

Policies (7):
- `support_grant_created_by_platform_administrator`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin)`
- `support_grant_not_updated_by_the_application`: RESTRICTIVE FOR UPDATE TO tp_app
  - USING `false`
- `support_grant_platform_administrators_insert`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `( SELECT app_actor_platform_permitted('support_grant.create'::text) AS app_actor_platform_permitted)`
- `support_grant_platform_administrators_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin)`
- `support_grant_read_by_practice_and_platform`: RESTRICTIVE FOR SELECT TO tp_app
  - USING `((practice_id = ANY (( SELECT app_actor_group_practice_ids() AS app_actor_group_practice_ids)::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`
- `support_grant_resolver`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `support_grant_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Triggers:
- `support_grant_fixed`: `BEFORE UPDATE ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_fixed()` raises: "a support grant never changes; only its closing notice is recorded, once, and it can be ended early, once"
- `support_grant_grantee`: `BEFORE INSERT ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_grantee()` raises: "nobody grants themselves support access"; "a support grant goes to a support engineer, a contract specialist or a reimbursement reviewer with a current role"
- `support_grant_security_events`: `AFTER INSERT OR UPDATE OF expires_at ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_security_events()`
- `support_grant_updated_at`: `BEFORE UPDATE ON support_grant FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `support_ticket`

<a id="table-support-ticket"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`category`, `id`, `message`, `requester_id`, `screen`, `subject`)
- Column grant: `tp_app` UPDATE (`status`, `status_changed_by`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `number` | `bigint` | NOT NULL |  |  | identity a |
| 3 | `requester_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 4 | `screen` | `text` | NOT NULL |  |  |  |
| 5 | `category` | `text` | NOT NULL |  |  | one of question, problem, access, billing, data, other |
| 6 | `subject` | `text` | NOT NULL |  |  |  |
| 7 | `message` | `text` | NOT NULL |  |  |  |
| 8 | `status` | `text` | NOT NULL | `'open'::text` |  | one of open, answered, closed |
| 9 | `status_changed_by` | `uuid` | null |  | `user(id)` |  |
| 10 | `status_changed_at` | `timestamp with time zone` | null |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `support_ticket_number_key`: `UNIQUE (number)`

Foreign keys:
- `support_ticket_requester_id_fkey`: (requester_id) -> `user`(id) on delete no action
- `support_ticket_status_changed_by_fkey`: (status_changed_by) -> `user`(id) on delete no action

Check constraints:
- `support_ticket_category_check`: `CHECK (category = ANY (ARRAY['question'::text, 'problem'::text, 'access'::text, 'billing'::text, 'data'::text, 'other'::text]))`
- `support_ticket_message_check`: `CHECK (btrim(message) <> ''::text AND length(message) <= 4000)`
- `support_ticket_screen_check`: `CHECK (screen ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `support_ticket_status_change`: `CHECK ((status_changed_by IS NULL) = (status_changed_at IS NULL))`
- `support_ticket_status_check`: `CHECK (status = ANY (ARRAY['open'::text, 'answered'::text, 'closed'::text]))`
- `support_ticket_subject_check`: `CHECK (btrim(subject) <> ''::text AND length(subject) <= 200)`

Indexes:
- `support_ticket_by_requester`: `USING btree (requester_id, created_at DESC)`
- `support_ticket_by_status`: `USING btree (status, created_at DESC)`
- `support_ticket_number_key` (constraint): `UNIQUE USING btree (number)`
- `support_ticket_pkey` (primary): `UNIQUE USING btree (id)`

Policies (4):
- `support_ticket_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `support_ticket_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((requester_id = app_actor_id()) OR ( SELECT app_actor_platform_permitted('support_ticket.work'::text) AS app_actor_platform_permitted))`
- `support_ticket_requested`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(requester_id = app_actor_id())`
- `support_ticket_worked`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `( SELECT app_actor_platform_permitted('support_ticket.work'::text) AS app_actor_platform_permitted)`
  - WITH CHECK `(( SELECT app_actor_platform_permitted('support_ticket.work'::text) AS app_actor_platform_permitted) AND (status_changed_by = app_actor_id()))`

Triggers:
- `support_ticket_rules`: `BEFORE INSERT OR UPDATE ON support_ticket FOR EACH ROW EXECUTE FUNCTION support_ticket_rules()` raises: "a ticket keeps what its requester wrote"
- `support_ticket_updated_at`: `BEFORE UPDATE ON support_ticket FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `terms_acceptance`

<a id="table-terms-acceptance"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `request_id`, `terms_version_id`, `user_id`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 3 | `terms_version_id` | `uuid` | NOT NULL |  | `terms_version(id)` |  |
| 4 | `accepted_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 5 | `request_id` | `text` | null |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `terms_acceptance_once`: `UNIQUE (user_id, terms_version_id)`

Foreign keys:
- `terms_acceptance_terms_version_id_fkey`: (terms_version_id) -> `terms_version`(id) on delete no action
- `terms_acceptance_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `terms_acceptance_request_id_check`: `CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`

Indexes:
- `terms_acceptance_once` (constraint): `UNIQUE USING btree (user_id, terms_version_id)`
- `terms_acceptance_pkey` (primary): `UNIQUE USING btree (id)`

Policies (3):
- `terms_acceptance_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `terms_acceptance_self`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(user_id = app_actor_id())`
- `terms_acceptance_self_and_platform_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((user_id = app_actor_id()) OR ( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted))`

Triggers:
- `terms_acceptance_accepted_now`: `BEFORE INSERT ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION terms_accepted_now()`
- `terms_acceptance_append_only`: `BEFORE DELETE OR UPDATE ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"

### Table `terms_version`

<a id="table-terms-version"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`document_ref`, `id`, `published_by`, `sha256`, `version`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `version` | `text` | NOT NULL |  |  |  |
| 3 | `document_ref` | `text` | NOT NULL |  |  |  |
| 4 | `sha256` | `text` | NOT NULL |  |  |  |
| 5 | `published_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `published_by` | `uuid` | NOT NULL |  | `user(id)` |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `terms_version_version_key`: `UNIQUE (version)`

Foreign keys:
- `terms_version_published_by_fkey`: (published_by) -> `user`(id) on delete no action

Check constraints:
- `terms_version_document_ref_check`: `CHECK (document_ref ~ '^[A-Za-z0-9:/._-]{1,200}$'::text)`
- `terms_version_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `terms_version_version_check`: `CHECK (version ~ '^[A-Za-z0-9._-]{1,40}$'::text)`

Indexes:
- `terms_version_by_published`: `USING btree (published_at DESC)`
- `terms_version_pkey` (primary): `UNIQUE USING btree (id)`
- `terms_version_version_key` (constraint): `UNIQUE USING btree (version)`

Policies (3):
- `terms_version_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `terms_version_published_by_platform`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('agreement.record'::text) AS app_actor_platform_permitted) AND (published_by = app_actor_id()))`
- `terms_version_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Triggers:
- `terms_version_append_only`: `BEFORE DELETE OR UPDATE ON terms_version FOR EACH ROW EXECUTE FUNCTION reject_change()` raises: "% is append-only: % is refused"
- `terms_version_published_now`: `BEFORE INSERT ON terms_version FOR EACH ROW EXECUTE FUNCTION terms_published_now()`

### Table `usage_snapshot`

<a id="table-usage-snapshot"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: SELECT, INSERT

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` |  |
| 3 | `date` | `date` | NOT NULL |  |  |  |
| 4 | `granted_practices` | `integer` | NOT NULL |  |  |  |
| 5 | `active_practices` | `integer` | NOT NULL |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `usage_snapshot_once`: `UNIQUE (organization_id, date)`

Foreign keys:
- `usage_snapshot_organization_id_fkey`: (organization_id) -> `organization`(id) on delete no action

Check constraints:
- `usage_snapshot_active_practices_check`: `CHECK (active_practices >= 0)`
- `usage_snapshot_granted_practices_check`: `CHECK (granted_practices >= 0)`

Indexes:
- `usage_snapshot_once` (constraint): `UNIQUE USING btree (organization_id, date)`
- `usage_snapshot_pkey` (primary): `UNIQUE USING btree (id)`

Policies (3):
- `usage_snapshot_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `usage_snapshot_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `usage_snapshot_owners_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `(app_actor_organization_permitted(organization_id, 'organization.billing'::text) OR ( SELECT app_actor_platform_permitted('billing.manage'::text) AS app_actor_platform_permitted))`

Triggers:
- `usage_snapshot_kept`: `BEFORE DELETE OR UPDATE ON usage_snapshot FOR EACH ROW EXECUTE FUNCTION billing_records_kept()` raises: "% rows are kept"; "a usage snapshot never changes"; "a billing event is recorded once; only its outcome follows"
- `usage_snapshot_no_truncate`: `BEFORE TRUNCATE ON usage_snapshot FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()` raises: "% rows are kept"; "a usage snapshot never changes"; "a billing event is recorded once; only its outcome follows"

### Table `user`

<a id="table-user"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`cognito_sub`, `email`, `hardware_key_required`, `id`, `mfa_enrolled`, `status`)
- Column grant: `tp_app` UPDATE (`email`, `hardware_key_required`, `settings`, `status`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `cognito_sub` | `text` | NOT NULL |  |  |  |
| 3 | `email` | `text` | NOT NULL |  |  |  |
| 4 | `mfa_enrolled` | `boolean` | NOT NULL | `false` |  |  |
| 5 | `hardware_key_required` | `boolean` | NOT NULL | `false` |  |  |
| 6 | `status` | `text` | NOT NULL | `'invited'::text` |  | one of invited, active, disabled |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 9 | `failed_sign_ins` | `integer` | NOT NULL | `0` |  |  |
| 10 | `locked_at` | `timestamp with time zone` | null |  |  |  |
| 11 | `settings` | `jsonb` | NOT NULL | `'{}'::jsonb` |  |  |

Unique constraints:
- `user_cognito_sub_key`: `UNIQUE (cognito_sub)`

Check constraints:
- `user_cognito_sub_check`: `CHECK (cognito_sub ~ '^[A-Za-z0-9-]{1,128}$'::text)`
- `user_email_check`: `CHECK (email ~ '^[^@ ]+@[^@ ]+$'::text)`
- `user_failed_sign_ins_check`: `CHECK (failed_sign_ins >= 0)`
- `user_settings_valid`: `CHECK (user_settings_valid(settings))`
- `user_status_check`: `CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'disabled'::text]))`

Indexes:
- `user_cognito_sub_key` (constraint): `UNIQUE USING btree (cognito_sub)`
- `user_email_unique`: `UNIQUE USING btree (lower(email))`
- `user_pkey` (primary): `UNIQUE USING btree (id)`

Policies (4):
- `user_invited_by_administrators`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `((( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin) OR (cardinality(( SELECT app_actor_administered_organization_ids() AS app_actor_administered_organization_ids)) > 0)) AND (status = 'invited'::text) AND (NOT mfa_enrolled))`
- `user_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `user_self_and_administrators`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((id = app_actor_id()) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin) OR (id = ANY (( SELECT app_actor_administered_user_ids() AS app_actor_administered_user_ids)::uuid[])))`
- `user_self_and_platform_admin_update`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `((id = app_actor_id()) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`
  - WITH CHECK `((id = app_actor_id()) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))`

Triggers:
- `user_accepts_invitations`: `AFTER UPDATE OF status ON "user" FOR EACH ROW EXECUTE FUNCTION user_accepts_invitations()`
- `user_guarded_columns`: `BEFORE UPDATE OF status, hardware_key_required ON "user" FOR EACH ROW EXECUTE FUNCTION user_guarded_columns()` raises: "only a platform administrator changes a user's status or hardware-key rule"
- `user_keeps_practice_administrator`: `AFTER UPDATE OF status ON "user" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION user_keeps_practice_administrator()`
- `user_updated_at`: `BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `user_device`

<a id="table-user-device"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`id`, `label`, `token_sha256`, `user_id`)
- Column grant: `tp_app` UPDATE (`label`, `last_seen_at`, `revoked_at`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 3 | `token_sha256` | `text` | NOT NULL |  |  |  |
| 4 | `label` | `text` | NOT NULL |  |  |  |
| 5 | `first_seen_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 6 | `last_seen_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `revoked_at` | `timestamp with time zone` | null |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `user_device_once`: `UNIQUE (user_id, token_sha256)`

Foreign keys:
- `user_device_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `user_device_label_check`: `CHECK (label ~ '^[A-Za-z0-9 .()/-]{1,64}$'::text)`
- `user_device_token_sha256_check`: `CHECK (token_sha256 ~ '^[0-9a-f]{64}$'::text)`

Indexes:
- `user_device_once` (constraint): `UNIQUE USING btree (user_id, token_sha256)`
- `user_device_pkey` (primary): `UNIQUE USING btree (id)`

Policies (2):
- `user_device_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `user_device_self`: PERMISSIVE FOR ALL TO tp_app
  - USING `(user_id = app_actor_id())`
  - WITH CHECK `(user_id = app_actor_id())`

Triggers:
- `user_device_revocation_is_final`: `BEFORE UPDATE OF revoked_at ON user_device FOR EACH ROW EXECUTE FUNCTION user_device_revocation_is_final()` raises: "a revoked device stays revoked; sign in again as a new device"
- `user_device_security_events`: `AFTER INSERT ON user_device FOR EACH ROW EXECUTE FUNCTION user_device_security_events()`
- `user_device_updated_at`: `BEFORE UPDATE ON user_device FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

### Table `user_session`

<a id="table-user-session"></a>

- Class: RLS, no practice_id (organization- or user-scoped); owner `tp_owner`; RLS ENABLED and FORCED
- Primary key: `id`
- `tp_app`: SELECT, INSERT(cols), UPDATE(cols)
- `tp_operator`: no privilege
- `tp_billing`: no privilege
- Column grant: `tp_app` INSERT (`device_id`, `id`, `mfa_method`, `token_sha256`, `user_id`)
- Column grant: `tp_app` UPDATE (`end_reason`, `ended_at`)

| # | Column | Type | Null | Default | References | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` |  |
| 3 | `device_id` | `uuid` | NOT NULL |  | `user_device(id)` |  |
| 4 | `token_sha256` | `text` | NOT NULL |  |  |  |
| 5 | `mfa_method` | `text` | NOT NULL |  |  | one of totp, webauthn |
| 6 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 7 | `last_seen_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 8 | `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '12:00:00'::interval)` |  |  |
| 9 | `ended_at` | `timestamp with time zone` | null |  |  |  |
| 10 | `end_reason` | `text` | null |  |  | one of signed_out, idle, expired, device_revoked, revoked, user_disabled |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  |  |

Unique constraints:
- `user_session_token_sha256_key`: `UNIQUE (token_sha256)`

Foreign keys:
- `user_session_device_id_fkey`: (device_id) -> `user_device`(id) on delete no action
- `user_session_user_id_fkey`: (user_id) -> `user`(id) on delete no action

Check constraints:
- `user_session_end`: `CHECK ((ended_at IS NULL) = (end_reason IS NULL))`
- `user_session_end_reason_check`: `CHECK (end_reason = ANY (ARRAY['signed_out'::text, 'idle'::text, 'expired'::text, 'device_revoked'::text, 'revoked'::text, 'user_disabled'::text]))`
- `user_session_mfa_method_check`: `CHECK (mfa_method = ANY (ARRAY['totp'::text, 'webauthn'::text]))`
- `user_session_token_sha256_check`: `CHECK (token_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `user_session_twelve_hours`: `CHECK (expires_at > started_at AND expires_at <= (started_at + '12:00:00'::interval))`

Indexes:
- `user_session_by_device`: `USING btree (device_id)`
- `user_session_by_user`: `USING btree (user_id)`
- `user_session_pkey` (primary): `UNIQUE USING btree (id)`
- `user_session_token_sha256_key` (constraint): `UNIQUE USING btree (token_sha256)`

Policies (2):
- `user_session_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `user_session_self`: PERMISSIVE FOR ALL TO tp_app
  - USING `(user_id = app_actor_id())`
  - WITH CHECK `(user_id = app_actor_id())`

Triggers:
- `user_session_end_is_final`: `BEFORE UPDATE OF ended_at, end_reason ON user_session FOR EACH ROW EXECUTE FUNCTION user_session_end_is_final()` raises: "an ended session stays ended; sign in again"
- `user_session_updated_at`: `BEFORE UPDATE ON user_session FOR EACH ROW EXECUTE FUNCTION set_updated_at()`

## Views

### View `billing_standing`

- Owner `tp_owner`; options `security_invoker=true`
- `tp_app`: SELECT
- `tp_operator`: no privilege
- `tp_billing`: SELECT

| # | Column | Type |
| --- | --- | --- |
| 1 | `organization_id` | `uuid` |
| 2 | `standing` | `text` |
| 3 | `past_due_since` | `timestamp with time zone` |
| 4 | `suspended_since` | `timestamp with time zone` |
| 5 | `invoice_id` | `uuid` |

```sql
SELECT o.id AS organization_id,
        CASE
            WHEN f.first_failed_at IS NULL THEN 'good'::text
            WHEN f.first_failed_at <= (now() - '30 days'::interval) THEN 'suspended'::text
            ELSE 'past_due'::text
        END AS standing,
    f.first_failed_at AS past_due_since,
        CASE
            WHEN f.first_failed_at <= (now() - '30 days'::interval) THEN f.first_failed_at + '30 days'::interval
            ELSE NULL::timestamp with time zone
        END AS suspended_since,
    f.id AS invoice_id
   FROM organization o
     LEFT JOIN LATERAL ( SELECT i.id,
            i.first_failed_at
           FROM invoice i
          WHERE i.organization_id = o.id AND (i.status = ANY (ARRAY['open'::text, 'uncollectible'::text])) AND i.first_failed_at IS NOT NULL
          ORDER BY i.first_failed_at, i.id
         LIMIT 1) f ON true;
```

## Cross-checks

```text
Drizzle tables: 77; migrated tables (excluding schema_migrations): 77
In the database, not in Drizzle: none
In Drizzle, not in the database: none
Column differences (name, type, nullability): 0
catalogProblems() (packages/db/src/catalog.ts) on this database: 0 problem(s)
```

