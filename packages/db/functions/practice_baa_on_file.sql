-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_baa_on_file(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b240837ccdc53a0e
-- Trigger function of: (none)
-- Called by policy: source_document.source_document_requires_baa
CREATE OR REPLACE FUNCTION public.practice_baa_on_file(target_practice uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT practice_in_scope(target_practice)
     AND EXISTS (
       SELECT 1 FROM agreement a JOIN practice p ON p.id = target_practice
        WHERE a.kind = 'baa' AND a.signed_at <= now() AND a.organization_id = p.organization_id
          AND (a.practice_id = target_practice OR a.practice_id IS NULL)
     )
$function$;
ALTER FUNCTION public.practice_baa_on_file(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_baa_on_file(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_baa_on_file(uuid) TO tp_app;
