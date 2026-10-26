-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_export_row_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 29c7670a2e40ee0d
-- Trigger function of: eft_row.eft_row_belongs
-- Trigger function of: posting_row.posting_row_belongs
CREATE OR REPLACE FUNCTION public.ledger_export_row_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  exported record;
BEGIN
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    RAISE EXCEPTION 'an export row is read from its export by the reconcile job, never written by a person' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT d.kind, d.scan_status, d.status, d.parent_document_id INTO exported FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an export row is a row of an export of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF exported.kind IS DISTINCT FROM (CASE TG_TABLE_NAME WHEN 'posting_row' THEN 'posting_export' ELSE 'eft_export' END) THEN
    RAISE EXCEPTION 'a posting row is a row of a posting export, and an EFT row of an EFT export' USING ERRCODE = 'check_violation';
  END IF;
  IF exported.scan_status IS DISTINCT FROM 'clean' OR exported.status IS DISTINCT FROM 'stored' THEN
    RAISE EXCEPTION 'an export row is read from an export stored with a clean malware scan, before it is loaded' USING ERRCODE = 'check_violation';
  END IF;
  IF exported.parent_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_document z WHERE z.id = exported.parent_document_id AND z.scan_status = 'clean') THEN
    RAISE EXCEPTION 'an export row of a zip entry is read only when its zip''s malware scan is clean' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.ledger_export_row_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_export_row_belongs() FROM PUBLIC;
