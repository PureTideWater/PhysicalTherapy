-- Secure intake: source documents, payers and plans (PRD 5, J1, J4 and J5; PRD 6, Agreements and
-- Intake and documents; PRD 8, Core records; PRD 10, Pipeline steps 1 and 2; PRD 15, Files; PRD 16,
-- Upload safety, Encryption and Logging discipline; Data dictionary, Documents and remittances and
-- Payers, contracts and rates; test matrix PAR-06, PAR-27, PAR-28, SEC-08; docs/adr/0013, 0015, 0018
-- and 0026).
--
-- Three PHI tables, each with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - source_document: every uploaded file and every entry of an uploaded zip, one row per upload even
--   for duplicates (PRD 8). Its object key is generated from the practice and the document's own ID,
--   so it is opaque by construction and always inside the practice's prefix (SEC-08; PRD 10: the
--   loader never reads a file from anywhere but the practice's own prefix). Its status is the receipt
--   the Uploads screen shows; the held states name their reason. The first document of a practice
--   with given bytes is unique (PAR-06, PAR-30): a later one with the same SHA-256 is a duplicate.
-- - payer and plan: payer identities and plans as remittances name them, created here so that the 835
--   loader and the contract repository can both reference them (milestones 3 and 4).
--
-- Uploads open only once the practice's business associate agreement is on file (PRD 6, Agreements:
-- "no upload without a BAA"; J1): the handler checks it and gives the reason, and the database refuses
-- a new document without it. A new top-level document names its uploader as the acting user.
--
-- Runs as tp_owner. Safe with the previous image running: three new tables and two new functions,
-- nothing existing changes.

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE source_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  kind text NOT NULL CHECK (kind IN ('x12_835', 'contract', 'exhibit', 'posting_export', 'eft_export', 'payer_letter', 'other')),
  -- Opaque by construction: the practice's prefix and the document's ID, never anything a person typed.
  s3_key text NOT NULL GENERATED ALWAYS AS ('practices/' || practice_id::text || '/documents/' || id::text) STORED,
  -- SHA-256 of the original bytes, computed by the server once they have arrived; fixed once set.
  sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- The declared size of an upload (the presigned PUT's content-length), or a zip entry's uncompressed size.
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  -- The declared content type; what the bytes are is decided by content sniffing, never by this.
  content_type text NOT NULL CHECK (content_type ~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,126}$'),
  uploaded_by uuid NOT NULL REFERENCES "user" (id),
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'flagged', 'unscannable', 'failed')),
  scan_at timestamptz,
  retention_class text NOT NULL DEFAULT 'records' CHECK (retention_class = 'records'),
  -- The zip this document was an entry of.
  parent_document_id uuid REFERENCES source_document (id),
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (status IN (
    -- The intake pipeline: the upload URL is issued; the bytes arrived; the scan is clean (an 835 is
    -- then queued for parse); a clean document of another kind is stored for its workflow; a zip's
    -- entries are their own documents; the parse job holds an 835.
    'awaiting_upload', 'received', 'scanned', 'stored', 'expanded', 'parse_queued',
    -- The parser's receipt states (PRD 5, J4), written by the 835 loader.
    'parsed', 'balanced', 'loaded', 'held',
    -- Held at intake, each with its reason: same bytes as an earlier document; malware, an executable
    -- or a script; declared an 835 but not one; not the declared type; not readable as what it is.
    'duplicate', 'quarantined', 'not_835', 'wrong_type', 'unreadable',
    -- Zip entries held by the zip limits: too large (alone or past the zip's total), compressed beyond
    -- the ratio limit, a zip inside the zip, an unsafe path or link, encrypted; and a zip with too
    -- many entries, which is not expanded at all.
    'too_large', 'too_compressed', 'nested_zip', 'unsafe_entry', 'encrypted', 'too_many_entries',
    -- Intake failed on its last attempt; the operator is alerted and the document can be retried.
    'failed'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_document_scan_time CHECK ((scan_status = 'pending') = (scan_at IS NULL)),
  CONSTRAINT source_document_not_its_own_entry CHECK (parent_document_id IS DISTINCT FROM id)
);
CREATE INDEX source_document_by_practice ON source_document (practice_id, created_at DESC, id);
CREATE INDEX source_document_by_parent ON source_document (parent_document_id, status) WHERE parent_document_id IS NOT NULL;
-- The first document of a practice with these bytes; every later one is its duplicate (PAR-06, PAR-30).
CREATE UNIQUE INDEX source_document_first_of_its_bytes ON source_document (practice_id, sha256) WHERE sha256 IS NOT NULL AND status <> 'duplicate';

CREATE TABLE payer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- The payer's identifier as a remittance gives it, and its name as given.
  payer_id_raw text NOT NULL CHECK (btrim(payer_id_raw) <> ''),
  name_raw text NOT NULL CHECK (btrim(name_raw) <> ''),
  -- A global payer reference, once one exists; nullable until then.
  canonical_payer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One payer per raw identifier in a practice, so a resent remittance finds the payer it created.
CREATE UNIQUE INDEX payer_by_raw_id ON payer (practice_id, payer_id_raw);

CREATE TABLE plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  payer_id uuid NOT NULL REFERENCES payer (id),
  plan_key text NOT NULL CHECK (btrim(plan_key) <> ''),
  name text CHECK (btrim(name) <> ''),
  network_status text NOT NULL DEFAULT 'unknown' CHECK (network_status IN ('in_network', 'out_of_network', 'unknown')),
  is_medicare_advantage boolean NOT NULL DEFAULT false,
  ma_contracted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_ma_contracted_is_medicare_advantage CHECK (is_medicare_advantage OR NOT ma_contracted)
);
-- One plan per payer and plan key in a practice.
CREATE UNIQUE INDEX plan_by_key ON plan (practice_id, payer_id, plan_key);
CREATE INDEX plan_by_payer ON plan (payer_id);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('source_document', '20261016090000_documents_payers_plans', 'source_document_tenant'),
  ('payer', '20261016090000_documents_payers_plans', 'payer_tenant'),
  ('plan', '20261016090000_documents_payers_plans', 'plan_tenant');

-- ---------------------------------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------------------------------

CREATE TRIGGER source_document_updated_at BEFORE UPDATE ON source_document FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payer_updated_at BEFORE UPDATE ON payer FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER plan_updated_at BEFORE UPDATE ON plan FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Whether a practice is in the transaction's scope. The rules below leave a row outside it to the
-- tenant policy, which refuses it after them.
CREATE FUNCTION practice_in_scope(target_practice uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT target_practice = ANY (coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]))
$$;

