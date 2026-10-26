-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rule_release_content_span(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5ba92e5a9f4149f6
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.rule_release_content_span(release integer)
 RETURNS TABLE(content text, loaded datemultirange)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT c.content,
         coalesce(range_agg(daterange(r.effective_from, r.effective_to, '[]')) FILTER (WHERE r.id IS NOT NULL), '{}'::datemultirange)
    FROM (VALUES ('mppr_code'), ('mppr_general'), ('ncci_mue')) c (content)
    LEFT JOIN rule_record r ON r.release_no = $1
     AND ((c.content = 'mppr_code' AND r.record_type = 'mppr_rate' AND r.key ? 'hcpcs')
       OR (c.content = 'mppr_general' AND r.record_type = 'mppr_rate' AND r.key ? 'component')
       OR (c.content = 'ncci_mue' AND r.record_type = 'ncci_mue'))
   GROUP BY c.content
   ORDER BY c.content
$function$;
ALTER FUNCTION public.rule_release_content_span(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rule_release_content_span(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rule_release_content_span(integer) TO tp_app;
