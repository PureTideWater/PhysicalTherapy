-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- report_document_no_truncate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: a4415278b751e6c5
-- Trigger function of: report_document.report_document_no_truncate
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.report_document_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'report_document cannot be truncated: a generated report keeps its figures' USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.report_document_no_truncate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.report_document_no_truncate() FROM PUBLIC;
