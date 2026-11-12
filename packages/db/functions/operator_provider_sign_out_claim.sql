-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_provider_sign_out_claim()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6281242dc5da692f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_provider_sign_out_claim()
 RETURNS TABLE(sign_out_id uuid, account_id uuid, subject text, try smallint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH due AS MATERIALIZED (
    SELECT p.id
      FROM provider_sign_out p
     WHERE p.done_at IS NULL AND p.gave_up_at IS NULL AND p.next_attempt_at <= now()
       AND (p.leased_until IS NULL OR p.leased_until <= now()) AND p.attempts < 30
     ORDER BY p.next_attempt_at, p.id
     LIMIT 1
       FOR UPDATE SKIP LOCKED
  )
  UPDATE provider_sign_out p
     SET attempts = p.attempts + 1, leased_until = now() + interval '2 minutes', next_attempt_at = now() + interval '2 minutes'
    FROM due d, "user" u
   WHERE p.id = d.id AND u.id = p.user_id
  RETURNING p.id, p.user_id, u.cognito_sub, p.attempts
$function$;
ALTER FUNCTION public.operator_provider_sign_out_claim() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_provider_sign_out_claim() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_provider_sign_out_claim() TO tp_operator;
