-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- priced_line_shortfall_cents(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1980a29c53080675
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.priced_line_shortfall_cents(line_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN p.variance_cents IS NULL OR p.variance_cents <= 0 THEN NULL
           WHEN v.visit IS NULL THEN p.variance_cents
           WHEN v.visit > 0 THEN least(p.variance_cents, v.visit)
         END
    FROM priced_line p CROSS JOIN LATERAL (SELECT priced_line_visit_variance_cents(p.id) AS visit) v
   WHERE p.id = line_id
$function$;
ALTER FUNCTION public.priced_line_shortfall_cents(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.priced_line_shortfall_cents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.priced_line_shortfall_cents(uuid) TO tp_app;
