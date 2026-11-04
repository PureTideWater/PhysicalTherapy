-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_run_hold(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 94e6d9a783e55edf
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_run_hold(target_practice uuid)
 RETURNS TABLE(source text, organization_id uuid, organization_kind text, cause text, reason text, since timestamp with time zone, stopped text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT * FROM practice_work_hold(target_practice);
END;
$function$;
ALTER FUNCTION public.practice_run_hold(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_run_hold(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_run_hold(uuid) TO tp_app;
