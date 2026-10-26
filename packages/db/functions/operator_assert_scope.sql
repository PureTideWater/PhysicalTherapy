-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_assert_scope(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 533c2fbe71370114
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_assert_scope(target_practice uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.practice_ids', true) IS DISTINCT FROM ARRAY[target_practice]::text THEN
    RAISE EXCEPTION 'a notice is handled in a transaction scoped to exactly its practice' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$function$;
ALTER FUNCTION public.operator_assert_scope(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_assert_scope(uuid) FROM PUBLIC;
