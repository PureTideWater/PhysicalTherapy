-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_export_downloads_of_actor(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dc26a79c8d0152e2
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.packet_export_downloads_of_actor(target uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(f.file ORDER BY f.file), '{}'::text[])
    FROM (
      SELECT DISTINCT CASE e.action WHEN 'packet_export_pdf_downloaded' THEN 'pdf' ELSE 'csv' END AS file
        FROM packet_version v
        JOIN audit_event e ON e.object_id = v.id AND e.object_type = 'packet_version' AND e.practice_id = v.practice_id
       WHERE v.id = target AND practice_in_scope(v.practice_id) AND v.exported_at IS NOT NULL
         AND NOT app_session_is_job() AND app_actor_is_person() AND e.actor_id = app_actor_id() AND e.actor_kind = 'user'
         AND e.action IN ('packet_export_pdf_downloaded', 'packet_export_csv_downloaded') AND e.purpose = 'line_export'
         AND e.at >= v.exported_at
    ) f
$function$;
ALTER FUNCTION public.packet_export_downloads_of_actor(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_export_downloads_of_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_export_downloads_of_actor(uuid) TO tp_app;
