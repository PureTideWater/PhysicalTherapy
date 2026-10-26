-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- open_practice_scope(uuid[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e21550df4fb65689
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.open_practice_scope(requested uuid[])
 RETURNS TABLE(practice_id uuid, via text, grant_id uuid, role text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  granted uuid[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT a.practice_id ORDER BY a.practice_id), '{}') INTO granted
    FROM effective_practice_access() a
   WHERE a.practice_id = ANY (coalesce(requested, '{}'));
  PERFORM set_config('app.practice_ids', granted::text, true);
  RETURN QUERY SELECT a.practice_id, a.via, a.grant_id, a.role FROM effective_practice_access() a WHERE a.practice_id = ANY (granted);
END;
$function$;
ALTER FUNCTION public.open_practice_scope(uuid[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.open_practice_scope(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_practice_scope(uuid[]) TO tp_app;
