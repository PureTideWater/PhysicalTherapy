-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- reject_screening_upload(text,text,text,text,integer,jsonb,text,text,text,text,text,text,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c1a6345eced698e8
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.reject_screening_upload(practice text, state_code text, zip5 text, email text, row_count integer, reasons jsonb, heard_from text, campaign_source text, campaign_medium text, campaign_name text, click_kind text, firm text, terms_sha256 text, request text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  created uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM screening_status() o WHERE o.release_no IS NOT NULL AND o.place_of_service_split_id IS NOT NULL) THEN
    RAISE EXCEPTION 'screening is closed until a rule release is in force and a place-of-service split is approved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_closed';
  END IF;
  -- The campaign code as kept (listed, 'other' or null; marketing_campaign_listed_only()), the outcome's too.
  WITH prospect AS (
    INSERT INTO screening_prospect (practice_name, state, zip, contact_email, source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm,
                                    screening_terms_sha256)
    VALUES (btrim(practice), state_code, zip5, lower(btrim(email)), heard_from, campaign_source, campaign_medium, campaign_name, click_kind, firm, terms_sha256)
    RETURNING id, utm_campaign
  ), upload AS (
    INSERT INTO screening_upload (prospect_id, row_count, status, rejection_reasons)
    SELECT prospect.id, $5, 'rejected', reasons FROM prospect
    RETURNING id
  ), outcome AS (
    INSERT INTO screening_outcome (upload_id, screened_month, stage, source, channel, campaign, row_band, refusal_codes)
    SELECT upload.id, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), 'refused', heard_from, marketing_channel(campaign_medium, click_kind), prospect.utm_campaign,
           screening_count_band($5),
           ARRAY(SELECT d.code FROM (SELECT DISTINCT r ->> 'code' AS code FROM jsonb_array_elements(CASE WHEN jsonb_typeof(reasons) = 'array' THEN reasons ELSE '[]'::jsonb END) r) d
                  ORDER BY d.code COLLATE "C")
      FROM upload, prospect
    RETURNING id
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_rejected', 'screening_upload', upload.id, 'screening', request FROM upload, outcome
  RETURNING object_id INTO created;
  RETURN created;
END;
$function$;
ALTER FUNCTION public.reject_screening_upload(text,text,text,text,integer,jsonb,text,text,text,text,text,text,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.reject_screening_upload(text,text,text,text,integer,jsonb,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_screening_upload(text,text,text,text,integer,jsonb,text,text,text,text,text,text,text,text) TO tp_app;
