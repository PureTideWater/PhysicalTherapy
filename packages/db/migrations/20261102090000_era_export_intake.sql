-- ERA exports as first-class intake (Change Order 001, CO-03, second part; reconciliation-001 decisions D12 (a)
-- and D13 (a), approved 2026-10-17; PRD 6, Intake and documents; PRD 10, Pipeline steps 8 and 9; docs/adr/0031,
-- 0059 and 0060).
--
-- A practice-management system's ERA export (one CSV row per service line, its claim's and its payment's fields
-- repeated) loads into the same remittance, claim, service_line and adjustment rows an 835 makes, so pricing,
-- triage and the ledger read one shape. No table is added; no ledger, pricing or rule table is touched.
--
-- - source_document: a new kind, era_export (x12_835 stays the first value), and format_id, the vendor format
--   (packages/synth's registry, the worker's runtime registry): required exactly for an era_export, one of the
--   four ERA format IDs, inserted with the document and never changed. A zip entry carries its zip's format.
--   A future _v1 needs a migration (a test holds this list to the registries); confirming a format is data.
-- - remittance.provenance: x12_835 (the default, so every existing row is an 835) or era_export. The X12
--   envelope (ISA06, ISA08, ISA13, GS06, ST02, TRN03, BPR04 and N103) is required only of an 835; an export
--   carries no receiver, ISA13, GS06, ST02, TRN03 or payee qualifier, and its sender and payment method only when
--   its columns hold them. trn02 holds the export's check or EFT number, bpr02_cents its payment unsigned with
--   bpr_credit_debit D when the payment is negative, bpr16_date its payment date.
-- - remittance_export_once: the export duplicate key (practice, payee, TRN02, credit or debit, BPR02, BPR16) over
--   export rows. remittance_once is unchanged; an export row's NULL isa13 never meets it.
-- - remittance_references_in_practice(): a remittance comes from a document of its own provenance, and, as a
--   backstop to the loader's rule (D13 a, the 835 is authoritative), an export of a payment already loaded from
--   either source and an 835 of a payment first loaded from an export are refused. The loader holds both before
--   any insert, under the trace's advisory lock, and says so on the receipt.
-- - claim.filing_indicator: nullable, since an export carries no CLP06; a claim of an 835 still carries it.
--
-- No held reason or status is added to any CHECK: an export's holds live in its parse report's jsonb.
--
-- Runs as tp_owner. Safe with the previous image running: yes. Added: a defaulted column, a nullable column,
-- two widened CHECKs and three new ones every existing row meets (each an 835 with its envelope, of an x12_835
-- document, with no format), a partial unique index over rows only this image writes, and trigger functions
-- that accept every row the previous image writes (an 835 from an x12_835 document, a claim with CLP06, a zip
-- entry with no format). Backfilled: provenance, through its default (metadata only). Removed: nothing. One
-- mixed-fleet case: an era_export document taken by a previous worker image is retried and then marked failed
-- (its intake throws on the unknown kind; its parse job skips a document that is not an 835) and can be retried
-- from Uploads once the new worker runs; none exists until the new web image accepts the kind.

-- ---------------------------------------------------------------------------------------------------
-- source_document: the era_export kind and its format
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE source_document DROP CONSTRAINT source_document_kind_check;
ALTER TABLE source_document
  ADD CONSTRAINT source_document_kind_check CHECK (kind IN ('x12_835', 'era_export', 'contract', 'exhibit', 'posting_export', 'eft_export', 'payer_letter', 'other')),
  -- The vendor format of an ERA export, from the format registry; the person names it at upload.
  ADD COLUMN format_id text CHECK (format_id IN ('webpt_billing_era_v0', 'prompt_era_v0', 'spry_era_v0', 'raintree_era_v0')),
  ADD CONSTRAINT source_document_format_of_era_export CHECK ((kind = 'era_export') = (format_id IS NOT NULL));

-- The full body of 20261017090000, and one rule more: a zip entry carries its zip's format.
CREATE OR REPLACE FUNCTION source_document_rules() RETURNS trigger LANGUAGE plpgsql AS $$
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
$$;

-- Inserted with the document; no UPDATE grant, so a document's format never changes.
GRANT INSERT (format_id) ON source_document TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- remittance: provenance, the envelope only for an 835, and the export duplicate key
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE remittance
  ADD COLUMN provenance text NOT NULL DEFAULT 'x12_835' CHECK (provenance IN ('x12_835', 'era_export')),
  ALTER COLUMN sender_id DROP NOT NULL,
  ALTER COLUMN receiver_id DROP NOT NULL,
  ALTER COLUMN isa13 DROP NOT NULL,
  ALTER COLUMN gs06 DROP NOT NULL,
  ALTER COLUMN st02 DROP NOT NULL,
  ALTER COLUMN trn03 DROP NOT NULL,
  ALTER COLUMN bpr_method DROP NOT NULL,
  ALTER COLUMN payee_id_qualifier DROP NOT NULL,
  -- An 835 carries its whole envelope, as before (each field keeps its btrim CHECK).
  ADD CONSTRAINT remittance_x12_envelope CHECK (
    provenance <> 'x12_835'
    OR (sender_id IS NOT NULL AND receiver_id IS NOT NULL AND isa13 IS NOT NULL AND gs06 IS NOT NULL AND st02 IS NOT NULL
        AND trn03 IS NOT NULL AND bpr_method IS NOT NULL AND payee_id_qualifier IS NOT NULL)
  ),
  -- An export invents no envelope: it has no receiver, interchange, group or transaction control number, no
  -- TRN03 and no payee qualifier. Its sender and payment method are kept when its columns hold them.
  ADD CONSTRAINT remittance_export_has_no_envelope CHECK (
    provenance <> 'era_export'
    OR (receiver_id IS NULL AND isa13 IS NULL AND gs06 IS NULL AND st02 IS NULL AND trn03 IS NULL AND payee_id_qualifier IS NULL)
  );

