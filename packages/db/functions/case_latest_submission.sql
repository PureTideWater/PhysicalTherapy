-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_latest_submission(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6d8281aceebf0c78
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.case_latest_submission(target_case uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.id FROM submission s WHERE s.case_id = target_case ORDER BY s.submitted_on DESC, s.created_at DESC, s.id DESC LIMIT 1
$function$;
ALTER FUNCTION public.case_latest_submission(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_latest_submission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_latest_submission(uuid) TO tp_app;
