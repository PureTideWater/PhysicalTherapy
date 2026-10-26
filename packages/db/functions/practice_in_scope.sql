-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_in_scope(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7d65da587ce34ce4
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_in_scope(target_practice uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT target_practice = ANY (coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]))
$function$;
ALTER FUNCTION public.practice_in_scope(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_in_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_in_scope(uuid) TO tp_app;
