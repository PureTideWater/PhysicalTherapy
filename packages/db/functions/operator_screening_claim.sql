-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_claim(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: a35a25f1df1aa1c8
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_claim(run uuid)
 RETURNS TABLE(release_no integer, release_manifest_sha256 text, release_available boolean, zip text, zip_plus_four text, settings jsonb, as_of date, row_count integer, attempt integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND OR now() >= target.expires_at THEN
    RETURN;
  END IF;
  IF target.status = 'queued' OR (target.status = 'pricing' AND target.progress_at < now() - interval '2 minutes' AND target.attempts < 3) THEN
    UPDATE screening_run r SET status = 'pricing', attempts = target.attempts + 1, started_at = now(), progress_at = now() WHERE r.id = target.id;
  ELSE
    RETURN;
  END IF;
  RETURN QUERY
    SELECT target.release_no, target.release_manifest_sha256,
           EXISTS (SELECT 1 FROM rule_release rl
                    WHERE rl.release_no = target.release_no AND rl.manifest_sha256 = target.release_manifest_sha256 AND rl.published_at IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = rl.release_no)),
           p.zip, p.zip_plus_four, s.settings, (target.created_at AT TIME ZONE 'UTC')::date, target.row_count, target.attempts + 1
      FROM screening_upload u
      JOIN screening_prospect p ON p.id = u.prospect_id
      JOIN place_of_service_split s ON s.id = target.place_of_service_split_id
     WHERE u.id = target.upload_id;
END;
$function$;
ALTER FUNCTION public.operator_screening_claim(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_claim(uuid) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_claim(uuid) TO tp_screening;
