-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_queue()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 884f39ad7f695d34
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_queue()
 RETURNS TABLE(queued integer, queued_waiting integer, pricing integer, oldest_queued_ms bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT (count(*) FILTER (WHERE r.status = 'queued' AND r.queue_priority = 0))::integer,
         (count(*) FILTER (WHERE r.status = 'queued' AND r.queue_priority < 0))::integer,
         (count(*) FILTER (WHERE r.status = 'pricing'))::integer,
         coalesce(floor(extract(epoch FROM now() - min(r.received_at) FILTER (WHERE r.status = 'queued' AND r.queue_priority = 0)) * 1000)::bigint, 0)
    FROM screening_run r
   WHERE r.status IN ('queued', 'pricing') AND now() < r.expires_at
$function$;
ALTER FUNCTION public.operator_screening_queue() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_queue() TO tp_screening;
