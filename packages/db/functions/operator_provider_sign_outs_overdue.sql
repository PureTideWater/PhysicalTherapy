-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_provider_sign_outs_overdue(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f19608f2b5ad1bb7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_provider_sign_outs_overdue(request text)
 RETURNS TABLE(sign_out_id uuid, account_id uuid, cause_request_id text, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  UPDATE provider_sign_out p SET late_at = now()
   WHERE p.done_at IS NULL AND p.late_at IS NULL
     AND (p.attempts >= 5 OR (p.attempts >= 4 AND (p.leased_until IS NULL OR p.leased_until <= now())));
  WITH given AS (
    UPDATE provider_sign_out p SET gave_up_at = now(), late_at = coalesce(p.late_at, now())
     WHERE p.done_at IS NULL AND p.gave_up_at IS NULL AND (p.leased_until IS NULL OR p.leased_until <= now())
       AND (p.attempts >= 30 OR (p.attempts >= 4 AND p.queued_at <= now() - interval '24 hours'))
    RETURNING p.user_id, p.reason
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'provider_sign_out_undelivered', 'user', g.user_id, g.reason, request FROM given g;
  RETURN QUERY
    SELECT p.id, p.user_id, p.request_id, 'LATE'::text FROM provider_sign_out p WHERE p.late_at IS NOT NULL AND p.late_reported_at IS NULL
    UNION ALL
    SELECT p.id, p.user_id, p.request_id, 'GAVE_UP'::text FROM provider_sign_out p WHERE p.gave_up_at IS NOT NULL AND p.gave_up_reported_at IS NULL
    ORDER BY 1, 4;
END;
$function$;
ALTER FUNCTION public.operator_provider_sign_outs_overdue(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_provider_sign_outs_overdue(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_provider_sign_outs_overdue(text) TO tp_operator;
