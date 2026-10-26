-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- marketing_campaign_kept(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fc3ead84269c9c23
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.marketing_campaign_kept(given text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN given IS NULL THEN NULL
              WHEN EXISTS (SELECT 1 FROM marketing_campaign c WHERE c.code = given) THEN given
              ELSE 'other' END
$function$;
ALTER FUNCTION public.marketing_campaign_kept(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.marketing_campaign_kept(text) FROM PUBLIC;
