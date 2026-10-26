-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_lead_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4cacbc9f27720745
-- Trigger function of: screening_lead.screening_lead_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_lead_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.id, NEW.practice_name, NEW.state, NEW.zip, NEW.contact_email, NEW.source, NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.paid_click,
      NEW.referring_firm, NEW.consent_sha256, NEW.release_no, NEW.release_manifest_sha256, NEW.engine_version, NEW.labels_version, NEW.screened_at,
      NEW.row_count, NEW.claim_lines, NEW.observed_cents, NEW.anomaly_rows, NEW.left_out_rows, NEW.left_out_claim_lines, NEW.left_out_allowed_cents, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.practice_name, OLD.state, OLD.zip, OLD.contact_email, OLD.source, OLD.utm_source, OLD.utm_medium, OLD.utm_campaign, OLD.paid_click,
      OLD.referring_firm, OLD.consent_sha256, OLD.release_no, OLD.release_manifest_sha256, OLD.engine_version, OLD.labels_version, OLD.screened_at,
      OLD.row_count, OLD.claim_lines, OLD.observed_cents, OLD.anomaly_rows, OLD.left_out_rows, OLD.left_out_claim_lines, OLD.left_out_allowed_cents, OLD.created_at) THEN
    RAISE EXCEPTION 'a kept screening summary keeps what it was frozen with' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_fixed';
  END IF;
  IF (NEW.upload_id IS DISTINCT FROM OLD.upload_id AND NEW.upload_id IS NOT NULL)
     OR (NEW.result_first_opened_at IS DISTINCT FROM OLD.result_first_opened_at AND OLD.result_first_opened_at IS NOT NULL)
     OR (NEW.prospect_request_id IS DISTINCT FROM OLD.prospect_request_id AND OLD.prospect_request_id IS NOT NULL)
     OR (NEW.withdrawal_token_sha256 IS DISTINCT FROM OLD.withdrawal_token_sha256 AND OLD.withdrawal_token_sha256 IS NOT NULL)
     OR (NEW.reminder_sent_at IS DISTINCT FROM OLD.reminder_sent_at AND OLD.reminder_sent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'a kept screening summary''s link goes once, and its first open, request, withdrawal token and reminder are each set once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_fixed';
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at > now() THEN
    RAISE EXCEPTION 'a kept screening summary''s expiry moves only to now, as it is withdrawn' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_fixed';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_lead_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_lead_rules() FROM PUBLIC;
