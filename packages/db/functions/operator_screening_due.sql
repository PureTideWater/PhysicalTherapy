-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_due(integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fdc77fa72cba256f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_due(min_queued_age_seconds integer, at_most integer)
 RETURNS TABLE(run_id uuid, status text, attempts integer, queue_priority smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT r.id, r.status, r.attempts, r.queue_priority FROM screening_run r
   WHERE now() < r.expires_at
     AND ((r.status = 'queued' AND r.created_at <= now() - make_interval(secs => greatest(coalesce(min_queued_age_seconds, 0), 0)))
       OR (r.status = 'pricing' AND r.progress_at < now() - interval '2 minutes'))
   ORDER BY r.queue_priority DESC, r.created_at, r.id
   LIMIT least(greatest(coalesce(at_most, 0), 0), 100)
$function$;
ALTER FUNCTION public.operator_screening_due(integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_due(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_due(integer,integer) TO tp_operator;
GRANT EXECUTE ON FUNCTION public.operator_screening_due(integer,integer) TO tp_screening;
