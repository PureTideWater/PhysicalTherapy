-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_settings_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 190fcd1474751d06
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.user_settings_valid(settings jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(settings) = 'object'
     AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(settings) k WHERE k <> 'notifications')
     AND (NOT settings ? 'notifications' OR (
           jsonb_typeof(settings -> 'notifications') = 'object'
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_each(settings -> 'notifications') e
              WHERE e.key NOT IN ('digest_email', 'in_app') OR jsonb_typeof(e.value) <> 'boolean')))
$function$;
ALTER FUNCTION public.user_settings_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_settings_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_settings_valid(jsonb) TO tp_app;
