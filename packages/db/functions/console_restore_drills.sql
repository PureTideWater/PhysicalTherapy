-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_restore_drills(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 399a93a1a8318075
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_restore_drills(at_most integer)
 RETURNS TABLE(started_at timestamp with time zone, completed_at timestamp with time zone, duration_ms bigint, outcome text, catalog_problems integer, error_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('compliance.manage'), false) THEN
    RAISE EXCEPTION 'the restore drill''s evidence is the platform administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT d.started_at, d.completed_at, d.duration_ms, d.outcome, jsonb_array_length(d.catalog_problems), d.error_code
    FROM restore_drill d ORDER BY d.started_at DESC, d.id LIMIT least(greatest(coalesce(at_most, 1), 1), 100);
END;
$function$;
ALTER FUNCTION public.console_restore_drills(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_restore_drills(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_restore_drills(integer) TO tp_app;
