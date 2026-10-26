-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_export_attempt(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4a69c934296ccd37
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_version_export_attempt(target uuid)
 RETURNS TABLE(state text, code text, requested_at timestamp with time zone, at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH version AS (
    SELECT v.id, v.practice_id, v.exported_at
      FROM packet_version v
     WHERE v.id = target AND practice_in_scope(v.practice_id)
       AND (coalesce(app_actor_permitted(v.practice_id, 'packet.draft'), false) OR coalesce(app_actor_permitted(v.practice_id, 'phi.export'), false))
  ), request AS (
    SELECT max(e.at) AS at
      FROM version v JOIN audit_event e ON e.object_type = 'packet_version' AND e.object_id = v.id AND e.practice_id = v.practice_id
     WHERE e.action = 'packet_export_requested' AND e.actor_kind = 'user'
  ), outcome AS (
    SELECT e.action, e.purpose, e.at
      FROM version v
      JOIN audit_event e ON e.object_type = 'packet_version' AND e.object_id = v.id AND e.practice_id = v.practice_id
      CROSS JOIN request q
     WHERE e.action IN ('packet_export_refused', 'packet_export_attempt_failed', 'packet_export_failed') AND e.actor_kind = 'service'
       AND q.at IS NOT NULL AND e.at >= q.at
     ORDER BY e.at DESC, e.id DESC
     LIMIT 1
  )
  SELECT CASE WHEN v.exported_at IS NOT NULL THEN 'exported'
              WHEN q.at IS NULL THEN 'none'
              WHEN o.action IS NULL THEN 'in_progress'
              WHEN o.action = 'packet_export_attempt_failed' THEN 'retrying'
              WHEN o.action = 'packet_export_refused' THEN 'refused'
              ELSE 'failed' END,
         CASE WHEN v.exported_at IS NULL THEN o.purpose END,
         q.at,
         CASE WHEN v.exported_at IS NOT NULL THEN v.exported_at ELSE o.at END
    FROM version v CROSS JOIN request q LEFT JOIN outcome o ON true
$function$;
ALTER FUNCTION public.packet_version_export_attempt(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_export_attempt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_version_export_attempt(uuid) TO tp_app;
