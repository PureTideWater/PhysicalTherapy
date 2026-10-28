-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- set_updated_at()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 42bbab957ef0446f
-- Trigger function of: adjustment.adjustment_updated_at
-- Trigger function of: agreement.agreement_updated_at
-- Trigger function of: anomaly.anomaly_updated_at
-- Trigger function of: audit_report.audit_report_updated_at
-- Trigger function of: case.case_updated_at
-- Trigger function of: case_line.case_line_updated_at
-- Trigger function of: claim.claim_updated_at
-- Trigger function of: contract.contract_updated_at
-- Trigger function of: contract_calendar_event.contract_calendar_event_updated_at
-- Trigger function of: contract_question.contract_question_updated_at
-- Trigger function of: contract_version.contract_version_updated_at
-- Trigger function of: digest.digest_updated_at
-- Trigger function of: dunning_notice_recipient.dunning_notice_recipient_updated_at
-- Trigger function of: feature_flag.feature_flag_updated_at
-- Trigger function of: grant.grant_updated_at
-- Trigger function of: invitation.invitation_updated_at
-- Trigger function of: invoice.invoice_updated_at
-- Trigger function of: job_run.job_run_updated_at
-- Trigger function of: ledger_match.ledger_match_updated_at
-- Trigger function of: line_note.line_note_updated_at
-- Trigger function of: mail_send.mail_send_updated_at
-- Trigger function of: mail_stream.mail_stream_updated_at
-- Trigger function of: membership.membership_updated_at
-- Trigger function of: notification.notification_updated_at
-- Trigger function of: organization.organization_updated_at
-- Trigger function of: packet.packet_updated_at
-- Trigger function of: packet_version.packet_version_updated_at
-- Trigger function of: parse_report.parse_report_updated_at
-- Trigger function of: patient_ref.patient_ref_updated_at
-- Trigger function of: payer.payer_updated_at
-- Trigger function of: payer_plan_mapping.payer_plan_mapping_updated_at
-- Trigger function of: phi_table_registry.phi_table_registry_updated_at
-- Trigger function of: plan.plan_updated_at
-- Trigger function of: practice.practice_updated_at
-- Trigger function of: pricing_run.pricing_run_updated_at
-- Trigger function of: prospect_request.prospect_request_updated_at
-- Trigger function of: provider_adjustment.provider_adjustment_updated_at
-- Trigger function of: rate_record.rate_record_updated_at
-- Trigger function of: remittance.remittance_updated_at
-- Trigger function of: report_document.report_document_updated_at
-- Trigger function of: role_permission.role_permission_updated_at
-- Trigger function of: service_line.service_line_updated_at
-- Trigger function of: source_document.source_document_updated_at
-- Trigger function of: status_component.status_component_updated_at
-- Trigger function of: status_incident.status_incident_updated_at
-- Trigger function of: subscription.subscription_updated_at
-- Trigger function of: subscription_claim.subscription_claim_updated_at
-- Trigger function of: support_grant.support_grant_updated_at
-- Trigger function of: support_grant_notice.support_grant_notice_updated_at
-- Trigger function of: support_grant_notice_recipient.support_grant_notice_recipient_updated_at
-- Trigger function of: support_ticket.support_ticket_updated_at
-- Trigger function of: user.user_updated_at
-- Trigger function of: user_device.user_device_updated_at
-- Trigger function of: user_session.user_session_updated_at
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.set_updated_at() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
