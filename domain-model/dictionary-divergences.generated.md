# Data dictionary against the live schema (generated)

Dictionary: /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/co-001/domain-model/repo/docs/product/data-dictionary.md
Schema: 20261101090000_billing_review.sql at commit dbdb7120ad16acb8269d124e67db22e7cc9bbcba

Divergence rows: 81

| Kind | Count |
| --- | --- |
| convention (informational) | 4 |
| convention | 1 |
| encryption | 7 |
| enumeration differs | 1 |
| extra columns (informational) | 26 |
| extra table | 30 |
| index missing | 1 |
| missing (possible rename) | 1 |
| missing table | 4 |
| retyped | 1 |
| type note (informational) | 5 |

| Table | Field | Kind | Dictionary | Live schema | Note |
| --- | --- | --- | --- | --- | --- |
| `practice` |  | extra columns (informational) | - | deleted_at timestamp with time zone null |  |
| `user` |  | extra columns (informational) | - | failed_sign_ins integer, locked_at timestamp with time zone null, settings jsonb |  |
| `source_document` |  | extra columns (informational) | - | page_text_status text null, page_count integer null |  |
| `remittance` | `sender_id` | type note (informational) | uuid (by the _id suffix) | text | an identifier from the source file, not a key, when text |
| `remittance` | `receiver_id` | type note (informational) | uuid (by the _id suffix) | text | an identifier from the source file, not a key, when text |
| `remittance` |  | extra columns (informational) | - | trn03 text, bpr_credit_debit text, payee_id_qualifier text, review_reason text null, review_of_remittance_id uuid null |  |
| `claim` |  | extra columns (informational) | - | claim_no integer, payer_claim_control_number_hash text, filing_indicator text, received_on date null, interest_cents bigint null |  |
| `service_line` |  | extra columns (informational) | - | procedure_qualifier text, service_date_to date null, observed_allowed_allocated boolean, patient_share_cents bigint |  |
| `adjustment` |  | extra columns (informational) | - | unknown_code boolean |  |
| `provider_adjustment` |  | extra columns (informational) | - | position integer, provider_id text, category text, counted boolean |  |
| `patient_ref` | `member_id` | type note (informational) | uuid (by the _id suffix) | text | an identifier from the source file, not a key, when text |
| `parse_report` |  | extra columns (informational) | - | outcome text, plb_total_cents bigint, loaded_transactions integer, loaded_claims integer, loaded_lines integer, duplicate_transactions integer, unknown_codes text[], transaction_outcomes jsonb, code_list_release integer null |  |
| `contract_version` |  | extra columns (informational) | - | notice_days integer null |  |
| `rule_record` | `record_type` | enumeration differs | pfs_rvu, pfs_gpci, conversion_factor, mppr_rate, therapy_threshold, assistant_modifier, sequestration, ncci_ptp, ncci_mue, carc, rarc, claim_status_code, state_prompt_pay, dispute_window, locality_map | pfs_rvu, pfs_gpci, conversion_factor, mppr_rate, therapy_threshold, assistant_modifier, sequestration, ncci_ptp, ncci_mue, carc, rarc, claim_status_code, state_prompt_pay, dispute_window, locality_map, denial_category | schema only: denial_category |
| `pricing_run` |  | extra columns (informational) | - | failure_code text null, rerun_of_id uuid null, lines_loaded_by timestamp with time zone null, accepted_by uuid null, accepted_at timestamp with time zone null, created_by_job_id uuid null |  |
| `priced_line` | `expected_unrounded` | retyped | numeric(18,6) | numeric |  |
| `anomaly` |  | extra columns (informational) | - | validation_requested_by uuid null, validation_requested_at timestamp with time zone null |  |
| `line_status` | `reason` | encryption | not marked (enc) | enc:v1 CHECK |  |
| `line_status` |  | extra columns (informational) | - | seq bigint, priced_line_id uuid null |  |
| `case_line` | `written_off_text` | encryption | not listed | enc:v1 CHECK (extra encrypted column) |  |
| `case_line` | `reopen_reason` | encryption | not listed | enc:v1 CHECK (extra encrypted column) |  |
| `case_line` |  | extra columns (informational) | - | written_off_text text null, written_off_at timestamp with time zone null, reopen_reason text null, reopened_by uuid null, reopened_at timestamp with time zone null |  |
| `packet_version` | `narrative` | encryption | not marked (enc) | enc:v1 CHECK |  |
| `packet_version` |  | extra columns (informational) | - | content jsonb, dispute_level integer null, content_sha256 text, regulation_confirmed_by uuid null, regulation_confirmed_at timestamp with time zone null, approved_sha256 text null, approved_alone boolean, export_csv_sha256 text null |  |
| `submission` | `reference` | encryption | not marked (enc) | enc:v1 CHECK |  |
| `submission` |  | extra columns (informational) | - | export_sha256 text, export_csv_sha256 text, dispute_level integer |  |
| `payer_response` | `notes` | encryption | not marked (enc) | enc:v1 CHECK |  |
| `payer_response` |  | extra columns (informational) | - | remittance_id uuid null, denial_category text null, reopens_case boolean, next_window_ends_on date null, recorded_by uuid null |  |
| `posting_row` |  | extra columns (informational) | - | row_no integer, procedure_code text null, service_date date null, payer_name text null, batch text null, template text, fingerprint text |  |
| `eft_row` |  | extra columns (informational) | - | row_no integer, fingerprint text |  |
| `ledger_entry` | `reason` | encryption | not marked (enc) | enc:v1 CHECK |  |
| `ledger_entry` |  | extra columns (informational) | - | seq bigint, match_id uuid null, effective_on date |  |
| `roi_statement` |  | extra columns (informational) | - | proof_level text, links jsonb, generated_by uuid null, pdf_sha256 text null |  |
| `model_call` | `actor` | missing (possible rename) | actor | candidates: actor_kind, actor_id |  |
| `model_call` | `model_id` | type note (informational) | uuid (by the _id suffix) | text | an identifier from the source file, not a key, when text |
| `model_call` |  | extra columns (informational) | - | actor_kind text, actor_id uuid null, provider text, idempotency_key text, cost_unrounded numeric(18,6), outcome text, error_code text null, attempts integer, reviewed_by uuid null, reviewed_at timestamp with time zone null |  |
| `model_call` | `updated_at` | convention (informational) | updated_at timestamptz | absent |  |
| `eval_example` | `updated_at` | convention (informational) | updated_at timestamptz | absent |  |
| `audit_event` | `request_id` | type note (informational) | uuid (by the _id suffix) | text | an identifier from the source file, not a key, when text |
| `audit_event` | `created_at` | convention | created_at timestamptz | absent |  |
| `audit_event` | `updated_at` | convention (informational) | updated_at timestamptz | absent |  |
| `job` |  | missing table | Operations (no PHI by design): Queue | absent |  |
| `job_run` |  | extra columns (informational) | - | job_id uuid, job_type text, error_code text null, started_at timestamp with time zone, finished_at timestamp with time zone null |  |
| `notification` |  | extra columns (informational) | - | practice_id uuid, subject_id uuid |  |
| `subscription` |  | extra columns (informational) | - | organization_id uuid, stripe_subscription_id text, stripe_customer_id text, stripe_price_id text, plan text, status text, current_period_start timestamp with time zone null, current_period_end timestamp with time zone null, cancel_at_period_end boolean, canceled_at timestamp with time zone null, stripe_event_at timestamp with time zone |  |
| `invoice` |  | extra columns (informational) | - | organization_id uuid, stripe_invoice_id text, stripe_customer_id text, stripe_subscription_id text null, kind text, number text null, status text, currency text, amount_due_cents bigint, amount_paid_cents bigint, amount_remaining_cents bigint, period_start timestamp with time zone null, period_end timestamp with time zone null, due_at timestamp with time zone null, paid_at timestamp with time zone null, payment_method_kind text null, attempt_count integer, first_failed_at timestamp with time zone null, last_failure_code text null, hosted_invoice_url text null, dunning_stage text null, dunning_notified_at timestamp with time zone null, stripe_event_at timestamp with time zone |  |
| `usage_snapshot` | `updated_at` | convention (informational) | updated_at timestamptz | absent |  |
| `legal_hold` |  | missing table | Operations (no PHI by design): Lifecycle | absent |  |
| `deletion_request` |  | missing table | Operations (no PHI by design): Lifecycle | absent |  |
| `export_job` |  | missing table | Operations (no PHI by design): Lifecycle | absent |  |
| `claim` | `index (practice_id, payer_claim_control_number)` | index missing | `claim (practice_id, payer_claim_control_number)` (on the deterministic hash of the encrypted value) | claim_by_patient (practice_id, patient_ref_id); claim_by_payer_claim_control_number (practice_id, payer_claim_control_number_hash) |  |
| `agreement_event` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `audit_report` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261019160000_triage_cases_and_audit_reports |  |
| `audit_report_download` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261019160000_triage_cases_and_audit_reports |  |
| `billing_event` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `billing_standing` |  | extra table | not in the data dictionary | view |  |
| `case_activity` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261024110000_case_workbench |  |
| `compliance_record` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `contract_question` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261016200000_contract_questions_and_queue |  |
| `invitation` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `ledger_match` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261023120000_recovery_ledger |  |
| `line_note` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261016120000_remittances |  |
| `model_budget_hold` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261031090000_model_budget_holds |  |
| `model_proposal` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261029190000_model_proposals |  |
| `mutation_request` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `prospect_request` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `rate_limit_counter` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `report_document` |  | extra table | not in the data dictionary | PHI (registered); registered by 20261025090000_report_documents_and_export_history |  |
| `restore_drill` |  | extra table | not in the data dictionary | global (no practice_id, no RLS) |  |
| `role_permission` |  | extra table | not in the data dictionary | global (no practice_id, no RLS) |  |
| `rule_release_withdrawal` |  | extra table | not in the data dictionary | global (no practice_id, no RLS) |  |
| `schema_migrations` |  | extra table | not in the data dictionary | global (no practice_id, no RLS) |  |
| `status_component` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `status_incident` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `status_incident_update` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `subscription_claim` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `support_ticket` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `terms_acceptance` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `terms_version` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `user_device` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
| `user_session` |  | extra table | not in the data dictionary | RLS, no practice_id (organization- or user-scoped) |  |
