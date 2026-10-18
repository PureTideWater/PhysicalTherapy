-- Deadline verification and the attested export (Change Order 001, CO-05 and CO-12's packet_version row;
-- reconciliation-001 PR 5 and decisions D15 (a), D16 (a) plus (c) and D17 (a), approved 2026-10-17; PRD 12,
-- The packet, Approval and Submission; PRD 11 step 8; CLAUDE.md rules 1 and 3). Decisions: docs/adr/0061,
-- 0041 and 0038.
--
-- A deadline is verified only from a source a person signed off (D17 a): for Medicare and Medicare Advantage
-- non-contracted lines, the rule release's dispute-window record at L2 or higher (L3 for E3); for a contract
-- line, the signed-off version's own dispute window with its page, quote and hash, verified by a contract
-- specialist. A release's commercial_default is never verified. The status is derived from each line's
-- stored trace (steps.window), so the engine is untouched. No table is added; no ledger, pricing or rule table
-- is touched, and no policy, RLS setting or registry row changes.
--
-- - contract_version: the window's evidence, additively and in rate_record's form. dispute_window_evidence
--   {document_id, page, quote, hash} (null by default: every existing version's lines stay DEADLINE_UNVERIFIED
--   until a corrected version carries it), with the specialist who verified it and when
--   (dispute_window_verified_by and _at, named like rate_record.verified_by and verified_at).
--   contract_version_rules() is 20261016160000's body with the evidence among the terms and the verification
--   among what approval, sign-off and retirement never change, so both are frozen from approval exactly like
--   dispute_window_days; a draft's verification is a specialist's, once, in their own name, now, over complete
--   evidence on one of the version's documents, and any edit of the window, its evidence or the documents
--   clears it, as an edit clears a rate record's. A version whose window is cited but unverified, or cited
--   from a document it does not name, is not approved.
-- - packet_version.deadline_verification_status (CO-12): verified, unverified or not_applicable, generated
--   from the content (tp-packet/2's content.deadline.status; 'unverified' for every tp-packet/1 version), so no
--   role writes it. It is what the version stated when written, which packet_version_deadline_stated holds to
--   the database's own derivation; nothing trusts it at export, where the guard derives it again.
-- - packet_content_valid(): tp-packet/1 exactly as before; tp-packet/2 also carries content.deadline (basis,
--   status, ends_on) and, on each line, a deadline (status, ends_on, source) and a calculation.
-- - priced_line_deadline_status(), case_next_window_deadline_status() and packet_version_deadline_status():
--   the derivation, mirroring @tp/triage's deadlineVerification(), nextLevelDeadlineVerification() and
--   packetDeadlineStatus() (a database test runs both on the same lines). SECURITY INVOKER: under the caller's
--   policies a row it cannot see yields 'unverified', so every check below fails closed.
-- - The export (packet_version_export_guard): refused while the deadline, derived now, is unverified, and
--   unless it carries the verifier's passing tp-packet-verifier/2 report over the narrative it rendered
--   (export_verifier_report, whose narrative_sha256 is the version's). The worker refuses both first.
-- - The attestation (D16, audit_report's pattern): once the export is made, a reimbursement reviewer
--   (audit_finding.validate, which only the reviewer role holds, reaching the practice under a support grant)
--   attests once, in their own name, over the export's two SHA-256 and a checklist of codes (no words). The
--   attester is neither of the drafters nor the approver; the version is current and still its case's, and its
--   deadline still not unverified. A submission is logged only of an attested export.
--
-- Why tp_app cannot bypass the refusal: tp_owner owns the tables, triggers and functions, and tp_app owns
-- nothing and has no BYPASSRLS, so it can neither ALTER the table nor DISABLE a trigger, and only a superuser
-- sets session_replication_role. Its column grants are the only columns it writes: exported_at only through
-- packet_version_rules (for a job actor), deadline_verification_status never. The guard reads rows that cannot
-- change underneath it: priced_line and rule_record are immutable, a contract window is frozen from approval,
-- and the version's status is read at export.
--
-- Runs as tp_owner. Safe with the previous image running: yes. Added: nullable columns and a generated one
-- (adding it rewrites the small packet_version table under a brief ACCESS EXCLUSIVE lock; every existing row is
-- tp-packet/1 and becomes 'unverified', so nothing is backfilled), CHECKs every existing row meets, new
-- functions and triggers; replaced: packet_content_valid() and contract_version_rules() with their signatures,
-- accepting tp-packet/1 and a version with no window citation as before. Removed: nothing. For the previous
-- image: its tp-packet/1 versions are written and approved, but their export is refused (its export job fails
-- them), its submissions of unattested exports are refused, and its triage, which does not know
-- DEADLINE_UNVERIFIED, may open cases whose export the guard refuses: each is the approved outcome. Deploy
-- order: migrate first (docs/adr/0049).

-- ---------------------------------------------------------------------------------------------------
-- contract_version: the dispute window's evidence and its verification
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE contract_version
  -- {document_id, page, quote, hash}: where the contract states its dispute window, as a rate record cites its terms.
  ADD COLUMN dispute_window_evidence jsonb,
  -- The contract specialist who verified the window against its page, and when.
  ADD COLUMN dispute_window_verified_by uuid REFERENCES "user" (id),
  ADD COLUMN dispute_window_verified_at timestamptz,
  ADD CONSTRAINT contract_version_window_evidence_complete CHECK (
    dispute_window_evidence IS NULL OR (
      rate_record_evidence_complete(dispute_window_evidence)
      AND (dispute_window_evidence - ARRAY['document_id', 'page', 'quote', 'hash']) = '{}'::jsonb
      AND char_length(dispute_window_evidence ->> 'quote') <= 2000
    )
  ),
  ADD CONSTRAINT contract_version_window_evidence_needs_window CHECK (dispute_window_evidence IS NULL OR dispute_window_days IS NOT NULL),
  ADD CONSTRAINT contract_version_window_verification_recorded CHECK ((dispute_window_verified_by IS NULL) = (dispute_window_verified_at IS NULL)),
  ADD CONSTRAINT contract_version_window_verified_with_evidence CHECK (dispute_window_verified_by IS NULL OR dispute_window_evidence IS NOT NULL);

-- The full body of 20261016160000, with the window's evidence among the terms (terms_changed), its
-- verification among what approval, sign-off and retirement never change, the verification itself on a
-- draft or proposed version, and approval refused while a cited window is unverified (each marked "window").
CREATE OR REPLACE FUNCTION contract_version_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  prior contract_version%ROWTYPE;
  records bigint;
  unverified bigint;
  stray bigint;
  terms_changed boolean;
  -- window: what the verification reads (the days, the evidence, the documents), and the verification itself.
  window_changed boolean;
  window_verification_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.signed_off_by IS NOT NULL THEN
      RAISE EXCEPTION 'a contract version starts as a draft' USING ERRCODE = 'check_violation';
    END IF;
    -- window: written unverified (a correction or an amendment copies the citation, never its verification),
    -- citing one of the version's documents. Incomplete evidence is the CHECK's to refuse.
    IF NEW.dispute_window_verified_by IS NOT NULL OR NEW.dispute_window_verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'a contract version is written with its dispute window unverified; a contract specialist verifies it afterwards' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.dispute_window_evidence IS NOT NULL AND rate_record_evidence_complete(NEW.dispute_window_evidence)
       AND NOT ((NEW.dispute_window_evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)) THEN
      RAISE EXCEPTION 'a dispute window''s evidence is a document of its version' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT practice_in_scope(NEW.practice_id) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM contract c WHERE c.id = NEW.contract_id AND c.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a contract version belongs to a contract of the same practice' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF (NEW.id, NEW.practice_id, NEW.contract_id, NEW.version_no, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.contract_id, OLD.version_no, OLD.created_at) THEN
      RAISE EXCEPTION 'a contract version''s contract and number never change' USING ERRCODE = 'check_violation';
    END IF;
    terms_changed := (NEW.source_document_ids, NEW.effective_from, NEW.supersedes_id, NEW.timely_filing_days, NEW.dispute_window_days, NEW.appeal_levels, NEW.notice_days, NEW.dispute_window_evidence)
      IS DISTINCT FROM (OLD.source_document_ids, OLD.effective_from, OLD.supersedes_id, OLD.timely_filing_days, OLD.dispute_window_days, OLD.appeal_levels, OLD.notice_days, OLD.dispute_window_evidence);
    window_changed := (NEW.source_document_ids, NEW.dispute_window_days, NEW.dispute_window_evidence) IS DISTINCT FROM (OLD.source_document_ids, OLD.dispute_window_days, OLD.dispute_window_evidence);
    window_verification_changed := (NEW.dispute_window_verified_by, NEW.dispute_window_verified_at) IS DISTINCT FROM (OLD.dispute_window_verified_by, OLD.dispute_window_verified_at);

    IF OLD.status IN ('draft', 'proposed') THEN
      IF NEW.status = OLD.status THEN
        IF NEW.approved_by IS NOT NULL OR NEW.signed_off_by IS NOT NULL THEN
          RAISE EXCEPTION 'a draft is approved by moving it to approved' USING ERRCODE = 'check_violation';
        END IF;
      ELSIF OLD.status = 'draft' AND NEW.status = 'proposed' THEN
        IF NOT EXISTS (SELECT 1 FROM rate_record r WHERE r.contract_version_id = NEW.id) THEN
          RAISE EXCEPTION 'a proposal carries at least one rate record' USING ERRCODE = 'check_violation';
        END IF;
      ELSIF NEW.status = 'approved' THEN
        -- Approval by a contract specialist, recorded with the user and the time.
        IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
          RAISE EXCEPTION 'only a contract specialist approves a contract version' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NEW.approved_by IS DISTINCT FROM app_actor_id() OR NEW.approved_at IS DISTINCT FROM now() OR NEW.signed_off_by IS NOT NULL THEN
          RAISE EXCEPTION 'an approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
        END IF;
        IF terms_changed OR NEW.effective_to IS DISTINCT FROM OLD.effective_to OR window_verification_changed THEN
          RAISE EXCEPTION 'a version is approved as it stands; edit it first, then approve it' USING ERRCODE = 'check_violation';
        END IF;
        IF cardinality(NEW.source_document_ids) = 0 THEN
          RAISE EXCEPTION 'an approved version names the documents it is abstracted from' USING ERRCODE = 'check_violation';
        END IF;
        SELECT count(*), count(*) FILTER (WHERE r.verified_by IS NULL),
               count(*) FILTER (WHERE r.verified_by IS NOT NULL AND NOT ((r.evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)))
          INTO records, unverified, stray
          FROM rate_record r WHERE r.contract_version_id = NEW.id;
        IF records = 0 OR unverified > 0 THEN
          RAISE EXCEPTION 'a version is approved once each of its rate records is verified, and it has at least one' USING ERRCODE = 'check_violation';
        END IF;
        IF stray > 0 THEN
          RAISE EXCEPTION 'every rate record''s evidence is a document of its version' USING ERRCODE = 'check_violation';
        END IF;
        -- window: a cited window is approved verified, from one of the version's documents.
        IF NEW.dispute_window_evidence IS NOT NULL AND NEW.dispute_window_verified_by IS NULL THEN
          RAISE EXCEPTION 'a version whose dispute window is cited is approved once a contract specialist has verified the window' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.dispute_window_evidence IS NOT NULL AND NOT ((NEW.dispute_window_evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)) THEN
          RAISE EXCEPTION 'a dispute window''s evidence is a document of its version' USING ERRCODE = 'check_violation';
        END IF;
      ELSE
        RAISE EXCEPTION 'a contract version moves draft, proposed, approved, signed off, superseded, in that order' USING ERRCODE = 'check_violation';
      END IF;
      -- window: on a draft or proposed version, a verification is a contract specialist's, once, in their own
      -- name and now, over complete evidence on one of the version's documents, with nothing else of the window
      -- changing and the status unchanged; any other change of the window, its evidence or the documents clears it.
      IF NEW.status IN ('draft', 'proposed') THEN
        IF window_verification_changed AND OLD.dispute_window_verified_by IS NULL THEN
          IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
            RAISE EXCEPTION 'only a contract specialist verifies a contract''s dispute window' USING ERRCODE = 'insufficient_privilege';
          END IF;
          IF NEW.dispute_window_verified_by IS DISTINCT FROM app_actor_id() OR NEW.dispute_window_verified_at IS DISTINCT FROM now() THEN
            RAISE EXCEPTION 'a dispute window''s verification records the verifying specialist and the time' USING ERRCODE = 'check_violation';
          END IF;
          IF window_changed OR NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'a dispute window is verified as it stands; edit it first, then verify it' USING ERRCODE = 'check_violation';
          END IF;
          IF NOT rate_record_evidence_complete(NEW.dispute_window_evidence) THEN
            RAISE EXCEPTION 'a dispute window cannot be verified without evidence naming a document, a page, a quote and a hash' USING ERRCODE = 'check_violation';
          END IF;
          IF NOT ((NEW.dispute_window_evidence ->> 'document_id')::uuid = ANY (NEW.source_document_ids)) THEN
            RAISE EXCEPTION 'a dispute window''s evidence is a document of its version' USING ERRCODE = 'check_violation';
          END IF;
        ELSIF window_verification_changed AND NEW.dispute_window_verified_by IS NOT NULL THEN
          RAISE EXCEPTION 'a dispute window''s verification is recorded once' USING ERRCODE = 'check_violation';
        ELSIF window_changed THEN
          -- An edit of the window clears its verification with it.
          NEW.dispute_window_verified_by := NULL;
          NEW.dispute_window_verified_at := NULL;
        END IF;
      END IF;
      IF NEW.status IN ('draft', 'proposed') AND terms_changed AND practice_in_scope(NEW.practice_id) THEN
        IF NOT contract_version_documents_ok(NEW) THEN
          RAISE EXCEPTION 'a version''s documents are clean contract, exhibit or payer-letter documents of its practice, each named once' USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'signed_off' THEN
      -- Customer sign-off, recorded with the user and the time.
      IF NOT coalesce(app_actor_permitted(NEW.practice_id, 'contract.sign_off'), false) THEN
        RAISE EXCEPTION 'only a practice administrator or billing manager signs off a contract version' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.signed_off_by IS DISTINCT FROM app_actor_id() OR NEW.signed_off_at IS DISTINCT FROM now()
         OR terms_changed OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
         OR (NEW.approved_by, NEW.approved_at, NEW.dispute_window_verified_by, NEW.dispute_window_verified_at) IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.dispute_window_verified_by, OLD.dispute_window_verified_at) THEN
        RAISE EXCEPTION 'a sign-off records the signing user and the time and changes nothing else' USING ERRCODE = 'check_violation';
      END IF;
      -- The successor's sign-off retires the version it names: closed at the successor's start
      -- (an amendment, CON-02) or superseded (a correction, or a version that was never signed off).
      IF NEW.supersedes_id IS NOT NULL THEN
        SELECT * INTO prior FROM contract_version p WHERE p.id = NEW.supersedes_id FOR UPDATE;
        IF NOT FOUND OR prior.contract_id <> NEW.contract_id OR prior.status NOT IN ('approved', 'signed_off') THEN
          RAISE EXCEPTION 'the version a successor names is an approved or signed-off version of the same contract' USING ERRCODE = 'check_violation';
        END IF;
        IF prior.status = 'approved' OR NEW.effective_from <= prior.effective_from THEN
          UPDATE contract_version SET status = 'superseded' WHERE id = prior.id;
        ELSIF prior.effective_to IS NULL OR NEW.effective_from < prior.effective_to THEN
          UPDATE contract_version SET effective_to = NEW.effective_from WHERE id = prior.id;
        END IF;
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'superseded'
          OR OLD.status = 'signed_off' AND NEW.status = 'superseded'
          OR OLD.status = 'signed_off' AND NEW.status = 'signed_off' AND NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
      -- Only the sign-off of a successor naming this version retires it (checked again at commit).
      IF NOT coalesce(app_actor_permitted(NEW.practice_id, 'contract.sign_off'), false) THEN
        RAISE EXCEPTION 'only a successor''s sign-off retires a contract version' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF terms_changed
         OR (NEW.approved_by, NEW.approved_at, NEW.signed_off_by, NEW.signed_off_at, NEW.dispute_window_verified_by, NEW.dispute_window_verified_at)
            IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.signed_off_by, OLD.signed_off_at, OLD.dispute_window_verified_by, OLD.dispute_window_verified_at)
         OR NOT contract_version_retired_by(OLD, NEW, 'approved') THEN
        RAISE EXCEPTION 'a signed-off version never changes: an amendment closes its window at the amendment''s start, and a correction supersedes it' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'an approved or signed-off contract version never changes; supersede it with a new version' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A successor names an approved or signed-off version of the same contract.
  IF NEW.supersedes_id IS NOT NULL AND NEW.status IN ('draft', 'proposed') AND (TG_OP = 'INSERT' OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id) THEN
    SELECT * INTO prior FROM contract_version p WHERE p.id = NEW.supersedes_id;
    IF NOT FOUND OR prior.contract_id <> NEW.contract_id OR prior.status NOT IN ('approved', 'signed_off') THEN
      RAISE EXCEPTION 'a successor names an approved or signed-off version of the same contract' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NOT contract_version_documents_ok(NEW) THEN
    RAISE EXCEPTION 'a version''s documents are clean contract, exhibit or payer-letter documents of its practice, each named once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The specialist cites the window on a draft (or a correction copies the citation) and verifies it.
GRANT INSERT (dispute_window_evidence) ON contract_version TO tp_app;
GRANT UPDATE (dispute_window_evidence, dispute_window_verified_by, dispute_window_verified_at) ON contract_version TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- tp-packet/2: the deadline and the calculation on every line
-- ---------------------------------------------------------------------------------------------------

-- A version's content: tp-packet/1 exactly as before (20261023090000); tp-packet/2 the same, with the
-- packet's deadline (its basis: the lines' own windows at the first level, the next level's window after a
-- reopened denial; its status; the date it ends, or null) and on each line its deadline (status, the date it
-- ends or null, its source: the contract, the release, or none) and its calculation (copied from the trace by
-- @tp/packets; which lines and amounts they are is checked against the case when the version is written).
CREATE OR REPLACE FUNCTION packet_content_valid(content jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  line jsonb;
  position integer := 0;
  kind text;
  is_second boolean;
  deadline jsonb;
BEGIN
  IF jsonb_typeof(content) IS DISTINCT FROM 'object' OR coalesce(content ->> 'format', '') NOT IN ('tp-packet/1', 'tp-packet/2')
     OR jsonb_typeof(content -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(content -> 'dispute_level') IS DISTINCT FROM 'number' OR coalesce(content ->> 'dispute_level', '') !~ '^[1-9][0-9]{0,2}$'
     OR coalesce(content ->> 'as_of', '') !~ '^\d{4}-\d{2}-\d{2}$' OR NOT content ? 'interest'
     OR jsonb_typeof(content -> 'citation') IS DISTINCT FROM 'object'
     OR jsonb_typeof(content -> 'evidence') IS DISTINCT FROM 'array' OR jsonb_typeof(content -> 'evidence_gaps') IS DISTINCT FROM 'array'
     OR jsonb_typeof(content -> 'sources') IS DISTINCT FROM 'array' OR jsonb_typeof(content -> 'requested_action') IS DISTINCT FROM 'string'
     OR NOT (content -> 'interest' = 'null'::jsonb OR (jsonb_typeof(content -> 'interest') = 'object'
             AND (content -> 'interest' -> 'total_cents' = 'null'::jsonb OR coalesce(content -> 'interest' ->> 'total_cents', '') ~ '^(0|[1-9][0-9]{0,17})$'))) THEN
    RETURN false;
  END IF;
  is_second := content ->> 'format' = 'tp-packet/2';
  IF is_second THEN
    deadline := content -> 'deadline';
    IF jsonb_typeof(deadline) IS DISTINCT FROM 'object'
       OR coalesce(deadline ->> 'basis', '') NOT IN ('line_windows', 'next_level_window')
       OR coalesce(deadline ->> 'status', '') NOT IN ('verified', 'unverified', 'not_applicable')
       OR NOT coalesce(deadline -> 'ends_on' = 'null'::jsonb OR (jsonb_typeof(deadline -> 'ends_on') = 'string' AND deadline ->> 'ends_on' ~ '^\d{4}-\d{2}-\d{2}$'), false) THEN
      RETURN false;
    END IF;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(content -> 'lines') LOOP
    position := position + 1;
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR line ->> 'row' IS DISTINCT FROM position::text
       OR coalesce(line ->> 'service_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(line ->> 'priced_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    FOREACH kind IN ARRAY ARRAY['claim_control_number', 'patient_control_number', 'patient_name', 'member_id'] LOOP
      IF line ->> kind IS DISTINCT FROM '{{' || kind || ':' || position::text || '}}' THEN
        RETURN false;
      END IF;
    END LOOP;
    FOREACH kind IN ARRAY ARRAY['expected_cents', 'observed_cents', 'variance_cents', 'paid_cents'] LOOP
      IF coalesce(line ->> kind, '') !~ '^-?(0|[1-9][0-9]{0,17})$' THEN
        RETURN false;
      END IF;
    END LOOP;
    IF is_second THEN
      deadline := line -> 'deadline';
      IF jsonb_typeof(deadline) IS DISTINCT FROM 'object'
         OR coalesce(deadline ->> 'status', '') NOT IN ('verified', 'unverified', 'not_applicable')
         OR NOT coalesce(deadline -> 'ends_on' = 'null'::jsonb OR (jsonb_typeof(deadline -> 'ends_on') = 'string' AND deadline ->> 'ends_on' ~ '^\d{4}-\d{2}-\d{2}$'), false)
         OR NOT coalesce(deadline -> 'source' = 'null'::jsonb OR deadline ->> 'source' IN ('contract', 'release'), false)
         OR jsonb_typeof(line -> 'calculation') IS DISTINCT FROM 'object' THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- CO-12: the deadline the version stated, read from its content (every tp-packet/1 version is unverified).
ALTER TABLE packet_version
  ADD COLUMN deadline_verification_status text NOT NULL GENERATED ALWAYS AS (
    CASE WHEN content ->> 'format' = 'tp-packet/2' THEN content -> 'deadline' ->> 'status' ELSE 'unverified' END
  ) STORED,
  ADD CONSTRAINT packet_version_deadline_verification_status_check CHECK (deadline_verification_status IN ('verified', 'unverified', 'not_applicable'));

-- ---------------------------------------------------------------------------------------------------
-- The derivation (@tp/triage deadlineVerification(), nextLevelDeadlineVerification(), packetDeadlineStatus())
-- ---------------------------------------------------------------------------------------------------

-- A priced line's deadline, from its stored trace: not_applicable without a window; verified for a release
-- window whose record (the trace's release and SHA-256) is Medicare's at `minimum_level` or higher, never for a
-- commercial_default; verified for a contract window when the version the trace names is signed off with its
-- window verified over complete evidence and of the trace's length in days; unverified otherwise, and for a
-- line the caller cannot see.
CREATE FUNCTION priced_line_deadline_status(target uuid, minimum_level text DEFAULT 'L2') RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  trace jsonb;
  window_step jsonb;
  levels CONSTANT text[] := ARRAY['L1', 'L2', 'L3'];
BEGIN
  IF minimum_level IS NULL OR minimum_level NOT IN ('L2', 'L3') THEN
    RAISE EXCEPTION 'a deadline is verified at L2 or at L3' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT p.trace INTO trace FROM priced_line p WHERE p.id = target;
  IF NOT FOUND THEN
    RETURN 'unverified';
  END IF;
  window_step := trace -> 'steps' -> 'window';
  IF jsonb_typeof(window_step) IS DISTINCT FROM 'object' OR window_step ->> 'source' IS NULL THEN
    RETURN 'not_applicable';
  END IF;
  IF window_step ->> 'source' = 'release' THEN
    IF coalesce(trace -> 'release' ->> 'number', '') !~ '^[1-9][0-9]{0,8}$' THEN
      RETURN 'unverified';
    END IF;
    RETURN CASE WHEN EXISTS (
      SELECT 1 FROM rule_record r
       WHERE r.release_no = (trace -> 'release' ->> 'number')::integer AND r.record_type = 'dispute_window'
         AND r.sha256 = window_step -> 'record' ->> 'sha256' AND r.key ->> 'program' = 'medicare'
         AND array_position(levels, r.verification) >= array_position(levels, minimum_level)
    ) THEN 'verified' ELSE 'unverified' END;
  END IF;
  IF window_step ->> 'source' = 'contract' THEN
    IF coalesce(trace -> 'agreement' ->> 'contract_version_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(window_step ->> 'length', '') !~ '^[1-9][0-9]{0,3}$' THEN
      RETURN 'unverified';
    END IF;
    RETURN CASE WHEN EXISTS (
      SELECT 1 FROM contract_version v
       WHERE v.id = (trace -> 'agreement' ->> 'contract_version_id')::uuid AND v.status = 'signed_off'
         AND v.dispute_window_verified_by IS NOT NULL AND rate_record_evidence_complete(v.dispute_window_evidence)
         AND v.dispute_window_days = (window_step ->> 'length')::integer AND window_step ->> 'unit' = 'days'
    ) THEN 'verified' ELSE 'unverified' END;
  END IF;
  RETURN 'unverified';
END;
$$;

-- The next level's deadline of a case reopened by a denial (dispute level 2 and above): a contract's appeal
-- levels carry no evidence, so unverified; a Medicare Advantage non-contracted case's is verified when the
-- Medicare reconsideration record case_next_dispute_window() reads (the release in force, on the day the
-- reopening denial was received) is at `minimum_level` or higher.
CREATE FUNCTION case_next_window_deadline_status(target_case uuid, minimum_level text DEFAULT 'L2') RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  pattern jsonb;
  denied_on date;
  record_level text;
  levels CONSTANT text[] := ARRAY['L1', 'L2', 'L3'];
BEGIN
  IF minimum_level IS NULL OR minimum_level NOT IN ('L2', 'L3') THEN
    RAISE EXCEPTION 'a deadline is verified at L2 or at L3' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT c.pattern_key INTO pattern FROM "case" c WHERE c.id = target_case;
  IF NOT FOUND OR pattern ->> 'contract_version_id' IS NOT NULL OR pattern ->> 'mapping_kind' IS DISTINCT FROM 'ma_noncontracted' THEN
    RETURN 'unverified';
  END IF;
  SELECT r.received_on INTO denied_on
    FROM payer_response r JOIN submission s ON s.id = r.submission_id
   WHERE s.case_id = target_case AND r.reopens_case
   ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1;
  IF denied_on IS NULL THEN
    RETURN 'unverified';
  END IF;
  SELECT r.verification INTO record_level
    FROM rule_record r
   WHERE r.release_no = current_rule_release() AND r.record_type = 'dispute_window'
     AND r.key = '{"program": "medicare", "window": "reconsideration"}'::jsonb
     AND r.effective_from <= denied_on AND (r.effective_to IS NULL OR denied_on <= r.effective_to)
   ORDER BY r.effective_from DESC LIMIT 1;
  RETURN CASE WHEN array_position(levels, record_level) >= array_position(levels, minimum_level) THEN 'verified' ELSE 'unverified' END;
END;
$$;

-- A version's deadline at L2: tp-packet/1 unverified; after a reopened denial, the next level's; with no line,
-- not_applicable; verified when every line's is; unverified otherwise.
CREATE FUNCTION packet_version_deadline_status(target_case uuid, content jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF content ->> 'format' IS DISTINCT FROM 'tp-packet/2' OR jsonb_typeof(content -> 'lines') IS DISTINCT FROM 'array'
     OR coalesce(content ->> 'dispute_level', '') !~ '^[1-9][0-9]{0,2}$' THEN
    RETURN 'unverified';
  END IF;
  IF (content ->> 'dispute_level')::integer > 1 THEN
    RETURN case_next_window_deadline_status(target_case);
  END IF;
  IF jsonb_array_length(content -> 'lines') = 0 THEN
    RETURN 'not_applicable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(content -> 'lines') l
     WHERE coalesce(l ->> 'priced_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR priced_line_deadline_status((l ->> 'priced_line_id')::uuid) IS DISTINCT FROM 'verified'
  ) THEN
    RETURN 'unverified';
  END IF;
  RETURN 'verified';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- packet_version: what a version states, the export's refusal and the attestation
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE packet_version
  -- The verifier's report over the narrative the export rendered (tp-packet-verifier/2, codes and positions only).
  ADD COLUMN export_verifier_report jsonb CONSTRAINT packet_version_export_verifier_report_valid CHECK (export_verifier_report IS NULL OR packet_verifier_report_valid(export_verifier_report)),
  -- The reimbursement reviewer's attestation over the export (D16): who, when, and over what.
  ADD COLUMN attested_by uuid REFERENCES "user" (id),
  ADD COLUMN attested_at timestamptz,
  ADD COLUMN attestation jsonb,
  ADD CONSTRAINT packet_version_export_verifier_report_with_export CHECK (export_verifier_report IS NULL OR exported_at IS NOT NULL),
  ADD CONSTRAINT packet_version_attested_together CHECK ((attested_by IS NULL) = (attested_at IS NULL) AND (attested_at IS NULL) = (attestation IS NULL)),
  ADD CONSTRAINT packet_version_attested_after_export CHECK (attested_at IS NULL OR exported_at IS NOT NULL),
  -- An attestation holds no words: its format, the checklist's item codes and the export's two SHA-256.
  ADD CONSTRAINT packet_version_attestation_holds_no_words CHECK (
    attestation IS NULL OR (
      (attestation - ARRAY['format', 'checklist', 'pdf_sha256', 'csv_sha256']) = '{}'::jsonb
      AND attestation ->> 'format' = 'tp-attestation/1'
      AND jsonb_typeof(attestation -> 'checklist') = 'array'
      AND NOT jsonb_path_exists(attestation -> 'checklist', '$[*] ? (@.type() != "string" || !(@ like_regex "^[a-z][a-z_]{0,31}$"))')
    )
  ),
  ADD CONSTRAINT packet_version_attestation_names_its_export CHECK (
    attestation IS NULL OR coalesce(attestation ->> 'pdf_sha256' = export_sha256 AND attestation ->> 'csv_sha256' = export_csv_sha256, false)
  );

-- A tp-packet/2 version states each line's deadline (its status, the day it ends and its source, as the line's
-- stored trace has them) and its own as the database derives them when it is written.
CREATE FUNCTION packet_version_deadline_stated() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
  line jsonb;
  window_step jsonb;
BEGIN
  IF NEW.content ->> 'format' IS DISTINCT FROM 'tp-packet/2' THEN
    RETURN NULL;
  END IF;
  SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.content -> 'lines') LOOP
    SELECT p.trace -> 'steps' -> 'window' INTO window_step FROM priced_line p WHERE p.id = (line ->> 'priced_line_id')::uuid;
    IF line -> 'deadline' ->> 'status' IS DISTINCT FROM priced_line_deadline_status((line ->> 'priced_line_id')::uuid)
       OR line -> 'deadline' ->> 'ends_on' IS DISTINCT FROM window_step ->> 'ends_on'
       OR line -> 'deadline' ->> 'source' IS DISTINCT FROM window_step ->> 'source' THEN
      RAISE EXCEPTION 'a packet version states each line''s deadline from the line''s own window: its status, the day it ends and its source' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF NEW.content -> 'deadline' ->> 'basis' IS DISTINCT FROM (CASE WHEN NEW.dispute_level > 1 THEN 'next_level_window' ELSE 'line_windows' END)
     OR NEW.content -> 'deadline' ->> 'status' IS DISTINCT FROM packet_version_deadline_status(the_case, NEW.content) THEN
    RAISE EXCEPTION 'a packet version states its deadline as the database derives it: the lines'' windows at the first level, the next level''s window after a reopened denial' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER packet_version_deadline_stated AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_deadline_stated();

-- The export's refusal in SQL (CO-05): on the export, the deadline is derived again now, from the content and
-- the rows it names (never from the stored status), and the export carries the verifier's passing report over
-- the narrative it rendered, which is the version's. Its report is written with the export and never changes.
CREATE FUNCTION packet_version_export_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
BEGIN
  IF OLD.export_sha256 IS NULL AND NEW.export_sha256 IS NOT NULL THEN
    SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
    IF the_case IS NULL OR packet_version_deadline_status(the_case, NEW.content) = 'unverified' THEN
      RAISE EXCEPTION 'a packet version whose deadline is not verified is not exported' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT coalesce(packet_verifier_report_valid(NEW.export_verifier_report) AND NEW.export_verifier_report ->> 'format' = 'tp-packet-verifier/2'
                    AND (NEW.export_verifier_report ->> 'passed')::boolean AND NEW.export_verifier_report ->> 'narrative_sha256' = NEW.verifier_report ->> 'narrative_sha256', false) THEN
      RAISE EXCEPTION 'a packet version is exported with the verifier''s passing report over the narrative it rendered' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.export_verifier_report IS DISTINCT FROM OLD.export_verifier_report THEN
    RAISE EXCEPTION 'an export''s verifier report is written with the export, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packet_version_export_guard BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_export_guard();

-- The attestation (D16): written unattested; once exported, attested once by a reimbursement reviewer in their
-- own name, who neither drafted, wrote nor approved the packet, over the current version still asking for its
-- case's lines, while its deadline is not unverified. The time is the database's.
CREATE FUNCTION packet_version_attestation_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
  current_id uuid;
  first_drafter uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.export_verifier_report, NEW.attested_by, NEW.attested_at, NEW.attestation) IS DISTINCT FROM (NULL::jsonb, NULL::uuid, NULL::timestamptz, NULL::jsonb) THEN
      RAISE EXCEPTION 'a packet version is written unexported and unattested' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.attested_by, NEW.attestation) IS DISTINCT FROM (OLD.attested_by, OLD.attestation) THEN
    IF OLD.attested_by IS NOT NULL OR NEW.attested_by IS NULL THEN
      RAISE EXCEPTION 'a packet version''s export is attested once' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.exported_at IS NULL THEN
      RAISE EXCEPTION 'a packet version is attested once its export is made' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT app_actor_is_person() OR NEW.attested_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'audit_finding.validate'), false) THEN
      RAISE EXCEPTION 'a packet''s export is attested by a reimbursement reviewer, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT v.drafted_by INTO first_drafter FROM packet_version v WHERE v.packet_id = NEW.packet_id AND v.version_no = 1;
    IF app_actor_id() IS NOT DISTINCT FROM first_drafter OR app_actor_id() IS NOT DISTINCT FROM NEW.drafted_by OR app_actor_id() IS NOT DISTINCT FROM NEW.approved_by THEN
      RAISE EXCEPTION 'the person who drafted, wrote or approved a packet does not attest its export' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT p.current_version_id, p.case_id INTO current_id, the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
    IF NEW.id IS DISTINCT FROM current_id OR NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = the_case AND c.state <> 'closed_written_off')
       OR NOT packet_version_matches_case(the_case, NEW.content) THEN
      RAISE EXCEPTION 'only a packet''s current version, still asking for its case''s lines, is attested' USING ERRCODE = 'check_violation';
    END IF;
    IF packet_version_deadline_status(the_case, NEW.content) = 'unverified' THEN
      RAISE EXCEPTION 'a packet version whose deadline is not verified is not attested' USING ERRCODE = 'check_violation';
    END IF;
    NEW.attested_at := now();
  ELSIF NEW.attested_at IS DISTINCT FROM OLD.attested_at THEN
    RAISE EXCEPTION 'an attestation''s time is the time it was made' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packet_version_attestation_rules BEFORE INSERT OR UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_attestation_rules();

