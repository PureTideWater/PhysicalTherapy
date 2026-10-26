-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_id()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 02930d0d6a6f6caa
-- Trigger function of: (none)
-- Called by policy: audit_event.audit_event_record
-- Called by policy: audit_report.audit_report_requested_by_actor
-- Called by policy: audit_report_download.audit_report_download_by_actor
-- Called by policy: case_activity.case_activity_written_by_actor
-- Called by policy: compliance_record.compliance_record_recorded
-- Called by policy: contract_question.contract_question_asked_by_actor
-- Called by policy: grant.grant_approved_by_practice_administrator
-- Called by policy: grant.grant_revoked_by_practice_administrator
-- Called by policy: invitation.invitation_administrators_and_invitee
-- Called by policy: line_note.line_note_created_by_actor
-- Called by policy: line_status.line_status_set_by_case_workers
-- Called by policy: membership.membership_self_and_administrators
-- Called by policy: mutation_request.mutation_request_self
-- Called by policy: notification.notification_recipient_marks
-- Called by policy: notification.notification_recipient_reads
-- Called by policy: notification.notification_written_for
-- Called by policy: packet_version.packet_version_drafted_by_actor
-- Called by policy: payer_plan_mapping.payer_plan_mapping_mapped_by_actor
-- Called by policy: payer_response.payer_response_recorded_by_actor
-- Called by policy: pricing_run.pricing_run_accepted_by_actor
-- Called by policy: pricing_run.pricing_run_created_by_actor
-- Called by policy: prospect_request.prospect_request_platform_review
-- Called by policy: report_document.report_document_requested_by_actor
-- Called by policy: source_document.source_document_uploaded_by_actor
-- Called by policy: status_component.status_component_managed
-- Called by policy: status_incident.status_incident_opened_by_platform
-- Called by policy: status_incident_update.status_incident_update_posted_by_platform
-- Called by policy: submission.submission_logged_by_actor
-- Called by policy: support_ticket.support_ticket_read
-- Called by policy: support_ticket.support_ticket_requested
-- Called by policy: support_ticket.support_ticket_worked
-- Called by policy: terms_acceptance.terms_acceptance_self
-- Called by policy: terms_acceptance.terms_acceptance_self_and_platform_read
-- Called by policy: terms_version.terms_version_published_by_platform
-- Called by policy: user.user_self_and_administrators
-- Called by policy: user.user_self_and_platform_admin_update
-- Called by policy: user_device.user_device_self
-- Called by policy: user_session.user_session_self
CREATE OR REPLACE FUNCTION public.app_actor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid
$function$;
ALTER FUNCTION public.app_actor_id() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_id() TO tp_app;
