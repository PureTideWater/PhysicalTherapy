-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- report_document_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1f2bfc271aad9a0c
-- Trigger function of: report_document.report_document_belongs
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.report_document_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.pricing_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pricing_run r WHERE r.id = NEW.pricing_run_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a coverage report reads a pricing run of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.report_document_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.report_document_belongs() FROM PUBLIC;
