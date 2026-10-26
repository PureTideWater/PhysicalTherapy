-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- source_document_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b77558b4de441f4f
-- Trigger function of: source_document.source_document_rules
CREATE OR REPLACE FUNCTION public.source_document_rules()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  zip_uploader uuid;
  zip_scan text;
  zip_format text;
BEGIN
  -- A zip entry's zip is a top-level document of the same practice (zips inside zips are never
  -- expanded); the lookup runs under the caller's policies, so a document of a practice outside the
  -- transaction's scope is never found (the tenant policy refuses the row after these rules).
  IF NEW.parent_document_id IS NOT NULL AND practice_in_scope(NEW.practice_id) AND (TG_OP = 'INSERT' OR NEW.scan_status IS DISTINCT FROM OLD.scan_status) THEN
    SELECT p.uploaded_by, p.scan_status, p.format_id INTO zip_uploader, zip_scan, zip_format
      FROM source_document p
     WHERE p.id = NEW.parent_document_id AND p.practice_id = NEW.practice_id AND p.parent_document_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a zip entry belongs to a top-level document of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.uploaded_by IS DISTINCT FROM zip_uploader THEN
      RAISE EXCEPTION 'a zip entry carries its zip''s uploader' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.format_id IS DISTINCT FROM zip_format THEN
      RAISE EXCEPTION 'a zip entry carries its zip''s export format' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.scan_status = 'clean' AND zip_scan IS DISTINCT FROM 'clean' THEN
      RAISE EXCEPTION 'a zip entry is clean only when its zip''s malware scan is' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.status IN ('scanned', 'parse_queued') AND NEW.scan_status <> 'clean' THEN
    RAISE EXCEPTION 'a document is scanned or queued for parse only when its malware scan is clean' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
      RAISE EXCEPTION 'a document''s SHA-256 never changes once recorded' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.scan_status <> 'pending' AND NEW.scan_status = 'pending' THEN
      RAISE EXCEPTION 'a scan verdict is never taken back' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.scan_status IN ('flagged', 'unscannable') AND NEW.scan_status IS DISTINCT FROM OLD.scan_status THEN
      RAISE EXCEPTION 'a malware finding is never cleared' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('quarantined', 'duplicate') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'a quarantined or duplicate document stays so' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.source_document_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.source_document_rules() FROM PUBLIC;