-- ---------------------------------------------------------------------------------------------------
-- submission: only of an attested export
-- ---------------------------------------------------------------------------------------------------

-- A submission is logged only once a reimbursement reviewer has attested the export it sends (D16: the
-- attestation is the release of audit_report's pattern). A version the caller cannot see is refused.
CREATE FUNCTION submission_needs_attested_export() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM packet_version v WHERE v.id = NEW.packet_version_id AND v.practice_id = NEW.practice_id AND v.attested_by IS NOT NULL) THEN
    RAISE EXCEPTION 'a packet is submitted once a reimbursement reviewer has attested its export' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER submission_needs_attested_export AFTER INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_needs_attested_export();

-- ---------------------------------------------------------------------------------------------------
-- Privileges: the export job writes the export's verifier report with the export; a reviewer attests.
-- ---------------------------------------------------------------------------------------------------

GRANT UPDATE (export_verifier_report, attested_by, attestation) ON packet_version TO tp_app;

REVOKE ALL ON FUNCTION priced_line_deadline_status(uuid, text), case_next_window_deadline_status(uuid, text), packet_version_deadline_status(uuid, jsonb),
  packet_version_deadline_stated(), packet_version_export_guard(), packet_version_attestation_rules(), submission_needs_attested_export() FROM PUBLIC;
-- Called by the triggers, which run as the application role, and by the export job and the screens.
GRANT EXECUTE ON FUNCTION priced_line_deadline_status(uuid, text), case_next_window_deadline_status(uuid, text), packet_version_deadline_status(uuid, jsonb) TO tp_app;
