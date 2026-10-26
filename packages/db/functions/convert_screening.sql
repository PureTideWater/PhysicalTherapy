-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- convert_screening(text,text,integer,text[],text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ae9476bcd4ee8b04
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.convert_screening(token_sha256 text, contact text, location_count integer, payer_names text[], arrangement text, request text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target screening_run%ROWTYPE;
  prospect screening_prospect%ROWTYPE;
  lead screening_lead%ROWTYPE;
  created uuid;
BEGIN
  SELECT r.* INTO target FROM screening_run r
   WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no screening result at this link' USING ERRCODE = 'no_data_found';
  END IF;
  IF target.converted_at IS NOT NULL THEN
    RAISE EXCEPTION 'a screening converts to an audit request once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_converted_once';
  END IF;
  SELECT p.* INTO prospect FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
  -- As submit_prospect_request() writes a request, with the screening's attribution and from_screening, which no
  -- later update may set (prospect_request_fixed()).
  INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, source, utm_source, utm_medium,
                                utm_campaign, paid_click, referring_firm, from_screening)
  VALUES (btrim(contact), prospect.contact_email, prospect.practice_name, location_count, payer_names, arrangement, prospect.source, prospect.utm_source,
          prospect.utm_medium, prospect.utm_campaign, prospect.paid_click, prospect.referring_firm, true)
  RETURNING id INTO created;
  UPDATE screening_run r SET converted_prospect_request_id = created, converted_at = now(), first_opened_at = coalesce(r.first_opened_at, now()) WHERE r.id = target.id;
  UPDATE screening_outcome o SET converted = true, first_open_band = coalesce(o.first_open_band, screening_open_band(u.created_at, now()))
    FROM screening_upload u WHERE u.id = target.upload_id AND o.upload_id = u.id;
  SELECT l.* INTO lead FROM screening_lead l WHERE l.upload_id = target.upload_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM screening_freeze_lead(target.id, created, NULL, false, request);
  ELSE
    UPDATE screening_lead l SET prospect_request_id = coalesce(l.prospect_request_id, created), result_first_opened_at = coalesce(l.result_first_opened_at, now())
     WHERE l.id = lead.id;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_converted', 'prospect_request', created, 'screening', request);
  RETURN created;
END;
$function$;
ALTER FUNCTION public.convert_screening(text,text,integer,text[],text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.convert_screening(text,text,integer,text[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_screening(text,text,integer,text[],text,text) TO tp_app;
