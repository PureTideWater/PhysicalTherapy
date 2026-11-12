-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_provider_sign_out_failed(uuid,smallint,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3c486e1f24c277a1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_provider_sign_out_failed(sign_out uuid, try smallint, error_name text, request text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  UPDATE provider_sign_out p
     SET last_error_code = CASE WHEN error_name ~ '^[A-Za-z][A-Za-z0-9]{0,63}$' THEN error_name ELSE 'unknown' END,
         leased_until = NULL,
         next_attempt_at = now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[least(p.attempts, 4)])
   WHERE p.id = sign_out AND p.attempts = try AND p.done_at IS NULL AND p.gave_up_at IS NULL
$function$;
ALTER FUNCTION public.operator_provider_sign_out_failed(uuid,smallint,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_provider_sign_out_failed(uuid,smallint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_provider_sign_out_failed(uuid,smallint,text,text) TO tp_operator;
