-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_run_release_withdrawn(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1297cd9fd72f4ee7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.pricing_run_release_withdrawn(run uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM pricing_run r JOIN rule_release_withdrawal w ON w.release_no = r.release_no WHERE r.id = run)
$function$;
ALTER FUNCTION public.pricing_run_release_withdrawn(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_run_release_withdrawn(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pricing_run_release_withdrawn(uuid) TO tp_app;
