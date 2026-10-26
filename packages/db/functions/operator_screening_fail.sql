-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_fail(uuid,text,text,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c5ba2ca4ccd650be
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_fail(run uuid, failure text, request text, attempt integer)
 RETURNS TABLE(contact_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND OR target.status NOT IN ('queued', 'pricing') OR ($4 IS NOT NULL AND target.attempts <> $4) THEN
    RETURN;
  END IF;
  IF $4 IS NULL AND target.status = 'pricing' AND NOT (target.attempts >= 3 AND target.progress_at < now() - interval '2 minutes') THEN
    RETURN;
  END IF;
  UPDATE screening_run r SET status = 'failed', failure_code = $2, failed_at = now() WHERE r.id = target.id;
  UPDATE screening_outcome o SET stage = 'failed' WHERE o.upload_id = target.upload_id AND o.stage = 'accepted';
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_failed', 'screening_run', target.id, 'screening', $3);
  RETURN QUERY
    SELECT p.contact_email FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
END;
$function$;
ALTER FUNCTION public.operator_screening_fail(uuid,text,text,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_fail(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_fail(uuid,text,text,integer) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_fail(uuid,text,text,integer) TO tp_screening;
