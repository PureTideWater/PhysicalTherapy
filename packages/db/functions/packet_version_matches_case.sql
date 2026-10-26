-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_matches_case(uuid,jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b119012e56d45e9c
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_version_matches_case(target_case uuid, content jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH asked AS (
    SELECT (l ->> 'service_line_id')::uuid AS service_line_id, (l ->> 'priced_line_id')::uuid AS priced_line_id,
           l ->> 'expected_cents' AS expected, l ->> 'observed_cents' AS observed, l ->> 'variance_cents' AS variance, l ->> 'paid_cents' AS paid
      FROM jsonb_array_elements(content -> 'lines') l
  ), held AS (
    SELECT cl.service_line_id, cl.priced_line_id, p.expected_allowed_cents::text AS expected, p.observed_allowed_cents::text AS observed,
           p.variance_cents::text AS variance, sl.paid_cents::text AS paid
      FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id JOIN service_line sl ON sl.id = cl.service_line_id
     WHERE cl.case_id = target_case AND cl.written_off_reason IS NULL
  )
  SELECT (SELECT count(*) FROM asked) = (SELECT count(DISTINCT service_line_id) FROM asked)
     AND NOT EXISTS (SELECT * FROM asked EXCEPT SELECT * FROM held)
     AND NOT EXISTS (SELECT * FROM held EXCEPT SELECT * FROM asked)
$function$;
ALTER FUNCTION public.packet_version_matches_case(uuid,jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_matches_case(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_version_matches_case(uuid,jsonb) TO tp_app;
