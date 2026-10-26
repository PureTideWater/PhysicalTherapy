-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- service_line_priced_in_effect(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 25da75c9275ad787
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.service_line_priced_in_effect(target uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT p.id
    FROM priced_line p JOIN pricing_run r ON r.id = p.pricing_run_id
   WHERE p.practice_id = (SELECT s.practice_id FROM service_line s WHERE s.id = target)
     AND p.service_line_id = target AND pricing_run_in_effect(r.id)
   ORDER BY coalesce(r.accepted_at, r.completed_at) DESC, r.id DESC
   LIMIT 1
$function$;
ALTER FUNCTION public.service_line_priced_in_effect(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.service_line_priced_in_effect(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_line_priced_in_effect(uuid) TO tp_app;
