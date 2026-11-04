-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_run_refusal(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 353f696327efa89b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_run_refusal(target_practice uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN practice_work_refusal(target_practice, NULL);
END;
$function$;
ALTER FUNCTION public.practice_run_refusal(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_run_refusal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_run_refusal(uuid) TO tp_app;
