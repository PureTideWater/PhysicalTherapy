-- The malware gate and the uploader, held by the database (milestones 2 and 3 review; PRD 10, Pipeline
-- step 2: "Malware scan result must be clean"; PRD 6, Intake and documents: "malware scan on arrival",
-- "a renamed executable is quarantined"; Data dictionary, source_document.uploaded_by; CLAUDE.md: "Rely
-- on middleware alone for authorization. Check in the handler and in Postgres"; docs/adr/0026 and 0032).
--
-- Migration 20261016090000 said a scan verdict is never taken back but refused only a return to
-- pending, and trusted the application with every other step. From here, for every role:
--
-- - A malware finding (scan_status flagged or unscannable) is never cleared, and a quarantined or
--   duplicate document stays so (its status never changes again).
-- - A document is scanned (the status that queues its parse) or parse_queued only with a clean scan.
-- - A zip entry is clean only when its zip's scan is clean (the archive is scanned whole), and it
--   carries its zip's uploader: nobody records an entry in another person's name.
--
-- And for the application role, a new document is inserted unscanned and unhashed: a top-level upload
-- awaiting its bytes, a zip entry received or held, never already clean (a restrictive policy).
--
-- Runs as tp_owner. Safe with the previous image running: one trigger function replaced and one
-- policy added; every write the previous image makes keeps these rules (the scan, the sniff and the
-- parse set them in this order already).

CREATE OR REPLACE FUNCTION source_document_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  zip_uploader uuid;
  zip_scan text;
BEGIN
  -- A zip entry's zip is a top-level document of the same practice (zips inside zips are never
  -- expanded); the lookup runs under the caller's policies, so a document of a practice outside the
  -- transaction's scope is never found (the tenant policy refuses the row after these rules).
  IF NEW.parent_document_id IS NOT NULL AND practice_in_scope(NEW.practice_id) AND (TG_OP = 'INSERT' OR NEW.scan_status IS DISTINCT FROM OLD.scan_status) THEN
    SELECT p.uploaded_by, p.scan_status INTO zip_uploader, zip_scan
      FROM source_document p
     WHERE p.id = NEW.parent_document_id AND p.practice_id = NEW.practice_id AND p.parent_document_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a zip entry belongs to a top-level document of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.uploaded_by IS DISTINCT FROM zip_uploader THEN
      RAISE EXCEPTION 'a zip entry carries its zip''s uploader' USING ERRCODE = 'check_violation';
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
$$;

-- The application inserts a document before its bytes are scanned or hashed: a top-level upload
-- awaiting its bytes, a zip entry received (or held by the zip limits), never already clean.
CREATE POLICY source_document_inserted_unscanned ON source_document AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (scan_status = 'pending' AND sha256 IS NULL AND (parent_document_id IS NOT NULL OR status = 'awaiting_upload'));
