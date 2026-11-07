CREATE OR REPLACE FUNCTION public.roi_links_valid(links jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(links) = 'object'
     AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k) IN (
           ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered'],
           ARRAY['actionable_open', 'actionable_open_lines', 'approved_unposted', 'interest', 'recovered'])
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$function$;
