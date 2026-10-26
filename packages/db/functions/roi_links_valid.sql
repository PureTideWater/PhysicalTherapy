-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- roi_links_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 49416713dd4d13dd
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.roi_links_valid(links jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(links) = 'object'
     AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k) = ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered']
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$function$;
ALTER FUNCTION public.roi_links_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.roi_links_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roi_links_valid(jsonb) TO tp_app;
