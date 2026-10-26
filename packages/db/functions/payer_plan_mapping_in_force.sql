-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- payer_plan_mapping_in_force(uuid,date)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 80a161b250f57333
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.payer_plan_mapping_in_force(target_plan uuid, on_date date)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE covering AS (
    SELECT m.id, m.supersedes_id
      FROM payer_plan_mapping m
     WHERE m.plan_id = target_plan AND m.effective_from <= on_date AND (m.effective_to IS NULL OR on_date < m.effective_to)
  ), superseded (id) AS (
    SELECT c.supersedes_id FROM covering c WHERE c.supersedes_id IS NOT NULL
    UNION
    SELECT m.supersedes_id FROM payer_plan_mapping m JOIN superseded s ON m.id = s.id WHERE m.plan_id = target_plan AND m.supersedes_id IS NOT NULL
  )
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(c.id))[1] END
    FROM covering c
   WHERE c.id NOT IN (SELECT s.id FROM superseded s)
$function$;
ALTER FUNCTION public.payer_plan_mapping_in_force(uuid,date) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.payer_plan_mapping_in_force(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payer_plan_mapping_in_force(uuid,date) TO tp_app;
