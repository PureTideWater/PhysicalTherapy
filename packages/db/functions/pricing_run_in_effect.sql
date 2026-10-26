-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_run_in_effect(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 886a648f977b072d
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.pricing_run_in_effect(run uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce((
    SELECT r.status = 'complete' AND (r.rerun_of_id IS NULL OR r.accepted_at IS NOT NULL)
           AND NOT EXISTS (
             SELECT 1 FROM pricing_run later
              WHERE later.practice_id = r.practice_id AND later.period_from = r.period_from AND later.period_to = r.period_to
                AND later.status = 'complete' AND (later.rerun_of_id IS NULL OR later.accepted_at IS NOT NULL)
                AND (coalesce(later.accepted_at, later.completed_at), later.id) > (coalesce(r.accepted_at, r.completed_at), r.id))
      FROM pricing_run r WHERE r.id = run), false)
$function$;
ALTER FUNCTION public.pricing_run_in_effect(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_run_in_effect(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pricing_run_in_effect(uuid) TO tp_app;
