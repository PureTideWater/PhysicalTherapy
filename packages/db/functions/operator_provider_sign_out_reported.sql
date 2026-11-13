-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_provider_sign_out_reported(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fc227c98d4566e7e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_provider_sign_out_reported(sign_out uuid, code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  IF code = 'LATE' THEN
    UPDATE provider_sign_out p SET late_reported_at = now() WHERE p.id = sign_out AND p.late_at IS NOT NULL AND p.late_reported_at IS NULL;
  ELSIF code = 'GAVE_UP' THEN
    UPDATE provider_sign_out p SET gave_up_reported_at = now() WHERE p.id = sign_out AND p.gave_up_at IS NOT NULL AND p.gave_up_reported_at IS NULL;
  ELSE
    RAISE EXCEPTION 'unknown provider sign-out line' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;
ALTER FUNCTION public.operator_provider_sign_out_reported(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_provider_sign_out_reported(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_provider_sign_out_reported(uuid,text) TO tp_operator;
