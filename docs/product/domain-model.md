# Domain model

> Generated from the live schema by `pnpm db:domain-model` (`packages/db/src/domain-model`, CO-02). It reads the PostgreSQL catalog of a database migrated with `pnpm db:migrate`, the migration files, the Data dictionary tab (`docs/product/data-dictionary.md`), the area map and the reviewed explanations of each divergence. Do not edit it by hand: regenerate it. A person fills in only the name and the date on the "Approved by" line at the end, and leaves its document hash as it is.

- Generated at commit `a57ac32972aa01dafa071b163725345dc056ae0d` on branch `co-001/pr-06-free-screening` (provenance only: `--check` ignores this line, so a commit that changes no schema keeps the document valid)
- Migrations applied: 41; head `20261104090000_free_screening.sql`
- PostgreSQL 18; schema `public`: 84 tables (including `schema_migrations`), 1 view(s); PostgreSQL enum types: 0 (every enumeration is a CHECK constraint)
- PHI flag: 44 tables in `phi_table_registry`; 4 tenant tables with a nullable `practice_id` outside it; 28 organization- or user-scoped tables with RLS forced; 8 global tables
- RLS: 76 tables ENABLE and FORCE row-level security; 0 enable without forcing; 8 have none (the global tables); 161 policies
- Functions in `public`: 269 (128 SECURITY DEFINER); triggers: 226, none disabled or replica-only; rewrite rules on tables: none
- Default privileges (ALTER DEFAULT PRIVILEGES): none
- Roles (group roles; login roles are per environment and not listed): `tp_app`, `tp_billing`, `tp_esign`, `tp_operator`, `tp_owner`; every relation is owned by `tp_owner`
- Divergences from the Data dictionary: 23 to approve, 36 tables and 135 columns not in it (informational); see [Divergences from the Data dictionary](#divergences-from-the-data-dictionary)

## Contents

1. [How to read this document](#how-to-read-this-document)
2. [Areas](#areas)
3. [PHI flag and row-level security by table](#phi-flag-and-row-level-security-by-table)
4. [Tenancy and access](#area-tenancy)
5. [Documents and remittances](#area-documents)
6. [Payers, contracts and rates](#area-contracts)
7. [Global content](#area-content)
8. [Pricing, triage and cases](#area-pricing)
9. [Packets](#area-packets)
10. [Ledger](#area-ledger)
11. [Model gateway](#area-models)
12. [Billing and onboarding](#area-billing)
13. [Operations](#area-operations)
14. [Divergences from the Data dictionary](#divergences-from-the-data-dictionary)
15. [Appendix A: enumerations](#appendix-a-enumerations)
16. [Appendix B: encrypted columns](#appendix-b-encrypted-columns)
17. [Appendix C: functions](#appendix-c-functions)
18. [Appendix D: migrations](#appendix-d-migrations)
19. [Cross-checks](#cross-checks)
20. [Approval](#approval)

## How to read this document

- **Class** (the PHI flag): `PHI (registered)` means `practice_id uuid NOT NULL`, a row in `phi_table_registry`, ENABLE and FORCE ROW LEVEL SECURITY, and the registered tenant policy, PERMISSIVE FOR ALL with USING and WITH CHECK exactly `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])` (`id` for `practice`). `tenant (nullable practice_id), not registered` is a table the catalog test allows with a nullable `practice_id` (`NULLABLE_PRACTICE_ID_TABLES` in `packages/db/src/catalog.ts`). `organization- or user-scoped` has no `practice_id` and forces RLS on another key. `global` has no `practice_id` and no RLS; the application role may only read it.
- **Roles**: `tp_owner` owns every relation and runs migrations; `tp_app` is the application role (owns nothing, cannot bypass RLS); the other group roles appear where they hold a privilege. Privileges are listed as SELECT, INSERT, UPDATE, DELETE; `(cols)` means a column-level grant, listed under the table.
- **Since**: the migration that created the table or added the column, read from the migration files. The ADRs a migration cites in its header are shown beside it.
- **Invariants** are what the database enforces: CHECK, UNIQUE, foreign key and exclusion constraints, and triggers, each trigger with the exceptions its function raises (the invariant in its own words). A trigger that is disabled, or fires only under `session_replication_role` replica, is listed apart as not enforced. Policies are the row-level security policies; rewrite rules, when a table has any, are listed after them.
- **Dictionary**: the section and purpose the Data dictionary tab gives the table, or "not in the Data dictionary".

## Areas

| # | Area | Data dictionary section | Tables | PHI (registered) | About |
| --- | --- | --- | --- | --- | --- |
| 4 | [Tenancy and access](#area-tenancy) | Tenancy and access | 12 | 3 | Organizations, practices (the tenant), people, memberships and their roles, grants of practice access to other organizations, agreements, break-glass support grants, sign-in devices and sessions, the persona matrix and the PHI table registry itself. |
| 5 | [Documents and remittances](#area-documents) | Documents and remittances (PHI) | 9 | 9 | Every uploaded file, and the 835 remittance loaded from it: transaction sets, claims, service lines, CAS and PLB adjustments, the minimal patient identity, the parse report, and notes a person writes on a line. |
| 6 | [Payers, contracts and rates](#area-contracts) | Payers, contracts and rates (PHI-adjacent; confidential) | 8 | 8 | Payers and plans as the remittances name them, the mapping of a plan to an agreement, contracts and their versions, rate records (each pricing term with its page, quote and hash), the contract calendar, and the questions a specialist raises on a version. |
| 7 | [Global content](#area-content) | Global content (no practice_id; read-only to the application role) | 3 | 0 | Numbered rule releases and their records (fee schedule, adjustments, code lists, dispute windows), and the withdrawal of a release. No practice_id; the application role reads only. |
| 8 | [Pricing, triage and cases](#area-pricing) | Pricing, triage and cases (PHI) | 10 | 10 | Pricing runs and their immutable priced lines, anomaly cohorts, the stage of each line, cases and their lines and activity, the audit report and its downloads, and the coverage report and monthly summary. |
| 9 | [Packets](#area-packets) | Pricing, triage and cases (PHI) | 4 | 4 | The dispute packet, its immutable verified versions (approval and export recorded on the version), the submissions a customer logs and the payer responses captured against them. |
| 10 | [Ledger](#area-ledger) | Ledger and reconciliation (PHI) | 5 | 5 | The signed, append-only recovery ledger, the matches that pair its evidence, the posting-export and EFT-export rows it matches against, and the ROI statement. |
| 11 | [Model gateway](#area-models) | Model gateway (PHI references only) | 4 | 2 | Each model call (references and hashes only), evaluation examples, the proposals a person decides, and budget holds taken before a call. |
| 12 | [Billing and onboarding](#area-billing) | Operations (no PHI by design) | 15 | 0 | Stripe subscriptions, invoices and webhook events, the one-subscription claim, nightly usage counts and the billing standing view; the public audit request, user invitations, and terms of use with their acceptances; and the free screening's prospects, uploads, platform place-of-service split, runs and aggregate results (no PHI, no practice). |
| 13 | [Operations](#area-operations) | Operations (no PHI by design) | 15 | 3 | The append-only audit log, job runs, in-app notifications and digests (counts and totals only), feature flags, mutation request keys, rate-limit counters, restore drills, the public status page, support tickets and the receipts of the support inbox, SOC 2 evidence records, and the migration ledger. |

## PHI flag and row-level security by table

| Table | Area | Class | practice_id | RLS | FORCE | Policies | Triggers | tp_app | tp_billing | tp_operator |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`adjustment`](#table-adjustment) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`agreement`](#table-agreement) | Tenancy and access | tenant (nullable practice_id), not registered | uuid NULL | yes | yes | 4 | 1 | SELECT, INSERT(cols) | - | - |
| [`agreement_event`](#table-agreement-event) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 1 | - | - | - |
| [`anomaly`](#table-anomaly) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 5 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`audit_event`](#table-audit-event) | Operations | tenant (nullable practice_id), not registered | uuid NULL | yes | yes | 5 | 2 | SELECT, INSERT(cols) | - | SELECT |
| [`audit_report`](#table-audit-report) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 3 | 6 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`audit_report_download`](#table-audit-report-download) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 4 | SELECT, INSERT(cols) | - | - |
| [`billing_event`](#table-billing-event) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 2 | - | SELECT, INSERT, UPDATE | - |
| [`billing_standing`](#table-billing-standing) | Billing and onboarding | view | - | no | no | 0 | 0 | SELECT | SELECT | - |
| [`case`](#table-case) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 5 | SELECT, INSERT(cols) | - | - |
| [`case_activity`](#table-case-activity) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 4 | SELECT, INSERT(cols) | - | - |
| [`case_line`](#table-case-line) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 7 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`claim`](#table-claim) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`compliance_record`](#table-compliance-record) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`contract`](#table-contract) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`contract_calendar_event`](#table-contract-calendar-event) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | - | - |
| [`contract_question`](#table-contract-question) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`contract_version`](#table-contract-version) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`digest`](#table-digest) | Operations | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`eft_row`](#table-eft-row) | Ledger | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols) | - | - |
| [`eval_example`](#table-eval-example) | Model gateway | tenant (nullable practice_id), not registered | uuid NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | - | SELECT, INSERT(cols) |
| [`feature_flag`](#table-feature-flag) | Operations | global (no practice_id, no RLS) | - | no | no | 0 | 1 | SELECT | - | SELECT |
| [`grant`](#table-grant) | Tenancy and access | PHI (registered) | uuid NOT NULL | yes | yes | 5 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`invitation`](#table-invitation) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 2 | 2 | SELECT | - | - |
| [`invoice`](#table-invoice) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 3 | SELECT | SELECT, INSERT, UPDATE | - |
| [`job_run`](#table-job-run) | Operations | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 1 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`ledger_entry`](#table-ledger-entry) | Ledger | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 4 | SELECT, INSERT(cols) | - | - |
| [`ledger_match`](#table-ledger-match) | Ledger | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`line_note`](#table-line-note) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | - | - |
| [`line_status`](#table-line-status) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 6 | SELECT, INSERT(cols) | - | - |
| [`membership`](#table-membership) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 4 | 6 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`model_budget_hold`](#table-model-budget-hold) | Model gateway | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 0 | SELECT, INSERT(cols), DELETE | - | - |
| [`model_call`](#table-model-call) | Model gateway | tenant (nullable practice_id), not registered | uuid NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | SELECT, INSERT(cols) |
| [`model_proposal`](#table-model-proposal) | Model gateway | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`mutation_request`](#table-mutation-request) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 2 | 0 | SELECT, INSERT(cols) | - | - |
| [`notification`](#table-notification) | Operations | PHI (registered) | uuid NOT NULL | yes | yes | 4 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`organization`](#table-organization) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 6 | 2 | SELECT, INSERT(cols), UPDATE(cols) | SELECT(cols), UPDATE(cols) | - |
| [`packet`](#table-packet) | Packets | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 5 | SELECT, INSERT(cols) | - | - |
| [`packet_version`](#table-packet-version) | Packets | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 8 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`parse_report`](#table-parse-report) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`patient_ref`](#table-patient-ref) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 1 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`payer`](#table-payer) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 1 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`payer_plan_mapping`](#table-payer-plan-mapping) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 2 | SELECT, INSERT(cols) | - | - |
| [`payer_response`](#table-payer-response) | Packets | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 6 | SELECT, INSERT(cols) | - | - |
| [`phi_table_registry`](#table-phi-table-registry) | Tenancy and access | global (no practice_id, no RLS) | - | no | no | 0 | 1 | SELECT | - | - |
| [`plan`](#table-plan) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`posting_row`](#table-posting-row) | Ledger | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols) | - | - |
| [`practice`](#table-practice) | Tenancy and access | PHI (registered) | id (the tenant key) | yes | yes | 4 | 6 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`priced_line`](#table-priced-line) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols) | - | - |
| [`pricing_run`](#table-pricing-run) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 4 | 4 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`prospect_request`](#table-prospect-request) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT, UPDATE(cols) | - | - |
| [`provider_adjustment`](#table-provider-adjustment) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`rate_limit_counter`](#table-rate-limit-counter) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 0 | - | - | - |
| [`rate_record`](#table-rate-record) | Payers, contracts and rates | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols), UPDATE(cols), DELETE | - | - |
| [`remittance`](#table-remittance) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`report_document`](#table-report-document) | Pricing, triage and cases | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 5 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`restore_drill`](#table-restore-drill) | Operations | global (no practice_id, no RLS) | - | no | no | 0 | 2 | - | - | SELECT, INSERT |
| [`roi_statement`](#table-roi-statement) | Ledger | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`role_permission`](#table-role-permission) | Tenancy and access | global (no practice_id, no RLS) | - | no | no | 0 | 1 | SELECT | - | - |
| [`rule_record`](#table-rule-record) | Global content | global (no practice_id, no RLS) | - | no | no | 0 | 2 | SELECT | - | - |
| [`rule_release`](#table-rule-release) | Global content | global (no practice_id, no RLS) | - | no | no | 0 | 2 | SELECT | - | - |
| [`rule_release_withdrawal`](#table-rule-release-withdrawal) | Global content | global (no practice_id, no RLS) | - | no | no | 0 | 2 | SELECT | - | - |
| [`schema_migrations`](#table-schema-migrations) | Operations | global (no practice_id, no RLS) | - | no | no | 0 | 0 | - | - | - |
| [`screening_place_of_service_split`](#table-screening-place-of-service-split) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 2 | - | - | - |
| [`screening_prospect`](#table-screening-prospect) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 3 | - | - | - |
| [`screening_result`](#table-screening-result) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 3 | - | - | - |
| [`screening_run`](#table-screening-run) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 3 | - | - | - |
| [`screening_upload`](#table-screening-upload) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 3 | - | - | - |
| [`service_line`](#table-service-line) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 1 | 2 | SELECT, INSERT(cols) | - | - |
| [`source_document`](#table-source-document) | Documents and remittances | PHI (registered) | uuid NOT NULL | yes | yes | 4 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`status_component`](#table-status-component) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT, UPDATE(cols) | - | - |
| [`status_incident`](#table-status-incident) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`status_incident_update`](#table-status-incident-update) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`submission`](#table-submission) | Packets | PHI (registered) | uuid NOT NULL | yes | yes | 2 | 5 | SELECT, INSERT(cols) | - | - |
| [`subscription`](#table-subscription) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 3 | SELECT | SELECT, INSERT, UPDATE | - |
| [`subscription_claim`](#table-subscription-claim) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 2 | 3 | - | SELECT, INSERT, UPDATE | - |
| [`support_grant`](#table-support-grant) | Tenancy and access | PHI (registered) | uuid NOT NULL | yes | yes | 7 | 4 | SELECT, INSERT(cols) | - | - |
| [`support_mail_receipt`](#table-support-mail-receipt) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 1 | 1 | - | - | - |
| [`support_ticket`](#table-support-ticket) | Operations | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 4 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`terms_acceptance`](#table-terms-acceptance) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`terms_version`](#table-terms-version) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT, INSERT(cols) | - | - |
| [`usage_snapshot`](#table-usage-snapshot) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 3 | 2 | SELECT | SELECT, INSERT | - |
| [`user`](#table-user) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 4 | 4 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`user_device`](#table-user-device) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 2 | 3 | SELECT, INSERT(cols), UPDATE(cols) | - | - |
| [`user_session`](#table-user-session) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | - | yes | yes | 2 | 2 | SELECT, INSERT(cols), UPDATE(cols) | - | - |

Registered tables whose registered policy does not qualify: none. Tenant tables with practice_id NOT NULL outside the registry: none. Tables with RLS enabled but not forced: none.

## 4. Tenancy and access

<a id="area-tenancy"></a>

Organizations, practices (the tenant), people, memberships and their roles, grants of practice access to other organizations, agreements, break-glass support grants, sign-in devices and sessions, the persona matrix and the PHI table registry itself.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`organization`](#table-organization) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 6 | SELECT, INSERT(cols), UPDATE(cols) | `20261015140000_tenancy` | Contracting account |
| [`practice`](#table-practice) | PHI (registered) | yes / yes | 4 | SELECT, INSERT(cols), UPDATE(cols) | `20261015140000_tenancy` | The tenant |
| [`user`](#table-user) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 4 | SELECT, INSERT(cols), UPDATE(cols) | `20261015140000_tenancy` | Identity reference |
| [`membership`](#table-membership) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 4 | SELECT, INSERT(cols), UPDATE(cols) | `20261015140000_tenancy` | Role in an organization |
| [`grant`](#table-grant) | PHI (registered) | yes / yes | 5 | SELECT, INSERT(cols), UPDATE(cols) | `20261015140000_tenancy` | Organization access to a practice |
| [`agreement`](#table-agreement) | tenant (nullable practice_id), not registered | yes / yes | 4 | SELECT, INSERT(cols) | `20261015140000_tenancy` | Signed documents |
| [`agreement_event`](#table-agreement-event) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`support_grant`](#table-support-grant) | PHI (registered) | yes / yes | 7 | SELECT, INSERT(cols) | `20261015140000_tenancy` | Break-glass access |
| [`role_permission`](#table-role-permission) | global (no practice_id, no RLS) | no / no | 0 | SELECT | `20261015170000_identity_and_permissions` | not in the Data dictionary |
| [`user_device`](#table-user-device) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 2 | SELECT, INSERT(cols), UPDATE(cols) | `20261015170000_identity_and_permissions` | not in the Data dictionary |
| [`user_session`](#table-user-session) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 2 | SELECT, INSERT(cols), UPDATE(cols) | `20261015170000_identity_and_permissions` | not in the Data dictionary |
| [`phi_table_registry`](#table-phi-table-registry) | global (no practice_id, no RLS) | no / no | 0 | SELECT | `20261015140000_tenancy` | Catalog of PHI tables |

### Table `organization`

<a id="table-organization"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 6 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): Contracting account; policy "Members only"
- Created by `20261015140000_tenancy` (ADR 0013); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`, `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols); `tp_billing` SELECT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`billing_customer_ref`, `id`, `kind`, `name`, `status`)
- Column grant: `tp_app` UPDATE (`billing_customer_ref`, `name`, `status`)
- Column grant: `tp_billing` SELECT (`billing_customer_ref`, `id`, `kind`, `name`, `status`)
- Column grant: `tp_billing` UPDATE (`billing_customer_ref`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `kind` | `text` | NOT NULL |  |  | `20261015140000` | one of group, firm, internal |
| 3 | `name` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 4 | `billing_customer_ref` | `text` | null |  |  | `20261015140000` |  |
| 5 | `status` | `text` | NOT NULL | `'active'::text` |  | `20261015140000` | one of active, suspended, closed |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |

Keys:
- Primary: (id)

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

Invariants enforced by constraints:
- `organization_billing_customer_ref_check`: `CHECK (billing_customer_ref ~ '^[A-Za-z0-9_]{1,255}$'::text)`
- `organization_kind_check`: `CHECK (kind = ANY (ARRAY['group'::text, 'firm'::text, 'internal'::text]))`
- `organization_name_check`: `CHECK (btrim(name) <> ''::text)`
- `organization_status_check`: `CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]))`

Invariants enforced by triggers:
- `organization_kind_fixed`: `BEFORE UPDATE OF kind ON organization FOR EACH ROW EXECUTE FUNCTION organization_kind_fixed()`
  - "organization kind is fixed at creation"

Maintains `updated_at`: `organization_updated_at`.

### Table `practice`

<a id="table-practice"></a>

- Class: PHI (registered); registry policy `practice_tenant`, registered by `20261015140000_tenancy`, qualifies: yes
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): The tenant; policy "By grant or ownership"
- Created by `20261015140000_tenancy` (ADR 0013); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`, `20261023120000_recovery_ledger`, `20261101090000_billing_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`data_key_ref`, `id`, `locality_code`, `name`, `npi`, `organization_id`, `settings`, `tax_id_last4`, `zip`)
- Column grant: `tp_app` UPDATE (`locality_code`, `name`, `npi`, `settings`, `tax_id_last4`, `zip`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `organization_id` | `uuid` | null |  | `organization(id)` | `20261015140000` |  |
| 3 | `name` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 4 | `tax_id_last4` | `text` | null |  |  | `20261015140000` |  |
| 5 | `npi` | `text` | null |  |  | `20261015140000` |  |
| 6 | `locality_code` | `text` | null |  |  | `20261015140000` |  |
| 7 | `zip` | `text` | null |  |  | `20261015140000` |  |
| 8 | `settings` | `jsonb` | NOT NULL | `'{}'::jsonb` |  | `20261015140000` |  |
| 9 | `data_key_ref` | `text` | null |  |  | `20261015140000` |  |
| 10 | `status` | `text` | NOT NULL | `'active'::text` |  | `20261015140000` | one of active, deleted |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 13 | `deleted_at` | `timestamp with time zone` | null |  |  | `20261101090000` | not in the dictionary |

Keys:
- Primary: (id)
- Foreign `practice_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action

Indexes:
- `practice_by_organization`: `USING btree (organization_id)`

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

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `practice_deleted_at`: `BEFORE UPDATE ON practice FOR EACH ROW EXECUTE FUNCTION practice_deleted_at()`
  - "a practice's deletion time is the database's, set once"
- `practice_has_administrator`: `AFTER INSERT OR UPDATE OF organization_id, status ON practice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_has_administrator()`
  - "invite the practice group's administrator before creating or moving its practice: a practice always has an administrator"
- `practice_has_owner`: `BEFORE INSERT OR UPDATE OF organization_id, status ON practice FOR EACH ROW EXECUTE FUNCTION practice_has_owner()`
  - "a practice is owned by a practice group until it is deleted"
- `practice_keeps_administrator`: `AFTER UPDATE OF organization_id ON practice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_keeps_administrator()`
  - "a practice must always keep at least one practice administrator"
- `practice_owned_by_group`: `BEFORE INSERT OR UPDATE OF organization_id ON practice FOR EACH ROW EXECUTE FUNCTION practice_owned_by_group()`
  - "a practice is owned by a practice group"

Maintains `updated_at`: `practice_updated_at`.

### Table `user`

<a id="table-user"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): Identity reference; policy "Self and administrators"
- Created by `20261015140000_tenancy` (ADR 0013); its DDL, policies or trigger functions changed by `20261015170000_identity_and_permissions`, `20261020090000_monitoring_digests_notifications`, `20261030090000_customer_sign_in_and_readiness`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`cognito_sub`, `email`, `hardware_key_required`, `id`, `mfa_enrolled`, `status`)
- Column grant: `tp_app` UPDATE (`email`, `hardware_key_required`, `settings`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `cognito_sub` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 3 | `email` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 4 | `mfa_enrolled` | `boolean` | NOT NULL | `false` |  | `20261015140000` |  |
| 5 | `hardware_key_required` | `boolean` | NOT NULL | `false` |  | `20261015140000` |  |
| 6 | `status` | `text` | NOT NULL | `'invited'::text` |  | `20261015140000` | one of invited, active, disabled |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 9 | `failed_sign_ins` | `integer` | NOT NULL | `0` |  | `20261015170000` | not in the dictionary |
| 10 | `locked_at` | `timestamp with time zone` | null |  |  | `20261015170000` | not in the dictionary |
| 11 | `settings` | `jsonb` | NOT NULL | `'{}'::jsonb` |  | `20261020090000` | not in the dictionary |

Keys:
- Primary: (id)
- Unique `user_cognito_sub_key`: `UNIQUE (cognito_sub)`
- Unique index `user_email_unique`: `USING btree (lower(email))`

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

Invariants enforced by constraints:
- `user_cognito_sub_check`: `CHECK (cognito_sub ~ '^[A-Za-z0-9-]{1,128}$'::text)`
- `user_email_check`: `CHECK (email ~ '^[^@ ]+@[^@ ]+$'::text)`
- `user_failed_sign_ins_check`: `CHECK (failed_sign_ins >= 0)`
- `user_settings_valid`: `CHECK (user_settings_valid(settings))`
- `user_status_check`: `CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'disabled'::text]))`

Invariants enforced by triggers:
- `user_accepts_invitations`: `AFTER UPDATE OF status ON "user" FOR EACH ROW EXECUTE FUNCTION user_accepts_invitations()`
- `user_guarded_columns`: `BEFORE UPDATE OF status, hardware_key_required ON "user" FOR EACH ROW EXECUTE FUNCTION user_guarded_columns()`
  - "only a platform administrator changes a user's status or hardware-key rule"
- `user_keeps_practice_administrator`: `AFTER UPDATE OF status ON "user" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION user_keeps_practice_administrator()`

Maintains `updated_at`: `user_updated_at`.

### Table `membership`

<a id="table-membership"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): Role in an organization; policy "Organization administrators"
- Created by `20261015140000_tenancy` (ADR 0013); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`, `20261030090000_customer_sign_in_and_readiness`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`ends_at`, `id`, `organization_id`, `role`, `user_id`)
- Column grant: `tp_app` UPDATE (`ends_at`, `role`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261015140000` |  |
| 3 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261015140000` |  |
| 4 | `role` | `text` | NOT NULL |  |  | `20261015140000` | one of practice_admin, billing_manager, analyst, viewer, firm_principal, firm_analyst, platform_admin, contract_specialist, reviewer, support |
| 5 | `ends_at` | `timestamp with time zone` | null |  |  | `20261015140000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |

Keys:
- Primary: (id)
- Unique index `membership_open`: `USING btree (organization_id, user_id) WHERE (ends_at IS NULL)`
- Foreign `membership_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action
- Foreign `membership_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Indexes:
- `membership_by_user`: `USING btree (user_id)`

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

Invariants enforced by constraints:
- `membership_role_check`: `CHECK (role = ANY (ARRAY['practice_admin'::text, 'billing_manager'::text, 'analyst'::text, 'viewer'::text, 'firm_principal'::text, 'firm_analyst'::text, 'platform_admin'::text, 'contract_specialist'::text, 'reviewer'::text, 'support'::text]))`

Invariants enforced by triggers:
- `membership_invitation`: `AFTER INSERT ON membership FOR EACH ROW EXECUTE FUNCTION membership_invitation()`
- `membership_keeps_practice_administrator`: `AFTER DELETE OR UPDATE ON membership DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION membership_keeps_practice_administrator()`
- `membership_role_fits_organization`: `BEFORE INSERT OR UPDATE OF organization_id, role ON membership FOR EACH ROW EXECUTE FUNCTION membership_role_fits_organization()`
  - "role % does not belong in a % organization"
- `membership_rules`: `BEFORE INSERT OR UPDATE ON membership FOR EACH ROW EXECUTE FUNCTION membership_rules()`
  - "an ended membership never changes; invite the user again"
  - "nobody grants themselves a membership or changes their own role"
- `membership_security_events`: `AFTER INSERT OR UPDATE OF role ON membership FOR EACH ROW EXECUTE FUNCTION membership_security_events()`

Maintains `updated_at`: `membership_updated_at`.

### Table `grant`

<a id="table-grant"></a>

- Class: PHI (registered); registry policy `grant_tenant`, registered by `20261015140000_tenancy`, qualifies: yes
- Row-level security: enabled, forced; 5 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): Organization access to a practice; policy "Practice administrators; firm sees its own"
- Created by `20261015140000_tenancy` (ADR 0013); its DDL, policies or trigger functions changed by `20261015170000_identity_and_permissions`, `20261015180000_tenancy_hardening`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`agreement_id`, `approved_by_user_id`, `ends_at`, `id`, `organization_id`, `practice_id`, `reason`, `scope`, `starts_at`)
- Column grant: `tp_app` UPDATE (`reason`, `revoked_at`, `revoked_by`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261015140000` |  |
| 3 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261015140000` |  |
| 4 | `scope` | `jsonb` | NOT NULL |  |  | `20261015140000` |  |
| 5 | `starts_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 6 | `ends_at` | `timestamp with time zone` | NOT NULL |  |  | `20261015140000` |  |
| 7 | `approved_by_user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261015140000` |  |
| 8 | `agreement_id` | `uuid` | NOT NULL |  | `agreement(id)` | `20261015140000` |  |
| 9 | `revoked_at` | `timestamp with time zone` | null |  |  | `20261015140000` |  |
| 10 | `revoked_by` | `uuid` | null |  | `user(id)` | `20261015140000` |  |
| 11 | `reason` | `text` | null |  |  | `20261015140000` |  |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |

Keys:
- Primary: (id)
- Foreign `grant_agreement_id_fkey`: (agreement_id) -> `agreement`(id), on delete no action
- Foreign `grant_approved_by_user_id_fkey`: (approved_by_user_id) -> `user`(id), on delete no action
- Foreign `grant_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action
- Foreign `grant_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `grant_revoked_by_fkey`: (revoked_by) -> `user`(id), on delete no action

Indexes:
- `grant_by_organization`: `USING btree (organization_id)`
- `grant_by_practice`: `USING btree (practice_id)`

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

Invariants enforced by constraints:
- `grant_revocation`: `CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))`
- `grant_scope`: `CHECK (jsonb_typeof(scope) = 'object'::text AND COALESCE(jsonb_typeof(scope -> 'roles'::text), 'array'::text) = 'array'::text AND COALESCE(scope -> 'roles'::text, '[]'::jsonb) <@ '["firm_principal", "firm_analyst", "billing_manager", "analyst", "viewer"]'::jsonb)`
- `grant_window`: `CHECK (ends_at > starts_at)`

Invariants enforced by triggers:
- `grant_rules`: `BEFORE INSERT OR UPDATE ON "grant" FOR EACH ROW EXECUTE FUNCTION grant_rules()`
  - "a grant goes to a practice group or a firm; internal access is a support grant"
  - "a grant is approved by a current practice administrator of its practice"
  - "a grant rests on a BAA or engagement letter of the grantee, or of the practice's group naming the practice"
  - "a grant is revoked by a current practice administrator of its practice"
  - "a grant never changes after approval; revoke it and approve a new one"
  - "a grant is revoked once"
- `grant_security_events`: `AFTER INSERT OR UPDATE OF revoked_at ON "grant" FOR EACH ROW EXECUTE FUNCTION grant_security_events()`

Maintains `updated_at`: `grant_updated_at`.

### Table `agreement`

<a id="table-agreement"></a>

- Class: tenant (nullable practice_id), not registered
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): Signed documents; policy "Parties to it"
- Created by `20261015140000_tenancy` (ADR 0013); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`document_ref`, `id`, `kind`, `organization_id`, `practice_id`, `sha256`, `signed_at`, `signer`, `version`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261015140000` |  |
| 3 | `practice_id` | `uuid` | null |  | `practice(id)` | `20261015140000` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | `20261015140000` | one of baa, engagement, terms, data_rights, dpa |
| 5 | `version` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 6 | `signed_at` | `timestamp with time zone` | NOT NULL |  |  | `20261015140000` |  |
| 7 | `signer` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 8 | `document_ref` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 9 | `sha256` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |

Keys:
- Primary: (id)
- Foreign `agreement_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action
- Foreign `agreement_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `agreement_by_organization`: `USING btree (organization_id)`
- `agreement_by_practice`: `USING btree (practice_id)`

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

Invariants enforced by constraints:
- `agreement_document_ref_check`: `CHECK (btrim(document_ref) <> ''::text)`
- `agreement_kind_check`: `CHECK (kind = ANY (ARRAY['baa'::text, 'engagement'::text, 'terms'::text, 'data_rights'::text, 'dpa'::text]))`
- `agreement_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `agreement_signer_check`: `CHECK (btrim(signer) <> ''::text)`
- `agreement_version_check`: `CHECK (btrim(version) <> ''::text)`

Maintains `updated_at`: `agreement_updated_at`.

### Table `agreement_event`

<a id="table-agreement-event"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `provider_event_id` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 3 | `envelope_ref` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 4 | `agreement_id` | `uuid` | NOT NULL |  | `agreement(id)` | `20261030090000` |  |
| 5 | `received_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Unique `agreement_event_provider_event_id_key`: `UNIQUE (provider_event_id)`
- Foreign `agreement_event_agreement_id_fkey`: (agreement_id) -> `agreement`(id), on delete no action

Policies (1):
- `agreement_event_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `agreement_event_envelope_ref_check`: `CHECK (envelope_ref ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`
- `agreement_event_provider_event_id_check`: `CHECK (provider_event_id ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`

Invariants enforced by triggers:
- `agreement_event_append_only`: `BEFORE DELETE OR UPDATE ON agreement_event FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `support_grant`

<a id="table-support-grant"></a>

- Class: PHI (registered); registry policy `support_grant_tenant`, registered by `20261015140000_tenancy`, qualifies: yes
- Row-level security: enabled, forced; 7 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): Break-glass access; policy "Platform administrators; practice sees its own"
- Created by `20261015140000_tenancy` (ADR 0013); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`, `20261016160000_contracts_and_mapping`, `20261019160000_triage_cases_and_audit_reports`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`expires_at`, `id`, `practice_id`, `reason`, `ticket`, `user_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261015140000` |  |
| 3 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261015140000` |  |
| 4 | `ticket` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 5 | `reason` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 6 | `expires_at` | `timestamp with time zone` | NOT NULL |  |  | `20261015140000` |  |
| 7 | `notified_at` | `timestamp with time zone` | null |  |  | `20261015140000` |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |

Keys:
- Primary: (id)
- Foreign `support_grant_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `support_grant_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Indexes:
- `support_grant_by_practice`: `USING btree (practice_id)`
- `support_grant_by_user`: `USING btree (user_id)`

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

Invariants enforced by constraints:
- `support_grant_four_hours`: `CHECK (expires_at > created_at AND expires_at <= (created_at + '04:00:00'::interval))`
- `support_grant_reason_check`: `CHECK (btrim(reason) <> ''::text)`
- `support_grant_ticket_check`: `CHECK (ticket ~ '^[A-Za-z0-9-]{1,64}$'::text)`

Invariants enforced by triggers:
- `support_grant_fixed`: `BEFORE UPDATE ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_fixed()`
  - "a support grant never changes; only its closing notice is recorded, once, and it can be ended early, once"
- `support_grant_grantee`: `BEFORE INSERT ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_grantee()`
  - "nobody grants themselves support access"
  - "a support grant goes to a support engineer, a contract specialist or a reimbursement reviewer with a current role"
- `support_grant_security_events`: `AFTER INSERT OR UPDATE OF expires_at ON support_grant FOR EACH ROW EXECUTE FUNCTION support_grant_security_events()`

Maintains `updated_at`: `support_grant_updated_at`.

### Table `role_permission`

<a id="table-role-permission"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261015170000_identity_and_permissions` (ADR 0012, ADR 0016, ADR 0017)
- Primary key: `id`
- Privileges: `tp_app` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015170000` |  |
| 2 | `role` | `text` | NOT NULL |  |  | `20261015170000` | one of practice_admin, billing_manager, analyst, viewer, firm_principal, firm_analyst, platform_admin, contract_specialist, reviewer, support |
| 3 | `action` | `text` | NOT NULL |  |  | `20261015170000` |  |
| 4 | `effect` | `text` | NOT NULL |  |  | `20261015170000` | one of allow, deny |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |

Keys:
- Primary: (id)
- Unique `role_permission_once`: `UNIQUE (role, action)`

Policies (0):
- none

Invariants enforced by constraints:
- `role_permission_action_check`: `CHECK (action ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'::text)`
- `role_permission_effect_check`: `CHECK (effect = ANY (ARRAY['allow'::text, 'deny'::text]))`
- `role_permission_role_check`: `CHECK (role = ANY (ARRAY['practice_admin'::text, 'billing_manager'::text, 'analyst'::text, 'viewer'::text, 'firm_principal'::text, 'firm_analyst'::text, 'platform_admin'::text, 'contract_specialist'::text, 'reviewer'::text, 'support'::text]))`

Maintains `updated_at`: `role_permission_updated_at`.

### Table `user_device`

<a id="table-user-device"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261015170000_identity_and_permissions` (ADR 0012, ADR 0016, ADR 0017); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`id`, `label`, `token_sha256`, `user_id`)
- Column grant: `tp_app` UPDATE (`label`, `last_seen_at`, `revoked_at`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015170000` |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261015170000` |  |
| 3 | `token_sha256` | `text` | NOT NULL |  |  | `20261015170000` |  |
| 4 | `label` | `text` | NOT NULL |  |  | `20261015170000` |  |
| 5 | `first_seen_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 6 | `last_seen_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 7 | `revoked_at` | `timestamp with time zone` | null |  |  | `20261015170000` |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |

Keys:
- Primary: (id)
- Unique `user_device_once`: `UNIQUE (user_id, token_sha256)`
- Foreign `user_device_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Policies (2):
- `user_device_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `user_device_self`: PERMISSIVE FOR ALL TO tp_app
  - USING `(user_id = app_actor_id())`
  - WITH CHECK `(user_id = app_actor_id())`

Invariants enforced by constraints:
- `user_device_label_check`: `CHECK (label ~ '^[A-Za-z0-9 .()/-]{1,64}$'::text)`
- `user_device_token_sha256_check`: `CHECK (token_sha256 ~ '^[0-9a-f]{64}$'::text)`

Invariants enforced by triggers:
- `user_device_revocation_is_final`: `BEFORE UPDATE OF revoked_at ON user_device FOR EACH ROW EXECUTE FUNCTION user_device_revocation_is_final()`
  - "a revoked device stays revoked; sign in again as a new device"
- `user_device_security_events`: `AFTER INSERT ON user_device FOR EACH ROW EXECUTE FUNCTION user_device_security_events()`

Maintains `updated_at`: `user_device_updated_at`.

### Table `user_session`

<a id="table-user-session"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261015170000_identity_and_permissions` (ADR 0012, ADR 0016, ADR 0017); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`device_id`, `id`, `mfa_method`, `token_sha256`, `user_id`)
- Column grant: `tp_app` UPDATE (`end_reason`, `ended_at`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015170000` |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261015170000` |  |
| 3 | `device_id` | `uuid` | NOT NULL |  | `user_device(id)` | `20261015170000` |  |
| 4 | `token_sha256` | `text` | NOT NULL |  |  | `20261015170000` |  |
| 5 | `mfa_method` | `text` | NOT NULL |  |  | `20261015170000` | one of totp, webauthn |
| 6 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 7 | `last_seen_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 8 | `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '12:00:00'::interval)` |  | `20261015170000` |  |
| 9 | `ended_at` | `timestamp with time zone` | null |  |  | `20261015170000` |  |
| 10 | `end_reason` | `text` | null |  |  | `20261015170000` | one of signed_out, idle, expired, device_revoked, revoked, user_disabled |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |

Keys:
- Primary: (id)
- Unique `user_session_token_sha256_key`: `UNIQUE (token_sha256)`
- Foreign `user_session_device_id_fkey`: (device_id) -> `user_device`(id), on delete no action
- Foreign `user_session_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Indexes:
- `user_session_by_device`: `USING btree (device_id)`
- `user_session_by_user`: `USING btree (user_id)`

Policies (2):
- `user_session_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `user_session_self`: PERMISSIVE FOR ALL TO tp_app
  - USING `(user_id = app_actor_id())`
  - WITH CHECK `(user_id = app_actor_id())`

Invariants enforced by constraints:
- `user_session_end`: `CHECK ((ended_at IS NULL) = (end_reason IS NULL))`
- `user_session_end_reason_check`: `CHECK (end_reason = ANY (ARRAY['signed_out'::text, 'idle'::text, 'expired'::text, 'device_revoked'::text, 'revoked'::text, 'user_disabled'::text]))`
- `user_session_mfa_method_check`: `CHECK (mfa_method = ANY (ARRAY['totp'::text, 'webauthn'::text]))`
- `user_session_token_sha256_check`: `CHECK (token_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `user_session_twelve_hours`: `CHECK (expires_at > started_at AND expires_at <= (started_at + '12:00:00'::interval))`

Invariants enforced by triggers:
- `user_session_end_is_final`: `BEFORE UPDATE OF ended_at, end_reason ON user_session FOR EACH ROW EXECUTE FUNCTION user_session_end_is_final()`
  - "an ended session stays ended; sign in again"

Maintains `updated_at`: `user_session_updated_at`.

### Table `phi_table_registry`

<a id="table-phi-table-registry"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: Tenancy and access (PHI-adjacent; policies apply where noted): Catalog of PHI tables; policy "Global"
- Created by `20261015140000_tenancy` (ADR 0013)
- Primary key: `id`
- Privileges: `tp_app` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140000` |  |
| 2 | `table_name` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 3 | `registered_by` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 4 | `policy_name` | `text` | NOT NULL |  |  | `20261015140000` |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140000` |  |

Keys:
- Primary: (id)
- Unique `phi_table_registry_table_name_key`: `UNIQUE (table_name)`

Policies (0):
- none

Invariants enforced by constraints:
- `phi_table_registry_policy_name_check`: `CHECK (policy_name ~ '^[a-z][a-z0-9_]*$'::text)`
- `phi_table_registry_registered_by_check`: `CHECK (registered_by ~ '^[0-9]{14}_[a-z0-9_]+$'::text)`
- `phi_table_registry_table_name_check`: `CHECK (table_name ~ '^[a-z][a-z0-9_]*$'::text)`

Maintains `updated_at`: `phi_table_registry_updated_at`.

## 5. Documents and remittances

<a id="area-documents"></a>

Every uploaded file, and the 835 remittance loaded from it: transaction sets, claims, service lines, CAS and PLB adjustments, the minimal patient identity, the parse report, and notes a person writes on a line.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`source_document`](#table-source-document) | PHI (registered) | yes / yes | 4 | SELECT, INSERT(cols), UPDATE(cols) | `20261016090000_documents_payers_plans` | Every uploaded file |
| [`remittance`](#table-remittance) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261016120000_remittances` | One 835 transaction set |
| [`claim`](#table-claim) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261016120000_remittances` | CLP |
| [`service_line`](#table-service-line) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261016120000_remittances` | SVC |
| [`adjustment`](#table-adjustment) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261016120000_remittances` | CAS |
| [`provider_adjustment`](#table-provider-adjustment) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261016120000_remittances` | PLB |
| [`patient_ref`](#table-patient-ref) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261016120000_remittances` | Minimal identity |
| [`parse_report`](#table-parse-report) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261016120000_remittances` | Per document |
| [`line_note`](#table-line-note) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261016120000_remittances` | not in the Data dictionary |

### Table `source_document`

<a id="table-source-document"></a>

- Class: PHI (registered); registry policy `source_document_tenant`, registered by `20261016090000_documents_payers_plans`, qualifies: yes
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): Every uploaded file
- Created by `20261016090000_documents_payers_plans` (ADR 0013, ADR 0015, ADR 0018); its DDL, policies or trigger functions changed by `20261017090000_document_scan_gate`, `20261017120000_document_page_text`, `20261029150000_billing`, `20261102090000_era_export_intake`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`content_type`, `format_id`, `id`, `kind`, `parent_document_id`, `practice_id`, `scan_at`, `scan_status`, `sha256`, `size_bytes`, `status`, `uploaded_by`)
- Column grant: `tp_app` UPDATE (`page_count`, `page_text_status`, `scan_at`, `scan_status`, `sha256`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016090000` |  |
| 3 | `kind` | `text` | NOT NULL |  |  | `20261016090000` | one of x12_835, era_export, contract, exhibit, posting_export, eft_export, payer_letter, other |
| 4 | `s3_key` | `text` | NOT NULL |  |  | `20261016090000` | generated from `((('practices/'::text \|\| (practice_id)::text) \|\| '/documents/'::text) \|\| (id)::text)` |
| 5 | `sha256` | `text` | null |  |  | `20261016090000` |  |
| 6 | `size_bytes` | `bigint` | NOT NULL |  |  | `20261016090000` |  |
| 7 | `content_type` | `text` | NOT NULL |  |  | `20261016090000` |  |
| 8 | `uploaded_by` | `uuid` | NOT NULL |  | `user(id)` | `20261016090000` |  |
| 9 | `scan_status` | `text` | NOT NULL | `'pending'::text` |  | `20261016090000` | one of pending, clean, flagged, unscannable, failed |
| 10 | `scan_at` | `timestamp with time zone` | null |  |  | `20261016090000` |  |
| 11 | `retention_class` | `text` | NOT NULL | `'records'::text` |  | `20261016090000` |  |
| 12 | `parent_document_id` | `uuid` | null |  | `source_document(id)` | `20261016090000` |  |
| 13 | `status` | `text` | NOT NULL | `'awaiting_upload'::text` |  | `20261016090000` | one of awaiting_upload, received, scanned, stored, expanded, parse_queued, parsed, balanced, loaded, held, duplicate, quarantined, not_835, wrong_type, unreadable, too_large, too_compressed, nested_zip, unsafe_entry, encrypted, too_many_entries, failed |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016090000` |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016090000` |  |
| 16 | `page_text_status` | `text` | null |  |  | `20261017120000` | one of ready, unsupported_document, document_unreadable; not in the dictionary |
| 17 | `page_count` | `integer` | null |  |  | `20261017120000` | not in the dictionary |
| 18 | `format_id` | `text` | null |  |  | `20261102090000` | one of webpt_billing_era_v0, prompt_era_v0, spry_era_v0, raintree_era_v0; not in the dictionary |

Keys:
- Primary: (id)
- Unique index `source_document_first_of_its_bytes`: `USING btree (practice_id, sha256, COALESCE(format_id, ''::text)) WHERE ((sha256 IS NOT NULL) AND (status <> 'duplicate'::text))`
- Foreign `source_document_parent_document_id_fkey`: (parent_document_id) -> `source_document`(id), on delete no action
- Foreign `source_document_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `source_document_uploaded_by_fkey`: (uploaded_by) -> `user`(id), on delete no action

Indexes:
- `source_document_by_parent`: `USING btree (parent_document_id, status) WHERE (parent_document_id IS NOT NULL)`
- `source_document_by_practice`: `USING btree (practice_id, created_at DESC, id)`

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

Invariants enforced by constraints:
- `source_document_content_type_check`: `CHECK (content_type ~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,126}$'::text)`
- `source_document_format_id_check`: `CHECK (format_id = ANY (ARRAY['webpt_billing_era_v0'::text, 'prompt_era_v0'::text, 'spry_era_v0'::text, 'raintree_era_v0'::text]))`
- `source_document_format_of_era_export`: `CHECK ((kind = 'era_export'::text) = (format_id IS NOT NULL))`
- `source_document_kind_check`: `CHECK (kind = ANY (ARRAY['x12_835'::text, 'era_export'::text, 'contract'::text, 'exhibit'::text, 'posting_export'::text, 'eft_export'::text, 'payer_letter'::text, 'other'::text]))`
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

Invariants enforced by triggers:
- `source_document_refused_while_suspended`: `BEFORE INSERT ON source_document FOR EACH ROW WHEN (new.parent_document_id IS NULL) EXECUTE FUNCTION refuse_new_work_while_suspended()`
  - "%"
- `source_document_rules`: `BEFORE INSERT OR UPDATE ON source_document FOR EACH ROW EXECUTE FUNCTION source_document_rules()`
  - "a zip entry belongs to a top-level document of the same practice"
  - "a zip entry carries its zip's uploader"
  - "a zip entry carries its zip's export format"
  - "a zip entry is clean only when its zip's malware scan is"
  - "a document is scanned or queued for parse only when its malware scan is clean"
  - "a document's SHA-256 never changes once recorded"
  - "a scan verdict is never taken back"
  - "a malware finding is never cleared"
  - "a quarantined or duplicate document stays so"

Maintains `updated_at`: `source_document_updated_at`.

### Table `remittance`

<a id="table-remittance"></a>

- Class: PHI (registered); registry policy `remittance_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): One 835 transaction set
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027); its DDL, policies or trigger functions changed by `20261102090000_era_export_intake`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`balance_diff_cents`, `bpr02_cents`, `bpr16_date`, `bpr_credit_debit`, `bpr_method`, `claim_count`, `gs06`, `held_reason`, `id`, `isa13`, `payee_id_qualifier`, `payee_npi`, `payer_id`, `payer_name`, `plb_total_cents`, `practice_id`, `production_date`, `provenance`, `receiver_id`, `review_of_remittance_id`, `review_reason`, `sender_id`, `source_document_id`, `st02`, `status`, `trn02`, `trn03`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` | `20261016120000` |  |
| 4 | `sender_id` | `text` | null |  |  | `20261016120000` |  |
| 5 | `receiver_id` | `text` | null |  |  | `20261016120000` |  |
| 6 | `isa13` | `text` | null |  |  | `20261016120000` |  |
| 7 | `gs06` | `text` | null |  |  | `20261016120000` |  |
| 8 | `st02` | `text` | null |  |  | `20261016120000` |  |
| 9 | `trn02` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 10 | `trn03` | `text` | null |  |  | `20261016120000` | not in the dictionary |
| 11 | `bpr02_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 12 | `bpr_credit_debit` | `text` | NOT NULL |  |  | `20261016120000` | one of C, D; not in the dictionary |
| 13 | `bpr_method` | `text` | null |  |  | `20261016120000` |  |
| 14 | `bpr16_date` | `date` | NOT NULL |  |  | `20261016120000` |  |
| 15 | `payer_name` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 16 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` | `20261016120000` |  |
| 17 | `payee_npi` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 18 | `payee_id_qualifier` | `text` | null |  |  | `20261016120000` | not in the dictionary |
| 19 | `production_date` | `date` | null |  |  | `20261016120000` |  |
| 20 | `balance_diff_cents` | `bigint` | NOT NULL | `0` |  | `20261016120000` |  |
| 21 | `balanced` | `boolean` | NOT NULL |  |  | `20261016120000` | generated from `(balance_diff_cents = 0)` |
| 22 | `claim_count` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 23 | `plb_total_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 24 | `status` | `text` | NOT NULL | `'loaded'::text` |  | `20261016120000` | one of loaded, held, duplicate |
| 25 | `held_reason` | `text` | null |  |  | `20261016120000` |  |
| 26 | `review_reason` | `text` | null |  |  | `20261016120000` | one of trace_reused_another_date, trace_reused_same_date; not in the dictionary |
| 27 | `review_of_remittance_id` | `uuid` | null |  | `remittance(id)` | `20261016120000` | not in the dictionary |
| 28 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 29 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 30 | `provenance` | `text` | NOT NULL | `'x12_835'::text` |  | `20261102090000` | one of x12_835, era_export; not in the dictionary |

Keys:
- Primary: (id)
- Unique `remittance_once`: `UNIQUE (practice_id, sender_id, isa13, trn02, bpr02_cents)`
- Unique index `remittance_export_once`: `USING btree (practice_id, payee_npi, trn02, bpr_credit_debit, bpr02_cents, bpr16_date) WHERE (provenance = 'era_export'::text)`
- Foreign `remittance_payer_id_fkey`: (payer_id) -> `payer`(id), on delete no action
- Foreign `remittance_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `remittance_review_of_remittance_id_fkey`: (review_of_remittance_id) -> `remittance`(id), on delete no action
- Foreign `remittance_source_document_id_fkey`: (source_document_id) -> `source_document`(id), on delete no action

Indexes:
- `remittance_by_document`: `USING btree (source_document_id)`
- `remittance_by_payer`: `USING btree (practice_id, payer_id, bpr16_date DESC)`
- `remittance_by_payment_date`: `USING btree (practice_id, bpr16_date DESC, id)`
- `remittance_by_trace`: `USING btree (practice_id, trn02)`
- `remittance_by_trace_form`: `USING btree (practice_id, ltrim(upper((trn02 COLLATE "C")), '0'::text))`

Policies (1):
- `remittance_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `remittance_bpr02_cents_check`: `CHECK (bpr02_cents >= 0)`
- `remittance_bpr_credit_debit_check`: `CHECK (bpr_credit_debit = ANY (ARRAY['C'::text, 'D'::text]))`
- `remittance_bpr_method_check`: `CHECK (btrim(bpr_method) <> ''::text)`
- `remittance_claim_count_check`: `CHECK (claim_count >= 0)`
- `remittance_export_has_no_envelope`: `CHECK (provenance <> 'era_export'::text OR receiver_id IS NULL AND isa13 IS NULL AND gs06 IS NULL AND st02 IS NULL AND trn03 IS NULL AND payee_id_qualifier IS NULL)`
- `remittance_gs06_check`: `CHECK (btrim(gs06) <> ''::text)`
- `remittance_held_reason_check`: `CHECK (held_reason ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `remittance_isa13_check`: `CHECK (btrim(isa13) <> ''::text)`
- `remittance_loads_only_balanced`: `CHECK (status <> 'loaded'::text OR balance_diff_cents = 0)`
- `remittance_not_reviewed_against_itself`: `CHECK (review_of_remittance_id IS DISTINCT FROM id)`
- `remittance_payee_id_qualifier_check`: `CHECK (btrim(payee_id_qualifier) <> ''::text)`
- `remittance_payee_npi_check`: `CHECK (btrim(payee_npi) <> ''::text)`
- `remittance_payer_name_check`: `CHECK (btrim(payer_name) <> ''::text)`
- `remittance_provenance_check`: `CHECK (provenance = ANY (ARRAY['x12_835'::text, 'era_export'::text]))`
- `remittance_receiver_id_check`: `CHECK (btrim(receiver_id) <> ''::text)`
- `remittance_review_names_its_remittance`: `CHECK ((review_reason IS NULL) = (review_of_remittance_id IS NULL))`
- `remittance_review_reason_check`: `CHECK (review_reason = ANY (ARRAY['trace_reused_another_date'::text, 'trace_reused_same_date'::text]))`
- `remittance_sender_id_check`: `CHECK (btrim(sender_id) <> ''::text)`
- `remittance_st02_check`: `CHECK (btrim(st02) <> ''::text)`
- `remittance_status_check`: `CHECK (status = ANY (ARRAY['loaded'::text, 'held'::text, 'duplicate'::text]))`
- `remittance_trn02_check`: `CHECK (btrim(trn02) <> ''::text)`
- `remittance_trn03_check`: `CHECK (btrim(trn03) <> ''::text)`
- `remittance_x12_envelope`: `CHECK (provenance <> 'x12_835'::text OR sender_id IS NOT NULL AND receiver_id IS NOT NULL AND isa13 IS NOT NULL AND gs06 IS NOT NULL AND st02 IS NOT NULL AND trn03 IS NOT NULL AND bpr_method IS NOT NULL AND payee_id_qualifier IS NOT NULL)`

Invariants enforced by triggers:
- `remittance_references_in_practice`: `BEFORE INSERT ON remittance FOR EACH ROW EXECUTE FUNCTION remittance_references_in_practice()`
  - "a remittance comes from a document of its provenance (an 835 or an ERA export) of the same practice"
  - "a remittance names a payer of the same practice"
  - "a remittance is reviewed against a remittance of the same practice"
  - "an ERA export of a payment already loaded loads nothing"
  - "an 835 of a payment loaded from an ERA export is held for review, never loaded beside it"

Maintains `updated_at`: `remittance_updated_at`.

### Table `claim`

<a id="table-claim"></a>

- Class: PHI (registered); registry policy `claim_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): CLP
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027); its DDL, policies or trigger functions changed by `20261023090000_packets_submissions_and_responses`, `20261023120000_recovery_ledger`, `20261102090000_era_export_intake`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`allowed_cents`, `charge_cents`, `claim_no`, `claim_status_code`, `facility_type`, `filing_indicator`, `frequency_code`, `id`, `insured_ref_id`, `interest_cents`, `paid_cents`, `patient_control_number`, `patient_ref_id`, `patient_resp_cents`, `payer_claim_control_number`, `payer_claim_control_number_hash`, `practice_id`, `received_on`, `remittance_id`, `reversal_of_claim_id`, `service_from`, `service_to`, `superseded_by_claim_id`)
- Column grant: `tp_app` UPDATE (`reversal_of_claim_id`, `superseded_by_claim_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `remittance_id` | `uuid` | NOT NULL |  | `remittance(id)` | `20261016120000` |  |
| 4 | `claim_no` | `integer` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 5 | `patient_control_number` | `text` | NOT NULL |  |  | `20261016120000` | encrypted (enc:v1) |
| 6 | `payer_claim_control_number` | `text` | NOT NULL |  |  | `20261016120000` | encrypted (enc:v1) |
| 7 | `payer_claim_control_number_hash` | `text` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 8 | `claim_status_code` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 9 | `charge_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 10 | `paid_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 11 | `patient_resp_cents` | `bigint` | null |  |  | `20261016120000` |  |
| 12 | `filing_indicator` | `text` | null |  |  | `20261016120000` | not in the dictionary |
| 13 | `facility_type` | `text` | null |  |  | `20261016120000` |  |
| 14 | `frequency_code` | `text` | null |  |  | `20261016120000` |  |
| 15 | `patient_ref_id` | `uuid` | NOT NULL |  | `patient_ref(id)` | `20261016120000` |  |
| 16 | `insured_ref_id` | `uuid` | null |  | `patient_ref(id)` | `20261016120000` |  |
| 17 | `service_from` | `date` | null |  |  | `20261016120000` |  |
| 18 | `service_to` | `date` | null |  |  | `20261016120000` |  |
| 19 | `reversal_of_claim_id` | `uuid` | null |  | `claim(id)` | `20261016120000` |  |
| 20 | `superseded_by_claim_id` | `uuid` | null |  | `claim(id)` | `20261016120000` |  |
| 21 | `allowed_cents` | `bigint` | null |  |  | `20261016120000` |  |
| 22 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 23 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 24 | `received_on` | `date` | null |  |  | `20261023090000` | not in the dictionary |
| 25 | `interest_cents` | `bigint` | null |  |  | `20261023120000` | not in the dictionary |

Keys:
- Primary: (id)
- Unique `claim_once`: `UNIQUE (remittance_id, claim_no)`
- Foreign `claim_insured_ref_id_fkey`: (insured_ref_id) -> `patient_ref`(id), on delete no action
- Foreign `claim_patient_ref_id_fkey`: (patient_ref_id) -> `patient_ref`(id), on delete no action
- Foreign `claim_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `claim_remittance_id_fkey`: (remittance_id) -> `remittance`(id), on delete no action
- Foreign `claim_reversal_of_claim_id_fkey`: (reversal_of_claim_id) -> `claim`(id), on delete no action
- Foreign `claim_superseded_by_claim_id_fkey`: (superseded_by_claim_id) -> `claim`(id), on delete no action

Indexes:
- `claim_by_patient`: `USING btree (practice_id, patient_ref_id)`
- `claim_by_payer_claim_control_number`: `USING btree (practice_id, payer_claim_control_number_hash)`
- `claim_by_reversed`: `USING btree (reversal_of_claim_id) WHERE (reversal_of_claim_id IS NOT NULL)`

Policies (1):
- `claim_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `claim_claim_no_check`: `CHECK (claim_no >= 1)`
- `claim_claim_status_code_check`: `CHECK (btrim(claim_status_code) <> ''::text)`
- `claim_filing_indicator_check`: `CHECK (btrim(filing_indicator) <> ''::text)`
- `claim_not_its_own_reversal`: `CHECK (reversal_of_claim_id IS DISTINCT FROM id)`
- `claim_not_superseded_by_itself`: `CHECK (superseded_by_claim_id IS DISTINCT FROM id)`
- `claim_patient_control_number_check`: `CHECK (patient_control_number ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `claim_payer_claim_control_number_check`: `CHECK (payer_claim_control_number ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `claim_payer_claim_control_number_hash_check`: `CHECK (payer_claim_control_number_hash ~ '^[0-9a-f]{64}$'::text)`
- `claim_reversal_is_a_reversal`: `CHECK (reversal_of_claim_id IS NULL OR claim_status_code = '22'::text)`

Invariants enforced by triggers:
- `claim_references_in_practice`: `BEFORE INSERT OR UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION claim_references_in_practice()`
  - "a reversal's link to the claim it reverses never changes once set"
  - "a claim's superseding correction never changes once set"
  - "a claim belongs to a remittance of the same practice"
  - "a claim of an 835 carries its claim filing indicator (CLP06)"
  - "a claim names patient references of the same practice"
  - "a reversal reverses a claim of the same practice that is not itself a reversal"
  - "a claim is superseded by a corrected claim of the same practice"

Maintains `updated_at`: `claim_updated_at`.

### Table `service_line`

<a id="table-service-line"></a>

- Class: PHI (registered); registry policy `service_line_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): SVC
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`charge_cents`, `claim_id`, `id`, `line_allowed_cents`, `line_no`, `modifiers`, `observed_allowed_allocated`, `observed_allowed_basis`, `observed_allowed_cents`, `original_units`, `paid_cents`, `patient_share_cents`, `payer_plan_key`, `place_of_service`, `practice_id`, `procedure_code`, `procedure_qualifier`, `rendering_npi`, `revenue_code`, `service_date`, `service_date_to`, `units`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `claim_id` | `uuid` | NOT NULL |  | `claim(id)` | `20261016120000` |  |
| 4 | `line_no` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 5 | `procedure_qualifier` | `text` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 6 | `procedure_code` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 7 | `modifiers` | `text[]` | NOT NULL | `'{}'::text[]` |  | `20261016120000` |  |
| 8 | `revenue_code` | `text` | null |  |  | `20261016120000` |  |
| 9 | `charge_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 10 | `paid_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 11 | `units` | `numeric(9,3)` | null |  |  | `20261016120000` |  |
| 12 | `original_units` | `numeric(9,3)` | null |  |  | `20261016120000` |  |
| 13 | `service_date` | `date` | null |  |  | `20261016120000` |  |
| 14 | `service_date_to` | `date` | null |  |  | `20261016120000` | not in the dictionary |
| 15 | `place_of_service` | `text` | null |  |  | `20261016120000` |  |
| 16 | `line_allowed_cents` | `bigint` | null |  |  | `20261016120000` |  |
| 17 | `observed_allowed_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 18 | `observed_allowed_basis` | `text` | NOT NULL |  |  | `20261016120000` | one of amt_b6, paid_plus_pr |
| 19 | `observed_allowed_allocated` | `boolean` | NOT NULL | `false` |  | `20261016120000` | not in the dictionary |
| 20 | `patient_share_cents` | `bigint` | NOT NULL | `0` |  | `20261016120000` | not in the dictionary |
| 21 | `rendering_npi` | `text` | null |  |  | `20261016120000` |  |
| 22 | `payer_plan_key` | `uuid` | NOT NULL |  | `plan(id)` | `20261016120000` |  |
| 23 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 24 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |

Keys:
- Primary: (id)
- Unique `service_line_once`: `UNIQUE (claim_id, line_no)`
- Foreign `service_line_claim_id_fkey`: (claim_id) -> `claim`(id), on delete no action
- Foreign `service_line_payer_plan_key_fkey`: (payer_plan_key) -> `plan`(id), on delete no action
- Foreign `service_line_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `service_line_by_plan_and_code`: `USING btree (practice_id, payer_plan_key, procedure_code)`
- `service_line_by_service_date`: `USING btree (practice_id, service_date)`

Policies (1):
- `service_line_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `service_line_allocated_from_paid_and_share`: `CHECK (NOT observed_allowed_allocated OR observed_allowed_basis = 'paid_plus_pr'::text)`
- `service_line_dates`: `CHECK (service_date_to IS NULL OR service_date IS NOT NULL)`
- `service_line_line_no_check`: `CHECK (line_no >= 1)`
- `service_line_modifiers_check`: `CHECK (cardinality(modifiers) <= 4)`
- `service_line_observed_allowed_basis_check`: `CHECK (observed_allowed_basis = ANY (ARRAY['amt_b6'::text, 'paid_plus_pr'::text]))`
- `service_line_observed_from_b6`: `CHECK (observed_allowed_basis <> 'amt_b6'::text OR observed_allowed_cents = line_allowed_cents)`
- `service_line_observed_from_paid_and_share`: `CHECK (observed_allowed_basis <> 'paid_plus_pr'::text OR observed_allowed_cents = (paid_cents + patient_share_cents))`
- `service_line_procedure_code_check`: `CHECK (btrim(procedure_code) <> ''::text)`
- `service_line_procedure_qualifier_check`: `CHECK (btrim(procedure_qualifier) <> ''::text)`

Invariants enforced by triggers:
- `service_line_references_in_practice`: `BEFORE INSERT ON service_line FOR EACH ROW EXECUTE FUNCTION service_line_references_in_practice()`
  - "a service line belongs to a claim of the same practice"
  - "a service line names a plan of the same practice"

Maintains `updated_at`: `service_line_updated_at`.

### Table `adjustment`

<a id="table-adjustment"></a>

- Class: PHI (registered); registry policy `adjustment_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): CAS
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`amount_cents`, `claim_id`, `group_code`, `id`, `position`, `practice_id`, `quantity`, `reason_code`, `service_line_id`, `unknown_code`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `claim_id` | `uuid` | NOT NULL |  | `claim(id)` | `20261016120000` |  |
| 4 | `service_line_id` | `uuid` | null |  | `service_line(id)` | `20261016120000` |  |
| 5 | `group_code` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 6 | `reason_code` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 7 | `unknown_code` | `boolean` | NOT NULL | `false` |  | `20261016120000` | not in the dictionary |
| 8 | `amount_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 9 | `quantity` | `numeric(9,3)` | null |  |  | `20261016120000` |  |
| 10 | `position` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |

Keys:
- Primary: (id)
- Unique `adjustment_once`: `UNIQUE NULLS NOT DISTINCT (claim_id, service_line_id, "position")`
- Foreign `adjustment_claim_id_fkey`: (claim_id) -> `claim`(id), on delete no action
- Foreign `adjustment_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `adjustment_service_line_id_fkey`: (service_line_id) -> `service_line`(id), on delete no action

Indexes:
- `adjustment_by_claim`: `USING btree (practice_id, claim_id)`
- `adjustment_by_line`: `USING btree (service_line_id) WHERE (service_line_id IS NOT NULL)`

Policies (1):
- `adjustment_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `adjustment_group_code_check`: `CHECK (btrim(group_code) <> ''::text)`
- `adjustment_position_check`: `CHECK ("position" >= 1)`
- `adjustment_reason_code_check`: `CHECK (btrim(reason_code) <> ''::text)`

Invariants enforced by triggers:
- `adjustment_references_in_practice`: `BEFORE INSERT ON adjustment FOR EACH ROW EXECUTE FUNCTION adjustment_references_in_practice()`
  - "an adjustment belongs to a claim of the same practice"
  - "a line-level adjustment belongs to a line of its own claim"

Maintains `updated_at`: `adjustment_updated_at`.

### Table `provider_adjustment`

<a id="table-provider-adjustment"></a>

- Class: PHI (registered); registry policy `provider_adjustment_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): PLB
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`amount_cents`, `category`, `fiscal_period_date`, `id`, `position`, `practice_id`, `provider_id`, `reason_code`, `reference`, `remittance_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `remittance_id` | `uuid` | NOT NULL |  | `remittance(id)` | `20261016120000` |  |
| 4 | `position` | `integer` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 5 | `provider_id` | `text` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 6 | `reason_code` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 7 | `reference` | `text` | null |  |  | `20261016120000` |  |
| 8 | `amount_cents` | `bigint` | NOT NULL |  |  | `20261016120000` |  |
| 9 | `fiscal_period_date` | `date` | NOT NULL |  |  | `20261016120000` |  |
| 10 | `category` | `text` | NOT NULL |  |  | `20261016120000` | one of recoupment, forward_balance, interest, authorized_return, other; not in the dictionary |
| 11 | `counted` | `boolean` | NOT NULL |  |  | `20261016120000` | generated from `(category <> 'forward_balance'::text)`; not in the dictionary |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |

Keys:
- Primary: (id)
- Unique `provider_adjustment_once`: `UNIQUE (remittance_id, "position")`
- Foreign `provider_adjustment_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `provider_adjustment_remittance_id_fkey`: (remittance_id) -> `remittance`(id), on delete no action

Indexes:
- `provider_adjustment_by_remittance`: `USING btree (practice_id, remittance_id)`

Policies (1):
- `provider_adjustment_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `provider_adjustment_category_check`: `CHECK (category = ANY (ARRAY['recoupment'::text, 'forward_balance'::text, 'interest'::text, 'authorized_return'::text, 'other'::text]))`
- `provider_adjustment_position_check`: `CHECK ("position" >= 1)`
- `provider_adjustment_provider_id_check`: `CHECK (btrim(provider_id) <> ''::text)`
- `provider_adjustment_reason_code_check`: `CHECK (btrim(reason_code) <> ''::text)`

Invariants enforced by triggers:
- `provider_adjustment_references_in_practice`: `BEFORE INSERT ON provider_adjustment FOR EACH ROW EXECUTE FUNCTION provider_adjustment_references_in_practice()`
  - "a provider adjustment belongs to a remittance of the same practice"

Maintains `updated_at`: `provider_adjustment_updated_at`.

### Table `patient_ref`

<a id="table-patient-ref"></a>

- Class: PHI (registered); registry policy `patient_ref_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): Minimal identity
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`dob`, `first_name`, `group_number`, `id`, `last_name`, `member_id`, `practice_id`, `pseudonym`)
- Column grant: `tp_app` UPDATE (`dob`, `group_number`, `member_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `pseudonym` | `text` | NOT NULL |  |  | `20261016120000` |  |
| 4 | `last_name` | `text` | null |  |  | `20261016120000` | encrypted (enc:v1) |
| 5 | `first_name` | `text` | null |  |  | `20261016120000` | encrypted (enc:v1) |
| 6 | `dob` | `text` | null |  |  | `20261016120000` | encrypted (enc:v1) |
| 7 | `member_id` | `text` | null |  |  | `20261016120000` | encrypted (enc:v1) |
| 8 | `group_number` | `text` | null |  |  | `20261016120000` | encrypted (enc:v1) |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |

Keys:
- Primary: (id)
- Unique index `patient_ref_by_pseudonym`: `USING btree (practice_id, pseudonym)`
- Foreign `patient_ref_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Policies (1):
- `patient_ref_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `patient_ref_dob_check`: `CHECK (dob ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_first_name_check`: `CHECK (first_name ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_group_number_check`: `CHECK (group_number ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_last_name_check`: `CHECK (last_name ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_member_id_check`: `CHECK (member_id ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `patient_ref_pseudonym_check`: `CHECK (pseudonym ~ '^[0-9a-f]{64}$'::text)`

Maintains `updated_at`: `patient_ref_updated_at`.

### Table `parse_report`

<a id="table-parse-report"></a>

- Class: PHI (registered); registry policy `parse_report_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Documents and remittances (PHI): Per document
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`claims`, `code_list_release`, `duplicate_transactions`, `errors`, `held`, `id`, `lines`, `loaded_claims`, `loaded_lines`, `loaded_transactions`, `outcome`, `plb_total_cents`, `practice_id`, `reversals`, `source_document_id`, `transaction_outcomes`, `transactions`, `unknown_codes`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` | `20261016120000` |  |
| 4 | `outcome` | `text` | NOT NULL |  |  | `20261016120000` | one of loaded, held, partially_held, duplicate; not in the dictionary |
| 5 | `transactions` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 6 | `claims` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 7 | `lines` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 8 | `reversals` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 9 | `held` | `integer` | NOT NULL |  |  | `20261016120000` |  |
| 10 | `plb_total_cents` | `bigint` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 11 | `loaded_transactions` | `integer` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 12 | `loaded_claims` | `integer` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 13 | `loaded_lines` | `integer` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 14 | `duplicate_transactions` | `integer` | NOT NULL |  |  | `20261016120000` | not in the dictionary |
| 15 | `unknown_codes` | `text[]` | NOT NULL | `'{}'::text[]` |  | `20261016120000` | not in the dictionary |
| 16 | `errors` | `jsonb` | NOT NULL | `'[]'::jsonb` |  | `20261016120000` |  |
| 17 | `transaction_outcomes` | `jsonb` | NOT NULL | `'[]'::jsonb` |  | `20261016120000` | not in the dictionary |
| 18 | `code_list_release` | `integer` | null |  |  | `20261016120000` | not in the dictionary |
| 19 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 20 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |

Keys:
- Primary: (id)
- Unique `parse_report_once`: `UNIQUE (source_document_id)`
- Foreign `parse_report_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `parse_report_source_document_id_fkey`: (source_document_id) -> `source_document`(id), on delete no action

Indexes:
- `parse_report_by_practice`: `USING btree (practice_id, created_at DESC)`

Policies (1):
- `parse_report_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `parse_report_references_in_practice`: `BEFORE INSERT ON parse_report FOR EACH ROW EXECUTE FUNCTION parse_report_references_in_practice()`
  - "a parse report belongs to a document of the same practice"

Maintains `updated_at`: `parse_report_updated_at`.

### Table `line_note`

<a id="table-line-note"></a>

- Class: PHI (registered); registry policy `line_note_tenant`, registered by `20261016120000_remittances`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`created_by`, `id`, `note`, `practice_id`, `service_line_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016120000` |  |
| 3 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` | `20261016120000` |  |
| 4 | `note` | `text` | NOT NULL |  |  | `20261016120000` | encrypted (enc:v1) |
| 5 | `created_by` | `uuid` | NOT NULL |  | `user(id)` | `20261016120000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016120000` |  |

Keys:
- Primary: (id)
- Foreign `line_note_created_by_fkey`: (created_by) -> `user`(id), on delete no action
- Foreign `line_note_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `line_note_service_line_id_fkey`: (service_line_id) -> `service_line`(id), on delete no action

Indexes:
- `line_note_by_line`: `USING btree (practice_id, service_line_id, created_at)`

Policies (2):
- `line_note_created_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(created_by = app_actor_id())`
- `line_note_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `line_note_note_check`: `CHECK (note ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`

Invariants enforced by triggers:
- `line_note_references_in_practice`: `BEFORE INSERT ON line_note FOR EACH ROW EXECUTE FUNCTION line_note_references_in_practice()`
  - "a note belongs to a service line of the same practice"

Maintains `updated_at`: `line_note_updated_at`.

## 6. Payers, contracts and rates

<a id="area-contracts"></a>

Payers and plans as the remittances name them, the mapping of a plan to an agreement, contracts and their versions, rate records (each pricing term with its page, quote and hash), the contract calendar, and the questions a specialist raises on a version.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`payer`](#table-payer) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261016090000_documents_payers_plans` | Payer identity |
| [`plan`](#table-plan) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261016090000_documents_payers_plans` | Product or plan |
| [`payer_plan_mapping`](#table-payer-plan-mapping) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261016160000_contracts_and_mapping` | Plan to agreement |
| [`contract`](#table-contract) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261016160000_contracts_and_mapping` | Agreement with a payer |
| [`contract_version`](#table-contract-version) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261016160000_contracts_and_mapping` | A version or amendment |
| [`rate_record`](#table-rate-record) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols), DELETE | `20261016160000_contracts_and_mapping` | A pricing term |
| [`contract_calendar_event`](#table-contract-calendar-event) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261016160000_contracts_and_mapping` | Dates to act on |
| [`contract_question`](#table-contract-question) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols), UPDATE(cols) | `20261016200000_contract_questions_and_queue` | not in the Data dictionary |

### Table `payer`

<a id="table-payer"></a>

- Class: PHI (registered); registry policy `payer_tenant`, registered by `20261016090000_documents_payers_plans`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Payers, contracts and rates (PHI-adjacent; confidential): Payer identity
- Created by `20261016090000_documents_payers_plans` (ADR 0013, ADR 0015, ADR 0018)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`canonical_payer_id`, `id`, `name_raw`, `payer_id_raw`, `practice_id`)
- Column grant: `tp_app` UPDATE (`canonical_payer_id`, `name_raw`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016090000` |  |
| 3 | `payer_id_raw` | `text` | NOT NULL |  |  | `20261016090000` |  |
| 4 | `name_raw` | `text` | NOT NULL |  |  | `20261016090000` |  |
| 5 | `canonical_payer_id` | `uuid` | null |  |  | `20261016090000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016090000` |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016090000` |  |

Keys:
- Primary: (id)
- Unique index `payer_by_raw_id`: `USING btree (practice_id, payer_id_raw)`
- Foreign `payer_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Policies (1):
- `payer_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `payer_name_raw_check`: `CHECK (btrim(name_raw) <> ''::text)`
- `payer_payer_id_raw_check`: `CHECK (btrim(payer_id_raw) <> ''::text)`

Maintains `updated_at`: `payer_updated_at`.

### Table `plan`

<a id="table-plan"></a>

- Class: PHI (registered); registry policy `plan_tenant`, registered by `20261016090000_documents_payers_plans`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Payers, contracts and rates (PHI-adjacent; confidential): Product or plan
- Created by `20261016090000_documents_payers_plans` (ADR 0013, ADR 0015, ADR 0018)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`id`, `is_medicare_advantage`, `ma_contracted`, `name`, `network_status`, `payer_id`, `plan_key`, `practice_id`)
- Column grant: `tp_app` UPDATE (`is_medicare_advantage`, `ma_contracted`, `name`, `network_status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016090000` |  |
| 3 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` | `20261016090000` |  |
| 4 | `plan_key` | `text` | NOT NULL |  |  | `20261016090000` |  |
| 5 | `name` | `text` | null |  |  | `20261016090000` |  |
| 6 | `network_status` | `text` | NOT NULL | `'unknown'::text` |  | `20261016090000` | one of in_network, out_of_network, unknown |
| 7 | `is_medicare_advantage` | `boolean` | NOT NULL | `false` |  | `20261016090000` |  |
| 8 | `ma_contracted` | `boolean` | NOT NULL | `false` |  | `20261016090000` |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016090000` |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016090000` |  |

Keys:
- Primary: (id)
- Unique index `plan_by_key`: `USING btree (practice_id, payer_id, plan_key)`
- Foreign `plan_payer_id_fkey`: (payer_id) -> `payer`(id), on delete no action
- Foreign `plan_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `plan_by_payer`: `USING btree (payer_id)`

Policies (1):
- `plan_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `plan_ma_contracted_is_medicare_advantage`: `CHECK (is_medicare_advantage OR NOT ma_contracted)`
- `plan_name_check`: `CHECK (btrim(name) <> ''::text)`
- `plan_network_status_check`: `CHECK (network_status = ANY (ARRAY['in_network'::text, 'out_of_network'::text, 'unknown'::text]))`
- `plan_plan_key_check`: `CHECK (btrim(plan_key) <> ''::text)`

Invariants enforced by triggers:
- `plan_payer_of_practice`: `BEFORE INSERT OR UPDATE OF payer_id, practice_id ON plan FOR EACH ROW EXECUTE FUNCTION plan_payer_of_practice()`
  - "a plan belongs to a payer of the same practice"

Maintains `updated_at`: `plan_updated_at`.

### Table `payer_plan_mapping`

<a id="table-payer-plan-mapping"></a>

- Class: PHI (registered); registry policy `payer_plan_mapping_tenant`, registered by `20261016160000_contracts_and_mapping`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Payers, contracts and rates (PHI-adjacent; confidential): Plan to agreement
- Created by `20261016160000_contracts_and_mapping` (ADR 0013, ADR 0017, ADR 0019, ADR 0028)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`contract_version_id`, `effective_from`, `effective_to`, `id`, `mapped_by`, `mapping_kind`, `plan_id`, `practice_id`, `supersedes_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016160000` |  |
| 3 | `plan_id` | `uuid` | NOT NULL |  | `plan(id)` | `20261016160000` |  |
| 4 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` | `20261016160000` |  |
| 5 | `mapping_kind` | `text` | NOT NULL |  |  | `20261016160000` | one of no_agreement, contract, ma_noncontracted, government, other |
| 6 | `effective_from` | `date` | NOT NULL |  |  | `20261016160000` |  |
| 7 | `effective_to` | `date` | null |  |  | `20261016160000` |  |
| 8 | `mapped_by` | `uuid` | NOT NULL |  | `user(id)` | `20261016160000` |  |
| 9 | `supersedes_id` | `uuid` | null |  | `payer_plan_mapping(id)` | `20261016160000` |  |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |

Keys:
- Primary: (id)
- Foreign `payer_plan_mapping_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id), on delete no action
- Foreign `payer_plan_mapping_mapped_by_fkey`: (mapped_by) -> `user`(id), on delete no action
- Foreign `payer_plan_mapping_plan_id_fkey`: (plan_id) -> `plan`(id), on delete no action
- Foreign `payer_plan_mapping_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `payer_plan_mapping_supersedes_id_fkey`: (supersedes_id) -> `payer_plan_mapping`(id), on delete no action

Indexes:
- `payer_plan_mapping_by_plan`: `USING btree (practice_id, plan_id, effective_from)`
- `payer_plan_mapping_by_predecessor`: `USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL)`

Policies (2):
- `payer_plan_mapping_mapped_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(mapped_by = app_actor_id())`
- `payer_plan_mapping_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `payer_plan_mapping_mapping_kind_check`: `CHECK (mapping_kind = ANY (ARRAY['no_agreement'::text, 'contract'::text, 'ma_noncontracted'::text, 'government'::text, 'other'::text]))`
- `payer_plan_mapping_names_its_version`: `CHECK ((mapping_kind = 'contract'::text) = (contract_version_id IS NOT NULL))`
- `payer_plan_mapping_not_its_own_correction`: `CHECK (supersedes_id IS DISTINCT FROM id)`
- `payer_plan_mapping_window`: `CHECK (effective_to IS NULL OR effective_to > effective_from)`

Invariants enforced by triggers:
- `payer_plan_mapping_rules`: `BEFORE INSERT OR UPDATE ON payer_plan_mapping FOR EACH ROW EXECUTE FUNCTION payer_plan_mapping_rules()`
  - "a mapping never changes; correct it with a new mapping that supersedes it"
  - "a mapping maps a plan of the same practice"
  - "a mapping names a contract version of the same practice"
  - "a correction supersedes a mapping of the same plan"
  - "mappings of one plan never overlap: correct the mapping in force with a mapping that supersedes it"

Maintains `updated_at`: `payer_plan_mapping_updated_at`.

### Table `contract`

<a id="table-contract"></a>

- Class: PHI (registered); registry policy `contract_tenant`, registered by `20261016160000_contracts_and_mapping`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Payers, contracts and rates (PHI-adjacent; confidential): Agreement with a payer
- Created by `20261016160000_contracts_and_mapping` (ADR 0013, ADR 0017, ADR 0019, ADR 0028)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`billing_entity`, `id`, `payer_id`, `practice_id`, `title`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016160000` |  |
| 3 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` | `20261016160000` |  |
| 4 | `title` | `text` | NOT NULL |  |  | `20261016160000` |  |
| 5 | `billing_entity` | `text` | null |  |  | `20261016160000` |  |
| 6 | `status` | `text` | NOT NULL | `'active'::text` |  | `20261016160000` | one of active, ended |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |

Keys:
- Primary: (id)
- Foreign `contract_payer_id_fkey`: (payer_id) -> `payer`(id), on delete no action
- Foreign `contract_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `contract_by_payer`: `USING btree (practice_id, payer_id)`

Policies (1):
- `contract_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `contract_billing_entity_check`: `CHECK (btrim(billing_entity) <> ''::text AND char_length(billing_entity) <= 200)`
- `contract_status_check`: `CHECK (status = ANY (ARRAY['active'::text, 'ended'::text]))`
- `contract_title_check`: `CHECK (btrim(title) <> ''::text AND char_length(title) <= 200)`

Invariants enforced by triggers:
- `contract_rules`: `BEFORE INSERT OR UPDATE ON contract FOR EACH ROW EXECUTE FUNCTION contract_rules()`
  - "a contract's practice and payer never change"
  - "a contract belongs to a payer of the same practice"

Maintains `updated_at`: `contract_updated_at`.

### Table `contract_version`

<a id="table-contract-version"></a>

- Class: PHI (registered); registry policy `contract_version_tenant`, registered by `20261016160000_contracts_and_mapping`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Payers, contracts and rates (PHI-adjacent; confidential): A version or amendment
- Created by `20261016160000_contracts_and_mapping` (ADR 0013, ADR 0017, ADR 0019, ADR 0028)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`appeal_levels`, `contract_id`, `dispute_window_days`, `effective_from`, `effective_to`, `id`, `notice_days`, `practice_id`, `source_document_ids`, `supersedes_id`, `timely_filing_days`, `version_no`)
- Column grant: `tp_app` UPDATE (`appeal_levels`, `approved_at`, `approved_by`, `dispute_window_days`, `effective_from`, `effective_to`, `notice_days`, `signed_off_at`, `signed_off_by`, `source_document_ids`, `status`, `supersedes_id`, `timely_filing_days`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016160000` |  |
| 3 | `contract_id` | `uuid` | NOT NULL |  | `contract(id)` | `20261016160000` |  |
| 4 | `version_no` | `integer` | NOT NULL |  |  | `20261016160000` |  |
| 5 | `source_document_ids` | `uuid[]` | NOT NULL | `'{}'::uuid[]` |  | `20261016160000` |  |
| 6 | `effective_from` | `date` | NOT NULL |  |  | `20261016160000` |  |
| 7 | `effective_to` | `date` | null |  |  | `20261016160000` |  |
| 8 | `status` | `text` | NOT NULL | `'draft'::text` |  | `20261016160000` | one of draft, proposed, approved, signed_off, superseded |
| 9 | `approved_by` | `uuid` | null |  | `user(id)` | `20261016160000` |  |
| 10 | `approved_at` | `timestamp with time zone` | null |  |  | `20261016160000` |  |
| 11 | `signed_off_by` | `uuid` | null |  | `user(id)` | `20261016160000` |  |
| 12 | `signed_off_at` | `timestamp with time zone` | null |  |  | `20261016160000` |  |
| 13 | `supersedes_id` | `uuid` | null |  | `contract_version(id)` | `20261016160000` |  |
| 14 | `timely_filing_days` | `integer` | null |  |  | `20261016160000` |  |
| 15 | `dispute_window_days` | `integer` | null |  |  | `20261016160000` |  |
| 16 | `appeal_levels` | `jsonb` | NOT NULL | `'[]'::jsonb` |  | `20261016160000` |  |
| 17 | `notice_days` | `integer` | null |  |  | `20261016160000` | not in the dictionary |
| 18 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |
| 19 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |

Keys:
- Primary: (id)
- Unique `contract_version_number_once`: `UNIQUE (contract_id, version_no)`
- Foreign `contract_version_approved_by_fkey`: (approved_by) -> `user`(id), on delete no action
- Foreign `contract_version_contract_id_fkey`: (contract_id) -> `contract`(id), on delete no action
- Foreign `contract_version_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `contract_version_signed_off_by_fkey`: (signed_off_by) -> `user`(id), on delete no action
- Foreign `contract_version_supersedes_id_fkey`: (supersedes_id) -> `contract_version`(id), on delete no action

Indexes:
- `contract_version_by_contract`: `USING btree (practice_id, contract_id, effective_from)`
- `contract_version_by_predecessor`: `USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL)`
- `contract_version_windows_never_overlap`: `USING gist (uuid_half(contract_id, true), uuid_half(contract_id, false), daterange(effective_from, effective_to, '[)'::text)) WHERE ((status = 'signed_off'::text) OR ((supersedes_id IS NULL) AND (status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text]))))`

Policies (1):
- `contract_version_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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
- `contract_version_windows_never_overlap` (exclusion): `EXCLUDE USING gist (uuid_half(contract_id, true) WITH &&, uuid_half(contract_id, false) WITH &&, daterange(effective_from, effective_to, '[)'::text) WITH &&) WHERE (status = 'signed_off'::text OR supersedes_id IS NULL AND (status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text])))`

Invariants enforced by triggers:
- `contract_version_retired_by_signed_successor`: `AFTER UPDATE ON contract_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((old.status = ANY (ARRAY['approved'::text, 'signed_off'::text])) AND (new.status = 'superseded'::text OR new.effective_to IS DISTINCT FROM old.effective_to)) EXECUTE FUNCTION contract_version_retired_by_signed_successor()`
  - "a contract version is closed or superseded only by the sign-off of its successor"
- `contract_version_rules`: `BEFORE INSERT OR UPDATE ON contract_version FOR EACH ROW EXECUTE FUNCTION contract_version_rules()`
  - "a contract version starts as a draft"
  - "a contract version belongs to a contract of the same practice"
  - "a contract version's contract and number never change"
  - "a draft is approved by moving it to approved"
  - "a proposal carries at least one rate record"
  - "only a contract specialist approves a contract version"
  - "an approval records the approving specialist and the time"
  - "a version is approved as it stands; edit it first, then approve it"
  - "an approved version names the documents it is abstracted from"
  - "a version is approved once each of its rate records is verified, and it has at least one"
  - "every rate record's evidence is a document of its version"
  - "a contract version moves draft, proposed, approved, signed off, superseded, in that order"
  - "a version's documents are clean contract, exhibit or payer-letter documents of its practice, each named once"
  - "only a practice administrator or billing manager signs off a contract version"
  - "a sign-off records the signing user and the time and changes nothing else"
  - "the version a successor names is an approved or signed-off version of the same contract"
  - "only a successor's sign-off retires a contract version"
  - "a signed-off version never changes: an amendment closes its window at the amendment's start, and a correction supersedes it"
  - "an approved or signed-off contract version never changes; supersede it with a new version"
  - "a successor names an approved or signed-off version of the same contract"

Maintains `updated_at`: `contract_version_updated_at`.

### Table `rate_record`

<a id="table-rate-record"></a>

- Class: PHI (registered); registry policy `rate_record_tenant`, registered by `20261016160000_contracts_and_mapping`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Payers, contracts and rates (PHI-adjacent; confidential): A pricing term
- Created by `20261016160000_contracts_and_mapping` (ADR 0013, ADR 0017, ADR 0019, ADR 0028)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols), DELETE
- Column grant: `tp_app` INSERT (`contract_version_id`, `evidence`, `flags`, `id`, `method`, `parameters`, `practice_id`, `proposed_by`, `rounding`, `scope`)
- Column grant: `tp_app` UPDATE (`evidence`, `flags`, `method`, `parameters`, `rounding`, `scope`, `verified_at`, `verified_by`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016160000` |  |
| 3 | `contract_version_id` | `uuid` | NOT NULL |  | `contract_version(id)` | `20261016160000` |  |
| 4 | `scope` | `jsonb` | NOT NULL |  |  | `20261016160000` |  |
| 5 | `method` | `text` | NOT NULL |  |  | `20261016160000` | one of FIXED_SCHEDULE, PERCENT_OF_MEDICARE, LESSER_OF, PER_VISIT, UNSUPPORTED |
| 6 | `parameters` | `jsonb` | NOT NULL |  |  | `20261016160000` |  |
| 7 | `flags` | `jsonb` | NOT NULL |  |  | `20261016160000` |  |
| 8 | `rounding` | `text` | null |  |  | `20261016160000` | one of HALF_UP_CENT, HALF_EVEN_CENT, TRUNCATE |
| 9 | `evidence` | `jsonb` | NOT NULL | `'{}'::jsonb` |  | `20261016160000` |  |
| 10 | `proposed_by` | `text` | NOT NULL |  |  | `20261016160000` | one of specialist, model |
| 11 | `verified_by` | `uuid` | null |  | `user(id)` | `20261016160000` |  |
| 12 | `verified_at` | `timestamp with time zone` | null |  |  | `20261016160000` |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |

Keys:
- Primary: (id)
- Foreign `rate_record_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id), on delete no action
- Foreign `rate_record_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `rate_record_verified_by_fkey`: (verified_by) -> `user`(id), on delete no action

Indexes:
- `rate_record_by_version`: `USING btree (practice_id, contract_version_id)`

Policies (1):
- `rate_record_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `rate_record_evidence_check`: `CHECK (jsonb_typeof(evidence) = 'object'::text)`
- `rate_record_flags_check`: `CHECK (jsonb_typeof(flags) = 'object'::text)`
- `rate_record_method_check`: `CHECK (method = ANY (ARRAY['FIXED_SCHEDULE'::text, 'PERCENT_OF_MEDICARE'::text, 'LESSER_OF'::text, 'PER_VISIT'::text, 'UNSUPPORTED'::text]))`
- `rate_record_parameters_check`: `CHECK (jsonb_typeof(parameters) = 'object'::text)`
- `rate_record_proposed_by_check`: `CHECK (proposed_by = ANY (ARRAY['specialist'::text, 'model'::text]))`
- `rate_record_rounding_check`: `CHECK (rounding = ANY (ARRAY['HALF_UP_CENT'::text, 'HALF_EVEN_CENT'::text, 'TRUNCATE'::text]))`
- `rate_record_scope_check`: `CHECK (jsonb_typeof(scope) = 'object'::text)`
- `rate_record_verification_recorded`: `CHECK ((verified_by IS NULL) = (verified_at IS NULL))`
- `rate_record_verified_with_evidence`: `CHECK (verified_by IS NULL OR rate_record_evidence_complete(evidence))`

Invariants enforced by triggers:
- `rate_record_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON rate_record FOR EACH ROW EXECUTE FUNCTION rate_record_rules()`
  - "a rate record's version and origin never change"
  - "a rate record belongs to a contract version of the same practice"
  - "the rate records of an approved or signed-off version never change; supersede the version"
  - "evidence.approved_fields is an object of field approvals"
  - "a rate record is verified after it is written, field by field"
  - "a field approval names one of the rate record's fields"
  - "only a contract specialist approves a rate record's fields"
  - "a field approval records the approving specialist and the time"
  - "only a contract specialist verifies a rate record"
  - "a verification records the verifying specialist and the time"
  - "a rate record is verified once each of its fields is approved"
  - "a rate record cannot be approved without evidence naming a document, a page, a quote and a hash"
  - "a rate record's evidence is a document of its version"
  - "a verification is recorded once"

Maintains `updated_at`: `rate_record_updated_at`.

### Table `contract_calendar_event`

<a id="table-contract-calendar-event"></a>

- Class: PHI (registered); registry policy `contract_calendar_event_tenant`, registered by `20261016160000_contracts_and_mapping`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Payers, contracts and rates (PHI-adjacent; confidential): Dates to act on
- Created by `20261016160000_contracts_and_mapping` (ADR 0013, ADR 0017, ADR 0019, ADR 0028)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`contract_id`, `id`, `kind`, `note`, `on_date`, `practice_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016160000` |  |
| 3 | `contract_id` | `uuid` | NOT NULL |  | `contract(id)` | `20261016160000` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | `20261016160000` | one of anniversary, notice_deadline, fee_schedule_year, amendment |
| 5 | `on_date` | `date` | NOT NULL |  |  | `20261016160000` |  |
| 6 | `note` | `text` | null |  |  | `20261016160000` |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016160000` |  |

Keys:
- Primary: (id)
- Unique `contract_calendar_event_once`: `UNIQUE (contract_id, kind, on_date)`
- Foreign `contract_calendar_event_contract_id_fkey`: (contract_id) -> `contract`(id), on delete no action
- Foreign `contract_calendar_event_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `contract_calendar_event_by_date`: `USING btree (practice_id, on_date)`

Policies (2):
- `contract_calendar_event_by_sign_off`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `app_actor_permitted(practice_id, 'contract.sign_off'::text)`
- `contract_calendar_event_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `contract_calendar_event_kind_check`: `CHECK (kind = ANY (ARRAY['anniversary'::text, 'notice_deadline'::text, 'fee_schedule_year'::text, 'amendment'::text]))`
- `contract_calendar_event_note_check`: `CHECK (btrim(note) <> ''::text AND char_length(note) <= 500)`

Invariants enforced by triggers:
- `contract_calendar_event_rules`: `BEFORE INSERT OR UPDATE ON contract_calendar_event FOR EACH ROW EXECUTE FUNCTION contract_calendar_event_rules()`
  - "a calendar event never changes; signing off a new version derives new events"
  - "a calendar event belongs to a contract of the same practice"

Maintains `updated_at`: `contract_calendar_event_updated_at`.

### Table `contract_question`

<a id="table-contract-question"></a>

- Class: PHI (registered); registry policy `contract_question_tenant`, registered by `20261016200000_contract_questions_and_queue`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261016200000_contract_questions_and_queue` (ADR 0028, ADR 0030)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`asked_by`, `contract_id`, `contract_version_id`, `id`, `practice_id`, `question`, `source_document_id`, `topic`)
- Column grant: `tp_app` UPDATE (`answer`, `closed_at`, `closed_by`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016200000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016200000` |  |
| 3 | `contract_id` | `uuid` | NOT NULL |  | `contract(id)` | `20261016200000` |  |
| 4 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` | `20261016200000` |  |
| 5 | `source_document_id` | `uuid` | null |  | `source_document(id)` | `20261016200000` |  |
| 6 | `topic` | `text` | NOT NULL |  |  | `20261016200000` | one of missing_pages, missing_schedule, undefined_method, scope, timed_units, windows, other |
| 7 | `question` | `text` | NOT NULL |  |  | `20261016200000` | encrypted (enc:v1) |
| 8 | `asked_by` | `uuid` | NOT NULL |  | `user(id)` | `20261016200000` |  |
| 9 | `status` | `text` | NOT NULL | `'open'::text` |  | `20261016200000` | one of open, answered, withdrawn |
| 10 | `answer` | `text` | null |  |  | `20261016200000` | encrypted (enc:v1) |
| 11 | `closed_by` | `uuid` | null |  | `user(id)` | `20261016200000` |  |
| 12 | `closed_at` | `timestamp with time zone` | null |  |  | `20261016200000` |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016200000` |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016200000` |  |

Keys:
- Primary: (id)
- Foreign `contract_question_asked_by_fkey`: (asked_by) -> `user`(id), on delete no action
- Foreign `contract_question_closed_by_fkey`: (closed_by) -> `user`(id), on delete no action
- Foreign `contract_question_contract_id_fkey`: (contract_id) -> `contract`(id), on delete no action
- Foreign `contract_question_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id), on delete no action
- Foreign `contract_question_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `contract_question_source_document_id_fkey`: (source_document_id) -> `source_document`(id), on delete no action

Indexes:
- `contract_question_by_contract`: `USING btree (practice_id, contract_id, status)`
- `contract_question_open`: `USING btree (practice_id, created_at) WHERE (status = 'open'::text)`

Policies (2):
- `contract_question_asked_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(asked_by = app_actor_id())`
- `contract_question_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `contract_question_answer_check`: `CHECK (answer ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `contract_question_answered_with_answer`: `CHECK ((status = 'answered'::text) = (answer IS NOT NULL))`
- `contract_question_closing_recorded`: `CHECK ((status = 'open'::text) = (closed_by IS NULL) AND (closed_by IS NULL) = (closed_at IS NULL))`
- `contract_question_question_check`: `CHECK (question ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `contract_question_status_check`: `CHECK (status = ANY (ARRAY['open'::text, 'answered'::text, 'withdrawn'::text]))`
- `contract_question_topic_check`: `CHECK (topic = ANY (ARRAY['missing_pages'::text, 'missing_schedule'::text, 'undefined_method'::text, 'scope'::text, 'timed_units'::text, 'windows'::text, 'other'::text]))`

Invariants enforced by triggers:
- `contract_question_rules`: `BEFORE INSERT OR UPDATE ON contract_question FOR EACH ROW EXECUTE FUNCTION contract_question_rules()`
  - "a question is asked open, without an answer"
  - "a question is about a contract of the same practice"
  - "a question names a version of its contract"
  - "a question names a contract, exhibit or payer-letter document of the same practice"
  - "a question never changes; it is answered or withdrawn"
  - "an answered or withdrawn question never changes"
  - "a question changes only when it is answered or withdrawn"
  - "closing a question records who closed it and when"

Maintains `updated_at`: `contract_question_updated_at`.

## 7. Global content

<a id="area-content"></a>

Numbered rule releases and their records (fee schedule, adjustments, code lists, dispute windows), and the withdrawal of a release. No practice_id; the application role reads only.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`rule_release`](#table-rule-release) | global (no practice_id, no RLS) | no / no | 0 | SELECT | `20261015120000_rule_content` | Numbered release |
| [`rule_record`](#table-rule-record) | global (no practice_id, no RLS) | no / no | 0 | SELECT | `20261015120000_rule_content` | One record |
| [`rule_release_withdrawal`](#table-rule-release-withdrawal) | global (no practice_id, no RLS) | no / no | 0 | SELECT | `20261019150000_reruns_and_release_withdrawal` | not in the Data dictionary |

### Table `rule_release`

<a id="table-rule-release"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: Global content (no practice_id; read-only to the application role): Numbered release
- Created by `20261015120000_rule_content`
- Primary key: `id`
- Privileges: `tp_app` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015120000` |  |
| 2 | `release_no` | `integer` | NOT NULL |  |  | `20261015120000` |  |
| 3 | `published_at` | `timestamp with time zone` | null |  |  | `20261015120000` |  |
| 4 | `manifest_sha256` | `text` | NOT NULL |  |  | `20261015120000` |  |
| 5 | `notes` | `text` | NOT NULL | `''::text` |  | `20261015120000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015120000` |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015120000` |  |

Keys:
- Primary: (id)
- Unique `rule_release_release_no_key`: `UNIQUE (release_no)`

Policies (0):
- none

Invariants enforced by constraints:
- `rule_release_manifest_sha256_check`: `CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `rule_release_release_no_check`: `CHECK (release_no > 0)`

Invariants enforced by triggers:
- `rule_release_immutable`: `BEFORE DELETE OR UPDATE ON rule_release FOR EACH ROW EXECUTE FUNCTION rule_release_immutable()`
  - "rule_release % is immutable: a published release never changes; load a new release instead"
- `rule_release_no_truncate`: `BEFORE TRUNCATE ON rule_release FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()`
  - "% cannot be truncated: rule releases are immutable"

### Table `rule_record`

<a id="table-rule-record"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: Global content (no practice_id; read-only to the application role): One record
- Created by `20261015120000_rule_content`
- Primary key: `id`
- Privileges: `tp_app` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015120000` |  |
| 2 | `release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` | `20261015120000` |  |
| 3 | `record_type` | `text` | NOT NULL |  |  | `20261015120000` | one of pfs_rvu, pfs_gpci, conversion_factor, mppr_rate, therapy_threshold, assistant_modifier, sequestration, ncci_ptp, ncci_mue, carc, rarc, claim_status_code, state_prompt_pay, dispute_window, locality_map, denial_category |
| 4 | `key` | `jsonb` | NOT NULL |  |  | `20261015120000` |  |
| 5 | `value` | `jsonb` | NOT NULL |  |  | `20261015120000` |  |
| 6 | `effective_from` | `date` | NOT NULL |  |  | `20261015120000` |  |
| 7 | `effective_to` | `date` | null |  |  | `20261015120000` |  |
| 8 | `source` | `jsonb` | NOT NULL |  |  | `20261015120000` |  |
| 9 | `verification` | `text` | NOT NULL |  |  | `20261015120000` | one of L1, L2, L3 |
| 10 | `sha256` | `text` | NOT NULL |  |  | `20261015120000` |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015120000` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015120000` |  |

Keys:
- Primary: (id)
- Unique index `rule_record_identity`: `USING btree (release_no, record_type, key, effective_from)`
- Foreign `rule_record_release_no_fkey`: (release_no) -> `rule_release`(release_no), on delete no action

Indexes:
- `rule_record_by_type`: `USING btree (release_no, record_type)`

Policies (0):
- none

Invariants enforced by constraints:
- `rule_record_check`: `CHECK (effective_to IS NULL OR effective_to >= effective_from)`
- `rule_record_key_check`: `CHECK (jsonb_typeof(key) = 'object'::text)`
- `rule_record_record_type_check`: `CHECK (record_type = ANY (ARRAY['pfs_rvu'::text, 'pfs_gpci'::text, 'conversion_factor'::text, 'mppr_rate'::text, 'therapy_threshold'::text, 'assistant_modifier'::text, 'sequestration'::text, 'ncci_ptp'::text, 'ncci_mue'::text, 'carc'::text, 'rarc'::text, 'claim_status_code'::text, 'state_prompt_pay'::text, 'dispute_window'::text, 'locality_map'::text, 'denial_category'::text]))`
- `rule_record_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `rule_record_source_check`: `CHECK (jsonb_typeof(source) = 'object'::text)`
- `rule_record_value_check`: `CHECK (jsonb_typeof(value) = 'object'::text)`
- `rule_record_verification_check`: `CHECK (verification = ANY (ARRAY['L1'::text, 'L2'::text, 'L3'::text]))`

Invariants enforced by triggers:
- `rule_record_immutable`: `BEFORE INSERT OR DELETE OR UPDATE ON rule_record FOR EACH ROW EXECUTE FUNCTION rule_record_immutable()`
  - "rule_release % is published: no record can be added to it"
  - "rule_record rows are immutable: a published release never changes; load a new release instead"
- `rule_record_no_truncate`: `BEFORE TRUNCATE ON rule_record FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()`
  - "% cannot be truncated: rule releases are immutable"

### Table `rule_release_withdrawal`

<a id="table-rule-release-withdrawal"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261019150000_reruns_and_release_withdrawal` (ADR 0037)
- Primary key: `release_no`
- Privileges: `tp_app` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` | `20261019150000` |  |
| 2 | `reinstated_release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` | `20261019150000` |  |
| 3 | `reason` | `text` | NOT NULL |  |  | `20261019150000` |  |
| 4 | `withdrawn_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019150000` |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019150000` |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019150000` |  |

Keys:
- Primary: (release_no)
- Foreign `rule_release_withdrawal_reinstated_release_no_fkey`: (reinstated_release_no) -> `rule_release`(release_no), on delete no action
- Foreign `rule_release_withdrawal_release_no_fkey`: (release_no) -> `rule_release`(release_no), on delete no action

Policies (0):
- none

Invariants enforced by constraints:
- `rule_release_withdrawal_reason_check`: `CHECK (reason ~ '^[ -~]+$'::text AND length(reason) >= 8 AND length(reason) <= 500)`
- `rule_release_withdrawal_reinstates_earlier`: `CHECK (reinstated_release_no < release_no)`

Invariants enforced by triggers:
- `rule_release_withdrawal_no_truncate`: `BEFORE TRUNCATE ON rule_release_withdrawal FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate()`
  - "% cannot be truncated: rule releases are immutable"
- `rule_release_withdrawal_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON rule_release_withdrawal FOR EACH ROW EXECUTE FUNCTION rule_release_withdrawal_rules()`
  - "a rule release withdrawal never changes; a correction is a new release"
  - "only the rule release in force is withdrawn"
  - "a withdrawal reinstates the newest published release before the one withdrawn"
  - "a withdrawal records the time it was made"

## 8. Pricing, triage and cases

<a id="area-pricing"></a>

Pricing runs and their immutable priced lines, anomaly cohorts, the stage of each line, cases and their lines and activity, the audit report and its downloads, and the coverage report and monthly summary.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`pricing_run`](#table-pricing-run) | PHI (registered) | yes / yes | 4 | SELECT, INSERT(cols), UPDATE(cols) | `20261018090000_pricing_runs` | A run |
| [`priced_line`](#table-priced-line) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261018090000_pricing_runs` | Per run and line |
| [`anomaly`](#table-anomaly) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261019160000_triage_cases_and_audit_reports` | Investigatory cohort |
| [`line_status`](#table-line-status) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261019160000_triage_cases_and_audit_reports` | Stage per line |
| [`case`](#table-case) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261019160000_triage_cases_and_audit_reports` | A payer pattern to pursue |
| [`case_line`](#table-case-line) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols), UPDATE(cols) | `20261019160000_triage_cases_and_audit_reports` | Membership |
| [`case_activity`](#table-case-activity) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261024110000_case_workbench` | not in the Data dictionary |
| [`audit_report`](#table-audit-report) | PHI (registered) | yes / yes | 3 | SELECT, INSERT(cols), UPDATE(cols) | `20261019160000_triage_cases_and_audit_reports` | not in the Data dictionary |
| [`audit_report_download`](#table-audit-report-download) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261019160000_triage_cases_and_audit_reports` | not in the Data dictionary |
| [`report_document`](#table-report-document) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols), UPDATE(cols) | `20261025090000_report_documents_and_export_history` | not in the Data dictionary |

### Table `pricing_run`

<a id="table-pricing-run"></a>

- Class: PHI (registered); registry policy `pricing_run_tenant`, registered by `20261018090000_pricing_runs`, qualifies: yes
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): A run
- Created by `20261018090000_pricing_runs` (ADR 0029, ADR 0035); its DDL, policies or trigger functions changed by `20261019150000_reruns_and_release_withdrawal`, `20261020090000_monitoring_digests_notifications`, `20261022090000_review_guards_visit_shortfalls_and_practice_settings`, `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`created_by`, `created_by_job_id`, `engine_version`, `id`, `lines_loaded_by`, `period_from`, `period_to`, `practice_id`, `release_no`, `rerun_of_id`)
- Column grant: `tp_app` UPDATE (`accepted_at`, `accepted_by`, `completed_at`, `coverage`, `failure_code`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261018090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261018090000` |  |
| 3 | `period_from` | `date` | NOT NULL |  |  | `20261018090000` |  |
| 4 | `period_to` | `date` | NOT NULL |  |  | `20261018090000` |  |
| 5 | `release_no` | `integer` | NOT NULL |  | `rule_release(release_no)` | `20261018090000` |  |
| 6 | `engine_version` | `text` | NOT NULL |  |  | `20261018090000` |  |
| 7 | `created_by` | `uuid` | null |  | `user(id)` | `20261018090000` |  |
| 8 | `status` | `text` | NOT NULL | `'queued'::text` |  | `20261018090000` | one of queued, running, complete, failed |
| 9 | `coverage` | `jsonb` | null |  |  | `20261018090000` |  |
| 10 | `failure_code` | `text` | null |  |  | `20261018090000` | not in the dictionary |
| 11 | `completed_at` | `timestamp with time zone` | null |  |  | `20261018090000` |  |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261018090000` |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261018090000` |  |
| 14 | `rerun_of_id` | `uuid` | null |  | `pricing_run(id)` | `20261019150000` | not in the dictionary |
| 15 | `lines_loaded_by` | `timestamp with time zone` | null |  |  | `20261019150000` | not in the dictionary |
| 16 | `accepted_by` | `uuid` | null |  | `user(id)` | `20261019150000` | not in the dictionary |
| 17 | `accepted_at` | `timestamp with time zone` | null |  |  | `20261019150000` | not in the dictionary |
| 18 | `created_by_job_id` | `uuid` | null |  |  | `20261020090000` | not in the dictionary |

Keys:
- Primary: (id)
- Foreign `pricing_run_accepted_by_fkey`: (accepted_by) -> `user`(id), on delete no action
- Foreign `pricing_run_created_by_fkey`: (created_by) -> `user`(id), on delete no action
- Foreign `pricing_run_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `pricing_run_release_no_fkey`: (release_no) -> `rule_release`(release_no), on delete no action
- Foreign `pricing_run_rerun_of_id_fkey`: (rerun_of_id) -> `pricing_run`(id), on delete no action

Indexes:
- `pricing_run_by_period`: `USING btree (practice_id, period_from, period_to)`
- `pricing_run_by_practice`: `USING btree (practice_id, created_at DESC, id)`
- `pricing_run_complete_by_practice`: `USING btree (practice_id, completed_at DESC) WHERE (status = 'complete'::text)`
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

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `pricing_run_no_truncate`: `BEFORE TRUNCATE ON pricing_run FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate()`
  - "% cannot be truncated: pricing runs and their lines are kept as they were priced"
- `pricing_run_refused_while_suspended`: `BEFORE INSERT ON pricing_run FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()`
  - "%"
- `pricing_run_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON pricing_run FOR EACH ROW EXECUTE FUNCTION pricing_run_rules()`
  - "a pricing run is never deleted"
  - "a pricing run starts queued"
  - "rule-release mismatch: a pricing run pins the newest published rule release"
  - "a re-run prices a complete run of its own practice again"
  - "a re-run prices the period and the lines of the run it prices again"
  - "a pricing run's practice, period, release, engine, creator and the run it prices again never change"
  - "a re-run is accepted by the person acting, when they accept it"
  - "a re-run pinned to a withdrawn rule release is never accepted; re-run it under the release in force"
  - "a pricing run never changes once it is complete or failed; a new release or mapping means a new run"
  - "only a complete re-run is accepted"
  - "an open pricing run records its coverage when it completes and its failure when it fails"
  - "a pricing run's completion records the time it completed"
  - "a complete pricing run's coverage counts exactly the lines it priced"
  - "a failed pricing run holds no priced lines"
  - "a pricing run moves queued, running, then complete or failed"

Maintains `updated_at`: `pricing_run_updated_at`.

### Table `priced_line`

<a id="table-priced-line"></a>

- Class: PHI (registered); registry policy `priced_line_tenant`, registered by `20261018090000_pricing_runs`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): Per run and line
- Created by `20261018090000_pricing_runs` (ADR 0029, ADR 0035)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`adjustments_applied`, `contract_version_id`, `expected_allowed_cents`, `expected_unrounded`, `id`, `mapping_id`, `method`, `observed_allowed_cents`, `practice_id`, `pricing_run_id`, `rate_record_id`, `service_line_id`, `trace`, `unpriced_reason`, `variance_cents`, `window_ends_on`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261018090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261018090000` |  |
| 3 | `pricing_run_id` | `uuid` | NOT NULL |  | `pricing_run(id)` | `20261018090000` |  |
| 4 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` | `20261018090000` |  |
| 5 | `mapping_id` | `uuid` | null |  | `payer_plan_mapping(id)` | `20261018090000` |  |
| 6 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` | `20261018090000` |  |
| 7 | `rate_record_id` | `uuid` | null |  | `rate_record(id)` | `20261018090000` |  |
| 8 | `method` | `text` | null |  |  | `20261018090000` | one of FIXED_SCHEDULE, PERCENT_OF_MEDICARE, LESSER_OF, PER_VISIT, UNSUPPORTED |
| 9 | `expected_allowed_cents` | `bigint` | null |  |  | `20261018090000` |  |
| 10 | `expected_unrounded` | `numeric` | null |  |  | `20261018090000` |  |
| 11 | `observed_allowed_cents` | `bigint` | NOT NULL |  |  | `20261018090000` |  |
| 12 | `variance_cents` | `bigint` | null |  |  | `20261018090000` |  |
| 13 | `unpriced_reason` | `text` | null |  |  | `20261018090000` | one of NO_AGREEMENT, NO_MAPPING, AMBIGUOUS_RATE, NO_RATE_FOR_CODE, NO_PFS_VALUE, UNSUPPORTED_METHOD, SECONDARY_PAYER, MUE_EXCEEDED, UNITS_RULE_UNKNOWN, DATE_OUTSIDE_VERSIONS, REVERSED_CLAIM, ENGINE_ERROR |
| 14 | `adjustments_applied` | `jsonb` | NOT NULL | `'[]'::jsonb` |  | `20261018090000` |  |
| 15 | `window_ends_on` | `date` | null |  |  | `20261018090000` |  |
| 16 | `trace` | `jsonb` | NOT NULL |  |  | `20261018090000` |  |
| 17 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261018090000` |  |
| 18 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261018090000` |  |

Keys:
- Primary: (id)
- Unique `priced_line_once`: `UNIQUE (pricing_run_id, service_line_id)`
- Foreign `priced_line_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id), on delete no action
- Foreign `priced_line_mapping_id_fkey`: (mapping_id) -> `payer_plan_mapping`(id), on delete no action
- Foreign `priced_line_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `priced_line_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id), on delete no action
- Foreign `priced_line_rate_record_id_fkey`: (rate_record_id) -> `rate_record`(id), on delete no action
- Foreign `priced_line_service_line_id_fkey`: (service_line_id) -> `service_line`(id), on delete no action

Indexes:
- `priced_line_by_reason`: `USING btree (pricing_run_id, unpriced_reason)`
- `priced_line_by_service_line`: `USING btree (practice_id, service_line_id)`
- `priced_line_underpaid`: `USING btree (practice_id, variance_cents DESC) WHERE (variance_cents > 0)`

Policies (1):
- `priced_line_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `priced_line_adjustments_applied_check`: `CHECK (jsonb_typeof(adjustments_applied) = 'array'::text)`
- `priced_line_method_check`: `CHECK (method = ANY (ARRAY['FIXED_SCHEDULE'::text, 'PERCENT_OF_MEDICARE'::text, 'LESSER_OF'::text, 'PER_VISIT'::text, 'UNSUPPORTED'::text]))`
- `priced_line_priced_amounts`: `CHECK (expected_allowed_cents IS NULL OR expected_allowed_cents >= 0 AND expected_unrounded IS NOT NULL AND abs(expected_unrounded - expected_allowed_cents::numeric) < 1::numeric AND variance_cents IS NOT NULL AND variance_cents = (expected_allowed_cents - observed_allowed_cents) AND method IS NOT NULL)`
- `priced_line_priced_or_unpriced`: `CHECK ((unpriced_reason IS NULL) = (expected_allowed_cents IS NOT NULL))`
- `priced_line_rate_names_its_version`: `CHECK (rate_record_id IS NULL OR contract_version_id IS NOT NULL)`
- `priced_line_trace_check`: `CHECK (jsonb_typeof(trace) = 'object'::text)`
- `priced_line_unpriced_amounts`: `CHECK (expected_allowed_cents IS NOT NULL OR expected_unrounded IS NULL AND variance_cents IS NULL AND window_ends_on IS NULL AND adjustments_applied = '[]'::jsonb)`
- `priced_line_unpriced_reason_check`: `CHECK (unpriced_reason = ANY (ARRAY['NO_AGREEMENT'::text, 'NO_MAPPING'::text, 'AMBIGUOUS_RATE'::text, 'NO_RATE_FOR_CODE'::text, 'NO_PFS_VALUE'::text, 'UNSUPPORTED_METHOD'::text, 'SECONDARY_PAYER'::text, 'MUE_EXCEEDED'::text, 'UNITS_RULE_UNKNOWN'::text, 'DATE_OUTSIDE_VERSIONS'::text, 'REVERSED_CLAIM'::text, 'ENGINE_ERROR'::text]))`
- `priced_line_version_names_its_mapping`: `CHECK (contract_version_id IS NULL OR mapping_id IS NOT NULL)`

Invariants enforced by triggers:
- `priced_line_immutable`: `BEFORE DELETE OR UPDATE ON priced_line FOR EACH ROW EXECUTE FUNCTION priced_line_immutable()`
  - "a priced line never changes; a new run prices the line again"
- `priced_line_no_truncate`: `BEFORE TRUNCATE ON priced_line FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate()`
  - "% cannot be truncated: pricing runs and their lines are kept as they were priced"
- `priced_line_rows_belong`: `AFTER INSERT ON priced_line REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION priced_line_rows_belong()`
  - "a priced line joins an open pricing run of its practice; a complete run never changes"
  - "a priced line prices a service line under a mapping, version and rate record of its own practice"

### Table `anomaly`

<a id="table-anomaly"></a>

- Class: PHI (registered); registry policy `anomaly_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): Investigatory cohort
- Created by `20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`cohort_key`, `cohort_size`, `id`, `line_ids`, `modal_allowed_cents`, `practice_id`, `pricing_run_id`, `stats`)
- Column grant: `tp_app` UPDATE (`reviewed_by`, `validation_requested_by`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261019160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261019160000` |  |
| 3 | `pricing_run_id` | `uuid` | NOT NULL |  | `pricing_run(id)` | `20261019160000` |  |
| 4 | `cohort_key` | `jsonb` | NOT NULL |  |  | `20261019160000` |  |
| 5 | `cohort_size` | `integer` | NOT NULL |  |  | `20261019160000` |  |
| 6 | `modal_allowed_cents` | `bigint` | NOT NULL |  |  | `20261019160000` |  |
| 7 | `stats` | `jsonb` | NOT NULL |  |  | `20261019160000` |  |
| 8 | `line_ids` | `uuid[]` | NOT NULL |  |  | `20261019160000` |  |
| 9 | `reviewed_by` | `uuid` | null |  | `user(id)` | `20261019160000` |  |
| 10 | `reviewed_at` | `timestamp with time zone` | null |  |  | `20261019160000` |  |
| 11 | `validation_requested_by` | `uuid` | null |  | `user(id)` | `20261019160000` | not in the dictionary |
| 12 | `validation_requested_at` | `timestamp with time zone` | null |  |  | `20261019160000` | not in the dictionary |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |

Keys:
- Primary: (id)
- Unique `anomaly_once`: `UNIQUE (pricing_run_id, cohort_key)`
- Foreign `anomaly_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `anomaly_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id), on delete no action
- Foreign `anomaly_reviewed_by_fkey`: (reviewed_by) -> `user`(id), on delete no action
- Foreign `anomaly_validation_requested_by_fkey`: (validation_requested_by) -> `user`(id), on delete no action

Indexes:
- `anomaly_by_run`: `USING btree (practice_id, pricing_run_id)`

Policies (1):
- `anomaly_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `anomaly_check`: `CHECK (array_position(line_ids, NULL::uuid) IS NULL AND cardinality(line_ids) <= cohort_size)`
- `anomaly_cohort_key_check`: `CHECK (jsonb_typeof(cohort_key) = 'object'::text)`
- `anomaly_cohort_size_check`: `CHECK (cohort_size >= 1)`
- `anomaly_modal_allowed_cents_check`: `CHECK (modal_allowed_cents >= 0)`
- `anomaly_reviewed_together`: `CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))`
- `anomaly_stats_check`: `CHECK (jsonb_typeof(stats) = 'object'::text)`
- `anomaly_validation_together`: `CHECK ((validation_requested_by IS NULL) = (validation_requested_at IS NULL))`

Invariants enforced by triggers:
- `anomaly_belongs`: `AFTER INSERT ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_belongs()`
  - "an anomaly is of a pricing run of its practice"
- `anomaly_never_deleted`: `BEFORE DELETE ON anomaly FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()`
  - "% rows are never deleted: triage, cases and reports keep what they recorded"
- `anomaly_no_truncate`: `BEFORE TRUNCATE ON anomaly FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()`
  - "% cannot be truncated: triage, cases and reports keep what they recorded"
- `anomaly_rules`: `BEFORE INSERT OR UPDATE ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_rules()`
  - "an anomaly is recorded unreviewed"
  - "an anomaly's cohort and statistics never change"
  - "an anomaly is marked reviewed once, by a person who works anomalies, in their own name"
  - "an anomaly's review time is the time it was marked reviewed"
  - "an anomaly is converted to a validation request once, by a person who works anomalies, in their own name"
  - "an anomaly's validation request time is the time it was requested"

Maintains `updated_at`: `anomaly_updated_at`.

### Table `line_status`

<a id="table-line-status"></a>

- Class: PHI (registered); registry policy `line_status_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): Stage per line
- Created by `20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038); its DDL, policies or trigger functions changed by `20261022090000_review_guards_visit_shortfalls_and_practice_settings`, `20261023090000_packets_submissions_and_responses`, `20261023120000_recovery_ledger`, `20261027090000_packet_and_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`id`, `practice_id`, `priced_line_id`, `reason`, `reopened_from`, `service_line_id`, `set_by`, `stage`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261019160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261019160000` |  |
| 3 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` | `20261019160000` |  |
| 4 | `seq` | `bigint` | NOT NULL |  |  | `20261019160000` | generated always as identity; not in the dictionary |
| 5 | `stage` | `text` | NOT NULL |  |  | `20261019160000` | one of flagged, validated, actionable, payer_approved, recovered |
| 6 | `set_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 7 | `set_by` | `uuid` | null |  | `user(id)` | `20261019160000` |  |
| 8 | `reason` | `text` | null |  |  | `20261019160000` | encrypted (enc:v1) |
| 9 | `reopened_from` | `text` | null |  |  | `20261019160000` | one of flagged, validated, actionable, payer_approved, recovered |
| 10 | `priced_line_id` | `uuid` | null |  | `priced_line(id)` | `20261019160000` | not in the dictionary |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |

Keys:
- Primary: (id)
- Foreign `line_status_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `line_status_priced_line_id_fkey`: (priced_line_id) -> `priced_line`(id), on delete no action
- Foreign `line_status_service_line_id_fkey`: (service_line_id) -> `service_line`(id), on delete no action
- Foreign `line_status_set_by_fkey`: (set_by) -> `user`(id), on delete no action

Indexes:
- `line_status_by_line`: `USING btree (practice_id, service_line_id, seq DESC)`

Policies (2):
- `line_status_set_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK ` CASE     WHEN ( SELECT app_actor_is_person() AS app_actor_is_person) THEN ((NOT (set_by IS DISTINCT FROM app_actor_id())) AND (COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false) OR (COALESCE(app_actor_permitted(practice_id, 'ledger.adjust'::text), false) AND ((stage = ANY (ARRAY['payer_approved'::text, 'recovered'::text])) OR ((reopened_from = ANY (ARRAY['payer_approved'::text, 'recovered'::text])) AND (stage = COALESCE(ledger_line_stage(service_line_id), 'actionable'::text)))))))     ELSE (set_by IS NULL) END`
- `line_status_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `line_status_reason_check`: `CHECK (reason IS NULL OR btrim(reason) <> ''::text AND char_length(reason) <= 4000)`
- `line_status_reason_encrypted`: `CHECK (reason ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `line_status_reopen_says_why`: `CHECK ((reopened_from IS NULL) = (reason IS NULL))`
- `line_status_reopened_from_check`: `CHECK (reopened_from = ANY (ARRAY['flagged'::text, 'validated'::text, 'actionable'::text, 'payer_approved'::text, 'recovered'::text]))`
- `line_status_stage_check`: `CHECK (stage = ANY (ARRAY['flagged'::text, 'validated'::text, 'actionable'::text, 'payer_approved'::text, 'recovered'::text]))`

Invariants enforced by triggers:
- `line_status_belongs`: `AFTER INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_belongs()`
  - "a stage is set in its setter's own name"
  - "a stage is set on a service line of its practice"
  - "a stage is judged from a priced line of its own service line"
- `line_status_ledger_rules`: `BEFORE INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_ledger_rules()`
  - "the ledger holds no entries that put the line at %: nothing counts as recovered without a posted or deposited entry"
  - "the ledger moves a line back only to the stage its entries leave it at"
- `line_status_never_deleted`: `BEFORE DELETE ON line_status FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()`
  - "% rows are never deleted: triage, cases and reports keep what they recorded"
- `line_status_no_truncate`: `BEFORE TRUNCATE ON line_status FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()`
  - "% cannot be truncated: triage, cases and reports keep what they recorded"
- `line_status_refresh_cases`: `AFTER INSERT ON line_status REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION line_status_refresh_cases()`
- `line_status_rules`: `BEFORE INSERT OR UPDATE ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_rules()`
  - "a line's stage events never change; a reopen is a new event"
  - "line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason"
  - "a reopen names the stage the line is at"
  - "a reopen keeps the line at its stage or moves it back; moving forward is not a reopen"
  - "a reopen is a person's explicit action"

### Table `case`

<a id="table-case"></a>

- Class: PHI (registered); registry policy `case_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): A payer pattern to pursue
- Created by `20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038); its DDL, policies or trigger functions changed by `20261023090000_packets_submissions_and_responses`, `20261023120000_recovery_ledger`, `20261024110000_case_workbench`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`id`, `materiality_cents`, `pattern_key`, `payer_id`, `plan_id`, `practice_id`, `pursuit_cost_cents`, `rate_record_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261019160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261019160000` |  |
| 3 | `pattern_key` | `jsonb` | NOT NULL |  |  | `20261019160000` |  |
| 4 | `payer_id` | `uuid` | NOT NULL |  | `payer(id)` | `20261019160000` |  |
| 5 | `plan_id` | `uuid` | NOT NULL |  | `plan(id)` | `20261019160000` |  |
| 6 | `rate_record_id` | `uuid` | null |  | `rate_record(id)` | `20261019160000` |  |
| 7 | `owner_user_id` | `uuid` | null |  | `user(id)` | `20261019160000` |  |
| 8 | `state` | `text` | NOT NULL | `'open'::text` |  | `20261019160000` | one of open, submitted, awaiting_response, partially_resolved, resolved, closed_written_off |
| 9 | `deadline_on` | `date` | null |  |  | `20261019160000` |  |
| 10 | `materiality_cents` | `bigint` | NOT NULL |  |  | `20261019160000` |  |
| 11 | `pursuit_cost_cents` | `bigint` | null |  |  | `20261019160000` |  |
| 12 | `actionable_cents` | `bigint` | NOT NULL | `0` |  | `20261019160000` |  |
| 13 | `opened_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 14 | `closed_at` | `timestamp with time zone` | null |  |  | `20261019160000` |  |
| 15 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 16 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |

Keys:
- Primary: (id)
- Unique index `case_open_pattern`: `USING btree (practice_id, pattern_key) WHERE (state = 'open'::text)`
- Foreign `case_owner_user_id_fkey`: (owner_user_id) -> `user`(id), on delete no action
- Foreign `case_payer_id_fkey`: (payer_id) -> `payer`(id), on delete no action
- Foreign `case_plan_id_fkey`: (plan_id) -> `plan`(id), on delete no action
- Foreign `case_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `case_rate_record_id_fkey`: (rate_record_id) -> `rate_record`(id), on delete no action

Indexes:
- `case_by_state`: `USING btree (practice_id, state, deadline_on)`

Policies (2):
- `case_opened_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((NOT ( SELECT app_actor_is_person() AS app_actor_is_person)) OR COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false))`
- `case_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `case_actionable_cents_check`: `CHECK (actionable_cents >= 0)`
- `case_closed_when_closed`: `CHECK ((state = 'closed_written_off'::text) = (closed_at IS NOT NULL))`
- `case_materiality_cents_check`: `CHECK (materiality_cents >= 0)`
- `case_pattern_key_check`: `CHECK (jsonb_typeof(pattern_key) = 'object'::text)`
- `case_pursuit_cost_cents_check`: `CHECK (pursuit_cost_cents >= 0)`
- `case_state_check`: `CHECK (state = ANY (ARRAY['open'::text, 'submitted'::text, 'awaiting_response'::text, 'partially_resolved'::text, 'resolved'::text, 'closed_written_off'::text]))`

Invariants enforced by triggers:
- `case_belongs`: `AFTER INSERT ON "case" FOR EACH ROW EXECUTE FUNCTION case_belongs()`
  - "a case is of a plan of its payer and practice"
  - "a case's rate record is of its practice"
- `case_never_deleted`: `BEFORE DELETE ON "case" FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()`
  - "% rows are never deleted: triage, cases and reports keep what they recorded"
- `case_no_truncate`: `BEFORE TRUNCATE ON "case" FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()`
  - "% cannot be truncated: triage, cases and reports keep what they recorded"
- `case_rules`: `BEFORE INSERT OR UPDATE ON "case" FOR EACH ROW EXECUTE FUNCTION case_rules()`
  - "a case's pattern, payer, plan, rate record, materiality and pursuit estimate never change"

Maintains `updated_at`: `case_updated_at`.

### Table `case_line`

<a id="table-case-line"></a>

- Class: PHI (registered); registry policy `case_line_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): Membership
- Created by `20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038); its DDL, policies or trigger functions changed by `20261024110000_case_workbench`, `20261027090000_packet_and_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`case_id`, `id`, `practice_id`, `priced_line_id`, `service_line_id`, `written_off_reason`)
- Column grant: `tp_app` UPDATE (`reopen_reason`, `reopened_by`, `written_off_by`, `written_off_reason`, `written_off_text`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261019160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261019160000` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` | `20261019160000` |  |
| 4 | `service_line_id` | `uuid` | NOT NULL |  | `service_line(id)` | `20261019160000` |  |
| 5 | `priced_line_id` | `uuid` | NOT NULL |  | `priced_line(id)` | `20261019160000` |  |
| 6 | `actionable` | `boolean` | NOT NULL | `true` |  | `20261019160000` |  |
| 7 | `written_off_reason` | `text` | null |  |  | `20261019160000` | one of window_passed, payer_correct_on_review, not_worth_pursuit, duplicate, other |
| 8 | `written_off_text` | `text` | null |  |  | `20261019160000` | encrypted (enc:v1); not in the dictionary |
| 9 | `written_off_by` | `uuid` | null |  | `user(id)` | `20261019160000` |  |
| 10 | `written_off_at` | `timestamp with time zone` | null |  |  | `20261019160000` | not in the dictionary |
| 11 | `reopen_reason` | `text` | null |  |  | `20261019160000` | encrypted (enc:v1); not in the dictionary |
| 12 | `reopened_by` | `uuid` | null |  | `user(id)` | `20261019160000` | not in the dictionary |
| 13 | `reopened_at` | `timestamp with time zone` | null |  |  | `20261019160000` | not in the dictionary |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |

Keys:
- Primary: (id)
- Unique `case_line_once`: `UNIQUE (service_line_id)`
- Foreign `case_line_case_id_fkey`: (case_id) -> `case`(id), on delete no action
- Foreign `case_line_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `case_line_priced_line_id_fkey`: (priced_line_id) -> `priced_line`(id), on delete no action
- Foreign `case_line_reopened_by_fkey`: (reopened_by) -> `user`(id), on delete no action
- Foreign `case_line_service_line_id_fkey`: (service_line_id) -> `service_line`(id), on delete no action
- Foreign `case_line_written_off_by_fkey`: (written_off_by) -> `user`(id), on delete no action

Indexes:
- `case_line_by_case`: `USING btree (practice_id, case_id)`

Policies (2):
- `case_line_added_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `((NOT ( SELECT app_actor_is_person() AS app_actor_is_person)) OR COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false))`
- `case_line_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `case_line_belongs`: `AFTER INSERT ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_belongs()`
  - "a case line joins a case of its practice"
  - "a case line is a priced line of its own service line and practice"
  - "a case line joins its case written off only by triage, because its window has passed"
- `case_line_never_deleted`: `BEFORE DELETE ON case_line FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()`
  - "% rows are never deleted: triage, cases and reports keep what they recorded"
- `case_line_no_truncate`: `BEFORE TRUNCATE ON case_line FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()`
  - "% cannot be truncated: triage, cases and reports keep what they recorded"
- `case_line_refresh_inserted`: `AFTER INSERT ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases()`
- `case_line_refresh_updated`: `AFTER UPDATE ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases()`
- `case_line_rules`: `BEFORE INSERT OR UPDATE ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_rules()`
  - "a case line joins its case actionable, or struck through because its window passed"
  - "a case line's case, service line and priced line never change"
  - "triage writes off only a line whose window has passed; a person writes off in their own name"
  - "a line is written off by a person who works cases, in their own name"
  - "a write-off changes nothing of the line's last reopen"
  - "a reopen clears the whole write-off"
  - "a written-off line is reopened by a person who works cases, in their own name"
  - "a reopen says why, in its own words"
  - "a line past its window cannot be actionable, so it is not reopened"
  - "a case line changes only by a write-off or a reopen"

Maintains `updated_at`: `case_line_updated_at`.

### Table `case_activity`

<a id="table-case-activity"></a>

- Class: PHI (registered); registry policy `case_activity_tenant`, registered by `20261024110000_case_workbench`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261024110000_case_workbench` (ADR 0044)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`body`, `case_id`, `created_by`, `id`, `kind`, `owner_user_id`, `packet_version_id`, `practice_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261024110000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261024110000` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` | `20261024110000` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | `20261024110000` | one of note, assigned, approval_requested |
| 5 | `body` | `text` | null |  |  | `20261024110000` | encrypted (enc:v1) |
| 6 | `owner_user_id` | `uuid` | null |  | `user(id)` | `20261024110000` |  |
| 7 | `packet_version_id` | `uuid` | null |  | `packet_version(id)` | `20261024110000` |  |
| 8 | `created_by` | `uuid` | NOT NULL |  | `user(id)` | `20261024110000` |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261024110000` |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261024110000` |  |

Keys:
- Primary: (id)
- Foreign `case_activity_case_id_fkey`: (case_id) -> `case`(id), on delete no action
- Foreign `case_activity_created_by_fkey`: (created_by) -> `user`(id), on delete no action
- Foreign `case_activity_owner_user_id_fkey`: (owner_user_id) -> `user`(id), on delete no action
- Foreign `case_activity_packet_version_id_fkey`: (packet_version_id) -> `packet_version`(id), on delete no action
- Foreign `case_activity_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `case_activity_by_case`: `USING btree (practice_id, case_id, created_at)`

Policies (2):
- `case_activity_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
- `case_activity_written_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(created_by = app_actor_id())`

Invariants enforced by constraints:
- `case_activity_assignment_has_no_words`: `CHECK (kind <> 'assigned'::text OR body IS NULL)`
- `case_activity_body_check`: `CHECK (body ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `case_activity_kind_check`: `CHECK (kind = ANY (ARRAY['note'::text, 'assigned'::text, 'approval_requested'::text]))`
- `case_activity_note_says_something`: `CHECK (kind <> 'note'::text OR body IS NOT NULL)`
- `case_activity_owner_only_assigned`: `CHECK (owner_user_id IS NULL OR kind = 'assigned'::text)`
- `case_activity_request_names_its_version`: `CHECK ((kind = 'approval_requested'::text) = (packet_version_id IS NOT NULL))`

Invariants enforced by triggers:
- `case_activity_belongs`: `AFTER INSERT ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_belongs()`
  - "a case's activity is a person's, in their own name"
  - "notes and assignments are a case worker's; an approval request a packet drafter's"
  - "a case's activity is of a case of its practice"
  - "a case is assigned to a person who works the practice's cases now"
  - "approval is requested of a version of the case's packet"
  - "approval is requested of the packet's current version, unapproved, once the verifier passes it"
- `case_activity_no_truncate`: `BEFORE TRUNCATE ON case_activity FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()`
  - "% cannot be truncated: triage, cases and reports keep what they recorded"
- `case_activity_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON case_activity FOR EACH ROW EXECUTE FUNCTION case_activity_rules()`
  - "a case's activity never changes and is never deleted; a later note or assignment is a new row"
- `case_activity_sets_owner`: `AFTER INSERT ON case_activity FOR EACH ROW WHEN (new.kind = 'assigned'::text) EXECUTE FUNCTION case_activity_sets_owner()`

### Table `audit_report`

<a id="table-audit-report"></a>

- Class: PHI (registered); registry policy `audit_report_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`, qualifies: yes
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038); its DDL, policies or trigger functions changed by `20261021090000_run_diffs_and_runs_in_effect`, `20261022090000_review_guards_visit_shortfalls_and_practice_settings`, `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`id`, `practice_id`, `pricing_run_id`, `requested_by`)
- Column grant: `tp_app` UPDATE (`as_of`, `attestation`, `attested_by`, `content`, `csv_key`, `csv_sha256`, `failure_code`, `pdf_key`, `pdf_sha256`, `released_by`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261019160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261019160000` |  |
| 3 | `pricing_run_id` | `uuid` | NOT NULL |  | `pricing_run(id)` | `20261019160000` |  |
| 4 | `requested_by` | `uuid` | NOT NULL |  | `user(id)` | `20261019160000` |  |
| 5 | `status` | `text` | NOT NULL | `'queued'::text` |  | `20261019160000` | one of queued, ready, failed |
| 6 | `as_of` | `date` | null |  |  | `20261019160000` |  |
| 7 | `content` | `jsonb` | null |  |  | `20261019160000` |  |
| 8 | `pdf_key` | `text` | null |  |  | `20261019160000` |  |
| 9 | `pdf_sha256` | `text` | null |  |  | `20261019160000` |  |
| 10 | `csv_key` | `text` | null |  |  | `20261019160000` |  |
| 11 | `csv_sha256` | `text` | null |  |  | `20261019160000` |  |
| 12 | `generated_at` | `timestamp with time zone` | null |  |  | `20261019160000` |  |
| 13 | `failure_code` | `text` | null |  |  | `20261019160000` |  |
| 14 | `attested_by` | `uuid` | null |  | `user(id)` | `20261019160000` |  |
| 15 | `attested_at` | `timestamp with time zone` | null |  |  | `20261019160000` |  |
| 16 | `attestation` | `jsonb` | null |  |  | `20261019160000` |  |
| 17 | `released_by` | `uuid` | null |  | `user(id)` | `20261019160000` |  |
| 18 | `released_at` | `timestamp with time zone` | null |  |  | `20261019160000` |  |
| 19 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 20 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |

Keys:
- Primary: (id)
- Foreign `audit_report_attested_by_fkey`: (attested_by) -> `user`(id), on delete no action
- Foreign `audit_report_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `audit_report_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id), on delete no action
- Foreign `audit_report_released_by_fkey`: (released_by) -> `user`(id), on delete no action
- Foreign `audit_report_requested_by_fkey`: (requested_by) -> `user`(id), on delete no action

Indexes:
- `audit_report_by_practice`: `USING btree (practice_id, created_at DESC, id)`

Policies (3):
- `audit_report_requested_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(requested_by = app_actor_id())`
- `audit_report_requested_by_case_workers`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `COALESCE(app_actor_permitted(practice_id, 'case.work'::text), false)`
- `audit_report_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `audit_report_belongs`: `AFTER INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_belongs()`
  - "an audit report is of a pricing run of its practice"
  - "an audit report is of the pricing run in effect for its period: never a re-run nobody has accepted, nor a run since replaced"
- `audit_report_never_deleted`: `BEFORE DELETE ON audit_report FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()`
  - "% rows are never deleted: triage, cases and reports keep what they recorded"
- `audit_report_no_truncate`: `BEFORE TRUNCATE ON audit_report FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()`
  - "% cannot be truncated: triage, cases and reports keep what they recorded"
- `audit_report_refused_while_suspended`: `BEFORE INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()`
  - "%"
- `audit_report_rules`: `BEFORE INSERT OR UPDATE ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_rules()`
  - "an audit report is requested queued"
  - "an audit report's practice, run and requester never change"
  - "only the report job generates an audit report"
  - "an audit report is generated before it is attested or released"
  - "an audit report is generated only while its pricing run is the run in effect for its period"
  - "an audit report's numbers and files never change once generated; a new report is generated instead"
  - "a ready audit report is attested once"
  - "an audit report is attested by a reimbursement reviewer, in their own name"
  - "an attestation names the SHA-256 of the report's files it was signed over"
  - "an attestation's time is the time it was signed"
  - "an audit report is released once"
  - "an audit report cannot be released before a reimbursement reviewer signs its attestation"
  - "an audit report is released by a person who works cases, in their own name"
  - "a release's time is the time it was released"

Maintains `updated_at`: `audit_report_updated_at`.

### Table `audit_report_download`

<a id="table-audit-report-download"></a>

- Class: PHI (registered); registry policy `audit_report_download_tenant`, registered by `20261019160000_triage_cases_and_audit_reports`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`audit_report_id`, `downloaded_by`, `file`, `id`, `practice_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261019160000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261019160000` |  |
| 3 | `audit_report_id` | `uuid` | NOT NULL |  | `audit_report(id)` | `20261019160000` |  |
| 4 | `file` | `text` | NOT NULL |  |  | `20261019160000` | one of pdf, csv |
| 5 | `downloaded_by` | `uuid` | NOT NULL |  | `user(id)` | `20261019160000` |  |
| 6 | `downloaded_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261019160000` |  |

Keys:
- Primary: (id)
- Foreign `audit_report_download_audit_report_id_fkey`: (audit_report_id) -> `audit_report`(id), on delete no action
- Foreign `audit_report_download_downloaded_by_fkey`: (downloaded_by) -> `user`(id), on delete no action
- Foreign `audit_report_download_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `audit_report_download_by_report`: `USING btree (practice_id, audit_report_id, downloaded_at DESC)`

Policies (2):
- `audit_report_download_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(downloaded_by = app_actor_id())`
- `audit_report_download_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `audit_report_download_file_check`: `CHECK (file = ANY (ARRAY['pdf'::text, 'csv'::text]))`

Invariants enforced by triggers:
- `audit_report_download_belongs`: `AFTER INSERT ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_belongs()`
  - "a download is of a report of its practice"
- `audit_report_download_never_deleted`: `BEFORE DELETE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION triage_never_deleted()`
  - "% rows are never deleted: triage, cases and reports keep what they recorded"
- `audit_report_download_no_truncate`: `BEFORE TRUNCATE ON audit_report_download FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate()`
  - "% cannot be truncated: triage, cases and reports keep what they recorded"
- `audit_report_download_rules`: `BEFORE INSERT OR UPDATE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_rules()`
  - "a download record never changes"

### Table `report_document`

<a id="table-report-document"></a>

- Class: PHI (registered); registry policy `report_document_tenant`, registered by `20261025090000_report_documents_and_export_history`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261025090000_report_documents_and_export_history` (ADR 0040, ADR 0045); its DDL, policies or trigger functions changed by `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`content`, `id`, `kind`, `period`, `practice_id`, `pricing_run_id`, `requested_by`)
- Column grant: `tp_app` UPDATE (`failure_code`, `pdf_key`, `pdf_sha256`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261025090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261025090000` |  |
| 3 | `kind` | `text` | NOT NULL |  |  | `20261025090000` | one of coverage, monthly_summary |
| 4 | `period` | `text` | null |  |  | `20261025090000` |  |
| 5 | `pricing_run_id` | `uuid` | null |  | `pricing_run(id)` | `20261025090000` |  |
| 6 | `requested_by` | `uuid` | NOT NULL |  | `user(id)` | `20261025090000` |  |
| 7 | `content` | `jsonb` | NOT NULL |  |  | `20261025090000` |  |
| 8 | `status` | `text` | NOT NULL | `'queued'::text` |  | `20261025090000` | one of queued, ready, failed |
| 9 | `pdf_key` | `text` | null |  |  | `20261025090000` |  |
| 10 | `pdf_sha256` | `text` | null |  |  | `20261025090000` |  |
| 11 | `failure_code` | `text` | null |  |  | `20261025090000` |  |
| 12 | `generated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261025090000` |  |
| 13 | `printed_at` | `timestamp with time zone` | null |  |  | `20261025090000` |  |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261025090000` |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261025090000` |  |

Keys:
- Primary: (id)
- Foreign `report_document_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `report_document_pricing_run_id_fkey`: (pricing_run_id) -> `pricing_run`(id), on delete no action
- Foreign `report_document_requested_by_fkey`: (requested_by) -> `user`(id), on delete no action

Indexes:
- `report_document_by_practice`: `USING btree (practice_id, generated_at DESC, id)`

Policies (2):
- `report_document_requested_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(requested_by = app_actor_id())`
- `report_document_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `report_document_belongs`: `AFTER INSERT ON report_document FOR EACH ROW EXECUTE FUNCTION report_document_belongs()`
  - "a coverage report reads a pricing run of its practice"
- `report_document_no_truncate`: `BEFORE TRUNCATE ON report_document FOR EACH STATEMENT EXECUTE FUNCTION report_document_no_truncate()`
  - "report_document cannot be truncated: a generated report keeps its figures"
- `report_document_refused_while_suspended`: `BEFORE INSERT ON report_document FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()`
  - "%"
- `report_document_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON report_document FOR EACH ROW EXECUTE FUNCTION report_document_rules()`
  - "a report document keeps its figures; a new one is generated"
  - "a report document is printed after it is generated"
  - "a report document is generated by a person who works the practice's cases, in their own name"
  - "a report document keeps its figures; only its printed PDF, or the print's failure, is recorded, once"
  - "the print job records the printed PDF, in no one's name"
  - "a report document's PDF is stored under its own practice and document"
  - "a failed print records no PDF"

Maintains `updated_at`: `report_document_updated_at`.

## 9. Packets

<a id="area-packets"></a>

The dispute packet, its immutable verified versions (approval and export recorded on the version), the submissions a customer logs and the payer responses captured against them.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`packet`](#table-packet) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261023090000_packets_submissions_and_responses` | The dispute document |
| [`packet_version`](#table-packet-version) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols), UPDATE(cols) | `20261023090000_packets_submissions_and_responses` | Immutable version |
| [`submission`](#table-submission) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261023090000_packets_submissions_and_responses` | Sent by the customer |
| [`payer_response`](#table-payer-response) | PHI (registered) | yes / yes | 2 | SELECT, INSERT(cols) | `20261023090000_packets_submissions_and_responses` | Response captured |

### Table `packet`

<a id="table-packet"></a>

- Class: PHI (registered); registry policy `packet_tenant`, registered by `20261023090000_packets_submissions_and_responses`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): The dispute document
- Created by `20261023090000_packets_submissions_and_responses` (ADR 0041)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`case_id`, `id`, `practice_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023090000` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` | `20261023090000` |  |
| 4 | `current_version_id` | `uuid` | null |  | `packet_version(id)` | `20261023090000` |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |

Keys:
- Primary: (id)
- Unique `packet_once_per_case`: `UNIQUE (case_id)`
- Foreign `packet_case_id_fkey`: (case_id) -> `case`(id), on delete no action
- Foreign `packet_current_version_fk`: (current_version_id) -> `packet_version`(id), on delete no action
- Foreign `packet_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `packet_by_practice`: `USING btree (practice_id, case_id)`

Policies (1):
- `packet_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by triggers:
- `packet_belongs`: `AFTER INSERT ON packet FOR EACH ROW EXECUTE FUNCTION packet_belongs()`
  - "a packet is opened by a person who drafts packets"
  - "a packet is of a case of its practice that is not closed"
- `packet_never_deleted`: `BEFORE DELETE ON packet FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()`
  - "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `packet_no_truncate`: `BEFORE TRUNCATE ON packet FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()`
  - "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `packet_rules`: `BEFORE INSERT OR UPDATE ON packet FOR EACH ROW EXECUTE FUNCTION packet_rules()`
  - "a packet is opened with no version; writing one makes it current"
  - "a packet's case never changes"
  - "a packet's current version is the version written last"

Maintains `updated_at`: `packet_updated_at`.

### Table `packet_version`

<a id="table-packet-version"></a>

- Class: PHI (registered); registry policy `packet_version_tenant`, registered by `20261023090000_packets_submissions_and_responses`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): Immutable version
- Created by `20261023090000_packets_submissions_and_responses` (ADR 0041); its DDL, policies or trigger functions changed by `20261027090000_packet_and_ledger_review`, `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`content`, `content_sha256`, `drafted_by`, `id`, `narrative`, `packet_id`, `practice_id`, `verifier_passed`, `verifier_report`, `version_no`)
- Column grant: `tp_app` UPDATE (`approved_by`, `approved_sha256`, `export_csv_key`, `export_csv_sha256`, `export_pdf_key`, `export_sha256`, `regulation_confirmed_by`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023090000` |  |
| 3 | `packet_id` | `uuid` | NOT NULL |  | `packet(id)` | `20261023090000` |  |
| 4 | `version_no` | `integer` | NOT NULL |  |  | `20261023090000` |  |
| 5 | `content` | `jsonb` | NOT NULL |  |  | `20261023090000` | not in the dictionary |
| 6 | `citation` | `jsonb` | null |  |  | `20261023090000` | generated from `(content -> 'citation'::text)` |
| 7 | `line_table` | `jsonb` | null |  |  | `20261023090000` | generated from `(content -> 'lines'::text)` |
| 8 | `evidence` | `jsonb` | null |  |  | `20261023090000` | generated from `(content -> 'evidence'::text)` |
| 9 | `interest_cents` | `bigint` | null |  |  | `20261023090000` | generated from `(((content -> 'interest'::text) ->> 'total_cents'::text))::bigint` |
| 10 | `dispute_level` | `integer` | null |  |  | `20261023090000` | generated from `((content ->> 'dispute_level'::text))::integer`; not in the dictionary |
| 11 | `narrative` | `text` | NOT NULL |  |  | `20261023090000` | encrypted (enc:v1) |
| 12 | `content_sha256` | `text` | NOT NULL |  |  | `20261023090000` | not in the dictionary |
| 13 | `verifier_passed` | `boolean` | NOT NULL |  |  | `20261023090000` |  |
| 14 | `verifier_report` | `jsonb` | NOT NULL |  |  | `20261023090000` |  |
| 15 | `drafted_by` | `uuid` | NOT NULL |  | `user(id)` | `20261023090000` |  |
| 16 | `regulation_confirmed_by` | `uuid` | null |  | `user(id)` | `20261023090000` | not in the dictionary |
| 17 | `regulation_confirmed_at` | `timestamp with time zone` | null |  |  | `20261023090000` | not in the dictionary |
| 18 | `approved_by` | `uuid` | null |  | `user(id)` | `20261023090000` |  |
| 19 | `approved_at` | `timestamp with time zone` | null |  |  | `20261023090000` |  |
| 20 | `approved_sha256` | `text` | null |  |  | `20261023090000` | not in the dictionary |
| 21 | `approved_alone` | `boolean` | NOT NULL | `false` |  | `20261023090000` | not in the dictionary |
| 22 | `export_pdf_key` | `text` | null |  |  | `20261023090000` |  |
| 23 | `export_csv_key` | `text` | null |  |  | `20261023090000` |  |
| 24 | `export_sha256` | `text` | null |  |  | `20261023090000` |  |
| 25 | `export_csv_sha256` | `text` | null |  |  | `20261023090000` | not in the dictionary |
| 26 | `exported_at` | `timestamp with time zone` | null |  |  | `20261023090000` |  |
| 27 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |
| 28 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |

Keys:
- Primary: (id)
- Unique `packet_version_numbered`: `UNIQUE (packet_id, version_no)`
- Foreign `packet_version_approved_by_fkey`: (approved_by) -> `user`(id), on delete no action
- Foreign `packet_version_drafted_by_fkey`: (drafted_by) -> `user`(id), on delete no action
- Foreign `packet_version_packet_id_fkey`: (packet_id) -> `packet`(id), on delete no action
- Foreign `packet_version_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `packet_version_regulation_confirmed_by_fkey`: (regulation_confirmed_by) -> `user`(id), on delete no action

Indexes:
- `packet_version_by_packet`: `USING btree (practice_id, packet_id, version_no DESC)`

Policies (2):
- `packet_version_drafted_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(drafted_by = app_actor_id())`
- `packet_version_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `packet_version_becomes_current`: `AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_becomes_current()`
- `packet_version_belongs`: `AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_belongs()`
  - "a packet version is written by a person who drafts packets, in their own name"
  - "a packet version is of a packet of its practice"
  - "a packet version is numbered after the last one"
  - "a packet of a case closed written off takes no new version"
  - "a packet version asks for exactly its case's lines not written off, at their priced amounts"
  - "a packet version is of the case's dispute level"
- `packet_version_current_verifier`: `BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_current_verifier()`
  - "a packet version is approved only once the current verifier has passed it; write the version again"
- `packet_version_export_refused_while_suspended`: `BEFORE UPDATE OF exported_at ON packet_version FOR EACH ROW WHEN (old.exported_at IS NULL AND new.exported_at IS NOT NULL) EXECUTE FUNCTION refuse_new_work_while_suspended()`
  - "%"
- `packet_version_never_deleted`: `BEFORE DELETE ON packet_version FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()`
  - "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `packet_version_no_truncate`: `BEFORE TRUNCATE ON packet_version FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()`
  - "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `packet_version_rules`: `BEFORE INSERT OR UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_rules()`
  - "a packet version is written unapproved and unexported"
  - "a packet version never changes once written; an edit is a new version"
  - "a regulation citation is confirmed once, before approval"
  - "a regulation's application to a case is confirmed by a contract specialist, in their own name"
  - "a packet version is approved once, and an approval is never withdrawn; an edit is a new version"
  - "a packet version the verifier failed cannot be approved"
  - "a packet is approved by a person who approves packets, in their own name"
  - "only a packet's current version is approved"
  - "an approval names the hash of the version it approves"
  - "a contract specialist confirms the regulation applies to the case before its packet is approved"
  - "the case's lines have changed since this version was written; a new version is written first"
  - "the person who drafted or last edited a packet cannot approve it"
  - "with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written"
  - "a packet version is exported once"
  - "only the export job exports a packet"
  - "exporting a packet needs an approved version"
  - "only a packet's current version, still asking for its case's lines, is exported"

Maintains `updated_at`: `packet_version_updated_at`.

### Table `submission`

<a id="table-submission"></a>

- Class: PHI (registered); registry policy `submission_tenant`, registered by `20261023090000_packets_submissions_and_responses`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): Sent by the customer
- Created by `20261023090000_packets_submissions_and_responses` (ADR 0041); its DDL, policies or trigger functions changed by `20261027090000_packet_and_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`case_id`, `channel`, `export_csv_sha256`, `export_sha256`, `follow_up_on`, `id`, `packet_version_id`, `practice_id`, `reference`, `submitted_by`, `submitted_on`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023090000` |  |
| 3 | `case_id` | `uuid` | NOT NULL |  | `case(id)` | `20261023090000` |  |
| 4 | `packet_version_id` | `uuid` | NOT NULL |  | `packet_version(id)` | `20261023090000` |  |
| 5 | `submitted_on` | `date` | NOT NULL |  |  | `20261023090000` |  |
| 6 | `channel` | `text` | NOT NULL |  |  | `20261023090000` | one of payer_portal, fax, mail, provider_relations_email |
| 7 | `reference` | `text` | null |  |  | `20261023090000` | encrypted (enc:v1) |
| 8 | `submitted_by` | `uuid` | NOT NULL |  | `user(id)` | `20261023090000` |  |
| 9 | `follow_up_on` | `date` | NOT NULL |  |  | `20261023090000` |  |
| 10 | `export_sha256` | `text` | NOT NULL |  |  | `20261023090000` | not in the dictionary |
| 11 | `export_csv_sha256` | `text` | NOT NULL |  |  | `20261023090000` | not in the dictionary |
| 12 | `dispute_level` | `integer` | NOT NULL | `1` |  | `20261023090000` | not in the dictionary |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |

Keys:
- Primary: (id)
- Foreign `submission_case_id_fkey`: (case_id) -> `case`(id), on delete no action
- Foreign `submission_packet_version_id_fkey`: (packet_version_id) -> `packet_version`(id), on delete no action
- Foreign `submission_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `submission_submitted_by_fkey`: (submitted_by) -> `user`(id), on delete no action

Indexes:
- `submission_by_case`: `USING btree (practice_id, case_id, submitted_on DESC)`
- `submission_by_follow_up`: `USING btree (practice_id, follow_up_on)`

Policies (2):
- `submission_logged_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(submitted_by = app_actor_id())`
- `submission_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `submission_channel_check`: `CHECK (channel = ANY (ARRAY['payer_portal'::text, 'fax'::text, 'mail'::text, 'provider_relations_email'::text]))`
- `submission_dispute_level_check`: `CHECK (dispute_level >= 1)`
- `submission_export_csv_sha256_check`: `CHECK (export_csv_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `submission_export_sha256_check`: `CHECK (export_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `submission_follow_up_after`: `CHECK (follow_up_on >= submitted_on)`
- `submission_reference_check`: `CHECK (reference ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`

Invariants enforced by triggers:
- `submission_belongs`: `AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_belongs()`
  - "a submission is logged by a person who logs submissions, in their own name"
  - "a submission is of a version of its case's packet"
  - "a packet is submitted once it is exported"
  - "a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit"
  - "a submission carries the SHA-256 of the export it sent"
  - "a submission is dated from its export to today"
  - "a case closed written off takes no submission"
  - "a submission sends a version of the case's dispute level"
  - "a submission is dated on or after the case's last one"
  - "the payer has answered this dispute; only a denial that reopens the case starts the next level"
  - "the next dispute level is submitted within its window"
- `submission_never_deleted`: `BEFORE DELETE ON submission FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()`
  - "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `submission_no_truncate`: `BEFORE TRUNCATE ON submission FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()`
  - "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `submission_refresh_case`: `AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_refresh_case()`
- `submission_rules`: `BEFORE INSERT OR UPDATE ON submission FOR EACH ROW EXECUTE FUNCTION submission_rules()`
  - "a submission never changes once logged"

### Table `payer_response`

<a id="table-payer-response"></a>

- Class: PHI (registered); registry policy `payer_response_tenant`, registered by `20261023090000_packets_submissions_and_responses`, qualifies: yes
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Pricing, triage and cases (PHI): Response captured
- Created by `20261023090000_packets_submissions_and_responses` (ADR 0041); its DDL, policies or trigger functions changed by `20261026090000_recovery_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`amount_cents`, `denial_category`, `document_id`, `id`, `kind`, `next_window_ends_on`, `notes`, `practice_id`, `received_on`, `recorded_by`, `remittance_id`, `reopens_case`, `submission_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023090000` |  |
| 3 | `submission_id` | `uuid` | NOT NULL |  | `submission(id)` | `20261023090000` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | `20261023090000` | one of accepted, partial, denied, info_requested, reprocessed_no_change |
| 5 | `amount_cents` | `bigint` | null |  |  | `20261023090000` |  |
| 6 | `document_id` | `uuid` | null |  | `source_document(id)` | `20261023090000` |  |
| 7 | `remittance_id` | `uuid` | null |  | `remittance(id)` | `20261023090000` | not in the dictionary |
| 8 | `received_on` | `date` | NOT NULL |  |  | `20261023090000` |  |
| 9 | `denial_category` | `text` | null |  |  | `20261023090000` | one of authorization, visit_limit, modifier, medical_necessity, timely_filing, bundling, other; not in the dictionary |
| 10 | `notes` | `text` | null |  |  | `20261023090000` | encrypted (enc:v1) |
| 11 | `reopens_case` | `boolean` | NOT NULL | `false` |  | `20261023090000` | not in the dictionary |
| 12 | `next_window_ends_on` | `date` | null |  |  | `20261023090000` | not in the dictionary |
| 13 | `recorded_by` | `uuid` | null |  | `user(id)` | `20261023090000` | not in the dictionary |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023090000` |  |

Keys:
- Primary: (id)
- Foreign `payer_response_document_id_fkey`: (document_id) -> `source_document`(id), on delete no action
- Foreign `payer_response_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `payer_response_recorded_by_fkey`: (recorded_by) -> `user`(id), on delete no action
- Foreign `payer_response_remittance_id_fkey`: (remittance_id) -> `remittance`(id), on delete no action
- Foreign `payer_response_submission_id_fkey`: (submission_id) -> `submission`(id), on delete no action

Indexes:
- `payer_response_by_submission`: `USING btree (practice_id, submission_id, received_on DESC)`

Policies (2):
- `payer_response_recorded_by_actor`: RESTRICTIVE FOR INSERT TO tp_app
  - WITH CHECK `(NOT (recorded_by IS DISTINCT FROM CASE     WHEN app_actor_is_person() THEN app_actor_id()     ELSE NULL::uuid END))`
- `payer_response_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `payer_response_belongs`: `AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_belongs()`
  - "a payer response is recorded by a person who logs submissions, in their own name"
  - "a job records a response in no one's name"
  - "a payer response is to a submission of its practice"
  - "a payer response answers its case's latest submission"
  - "a payer response is received from its submission to today"
  - "a payer response is received on or after the submission's last one"
  - "a payer response's document is a document of its practice"
  - "a payer response's remittance is a loaded remittance of its practice"
- `payer_response_never_deleted`: `BEFORE DELETE ON payer_response FOR EACH ROW EXECUTE FUNCTION packets_never_deleted()`
  - "% rows are never deleted: packets, submissions and responses keep what they recorded"
- `payer_response_no_truncate`: `BEFORE TRUNCATE ON payer_response FOR EACH STATEMENT EXECUTE FUNCTION packets_no_truncate()`
  - "% cannot be truncated: packets, submissions and responses keep what they recorded"
- `payer_response_refresh_case`: `AFTER INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_refresh_case()`
- `payer_response_rules`: `BEFORE INSERT OR UPDATE ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_rules()`
  - "a payer response never changes once recorded"
  - "no next dispute window is known for this case, so the denial cannot reopen it"
  - "the next dispute window has closed, so the denial cannot reopen the case"
- `payer_response_within_asked`: `BEFORE INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_within_asked()`
  - "a payer response accepts at most what its submission asked: the lines' variance and the interest line"

## 10. Ledger

<a id="area-ledger"></a>

The signed, append-only recovery ledger, the matches that pair its evidence, the posting-export and EFT-export rows it matches against, and the ROI statement.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`posting_row`](#table-posting-row) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261023120000_recovery_ledger` | From the practice's posting export |
| [`eft_row`](#table-eft-row) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261023120000_recovery_ledger` | From the EFT or bank export |
| [`ledger_entry`](#table-ledger-entry) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols) | `20261023120000_recovery_ledger` | Signed, append-only |
| [`ledger_match`](#table-ledger-match) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261023120000_recovery_ledger` | not in the Data dictionary |
| [`roi_statement`](#table-roi-statement) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261023120000_recovery_ledger` | Generated statement |

### Table `posting_row`

<a id="table-posting-row"></a>

- Class: PHI (registered); registry policy `posting_row_tenant`, registered by `20261023120000_recovery_ledger`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Ledger and reconciliation (PHI): From the practice's posting export
- Created by `20261023120000_recovery_ledger` (ADR 0042); its DDL, policies or trigger functions changed by `20261026090000_recovery_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`amount_cents`, `batch`, `check_or_trace`, `claim_reference`, `fingerprint`, `id`, `payer_name`, `posted_on`, `practice_id`, `procedure_code`, `raw`, `row_no`, `service_date`, `source_document_id`, `template`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023120000` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` | `20261023120000` |  |
| 4 | `row_no` | `integer` | NOT NULL |  |  | `20261023120000` | not in the dictionary |
| 5 | `check_or_trace` | `text` | NOT NULL |  |  | `20261023120000` |  |
| 6 | `posted_on` | `date` | NOT NULL |  |  | `20261023120000` |  |
| 7 | `amount_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 8 | `claim_reference` | `text` | null |  |  | `20261023120000` | encrypted (enc:v1) |
| 9 | `procedure_code` | `text` | null |  |  | `20261023120000` | not in the dictionary |
| 10 | `service_date` | `date` | null |  |  | `20261023120000` | not in the dictionary |
| 11 | `payer_name` | `text` | null |  |  | `20261023120000` | not in the dictionary |
| 12 | `batch` | `text` | null |  |  | `20261023120000` | not in the dictionary |
| 13 | `raw` | `jsonb` | NOT NULL |  |  | `20261023120000` |  |
| 14 | `template` | `text` | NOT NULL |  |  | `20261023120000` | not in the dictionary |
| 15 | `fingerprint` | `text` | NOT NULL |  |  | `20261023120000` | not in the dictionary |
| 16 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 17 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |

Keys:
- Primary: (id)
- Unique `posting_row_once`: `UNIQUE (practice_id, fingerprint)`
- Unique `posting_row_position`: `UNIQUE (source_document_id, row_no)`
- Foreign `posting_row_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `posting_row_source_document_id_fkey`: (source_document_id) -> `source_document`(id), on delete no action

Indexes:
- `posting_row_by_check`: `USING btree (practice_id, check_or_trace)`

Policies (1):
- `posting_row_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `posting_row_batch_check`: `CHECK (char_length(batch) >= 1 AND char_length(batch) <= 100)`
- `posting_row_check_or_trace_check`: `CHECK (btrim(check_or_trace) <> ''::text AND char_length(check_or_trace) <= 64)`
- `posting_row_claim_reference_check`: `CHECK (claim_reference ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `posting_row_fingerprint_check`: `CHECK (fingerprint ~ '^[0-9a-f]{64}$'::text)`
- `posting_row_payer_name_check`: `CHECK (char_length(payer_name) >= 1 AND char_length(payer_name) <= 200)`
- `posting_row_procedure_code_check`: `CHECK (procedure_code ~ '^[A-Za-z0-9]{1,20}$'::text)`
- `posting_row_raw_check`: `CHECK (jsonb_typeof(raw) = 'object'::text AND NOT raw ? 'claim_reference'::text)`
- `posting_row_row_no_check`: `CHECK (row_no >= 1)`
- `posting_row_template_check`: `CHECK (template ~ '^[a-z][a-z0-9_]{0,63}$'::text)`

Invariants enforced by triggers:
- `posting_row_belongs`: `BEFORE INSERT ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs()`
  - "an export row is read from its export by the reconcile job, never written by a person"
  - "an export row is a row of an export of its practice"
  - "a posting row is a row of a posting export, and an EFT row of an EFT export"
  - "an export row is read from an export stored with a clean malware scan, before it is loaded"
  - "an export row of a zip entry is read only when its zip's malware scan is clean"
- `posting_row_never_changed`: `BEFORE DELETE OR UPDATE ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed()`
  - "% rows are never changed or deleted: the ledger is append-only and a correction is a new entry"
- `posting_row_no_truncate`: `BEFORE TRUNCATE ON posting_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()`
  - "% cannot be truncated: the ledger keeps what it recorded"

### Table `eft_row`

<a id="table-eft-row"></a>

- Class: PHI (registered); registry policy `eft_row_tenant`, registered by `20261023120000_recovery_ledger`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Ledger and reconciliation (PHI): From the EFT or bank export
- Created by `20261023120000_recovery_ledger` (ADR 0042); its DDL, policies or trigger functions changed by `20261026090000_recovery_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`amount_cents`, `batch_reference`, `deposited_on`, `fingerprint`, `id`, `practice_id`, `row_no`, `source_document_id`, `trace`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023120000` |  |
| 3 | `source_document_id` | `uuid` | NOT NULL |  | `source_document(id)` | `20261023120000` |  |
| 4 | `row_no` | `integer` | NOT NULL |  |  | `20261023120000` | not in the dictionary |
| 5 | `trace` | `text` | NOT NULL |  |  | `20261023120000` |  |
| 6 | `deposited_on` | `date` | NOT NULL |  |  | `20261023120000` |  |
| 7 | `amount_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 8 | `batch_reference` | `text` | null |  |  | `20261023120000` |  |
| 9 | `fingerprint` | `text` | NOT NULL |  |  | `20261023120000` | not in the dictionary |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |

Keys:
- Primary: (id)
- Unique `eft_row_once`: `UNIQUE (practice_id, fingerprint)`
- Unique `eft_row_position`: `UNIQUE (source_document_id, row_no)`
- Foreign `eft_row_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `eft_row_source_document_id_fkey`: (source_document_id) -> `source_document`(id), on delete no action

Indexes:
- `eft_row_by_trace`: `USING btree (practice_id, trace)`

Policies (1):
- `eft_row_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `eft_row_batch_reference_check`: `CHECK (char_length(batch_reference) >= 1 AND char_length(batch_reference) <= 100)`
- `eft_row_fingerprint_check`: `CHECK (fingerprint ~ '^[0-9a-f]{64}$'::text)`
- `eft_row_row_no_check`: `CHECK (row_no >= 1)`
- `eft_row_trace_check`: `CHECK (btrim(trace) <> ''::text AND char_length(trace) <= 64)`

Invariants enforced by triggers:
- `eft_row_belongs`: `BEFORE INSERT ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs()`
  - "an export row is read from its export by the reconcile job, never written by a person"
  - "an export row is a row of an export of its practice"
  - "a posting row is a row of a posting export, and an EFT row of an EFT export"
  - "an export row is read from an export stored with a clean malware scan, before it is loaded"
  - "an export row of a zip entry is read only when its zip's malware scan is clean"
- `eft_row_never_changed`: `BEFORE DELETE OR UPDATE ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed()`
  - "% rows are never changed or deleted: the ledger is append-only and a correction is a new entry"
- `eft_row_no_truncate`: `BEFORE TRUNCATE ON eft_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()`
  - "% cannot be truncated: the ledger keeps what it recorded"

### Table `ledger_entry`

<a id="table-ledger-entry"></a>

- Class: PHI (registered); registry policy `ledger_entry_tenant`, registered by `20261023120000_recovery_ledger`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Ledger and reconciliation (PHI): Signed, append-only
- Created by `20261023120000_recovery_ledger` (ADR 0042); its DDL, policies or trigger functions changed by `20261026090000_recovery_ledger_review`, `20261027090000_packet_and_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`allocated`, `amount_cents`, `case_id`, `created_by`, `effective_on`, `evidence_id`, `evidence_kind`, `id`, `match_id`, `practice_id`, `reason`, `service_line_id`, `stage`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023120000` |  |
| 3 | `seq` | `bigint` | NOT NULL |  |  | `20261023120000` | generated always as identity; not in the dictionary |
| 4 | `case_id` | `uuid` | NOT NULL |  | `case(id)` | `20261023120000` |  |
| 5 | `service_line_id` | `uuid` | null |  | `service_line(id)` | `20261023120000` |  |
| 6 | `stage` | `text` | NOT NULL |  |  | `20261023120000` | one of approved, posted, deposited, recouped, reversed, adjusted, interest |
| 7 | `amount_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 8 | `evidence_kind` | `text` | NOT NULL |  |  | `20261023120000` | one of claim, payer_response, posting_row, eft_row, provider_adjustment, ledger_entry |
| 9 | `evidence_id` | `uuid` | NOT NULL |  |  | `20261023120000` |  |
| 10 | `match_id` | `uuid` | null |  | `ledger_match(id)` | `20261023120000` | not in the dictionary |
| 11 | `allocated` | `boolean` | NOT NULL | `false` |  | `20261023120000` |  |
| 12 | `effective_on` | `date` | NOT NULL |  |  | `20261023120000` | not in the dictionary |
| 13 | `created_by` | `uuid` | null |  | `user(id)` | `20261023120000` |  |
| 14 | `reason` | `text` | null |  |  | `20261023120000` | encrypted (enc:v1) |
| 15 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 16 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |

Keys:
- Primary: (id)
- Unique index `ledger_entry_once_per_match`: `USING btree (match_id, service_line_id, stage) NULLS NOT DISTINCT WHERE ((match_id IS NOT NULL) AND (stage <> ALL (ARRAY['reversed'::text, 'adjusted'::text])))`
- Unique index `ledger_entry_response_once`: `USING btree (evidence_id, service_line_id) NULLS NOT DISTINCT WHERE (evidence_kind = 'payer_response'::text)`
- Unique index `ledger_entry_reversed_once`: `USING btree (evidence_id) WHERE (stage = 'reversed'::text)`
- Foreign `ledger_entry_case_id_fkey`: (case_id) -> `case`(id), on delete no action
- Foreign `ledger_entry_created_by_fkey`: (created_by) -> `user`(id), on delete no action
- Foreign `ledger_entry_match_id_fkey`: (match_id) -> `ledger_match`(id), on delete no action
- Foreign `ledger_entry_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `ledger_entry_service_line_id_fkey`: (service_line_id) -> `service_line`(id), on delete no action

Indexes:
- `ledger_entry_by_case`: `USING btree (practice_id, case_id, stage)`
- `ledger_entry_by_date`: `USING btree (practice_id, effective_on)`
- `ledger_entry_by_evidence`: `USING btree (evidence_id)`
- `ledger_entry_by_line`: `USING btree (practice_id, service_line_id, seq)`

Policies (1):
- `ledger_entry_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `ledger_entry_allocated`: `CHECK (NOT allocated OR (stage = ANY (ARRAY['approved'::text, 'posted'::text, 'deposited'::text, 'interest'::text])))`
- `ledger_entry_correction_says_why`: `CHECK ((stage = ANY (ARRAY['reversed'::text, 'adjusted'::text])) = (reason IS NOT NULL))`
- `ledger_entry_evidence_kind_check`: `CHECK (evidence_kind = ANY (ARRAY['claim'::text, 'payer_response'::text, 'posting_row'::text, 'eft_row'::text, 'provider_adjustment'::text, 'ledger_entry'::text]))`
- `ledger_entry_evidence_of_stage`: `CHECK ( CASE stage     WHEN 'approved'::text THEN evidence_kind = ANY (ARRAY['claim'::text, 'payer_response'::text])     WHEN 'posted'::text THEN evidence_kind = 'posting_row'::text     WHEN 'deposited'::text THEN evidence_kind = 'eft_row'::text     WHEN 'recouped'::text THEN evidence_kind = ANY (ARRAY['provider_adjustment'::text, 'claim'::text])     WHEN 'interest'::text THEN evidence_kind = ANY (ARRAY['provider_adjustment'::text, 'claim'::text])     ELSE evidence_kind = 'ledger_entry'::text END)`
- `ledger_entry_matched`: `CHECK (match_id IS NOT NULL OR (evidence_kind = ANY (ARRAY['payer_response'::text, 'ledger_entry'::text])))`
- `ledger_entry_reason_check`: `CHECK (btrim(reason) <> ''::text AND char_length(reason) <= 8000)`
- `ledger_entry_reason_encrypted`: `CHECK (reason ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `ledger_entry_sign`: `CHECK ( CASE stage     WHEN 'recouped'::text THEN amount_cents < 0     WHEN 'reversed'::text THEN amount_cents <> 0     WHEN 'adjusted'::text THEN amount_cents <> 0     ELSE amount_cents > 0 END)`
- `ledger_entry_stage_check`: `CHECK (stage = ANY (ARRAY['approved'::text, 'posted'::text, 'deposited'::text, 'recouped'::text, 'reversed'::text, 'adjusted'::text, 'interest'::text]))`

Invariants enforced by triggers:
- `ledger_entry_no_truncate`: `BEFORE TRUNCATE ON ledger_entry FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()`
  - "% cannot be truncated: the ledger keeps what it recorded"
- `ledger_entry_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_rules()`
  - "a ledger entry is never changed or deleted; a correction is a new entry"
  - "a specialist corrects an amount after review, in their own name, with the ledger adjustment permission"
  - "a person writes a ledger entry in their own name, with the reconciliation permission"
  - "the reconcile job writes ledger entries in no one's name"
  - "a ledger entry is of a case of its practice"
  - "a ledger entry of a line is of a line of its case"
  - "a correction names an entry of a counted stage, or a reversal an adjustment"
  - "a correction is of its entry's case, line and match"
  - "a correction is of an entry whose match stands; a reversed match's entries are never corrected again"
  - "a reversal offsets its entry exactly"
  - "a person reverses or adjusts an entry, with a reason"
  - "a correction is never allocated"
  - "an approval from a payer response is of a recorded response, with no match"
  - "an approval from a payer response is of a response accepting an amount for its case"
  - "an entry comes from a standing match"
  - "an entry carries its match's evidence, for its match's line"
  - "a % entry comes from a match of its kind"
  - "an entry is allocated when its match is"
- `ledger_entry_within_evidence`: `BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_evidence()`
  - "the posted or deposited entries of a posting or EFT row never sum past the row's amount"
  - "the posted or deposited entries of a posting or EFT row, their corrections included, never net below zero"
  - "a line-level posting posts only the lines of its row's code and date of service"
- `ledger_entry_within_line`: `BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_line()`
  - "a line's posted and deposited never exceed what was approved for it"
  - "an adjustment keeps its entry between zero and what the entry's evidence shows"

### Table `ledger_match`

<a id="table-ledger-match"></a>

- Class: PHI (registered); registry policy `ledger_match_tenant`, registered by `20261023120000_recovery_ledger`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261023120000_recovery_ledger` (ADR 0042); its DDL, policies or trigger functions changed by `20261027090000_packet_and_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`allocated`, `claim_id`, `eft_row_id`, `id`, `kind`, `level`, `matched_by`, `outcome`, `posting_row_id`, `practice_id`, `provider_adjustment_id`, `remittance_id`, `service_line_id`)
- Column grant: `tp_app` UPDATE (`reversal_reason`, `reversed_by`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023120000` |  |
| 3 | `kind` | `text` | NOT NULL |  |  | `20261023120000` | one of claim, posting, deposit, recoupment, interest |
| 4 | `claim_id` | `uuid` | null |  | `claim(id)` | `20261023120000` |  |
| 5 | `posting_row_id` | `uuid` | null |  | `posting_row(id)` | `20261023120000` |  |
| 6 | `eft_row_id` | `uuid` | null |  | `eft_row(id)` | `20261023120000` |  |
| 7 | `provider_adjustment_id` | `uuid` | null |  | `provider_adjustment(id)` | `20261023120000` |  |
| 8 | `remittance_id` | `uuid` | NOT NULL |  | `remittance(id)` | `20261023120000` |  |
| 9 | `service_line_id` | `uuid` | null |  | `service_line(id)` | `20261023120000` |  |
| 10 | `outcome` | `text` | null |  |  | `20261023120000` | one of approved, decreased, no_change |
| 11 | `level` | `text` | null |  |  | `20261023120000` | one of claim, check, batch |
| 12 | `allocated` | `boolean` | NOT NULL | `false` |  | `20261023120000` |  |
| 13 | `matched_by` | `uuid` | null |  | `user(id)` | `20261023120000` |  |
| 14 | `matched_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 15 | `reversed_by` | `uuid` | null |  | `user(id)` | `20261023120000` |  |
| 16 | `reversed_at` | `timestamp with time zone` | null |  |  | `20261023120000` |  |
| 17 | `reversal_reason` | `text` | null |  |  | `20261023120000` | encrypted (enc:v1) |
| 18 | `evidence_id` | `uuid` | NOT NULL |  |  | `20261023120000` | generated from `COALESCE(posting_row_id, eft_row_id, provider_adjustment_id, claim_id)` |
| 19 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 20 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |

Keys:
- Primary: (id)
- Unique index `ledger_match_standing`: `USING btree (kind, evidence_id, service_line_id) NULLS NOT DISTINCT WHERE (reversed_at IS NULL)`
- Foreign `ledger_match_claim_id_fkey`: (claim_id) -> `claim`(id), on delete no action
- Foreign `ledger_match_eft_row_id_fkey`: (eft_row_id) -> `eft_row`(id), on delete no action
- Foreign `ledger_match_matched_by_fkey`: (matched_by) -> `user`(id), on delete no action
- Foreign `ledger_match_posting_row_id_fkey`: (posting_row_id) -> `posting_row`(id), on delete no action
- Foreign `ledger_match_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `ledger_match_provider_adjustment_id_fkey`: (provider_adjustment_id) -> `provider_adjustment`(id), on delete no action
- Foreign `ledger_match_remittance_id_fkey`: (remittance_id) -> `remittance`(id), on delete no action
- Foreign `ledger_match_reversed_by_fkey`: (reversed_by) -> `user`(id), on delete no action
- Foreign `ledger_match_service_line_id_fkey`: (service_line_id) -> `service_line`(id), on delete no action

Indexes:
- `ledger_match_by_line`: `USING btree (practice_id, service_line_id) WHERE (service_line_id IS NOT NULL)`
- `ledger_match_by_remittance`: `USING btree (practice_id, remittance_id)`

Policies (1):
- `ledger_match_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `ledger_match_allocated`: `CHECK (NOT allocated OR kind = 'posting'::text AND level = 'check'::text OR kind = 'interest'::text)`
- `ledger_match_evidence`: `CHECK ( CASE kind     WHEN 'claim'::text THEN claim_id IS NOT NULL AND num_nonnulls(posting_row_id, eft_row_id, provider_adjustment_id, level) = 0 AND service_line_id IS NOT NULL AND outcome IS NOT NULL     WHEN 'posting'::text THEN posting_row_id IS NOT NULL AND num_nonnulls(eft_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND (level = ANY (ARRAY['claim'::text, 'check'::text])) AND (claim_id IS NOT NULL) = (level = 'claim'::text)     WHEN 'deposit'::text THEN eft_row_id IS NOT NULL AND num_nonnulls(claim_id, posting_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND (level = ANY (ARRAY['check'::text, 'batch'::text]))     ELSE num_nonnulls(claim_id, provider_adjustment_id) = 1 AND num_nonnulls(posting_row_id, eft_row_id, outcome, level) = 0 AND service_line_id IS NOT NULL END)`
- `ledger_match_kind_check`: `CHECK (kind = ANY (ARRAY['claim'::text, 'posting'::text, 'deposit'::text, 'recoupment'::text, 'interest'::text]))`
- `ledger_match_level_check`: `CHECK (level = ANY (ARRAY['claim'::text, 'check'::text, 'batch'::text]))`
- `ledger_match_outcome_check`: `CHECK (outcome = ANY (ARRAY['approved'::text, 'decreased'::text, 'no_change'::text]))`
- `ledger_match_reversal_reason_check`: `CHECK (btrim(reversal_reason) <> ''::text AND char_length(reversal_reason) <= 8000)`
- `ledger_match_reversal_reason_encrypted`: `CHECK (reversal_reason ~ '^enc:v1:[A-Za-z0-9_-]+$'::text)`
- `ledger_match_reversed_together`: `CHECK ((reversed_at IS NULL) = (reversed_by IS NULL) AND (reversed_at IS NULL) = (reversal_reason IS NULL))`

Invariants enforced by triggers:
- `ledger_match_no_truncate`: `BEFORE TRUNCATE ON ledger_match FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()`
  - "% cannot be truncated: the ledger keeps what it recorded"
- `ledger_match_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON ledger_match FOR EACH ROW EXECUTE FUNCTION ledger_match_rules()`
  - "a match is never deleted; it is reversed"
  - "a match never changes; it is reversed"
  - "a match is reversed once"
  - "a match is reversed by a person who reconciles postings, in their own name, with a reason"
  - "a match is recorded standing"
  - "a person who reconciles postings matches by hand, in their own name"
  - "the reconcile job matches in no one's name"
  - "a match is to a loaded remittance of its practice"
  - "a match is to a service line of its practice"
  - "a claim match is of a claim of its remittance, never a reversal"
  - "a posting match is of a posting row of its practice, and a line-level one of a claim of its remittance"
  - "a deposit match is of an EFT row of its practice"
  - "a recoupment is a PLB WO or a reversing claim of its remittance"
  - "interest is a PLB L6 or a claim's interest of its remittance"

Maintains `updated_at`: `ledger_match_updated_at`.

### Table `roi_statement`

<a id="table-roi-statement"></a>

- Class: PHI (registered); registry policy `roi_statement_tenant`, registered by `20261023120000_recovery_ledger`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Ledger and reconciliation (PHI): Generated statement
- Created by `20261023120000_recovery_ledger` (ADR 0042); its DDL, policies or trigger functions changed by `20261024120000_reconciliation_and_roi_documents`, `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`actionable_open_cents`, `approved_unposted_cents`, `document_key`, `fees_cents`, `generated_by`, `id`, `interest_cents`, `links`, `period_from`, `period_to`, `practice_id`, `proof_level`, `pursuit_hours`, `recovered_cents`)
- Column grant: `tp_app` UPDATE (`document_key`, `pdf_sha256`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261023120000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261023120000` |  |
| 3 | `period_from` | `date` | NOT NULL |  |  | `20261023120000` |  |
| 4 | `period_to` | `date` | NOT NULL |  |  | `20261023120000` |  |
| 5 | `proof_level` | `text` | NOT NULL |  |  | `20261023120000` | one of posted, deposited; not in the dictionary |
| 6 | `fees_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 7 | `recovered_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 8 | `interest_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 9 | `approved_unposted_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 10 | `actionable_open_cents` | `bigint` | NOT NULL |  |  | `20261023120000` |  |
| 11 | `pursuit_hours` | `numeric(9,2)` | NOT NULL |  |  | `20261023120000` |  |
| 12 | `links` | `jsonb` | NOT NULL |  |  | `20261023120000` | not in the dictionary |
| 13 | `generated_by` | `uuid` | null |  | `user(id)` | `20261023120000` | not in the dictionary |
| 14 | `generated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 15 | `document_key` | `text` | null |  |  | `20261023120000` |  |
| 16 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 17 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261023120000` |  |
| 18 | `pdf_sha256` | `text` | null |  |  | `20261024120000` | not in the dictionary |

Keys:
- Primary: (id)
- Unique index `roi_statement_quarterly`: `USING btree (practice_id, period_from, period_to) WHERE (generated_by IS NULL)`
- Foreign `roi_statement_generated_by_fkey`: (generated_by) -> `user`(id), on delete no action
- Foreign `roi_statement_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `roi_statement_by_period`: `USING btree (practice_id, period_from DESC, generated_at DESC)`

Policies (1):
- `roi_statement_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `roi_statement_no_truncate`: `BEFORE TRUNCATE ON roi_statement FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate()`
  - "% cannot be truncated: the ledger keeps what it recorded"
- `roi_statement_refused_while_suspended`: `BEFORE INSERT ON roi_statement FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()`
  - "%"
- `roi_statement_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON roi_statement FOR EACH ROW EXECUTE FUNCTION roi_statement_rules()`
  - "an ROI statement keeps its figures; a new one is generated"
  - "an ROI statement keeps its figures; only its printed PDF is recorded, once"
  - "the statement job records the printed PDF, in no one's name"
  - "a statement's PDF is stored under its own practice and statement"
  - "a statement is printed after it is written"
  - "an ROI statement is generated on demand by a person who reconciles postings, in their own name"
  - "the quarterly statement is generated in no one's name"
  - "an ROI statement's recovered and interest are the sums of the entries it links"

## 11. Model gateway

<a id="area-models"></a>

Each model call (references and hashes only), evaluation examples, the proposals a person decides, and budget holds taken before a call.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`model_call`](#table-model-call) | tenant (nullable practice_id), not registered | yes / yes | 2 | SELECT, INSERT(cols), UPDATE(cols) | `20261029090000_model_gateway` | One call |
| [`eval_example`](#table-eval-example) | tenant (nullable practice_id), not registered | yes / yes | 2 | SELECT, INSERT(cols) | `20261029090000_model_gateway` | Evaluation data |
| [`model_proposal`](#table-model-proposal) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261029190000_model_proposals` | not in the Data dictionary |
| [`model_budget_hold`](#table-model-budget-hold) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), DELETE | `20261031090000_model_budget_holds` | not in the Data dictionary |

### Table `model_call`

<a id="table-model-call"></a>

- Class: tenant (nullable practice_id), not registered
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Model gateway (PHI references only): One call
- Created by `20261029090000_model_gateway` (ADR 0048); its DDL, policies or trigger functions changed by `20261029100000_model_gateway_operator`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols); `tp_operator` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`actor_id`, `actor_kind`, `attempts`, `citations`, `cost_cents`, `cost_unrounded`, `error_code`, `id`, `idempotency_key`, `input_hashes`, `latency_ms`, `model_id`, `outcome`, `output_sha256`, `practice_id`, `prompt_version`, `provider`, `purpose`, `tokens_in`, `tokens_out`, `verifier_passed`)
- Column grant: `tp_app` UPDATE (`reviewer_changed_fields`, `reviewer_decision`)
- Column grant: `tp_operator` INSERT (`actor_id`, `actor_kind`, `attempts`, `citations`, `cost_cents`, `cost_unrounded`, `error_code`, `id`, `idempotency_key`, `input_hashes`, `latency_ms`, `model_id`, `outcome`, `output_sha256`, `practice_id`, `prompt_version`, `provider`, `purpose`, `tokens_in`, `tokens_out`, `verifier_passed`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029090000` |  |
| 2 | `practice_id` | `uuid` | null |  | `practice(id)` | `20261029090000` |  |
| 3 | `actor_kind` | `text` | NOT NULL |  |  | `20261029090000` | one of user, service, evaluation; not in the dictionary |
| 4 | `actor_id` | `uuid` | null |  |  | `20261029090000` | not in the dictionary |
| 5 | `purpose` | `text` | NOT NULL |  |  | `20261029090000` | one of proposeContractTerms, readDenialLetter, draftPacketNarrative, suggestEvidenceRequests |
| 6 | `provider` | `text` | NOT NULL |  |  | `20261029090000` | one of bedrock, anthropic, local; not in the dictionary |
| 7 | `model_id` | `text` | NOT NULL |  |  | `20261029090000` |  |
| 8 | `prompt_version` | `text` | NOT NULL |  |  | `20261029090000` |  |
| 9 | `idempotency_key` | `text` | NOT NULL |  |  | `20261029090000` | not in the dictionary |
| 10 | `input_hashes` | `text[]` | NOT NULL |  |  | `20261029090000` |  |
| 11 | `output_sha256` | `text` | null |  |  | `20261029090000` |  |
| 12 | `tokens_in` | `integer` | NOT NULL |  |  | `20261029090000` |  |
| 13 | `tokens_out` | `integer` | NOT NULL |  |  | `20261029090000` |  |
| 14 | `cost_cents` | `bigint` | NOT NULL |  |  | `20261029090000` |  |
| 15 | `cost_unrounded` | `numeric(18,6)` | NOT NULL |  |  | `20261029090000` | not in the dictionary |
| 16 | `citations` | `jsonb` | NOT NULL |  |  | `20261029090000` |  |
| 17 | `verifier_passed` | `boolean` | null |  |  | `20261029090000` |  |
| 18 | `outcome` | `text` | NOT NULL |  |  | `20261029090000` | one of completed, failed, timed_out; not in the dictionary |
| 19 | `error_code` | `text` | null |  |  | `20261029090000` | not in the dictionary |
| 20 | `attempts` | `integer` | NOT NULL |  |  | `20261029090000` | not in the dictionary |
| 21 | `latency_ms` | `integer` | NOT NULL |  |  | `20261029090000` |  |
| 22 | `reviewer_decision` | `text` | null |  |  | `20261029090000` | one of accepted, accepted_with_changes, rejected |
| 23 | `reviewer_changed_fields` | `text[]` | null |  |  | `20261029090000` |  |
| 24 | `reviewed_by` | `uuid` | null |  | `user(id)` | `20261029090000` | not in the dictionary |
| 25 | `reviewed_at` | `timestamp with time zone` | null |  |  | `20261029090000` | not in the dictionary |
| 26 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029090000` |  |

Keys:
- Primary: (id)
- Unique index `model_call_completed_once`: `USING btree (idempotency_key) WHERE (outcome = 'completed'::text)`
- Foreign `model_call_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `model_call_reviewed_by_fkey`: (reviewed_by) -> `user`(id), on delete no action

Indexes:
- `model_call_by_practice`: `USING btree (practice_id, created_at)`

Policies (2):
- `model_call_synthetic_evaluation`: PERMISSIVE FOR ALL TO tp_operator
  - USING `(practice_id IS NULL)`
  - WITH CHECK `(practice_id IS NULL)`
- `model_call_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `model_call_no_truncate`: `BEFORE TRUNCATE ON model_call FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()`
  - "% cannot be truncated: the gateway's records are kept"
- `model_call_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON model_call FOR EACH ROW EXECUTE FUNCTION model_call_rules()`
  - "a model call is kept: its log row is never deleted"
  - "a model call is logged unreviewed; the reviewer's decision comes later"
  - "a model call is logged in the name of the transaction's actor"
  - "a model call never changes; only the reviewer's decision is recorded, once"
  - "the reviewer's decision is recorded by a person who may review the call's purpose in its practice"

### Table `eval_example`

<a id="table-eval-example"></a>

- Class: tenant (nullable practice_id), not registered
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: Model gateway (PHI references only): Evaluation data
- Created by `20261029090000_model_gateway` (ADR 0048)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols); `tp_operator` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`expected`, `id`, `input_ref`, `permission_ref`, `practice_id`, `purpose`, `source`)
- Column grant: `tp_operator` INSERT (`expected`, `id`, `input_ref`, `permission_ref`, `practice_id`, `purpose`, `source`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029090000` |  |
| 2 | `source` | `text` | NOT NULL |  |  | `20261029090000` | one of synthetic, permitted |
| 3 | `purpose` | `text` | NOT NULL |  |  | `20261029090000` | one of proposeContractTerms, readDenialLetter, draftPacketNarrative, suggestEvidenceRequests |
| 4 | `input_ref` | `text` | NOT NULL |  |  | `20261029090000` |  |
| 5 | `expected` | `jsonb` | NOT NULL |  |  | `20261029090000` |  |
| 6 | `practice_id` | `uuid` | null |  | `practice(id)` | `20261029090000` |  |
| 7 | `permission_ref` | `uuid` | null |  | `agreement(id)` | `20261029090000` |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029090000` |  |

Keys:
- Primary: (id)
- Foreign `eval_example_permission_ref_fkey`: (permission_ref) -> `agreement`(id), on delete no action
- Foreign `eval_example_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `eval_example_by_practice`: `USING btree (practice_id, created_at)`

Policies (2):
- `eval_example_synthetic`: PERMISSIVE FOR ALL TO tp_operator
  - USING `(practice_id IS NULL)`
  - WITH CHECK `(practice_id IS NULL)`
- `eval_example_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `eval_example_expected_check`: `CHECK (jsonb_typeof(expected) = 'object'::text)`
- `eval_example_input_ref_check`: `CHECK (input_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'::text)`
- `eval_example_letters_synthetic`: `CHECK (purpose <> 'readDenialLetter'::text OR source = 'synthetic'::text)`
- `eval_example_purpose_check`: `CHECK (purpose = ANY (ARRAY['proposeContractTerms'::text, 'readDenialLetter'::text, 'draftPacketNarrative'::text, 'suggestEvidenceRequests'::text]))`
- `eval_example_source`: `CHECK ( CASE source     WHEN 'synthetic'::text THEN practice_id IS NULL AND permission_ref IS NULL     ELSE practice_id IS NOT NULL AND permission_ref IS NOT NULL END)`
- `eval_example_source_check`: `CHECK (source = ANY (ARRAY['synthetic'::text, 'permitted'::text]))`

Invariants enforced by triggers:
- `eval_example_no_truncate`: `BEFORE TRUNCATE ON eval_example FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()`
  - "% cannot be truncated: the gateway's records are kept"
- `eval_example_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON eval_example FOR EACH ROW EXECUTE FUNCTION eval_example_rules()`
  - "an evaluation example is never changed or deleted"
  - "a permitted evaluation example rests on the practice's signed data-rights agreement"

### Table `model_proposal`

<a id="table-model-proposal"></a>

- Class: PHI (registered); registry policy `model_proposal_tenant`, registered by `20261029190000_model_proposals`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261029190000_model_proposals` (ADR 0052)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`contract_version_id`, `id`, `model_call_id`, `packet_version_id`, `practice_id`, `proposal`, `proposed_by`, `purpose`, `source_document_id`, `verifier_passed`)
- Column grant: `tp_app` UPDATE (`eval_example_id`, `reviewed_at`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029190000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261029190000` |  |
| 3 | `model_call_id` | `uuid` | NOT NULL |  | `model_call(id)` | `20261029190000` |  |
| 4 | `purpose` | `text` | NOT NULL |  |  | `20261029190000` | one of proposeContractTerms, draftPacketNarrative, suggestEvidenceRequests |
| 5 | `contract_version_id` | `uuid` | null |  | `contract_version(id)` | `20261029190000` |  |
| 6 | `source_document_id` | `uuid` | null |  | `source_document(id)` | `20261029190000` |  |
| 7 | `packet_version_id` | `uuid` | null |  | `packet_version(id)` | `20261029190000` |  |
| 8 | `proposal` | `jsonb` | NOT NULL |  |  | `20261029190000` |  |
| 9 | `verifier_passed` | `boolean` | NOT NULL |  |  | `20261029190000` |  |
| 10 | `proposed_by` | `uuid` | NOT NULL |  | `user(id)` | `20261029190000` |  |
| 11 | `reviewed_at` | `timestamp with time zone` | null |  |  | `20261029190000` |  |
| 12 | `eval_example_id` | `uuid` | null |  | `eval_example(id)` | `20261029190000` |  |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029190000` |  |

Keys:
- Primary: (id)
- Unique `model_proposal_once`: `UNIQUE (model_call_id)`
- Foreign `model_proposal_contract_version_id_fkey`: (contract_version_id) -> `contract_version`(id), on delete no action
- Foreign `model_proposal_eval_example_id_fkey`: (eval_example_id) -> `eval_example`(id), on delete no action
- Foreign `model_proposal_model_call_id_fkey`: (model_call_id) -> `model_call`(id), on delete no action
- Foreign `model_proposal_packet_version_id_fkey`: (packet_version_id) -> `packet_version`(id), on delete no action
- Foreign `model_proposal_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `model_proposal_proposed_by_fkey`: (proposed_by) -> `user`(id), on delete no action
- Foreign `model_proposal_source_document_id_fkey`: (source_document_id) -> `source_document`(id), on delete no action

Indexes:
- `model_proposal_by_packet_version`: `USING btree (packet_version_id) WHERE (packet_version_id IS NOT NULL)`
- `model_proposal_by_practice`: `USING btree (practice_id, created_at)`
- `model_proposal_by_version`: `USING btree (contract_version_id) WHERE (contract_version_id IS NOT NULL)`

Policies (1):
- `model_proposal_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `model_proposal_example_after_review`: `CHECK (eval_example_id IS NULL OR reviewed_at IS NOT NULL)`
- `model_proposal_proposal_check`: `CHECK (jsonb_typeof(proposal) = 'object'::text)`
- `model_proposal_purpose_check`: `CHECK (purpose = ANY (ARRAY['proposeContractTerms'::text, 'draftPacketNarrative'::text, 'suggestEvidenceRequests'::text]))`
- `model_proposal_subject`: `CHECK ( CASE purpose     WHEN 'proposeContractTerms'::text THEN contract_version_id IS NOT NULL AND source_document_id IS NOT NULL AND packet_version_id IS NULL     WHEN 'draftPacketNarrative'::text THEN packet_version_id IS NOT NULL AND contract_version_id IS NULL AND source_document_id IS NULL     ELSE contract_version_id IS NULL AND source_document_id IS NULL AND packet_version_id IS NULL END)`

Invariants enforced by triggers:
- `model_proposal_no_truncate`: `BEFORE TRUNCATE ON model_proposal FOR EACH STATEMENT EXECUTE FUNCTION model_records_no_truncate()`
  - "% cannot be truncated: the gateway's records are kept"
- `model_proposal_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON model_proposal FOR EACH ROW EXECUTE FUNCTION model_proposal_rules()`
  - "a model proposal is kept: it is never deleted"
  - "a model proposal is written unreviewed"
  - "a model proposal is written by the person who asked for it"
  - "a model proposal names a completed, unreviewed call its writer made in the practice for its purpose"
  - "a model proposal never changes; its review and its example are recorded once"
  - "a proposal is reviewed once the reviewer's decision is recorded on its model call"
  - "a proposal's example is a permitted example of its own practice and purpose"

### Table `model_budget_hold`

<a id="table-model-budget-hold"></a>

- Class: PHI (registered); registry policy `model_budget_hold_tenant`, registered by `20261031090000_model_budget_holds`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261031090000_model_budget_holds` (ADR 0054)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), DELETE
- Column grant: `tp_app` INSERT (`expires_at`, `held_unrounded`, `practice_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261031090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261031090000` |  |
| 3 | `held_unrounded` | `numeric(18,6)` | NOT NULL |  |  | `20261031090000` |  |
| 4 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261031090000` |  |
| 5 | `expires_at` | `timestamp with time zone` | NOT NULL |  |  | `20261031090000` |  |

Keys:
- Primary: (id)
- Foreign `model_budget_hold_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `model_budget_hold_by_practice`: `USING btree (practice_id, expires_at)`

Policies (1):
- `model_budget_hold_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `model_budget_hold_expires_after`: `CHECK (expires_at > created_at)`
- `model_budget_hold_held_unrounded_check`: `CHECK (held_unrounded >= 0::numeric)`

## 12. Billing and onboarding

<a id="area-billing"></a>

Stripe subscriptions, invoices and webhook events, the one-subscription claim, nightly usage counts and the billing standing view; the public audit request, user invitations, and terms of use with their acceptances; and the free screening's prospects, uploads, platform place-of-service split, runs and aggregate results (no PHI, no practice).

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`subscription`](#table-subscription) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT | `20261029150000_billing` | Billing |
| [`subscription_claim`](#table-subscription-claim) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 2 | - | `20261101090000_billing_review` | not in the Data dictionary |
| [`invoice`](#table-invoice) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT | `20261029150000_billing` | Billing |
| [`billing_event`](#table-billing-event) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261029150000_billing` | not in the Data dictionary |
| [`usage_snapshot`](#table-usage-snapshot) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT | `20261029150000_billing` | Billing |
| [`billing_standing`](#table-billing-standing) | view | no / no | 0 | SELECT | `20261029150000_billing` | not in the Data dictionary |
| [`prospect_request`](#table-prospect-request) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT, UPDATE(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`invitation`](#table-invitation) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 2 | SELECT | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`terms_version`](#table-terms-version) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT, INSERT(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`terms_acceptance`](#table-terms-acceptance) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT, INSERT(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`screening_prospect`](#table-screening-prospect) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261104090000_free_screening` | not in the Data dictionary |
| [`screening_upload`](#table-screening-upload) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261104090000_free_screening` | not in the Data dictionary |
| [`screening_place_of_service_split`](#table-screening-place-of-service-split) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261104090000_free_screening` | not in the Data dictionary |
| [`screening_run`](#table-screening-run) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261104090000_free_screening` | not in the Data dictionary |
| [`screening_result`](#table-screening-result) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261104090000_free_screening` | not in the Data dictionary |

### Table `subscription`

<a id="table-subscription"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: Operations (no PHI by design): Billing
- Created by `20261029150000_billing` (ADR 0050)
- Primary key: `id`
- Privileges: `tp_app` SELECT; `tp_billing` SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029150000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261029150000` | not in the dictionary |
| 3 | `stripe_subscription_id` | `text` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 4 | `stripe_customer_id` | `text` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 5 | `stripe_price_id` | `text` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 6 | `plan` | `text` | NOT NULL |  |  | `20261029150000` | one of monthly, annual; not in the dictionary |
| 7 | `status` | `text` | NOT NULL |  |  | `20261029150000` | one of incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused; not in the dictionary |
| 8 | `current_period_start` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 9 | `current_period_end` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 10 | `cancel_at_period_end` | `boolean` | NOT NULL | `false` |  | `20261029150000` | not in the dictionary |
| 11 | `canceled_at` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 12 | `stripe_event_at` | `timestamp with time zone` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029150000` |  |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029150000` |  |

Keys:
- Primary: (id)
- Unique `subscription_stripe_subscription_id_key`: `UNIQUE (stripe_subscription_id)`
- Foreign `subscription_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action

Indexes:
- `subscription_by_organization`: `USING btree (organization_id, created_at DESC)`

Policies (3):
- `subscription_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `subscription_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `subscription_owners_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `(app_actor_organization_permitted(organization_id, 'organization.billing'::text) OR ( SELECT app_actor_platform_permitted('billing.manage'::text) AS app_actor_platform_permitted))`

Invariants enforced by constraints:
- `subscription_period`: `CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end >= current_period_start)`
- `subscription_plan_check`: `CHECK (plan = ANY (ARRAY['monthly'::text, 'annual'::text]))`
- `subscription_status_check`: `CHECK (status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'paused'::text]))`
- `subscription_stripe_customer_id_check`: `CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9_]{1,250}$'::text)`
- `subscription_stripe_price_id_check`: `CHECK (stripe_price_id ~ '^price_[A-Za-z0-9_]{1,250}$'::text)`
- `subscription_stripe_subscription_id_check`: `CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'::text)`

Invariants enforced by triggers:
- `subscription_no_truncate`: `BEFORE TRUNCATE ON subscription FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()`
  - "% rows are kept"
  - "a usage snapshot never changes"
  - "a billing event is recorded once; only its outcome follows"
- `subscription_rules`: `BEFORE DELETE OR UPDATE ON subscription FOR EACH ROW EXECUTE FUNCTION subscription_rules()`
  - "a subscription is kept"
  - "a subscription belongs to its organization and Stripe subscription for good"

Maintains `updated_at`: `subscription_updated_at`.

### Table `subscription_claim`

<a id="table-subscription-claim"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261101090000_billing_review` (ADR 0050, ADR 0055)
- Primary key: `id`
- Privileges: `tp_billing` SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261101090000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261101090000` |  |
| 3 | `plan` | `text` | NOT NULL |  |  | `20261101090000` | one of monthly, annual |
| 4 | `status` | `text` | NOT NULL | `'pending'::text` |  | `20261101090000` | one of pending, created, failed, ended |
| 5 | `stripe_subscription_id` | `text` | null |  |  | `20261101090000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261101090000` |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261101090000` |  |

Keys:
- Primary: (id)
- Unique index `subscription_claim_one_per_organization`: `USING btree (organization_id) WHERE (status = ANY (ARRAY['pending'::text, 'created'::text]))`
- Foreign `subscription_claim_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action

Indexes:
- `subscription_claim_by_subscription`: `USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL)`

Policies (2):
- `subscription_claim_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `subscription_claim_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`

Invariants enforced by constraints:
- `subscription_claim_plan_check`: `CHECK (plan = ANY (ARRAY['monthly'::text, 'annual'::text]))`
- `subscription_claim_status_check`: `CHECK (status = ANY (ARRAY['pending'::text, 'created'::text, 'failed'::text, 'ended'::text]))`
- `subscription_claim_stripe_subscription_id_check`: `CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'::text)`
- `subscription_claim_subscription`: `CHECK ((stripe_subscription_id IS NOT NULL) = (status = ANY (ARRAY['created'::text, 'ended'::text])))`

Invariants enforced by triggers:
- `subscription_claim_no_truncate`: `BEFORE TRUNCATE ON subscription_claim FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()`
  - "% rows are kept"
  - "a usage snapshot never changes"
  - "a billing event is recorded once; only its outcome follows"
- `subscription_claim_rules`: `BEFORE DELETE OR UPDATE ON subscription_claim FOR EACH ROW EXECUTE FUNCTION subscription_claim_rules()`
  - "a subscription claim is kept"
  - "a subscription claim moves from pending to created or failed, and from created to ended"

Maintains `updated_at`: `subscription_claim_updated_at`.

### Table `invoice`

<a id="table-invoice"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: Operations (no PHI by design): Billing
- Created by `20261029150000_billing` (ADR 0050); its DDL, policies or trigger functions changed by `20261101090000_billing_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT; `tp_billing` SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029150000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261029150000` | not in the dictionary |
| 3 | `stripe_invoice_id` | `text` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 4 | `stripe_customer_id` | `text` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 5 | `stripe_subscription_id` | `text` | null |  |  | `20261029150000` | not in the dictionary |
| 6 | `kind` | `text` | NOT NULL |  |  | `20261029150000` | one of subscription, audit, other; not in the dictionary |
| 7 | `number` | `text` | null |  |  | `20261029150000` | not in the dictionary |
| 8 | `status` | `text` | NOT NULL |  |  | `20261029150000` | one of draft, open, paid, void, uncollectible; not in the dictionary |
| 9 | `currency` | `text` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 10 | `amount_due_cents` | `bigint` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 11 | `amount_paid_cents` | `bigint` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 12 | `amount_remaining_cents` | `bigint` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 13 | `period_start` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 14 | `period_end` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 15 | `due_at` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 16 | `paid_at` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 17 | `payment_method_kind` | `text` | null |  |  | `20261029150000` | one of us_bank_account, card; not in the dictionary |
| 18 | `attempt_count` | `integer` | NOT NULL | `0` |  | `20261029150000` | not in the dictionary |
| 19 | `first_failed_at` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 20 | `last_failure_code` | `text` | null |  |  | `20261029150000` | not in the dictionary |
| 21 | `hosted_invoice_url` | `text` | null |  |  | `20261029150000` | not in the dictionary |
| 22 | `dunning_stage` | `text` | null |  |  | `20261029150000` | one of payment_failed, second_notice, third_notice, final_notice, suspended, reinstated, resolved; not in the dictionary |
| 23 | `dunning_notified_at` | `timestamp with time zone` | null |  |  | `20261029150000` | not in the dictionary |
| 24 | `stripe_event_at` | `timestamp with time zone` | NOT NULL |  |  | `20261029150000` | not in the dictionary |
| 25 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029150000` |  |
| 26 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029150000` |  |

Keys:
- Primary: (id)
- Unique `invoice_stripe_invoice_id_key`: `UNIQUE (stripe_invoice_id)`
- Foreign `invoice_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action

Indexes:
- `invoice_by_organization`: `USING btree (organization_id, created_at DESC)`
- `invoice_failing`: `USING btree (organization_id, first_failed_at) WHERE ((status = ANY (ARRAY['open'::text, 'uncollectible'::text])) AND (first_failed_at IS NOT NULL))`
- `invoice_paid_by_organization`: `USING btree (organization_id, paid_at) WHERE (status = 'paid'::text)`

Policies (3):
- `invoice_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `invoice_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `invoice_owners_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `(app_actor_organization_permitted(organization_id, 'organization.billing'::text) OR ( SELECT app_actor_platform_permitted('billing.manage'::text) AS app_actor_platform_permitted))`

Invariants enforced by constraints:
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

Invariants enforced by triggers:
- `invoice_no_truncate`: `BEFORE TRUNCATE ON invoice FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()`
  - "% rows are kept"
  - "a usage snapshot never changes"
  - "a billing event is recorded once; only its outcome follows"
- `invoice_rules`: `BEFORE DELETE OR UPDATE ON invoice FOR EACH ROW EXECUTE FUNCTION invoice_rules()`
  - "an invoice is kept"
  - "an invoice belongs to its organization and Stripe invoice for good"
  - "an invoice's status moves forward only"
  - "an invoice's first failed payment moves earlier only"

Maintains `updated_at`: `invoice_updated_at`.

### Table `billing_event`

<a id="table-billing-event"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261029150000_billing` (ADR 0050)
- Primary key: `id`
- Privileges: `tp_billing` SELECT, INSERT, UPDATE

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029150000` |  |
| 2 | `stripe_event_id` | `text` | NOT NULL |  |  | `20261029150000` |  |
| 3 | `type` | `text` | NOT NULL |  |  | `20261029150000` |  |
| 4 | `occurred_at` | `timestamp with time zone` | NOT NULL |  |  | `20261029150000` |  |
| 5 | `organization_id` | `uuid` | null |  | `organization(id)` | `20261029150000` |  |
| 6 | `outcome` | `text` | NOT NULL |  |  | `20261029150000` | one of received, applied, stale, ignored, unknown_customer |
| 7 | `received_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029150000` |  |

Keys:
- Primary: (id)
- Unique `billing_event_stripe_event_id_key`: `UNIQUE (stripe_event_id)`
- Foreign `billing_event_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action

Indexes:
- `billing_event_by_organization`: `USING btree (organization_id, received_at)`

Policies (1):
- `billing_event_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `billing_event_outcome_check`: `CHECK (outcome = ANY (ARRAY['received'::text, 'applied'::text, 'stale'::text, 'ignored'::text, 'unknown_customer'::text]))`
- `billing_event_stripe_event_id_check`: `CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]{1,250}$'::text)`
- `billing_event_type_check`: `CHECK (type ~ '^[a-z_]{1,64}(\.[a-z_]{1,64}){0,4}$'::text)`

Invariants enforced by triggers:
- `billing_event_kept`: `BEFORE DELETE OR UPDATE ON billing_event FOR EACH ROW EXECUTE FUNCTION billing_records_kept()`
  - "% rows are kept"
  - "a usage snapshot never changes"
  - "a billing event is recorded once; only its outcome follows"
- `billing_event_no_truncate`: `BEFORE TRUNCATE ON billing_event FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()`
  - "% rows are kept"
  - "a usage snapshot never changes"
  - "a billing event is recorded once; only its outcome follows"

### Table `usage_snapshot`

<a id="table-usage-snapshot"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: Operations (no PHI by design): Billing
- Created by `20261029150000_billing` (ADR 0050)
- Primary key: `id`
- Privileges: `tp_app` SELECT; `tp_billing` SELECT, INSERT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029150000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261029150000` |  |
| 3 | `date` | `date` | NOT NULL |  |  | `20261029150000` |  |
| 4 | `granted_practices` | `integer` | NOT NULL |  |  | `20261029150000` |  |
| 5 | `active_practices` | `integer` | NOT NULL |  |  | `20261029150000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029150000` |  |

Keys:
- Primary: (id)
- Unique `usage_snapshot_once`: `UNIQUE (organization_id, date)`
- Foreign `usage_snapshot_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action

Policies (3):
- `usage_snapshot_billing`: PERMISSIVE FOR ALL TO tp_billing
  - USING `true`
  - WITH CHECK `true`
- `usage_snapshot_owner`: PERMISSIVE FOR SELECT TO tp_owner
  - USING `true`
- `usage_snapshot_owners_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `(app_actor_organization_permitted(organization_id, 'organization.billing'::text) OR ( SELECT app_actor_platform_permitted('billing.manage'::text) AS app_actor_platform_permitted))`

Invariants enforced by constraints:
- `usage_snapshot_active_practices_check`: `CHECK (active_practices >= 0)`
- `usage_snapshot_granted_practices_check`: `CHECK (granted_practices >= 0)`

Invariants enforced by triggers:
- `usage_snapshot_kept`: `BEFORE DELETE OR UPDATE ON usage_snapshot FOR EACH ROW EXECUTE FUNCTION billing_records_kept()`
  - "% rows are kept"
  - "a usage snapshot never changes"
  - "a billing event is recorded once; only its outcome follows"
- `usage_snapshot_no_truncate`: `BEFORE TRUNCATE ON usage_snapshot FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept()`
  - "% rows are kept"
  - "a usage snapshot never changes"
  - "a billing event is recorded once; only its outcome follows"

### View `billing_standing`

<a id="table-billing-standing"></a>

- Class: view
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261029150000_billing` (ADR 0050)
- Privileges: `tp_app` SELECT; `tp_billing` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `organization_id` | `uuid` | null |  |  |  |  |
| 2 | `standing` | `text` | null |  |  |  |  |
| 3 | `past_due_since` | `timestamp with time zone` | null |  |  |  |  |
| 4 | `suspended_since` | `timestamp with time zone` | null |  |  |  |  |
| 5 | `invoice_id` | `uuid` | null |  |  |  |  |

View options: `security_invoker=true`.

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

### Table `prospect_request`

<a id="table-prospect-request"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: `tp_app` SELECT, UPDATE(cols)
- Column grant: `tp_app` UPDATE (`organization_id`, `reviewed_by`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `contact_name` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 3 | `contact_email` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 4 | `organization_name` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 5 | `locations` | `integer` | NOT NULL |  |  | `20261030090000` |  |
| 6 | `payers` | `text[]` | NOT NULL |  |  | `20261030090000` |  |
| 7 | `billing_arrangement` | `text` | NOT NULL |  |  | `20261030090000` | one of in_house, billing_firm, mixed, other |
| 8 | `status` | `text` | NOT NULL | `'new'::text` |  | `20261030090000` | one of new, contacted, converted, declined |
| 9 | `organization_id` | `uuid` | null |  | `organization(id)` | `20261030090000` |  |
| 10 | `reviewed_by` | `uuid` | null |  | `user(id)` | `20261030090000` |  |
| 11 | `reviewed_at` | `timestamp with time zone` | null |  |  | `20261030090000` |  |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Foreign `prospect_request_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action
- Foreign `prospect_request_reviewed_by_fkey`: (reviewed_by) -> `user`(id), on delete no action

Indexes:
- `prospect_request_by_status`: `USING btree (status, created_at DESC)`

Policies (3):
- `prospect_request_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `prospect_request_platform_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted)`
- `prospect_request_platform_review`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted)`
  - WITH CHECK `(( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted) AND (reviewed_by = app_actor_id()))`

Invariants enforced by constraints:
- `prospect_request_billing_arrangement_check`: `CHECK (billing_arrangement = ANY (ARRAY['in_house'::text, 'billing_firm'::text, 'mixed'::text, 'other'::text]))`
- `prospect_request_contact_email_check`: `CHECK (contact_email ~ '^[^@ ]+@[^@ ]+$'::text AND length(contact_email) <= 254)`
- `prospect_request_contact_name_check`: `CHECK (btrim(contact_name) <> ''::text AND length(contact_name) <= 200)`
- `prospect_request_converted`: `CHECK ((status = 'converted'::text) = (organization_id IS NOT NULL))`
- `prospect_request_locations_check`: `CHECK (locations >= 1 AND locations <= 1000)`
- `prospect_request_organization_name_check`: `CHECK (btrim(organization_name) <> ''::text AND length(organization_name) <= 200)`
- `prospect_request_payers`: `CHECK (prospect_payers_valid(payers))`
- `prospect_request_review`: `CHECK ((status = 'new'::text) = (reviewed_by IS NULL) AND (reviewed_by IS NULL) = (reviewed_at IS NULL))`
- `prospect_request_status_check`: `CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'declined'::text]))`

Invariants enforced by triggers:
- `prospect_request_fixed`: `BEFORE UPDATE ON prospect_request FOR EACH ROW EXECUTE FUNCTION prospect_request_fixed()`
  - "a prospect request is kept as it was received"
  - "a converted request names its organization for good"

Maintains `updated_at`: `prospect_request_updated_at`.

### Table `invitation`

<a id="table-invitation"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: `tp_app` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `organization_id` | `uuid` | NOT NULL |  | `organization(id)` | `20261030090000` |  |
| 3 | `membership_id` | `uuid` | NOT NULL |  | `membership(id)` | `20261030090000` |  |
| 4 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 5 | `invited_by` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 6 | `sent_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 7 | `expires_at` | `timestamp with time zone` | NOT NULL |  |  | `20261030090000` |  |
| 8 | `sends` | `integer` | NOT NULL | `1` |  | `20261030090000` |  |
| 9 | `last_sent_by` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 10 | `accepted_at` | `timestamp with time zone` | null |  |  | `20261030090000` |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Unique `invitation_membership_id_key`: `UNIQUE (membership_id)`
- Foreign `invitation_invited_by_fkey`: (invited_by) -> `user`(id), on delete no action
- Foreign `invitation_last_sent_by_fkey`: (last_sent_by) -> `user`(id), on delete no action
- Foreign `invitation_membership_id_fkey`: (membership_id) -> `membership`(id), on delete no action
- Foreign `invitation_organization_id_fkey`: (organization_id) -> `organization`(id), on delete no action
- Foreign `invitation_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Indexes:
- `invitation_by_organization`: `USING btree (organization_id, created_at DESC)`
- `invitation_by_user`: `USING btree (user_id)`

Policies (2):
- `invitation_administrators_and_invitee`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((user_id = app_actor_id()) OR (organization_id = ANY (( SELECT app_actor_administered_organization_ids() AS app_actor_administered_organization_ids)::uuid[])) OR ( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted))`
- `invitation_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `invitation_sends_check`: `CHECK (sends >= 1 AND sends <= 1000)`
- `invitation_window`: `CHECK (expires_at > sent_at AND expires_at <= (sent_at + '7 days'::interval))`

Invariants enforced by triggers:
- `invitation_rules`: `BEFORE UPDATE ON invitation FOR EACH ROW EXECUTE FUNCTION invitation_rules()`
  - "an invitation names its organization, membership, user and inviter for good"
  - "an accepted invitation stays accepted"

Maintains `updated_at`: `invitation_updated_at`.

### Table `terms_version`

<a id="table-terms-version"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`document_ref`, `id`, `published_by`, `sha256`, `version`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `version` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 3 | `document_ref` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 4 | `sha256` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 5 | `published_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 6 | `published_by` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Unique `terms_version_version_key`: `UNIQUE (version)`
- Foreign `terms_version_published_by_fkey`: (published_by) -> `user`(id), on delete no action

Indexes:
- `terms_version_by_published`: `USING btree (published_at DESC)`

Policies (3):
- `terms_version_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `terms_version_published_by_platform`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('agreement.record'::text) AS app_actor_platform_permitted) AND (published_by = app_actor_id()))`
- `terms_version_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Invariants enforced by constraints:
- `terms_version_document_ref_check`: `CHECK (document_ref ~ '^[A-Za-z0-9:/._-]{1,200}$'::text)`
- `terms_version_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `terms_version_version_check`: `CHECK (version ~ '^[A-Za-z0-9._-]{1,40}$'::text)`

Invariants enforced by triggers:
- `terms_version_append_only`: `BEFORE DELETE OR UPDATE ON terms_version FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `terms_version_published_now`: `BEFORE INSERT ON terms_version FOR EACH ROW EXECUTE FUNCTION terms_published_now()`

### Table `terms_acceptance`

<a id="table-terms-acceptance"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`id`, `request_id`, `terms_version_id`, `user_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 3 | `terms_version_id` | `uuid` | NOT NULL |  | `terms_version(id)` | `20261030090000` |  |
| 4 | `accepted_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 5 | `request_id` | `text` | null |  |  | `20261030090000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Unique `terms_acceptance_once`: `UNIQUE (user_id, terms_version_id)`
- Foreign `terms_acceptance_terms_version_id_fkey`: (terms_version_id) -> `terms_version`(id), on delete no action
- Foreign `terms_acceptance_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Policies (3):
- `terms_acceptance_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `terms_acceptance_self`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(user_id = app_actor_id())`
- `terms_acceptance_self_and_platform_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `((user_id = app_actor_id()) OR ( SELECT app_actor_platform_permitted('organization.manage'::text) AS app_actor_platform_permitted))`

Invariants enforced by constraints:
- `terms_acceptance_request_id_check`: `CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`

Invariants enforced by triggers:
- `terms_acceptance_accepted_now`: `BEFORE INSERT ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION terms_accepted_now()`
- `terms_acceptance_append_only`: `BEFORE DELETE OR UPDATE ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `screening_prospect`

<a id="table-screening-prospect"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261104090000_free_screening` (ADR 0062)
- Primary key: `id`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261104090000` |  |
| 2 | `practice_name` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 3 | `state` | `text` | NOT NULL |  |  | `20261104090000` | one of AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY, DC, PR, VI, GU, AS, MP |
| 4 | `zip` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 5 | `contact_email` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261104090000` |  |
| 7 | `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '30 days'::interval)` |  | `20261104090000` |  |

Keys:
- Primary: (id)

Indexes:
- `screening_prospect_by_expiry`: `USING btree (expires_at)`

Policies (1):
- `screening_prospect_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `screening_prospect_contact_email`: `CHECK (contact_email ~ '^[a-z0-9!#$%&''*+/=?^_'{\|}~-]+(\.[a-z0-9!#$%&''*+/=?^_'{\|}~-]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'::text AND length(contact_email) <= 254 AND strpos(contact_email, '@'::text) <= 65 AND contact_email = lower(contact_email))`
- `screening_prospect_expiry`: `CHECK (expires_at = (created_at + '30 days'::interval))`
- `screening_prospect_practice_name`: `CHECK (btrim(practice_name) <> ''::text AND length(practice_name) <= 200 AND practice_name = btrim(practice_name))`
- `screening_prospect_state`: `CHECK (state = ANY (ARRAY['AL'::text, 'AK'::text, 'AZ'::text, 'AR'::text, 'CA'::text, 'CO'::text, 'CT'::text, 'DE'::text, 'FL'::text, 'GA'::text, 'HI'::text, 'ID'::text, 'IL'::text, 'IN'::text, 'IA'::text, 'KS'::text, 'KY'::text, 'LA'::text, 'ME'::text, 'MD'::text, 'MA'::text, 'MI'::text, 'MN'::text, 'MS'::text, 'MO'::text, 'MT'::text, 'NE'::text, 'NV'::text, 'NH'::text, 'NJ'::text, 'NM'::text, 'NY'::text, 'NC'::text, 'ND'::text, 'OH'::text, 'OK'::text, 'OR'::text, 'PA'::text, 'RI'::text, 'SC'::text, 'SD'::text, 'TN'::text, 'TX'::text, 'UT'::text, 'VT'::text, 'VA'::text, 'WA'::text, 'WV'::text, 'WI'::text, 'WY'::text, 'DC'::text, 'PR'::text, 'VI'::text, 'GU'::text, 'AS'::text, 'MP'::text]))`
- `screening_prospect_zip`: `CHECK (zip ~ '^[0-9]{5}$'::text)`

Invariants enforced by triggers:
- `screening_prospect_fixed`: `BEFORE UPDATE ON screening_prospect FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `screening_prospect_kept_until_expiry`: `BEFORE DELETE ON screening_prospect FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry()`
  - "a screening is kept until it expires, 30 days after its upload"
- `screening_prospect_no_truncate`: `BEFORE TRUNCATE ON screening_prospect FOR EACH STATEMENT EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `screening_upload`

<a id="table-screening-upload"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261104090000_free_screening` (ADR 0062)
- Primary key: `id`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261104090000` |  |
| 2 | `prospect_id` | `uuid` | NOT NULL |  | `screening_prospect(id)` | `20261104090000` |  |
| 3 | `file_sha256` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 4 | `row_count` | `integer` | NOT NULL |  |  | `20261104090000` |  |
| 5 | `status` | `text` | NOT NULL |  |  | `20261104090000` | one of accepted, rejected |
| 6 | `rejection_reasons` | `jsonb` | NOT NULL | `'[]'::jsonb` |  | `20261104090000` |  |
| 7 | `left_out_rows` | `integer` | NOT NULL | `0` |  | `20261104090000` |  |
| 8 | `left_out_claim_lines` | `integer` | NOT NULL | `0` |  | `20261104090000` |  |
| 9 | `left_out_allowed_cents` | `bigint` | NOT NULL | `0` |  | `20261104090000` |  |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261104090000` |  |
| 11 | `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '30 days'::interval)` |  | `20261104090000` |  |

Keys:
- Primary: (id)
- Foreign `screening_upload_prospect_id_fkey`: (prospect_id) -> `screening_prospect`(id), on delete cascade

Indexes:
- `screening_upload_by_prospect`: `USING btree (prospect_id)`

Policies (1):
- `screening_upload_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `screening_upload_accepted_rows`: `CHECK (status <> 'accepted'::text OR row_count >= 1 AND row_count <= 50000 AND (row_count + left_out_rows) <= 50000)`
- `screening_upload_expiry`: `CHECK (expires_at = (created_at + '30 days'::interval))`
- `screening_upload_file_sha256`: `CHECK (file_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `screening_upload_left_out_accepted`: `CHECK (status = 'accepted'::text OR left_out_rows = 0)`
- `screening_upload_left_out_allowed`: `CHECK (left_out_allowed_cents >= 0 AND left_out_allowed_cents <= (2500000::bigint * left_out_claim_lines))`
- `screening_upload_left_out_claim_lines`: `CHECK (left_out_claim_lines >= left_out_rows AND left_out_claim_lines <= (10 * left_out_rows))`
- `screening_upload_left_out_rows`: `CHECK (left_out_rows >= 0 AND left_out_rows <= 50000)`
- `screening_upload_reasons`: `CHECK (screening_rejections_valid(rejection_reasons))`
- `screening_upload_rejected`: `CHECK ((status = 'rejected'::text) = CASE     WHEN jsonb_typeof(rejection_reasons) = 'array'::text THEN jsonb_array_length(rejection_reasons) > 0     ELSE false END)`
- `screening_upload_row_count`: `CHECK (row_count >= 0 AND row_count <= 10000000)`
- `screening_upload_status`: `CHECK (status = ANY (ARRAY['accepted'::text, 'rejected'::text]))`

Invariants enforced by triggers:
- `screening_upload_fixed`: `BEFORE UPDATE ON screening_upload FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `screening_upload_kept_until_expiry`: `BEFORE DELETE ON screening_upload FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry()`
  - "a screening is kept until it expires, 30 days after its upload"
- `screening_upload_no_truncate`: `BEFORE TRUNCATE ON screening_upload FOR EACH STATEMENT EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `screening_place_of_service_split`

<a id="table-screening-place-of-service-split"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261104090000_free_screening` (ADR 0062)
- Primary key: `id`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261104090000` |  |
| 2 | `settings` | `jsonb` | NOT NULL |  |  | `20261104090000` |  |
| 3 | `approved_by` | `uuid` | NOT NULL |  | `user(id)` | `20261104090000` |  |
| 4 | `approved_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261104090000` |  |

Keys:
- Primary: (id)
- Foreign `screening_place_of_service_split_approved_by_fkey`: (approved_by) -> `user`(id), on delete no action

Indexes:
- `screening_place_of_service_split_in_force`: `USING btree (approved_at DESC, id DESC)`

Policies (1):
- `screening_place_of_service_split_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `screening_place_of_service_split_settings`: `CHECK (screening_split_valid(settings))`

Invariants enforced by triggers:
- `screening_place_of_service_split_append_only`: `BEFORE DELETE OR UPDATE ON screening_place_of_service_split FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `screening_place_of_service_split_no_truncate`: `BEFORE TRUNCATE ON screening_place_of_service_split FOR EACH STATEMENT EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `screening_run`

<a id="table-screening-run"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261104090000_free_screening` (ADR 0062)
- Primary key: `id`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261104090000` |  |
| 2 | `upload_id` | `uuid` | NOT NULL |  | `screening_upload(id)` | `20261104090000` |  |
| 3 | `release_no` | `integer` | NOT NULL |  |  | `20261104090000` |  |
| 4 | `release_manifest_sha256` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 5 | `place_of_service_split_id` | `uuid` | NOT NULL |  | `screening_place_of_service_split(id)` | `20261104090000` |  |
| 6 | `row_count` | `integer` | NOT NULL |  |  | `20261104090000` |  |
| 7 | `status` | `text` | NOT NULL | `'queued'::text` |  | `20261104090000` | one of queued, pricing, complete, failed |
| 8 | `attempts` | `integer` | NOT NULL | `0` |  | `20261104090000` |  |
| 9 | `started_at` | `timestamp with time zone` | null |  |  | `20261104090000` |  |
| 10 | `completed_at` | `timestamp with time zone` | null |  |  | `20261104090000` |  |
| 11 | `failed_at` | `timestamp with time zone` | null |  |  | `20261104090000` |  |
| 12 | `engine_version` | `text` | null |  |  | `20261104090000` |  |
| 13 | `failure_code` | `text` | null |  |  | `20261104090000` |  |
| 14 | `result_token_sha256` | `text` | null |  |  | `20261104090000` |  |
| 15 | `converted_prospect_request_id` | `uuid` | null |  | `prospect_request(id)` | `20261104090000` |  |
| 16 | `converted_at` | `timestamp with time zone` | null |  |  | `20261104090000` |  |
| 17 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261104090000` |  |
| 18 | `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '30 days'::interval)` |  | `20261104090000` |  |

Keys:
- Primary: (id)
- Unique `screening_run_result_token_sha256_key`: `UNIQUE (result_token_sha256)`
- Unique `screening_run_upload_id_key`: `UNIQUE (upload_id)`
- Foreign `screening_run_converted_prospect_request_id_fkey`: (converted_prospect_request_id) -> `prospect_request`(id), on delete no action
- Foreign `screening_run_place_of_service_split_id_fkey`: (place_of_service_split_id) -> `screening_place_of_service_split`(id), on delete no action
- Foreign `screening_run_upload_id_fkey`: (upload_id) -> `screening_upload`(id), on delete cascade

Indexes:
- `screening_run_by_status`: `USING btree (status, created_at)`

Policies (1):
- `screening_run_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `screening_run_attempts`: `CHECK (attempts >= 0 AND attempts <= 3)`
- `screening_run_complete`: `CHECK ((status = 'complete'::text) = (result_token_sha256 IS NOT NULL) AND (status = 'complete'::text) = (completed_at IS NOT NULL) AND (status = 'complete'::text) = (engine_version IS NOT NULL))`
- `screening_run_converted`: `CHECK ((converted_at IS NULL) = (converted_prospect_request_id IS NULL) AND (converted_at IS NULL OR status = 'complete'::text))`
- `screening_run_engine_version`: `CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,31}$'::text)`
- `screening_run_expiry`: `CHECK (expires_at = (created_at + '30 days'::interval))`
- `screening_run_failed`: `CHECK ((status = 'failed'::text) = (failure_code IS NOT NULL) AND (status = 'failed'::text) = (failed_at IS NOT NULL))`
- `screening_run_failure_code`: `CHECK (failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'::text)`
- `screening_run_release_manifest`: `CHECK (release_manifest_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `screening_run_release_no`: `CHECK (release_no > 0)`
- `screening_run_result_token`: `CHECK (result_token_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `screening_run_row_count`: `CHECK (row_count >= 1 AND row_count <= 50000)`
- `screening_run_started`: `CHECK ((status <> 'queued'::text OR started_at IS NULL AND attempts = 0) AND ((status <> ALL (ARRAY['pricing'::text, 'complete'::text])) OR started_at IS NOT NULL AND attempts >= 1))`
- `screening_run_status`: `CHECK (status = ANY (ARRAY['queued'::text, 'pricing'::text, 'complete'::text, 'failed'::text]))`

Invariants enforced by triggers:
- `screening_run_kept_until_expiry`: `BEFORE DELETE ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry()`
  - "a screening is kept until it expires, 30 days after its upload"
- `screening_run_no_truncate`: `BEFORE TRUNCATE ON screening_run FOR EACH STATEMENT EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `screening_run_rules`: `BEFORE UPDATE ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_run_rules()`
  - "a screening run keeps its upload, release, split, row count and dates"
  - "a screening run is claimed one attempt at a time, from when it is claimed"
  - "a screening run ends on the attempt that priced it"
  - "a screening converts once it is complete"
  - "a complete screening keeps its result and its link"
  - "a screening converts to an audit request once"
  - "a screening run moves queued, pricing, then complete or failed"

### Table `screening_result`

<a id="table-screening-result"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261104090000_free_screening` (ADR 0062)
- Primary key: `run_id`, `row_no`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `run_id` | `uuid` | NOT NULL |  | `screening_run(id)` | `20261104090000` |  |
| 2 | `row_no` | `integer` | NOT NULL |  |  | `20261104090000` |  |
| 3 | `procedure_code` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 4 | `modifiers` | `text[]` | NOT NULL |  |  | `20261104090000` |  |
| 5 | `units` | `integer` | NOT NULL |  |  | `20261104090000` |  |
| 6 | `place_of_service` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 7 | `payer_product` | `text` | NOT NULL |  |  | `20261104090000` | one of medicare_ffs, ma_noncontracted, ma_contracted, commercial, medicaid, other |
| 8 | `service_band` | `text` | NOT NULL |  |  | `20261104090000` |  |
| 9 | `claim_count` | `integer` | NOT NULL |  |  | `20261104090000` |  |
| 10 | `observed_allowed_cents` | `bigint` | NOT NULL |  |  | `20261104090000` |  |
| 11 | `disposition` | `text` | NOT NULL |  |  | `20261104090000` | one of pending, priced, unpriced, rates_change_in_band, contract_required, not_screened |
| 12 | `expected_line_cents` | `bigint` | null |  |  | `20261104090000` |  |
| 13 | `expected_line_unrounded` | `numeric` | null |  |  | `20261104090000` |  |
| 14 | `expected_cents` | `bigint` | null |  |  | `20261104090000` |  |
| 15 | `difference_cents` | `bigint` | null |  |  | `20261104090000` |  |
| 16 | `in_reduction_pool` | `boolean` | null |  |  | `20261104090000` |  |
| 17 | `reduced_line_cents` | `bigint` | null |  |  | `20261104090000` |  |
| 18 | `reduced_line_unrounded` | `numeric` | null |  |  | `20261104090000` |  |
| 19 | `reduced_cents` | `bigint` | null |  |  | `20261104090000` |  |
| 20 | `reduced_difference_cents` | `bigint` | null |  |  | `20261104090000` |  |
| 21 | `reduced_trace_sha256` | `text` | null |  |  | `20261104090000` |  |
| 22 | `unpriced_reason` | `text` | null |  |  | `20261104090000` | one of NO_AGREEMENT, NO_MAPPING, AMBIGUOUS_RATE, NO_RATE_FOR_CODE, NO_PFS_VALUE, UNSUPPORTED_METHOD, SECONDARY_PAYER, MUE_EXCEEDED, UNITS_RULE_UNKNOWN, DATE_OUTSIDE_VERSIONS, REVERSED_CLAIM, ENGINE_ERROR |
| 23 | `unpriced_detail` | `text` | null |  |  | `20261104090000` |  |
| 24 | `trace_sha256` | `text` | null |  |  | `20261104090000` |  |

Keys:
- Primary: (run_id, row_no)
- Unique `screening_result_once`: `UNIQUE (run_id, procedure_code, modifiers, units, place_of_service, payer_product, service_band)`
- Foreign `screening_result_run_id_fkey`: (run_id) -> `screening_run`(id), on delete cascade

Indexes:
- `screening_result_pending`: `USING btree (run_id, row_no) WHERE (disposition = 'pending'::text)`

Policies (1):
- `screening_result_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `screening_result_claim_count`: `CHECK (claim_count >= 11 AND claim_count <= 100000)`
- `screening_result_contract_required`: `CHECK ((payer_product = ANY (ARRAY['ma_contracted'::text, 'commercial'::text])) = (disposition = 'contract_required'::text))`
- `screening_result_disposition`: `CHECK (disposition = ANY (ARRAY['pending'::text, 'priced'::text, 'unpriced'::text, 'rates_change_in_band'::text, 'contract_required'::text, 'not_screened'::text]))`
- `screening_result_figures`: `CHECK (disposition <> 'priced'::text OR expected_line_cents >= 0 AND abs(expected_line_unrounded - expected_line_cents::numeric) < 1::numeric AND expected_cents = (expected_line_cents * claim_count) AND difference_cents = (expected_cents - observed_allowed_cents))`
- `screening_result_medicare`: `CHECK ((payer_product <> ALL (ARRAY['medicare_ffs'::text, 'ma_noncontracted'::text])) OR (disposition = ANY (ARRAY['pending'::text, 'priced'::text, 'unpriced'::text, 'rates_change_in_band'::text])))`
- `screening_result_modifiers`: `CHECK (screening_modifiers_valid(modifiers))`
- `screening_result_not_screened`: `CHECK ((payer_product = ANY (ARRAY['medicaid'::text, 'other'::text])) = (disposition = 'not_screened'::text))`
- `screening_result_observed`: `CHECK (observed_allowed_cents >= 0 AND observed_allowed_cents <= '99999999999'::bigint AND observed_allowed_cents <= (2500000::bigint * claim_count))`
- `screening_result_payer_product`: `CHECK (payer_product = ANY (ARRAY['medicare_ffs'::text, 'ma_noncontracted'::text, 'ma_contracted'::text, 'commercial'::text, 'medicaid'::text, 'other'::text]))`
- `screening_result_place_of_service`: `CHECK (place_of_service ~ '^(0[1-9]\|[1-9][0-9])$'::text)`
- `screening_result_priced`: `CHECK ((disposition = 'priced'::text) = (expected_line_cents IS NOT NULL) AND (disposition = 'priced'::text) = (expected_line_unrounded IS NOT NULL) AND (disposition = 'priced'::text) = (expected_cents IS NOT NULL) AND (disposition = 'priced'::text) = (difference_cents IS NOT NULL) AND (disposition = 'priced'::text) = (in_reduction_pool IS NOT NULL))`
- `screening_result_procedure_code`: `CHECK (procedure_code ~ '^([0-9]{4}[0-9FMTU]\|[A-V][0-9]{4})$'::text)`
- `screening_result_reduced`: `CHECK (COALESCE(disposition = 'priced'::text AND in_reduction_pool, false) = (reduced_line_cents IS NOT NULL) AND COALESCE(disposition = 'priced'::text AND in_reduction_pool, false) = (reduced_line_unrounded IS NOT NULL) AND COALESCE(disposition = 'priced'::text AND in_reduction_pool, false) = (reduced_cents IS NOT NULL) AND COALESCE(disposition = 'priced'::text AND in_reduction_pool, false) = (reduced_difference_cents IS NOT NULL) AND COALESCE(disposition = 'priced'::text AND in_reduction_pool, false) = (reduced_trace_sha256 IS NOT NULL))`
- `screening_result_reduced_figures`: `CHECK (reduced_line_cents IS NULL OR reduced_line_cents >= 0 AND reduced_line_cents <= expected_line_cents AND abs(reduced_line_unrounded - reduced_line_cents::numeric) < 1::numeric AND reduced_cents = (reduced_line_cents * claim_count) AND reduced_difference_cents = (reduced_cents - observed_allowed_cents))`
- `screening_result_reduced_trace_sha256`: `CHECK (reduced_trace_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `screening_result_row_no`: `CHECK (row_no >= 1 AND row_no <= 50000)`
- `screening_result_service_band`: `CHECK (service_band ~ '^20[0-9]{2}-Q[1-4]$'::text)`
- `screening_result_trace`: `CHECK ((disposition = ANY (ARRAY['priced'::text, 'unpriced'::text, 'rates_change_in_band'::text])) = (trace_sha256 IS NOT NULL))`
- `screening_result_trace_sha256`: `CHECK (trace_sha256 ~ '^[0-9a-f]{64}$'::text)`
- `screening_result_units`: `CHECK (units >= 1 AND units <= 999)`
- `screening_result_unpriced`: `CHECK ((disposition = 'unpriced'::text) = (unpriced_reason IS NOT NULL) AND (unpriced_detail IS NULL OR (unpriced_reason = ANY (ARRAY['ENGINE_ERROR'::text, 'NO_PFS_VALUE'::text]))))`
- `screening_result_unpriced_detail`: `CHECK (unpriced_detail ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `screening_result_unpriced_reason`: `CHECK (unpriced_reason = ANY (ARRAY['NO_AGREEMENT'::text, 'NO_MAPPING'::text, 'AMBIGUOUS_RATE'::text, 'NO_RATE_FOR_CODE'::text, 'NO_PFS_VALUE'::text, 'UNSUPPORTED_METHOD'::text, 'SECONDARY_PAYER'::text, 'MUE_EXCEEDED'::text, 'UNITS_RULE_UNKNOWN'::text, 'DATE_OUTSIDE_VERSIONS'::text, 'REVERSED_CLAIM'::text, 'ENGINE_ERROR'::text]))`

Invariants enforced by triggers:
- `screening_result_inserted`: `AFTER INSERT ON screening_result REFERENCING NEW TABLE AS screening_inserted FOR EACH STATEMENT EXECUTE FUNCTION screening_result_inserted()`
  - "a screening's rows are inserted with its run, before it is priced"
- `screening_result_no_truncate`: `BEFORE TRUNCATE ON screening_result FOR EACH STATEMENT EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `screening_result_rules`: `BEFORE UPDATE ON screening_result FOR EACH ROW EXECUTE FUNCTION screening_result_rules()`
  - "a screening row keeps the facts it was uploaded with"
  - "a screening row is priced once, from pending"

## 13. Operations

<a id="area-operations"></a>

The append-only audit log, job runs, in-app notifications and digests (counts and totals only), feature flags, mutation request keys, rate-limit counters, restore drills, the public status page, support tickets and the receipts of the support inbox, SOC 2 evidence records, and the migration ledger.

| Table | Class | RLS / FORCE | Policies | tp_app | Created by | Dictionary |
| --- | --- | --- | --- | --- | --- | --- |
| [`audit_event`](#table-audit-event) | tenant (nullable practice_id), not registered | yes / yes | 5 | SELECT, INSERT(cols) | `20261015140500_audit_and_operations` | Append-only |
| [`job_run`](#table-job-run) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261016121000_job_runs` | Queue |
| [`notification`](#table-notification) | PHI (registered) | yes / yes | 4 | SELECT, INSERT(cols), UPDATE(cols) | `20261020090000_monitoring_digests_notifications` | In-app |
| [`digest`](#table-digest) | PHI (registered) | yes / yes | 1 | SELECT, INSERT(cols), UPDATE(cols) | `20261020090000_monitoring_digests_notifications` | Email digest |
| [`feature_flag`](#table-feature-flag) | global (no practice_id, no RLS) | no / no | 0 | SELECT | `20261029090000_model_gateway` | Flags |
| [`mutation_request`](#table-mutation-request) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 2 | SELECT, INSERT(cols) | `20261015170000_identity_and_permissions` | not in the Data dictionary |
| [`rate_limit_counter`](#table-rate-limit-counter) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`restore_drill`](#table-restore-drill) | global (no practice_id, no RLS) | no / no | 0 | - | `20261015140500_audit_and_operations` | not in the Data dictionary |
| [`status_component`](#table-status-component) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT, UPDATE(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`status_incident`](#table-status-incident) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT, INSERT(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`status_incident_update`](#table-status-incident-update) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT, INSERT(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`support_ticket`](#table-support-ticket) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 4 | SELECT, INSERT(cols), UPDATE(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`support_mail_receipt`](#table-support-mail-receipt) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 1 | - | `20261101120000_support_mail` | not in the Data dictionary |
| [`compliance_record`](#table-compliance-record) | organization- or user-scoped (RLS, no practice_id) | yes / yes | 3 | SELECT, INSERT(cols) | `20261030090000_customer_sign_in_and_readiness` | not in the Data dictionary |
| [`schema_migrations`](#table-schema-migrations) | global (no practice_id, no RLS) | no / no | 0 | - | the migration runner (packages/db/src/migrate.ts, CREATE TABLE IF NOT EXISTS before the first migration; ADR 0009) | not in the Data dictionary |

### Table `audit_event`

<a id="table-audit-event"></a>

- Class: tenant (nullable practice_id), not registered
- Row-level security: enabled, forced; 5 policies; owner `tp_owner`
- Dictionary: Operations (no PHI by design): Append-only
- Created by `20261015140500_audit_and_operations` (ADR 0013, ADR 0014); its DDL, policies or trigger functions changed by `20261015180000_tenancy_hardening`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols); `tp_operator` SELECT
- Column grant: `tp_app` INSERT (`action`, `actor_id`, `actor_kind`, `grant_id`, `id`, `object_id`, `object_type`, `practice_id`, `purpose`, `request_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140500` |  |
| 2 | `actor_id` | `uuid` | null |  |  | `20261015140500` |  |
| 3 | `actor_kind` | `text` | NOT NULL |  |  | `20261015140500` | one of user, service, system |
| 4 | `action` | `text` | NOT NULL |  |  | `20261015140500` |  |
| 5 | `object_type` | `text` | NOT NULL |  |  | `20261015140500` |  |
| 6 | `object_id` | `uuid` | null |  |  | `20261015140500` |  |
| 7 | `practice_id` | `uuid` | null |  |  | `20261015140500` |  |
| 8 | `grant_id` | `uuid` | null |  |  | `20261015140500` |  |
| 9 | `purpose` | `text` | null |  |  | `20261015140500` |  |
| 10 | `request_id` | `text` | null |  |  | `20261015140500` |  |
| 11 | `at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140500` |  |

Keys:
- Primary: (id)

Indexes:
- `audit_event_by_at`: `USING btree (at)`
- `audit_event_by_object`: `USING btree (object_type, object_id)`
- `audit_event_by_practice`: `USING btree (practice_id, at)`

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

Invariants enforced by constraints:
- `audit_event_action_check`: `CHECK (action ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `audit_event_actor`: `CHECK (actor_kind = 'system'::text OR actor_id IS NOT NULL)`
- `audit_event_actor_kind_check`: `CHECK (actor_kind = ANY (ARRAY['user'::text, 'service'::text, 'system'::text]))`
- `audit_event_object_type_check`: `CHECK (object_type ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `audit_event_purpose_check`: `CHECK (purpose ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `audit_event_read_purpose`: `CHECK (action <> 'read'::text OR purpose IS NOT NULL)`
- `audit_event_request_id_check`: `CHECK (request_id ~ '^[A-Za-z0-9._:-]{1,128}$'::text)`

Invariants enforced by triggers:
- `audit_event_append_only`: `BEFORE DELETE OR UPDATE ON audit_event FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `audit_event_no_truncate`: `BEFORE TRUNCATE ON audit_event FOR EACH STATEMENT EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `job_run`

<a id="table-job-run"></a>

- Class: PHI (registered); registry policy `job_run_tenant`, registered by `20261016121000_job_runs`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Operations (no PHI by design): Queue
- Created by `20261016121000_job_runs` (ADR 0019); its DDL, policies or trigger functions changed by `20261020090000_monitoring_digests_notifications`, `20261023090000_packets_submissions_and_responses`, `20261024120000_reconciliation_and_roi_documents`, `20261025090000_report_documents_and_export_history`, `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`attempts`, `error_code`, `finished_at`, `id`, `idempotency_key`, `job_id`, `job_type`, `outcome`, `practice_id`, `singleton_key`, `started_at`)
- Column grant: `tp_app` UPDATE (`attempts`, `error_code`, `finished_at`, `outcome`, `started_at`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261016121000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261016121000` |  |
| 3 | `job_id` | `uuid` | NOT NULL |  |  | `20261016121000` | not in the dictionary |
| 4 | `job_type` | `text` | NOT NULL |  |  | `20261016121000` | one of intake, parse_835, monitor, price, triage, audit_report, reconcile, digest, export, packet_export, roi_statement, report_document; not in the dictionary |
| 5 | `singleton_key` | `text` | NOT NULL |  |  | `20261016121000` |  |
| 6 | `idempotency_key` | `text` | NOT NULL |  |  | `20261016121000` |  |
| 7 | `attempts` | `integer` | NOT NULL |  |  | `20261016121000` |  |
| 8 | `outcome` | `text` | NOT NULL |  |  | `20261016121000` | one of running, retrying, succeeded, failed, refused |
| 9 | `error_code` | `text` | null |  |  | `20261016121000` | not in the dictionary |
| 10 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016121000` | not in the dictionary |
| 11 | `finished_at` | `timestamp with time zone` | null |  |  | `20261016121000` | not in the dictionary |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016121000` |  |
| 13 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261016121000` |  |

Keys:
- Primary: (id)
- Unique `job_run_once`: `UNIQUE (job_id)`
- Foreign `job_run_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Indexes:
- `job_run_by_practice`: `USING btree (practice_id, started_at DESC, id)`

Policies (1):
- `job_run_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `job_run_attempts_check`: `CHECK (attempts >= 1)`
- `job_run_error_code_check`: `CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'::text)`
- `job_run_finished`: `CHECK ((outcome = 'running'::text) = (finished_at IS NULL))`
- `job_run_idempotency_key_check`: `CHECK (idempotency_key ~ '^[A-Za-z0-9-]{1,64}$'::text)`
- `job_run_job_type_check`: `CHECK (job_type = ANY (ARRAY['intake'::text, 'parse_835'::text, 'monitor'::text, 'price'::text, 'triage'::text, 'audit_report'::text, 'reconcile'::text, 'digest'::text, 'export'::text, 'packet_export'::text, 'roi_statement'::text, 'report_document'::text]))`
- `job_run_outcome_check`: `CHECK (outcome = ANY (ARRAY['running'::text, 'retrying'::text, 'succeeded'::text, 'failed'::text, 'refused'::text]))`
- `job_run_singleton_key_check`: `CHECK (singleton_key ~ '^[a-z0-9_]+:[0-9a-f-]{36}:[A-Za-z0-9-]{1,64}$'::text)`

Maintains `updated_at`: `job_run_updated_at`.

### Table `notification`

<a id="table-notification"></a>

- Class: PHI (registered); registry policy `notification_tenant`, registered by `20261020090000_monitoring_digests_notifications`, qualifies: yes
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: Operations (no PHI by design): In-app
- Created by `20261020090000_monitoring_digests_notifications` (ADR 0039); its DDL, policies or trigger functions changed by `20261023120000_recovery_ledger`, `20261027090000_packet_and_ledger_review`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`counts`, `id`, `kind`, `practice_id`, `subject_id`, `totals_cents`, `user_id`)
- Column grant: `tp_app` UPDATE (`read_at`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261020090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261020090000` | not in the dictionary |
| 3 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261020090000` |  |
| 4 | `kind` | `text` | NOT NULL |  |  | `20261020090000` | one of monitoring_run, digest, recoupment, follow_up |
| 5 | `subject_id` | `uuid` | NOT NULL |  |  | `20261020090000` | not in the dictionary |
| 6 | `counts` | `jsonb` | NOT NULL |  |  | `20261020090000` |  |
| 7 | `totals_cents` | `jsonb` | NOT NULL |  |  | `20261020090000` |  |
| 8 | `read_at` | `timestamp with time zone` | null |  |  | `20261020090000` |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261020090000` |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261020090000` |  |

Keys:
- Primary: (id)
- Unique `notification_once`: `UNIQUE (user_id, kind, subject_id)`
- Foreign `notification_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action
- Foreign `notification_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Indexes:
- `notification_by_practice`: `USING btree (practice_id, user_id, created_at DESC, id)`

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

Invariants enforced by constraints:
- `notification_counts_only`: `CHECK (figures_are_counts(counts))`
- `notification_kind_check`: `CHECK (kind = ANY (ARRAY['monitoring_run'::text, 'digest'::text, 'recoupment'::text, 'follow_up'::text]))`
- `notification_totals_only`: `CHECK (figures_are_cents(totals_cents))`

Invariants enforced by triggers:
- `notification_rules`: `BEFORE DELETE OR UPDATE ON notification FOR EACH ROW EXECUTE FUNCTION notification_rules()`
  - "a notification is never deleted"
  - "a notification never changes; only when it was read is recorded"
  - "a notification is read once"
  - "a notification records the time it was read"

Maintains `updated_at`: `notification_updated_at`.

### Table `digest`

<a id="table-digest"></a>

- Class: PHI (registered); registry policy `digest_tenant`, registered by `20261020090000_monitoring_digests_notifications`, qualifies: yes
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: Operations (no PHI by design): Email digest
- Created by `20261020090000_monitoring_digests_notifications` (ADR 0039); its DDL, policies or trigger functions changed by `20261029150000_billing`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`counts`, `id`, `period`, `practice_id`, `totals_cents`)
- Column grant: `tp_app` UPDATE (`sent_at`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261020090000` |  |
| 2 | `practice_id` | `uuid` | NOT NULL |  | `practice(id)` | `20261020090000` |  |
| 3 | `period` | `text` | NOT NULL |  |  | `20261020090000` |  |
| 4 | `counts` | `jsonb` | NOT NULL |  |  | `20261020090000` |  |
| 5 | `totals_cents` | `jsonb` | NOT NULL |  |  | `20261020090000` |  |
| 6 | `sent_at` | `timestamp with time zone` | null |  |  | `20261020090000` |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261020090000` |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261020090000` |  |

Keys:
- Primary: (id)
- Unique `digest_once`: `UNIQUE (practice_id, period)`
- Foreign `digest_practice_id_fkey`: (practice_id) -> `practice`(id), on delete no action

Policies (1):
- `digest_tenant`: PERMISSIVE FOR ALL TO public
  - USING `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`
  - WITH CHECK `(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`

Invariants enforced by constraints:
- `digest_counts_only`: `CHECK (figures_are_counts(counts))`
- `digest_period_check`: `CHECK (period ~ '^[0-9]{4}-(0[1-9]\|1[0-2])$'::text)`
- `digest_totals_only`: `CHECK (figures_are_cents(totals_cents))`

Invariants enforced by triggers:
- `digest_refused_while_suspended`: `BEFORE INSERT ON digest FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()`
  - "%"
- `digest_rules`: `BEFORE INSERT OR DELETE OR UPDATE ON digest FOR EACH ROW EXECUTE FUNCTION digest_rules()`
  - "a digest is never deleted"
  - "a digest is recorded before it is sent"
  - "a digest's figures never change once recorded"
  - "a digest is sent once"
  - "a digest records the time it was sent"

Maintains `updated_at`: `digest_updated_at`.

### Table `feature_flag`

<a id="table-feature-flag"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: Operations (no PHI by design): Flags
- Created by `20261029090000_model_gateway` (ADR 0048); its DDL, policies or trigger functions changed by `20261030090000_customer_sign_in_and_readiness`
- Primary key: `id`
- Privileges: `tp_app` SELECT; `tp_operator` SELECT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261029090000` |  |
| 2 | `key` | `text` | NOT NULL |  |  | `20261029090000` | one of model.kill_switch, model.read_denial_letter, model.daily_budget_cents, platform.maintenance |
| 3 | `scope` | `text` | NOT NULL |  |  | `20261029090000` | one of global, organization, practice |
| 4 | `scope_id` | `uuid` | null |  |  | `20261029090000` |  |
| 5 | `value` | `jsonb` | NOT NULL |  |  | `20261029090000` |  |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029090000` |  |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261029090000` |  |

Keys:
- Primary: (id)
- Unique `feature_flag_once`: `UNIQUE NULLS NOT DISTINCT (key, scope, scope_id)`

Policies (0):
- none

Invariants enforced by constraints:
- `feature_flag_key_check`: `CHECK (key = ANY (ARRAY['model.kill_switch'::text, 'model.read_denial_letter'::text, 'model.daily_budget_cents'::text, 'platform.maintenance'::text]))`
- `feature_flag_maintenance_global`: `CHECK (key <> 'platform.maintenance'::text OR scope = 'global'::text)`
- `feature_flag_scope_check`: `CHECK (scope = ANY (ARRAY['global'::text, 'organization'::text, 'practice'::text]))`
- `feature_flag_scope_id`: `CHECK ((scope = 'global'::text) = (scope_id IS NULL))`
- `feature_flag_value`: `CHECK ( CASE key     WHEN 'model.daily_budget_cents'::text THEN jsonb_typeof(value) = 'string'::text AND (value #>> '{}'::text[]) ~ '^(0\|[1-9][0-9]{0,11})$'::text     ELSE jsonb_typeof(value) = 'boolean'::text END)`

Maintains `updated_at`: `feature_flag_updated_at`.

### Table `mutation_request`

<a id="table-mutation-request"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 2 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261015170000_identity_and_permissions` (ADR 0012, ADR 0016, ADR 0017)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`id`, `request_key`, `route_id`, `user_id`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015170000` |  |
| 2 | `user_id` | `uuid` | NOT NULL |  | `user(id)` | `20261015170000` |  |
| 3 | `request_key` | `uuid` | NOT NULL |  |  | `20261015170000` |  |
| 4 | `route_id` | `text` | NOT NULL |  |  | `20261015170000` |  |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015170000` |  |

Keys:
- Primary: (id)
- Unique `mutation_request_once`: `UNIQUE (user_id, request_key)`
- Foreign `mutation_request_user_id_fkey`: (user_id) -> `user`(id), on delete no action

Policies (2):
- `mutation_request_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `mutation_request_self`: PERMISSIVE FOR ALL TO tp_app
  - USING `(user_id = app_actor_id())`
  - WITH CHECK `(user_id = app_actor_id())`

Invariants enforced by constraints:
- `mutation_request_route_id_check`: `CHECK (route_id ~ '^[a-z][a-z0-9_.]{0,63}$'::text)`

### Table `rate_limit_counter`

<a id="table-rate-limit-counter"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `bucket`, `subject`, `window_start`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `bucket` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 2 | `subject` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 3 | `window_start` | `timestamp with time zone` | NOT NULL |  |  | `20261030090000` |  |
| 4 | `hits` | `integer` | NOT NULL |  |  | `20261030090000` |  |

Keys:
- Primary: (bucket, subject, window_start)

Indexes:
- `rate_limit_counter_by_window`: `USING btree (window_start)`

Policies (1):
- `rate_limit_counter_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `rate_limit_counter_bucket_check`: `CHECK (bucket ~ '^[a-z][a-z0-9_]{0,31}$'::text)`
- `rate_limit_counter_hits_check`: `CHECK (hits >= 1)`
- `rate_limit_counter_subject_check`: `CHECK (subject ~ '^[0-9a-f]{64}$'::text)`

### Table `restore_drill`

<a id="table-restore-drill"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261015140500_audit_and_operations` (ADR 0013, ADR 0014)
- Primary key: `id`
- Privileges: `tp_operator` SELECT, INSERT

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261015140500` |  |
| 2 | `snapshot_ref` | `text` | NOT NULL |  |  | `20261015140500` |  |
| 3 | `target_ref` | `text` | NOT NULL |  |  | `20261015140500` |  |
| 4 | `started_at` | `timestamp with time zone` | NOT NULL |  |  | `20261015140500` |  |
| 5 | `completed_at` | `timestamp with time zone` | NOT NULL |  |  | `20261015140500` |  |
| 6 | `duration_ms` | `bigint` | NOT NULL |  |  | `20261015140500` |  |
| 7 | `outcome` | `text` | NOT NULL |  |  | `20261015140500` | one of passed, failed |
| 8 | `row_counts` | `jsonb` | NOT NULL |  |  | `20261015140500` |  |
| 9 | `catalog_problems` | `jsonb` | NOT NULL |  |  | `20261015140500` |  |
| 10 | `error_code` | `text` | null |  |  | `20261015140500` |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140500` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261015140500` |  |

Keys:
- Primary: (id)

Policies (0):
- none

Invariants enforced by constraints:
- `restore_drill_catalog_problems_check`: `CHECK (jsonb_typeof(catalog_problems) = 'array'::text)`
- `restore_drill_duration_ms_check`: `CHECK (duration_ms >= 0)`
- `restore_drill_error_code_check`: `CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'::text)`
- `restore_drill_failure_code`: `CHECK ((outcome = 'failed'::text) = (error_code IS NOT NULL))`
- `restore_drill_order`: `CHECK (completed_at >= started_at)`
- `restore_drill_outcome_check`: `CHECK (outcome = ANY (ARRAY['passed'::text, 'failed'::text]))`
- `restore_drill_row_counts_check`: `CHECK (jsonb_typeof(row_counts) = 'object'::text)`
- `restore_drill_snapshot_ref_check`: `CHECK (btrim(snapshot_ref) <> ''::text)`
- `restore_drill_target_ref_check`: `CHECK (btrim(target_ref) <> ''::text)`

Invariants enforced by triggers:
- `restore_drill_append_only`: `BEFORE DELETE OR UPDATE ON restore_drill FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `restore_drill_no_truncate`: `BEFORE TRUNCATE ON restore_drill FOR EACH STATEMENT EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `status_component`

<a id="table-status-component"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `key`
- Privileges: `tp_app` SELECT, UPDATE(cols)
- Column grant: `tp_app` UPDATE (`changed_by`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `key` | `text` | NOT NULL |  |  | `20261030090000` | one of web, sign_in, uploads, jobs, exports, billing, email |
| 2 | `name` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 3 | `position` | `integer` | NOT NULL |  |  | `20261030090000` |  |
| 4 | `status` | `text` | NOT NULL | `'operational'::text` |  | `20261030090000` | one of operational, degraded, partial_outage, major_outage, maintenance |
| 5 | `changed_by` | `uuid` | null |  | `user(id)` | `20261030090000` |  |
| 6 | `changed_at` | `timestamp with time zone` | null |  |  | `20261030090000` |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (key)
- Unique `status_component_position_key`: `UNIQUE ("position")`
- Foreign `status_component_changed_by_fkey`: (changed_by) -> `user`(id), on delete no action

Policies (3):
- `status_component_managed`: PERMISSIVE FOR UPDATE TO tp_app
  - USING `( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted)`
  - WITH CHECK `(( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted) AND (changed_by = app_actor_id()))`
- `status_component_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `status_component_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Invariants enforced by constraints:
- `status_component_key_check`: `CHECK (key = ANY (ARRAY['web'::text, 'sign_in'::text, 'uploads'::text, 'jobs'::text, 'exports'::text, 'billing'::text, 'email'::text]))`
- `status_component_name_check`: `CHECK (btrim(name) <> ''::text)`
- `status_component_status_check`: `CHECK (status = ANY (ARRAY['operational'::text, 'degraded'::text, 'partial_outage'::text, 'major_outage'::text, 'maintenance'::text]))`

Invariants enforced by triggers:
- `status_component_rules`: `BEFORE UPDATE ON status_component FOR EACH ROW EXECUTE FUNCTION status_component_rules()`
  - "a status component keeps its key, name and place"

Maintains `updated_at`: `status_component_updated_at`.

### Table `status_incident`

<a id="table-status-incident"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`components`, `created_by`, `id`, `impact`, `title`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `title` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 3 | `impact` | `text` | NOT NULL |  |  | `20261030090000` | one of minor, major, critical |
| 4 | `components` | `text[]` | NOT NULL |  |  | `20261030090000` |  |
| 5 | `status` | `text` | NOT NULL | `'investigating'::text` |  | `20261030090000` | one of investigating, identified, monitoring, resolved |
| 6 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 7 | `resolved_at` | `timestamp with time zone` | null |  |  | `20261030090000` |  |
| 8 | `created_by` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Foreign `status_incident_created_by_fkey`: (created_by) -> `user`(id), on delete no action

Indexes:
- `status_incident_by_started`: `USING btree (started_at DESC)`

Policies (3):
- `status_incident_opened_by_platform`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted) AND (created_by = app_actor_id()))`
- `status_incident_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `status_incident_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Invariants enforced by constraints:
- `status_incident_components_check`: `CHECK (cardinality(components) >= 1 AND cardinality(components) <= 7 AND components <@ ARRAY['web'::text, 'sign_in'::text, 'uploads'::text, 'jobs'::text, 'exports'::text, 'billing'::text, 'email'::text])`
- `status_incident_impact_check`: `CHECK (impact = ANY (ARRAY['minor'::text, 'major'::text, 'critical'::text]))`
- `status_incident_resolution`: `CHECK ((status = 'resolved'::text) = (resolved_at IS NOT NULL))`
- `status_incident_status_check`: `CHECK (status = ANY (ARRAY['investigating'::text, 'identified'::text, 'monitoring'::text, 'resolved'::text]))`
- `status_incident_title_check`: `CHECK (btrim(title) <> ''::text AND length(title) <= 120)`

Invariants enforced by triggers:
- `status_incident_opened`: `BEFORE INSERT ON status_incident FOR EACH ROW EXECUTE FUNCTION status_incident_opened()`

Maintains `updated_at`: `status_incident_updated_at`.

### Table `status_incident_update`

<a id="table-status-incident-update"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`id`, `incident_id`, `message`, `posted_by`, `status`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `incident_id` | `uuid` | NOT NULL |  | `status_incident(id)` | `20261030090000` |  |
| 3 | `status` | `text` | NOT NULL |  |  | `20261030090000` | one of investigating, identified, monitoring, resolved |
| 4 | `message` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 5 | `posted_by` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 6 | `posted_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Foreign `status_incident_update_incident_id_fkey`: (incident_id) -> `status_incident`(id), on delete no action
- Foreign `status_incident_update_posted_by_fkey`: (posted_by) -> `user`(id), on delete no action

Indexes:
- `status_incident_update_by_incident`: `USING btree (incident_id, posted_at)`

Policies (3):
- `status_incident_update_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `status_incident_update_posted_by_platform`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('status.manage'::text) AS app_actor_platform_permitted) AND (posted_by = app_actor_id()))`
- `status_incident_update_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `true`

Invariants enforced by constraints:
- `status_incident_update_message_check`: `CHECK (btrim(message) <> ''::text AND length(message) <= 1000)`
- `status_incident_update_status_check`: `CHECK (status = ANY (ARRAY['investigating'::text, 'identified'::text, 'monitoring'::text, 'resolved'::text]))`

Invariants enforced by triggers:
- `status_incident_update_append_only`: `BEFORE DELETE OR UPDATE ON status_incident_update FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `status_incident_update_moves`: `BEFORE INSERT ON status_incident_update FOR EACH ROW EXECUTE FUNCTION status_incident_update_moves()`
  - "a resolved incident takes no more updates; open a new one"

### Table `support_ticket`

<a id="table-support-ticket"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 4 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053); its DDL, policies or trigger functions changed by `20261101120000_support_mail`
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols), UPDATE(cols)
- Column grant: `tp_app` INSERT (`category`, `id`, `message`, `requester_id`, `screen`, `subject`)
- Column grant: `tp_app` UPDATE (`status`, `status_changed_by`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `number` | `bigint` | NOT NULL |  |  | `20261030090000` | generated always as identity |
| 3 | `requester_id` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 4 | `screen` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 5 | `category` | `text` | NOT NULL |  |  | `20261030090000` | one of question, problem, access, billing, data, other |
| 6 | `subject` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 7 | `message` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 8 | `status` | `text` | NOT NULL | `'open'::text` |  | `20261030090000` | one of open, answered, closed |
| 9 | `status_changed_by` | `uuid` | null |  | `user(id)` | `20261030090000` |  |
| 10 | `status_changed_at` | `timestamp with time zone` | null |  |  | `20261030090000` |  |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |
| 13 | `source` | `text` | NOT NULL | `'form'::text` |  | `20261101120000` | one of form, mail |
| 14 | `mail_ref` | `text` | null |  |  | `20261101120000` |  |

Keys:
- Primary: (id)
- Unique `support_ticket_mail_ref_key`: `UNIQUE (mail_ref)`
- Unique `support_ticket_number_key`: `UNIQUE (number)`
- Foreign `support_ticket_requester_id_fkey`: (requester_id) -> `user`(id), on delete no action
- Foreign `support_ticket_status_changed_by_fkey`: (status_changed_by) -> `user`(id), on delete no action

Indexes:
- `support_ticket_by_requester`: `USING btree (requester_id, created_at DESC)`
- `support_ticket_by_status`: `USING btree (status, created_at DESC)`

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

Invariants enforced by constraints:
- `support_ticket_category_check`: `CHECK (category = ANY (ARRAY['question'::text, 'problem'::text, 'access'::text, 'billing'::text, 'data'::text, 'other'::text]))`
- `support_ticket_mail_ref`: `CHECK ((source = 'mail'::text) = (mail_ref IS NOT NULL))`
- `support_ticket_mail_ref_check`: `CHECK (mail_ref ~ '^[0-9a-f]{64}$'::text)`
- `support_ticket_message_check`: `CHECK (btrim(message) <> ''::text AND length(message) <= 4000)`
- `support_ticket_screen_check`: `CHECK (screen ~ '^[a-z][a-z0-9_]{0,63}$'::text)`
- `support_ticket_source_check`: `CHECK (source = ANY (ARRAY['form'::text, 'mail'::text]))`
- `support_ticket_status_change`: `CHECK ((status_changed_by IS NULL) = (status_changed_at IS NULL))`
- `support_ticket_status_check`: `CHECK (status = ANY (ARRAY['open'::text, 'answered'::text, 'closed'::text]))`
- `support_ticket_subject_check`: `CHECK (btrim(subject) <> ''::text AND length(subject) <= 200)`

Invariants enforced by triggers:
- `support_ticket_rules`: `BEFORE INSERT OR UPDATE ON support_ticket FOR EACH ROW EXECUTE FUNCTION support_ticket_rules()`
  - "a ticket keeps what its requester wrote"

Maintains `updated_at`: `support_ticket_updated_at`.

### Table `support_mail_receipt`

<a id="table-support-mail-receipt"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 1 policy; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261101120000_support_mail` (ADR 0055)
- Primary key: `mail_ref`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `mail_ref` | `text` | NOT NULL |  |  | `20261101120000` |  |
| 2 | `outcome` | `text` | NOT NULL |  |  | `20261101120000` | one of opened, withheld, unknown_sender, unverified_sender, unreadable |
| 3 | `ticket_id` | `uuid` | null |  | `support_ticket(id)` | `20261101120000` |  |
| 4 | `read_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261101120000` |  |

Keys:
- Primary: (mail_ref)
- Foreign `support_mail_receipt_ticket_id_fkey`: (ticket_id) -> `support_ticket`(id), on delete no action

Indexes:
- `support_mail_receipt_by_read_at`: `USING btree (read_at)`

Policies (1):
- `support_mail_receipt_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`

Invariants enforced by constraints:
- `support_mail_receipt_mail_ref_check`: `CHECK (mail_ref ~ '^[0-9a-f]{64}$'::text)`
- `support_mail_receipt_outcome_check`: `CHECK (outcome = ANY (ARRAY['opened'::text, 'withheld'::text, 'unknown_sender'::text, 'unverified_sender'::text, 'unreadable'::text]))`
- `support_mail_receipt_ticket`: `CHECK ((outcome = ANY (ARRAY['opened'::text, 'withheld'::text])) = (ticket_id IS NOT NULL))`

Invariants enforced by triggers:
- `support_mail_receipt_append_only`: `BEFORE DELETE OR UPDATE ON support_mail_receipt FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"

### Table `compliance_record`

<a id="table-compliance-record"></a>

- Class: organization- or user-scoped (RLS, no practice_id)
- Row-level security: enabled, forced; 3 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by `20261030090000_customer_sign_in_and_readiness` (ADR 0043, ADR 0053)
- Primary key: `id`
- Privileges: `tp_app` SELECT, INSERT(cols)
- Column grant: `tp_app` INSERT (`document_ref`, `id`, `kind`, `occurred_on`, `recorded_by`, `sha256`, `subject`)

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` |  | `20261030090000` |  |
| 2 | `kind` | `text` | NOT NULL |  |  | `20261030090000` | one of policy_approval, access_review, tabletop_exercise, training_attestation, vendor_review, risk_analysis, security_official |
| 3 | `subject` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 4 | `occurred_on` | `date` | NOT NULL |  |  | `20261030090000` |  |
| 5 | `document_ref` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 6 | `sha256` | `text` | NOT NULL |  |  | `20261030090000` |  |
| 7 | `recorded_by` | `uuid` | NOT NULL |  | `user(id)` | `20261030090000` |  |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` |  | `20261030090000` |  |

Keys:
- Primary: (id)
- Foreign `compliance_record_recorded_by_fkey`: (recorded_by) -> `user`(id), on delete no action

Indexes:
- `compliance_record_by_kind`: `USING btree (kind, subject, occurred_on DESC)`

Policies (3):
- `compliance_record_owner`: PERMISSIVE FOR ALL TO tp_owner
  - USING `true`
  - WITH CHECK `true`
- `compliance_record_read`: PERMISSIVE FOR SELECT TO tp_app
  - USING `( SELECT app_actor_platform_permitted('compliance.manage'::text) AS app_actor_platform_permitted)`
- `compliance_record_recorded`: PERMISSIVE FOR INSERT TO tp_app
  - WITH CHECK `(( SELECT app_actor_platform_permitted('compliance.manage'::text) AS app_actor_platform_permitted) AND (recorded_by = app_actor_id()))`

Invariants enforced by constraints:
- `compliance_record_document_ref_check`: `CHECK (document_ref ~ '^[A-Za-z0-9:/._-]{1,200}$'::text)`
- `compliance_record_kind_check`: `CHECK (kind = ANY (ARRAY['policy_approval'::text, 'access_review'::text, 'tabletop_exercise'::text, 'training_attestation'::text, 'vendor_review'::text, 'risk_analysis'::text, 'security_official'::text]))`
- `compliance_record_sha256_check`: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- `compliance_record_subject_check`: `CHECK (subject ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'::text)`

Invariants enforced by triggers:
- `compliance_record_append_only`: `BEFORE DELETE OR UPDATE ON compliance_record FOR EACH ROW EXECUTE FUNCTION reject_change()`
  - "% is append-only: % is refused"
- `compliance_record_rules`: `BEFORE INSERT ON compliance_record FOR EACH ROW EXECUTE FUNCTION compliance_record_rules()`
  - "evidence is recorded for what has happened"

### Table `schema_migrations`

<a id="table-schema-migrations"></a>

- Class: global (no practice_id, no RLS)
- Row-level security: not enabled; 0 policies; owner `tp_owner`
- Dictionary: not in the Data dictionary
- Created by the migration runner (packages/db/src/migrate.ts, CREATE TABLE IF NOT EXISTS before the first migration; ADR 0009)
- Primary key: `filename`
- Privileges: none for any group role

| # | Column | Type | Null | Default | References | Since | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `filename` | `text` | NOT NULL |  |  | runner |  |
| 2 | `checksum` | `text` | NOT NULL |  |  | runner |  |
| 3 | `applied_at` | `timestamp with time zone` | NOT NULL | `now()` |  | runner |  |

Keys:
- Primary: (filename)

Policies (0):
- none

Invariants enforced by constraints:
- `schema_migrations_checksum_check`: `CHECK (checksum ~ '^[0-9a-f]{64}$'::text)`
- `schema_migrations_filename_check`: `CHECK (filename ~ '^[0-9]{14}_[a-z0-9_]+[.]sql$'::text)`

## Divergences from the Data dictionary

The Data dictionary tab (`docs/product/data-dictionary.md`, imported verbatim from the planning document as of 2026-10-14) lists every table with its **key fields**, not every column. This section compares it with the live schema above. Rows in A and B, and C1 and C5, are what the founder approves. C2, C3 and C4 (status "proposed") are Change Order 001 proposals for schema that does not exist yet; they are decided in reconciliation-001, not by approving this document, and are listed so that the documents stay consistent. D and E are informational (what the build added, each with the migration and ADR that added it). Each row names the ADR that explains it, or says that a founder ruling is needed.

Checked and matching: 395 dictionary key fields exist (394 with the dictionary's type or convention); 15 enumerations equal their CHECK (`organization.kind (3)`, `membership.role (10)`, `agreement.kind (5)`, `remittance.status (3)`, `service_line.observed_allowed_basis (2)`, `payer_plan_mapping.mapping_kind (5)`, `contract_version.status (5)`, `contract_calendar_event.kind (4)`, `rule_record.verification (3)`, `line_status.stage (5)`, `case.state (6)`, `payer_response.kind (5)`, `ledger_entry.stage (7)`, `eval_example.source (2)`, `feature_flag.scope (3)`); 2 unique keys (`remittance (practice_id, sender_id, isa13, trn02, bpr02_cents)`, `priced_line (pricing_run_id, service_line_id)`); 11 of the 12 "Indexes that matter" exactly; 8 columns marked (enc) are encrypted; append-only triggers on `ledger_entry`, `audit_event`.

### A. Schema divergences to approve

| # | Table | Field | Kind | Data dictionary | Live schema | Explained by | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | [`source_document`](#table-source-document) | `kind` | enumeration differs | x12_835, contract, exhibit, posting_export, eft_export, payer_letter, other | x12_835, era_export, contract, exhibit, posting_export, eft_export, payer_letter, other (schema adds era_export) | ADR 0060; reconciliation-001 D12 (a), approved 2026-10-17 | explained |
| A2 | [`rule_record`](#table-rule-record) | `record_type` | enumeration differs | pfs_rvu, pfs_gpci, conversion_factor, mppr_rate, therapy_threshold, assistant_modifier, sequestration, ncci_ptp, ncci_mue, carc, rarc, claim_status_code, state_prompt_pay, dispute_window, locality_map | pfs_rvu, pfs_gpci, conversion_factor, mppr_rate, therapy_threshold, assistant_modifier, sequestration, ncci_ptp, ncci_mue, carc, rarc, claim_status_code, state_prompt_pay, dispute_window, locality_map, denial_category (schema adds denial_category) | ADR 0008 (decision and revisit condition) | founder ruling needed |
| A3 | [`priced_line`](#table-priced-line) | `expected_unrounded` | retyped | numeric(18,6) | numeric | ADR 0029; ADR 0035 | explained |
| A4 | [`line_status`](#table-line-status) | `reason` | encryption | listed, not marked (enc) | encrypted: enc:v1 CHECK | ADR 0047 (Encryption and keys) | stricter than the dictionary |
| A5 | [`case_line`](#table-case-line) | `written_off_text` | encryption | not listed | encrypted: enc:v1 CHECK | ADR 0038; ADR 0047 (Encryption and keys) | stricter than the dictionary |
| A6 | [`case_line`](#table-case-line) | `reopen_reason` | encryption | not listed | encrypted: enc:v1 CHECK | ADR 0038; ADR 0047 (Encryption and keys) | stricter than the dictionary |
| A7 | [`packet_version`](#table-packet-version) | `narrative` | encryption | listed, not marked (enc) | encrypted: enc:v1 CHECK | ADR 0041 | stricter than the dictionary |
| A8 | [`submission`](#table-submission) | `reference` | encryption | listed, not marked (enc) | encrypted: enc:v1 CHECK | ADR 0041 (migration 20261023090000 header) | stricter than the dictionary |
| A9 | [`payer_response`](#table-payer-response) | `notes` | encryption | listed, not marked (enc) | encrypted: enc:v1 CHECK | ADR 0041 (migration 20261023090000 header) | stricter than the dictionary |
| A10 | [`ledger_entry`](#table-ledger-entry) | `reason` | encryption | listed, not marked (enc) | encrypted: enc:v1 CHECK | ADR 0042; ADR 0047 (Encryption and keys) | stricter than the dictionary |
| A11 | [`model_call`](#table-model-call) | `actor` | renamed | actor | absent; nearest columns: actor_kind, actor_id | ADR 0048 | explained |
| A12 | [`model_call`](#table-model-call) | `updated_at` | convention | updated_at timestamptz (dictionary convention) | absent | ADR 0048 | explained |
| A13 | [`eval_example`](#table-eval-example) | `updated_at` | convention | updated_at timestamptz (dictionary convention) | absent | ADR 0048; ADR 0051 | explained |
| A14 | [`audit_event`](#table-audit-event) | `updated_at` | convention | updated_at timestamptz (dictionary convention) | absent | ADR 0014 | explained |
| A15 | `job` |  | missing table | Operations (no PHI by design): Queue | absent from schema public | ADR 0004; ADR 0049; README (pg-boss connects as its own login in the role tp_queue, which owns the pgboss schema) | explained |
| A16 | [`job_run`](#table-job-run) |  | classification | Operations (no PHI by design) | PHI (registered): practice_id NOT NULL and a phi_table_registry row | ADR 0019 (migration 20261016121000); catalog rule in packages/db/src/catalog.ts | stricter than the dictionary |
| A17 | [`notification`](#table-notification) |  | classification | Operations (no PHI by design) | PHI (registered): practice_id NOT NULL and a phi_table_registry row | ADR 0039 (Counts and totals only, in the schema) | stricter than the dictionary |
| A18 | [`digest`](#table-digest) |  | classification | Operations (no PHI by design) | PHI (registered): practice_id NOT NULL and a phi_table_registry row | ADR 0039 (Counts and totals only, in the schema) | stricter than the dictionary |
| A19 | [`usage_snapshot`](#table-usage-snapshot) | `updated_at` | convention | updated_at timestamptz (dictionary convention) | absent | ADR 0050 | explained |
| A20 | `legal_hold` |  | missing table | Operations (no PHI by design): Lifecycle | absent from schema public | PRD 17, milestone 12 (no ADR yet) | not built (milestone 12) |
| A21 | `deletion_request` |  | missing table | Operations (no PHI by design): Lifecycle | absent from schema public | PRD 17, milestone 12 (no ADR yet) | not built (milestone 12) |
| A22 | `export_job` |  | missing table | Operations (no PHI by design): Lifecycle | absent from schema public | PRD 17, milestone 12 (no ADR yet) | not built (milestone 12) |
| A23 | [`claim`](#table-claim) | `index (practice_id, payer_claim_control_number)` | index | `claim (practice_id, payer_claim_control_number)` (on the deterministic hash of the encrypted value) | claim_by_patient (practice_id, patient_ref_id); claim_by_payer_claim_control_number (practice_id, payer_claim_control_number_hash) | ADR 0027 | explained |

Notes:
- A1 (`source_document.kind`): era_export is an eighth document kind: a practice-management system's ERA export (CO-03), loaded by the parse job into the same remittance, claim and line rows an 835 makes. It requires source_document.format_id, one of the vendor format registry's four ERA formats (source_document_format_of_era_export). x12_835 stays the CHECK's first value. data-dictionary.md stays verbatim and this document records the divergence.
- A2 (`rule_record.record_type`): denial_category is a sixteenth record type because the rules reference keeps the denial classification 'as a rule record'. ADR 0008 says this departs from the dictionary's fifteen and is raised with the founder; its revisit condition waits on that ruling. Approving this document approves the sixteenth type; data-dictionary.md stays verbatim and this document records the divergence (reconciliation-001, D2).
- A3 (`priced_line.expected_unrounded`): numeric with no scale keeps the exact unrounded value; numeric(18,6) would round it (ADR 0029: golden line G09 carries more than six decimal places). CLAUDE.md rule 2 keeps the unrounded value beside the rounded one.
- A4 (`line_status.reason`): A person's free text can name a patient, so it is encrypted with the practice data key; ENCRYPTED_COLUMNS in packages/db/src/crypto/cipher.ts lists it and the catalog test requires its enc:v1 CHECK.
- A5 (`case_line.written_off_text`): The write-off's free text, beside the closed written_off_reason code the dictionary lists.
- A6 (`case_line.reopen_reason`): The reopen reason is a person's free text.
- A7 (`packet_version.narrative`): The narrative is the person's words, encrypted with the practice key; identifiers stay placeholders until export.
- A8 (`submission.reference`): The payer's reference (a portal confirmation, a fax receipt) is free text a person types.
- A9 (`payer_response.notes`): Notes on a payer response are a person's free text.
- A10 (`ledger_entry.reason`): A ledger correction's reason is the person's words, encrypted; the amount, stage and evidence stay plain.
- A11 (`model_call.actor`): The dictionary's single actor field is two columns: actor_kind (user, service or evaluation) and actor_id (null only for a synthetic evaluation call), with CHECKs model_call_actor and model_call_evaluation_is_synthetic.
- A12 (`model_call.updated_at`): A model call is written once (model_call_rules: 'a model call never changes; only the reviewer's decision is recorded, once'); reviewed_at records that one later change.
- A13 (`eval_example.updated_at`): An evaluation example is never changed or deleted (eval_example_rules).
- A14 (`audit_event.updated_at`): audit_event is append-only (audit_event_append_only, audit_event_no_truncate). The dictionary's own row gives `at` as its time, which the schema has.
- A15 (`job`): The queue is pg-boss's own tables, which pg-boss installs in its own schema pgboss on start, owned by tp_queue, outside schema public and outside this document. The product's record of each job is job_run (singleton key, practice_id, idempotency key, attempts, outcome).
- A16 (`job_run`): The dictionary files job_run under 'Operations (no PHI by design)', and it holds no PHI column. Because it carries practice_id NOT NULL, the catalog rule requires a registry row, FORCE RLS and the tenant policy, so a practice's job history is tenant-scoped like its data.
- A17 (`notification`): The dictionary lists notification with user_id only. The schema adds practice_id NOT NULL and subject_id, so it is registered and tenant-scoped; its figures columns admit only integer counts and integer-cent totals (figures_are_counts, figures_are_cents), so no PHI can be written to it.
- A18 (`digest`): digest has practice_id in the dictionary too; with practice_id NOT NULL the catalog rule registers it. Counts and totals only.
- A19 (`usage_snapshot.updated_at`): A usage snapshot never changes (usage_snapshot_kept: 'a usage snapshot never changes').
- A20 (`legal_hold`): Lifecycle tables for export and deletion are milestone 12 work, not started; /p/[practiceId]/settings/data shows placeholders. Kept in milestone 12 by CO-08.
- A21 (`deletion_request`): As legal_hold.
- A22 (`export_job`): As legal_hold. Not to be confused with the job type 'export' in job_run.
- A23 (`claim.index (practice_id, payer_claim_control_number)`): payer_claim_control_number is encrypted, so the index is claim_by_payer_claim_control_number on (practice_id, payer_claim_control_number_hash), the deterministic hash the dictionary's own note asks for.

### B. Policy divergences to approve

The dictionary gives each tenancy table a one-phrase policy. "Live policies" is every row-level security policy on the table, read from the catalog, with its command and roles (`public` is every role). The policies to `tp_owner` alone are for the SECURITY DEFINER helpers it owns, which the application's policies call (ADR 0013). Under `--strict` the generator refuses a reviewed note whose list of policies differs from the table's, so a policy added to or dropped from one of these tables needs its note reviewed. The live policies, reviewed against the dictionary:

| # | Table | Data dictionary | Live policies | Explained by | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | [`organization`](#table-organization) | Members only | `organization_billing_customer` (UPDATE to tp_billing), `organization_billing_read` (SELECT to tp_billing), `organization_members` (SELECT to tp_app), `organization_owner` (ALL to tp_owner), `organization_platform_admin_insert` (INSERT to tp_app), `organization_platform_admin_update` (UPDATE to tp_app) | ADR 0013; ADR 0050 | explained | Members read their own organizations. Platform administrators also read every one, create group and firm organizations and edit them (the console). The billing role tp_billing reads every row and sets billing_customer_ref only while it is null. |
| B2 | [`practice`](#table-practice) | By grant or ownership | `practice_administrators_update` (RESTRICTIVE UPDATE to tp_app), `practice_platform_admin_insert` (INSERT to tp_app), `practice_resolver` (SELECT to tp_owner), `practice_tenant` (ALL to public) | ADR 0013 | explained | 'By grant or ownership' is implemented as the registered tenant policy on app.practice_ids, which the handler sets from the person's memberships intersected with grants in force (effective_practice_access). Platform administrators create practices; only the practice's administrators update it (restrictive). |
| B3 | [`user`](#table-user) | Self and administrators | `user_invited_by_administrators` (INSERT to tp_app), `user_owner` (ALL to tp_owner), `user_self_and_administrators` (SELECT to tp_app), `user_self_and_platform_admin_update` (UPDATE to tp_app) | ADR 0013; ADR 0016 | conforms | Self and administrators, as the dictionary says; administrators may only create an invited user without MFA. |
| B4 | [`membership`](#table-membership) | Organization administrators | `membership_administrators_insert` (INSERT to tp_app), `membership_administrators_update` (UPDATE to tp_app), `membership_owner` (ALL to tp_owner), `membership_self_and_administrators` (SELECT to tp_app) | ADR 0013 | explained | Adds a person's read of their own memberships and platform administrators. An organization administrator may not add a person already known to another organization (user_known_elsewhere). |
| B5 | [`grant`](#table-grant) | Practice administrators; firm sees its own | `grant_approved_by_practice_administrator` (RESTRICTIVE INSERT to tp_app), `grant_practice_administrators_and_grantee_read` (RESTRICTIVE SELECT to tp_app), `grant_resolver` (SELECT to tp_owner), `grant_revoked_by_practice_administrator` (RESTRICTIVE UPDATE to tp_app), `grant_tenant` (ALL to public) | ADR 0013 | conforms | Practice administrators approve and revoke; the practice's administrators and the grantee read. No route or screen yet approves or revokes a grant (CO-08). |
| B6 | [`agreement`](#table-agreement) | Parties to it | `agreement_owner` (ALL to tp_owner), `agreement_parties` (SELECT to tp_app), `agreement_read_by_parties` (RESTRICTIVE SELECT to tp_app), `agreement_recorded_by_signers` (INSERT to tp_app) | ADR 0013; ADR 0053; ADR 0055 | explained | Parties to it read it, as the dictionary says; platform administrators also read and record agreements. An e-signed agreement is recorded only through record_esigned_agreement(), executable by tp_esign alone (migration 20261101100000). |
| B7 | [`support_grant`](#table-support-grant) | Platform administrators; practice sees its own | `support_grant_created_by_platform_administrator` (RESTRICTIVE INSERT to tp_app), `support_grant_not_updated_by_the_application` (RESTRICTIVE UPDATE to tp_app), `support_grant_platform_administrators_insert` (INSERT to tp_app), `support_grant_platform_administrators_read` (SELECT to tp_app), `support_grant_read_by_practice_and_platform` (RESTRICTIVE SELECT to tp_app), `support_grant_resolver` (SELECT to tp_owner), `support_grant_tenant` (ALL to public) | ADR 0013; ADR 0019; ADR 0028; ADR 0038 | conforms | Platform administrators create one; members of the practice's own group and platform administrators read it; the application never updates one. ADR 0028 extends support grants to contract specialists and ADR 0038 to reimbursement reviewers (read-only); PRD 3 names support engineers only. |

### C. Disagreements inside the plan documents

| # | Subject | Where | What each says | Live schema | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | Remittance duplicate key | PRD 8 (PRD.md:318); PRD 10 step 8 (PRD.md:428); CLAUDE.md Conventions; Data dictionary | PRD 8: unique on (practice, sender, ISA13, TRN02). PRD 10: (practice, payee, ISA13, TRN02, BPR02), as CLAUDE.md's idempotency line said until CO-02's pull request corrected it. Data dictionary: unique (practice_id, sender_id, isa13, trn02, bpr02_cents). | remittance_once UNIQUE (practice_id, sender_id, isa13, trn02, bpr02_cents), the dictionary's key; ADR 0031 also treats a resend under a new ISA13 with the same payee, TRN02, TRN03, BPR02 and BPR16 as a duplicate. An ERA export (provenance era_export, ADR 0060, D12 a) is keyed by remittance_export_once (practice_id, payee_npi, trn02, bpr_credit_debit, bpr02_cents, bpr16_date) over export rows, and the 835 is authoritative between the two (D13 a). | founder ruling needed (reconciliation-001, decision D2): confirm the dictionary's key; PRD.md and the dictionary stay verbatim as the imported plan, and CLAUDE.md's idempotency line is corrected to the key and ADR 0031's resend rule |
| C2 | CO-12 names tables that do not exist | Change Order 001, CO-12 | practice_settings gains two columns; packet_export records five parts. | Settings are practice.settings jsonb (the dictionary's own practice row), guarded by CHECKs and practice_setting_keys(). No packet_export table exists: an export is five columns on packet_version (export_pdf_key, export_csv_key, export_sha256, export_csv_sha256, exported_at). | proposed (reconciliation-001, decisions D26 and D29): two keys in practice.settings; a new packet_export table with its parts |
| C3 | CO-12 'roles enum' and 'enum' columns | Change Order 001, CO-12 | Add financial_reviewer and auditor to the roles enum; readiness_grade and deadline_verification_status as enums. | There are no PostgreSQL enum types. Roles are text with CHECK membership_role_check and role_permission_role_check (10 roles); every enumeration is a CHECK. | proposed: each CO-12 enum built as text with a CHECK, as every enumeration here is |
| C4 | CO-12 case_transition_log has no practice_id | Change Order 001, CO-12; CLAUDE.md rule 4 | CO-12: case_id, from_state, to_state, actor_id, allowed, reason, at. CLAUDE.md: every table that can hold PHI has practice_id and FORCE ROW LEVEL SECURITY. | Not built. | proposed (reconciliation-001, decision D25): practice_id, a registry row, FORCE RLS; reason a closed code |
| C5 | CO-12 screening tables 'outside the RLS catalog' | Change Order 001, CO-04 and CO-12; packages/db/src/catalog.ts | CO-04: no practice_id, outside the RLS catalog. The catalog test: a table without RLS is global and the application role may only read it. | Built as prospect_request is (migration 20261104090000, ADR 0062): screening_prospect, screening_upload, screening_run and screening_result, and a fifth, screening_place_of_service_split, the platform split the engine needs (no rule record carries one), each in public with RLS forced and the owner's policy alone, no practice_id, no phi_table_registry row and no privilege for any other role. The application writes them only through submit_screening() and reject_screening_upload(), reads a result by its link token's SHA-256 and converts it through convert_screening(), and the contract specialist approves the split through console_approve_screening_split() (all SECURITY DEFINER); the platform jobs use operator_screening_*() as tp_operator. An upload stores its hash, row count and coded reasons, and of the rows of fewer than 11 claim lines the browser left out three numbers alone, never a byte of the file; no row of fewer than 11 claim lines is stored (the CMS small-cell standard, the founder's ruling of 2026-10-18); catalog.ts is unchanged, and SEC-17 reads the catalog for PHI-shaped columns. | decided (reconciliation-001, decision D18 a, approved 2026-10-17) and built; approving this document approves the fifth table, which CO-12 does not list |

### D. Tables not in the Data dictionary (informational)

| # | Table | Area | Class | Created by | Explained by |
| --- | --- | --- | --- | --- | --- |
| D1 | [`agreement_event`](#table-agreement-event) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D2 | [`audit_report`](#table-audit-report) | Pricing, triage and cases | PHI (registered) | `20261019160000_triage_cases_and_audit_reports` | ADR 0028, ADR 0038 |
| D3 | [`audit_report_download`](#table-audit-report-download) | Pricing, triage and cases | PHI (registered) | `20261019160000_triage_cases_and_audit_reports` | ADR 0028, ADR 0038 |
| D4 | [`billing_event`](#table-billing-event) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261029150000_billing` | ADR 0050 |
| D5 | [`billing_standing`](#table-billing-standing) | Billing and onboarding | view | `20261029150000_billing` | ADR 0050 |
| D6 | [`case_activity`](#table-case-activity) | Pricing, triage and cases | PHI (registered) | `20261024110000_case_workbench` | ADR 0044 |
| D7 | [`compliance_record`](#table-compliance-record) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D8 | [`contract_question`](#table-contract-question) | Payers, contracts and rates | PHI (registered) | `20261016200000_contract_questions_and_queue` | ADR 0028, ADR 0030 |
| D9 | [`invitation`](#table-invitation) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D10 | [`ledger_match`](#table-ledger-match) | Ledger | PHI (registered) | `20261023120000_recovery_ledger` | ADR 0042 |
| D11 | [`line_note`](#table-line-note) | Documents and remittances | PHI (registered) | `20261016120000_remittances` | ADR 0015, ADR 0021, ADR 0025, ADR 0027 |
| D12 | [`model_budget_hold`](#table-model-budget-hold) | Model gateway | PHI (registered) | `20261031090000_model_budget_holds` | ADR 0054 |
| D13 | [`model_proposal`](#table-model-proposal) | Model gateway | PHI (registered) | `20261029190000_model_proposals` | ADR 0052 |
| D14 | [`mutation_request`](#table-mutation-request) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261015170000_identity_and_permissions` | ADR 0012, ADR 0016, ADR 0017 |
| D15 | [`prospect_request`](#table-prospect-request) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D16 | [`rate_limit_counter`](#table-rate-limit-counter) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D17 | [`report_document`](#table-report-document) | Pricing, triage and cases | PHI (registered) | `20261025090000_report_documents_and_export_history` | ADR 0040, ADR 0045 |
| D18 | [`restore_drill`](#table-restore-drill) | Operations | global (no practice_id, no RLS) | `20261015140500_audit_and_operations` | ADR 0013, ADR 0014 |
| D19 | [`role_permission`](#table-role-permission) | Tenancy and access | global (no practice_id, no RLS) | `20261015170000_identity_and_permissions` | ADR 0012, ADR 0016, ADR 0017 |
| D20 | [`rule_release_withdrawal`](#table-rule-release-withdrawal) | Global content | global (no practice_id, no RLS) | `20261019150000_reruns_and_release_withdrawal` | ADR 0037 |
| D21 | [`schema_migrations`](#table-schema-migrations) | Operations | global (no practice_id, no RLS) | the migration runner (packages/db/src/migrate.ts, CREATE TABLE IF NOT EXISTS before the first migration; ADR 0009) | - |
| D22 | [`screening_place_of_service_split`](#table-screening-place-of-service-split) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261104090000_free_screening` | ADR 0062 |
| D23 | [`screening_prospect`](#table-screening-prospect) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261104090000_free_screening` | ADR 0062 |
| D24 | [`screening_result`](#table-screening-result) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261104090000_free_screening` | ADR 0062 |
| D25 | [`screening_run`](#table-screening-run) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261104090000_free_screening` | ADR 0062 |
| D26 | [`screening_upload`](#table-screening-upload) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261104090000_free_screening` | ADR 0062 |
| D27 | [`status_component`](#table-status-component) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D28 | [`status_incident`](#table-status-incident) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D29 | [`status_incident_update`](#table-status-incident-update) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D30 | [`subscription_claim`](#table-subscription-claim) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261101090000_billing_review` | ADR 0050, ADR 0055 |
| D31 | [`support_mail_receipt`](#table-support-mail-receipt) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261101120000_support_mail` | ADR 0055 |
| D32 | [`support_ticket`](#table-support-ticket) | Operations | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D33 | [`terms_acceptance`](#table-terms-acceptance) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D34 | [`terms_version`](#table-terms-version) | Billing and onboarding | organization- or user-scoped (RLS, no practice_id) | `20261030090000_customer_sign_in_and_readiness` | ADR 0043, ADR 0053 |
| D35 | [`user_device`](#table-user-device) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | `20261015170000_identity_and_permissions` | ADR 0012, ADR 0016, ADR 0017 |
| D36 | [`user_session`](#table-user-session) | Tenancy and access | organization- or user-scoped (RLS, no practice_id) | `20261015170000_identity_and_permissions` | ADR 0012, ADR 0016, ADR 0017 |

### E. Columns not in the Data dictionary (informational)

Per dictionary table, the columns the build added beyond the key fields the dictionary lists (`id`, `created_at` and `updated_at` aside), grouped by the migration that added them.

| Table | Columns, by the migration that added them |
| --- | --- |
| [`practice`](#table-practice) | `deleted_at` (`20261101090000_billing_review` (ADR 0050, ADR 0055)) |
| [`user`](#table-user) | `failed_sign_ins`, `locked_at` (`20261015170000_identity_and_permissions` (ADR 0012, ADR 0016, ADR 0017))<br>`settings` (`20261020090000_monitoring_digests_notifications` (ADR 0039)) |
| [`source_document`](#table-source-document) | `page_text_status`, `page_count` (`20261017120000_document_page_text` (ADR 0033))<br>`format_id` (`20261102090000_era_export_intake` (ADR 0031, ADR 0059, ADR 0060)) |
| [`remittance`](#table-remittance) | `trn03`, `bpr_credit_debit`, `payee_id_qualifier`, `review_reason`, `review_of_remittance_id` (`20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027))<br>`provenance` (`20261102090000_era_export_intake` (ADR 0031, ADR 0059, ADR 0060)) |
| [`claim`](#table-claim) | `claim_no`, `payer_claim_control_number_hash`, `filing_indicator` (`20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027))<br>`received_on` (`20261023090000_packets_submissions_and_responses` (ADR 0041))<br>`interest_cents` (`20261023120000_recovery_ledger` (ADR 0042)) |
| [`service_line`](#table-service-line) | `procedure_qualifier`, `service_date_to`, `observed_allowed_allocated`, `patient_share_cents` (`20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)) |
| [`adjustment`](#table-adjustment) | `unknown_code` (`20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)) |
| [`provider_adjustment`](#table-provider-adjustment) | `position`, `provider_id`, `category`, `counted` (`20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)) |
| [`parse_report`](#table-parse-report) | `outcome`, `plb_total_cents`, `loaded_transactions`, `loaded_claims`, `loaded_lines`, `duplicate_transactions`, `unknown_codes`, `transaction_outcomes`, `code_list_release` (`20261016120000_remittances` (ADR 0015, ADR 0021, ADR 0025, ADR 0027)) |
| [`contract_version`](#table-contract-version) | `notice_days` (`20261016160000_contracts_and_mapping` (ADR 0013, ADR 0017, ADR 0019, ADR 0028)) |
| [`pricing_run`](#table-pricing-run) | `failure_code` (`20261018090000_pricing_runs` (ADR 0029, ADR 0035))<br>`rerun_of_id`, `lines_loaded_by`, `accepted_by`, `accepted_at` (`20261019150000_reruns_and_release_withdrawal` (ADR 0037))<br>`created_by_job_id` (`20261020090000_monitoring_digests_notifications` (ADR 0039)) |
| [`anomaly`](#table-anomaly) | `validation_requested_by`, `validation_requested_at` (`20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038)) |
| [`line_status`](#table-line-status) | `seq`, `priced_line_id` (`20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038)) |
| [`case_line`](#table-case-line) | `written_off_text`, `written_off_at`, `reopen_reason`, `reopened_by`, `reopened_at` (`20261019160000_triage_cases_and_audit_reports` (ADR 0028, ADR 0038)) |
| [`packet_version`](#table-packet-version) | `content`, `dispute_level`, `content_sha256`, `regulation_confirmed_by`, `regulation_confirmed_at`, `approved_sha256`, `approved_alone`, `export_csv_sha256` (`20261023090000_packets_submissions_and_responses` (ADR 0041)) |
| [`submission`](#table-submission) | `export_sha256`, `export_csv_sha256`, `dispute_level` (`20261023090000_packets_submissions_and_responses` (ADR 0041)) |
| [`payer_response`](#table-payer-response) | `remittance_id`, `denial_category`, `reopens_case`, `next_window_ends_on`, `recorded_by` (`20261023090000_packets_submissions_and_responses` (ADR 0041)) |
| [`posting_row`](#table-posting-row) | `row_no`, `procedure_code`, `service_date`, `payer_name`, `batch`, `template`, `fingerprint` (`20261023120000_recovery_ledger` (ADR 0042)) |
| [`eft_row`](#table-eft-row) | `row_no`, `fingerprint` (`20261023120000_recovery_ledger` (ADR 0042)) |
| [`ledger_entry`](#table-ledger-entry) | `seq`, `match_id`, `effective_on` (`20261023120000_recovery_ledger` (ADR 0042)) |
| [`roi_statement`](#table-roi-statement) | `proof_level`, `links`, `generated_by` (`20261023120000_recovery_ledger` (ADR 0042))<br>`pdf_sha256` (`20261024120000_reconciliation_and_roi_documents` (ADR 0042, ADR 0043)) |
| [`model_call`](#table-model-call) | `actor_kind`, `actor_id`, `provider`, `idempotency_key`, `cost_unrounded`, `outcome`, `error_code`, `attempts`, `reviewed_by`, `reviewed_at` (`20261029090000_model_gateway` (ADR 0048)) |
| [`job_run`](#table-job-run) | `job_id`, `job_type`, `error_code`, `started_at`, `finished_at` (`20261016121000_job_runs` (ADR 0019)) |
| [`notification`](#table-notification) | `practice_id`, `subject_id` (`20261020090000_monitoring_digests_notifications` (ADR 0039)) |
| [`subscription`](#table-subscription) | `organization_id`, `stripe_subscription_id`, `stripe_customer_id`, `stripe_price_id`, `plan`, `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `canceled_at`, `stripe_event_at` (`20261029150000_billing` (ADR 0050)) |
| [`invoice`](#table-invoice) | `organization_id`, `stripe_invoice_id`, `stripe_customer_id`, `stripe_subscription_id`, `kind`, `number`, `status`, `currency`, `amount_due_cents`, `amount_paid_cents`, `amount_remaining_cents`, `period_start`, `period_end`, `due_at`, `paid_at`, `payment_method_kind`, `attempt_count`, `first_failed_at`, `last_failure_code`, `hosted_invoice_url`, `dunning_stage`, `dunning_notified_at`, `stripe_event_at` (`20261029150000_billing` (ADR 0050)) |

Type notes: `remittance.sender_id` is text; `remittance.receiver_id` is text; `patient_ref.member_id` is text; `model_call.model_id` is text; `audit_event.request_id` is text. The dictionary does not give their type; each is an identifier read from the source file (an 835 envelope or a model ID), not a key, so text is right.

## Appendix A: enumerations

Columns whose CHECK constraint admits a closed list of values: the column's own CHECK, `column = ANY (ARRAY[...])`, in its order. A column with no such CHECK whose conditional CHECKs name values is marked so; those values are not a closed list.

| Table.column | Values |
| --- | --- |
| `organization.kind` | `group`, `firm`, `internal` |
| `organization.status` | `active`, `suspended`, `closed` |
| `practice.status` | `active`, `deleted` |
| `user.status` | `invited`, `active`, `disabled` |
| `membership.role` | `practice_admin`, `billing_manager`, `analyst`, `viewer`, `firm_principal`, `firm_analyst`, `platform_admin`, `contract_specialist`, `reviewer`, `support` |
| `agreement.kind` | `baa`, `engagement`, `terms`, `data_rights`, `dpa` |
| `role_permission.role` | `practice_admin`, `billing_manager`, `analyst`, `viewer`, `firm_principal`, `firm_analyst`, `platform_admin`, `contract_specialist`, `reviewer`, `support` |
| `role_permission.effect` | `allow`, `deny` |
| `user_session.mfa_method` | `totp`, `webauthn` |
| `user_session.end_reason` | `signed_out`, `idle`, `expired`, `device_revoked`, `revoked`, `user_disabled` |
| `source_document.kind` | `x12_835`, `era_export`, `contract`, `exhibit`, `posting_export`, `eft_export`, `payer_letter`, `other` |
| `source_document.scan_status` | `pending`, `clean`, `flagged`, `unscannable`, `failed` |
| `source_document.status` | `awaiting_upload`, `received`, `scanned`, `stored`, `expanded`, `parse_queued`, `parsed`, `balanced`, `loaded`, `held`, `duplicate`, `quarantined`, `not_835`, `wrong_type`, `unreadable`, `too_large`, `too_compressed`, `nested_zip`, `unsafe_entry`, `encrypted`, `too_many_entries`, `failed` |
| `source_document.page_text_status` | `ready`, `unsupported_document`, `document_unreadable` |
| `source_document.format_id` | `webpt_billing_era_v0`, `prompt_era_v0`, `spry_era_v0`, `raintree_era_v0` |
| `remittance.bpr_credit_debit` | `C`, `D` |
| `remittance.status` | `loaded`, `held`, `duplicate` |
| `remittance.review_reason` | `trace_reused_another_date`, `trace_reused_same_date` |
| `remittance.provenance` | `x12_835`, `era_export` |
| `service_line.observed_allowed_basis` | `amt_b6`, `paid_plus_pr` |
| `provider_adjustment.category` | `recoupment`, `forward_balance`, `interest`, `authorized_return`, `other` |
| `parse_report.outcome` | `loaded`, `held`, `partially_held`, `duplicate` |
| `plan.network_status` | `in_network`, `out_of_network`, `unknown` |
| `payer_plan_mapping.mapping_kind` | `no_agreement`, `contract`, `ma_noncontracted`, `government`, `other` |
| `contract.status` | `active`, `ended` |
| `contract_version.status` | `draft`, `proposed`, `approved`, `signed_off`, `superseded` |
| `rate_record.method` | `FIXED_SCHEDULE`, `PERCENT_OF_MEDICARE`, `LESSER_OF`, `PER_VISIT`, `UNSUPPORTED` |
| `rate_record.rounding` | `HALF_UP_CENT`, `HALF_EVEN_CENT`, `TRUNCATE` |
| `rate_record.proposed_by` | `specialist`, `model` |
| `contract_calendar_event.kind` | `anniversary`, `notice_deadline`, `fee_schedule_year`, `amendment` |
| `contract_question.topic` | `missing_pages`, `missing_schedule`, `undefined_method`, `scope`, `timed_units`, `windows`, `other` |
| `contract_question.status` | `open`, `answered`, `withdrawn` |
| `rule_record.record_type` | `pfs_rvu`, `pfs_gpci`, `conversion_factor`, `mppr_rate`, `therapy_threshold`, `assistant_modifier`, `sequestration`, `ncci_ptp`, `ncci_mue`, `carc`, `rarc`, `claim_status_code`, `state_prompt_pay`, `dispute_window`, `locality_map`, `denial_category` |
| `rule_record.verification` | `L1`, `L2`, `L3` |
| `pricing_run.status` | `queued`, `running`, `complete`, `failed` |
| `priced_line.method` | `FIXED_SCHEDULE`, `PERCENT_OF_MEDICARE`, `LESSER_OF`, `PER_VISIT`, `UNSUPPORTED` |
| `priced_line.unpriced_reason` | `NO_AGREEMENT`, `NO_MAPPING`, `AMBIGUOUS_RATE`, `NO_RATE_FOR_CODE`, `NO_PFS_VALUE`, `UNSUPPORTED_METHOD`, `SECONDARY_PAYER`, `MUE_EXCEEDED`, `UNITS_RULE_UNKNOWN`, `DATE_OUTSIDE_VERSIONS`, `REVERSED_CLAIM`, `ENGINE_ERROR` |
| `line_status.stage` | `flagged`, `validated`, `actionable`, `payer_approved`, `recovered` |
| `line_status.reopened_from` | `flagged`, `validated`, `actionable`, `payer_approved`, `recovered` |
| `case.state` | `open`, `submitted`, `awaiting_response`, `partially_resolved`, `resolved`, `closed_written_off` |
| `case_line.written_off_reason` | `window_passed`, `payer_correct_on_review`, `not_worth_pursuit`, `duplicate`, `other` |
| `case_activity.kind` | `note`, `assigned`, `approval_requested` |
| `audit_report.status` | `queued`, `ready`, `failed` |
| `audit_report_download.file` | `pdf`, `csv` |
| `report_document.kind` | `coverage`, `monthly_summary` |
| `report_document.status` | `queued`, `ready`, `failed` |
| `submission.channel` | `payer_portal`, `fax`, `mail`, `provider_relations_email` |
| `payer_response.kind` | `accepted`, `partial`, `denied`, `info_requested`, `reprocessed_no_change` |
| `payer_response.denial_category` | `authorization`, `visit_limit`, `modifier`, `medical_necessity`, `timely_filing`, `bundling`, `other` |
| `ledger_entry.stage` | `approved`, `posted`, `deposited`, `recouped`, `reversed`, `adjusted`, `interest` |
| `ledger_entry.evidence_kind` | `claim`, `payer_response`, `posting_row`, `eft_row`, `provider_adjustment`, `ledger_entry` |
| `ledger_match.kind` | `claim`, `posting`, `deposit`, `recoupment`, `interest` |
| `ledger_match.outcome` | `approved`, `decreased`, `no_change` |
| `ledger_match.level` | `claim`, `check`, `batch` |
| `roi_statement.proof_level` | `posted`, `deposited` |
| `model_call.actor_kind` | `user`, `service`, `evaluation` |
| `model_call.purpose` | `proposeContractTerms`, `readDenialLetter`, `draftPacketNarrative`, `suggestEvidenceRequests` |
| `model_call.provider` | `bedrock`, `anthropic`, `local` |
| `model_call.outcome` | `completed`, `failed`, `timed_out` |
| `model_call.reviewer_decision` | `accepted`, `accepted_with_changes`, `rejected` |
| `eval_example.source` | `synthetic`, `permitted` |
| `eval_example.purpose` | `proposeContractTerms`, `readDenialLetter`, `draftPacketNarrative`, `suggestEvidenceRequests` |
| `model_proposal.purpose` | `proposeContractTerms`, `draftPacketNarrative`, `suggestEvidenceRequests` |
| `subscription.plan` | `monthly`, `annual` |
| `subscription.status` | `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `paused` |
| `subscription_claim.plan` | `monthly`, `annual` |
| `subscription_claim.status` | `pending`, `created`, `failed`, `ended` |
| `invoice.kind` | `subscription`, `audit`, `other` |
| `invoice.status` | `draft`, `open`, `paid`, `void`, `uncollectible` |
| `invoice.payment_method_kind` | `us_bank_account`, `card` |
| `invoice.dunning_stage` | `payment_failed`, `second_notice`, `third_notice`, `final_notice`, `suspended`, `reinstated`, `resolved` |
| `billing_event.outcome` | `received`, `applied`, `stale`, `ignored`, `unknown_customer` |
| `prospect_request.billing_arrangement` | `in_house`, `billing_firm`, `mixed`, `other` |
| `prospect_request.status` | `new`, `contacted`, `converted`, `declined` |
| `screening_prospect.state` | `AL`, `AK`, `AZ`, `AR`, `CA`, `CO`, `CT`, `DE`, `FL`, `GA`, `HI`, `ID`, `IL`, `IN`, `IA`, `KS`, `KY`, `LA`, `ME`, `MD`, `MA`, `MI`, `MN`, `MS`, `MO`, `MT`, `NE`, `NV`, `NH`, `NJ`, `NM`, `NY`, `NC`, `ND`, `OH`, `OK`, `OR`, `PA`, `RI`, `SC`, `SD`, `TN`, `TX`, `UT`, `VT`, `VA`, `WA`, `WV`, `WI`, `WY`, `DC`, `PR`, `VI`, `GU`, `AS`, `MP` |
| `screening_upload.status` | `accepted`, `rejected` |
| `screening_run.status` | `queued`, `pricing`, `complete`, `failed` |
| `screening_result.payer_product` | `medicare_ffs`, `ma_noncontracted`, `ma_contracted`, `commercial`, `medicaid`, `other` |
| `screening_result.disposition` | `pending`, `priced`, `unpriced`, `rates_change_in_band`, `contract_required`, `not_screened` |
| `screening_result.unpriced_reason` | `NO_AGREEMENT`, `NO_MAPPING`, `AMBIGUOUS_RATE`, `NO_RATE_FOR_CODE`, `NO_PFS_VALUE`, `UNSUPPORTED_METHOD`, `SECONDARY_PAYER`, `MUE_EXCEEDED`, `UNITS_RULE_UNKNOWN`, `DATE_OUTSIDE_VERSIONS`, `REVERSED_CLAIM`, `ENGINE_ERROR` |
| `audit_event.actor_kind` | `user`, `service`, `system` |
| `job_run.job_type` | `intake`, `parse_835`, `monitor`, `price`, `triage`, `audit_report`, `reconcile`, `digest`, `export`, `packet_export`, `roi_statement`, `report_document` |
| `job_run.outcome` | `running`, `retrying`, `succeeded`, `failed`, `refused` |
| `notification.kind` | `monitoring_run`, `digest`, `recoupment`, `follow_up` |
| `feature_flag.key` | `model.kill_switch`, `model.read_denial_letter`, `model.daily_budget_cents`, `platform.maintenance` |
| `feature_flag.scope` | `global`, `organization`, `practice` |
| `restore_drill.outcome` | `passed`, `failed` |
| `status_component.key` | `web`, `sign_in`, `uploads`, `jobs`, `exports`, `billing`, `email` |
| `status_component.status` | `operational`, `degraded`, `partial_outage`, `major_outage`, `maintenance` |
| `status_incident.impact` | `minor`, `major`, `critical` |
| `status_incident.status` | `investigating`, `identified`, `monitoring`, `resolved` |
| `status_incident_update.status` | `investigating`, `identified`, `monitoring`, `resolved` |
| `support_ticket.category` | `question`, `problem`, `access`, `billing`, `data`, `other` |
| `support_ticket.status` | `open`, `answered`, `closed` |
| `support_ticket.source` | `form`, `mail` |
| `support_mail_receipt.outcome` | `opened`, `withheld`, `unknown_sender`, `unverified_sender`, `unreadable` |
| `compliance_record.kind` | `policy_approval`, `access_review`, `tabletop_exercise`, `training_attestation`, `vendor_review`, `risk_analysis`, `security_official` |

## Appendix B: encrypted columns

Columns whose CHECK admits only `enc:v1:` ciphertext (application-layer encryption with the practice data key).

| Table | Columns |
| --- | --- |
| [`claim`](#table-claim) | `patient_control_number`, `payer_claim_control_number` |
| [`patient_ref`](#table-patient-ref) | `last_name`, `first_name`, `dob`, `member_id`, `group_number` |
| [`line_note`](#table-line-note) | `note` |
| [`contract_question`](#table-contract-question) | `question`, `answer` |
| [`line_status`](#table-line-status) | `reason` |
| [`case_line`](#table-case-line) | `written_off_text`, `reopen_reason` |
| [`case_activity`](#table-case-activity) | `body` |
| [`packet_version`](#table-packet-version) | `narrative` |
| [`submission`](#table-submission) | `reference` |
| [`payer_response`](#table-payer-response) | `notes` |
| [`posting_row`](#table-posting-row) | `claim_reference` |
| [`ledger_entry`](#table-ledger-entry) | `reason` |
| [`ledger_match`](#table-ledger-match) | `reversal_reason` |

## Appendix C: functions

Every function in schema `public`. SECURITY DEFINER functions run as their owner; "Sets app.practice_ids" marks a function that sets the tenant scope itself. "Body" is the first 16 hex digits of the SHA-256 of the function's body as the catalog holds it, so a changed body changes this document.

| Function | Returns | Lang | Security | Volatility | Config | EXECUTE granted to | Sets app.practice_ids | Body |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `adjustment_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `0319bb6e43992a8b` |
| `allowed_practice_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `f2ef1aad2276f6cd` |
| `anomaly_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `5ef71bf25d7d04c3` |
| `anomaly_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `39f030b525ce0648` |
| `app_actor_admin_practice_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `728d8dae3d1ee057` |
| `app_actor_administered_organization_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `2de7ac183bc20342` |
| `app_actor_administered_user_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `e0d0de37b8b4437f` |
| `app_actor_group_practice_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `e8aecee1dd00dc17` |
| `app_actor_id()` | `uuid` | sql | invoker | stable |  | tp_app |  | `02930d0d6a6f6caa` |
| `app_actor_is_person()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `b6531b04450fa24c` |
| `app_actor_is_platform_admin()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `e2e7c04621feca40` |
| `app_actor_memberships()` | `TABLE(organization_id uuid, organization_kind text, role text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `236b8f478ee6b790` |
| `app_actor_organization_ids()` | `uuid[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `77fb57cf51a4b039` |
| `app_actor_organization_permitted(uuid,text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `4cabd5e628041cb6` |
| `app_actor_permitted(uuid,text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `ba1bea731502d75b` |
| `app_actor_platform_permitted(text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `3760f234506890ad` |
| `app_actor_practice_directory()` | `TABLE(practice_id uuid, name text, organization_id uuid)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `907cf26442af3589` |
| `app_actor_terms_required()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `ef5705187db37687` |
| `assert_membership_fits_user(uuid,uuid)` | `void` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `e9b1e3a862e37508` |
| `assert_organization_keeps_administrator(uuid)` | `void` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `16bb83822a4c4c15` |
| `audit_report_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `82eb1b21e646b556` |
| `audit_report_download_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `1ab1a28f01764be6` |
| `audit_report_download_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `dcc9fa8b0d88cd5c` |
| `audit_report_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `b0b8fafbc10a4db3` |
| `billing_owner_emails(uuid)` | `TABLE(email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_billing |  | `98dafc8c17d7f83b` |
| `billing_record_audit(text,text,uuid,text,text)` | `void` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_billing |  | `f9a85d22da427ca1` |
| `billing_records_kept()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `610c0de9c4c6b698` |
| `billing_usage_counts()` | `TABLE(organization_id uuid, granted_practices integer, active_practices integer)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_billing |  | `82e27747d11f1494` |
| `case_activity_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `692cbfcfb09ab88d` |
| `case_activity_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `7730d96a2329a3c1` |
| `case_activity_sets_owner()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `bf9900a96bfa0fec` |
| `case_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `544872857d27943a` |
| `case_latest_submission(uuid)` | `uuid` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `6d8281aceebf0c78` |
| `case_line_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `502a1f501004cfdb` |
| `case_line_refresh_cases()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `bcffaf3b76e2a516` |
| `case_line_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `8390200e0d5563a1` |
| `case_next_dispute_window(uuid,integer,date)` | `date` | plpgsql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `a6d8aaca2860bcf5` |
| `case_owner_eligible(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `b8dacedadc46c5e7` |
| `case_reopened_levels(uuid)` | `integer` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `9e04003e8f9e60cf` |
| `case_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `e0292837d38e4bad` |
| `claim_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `daa5449712c05f35` |
| `compliance_record_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `7f1e947036b56ec1` |
| `compliance_workforce()` | `TABLE(user_id uuid, email text, roles text[])` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `7cc132ead4ab0ff3` |
| `console_approve_screening_split(jsonb)` | `uuid` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `f4a65351b09222fe` |
| `console_contract_queue()` | `TABLE(practice_id uuid, name text, documents_awaiting bigint, drafts bigint, proposals_awaiting bigint, awaiting_sign_off bigint, open_questions bigint, regulations_awaiting bigint, support_grant_ends_at timestamp with time zone)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes | `34782bbb84bc92d2` |
| `console_grants(uuid)` | `TABLE(grant_id uuid, organization_id uuid, practice_id uuid, scope jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, agreement_id uuid, approved_by_user_id uuid, revoked_at timestamp with time zone, created_at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `99b8bdc1d3dee83b` |
| `console_model_spend(date)` | `TABLE(practice_id uuid, organization_id uuid, name text, calls integer, spent_unrounded numeric)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes | `e376a7bc2663c81e` |
| `console_practice_settings(uuid)` | `TABLE(practice_id uuid, organization_id uuid, name text, zip text, settings jsonb)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `dc30760ef5f79626` |
| `console_practices(uuid)` | `TABLE(practice_id uuid, organization_id uuid, name text, status text, created_at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `76b2df303a07e7c7` |
| `console_release_runs()` | `TABLE(release_no integer, practice_id uuid, name text, runs bigint, runs_in_effect bigint, reruns bigint, reruns_accepted bigint, changed_lines bigint)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes | `adc1da81e4e077a8` |
| `console_restore_drills(integer)` | `TABLE(started_at timestamp with time zone, completed_at timestamp with time zone, duration_ms bigint, outcome text, catalog_problems integer, error_code text)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `399a93a1a8318075` |
| `console_screening_splits()` | `TABLE(id uuid, settings jsonb, approved_by uuid, approved_by_email text, approved_at timestamp with time zone, in_force boolean)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `38251dbf0646d018` |
| `console_set_practice_settings(uuid,text,jsonb)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes | `af645fb832f3bf10` |
| `console_support_grants()` | `TABLE(support_grant_id uuid, practice_id uuid, user_id uuid, ticket text, reason text, created_at timestamp with time zone, expires_at timestamp with time zone, notified_at timestamp with time zone, reads bigint)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `b335e4849f0c246b` |
| `console_support_tickets(text,integer)` | `TABLE(ticket_id uuid, number bigint, requester_email text, organizations text[], screen text, category text, subject text, message text, status text, created_at timestamp with time zone, status_changed_at timestamp with time zone)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `581668ca764c385c` |
| `contract_calendar_event_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `9d49e01ff62b1725` |
| `contract_question_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `8aae4f70b8112e03` |
| `contract_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `06bbdf22fc9bd64e` |
| `contract_version_documents_ok(contract_version)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `fa43e7f02e96754b` |
| `contract_version_retired_by(contract_version,contract_version,text)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `d28cf1aa50ff68a3` |
| `contract_version_retired_by_signed_successor()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `7d19fbe631239fef` |
| `contract_version_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `408d9ef506921090` |
| `convert_screening(text,text,integer,text[],text,text)` | `uuid` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `f2469e3fb7c289d1` |
| `current_rule_release()` | `integer` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `888c946804c94d4f` |
| `current_terms_version()` | `uuid` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1f6b0bde64fc4a4b` |
| `data_rights_permit(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app, tp_operator |  | `97a340475b983d2f` |
| `digest_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `ece3b3718d970e66` |
| `effective_practice_access()` | `TABLE(practice_id uuid, via text, grant_id uuid, role text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `53666b6ed9d54a7f` |
| `end_support_grant(uuid)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app | yes | `81470c8d2b42a2b3` |
| `eval_example_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `11a31add3dfa4c6d` |
| `figures_are_cents(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `373773096ab8e339` |
| `figures_are_counts(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `cf797676e6189c60` |
| `grant_rules()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `1daf6a68e1b51eac` |
| `grant_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `24f79113967c9b5c` |
| `invitation_email_in_use(uuid,text)` | `boolean` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `4110c31e01ded551` |
| `invitation_expired(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `0e48c829be83ab97` |
| `invitation_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `3ee00363f7b466b1` |
| `invoice_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `7c926f90860ad20e` |
| `ledger_entry_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `abbcba68f46fd135` |
| `ledger_entry_within_evidence()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `d0bb740ca00d3883` |
| `ledger_entry_within_line()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `559ce266b8f75722` |
| `ledger_export_row_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `29c7670a2e40ee0d` |
| `ledger_line_net(uuid,text)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `f151e27ea09f28c1` |
| `ledger_line_stage(uuid)` | `text` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `fe8938ec3ec27c76` |
| `ledger_match_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `442d6a755ca70c28` |
| `ledger_never_changed()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `4e6328f4a28594a0` |
| `ledger_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `c28c8fef48df43ac` |
| `ledger_proof_level(uuid)` | `text` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `9830a2f9478006bf` |
| `line_note_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `f03b3369f30abb6f` |
| `line_stage_rank(text)` | `integer` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `581989dfa3733186` |
| `line_status_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `7ff9c809c72d6495` |
| `line_status_ledger_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `146f2bd81224539e` |
| `line_status_refresh_cases()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `02c5548a429bb9c2` |
| `line_status_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `6d34625159838cf3` |
| `maintenance_on()` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1a688a810ac58550` |
| `membership_invitation()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `5101211402a5e23c` |
| `membership_keeps_practice_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `974ecfab878a2e77` |
| `membership_role_fits_organization()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `114480521bb0ddf4` |
| `membership_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `efb897223d48b728` |
| `membership_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `e3cb30f2adcd0012` |
| `model_call_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `deb8dd551f1aef22` |
| `model_citations_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  | `9e885a47c2ab3c5e` |
| `model_field_paths_valid(text[])` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  | `4b1eb8673b5b4828` |
| `model_hashes_valid(text[])` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  | `67115b68576eb415` |
| `model_proposal_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `80687fccf4186aae` |
| `model_records_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `89afc300e796c507` |
| `model_review_permission(text)` | `text` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app, tp_operator |  | `4771b6912529196b` |
| `monitoring_figure_codes(text)` | `text[]` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `001f1436716766bd` |
| `monitoring_figure_valid(jsonb,text)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `db1a5da1e003b307` |
| `monitoring_figures_valid(jsonb,text)` | `boolean` | plpgsql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `0f95f76f4d8baaf9` |
| `notification_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `f5d86ea89ea32c5c` |
| `open_practice_scope(uuid[])` | `TABLE(practice_id uuid, via text, grant_id uuid, role text)` | plpgsql | invoker | volatile |  | tp_app | yes | `e21550df4fb65689` |
| `operator_active_practice_ids()` | `SETOF uuid` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `b36b35df381aabd5` |
| `operator_assert_scope(uuid)` | `void` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `533c2fbe71370114` |
| `operator_due_support_notices(integer)` | `TABLE(support_grant_id uuid, practice_id uuid, notice text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `26a8da73c49fe312` |
| `operator_practice_administrator_emails(uuid)` | `TABLE(email text)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `e66800658c20c850` |
| `operator_record_support_mail(text,text,text,text,text,text)` | `TABLE(outcome text, ticket_number bigint)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `2903a95e22531e32` |
| `operator_record_support_notice(uuid,text,text)` | `TABLE(recorded boolean, reads bigint)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `cd723eaf7325fa60` |
| `operator_screening_claim(uuid)` | `TABLE(release_no integer, release_manifest_sha256 text, release_available boolean, zip text, settings jsonb, as_of date, row_count integer, attempt integer)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `bd1872d80d9defc5` |
| `operator_screening_complete(uuid,text,text,text)` | `TABLE(contact_email text, row_count integer)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `bbebaad106b62e92` |
| `operator_screening_due(integer,integer)` | `TABLE(run_id uuid, status text, attempts integer)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `6fcad5f2528ea9e3` |
| `operator_screening_expire(integer,text)` | `TABLE(prospects integer, runs integer)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `124030b5627f7ee4` |
| `operator_screening_fail(uuid,text,text)` | `TABLE(contact_email text)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `5c89cb44346a8629` |
| `operator_screening_record(uuid,integer[],text[],bigint[],numeric[],bigint[],bigint[],boolean[],bigint[],numeric[],bigint[],bigint[],text[],text[],text[],text[])` | `integer` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `83691846fd71b717` |
| `operator_screening_release(uuid)` | `TABLE(record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `257407132c673007` |
| `operator_screening_rows(uuid,integer,integer)` | `TABLE(row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text, claim_count integer, observed_allowed_cents bigint)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `088304edaf070fb6` |
| `operator_support_mail_read(text[])` | `TABLE(mail_ref text)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_operator |  | `da2a6ab110478618` |
| `organization_administrator_count(uuid)` | `bigint` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `45fcaf44bc28ae33` |
| `organization_kind_fixed()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `d5a3d13bd118aac9` |
| `organization_kind_of(uuid)` | `text` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `9ba89ea8163257bc` |
| `organization_run_refusal(uuid)` | `text` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `28088464051fab99` |
| `packet_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `2176280110c4aa2b` |
| `packet_content_valid(jsonb)` | `boolean` | plpgsql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `6cd2db7375a3c74d` |
| `packet_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `7085f6474417523f` |
| `packet_verifier_report_valid(jsonb)` | `boolean` | plpgsql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `47fde3846263f974` |
| `packet_version_becomes_current()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `3842998ab0d8a17a` |
| `packet_version_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `5f8e981349178774` |
| `packet_version_current_verifier()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `4cc472bdc3162e89` |
| `packet_version_matches_case(uuid,jsonb)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `b119012e56d45e9c` |
| `packet_version_people(uuid)` | `TABLE(drafted_by_email text, approved_by_email text, regulation_confirmed_by_email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `fef22ffd1c2ffb18` |
| `packet_version_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `d6f5841a2aadbeea` |
| `packets_never_deleted()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `0444f4a36978439f` |
| `packets_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `d55baaa259f73fa7` |
| `parse_report_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `377d9e5cdfe2b80c` |
| `payer_plan_mapping_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `06a465c2d5277fc6` |
| `payer_response_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `2031d828767ceebd` |
| `payer_response_refresh_case()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `b3c23aa01144ad5c` |
| `payer_response_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `3d3936c48b8d9488` |
| `payer_response_within_asked()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `cea09f8a11e093e1` |
| `person_practice_roles(uuid,uuid)` | `text[]` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `8276436b74bd81b0` |
| `plan_payer_of_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `6e80cf334ea6cc0f` |
| `practice_access_log(uuid,text,uuid,timestamp with time zone,integer)` | `TABLE(event_id uuid, at timestamp with time zone, actor_label text, via text, action text, object_type text, object_id uuid, purpose text, ticket text)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `e3a2a4b7018f631c` |
| `practice_administrator_count(uuid)` | `bigint` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `398bbc1606ac3e31` |
| `practice_baa_on_file(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `b240837ccdc53a0e` |
| `practice_case_workers(uuid)` | `TABLE(user_id uuid, email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `7a62bdc2457b55fb` |
| `practice_data_rights_agreement(uuid)` | `uuid` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `015cd610493859a5` |
| `practice_deleted_at()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `d79ba5c079879579` |
| `practice_export_count(uuid)` | `integer` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `b82413ebac6e02ed` |
| `practice_export_history(uuid,integer,integer)` | `TABLE(event_id uuid, action text, object_type text, object_id uuid, purpose text, actor_id uuid, at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `2255a96c31a4fb6a` |
| `practice_fees_paid(uuid,date,date)` | `bigint` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `a9a64e6bfca4d954` |
| `practice_grants(uuid)` | `TABLE(grant_id uuid, grantee_name text, grantee_kind text, roles jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, revoked_at timestamp with time zone, agreement_id uuid)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `0dfe26d16ca76ef3` |
| `practice_has_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `b91b77291d143b70` |
| `practice_has_other_packet_approver(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `d1920a7b04d32ef7` |
| `practice_has_owner()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `244ca9126c121a10` |
| `practice_in_scope(uuid)` | `boolean` | sql | invoker | stable |  | tp_app |  | `7d65da587ce34ce4` |
| `practice_keeps_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `d8f15c4c80b969bb` |
| `practice_notification_recipients()` | `TABLE(user_id uuid, email text, digest_email boolean, in_app boolean)` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `e3494721e080025a` |
| `practice_owned_by_group()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `000c12c0e426949e` |
| `practice_people_emails(uuid,uuid[])` | `TABLE(user_id uuid, email text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `6c4da6036fd47a24` |
| `practice_run_refusal(uuid)` | `text` | plpgsql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `9d53dc3cbf35b67a` |
| `practice_set_materiality(uuid,text,text)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `bd92f0a44717170b` |
| `practice_set_pursuit(uuid,text,integer,integer)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `8ba449fb1c3926ee` |
| `practice_setting_keys()` | `text[]` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `43b5d4392b24804a` |
| `priced_line_immutable()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `4d2d626ed295e33c` |
| `priced_line_rows_belong()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `0c2beafb3c63d2f3` |
| `priced_line_shortfall_cents(uuid)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1980a29c53080675` |
| `priced_line_visit_variance_cents(uuid)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `ff2bbd148b2eb4ad` |
| `pricing_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `66bbf3bfbb28631b` |
| `pricing_run_changed_lines(uuid,uuid)` | `bigint` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `5ddaf57baabe280e` |
| `pricing_run_in_effect(uuid)` | `boolean` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `886a648f977b072d` |
| `pricing_run_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `3379cd08846946da` |
| `prospect_payers_valid(text[])` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` | tp_app |  | `7cf431c07bbe1f8f` |
| `prospect_request_fixed()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `a237fe3144a5d610` |
| `provider_adjustment_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `d679b25d16c44132` |
| `public_status_components()` | `TABLE(key text, name text, status text, changed_at timestamp with time zone)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `79a7ae3915c12b37` |
| `public_status_incidents(timestamp with time zone)` | `TABLE(incident_id uuid, title text, impact text, components text[], status text, started_at timestamp with time zone, resolved_at timestamp with time zone, updates jsonb)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `7678a79b3367ec80` |
| `rate_limit_take(text,text,integer,integer)` | `TABLE(allowed boolean, hits integer, retry_after_seconds integer)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `bf108aba360585e7` |
| `rate_record_evidence_complete(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `dd3b8e4585a95c30` |
| `rate_record_fields()` | `text[]` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `0cd3fc41fb7330df` |
| `rate_record_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `dd7f474c2f4ab695` |
| `record_esigned_agreement(text,text,uuid,uuid,text,text,timestamp with time zone,text,text,text)` | `TABLE(agreement_id uuid, duplicate boolean)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_esign |  | `c35a793ea76cc0b8` |
| `record_security_event(text,uuid,uuid,text)` | `void` | sql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `3a91f6d2aa7d0e61` |
| `record_sign_in_with_mfa()` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `33357d6149a90f6c` |
| `refuse_new_work_while_suspended()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `0a92559e621ef0f0` |
| `reject_change()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `9a6259207407034b` |
| `reject_screening_upload(text,text,text,text,text,integer,jsonb,text)` | `uuid` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `7bd6f8bcb346f63c` |
| `remittance_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `e23bac606a695625` |
| `report_document_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `1f2bfc271aad9a0c` |
| `report_document_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `a4415278b751e6c5` |
| `report_document_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `ae5caa9ac79ee5fe` |
| `resend_invitation(uuid)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `3a38c7bc37517a80` |
| `resolve_session(text)` | `TABLE(outcome text, ended_now boolean, session_id uuid, user_id uuid, device_id uuid, mfa_method text, started_at timestamp with time zone, expires_at timestamp with time zone, last_seen_at timestamp with time zone, user_status text, mfa_enrolled boolean, hardware_key_required boolean)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1dc349b28fbd9045` |
| `revoke_user_sessions(uuid)` | `integer` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `49398f19386615ff` |
| `roi_links_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `49416713dd4d13dd` |
| `roi_statement_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `5a8bc6319828acb2` |
| `roles_permit(text[],text)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1e0aed05610a51f5` |
| `rule_content_no_truncate()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `5da9160cf53a8d06` |
| `rule_record_immutable()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `f638f6a6b42be99a` |
| `rule_release_immutable()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `495c52b559208d41` |
| `rule_release_withdrawal_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `c0f7ed15484f7fd1` |
| `screening_kept_until_expiry()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `c2bb68ef6f2811e6` |
| `screening_modifiers_valid(text[])` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` |  |  | `5ce982845defbad6` |
| `screening_rejection_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` |  |  | `de376c36d4958863` |
| `screening_rejections_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` |  |  | `44d088a7b92201f1` |
| `screening_result_coverage(text)` | `TABLE(payer_product text, disposition text, unpriced_reason text, unpriced_detail text, rows integer, claim_lines bigint, observed_cents bigint)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `d0ded51d5c43a4fd` |
| `screening_result_groups(text)` | `TABLE(payer_product text, procedure_code text, rows integer, claim_lines bigint, expected_cents bigint, reduced_cents bigint, observed_cents bigint, difference_cents bigint, reduced_difference_cents bigint, in_reduction_pool boolean, anomaly_rows integer, anomaly boolean, standing text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `56d2ed09de932cad` |
| `screening_result_inserted()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `f556a1e47dc13dee` |
| `screening_result_rows(text,integer)` | `TABLE(row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text, claim_count integer, observed_allowed_cents bigint, expected_line_cents bigint, expected_cents bigint, difference_cents bigint, in_reduction_pool boolean, reduced_line_cents bigint, reduced_cents bigint, reduced_difference_cents bigint, standing text)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1fc6b8482bf8d179` |
| `screening_result_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `740dacdcc9915f56` |
| `screening_result_summary(text)` | `TABLE(run_id uuid, practice_name text, state text, zip text, release_no integer, engine_version text, created_at timestamp with time zone, expires_at timestamp with time zone, rows integer, claim_lines bigint, observed_cents bigint, priced_rows integer, priced_claim_lines bigint, expected_cents bigint, priced_observed_cents bigint, difference_cents bigint, pooled_rows integer, reduced_cents bigint, reduced_difference_cents bigint, contract_rows integer, contract_claim_lines bigint, contract_observed_cents bigint, not_screened_rows integer, not_screened_claim_lines bigint, not_screened_observed_cents bigint, unpriced_rows integer, unpriced_claim_lines bigint, unpriced_observed_cents bigint, left_out_rows integer, left_out_claim_lines bigint, left_out_observed_cents bigint, converted boolean, release_withdrawn boolean)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `3671bcd645d2b5f3` |
| `screening_run_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `8ea20634148c36b8` |
| `screening_split_in_force()` | `uuid` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `32bb20f8a402f18e` |
| `screening_split_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, pg_temp` |  |  | `44ae8e24ea5d8386` |
| `screening_standing(bigint,bigint,bigint,bigint)` | `text` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` |  |  | `cb258d4578fc6cfc` |
| `screening_status()` | `TABLE(release_no integer, place_of_service_split_id uuid)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `031f73e50cc18a6d` |
| `screening_zip_status(text)` | `TABLE(known boolean, plus_four_required boolean)` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `84bfe38789333636` |
| `service_line_references_in_practice()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `4a5052e6217f6e34` |
| `set_feature_flag(text,text,uuid,jsonb)` | `uuid` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `ab0833dc69f73120` |
| `set_practice_posting_template(uuid,jsonb)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1d457cde477eec93` |
| `set_updated_at()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `42bbab957ef0446f` |
| `sign_in_account(text,text)` | `TABLE(user_id uuid, cognito_sub text, email text, status text, mfa_enrolled boolean, locked boolean, hardware_key_required boolean)` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `1a888c9484d2ed7a` |
| `sign_in_failed(uuid,text,text)` | `TABLE(failures integer, locked boolean, newly_locked boolean, burst boolean)` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `a209dae56d884725` |
| `sign_in_succeeded(uuid)` | `void` | sql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `60e683f0dc8ba129` |
| `source_document_rules()` | `trigger` | plpgsql | invoker | volatile |  |  |  | `b77558b4de441f4f` |
| `status_component_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `82c436362d600ad2` |
| `status_incident_opened()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `92eec267bf1252eb` |
| `status_incident_update_moves()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `9596e1baaa844ddb` |
| `submission_belongs()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `744c87f0a23fd1c1` |
| `submission_latest_response(uuid)` | `uuid` | sql | invoker | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `9a044fc6cae7cf96` |
| `submission_refresh_case()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `220ce03d1ea0f31f` |
| `submission_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `918129137c88ee12` |
| `submit_prospect_request(text,text,text,integer,text[],text)` | `uuid` | sql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `e2ae418d0e1c59c6` |
| `submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,text)` | `uuid` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `ec836d01ac6fa60d` |
| `subscription_claim_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `24615116b611dcb0` |
| `subscription_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `9bff8d1f6d16f0e6` |
| `support_grant_fixed()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `4e2ccf3fc52ddc22` |
| `support_grant_grantee()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `decdf5063e0c761f` |
| `support_grant_role(uuid)` | `text` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `23e71bc2ce447f8c` |
| `support_grant_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `b3584867853ea265` |
| `support_ticket_rules()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `4a090c61fdc7f2e9` |
| `terms_accepted_now()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `657b65330865e56b` |
| `terms_published_now()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `f63274938b5accb0` |
| `triage_never_deleted()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `df21aee8f11b5734` |
| `triage_no_truncate()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `de1aa557d4a1374d` |
| `unlock_user(uuid)` | `boolean` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `dcb9d4ff9b6626f1` |
| `user_accepts_invitations()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `787335bc653af7bb` |
| `user_device_revocation_is_final()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `6febf97093b3e8de` |
| `user_device_security_events()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `17e866106b038a58` |
| `user_guarded_columns()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `9dc981bc2908f316` |
| `user_is_customer(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `6ab6e9ff0f52272b` |
| `user_is_internal(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `de0ae9bc719ff3fd` |
| `user_is_practice_admin(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` |  |  | `358c3cd0bbf46335` |
| `user_is_support_engineer(uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `feeb17d9d1c34e9d` |
| `user_keeps_practice_administrator()` | `trigger` | plpgsql | DEFINER | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `7067ce3a1c9d553b` |
| `user_known_elsewhere(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `35d6cc736c81cd02` |
| `user_reaches_practice_now(uuid,uuid)` | `boolean` | sql | DEFINER | stable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `9c88797ed038db3b` |
| `user_session_end_is_final()` | `trigger` | plpgsql | invoker | volatile | `search_path=pg_catalog, public, pg_temp` |  |  | `31742acfa66c6d74` |
| `user_settings_valid(jsonb)` | `boolean` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `190fcd1474751d06` |
| `uuid_half(uuid,boolean)` | `int8range` | sql | invoker | immutable | `search_path=pg_catalog, public, pg_temp` | tp_app |  | `2f6916880f7cf611` |

## Appendix D: migrations

Every migration applied to the database, from `schema_migrations`, with the SHA-256 of its file as applied. Any edit to any migration changes its hash here, and so this document and its hash: an approval never carries over to migration text it did not see.

| # | Migration | ADRs its header cites | SHA-256 |
| --- | --- | --- | --- |
| 1 | `20261015120000_rule_content.sql` | - | `b61381a691defbbafe1d5174d11a4ccd4eafc68c5d2353c1b12f1e5810175867` |
| 2 | `20261015140000_tenancy.sql` | ADR 0013 | `545f79dfa9c557697129f7e0c921eb023ee861d614a97b383e966c42699ffda3` |
| 3 | `20261015140500_audit_and_operations.sql` | ADR 0013, ADR 0014 | `bc318f7bae6d7bd76636fd1a8a421faeadac68a3714e066ba2684dc77224de7a` |
| 4 | `20261015170000_identity_and_permissions.sql` | ADR 0012, ADR 0016, ADR 0017 | `74073bc5c87b02b6ed1e48d890a39b4c48a8e4ea274f6a65d3e8a5da17c8b33c` |
| 5 | `20261015180000_tenancy_hardening.sql` | ADR 0013, ADR 0014, ADR 0016, ADR 0018 | `b6201dfadf16da8a214a166cdc891a750dc2bde24a6ead187f9f672587311e18` |
| 6 | `20261016090000_documents_payers_plans.sql` | ADR 0013, ADR 0015, ADR 0018 | `a75824bce190c83e4e3d327d4a2c8e964a7d14c4ad81a150ab1e9d9d35259c4a` |
| 7 | `20261016120000_remittances.sql` | ADR 0015, ADR 0021, ADR 0025, ADR 0027 | `5f61824afa62e33b7a73e975ec8f7349eaf7056878cefb2c68876f955983b1fd` |
| 8 | `20261016121000_job_runs.sql` | ADR 0019 | `df99fd4cc2708c64420daa51c432fdfc0d240f8fb634ae1e13635b2cc38b2420` |
| 9 | `20261016160000_contracts_and_mapping.sql` | ADR 0013, ADR 0017, ADR 0019, ADR 0028 | `d912b443b45544a6fbdb52001a440c75bafcb122b08cee76c5310b3045804175` |
| 10 | `20261016200000_contract_questions_and_queue.sql` | ADR 0028, ADR 0030 | `f977fac5efa6a6cd3325ad3d1ff885db580b6acde20d7e0e6b6a9d3c1f69e163` |
| 11 | `20261017090000_document_scan_gate.sql` | ADR 0026, ADR 0032 | `de35cc5d2151d2de4988a08a784bad271e4499104deb1846b90e082bf240149b` |
| 12 | `20261017120000_document_page_text.sql` | ADR 0033 | `9b1ebefee370bd93824adab02151edb164bd5a96b54eae62bfdaef2ab8b4fa94` |
| 13 | `20261018090000_pricing_runs.sql` | ADR 0029, ADR 0035 | `ea95a4b845c83c58db20d79829e3d198d0af72ea0d3ea27413ed8ae478e5c36c` |
| 14 | `20261019150000_reruns_and_release_withdrawal.sql` | ADR 0037 | `e8ff601fa1d917cedc6532b5324ee6a0bad284a32d3f06aca9bd4b50a343418f` |
| 15 | `20261019160000_triage_cases_and_audit_reports.sql` | ADR 0028, ADR 0038 | `3b64d712f6f6fef03ad75f4591af7e1ecbd362f7d919cb0ca8faac251c7277d4` |
| 16 | `20261020090000_monitoring_digests_notifications.sql` | ADR 0039 | `10d651e5fec87b9fd9e575d67adf130ec8842dce97ba01ffeb3198e1b6686490` |
| 17 | `20261021090000_run_diffs_and_runs_in_effect.sql` | ADR 0037, ADR 0038 | `98762c3899e4a2a40cdd6704b4cd52cdd6c0d9bbd8a6fb45628a97330da4d0fa` |
| 18 | `20261022090000_review_guards_visit_shortfalls_and_practice_settings.sql` | ADR 0038, ADR 0039, ADR 0040 | `ff2600e577e5f65155fd3563c1c0b6ea2307719f4ef5718bd836d79d6975b637` |
| 19 | `20261023090000_packets_submissions_and_responses.sql` | ADR 0041 | `788e4235a28f186005ebced3485f5aad8c0b2c94db7d8b457c375456d11e263e` |
| 20 | `20261023120000_recovery_ledger.sql` | ADR 0042 | `61bb21a8e2b6fe7b590ca6bb753bef7105b9f18d526e9b1b2e9cd6bf7cc9591d` |
| 21 | `20261024110000_case_workbench.sql` | ADR 0044 | `631e01358e887d9f1c10162105444aa9a40870d14dcaf48bdad48997f13e101c` |
| 22 | `20261024120000_reconciliation_and_roi_documents.sql` | ADR 0042, ADR 0043 | `147040444f3b9899cbe943f396414d9bb4de0eabbd14023d2de08553cb9cfd28` |
| 23 | `20261025090000_report_documents_and_export_history.sql` | ADR 0040, ADR 0045 | `268162ef976432fc0f3f989a2fdfdd3703827b047e02423de4adff24d5afbd90` |
| 24 | `20261026090000_recovery_ledger_review.sql` | ADR 0042, ADR 0046 | `0e824dcc0cfd932dc6dd86b4e35c1d3e7b9e39a096175fe3f9ed45970a366543` |
| 25 | `20261027090000_packet_and_ledger_review.sql` | ADR 0028, ADR 0047 | `0d2af91dc4dba2367814c77268a14062945be21ad90208f0466c6581b0c9c3a0` |
| 26 | `20261028090000_specialist_queue_by_practice.sql` | ADR 0047 | `8ae15bb6d9dd049e150e551020bb83e60920e6604db17f96419e9957f1fe4cdf` |
| 27 | `20261029090000_model_gateway.sql` | ADR 0048 | `3a99eaa8b95ab06c17a58a2c3d7b7e720e679519a30112744d5df620584c1de2` |
| 28 | `20261029100000_model_gateway_operator.sql` | ADR 0048 | `2c258e3c97cbd19fc7489d0f2bc03ff878926f3e0b5a35517d76256d7f51225e` |
| 29 | `20261029150000_billing.sql` | ADR 0050 | `df00d7f0b89407f0cb0360fedf99b1b692ceb68b194cdd31100d250f1e516f93` |
| 30 | `20261029190000_model_proposals.sql` | ADR 0052 | `bb8efb974c2e0c06d0b4016ea5c21c78b5b0a616023c92b498f18ccd3f1d61b4` |
| 31 | `20261029191000_practice_data_rights.sql` | ADR 0048, ADR 0052 | `0df52f384e699aebd180b447cdbcc8fc911fb5f1c2902836310a69a01d0626b4` |
| 32 | `20261030090000_customer_sign_in_and_readiness.sql` | ADR 0043, ADR 0053 | `a39c4f74c40028403116acec162e851877fb9d2b3077053a96f8faedcb3d3b7f` |
| 33 | `20261030100000_support_desk_and_workforce.sql` | ADR 0053 | `b8386f9fefd724bb0b680431437b637727d5a3335bab2243950c6739121dc0ed` |
| 34 | `20261030110000_prospect_review_check.sql` | ADR 0053 | `846305c73f07de2475619169682fde24f4c722ba7eeba04f2fa03112d1f07682` |
| 35 | `20261031090000_model_budget_holds.sql` | ADR 0054 | `729e29ac1334ede1c27f2fd17f0496575c217520157229eb7f60b5e858e77b82` |
| 36 | `20261101090000_billing_review.sql` | ADR 0050, ADR 0055 | `cfeaca165d0179a7021d206fe1d223fb08305be344ab937d4bba0beca75a8c83` |
| 37 | `20261101100000_esign_and_billing_logins.sql` | ADR 0053, ADR 0055 | `10e0cd84499263e3b9d946cc57ce2a2c7123ae409c935e8796df032b8bb8ffe9` |
| 38 | `20261101110000_console_models_and_invitations.sql` | ADR 0055 | `9191314d2fd78415b8c360995730273dcdda6a6cd1f80bb13b71e32311ed783b` |
| 39 | `20261101120000_support_mail.sql` | ADR 0055 | `b643fa75d0f3f2998cb116fd21e242734e9d60ebfccea3a99a0216442eaf5c74` |
| 40 | `20261102090000_era_export_intake.sql` | ADR 0031, ADR 0059, ADR 0060 | `19f8d0a5e56ec0f006b7d904af9c789897174fd492818401f315dcc87366a4b8` |
| 41 | `20261104090000_free_screening.sql` | ADR 0062 | `5fdac96065998f6390ad9a1d9529def58c4f176f433f821ce3a3e869b63e4074` |

## Cross-checks

Run against the same migrated database by `packages/db/src/domain-model/cross-check.ts`: the Drizzle schema (packages/db/src/schema) against the live columns, as packages/db/src/migrate.db.test.ts does, and the repository's own catalog test function, catalogProblems() in packages/db/src/catalog.ts.

```text
Drizzle tables: 83; migrated tables (excluding schema_migrations): 83
In the database, not in Drizzle: none
In Drizzle, not in the database: none
Column differences (name, type, nullability): 0
catalogProblems() (packages/db/src/catalog.ts) on this database: 0 problem(s)
```

## Approval

This document describes the schema at migration head `20261104090000_free_screening.sql` (41 migrations). Approving it approves the schema as described, every divergence in sections A and B, and the ruling asked for in C1 and C5. It does not decide C2, C3 and C4, which are proposals for schema that does not exist yet (reconciliation-001). Under CO-02, no further schema change merges until it is approved; each later migration regenerates this document in the same pull request and is approved again. The approval line carries the SHA-256 of the document as approved (every line but the approval line and the provenance line), and Appendix D carries the SHA-256 of every migration; `--check --require-approval` refuses a line whose hash is not this text's.

Approved by: ________  Date: ________  Document SHA-256: `7359829a36291b1efd4f6b54fb422f1b3923c9ed3624e4a31e3c715dc3d306cf`
