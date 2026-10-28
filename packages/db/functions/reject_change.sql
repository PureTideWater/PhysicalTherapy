-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- reject_change()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9a6259207407034b
-- Trigger function of: agreement_event.agreement_event_append_only
-- Trigger function of: audit_event.audit_event_append_only
-- Trigger function of: audit_event.audit_event_no_truncate
-- Trigger function of: compliance_record.compliance_record_append_only
-- Trigger function of: mail_recipient_key.mail_recipient_key_fixed
-- Trigger function of: mail_recipient_key.mail_recipient_key_no_truncate
-- Trigger function of: marketing_campaign.marketing_campaign_fixed
-- Trigger function of: marketing_campaign.marketing_campaign_no_truncate
-- Trigger function of: place_of_service_split.place_of_service_split_append_only
-- Trigger function of: place_of_service_split.place_of_service_split_no_truncate
-- Trigger function of: practice_site.practice_site_no_truncate
-- Trigger function of: restore_drill.restore_drill_append_only
-- Trigger function of: restore_drill.restore_drill_no_truncate
-- Trigger function of: screening_lead.screening_lead_no_truncate
-- Trigger function of: screening_lead_product.screening_lead_product_fixed
-- Trigger function of: screening_lead_product.screening_lead_product_no_truncate
-- Trigger function of: screening_outcome.screening_outcome_kept
-- Trigger function of: screening_outcome.screening_outcome_no_truncate
-- Trigger function of: screening_prospect.screening_prospect_fixed
-- Trigger function of: screening_prospect.screening_prospect_no_truncate
-- Trigger function of: screening_queue_tally.screening_queue_tally_fixed
-- Trigger function of: screening_queue_tally.screening_queue_tally_no_truncate
-- Trigger function of: screening_result.screening_result_no_truncate
-- Trigger function of: screening_run.screening_run_client_subject_fixed
-- Trigger function of: screening_run.screening_run_no_truncate
-- Trigger function of: screening_upload.screening_upload_fixed
-- Trigger function of: screening_upload.screening_upload_no_truncate
-- Trigger function of: status_incident_update.status_incident_update_append_only
-- Trigger function of: support_mail_receipt.support_mail_receipt_append_only
-- Trigger function of: terms_acceptance.terms_acceptance_append_only
-- Trigger function of: terms_version.terms_version_append_only
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.reject_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only: % is refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'raise_exception';
END;
$function$;
ALTER FUNCTION public.reject_change() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.reject_change() FROM PUBLIC;
