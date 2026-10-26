-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- locality_status(integer,text,text,date,date)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 93f19de141f69e25
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.locality_status(release integer, zip5 text, plus_four text, period_from date, period_to date)
 RETURNS TABLE(status text, carrier text, locality text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH period AS (
    SELECT daterange($4, $5, '[]') AS days
  ), five AS (
    SELECT r.effective_from, coalesce((r.value ->> 'plus_four_required')::boolean, false) AS flagged,
           r.value ->> 'carrier' AS carrier, r.value ->> 'locality' AS locality, daterange(r.effective_from, r.effective_to, '[]') && p.days AS meets
      FROM rule_record r CROSS JOIN period p
     WHERE r.release_no = $1 AND r.record_type = 'locality_map' AND r.key = jsonb_build_object('zip', $2)
  ), nine AS (
    SELECT r.effective_from, r.id, r.value
      FROM rule_record r CROSS JOIN period p
     WHERE r.release_no = $1 AND r.record_type = 'locality_map_plus_four' AND r.key = jsonb_build_object('zip', $2)
       AND daterange(r.effective_from, r.effective_to, '[]') && p.days
  ), held AS (
    SELECT n.effective_from, n.id, e ->> 'carrier' AS carrier, e ->> 'locality' AS locality
      FROM nine n CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(n.value -> 'ranges') = 'array' THEN n.value -> 'ranges' ELSE '[]'::jsonb END) e
     WHERE $3 ~ '^[0-9]{4}$' AND (e ->> 'from') COLLATE "C" <= $3 COLLATE "C" AND $3 COLLATE "C" <= (e ->> 'to') COLLATE "C"
  ), facts AS (
    SELECT EXISTS (SELECT 1 FROM five) AS known,
           EXISTS (SELECT 1 FROM five WHERE meets) AS in_period,
           EXISTS (SELECT 1 FROM five WHERE meets AND flagged) AS flagged,
           EXISTS (SELECT 1 FROM nine) AS nine_loaded,
           EXISTS (SELECT 1 FROM held) AS nine_holds
  ), judged AS (
    SELECT f.flagged, CASE WHEN NOT f.known THEN 'zip_unknown'
                           WHEN NOT f.in_period THEN 'locality_not_loaded'
                           WHEN f.flagged AND $3 IS NULL THEN 'zip_plus_four_needed'
                           WHEN f.flagged AND NOT f.nine_loaded THEN 'locality_not_loaded'
                           WHEN f.flagged AND NOT f.nine_holds THEN 'zip_plus_four_unknown'
                           ELSE 'ready' END AS status
      FROM facts f
  ), pick AS (
    -- The latest overlapping window's carrier and locality: the range holding the ZIP+4 when the ZIP needs one.
    SELECT x.carrier, x.locality
      FROM (SELECT h.effective_from, h.carrier, h.locality FROM held h WHERE (SELECT j.flagged FROM judged j)
            UNION ALL
            SELECT f.effective_from, f.carrier, f.locality FROM five f WHERE f.meets AND NOT (SELECT j.flagged FROM judged j)) x
     ORDER BY x.effective_from DESC
     LIMIT 1
  )
  SELECT j.status,
         CASE WHEN j.status = 'ready' THEN (SELECT k.carrier FROM pick k) END,
         CASE WHEN j.status = 'ready' THEN (SELECT k.locality FROM pick k) END
    FROM judged j
$function$;
ALTER FUNCTION public.locality_status(integer,text,text,date,date) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.locality_status(integer,text,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.locality_status(integer,text,text,date,date) TO tp_app;
