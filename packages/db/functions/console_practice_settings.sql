-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_practice_settings(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7a2eef20ce73d1ac
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.console_practice_settings(target uuid)
 RETURNS TABLE(practice_id uuid, organization_id uuid, name text, zip text, zip_plus_four text, settings jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT p.id, p.organization_id, p.name, s.zip, s.zip_plus_four, p.settings
    FROM practice p LEFT JOIN practice_site s ON s.practice_id = p.id
   WHERE p.id = target AND app_actor_platform_permitted('organization.manage')
$function$;
ALTER FUNCTION public.console_practice_settings(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_practice_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_practice_settings(uuid) TO tp_app;
