-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_opened(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e002cbad4fce3ed8
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_result_opened(token_sha256 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r
   WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at AND r.first_opened_at IS NULL
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE screening_run r SET first_opened_at = now() WHERE r.id = target.id;
  UPDATE screening_outcome o SET first_open_band = screening_open_band(u.created_at, now())
    FROM screening_upload u WHERE u.id = target.upload_id AND o.upload_id = u.id AND o.first_open_band IS NULL;
  UPDATE screening_lead l SET result_first_opened_at = now() WHERE l.upload_id = target.upload_id AND l.result_first_opened_at IS NULL;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_result_opened', 'screening_run', target.id, 'screening', NULL);
END;
$function$;
ALTER FUNCTION public.screening_result_opened(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_opened(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_result_opened(text) TO tp_app;