-- The export duplicate key (D12 a): payee, trace (TRN02, the export's check or EFT number), the signed payment
-- (BPR02 is stored unsigned, so its credit or debit is part of the amount) and the payment date. An 835 keeps
-- remittance_once; an 835 and an export of one payment meet in the loader and the trigger below, not in a unique
-- index, because two 835s may share payee, trace, amount and date under different TRN03 values (ADR 0031).
CREATE UNIQUE INDEX remittance_export_once ON remittance (practice_id, payee_npi, trn02, bpr_credit_debit, bpr02_cents, bpr16_date) WHERE provenance = 'era_export';

-- A remittance comes from a document of its own provenance (an 835 from an x12_835 document, an export from
-- an era_export document) of the same practice; the payer and review checks are unchanged. Then the backstop
-- of D13 (a), the 835 authoritative: an export of a payment the practice already holds (from an 835 or another
-- export) is refused, and so is an 835 of a payment first loaded from an export, which the loader holds for
-- review instead (priced lines are never replaced, CLAUDE.md rule 3). The loader decides both first, inside
-- the document's transaction under the trace's advisory lock, and its receipt says what happened.
CREATE OR REPLACE FUNCTION remittance_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) THEN
    IF NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id AND d.kind = NEW.provenance) THEN
      RAISE EXCEPTION 'a remittance comes from a document of its provenance (an 835 or an ERA export) of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM payer p WHERE p.id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a remittance names a payer of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.review_of_remittance_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.review_of_remittance_id AND r.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a remittance is reviewed against a remittance of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.provenance = 'era_export' AND EXISTS (
      SELECT 1 FROM remittance r
       WHERE r.practice_id = NEW.practice_id AND r.payee_npi = NEW.payee_npi AND r.trn02 = NEW.trn02 AND r.bpr_credit_debit = NEW.bpr_credit_debit
         AND r.bpr02_cents = NEW.bpr02_cents AND r.bpr16_date = NEW.bpr16_date
    ) THEN
      RAISE EXCEPTION 'an ERA export of a payment already loaded loads nothing' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.provenance = 'x12_835' AND EXISTS (
      SELECT 1 FROM remittance r
       WHERE r.practice_id = NEW.practice_id AND r.provenance = 'era_export' AND r.payee_npi = NEW.payee_npi AND r.trn02 = NEW.trn02
         AND r.bpr_credit_debit = NEW.bpr_credit_debit AND r.bpr02_cents = NEW.bpr02_cents AND r.bpr16_date = NEW.bpr16_date
    ) THEN
      RAISE EXCEPTION 'an 835 of a payment loaded from an ERA export is held for review, never loaded beside it' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Inserted with the remittance by the loader, which already inserts every other column.
GRANT INSERT (provenance) ON remittance TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- claim: CLP06 only of an 835
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE claim ALTER COLUMN filing_indicator DROP NOT NULL;

-- The full body of 20261016120000; on INSERT, the claim's remittance is read with its provenance, and a claim
-- of an 835 carries its filing indicator (CLP06) as before.
CREATE OR REPLACE FUNCTION claim_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  remittance_provenance text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.reversal_of_claim_id IS NOT NULL AND NEW.reversal_of_claim_id IS DISTINCT FROM OLD.reversal_of_claim_id THEN
      RAISE EXCEPTION 'a reversal''s link to the claim it reverses never changes once set' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.superseded_by_claim_id IS NOT NULL AND NEW.superseded_by_claim_id IS DISTINCT FROM OLD.superseded_by_claim_id THEN
      RAISE EXCEPTION 'a claim''s superseding correction never changes once set' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF practice_in_scope(NEW.practice_id) THEN
    IF TG_OP = 'INSERT' THEN
      SELECT r.provenance INTO remittance_provenance FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'a claim belongs to a remittance of the same practice' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.filing_indicator IS NULL AND remittance_provenance = 'x12_835' THEN
        RAISE EXCEPTION 'a claim of an 835 carries its claim filing indicator (CLP06)' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM patient_ref p WHERE p.id = NEW.patient_ref_id AND p.practice_id = NEW.practice_id)
         OR (NEW.insured_ref_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM patient_ref p WHERE p.id = NEW.insured_ref_id AND p.practice_id = NEW.practice_id)) THEN
        RAISE EXCEPTION 'a claim names patient references of the same practice' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW.reversal_of_claim_id IS NOT NULL AND NEW.reversal_of_claim_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.reversal_of_claim_id END)
       AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.reversal_of_claim_id AND c.practice_id = NEW.practice_id AND c.claim_status_code <> '22') THEN
      RAISE EXCEPTION 'a reversal reverses a claim of the same practice that is not itself a reversal' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.superseded_by_claim_id IS NOT NULL AND NEW.superseded_by_claim_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.superseded_by_claim_id END)
       AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.superseded_by_claim_id AND c.practice_id = NEW.practice_id AND c.claim_status_code <> '22') THEN
      RAISE EXCEPTION 'a claim is superseded by a corrected claim of the same practice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
