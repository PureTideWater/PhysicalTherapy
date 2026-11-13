-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_provider_sign_outs_expire(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 338dadac47712802
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_provider_sign_outs_expire(at_most integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  removed integer;
BEGIN
  IF at_most IS NULL OR at_most < 1 THEN
    RAISE EXCEPTION 'expire at least one row a run' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM provider_sign_out p
   WHERE p.id IN (SELECT x.id FROM provider_sign_out x
                   WHERE x.done_at <= now() - interval '90 days' OR (x.done_at IS NULL AND x.gave_up_reported_at <= now() - interval '90 days')
                   ORDER BY x.queued_at LIMIT at_most);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$function$;
ALTER FUNCTION public.operator_provider_sign_outs_expire(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_provider_sign_outs_expire(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_provider_sign_outs_expire(integer) TO tp_operator;
