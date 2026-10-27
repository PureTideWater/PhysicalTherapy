-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_run_refusal_for(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4902566cdf7f4e65
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_run_refusal_for(target_practice uuid, wanted text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF wanted IS NULL OR NOT wanted = ANY (run_starting_permissions()) THEN
    RAISE EXCEPTION 'a run refusal is asked for a run-starting permission' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN practice_work_refusal(target_practice, wanted);
END;
$function$;
ALTER FUNCTION public.practice_run_refusal_for(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_run_refusal_for(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_run_refusal_for(uuid,text) TO tp_app;
