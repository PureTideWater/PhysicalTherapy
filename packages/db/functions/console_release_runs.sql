-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_release_runs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: adc1da81e4e077a8
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_release_runs()
 RETURNS TABLE(release_no integer, practice_id uuid, name text, runs bigint, runs_in_effect bigint, reruns bigint, reruns_accepted bigint, changed_lines bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  callers_scope text := current_setting('app.practice_ids', true);
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('rule_release.manage'), false) THEN
    RETURN;
  END IF;
  -- Every active practice in scope for the one query below; the caller's scope is put back after it.
  PERFORM set_config('app.practice_ids', (SELECT '{' || coalesce(string_agg(p.id::text, ','), '') || '}' FROM practice p WHERE p.status = 'active'), true);
  RETURN QUERY
    SELECT r.release_no, p.id, p.name,
           count(*),
           count(*) FILTER (WHERE r.rerun_of_id IS NULL OR r.accepted_at IS NOT NULL),
           count(*) FILTER (WHERE r.rerun_of_id IS NOT NULL),
           count(*) FILTER (WHERE r.accepted_at IS NOT NULL),
           coalesce(sum(pricing_run_changed_lines(r.rerun_of_id, r.id)) FILTER (WHERE r.rerun_of_id IS NOT NULL), 0)::bigint
      FROM pricing_run r JOIN practice p ON p.id = r.practice_id
     WHERE r.status = 'complete' AND p.status = 'active'
     GROUP BY r.release_no, p.id, p.name
     ORDER BY r.release_no DESC, p.name, p.id;
  PERFORM set_config('app.practice_ids', coalesce(callers_scope, '{}'), true);
END;
$function$;
ALTER FUNCTION public.console_release_runs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_release_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_release_runs() TO tp_app;
