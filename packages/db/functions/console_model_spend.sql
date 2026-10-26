-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_model_spend(date)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e376a7bc2663c81e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_model_spend(spend_day date)
 RETURNS TABLE(practice_id uuid, organization_id uuid, name text, calls integer, spent_unrounded numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  callers_scope text := current_setting('app.practice_ids', true);
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator reads model spend' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.practice_ids', (SELECT '{' || coalesce(string_agg(p.id::text, ','), '') || '}' FROM practice p WHERE p.status = 'active'), true);
  RETURN QUERY
    SELECT p.id, p.organization_id, p.name,
           coalesce(c.calls, 0)::integer,
           coalesce(c.spent, 0)::numeric(18, 6)
      FROM practice p
      LEFT JOIN LATERAL (
        SELECT count(*) AS calls, sum(m.cost_unrounded) AS spent FROM model_call m
         WHERE m.practice_id = p.id AND m.created_at >= spend_day::timestamp AT TIME ZONE 'UTC' AND m.created_at < (spend_day + 1)::timestamp AT TIME ZONE 'UTC'
      ) c ON true
     WHERE p.status = 'active'
     ORDER BY coalesce(c.spent, 0) DESC, p.name, p.id;
  PERFORM set_config('app.practice_ids', coalesce(callers_scope, '{}'), true);
END;
$function$;
ALTER FUNCTION public.console_model_spend(date) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_model_spend(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_model_spend(date) TO tp_app;
