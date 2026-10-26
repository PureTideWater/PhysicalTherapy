-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_export_count(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f08f20c5004940fd
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_export_count(target uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT count(*)::integer
    FROM audit_event e
   WHERE practice_in_scope(target) AND coalesce(app_actor_permitted(target, 'report.read'), false)
     AND e.practice_id = target
     AND e.action IN ('audit_report_downloaded', 'roi_statement_downloaded', 'report_document_downloaded', 'monthly_summary_downloaded', 'packet_export_downloaded',
                      'packet_export_pdf_downloaded', 'packet_export_csv_downloaded')
$function$;
ALTER FUNCTION public.practice_export_count(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_export_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_export_count(uuid) TO tp_app;
