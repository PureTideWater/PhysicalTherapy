-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_reopened_levels(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9e04003e8f9e60cf
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.case_reopened_levels(target_case uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT count(*)::integer FROM payer_response r JOIN submission s ON s.id = r.submission_id WHERE s.case_id = target_case AND r.reopens_case
$function$;
ALTER FUNCTION public.case_reopened_levels(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_reopened_levels(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_reopened_levels(uuid) TO tp_app;