-- A zip entry's zip is a top-level document of the same practice (zips inside zips are never
-- expanded); the lookup runs under the caller's policies, so a document of a practice outside the
-- transaction's scope is never found. A document's SHA-256 is fixed once set, and a scan verdict is
-- never taken back.
CREATE FUNCTION source_document_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_document_id IS NOT NULL AND practice_in_scope(NEW.practice_id) AND NOT EXISTS (
    SELECT 1 FROM source_document p
     WHERE p.id = NEW.parent_document_id AND p.practice_id = NEW.practice_id AND p.parent_document_id IS NULL
  ) THEN
    RAISE EXCEPTION 'a zip entry belongs to a top-level document of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
      RAISE EXCEPTION 'a document''s SHA-256 never changes once recorded' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.scan_status <> 'pending' AND NEW.scan_status = 'pending' THEN
      RAISE EXCEPTION 'a scan verdict is never taken back' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER source_document_rules BEFORE INSERT OR UPDATE ON source_document FOR EACH ROW EXECUTE FUNCTION source_document_rules();

-- A plan's payer is a payer of the same practice, found under the caller's policies.
CREATE FUNCTION plan_payer_of_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM payer p WHERE p.id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a plan belongs to a payer of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER plan_payer_of_practice BEFORE INSERT OR UPDATE OF payer_id, practice_id ON plan FOR EACH ROW EXECUTE FUNCTION plan_payer_of_practice();

-- Whether the practice's business associate agreement is on file: a BAA its owning group signed, for
-- the practice or for the whole group (PRD 6, Agreements: "no upload without a BAA"). It answers only
-- for a practice in the transaction's scope, and only yes or no: a firm user working the practice
-- under a grant cannot read the group's agreements, but may learn whether uploads are open.
CREATE FUNCTION practice_baa_on_file(target_practice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT practice_in_scope(target_practice)
     AND EXISTS (
       SELECT 1 FROM agreement a JOIN practice p ON p.id = target_practice
        WHERE a.kind = 'baa' AND a.signed_at <= now() AND a.organization_id = p.organization_id
          AND (a.practice_id = target_practice OR a.practice_id IS NULL)
     )
$$;

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE source_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_document FORCE ROW LEVEL SECURITY;
CREATE POLICY source_document_tenant ON source_document
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- No upload without the BAA (J1), and nobody records an upload in another person's name; a zip's
-- entries carry the zip's uploader.
CREATE POLICY source_document_requires_baa ON source_document AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK ((SELECT practice_baa_on_file(practice_id)));
CREATE POLICY source_document_uploaded_by_actor ON source_document AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (parent_document_id IS NOT NULL OR uploaded_by = app_actor_id());

ALTER TABLE payer ENABLE ROW LEVEL SECURITY;
ALTER TABLE payer FORCE ROW LEVEL SECURITY;
CREATE POLICY payer_tenant ON payer
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_tenant ON plan
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

-- ---------------------------------------------------------------------------------------------------
-- Privileges: nothing is deleted or truncated by the application (retention, PRD 19); a document's
-- kind, size, declared type, uploader, zip and key never change.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON source_document, payer, plan FROM PUBLIC;
GRANT SELECT ON source_document, payer, plan TO tp_app;
GRANT INSERT (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, parent_document_id, status) ON source_document TO tp_app;
GRANT UPDATE (sha256, scan_status, scan_at, status) ON source_document TO tp_app;
GRANT INSERT (id, practice_id, payer_id_raw, name_raw, canonical_payer_id) ON payer TO tp_app;
GRANT UPDATE (name_raw, canonical_payer_id) ON payer TO tp_app;
GRANT INSERT (id, practice_id, payer_id, plan_key, name, network_status, is_medicare_advantage, ma_contracted) ON plan TO tp_app;
GRANT UPDATE (name, network_status, is_medicare_advantage, ma_contracted) ON plan TO tp_app;

REVOKE ALL ON FUNCTION practice_in_scope(uuid), source_document_rules(), plan_payer_of_practice(), practice_baa_on_file(uuid) FROM PUBLIC;
-- Called by the BAA policy and the rules, which run as the application role, and by the upload handler.
GRANT EXECUTE ON FUNCTION practice_in_scope(uuid), practice_baa_on_file(uuid) TO tp_app;
