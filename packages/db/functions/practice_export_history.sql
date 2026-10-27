-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_export_history(uuid,integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f07d977a669d671b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_export_history(target uuid, page_size integer, page_offset integer)
 RETURNS TABLE(event_id uuid, action text, object_type text, object_id uuid, purpose text, actor_id uuid, at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT e.id, e.action, e.object_type, e.object_id, e.purpose, e.actor_id, e.at
    FROM audit_event e
   WHERE practice_in_scope(target) AND coalesce(app_actor_permitted(target, 'report.read'), false)
     AND e.practice_id = target
     AND e.action IN ('audit_report_downloaded', 'roi_statement_downloaded', 'report_document_downloaded', 'monthly_summary_downloaded', 'packet_export_downloaded',
                      'packet_export_pdf_downloaded', 'packet_export_csv_downloaded')
   ORDER BY e.at DESC, e.id DESC
   LIMIT least(greatest(page_size, 0), 200) OFFSET greatest(page_offset, 0)
$function$;
ALTER FUNCTION public.practice_export_history(uuid,integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_export_history(uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_export_history(uuid,integer,integer) TO tp_app;
