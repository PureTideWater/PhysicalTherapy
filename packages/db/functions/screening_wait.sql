-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_wait(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8b60abe3ed17d2aa
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_wait(run uuid)
 RETURNS TABLE(queue_priority smallint, wait_reason text, pricing integer, queued_ahead integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT t.queue_priority, t.wait_reason,
         (SELECT count(*)::integer FROM screening_run p WHERE p.status = 'pricing' AND now() < p.expires_at),
         (SELECT count(*)::integer FROM screening_run q
           WHERE q.status = 'queued' AND now() < q.expires_at AND q.id <> t.id
             AND (q.queue_priority > t.queue_priority OR (q.queue_priority = t.queue_priority AND (q.created_at, q.id) < (t.created_at, t.id))))
    FROM screening_run t
   WHERE t.id = $1
$function$;
ALTER FUNCTION public.screening_wait(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_wait(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_wait(uuid) TO tp_app;
