-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submission_latest_response(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9a044fc6cae7cf96
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.submission_latest_response(target_submission uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT r.id FROM payer_response r WHERE r.submission_id = target_submission ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1
$function$;
ALTER FUNCTION public.submission_latest_response(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submission_latest_response(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submission_latest_response(uuid) TO tp_app;
