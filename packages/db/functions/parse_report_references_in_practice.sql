-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- parse_report_references_in_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 377d9e5cdfe2b80c
-- Trigger function of: parse_report.parse_report_references_in_practice
CREATE OR REPLACE FUNCTION public.parse_report_references_in_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a parse report belongs to a document of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.parse_report_references_in_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.parse_report_references_in_practice() FROM PUBLIC;
