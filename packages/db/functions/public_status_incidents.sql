-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- public_status_incidents(timestamp with time zone)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7678a79b3367ec80
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.public_status_incidents(since timestamp with time zone)
 RETURNS TABLE(incident_id uuid, title text, impact text, components text[], status text, started_at timestamp with time zone, resolved_at timestamp with time zone, updates jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT i.id, i.title, i.impact, i.components, i.status, i.started_at, i.resolved_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('status', u.status, 'message', u.message, 'posted_at', u.posted_at) ORDER BY u.posted_at DESC, u.id)
                     FROM status_incident_update u WHERE u.incident_id = i.id), '[]'::jsonb)
    FROM status_incident i
   WHERE i.status <> 'resolved' OR i.resolved_at >= since
   ORDER BY i.status = 'resolved', i.started_at DESC, i.id
   LIMIT 50
$function$;
ALTER FUNCTION public.public_status_incidents(timestamp with time zone) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.public_status_incidents(timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_status_incidents(timestamp with time zone) TO tp_app;
