-- Deadline verification, current pricing and the attested export (Change Order 001, CO-05 and CO-12's
-- packet_version row; reconciliation-001 PR 5 and decisions D15 (a), D16 (a) plus (c) and D17 (a), approved
-- 2026-10-17; the best-option audit's items #4, #5, #26 and #61, folded in by the founder on 2026-10-18; PRD 12,
-- The packet, Approval and Submission; PRD 11 step 8; CLAUDE.md rules 1 and 3).
-- Decisions: docs/adr/0061, 0041 and 0038.
--
-- A deadline is verified only from a source a person signed off (D17 a): for a contract line, the signed-off
-- version's own dispute window with its page, quote and hash, the unit and the start the quote states, verified
-- by a contract specialist, and only when that rule is the one the product computes (calendar days after the
-- remittance date; audit item #5); for a Medicare Advantage non-contracted line, the rule release's dispute-window
-- record at L2 or higher (L3 for E3) once the specialist has confirmed the Medicare Advantage dispute route
-- (golden QUESTIONS Q34; until then no such deadline is verified). A release's commercial_default is never
-- verified. The status is derived from each line's stored trace (steps.window), so the engine is untouched. No
-- table is added; no ledger, pricing or rule table is touched, and no policy, RLS setting or registry row changes.
--
-- - contract_version: the window's evidence, additively and in rate_record's form. dispute_window_evidence
--   {document_id, page, quote, hash} (null by default: every existing version's lines stay DEADLINE_UNVERIFIED
--   until a corrected version carries it), its unit (dispute_window_unit: calendar_days, business_days, months)
--   and what it runs from (dispute_window_measured_from: date_of_service, remittance_date, payment_date,
--   receipt_date), both exactly with a citation, with the specialist who verified it and when
--   (dispute_window_verified_by and _at, named like rate_record.verified_by and verified_at).
--   contract_version_rules() is 20261016160000's body with the evidence, unit and start among the terms and the
--   verification among what approval, sign-off and retirement never change, so all are frozen from approval
--   exactly like dispute_window_days; a draft's verification is a specialist's, once, in their own name, now,
--   over complete evidence on one of the version's documents, of a rule contract_window_rule_computed() admits
--   (and a CHECK holds every verified window to it), and any edit of the window, its unit, its start, its evidence
--   or the documents clears it, as an edit clears a rate record's. A version whose window is cited with a computed
--   rule but unverified, or cited from a document it does not name, is not approved; one whose cited rule the
--   product does not compute yet (PR 6c widens it) is approved unverified, so its lines wait.
-- - packet_version.deadline_verification_status (CO-12): verified, unverified or not_applicable, generated
--   from the content (tp-packet/2's content.deadline.status; 'unverified' for every tp-packet/1 version), so no
--   role writes it. It is what the version stated when written, which packet_version_deadline_stated holds to
--   the database's own derivation; nothing trusts it at export, where the guard derives it again.
-- - packet_content_valid(): tp-packet/1 exactly as before; tp-packet/2 also carries content.deadline (basis,
--   status, ends_on) and, on each line, a deadline (status, ends_on, source) and a calculation.
-- - priced_line_deadline_status(), case_next_window_deadline_status() and packet_version_deadline_status():
--   the derivation, mirroring @tp/triage's deadlineVerification(), nextLevelDeadlineVerification() and
--   packetDeadlineStatus() (a database test runs both on the same lines). SECURITY INVOKER: under the caller's
--   policies a row it cannot see yields 'unverified', so every check below fails closed. A release record of a
--   withdrawn release (rule_release_withdrawal) verifies nothing, and no release record verifies anything while
--   ma_dispute_route_confirmed() is false; the next level's deadline is verified only from the reconsideration
--   record in force that gives exactly its stored end (case_next_dispute_window()).
-- - Whether a version's pricing is still current (audit item #4), one check: service_line_priced_in_effect() is
--   a service line's priced line in the run in effect that took effect last (PRICED_IN_EFFECT's rule),
--   priced_line_pricing_check() a line's 'current' or first cause (PRICING_NOT_IN_EFFECT, RELEASE_WITHDRAWN,
--   CONTRACT_VERSION_NOT_SIGNED_OFF, CONTRACT_VERSION_NOT_IN_FORCE), packet_version_pricing_check() a version's
--   (the most severe across its lines; malformed lines fail closed). Approval (packet_version_approval_pricing),
--   the export guard and the attestation refuse a version that is not current; a submission is never refused
--   for it (it records what already happened outside the product) and records the result in
--   submission.pricing_check, which the database writes. An audit report is neither requested, generated,
--   attested nor released on a run whose rule release was withdrawn (pricing_run_release_withdrawn()).
-- - packet_version_deadline_stated (when a tp-packet/2 version is written): each line's deadline and its
--   calculation (priced_line_calculation(): method, release, steps, rounding, observed basis and patient share)
--   are its stored trace's, and the version's deadline (its end, its line counts and the sources it names: the
--   contract window's evidence, days and verifier, the release records' SHA-256 and level) is what the lines,
--   the contract versions, the rule records and the reopening denial give. The trace's SHA-256 is over its
--   canonical JSON, which the export job checks with every other field by stating the version again.
-- - The export (packet_version_export_guard): refused for a version not of the case's dispute level now
--   (1 + case_reopened_levels(): a version written before a denial reopened the case states the earlier level's
--   deadline), while its pricing is not current, and while the deadline, derived now, is unverified. SQL cannot
--   run the verifier (it is TypeScript): it holds the report the job writes (export_verifier_report) to the
--   verifier's format, a passing result and the version's own narrative SHA-256. The export job runs the
--   verifier over what it prints and refuses first.
-- - The export's attempts (audit item #26): the export job records each refusal (packet_export_refused) and each
--   failed try (packet_export_attempt_failed, packet_export_failed) as an audit event of the version whose purpose
--   is one fixed code (packet_export_refusal_codes(), packet_export_failure_codes()), written only by a service
--   actor (audit_event_packet_export_attempt), with no words and no patient data; packet_version_export_attempt()
--   reads the latest attempt for the packet page (none, in progress, retrying, refused, failed, exported).
-- - The attestation (D16, audit_report's pattern): once the export is made, a reimbursement reviewer
--   (audit_finding.validate, which only the reviewer role holds, reaching the practice under a support grant)
--   attests once, in their own name, over the export's two SHA-256 and a checklist of codes (no words). The
--   attester drafted, wrote and approved no version of the packet; the version is current, still its case's and
--   of the case's dispute level, its pricing still current and its deadline still not unverified. A submission is
--   logged only of an attested export.
-- - The reviewer's downloads (the owner's addition of 2026-10-18, ADR 0061's residual risk F9): an attestation
--   also needs the attester's own download of both the PDF and the CSV of that version, at or after its export,
--   each recorded by the web request that served it once its bytes hashed to the stored SHA-256. The evidence is
--   audit_event (append-only for every role; its INSERT policy writes only in the transaction's own actor's name):
--   packet_export_pdf_downloaded and packet_export_csv_downloaded, which audit_event_packet_download records only
--   on a connection that is not the worker's own login, for a person who may read the export, of an exported
--   version of the event's practice in the caller's scope. The worker's login is a member of the marker role
--   tp_job (packages/db/src/roles.ts) and the web's is not; app_session_is_job() reads that from session_user,
--   which SET ROLE, SECURITY DEFINER and set_config('app.actor_id', ...) never change, so a job's code, or a
--   compromised worker setting app.actor_id to the reviewer's ID, writes no download event and no attestation
--   (the attestation rules refuse that login too). What the database cannot tell apart is a process holding the
--   web's own login, which serves the reviewer's files in the first place (ADR 0061, What it does not hold
--   against). packet_export_downloads_of_actor() reads the caller's own. The export history
--   (practice_export_history(), practice_export_count()) lists the two new actions beside
--   packet_export_downloaded, which earlier downloads keep and which is evidence of nothing.
--
-- Why tp_app cannot bypass the refusal: tp_owner owns the tables, triggers and functions, and tp_app owns
-- nothing and has no BYPASSRLS, so it can neither ALTER the table nor DISABLE a trigger, and only a superuser
-- sets session_replication_role. Its column grants are the only columns it writes: exported_at only through
-- packet_version_rules (for a job actor), deadline_verification_status and submission.pricing_check never. The
-- guard reads rows that cannot change underneath it, or that fail it closed when they change: priced_line,
-- rule_record and payer_response are immutable, a contract window is frozen from approval, a withdrawal, an
-- accepted re-run or a reopening denial only adds a row or moves a run out of effect (which fails the pricing or
-- the deadline closed, or moves the case's level), a contract version only leaves sign-off or closes its window
-- (which fails the pricing closed), and the version's status is read at export.
--
-- Runs as tp_owner. Safe with the previous image running: yes. Added: nullable columns and a generated one
-- (adding it rewrites the small packet_version table under a brief ACCESS EXCLUSIVE lock; every existing row is
-- tp-packet/1 and becomes 'unverified', so nothing is backfilled), CHECKs every existing row meets (no version
-- has a cited window yet, and submission.pricing_check is null on every existing row), new functions and
-- triggers (two on audit_event, firing only for the two download actions and the three export-attempt actions,
-- which no earlier row carries; one on submission, setting only the new column; one on packet_version, refusing
-- only an approval of a version whose pricing is not current); replaced: packet_content_valid() and
-- contract_version_rules() with their signatures, accepting tp-packet/1 and a version with no window citation as
-- before, practice_export_history() and practice_export_count() with their signatures, listing what they listed
-- and the two download actions, and audit_report_belongs() and audit_report_rules() with their signatures,
-- refusing what they refused and a report on a withdrawn rule release. Removed: nothing. For the previous image:
-- its tp-packet/1 versions are written and approved, but their export is refused (its export job fails them),
-- its submissions of unattested exports are refused and those it logs are flagged by pricing_check, which it
-- never writes, its approvals and exports of a version whose pricing is not current are refused, its report job
-- fails a report on a withdrawn release when it makes it ready (the new image fails it as release_withdrawn
-- first), its downloads are recorded as packet_export_downloaded, which no attestation counts (the reviewer
-- downloads again under the new image), its export job writes no attempt events (its refusals show as in
-- progress, then as failed with no result after an hour), its contract screens cite a window without its unit
-- and start, which the new CHECK refuses (the specialist cites again under the new image), its worker still
-- connects as the application login until its task is replaced by one on the worker's own (the deploy job
-- creates that login after the migrations), and its triage, which does not know DEADLINE_UNVERIFIED,
-- RELEASE_WITHDRAWN or VERSION_NOT_IN_FORCE, may open cases whose export the guard refuses: each is the approved
-- outcome. Deploy order: migrate first (docs/adr/0049).

-- ---------------------------------------------------------------------------------------------------
-- contract_version: the dispute window's evidence and its verification
-- ---------------------------------------------------------------------------------------------------

-- Whether the product computes a contract window cited with this unit and start (audit item #5): what
-- @tp/pricing's windows.ts computes for a contract window, its dispute_window_days counted as calendar days
-- after the remittance date (BPR16). @tp/contracts COMPUTED_CONTRACT_WINDOW_RULE and @tp/triage
-- COMPUTED_CONTRACT_WINDOW hold the same literal (a database test compares them over every unit and start).
-- PR 6c, which computes the window from the cited unit and start, widens this body.
CREATE FUNCTION contract_window_rule_computed(unit text, measured_from text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(unit = 'calendar_days' AND measured_from = 'remittance_date', false)
$$;

-- Whether the contract specialist has confirmed which dispute route a Medicare Advantage non-contracted line
-- takes (golden QUESTIONS Q34: the plan's own payment dispute policy, or Original Medicare's redetermination).
-- Until a later migration replaces this body once the specialist confirms the route, no release dispute window
-- is verified, so no Medicare Advantage packet is exported and those lines wait (DEADLINE_UNVERIFIED,
-- MA_ROUTE_UNCONFIRMED).
CREATE FUNCTION ma_dispute_route_confirmed() RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT false
$$;

ALTER TABLE contract_version
  -- {document_id, page, quote, hash}: where the contract states its dispute window, as a rate record cites its terms.
  ADD COLUMN dispute_window_evidence jsonb,
  -- The contract specialist who verified the window against its page, and when.
  ADD COLUMN dispute_window_verified_by uuid REFERENCES "user" (id),
  ADD COLUMN dispute_window_verified_at timestamptz,
  -- The cited window's unit and what it runs from, as the quote states them (audit item #5), chosen by the
  -- specialist from these lists; its length stays dispute_window_days, in this unit as the quote gives it.
  ADD COLUMN dispute_window_unit text CONSTRAINT contract_version_dispute_window_unit_check CHECK (dispute_window_unit IN ('calendar_days', 'business_days', 'months')),
  ADD COLUMN dispute_window_measured_from text CONSTRAINT contract_version_dispute_window_measured_from_check
    CHECK (dispute_window_measured_from IN ('date_of_service', 'remittance_date', 'payment_date', 'receipt_date')),
  -- The unit and the start exist exactly with a citation.
  ADD CONSTRAINT contract_version_window_rule_with_citation CHECK (
    (dispute_window_evidence IS NULL) = (dispute_window_unit IS NULL) AND (dispute_window_evidence IS NULL) = (dispute_window_measured_from IS NULL)
  ),
  -- A window is verified only when the rule it cites is the rule the product computes.
  ADD CONSTRAINT contract_version_window_verified_as_computed CHECK (
    dispute_window_verified_by IS NULL OR contract_window_rule_computed(dispute_window_unit, dispute_window_measured_from)
  ),
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

-- The full body of 20261016160000, with the window's evidence, unit and start among the terms (terms_changed),
-- its verification among what approval, sign-off and retirement never change, the verification itself on a
-- draft or proposed version (only of a rule the product computes), and approval refused while a cited window
-- whose rule the product computes is unverified (each marked "window").
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
    terms_changed := (NEW.source_document_ids, NEW.effective_from, NEW.supersedes_id, NEW.timely_filing_days, NEW.dispute_window_days, NEW.appeal_levels, NEW.notice_days,
                      NEW.dispute_window_evidence, NEW.dispute_window_unit, NEW.dispute_window_measured_from)
      IS DISTINCT FROM (OLD.source_document_ids, OLD.effective_from, OLD.supersedes_id, OLD.timely_filing_days, OLD.dispute_window_days, OLD.appeal_levels, OLD.notice_days,
                        OLD.dispute_window_evidence, OLD.dispute_window_unit, OLD.dispute_window_measured_from);
    window_changed := (NEW.source_document_ids, NEW.dispute_window_days, NEW.dispute_window_evidence, NEW.dispute_window_unit, NEW.dispute_window_measured_from)
      IS DISTINCT FROM (OLD.source_document_ids, OLD.dispute_window_days, OLD.dispute_window_evidence, OLD.dispute_window_unit, OLD.dispute_window_measured_from);
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
        -- window: a cited window whose rule the product computes is approved verified, from one of the version's
        -- documents. One whose rule it does not compute yet (PR 6c) is approved unverified, so its lines wait
        -- (DEADLINE_UNVERIFIED, CONTRACT_WINDOW_RULE_NOT_COMPUTED) rather than show a date that may be later than the contract's.
        IF NEW.dispute_window_evidence IS NOT NULL AND NEW.dispute_window_verified_by IS NULL
           AND contract_window_rule_computed(NEW.dispute_window_unit, NEW.dispute_window_measured_from) THEN
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
          -- window: verified only when the cited unit and start are what the product computes (audit item #5).
          IF NOT contract_window_rule_computed(NEW.dispute_window_unit, NEW.dispute_window_measured_from) THEN
            RAISE EXCEPTION 'a dispute window is verified only when the rule it cites is the rule the product computes: its days counted as calendar days after the remittance date' USING ERRCODE = 'check_violation';
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
GRANT INSERT (dispute_window_evidence, dispute_window_unit, dispute_window_measured_from) ON contract_version TO tp_app;
GRANT UPDATE (dispute_window_evidence, dispute_window_unit, dispute_window_measured_from, dispute_window_verified_by, dispute_window_verified_at) ON contract_version TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- tp-packet/2: the deadline and the calculation on every line
-- ---------------------------------------------------------------------------------------------------

-- A version's content: tp-packet/1 exactly as before (20261023090000); tp-packet/2 the same, with the
-- packet's deadline (its basis: the lines' own windows at the first level, the next level's window after a
-- reopened denial; its status; the date it ends, or null) and on each line its deadline (status, the date it
-- ends or null, its source: the contract, the release, or none) and its calculation (copied from the trace by
-- @tp/packets). This is their shape only: when the version is written, its lines and amounts are checked against
-- the case (packet_version_matches_case), and each line's deadline and calculation and the version's deadline
-- against the trace and the rows they name (packet_version_deadline_stated).
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
-- window whose record (the trace's release and SHA-256) is Medicare's at `minimum_level` or higher, of a release
-- that was not withdrawn (a withdrawal says its content was wrong), once the specialist has confirmed the Medicare
-- Advantage dispute route (ma_dispute_route_confirmed(), Q34), never for a commercial_default; verified for a
-- contract window when the version the trace names is signed off with its window verified over complete evidence,
-- its cited rule the one the product computes (calendar days after the remittance date) and the trace's window
-- that rule (the trace's length in days, from the remittance date); unverified otherwise, and for a line the
-- caller cannot see.
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
         AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
         AND ma_dispute_route_confirmed()
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
         AND contract_window_rule_computed(v.dispute_window_unit, v.dispute_window_measured_from)
         AND v.dispute_window_days = (window_step ->> 'length')::integer AND window_step ->> 'unit' = 'days'
         AND window_step ->> 'measured_from' = 'remittance_date'
    ) THEN 'verified' ELSE 'unverified' END;
  END IF;
  RETURN 'unverified';
END;
$$;

-- The next level's deadline of a case reopened by a denial (dispute level 2 and above): a contract's appeal
-- levels carry no evidence, so unverified; a Medicare Advantage non-contracted case's is verified when the
-- Medicare reconsideration record in force now (the release in force, on the day the reopening denial was
-- received) gives exactly the end stored when the denial was recorded (case_next_dispute_window() read now: a
-- record that gives another end, as a later release's may, is not the record the date came from), is at
-- `minimum_level` or higher, and the specialist has confirmed the Medicare Advantage dispute route (Q34).
CREATE FUNCTION case_next_window_deadline_status(target_case uuid, minimum_level text DEFAULT 'L2') RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  pattern jsonb;
  denied_on date;
  denied_level integer;
  stated_ends_on date;
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
  SELECT r.received_on, r.next_window_ends_on, s.dispute_level INTO denied_on, stated_ends_on, denied_level
    FROM payer_response r JOIN submission s ON s.id = r.submission_id
   WHERE s.case_id = target_case AND r.reopens_case
   ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1;
  IF denied_on IS NULL OR stated_ends_on IS NULL
     OR case_next_dispute_window(target_case, denied_level, denied_on) IS DISTINCT FROM stated_ends_on THEN
    RETURN 'unverified';
  END IF;
  SELECT r.verification INTO record_level
    FROM rule_record r
   WHERE r.release_no = current_rule_release() AND r.record_type = 'dispute_window'
     AND r.key = '{"program": "medicare", "window": "reconsideration"}'::jsonb
     AND r.effective_from <= denied_on AND (r.effective_to IS NULL OR denied_on <= r.effective_to)
   ORDER BY r.effective_from DESC LIMIT 1;
  RETURN CASE WHEN array_position(levels, record_level) >= array_position(levels, minimum_level) AND ma_dispute_route_confirmed() THEN 'verified' ELSE 'unverified' END;
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
-- Whether a version's pricing is still current (audit item #4)
-- ---------------------------------------------------------------------------------------------------

-- A service line's pricing in effect: its priced line in the run in effect that took effect last (a complete
-- first run from when it completed, a re-run once a person accepted it, and of a period's runs the one that took
-- effect last; pricing_run_in_effect()). Exactly apps/worker/src/price/in-effect.ts PRICED_IN_EFFECT, which a
-- database test compares it with; the practice filter reads the index priced_line_by_service_line. Null when no
-- run in effect prices the line, or the caller cannot see it.
CREATE FUNCTION service_line_priced_in_effect(target uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id
    FROM priced_line p JOIN pricing_run r ON r.id = p.pricing_run_id
   WHERE p.practice_id = (SELECT s.practice_id FROM service_line s WHERE s.id = target)
     AND p.service_line_id = target AND pricing_run_in_effect(r.id)
   ORDER BY coalesce(r.accepted_at, r.completed_at) DESC, r.id DESC
   LIMIT 1
$$;

-- Whether a priced line is still its service line's current pricing: 'current', or the first cause that holds,
-- in this order. PRICING_NOT_IN_EFFECT: another run's line is in effect now (an accepted re-run, a later first
-- run of the period), no run in effect prices it, or the caller cannot see it (fail closed). RELEASE_WITHDRAWN:
-- its run's rule release has a rule_release_withdrawal row (its content was wrong). For a contract line:
-- CONTRACT_VERSION_NOT_SIGNED_OFF when the version that priced it is no longer signed off (a correction
-- superseded it) or the caller cannot see it; CONTRACT_VERSION_NOT_IN_FORCE when it is signed off but no longer
-- covers the line's service date (a back-dated amendment closed it), by the resolver's windowCovers rule:
-- effective_from <= service date < effective_to. A Medicare Advantage non-contracted line names no version.
-- Under the caller's policies (SECURITY INVOKER).
CREATE FUNCTION priced_line_pricing_check(target uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  line record;
  version record;
BEGIN
  SELECT p.service_line_id, p.contract_version_id, r.release_no, coalesce(s.service_date, c.service_from) AS service_on
    INTO line
    FROM priced_line p
    JOIN pricing_run r ON r.id = p.pricing_run_id
    LEFT JOIN service_line s ON s.id = p.service_line_id
    LEFT JOIN claim c ON c.id = s.claim_id
   WHERE p.id = target;
  IF NOT FOUND OR service_line_priced_in_effect(line.service_line_id) IS DISTINCT FROM target THEN
    RETURN 'PRICING_NOT_IN_EFFECT';
  END IF;
  IF EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = line.release_no) THEN
    RETURN 'RELEASE_WITHDRAWN';
  END IF;
  IF line.contract_version_id IS NOT NULL THEN
    SELECT v.status, v.effective_from, v.effective_to INTO version FROM contract_version v WHERE v.id = line.contract_version_id;
    IF NOT FOUND OR version.status IS DISTINCT FROM 'signed_off' THEN
      RETURN 'CONTRACT_VERSION_NOT_SIGNED_OFF';
    END IF;
    IF line.service_on IS NULL OR NOT (version.effective_from <= line.service_on AND (version.effective_to IS NULL OR line.service_on < version.effective_to)) THEN
      RETURN 'CONTRACT_VERSION_NOT_IN_FORCE';
    END IF;
  END IF;
  RETURN 'current';
END;
$$;

-- Whether a packet version's pricing is still current: 'current' when every content.lines[].priced_line_id is
-- (priced_line_pricing_check()), otherwise the most severe cause across its lines, in that function's order. A
-- lines value that is not an array, or a line without a well-formed priced_line_id, fails closed
-- (PRICING_NOT_IN_EFFECT); an empty list of lines is 'current' (it names no stale pricing; the packet's writer
-- refuses a case with no open line). Approval, the export guard and the attestation refuse a version
-- that is not current, and a submission records it (submission.pricing_check).
CREATE FUNCTION packet_version_pricing_check(content jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  causes CONSTANT text[] := ARRAY['PRICING_NOT_IN_EFFECT', 'RELEASE_WITHDRAWN', 'CONTRACT_VERSION_NOT_SIGNED_OFF', 'CONTRACT_VERSION_NOT_IN_FORCE'];
  worst integer;
BEGIN
  IF jsonb_typeof(content -> 'lines') IS DISTINCT FROM 'array' THEN
    RETURN 'PRICING_NOT_IN_EFFECT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(content -> 'lines') l
     WHERE jsonb_typeof(l) IS DISTINCT FROM 'object'
        OR coalesce(l ->> 'priced_line_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RETURN 'PRICING_NOT_IN_EFFECT';
  END IF;
  SELECT min(array_position(causes, priced_line_pricing_check((l ->> 'priced_line_id')::uuid))) INTO worst
    FROM jsonb_array_elements(content -> 'lines') l;
  RETURN coalesce(causes[worst], 'current');
END;
$$;

-- Whether a pricing run's rule release has been withdrawn (its content was wrong). False for a run the caller
-- cannot see, which the audit report's own rules refuse first.
CREATE FUNCTION pricing_run_release_withdrawn(run uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM pricing_run r JOIN rule_release_withdrawal w ON w.release_no = r.release_no WHERE r.id = run)
$$;

-- Approval only while the version's pricing is current (packet_version_rules, which this does not replace,
-- holds the rest of approval). It fires first by name, so a stale version is refused for that before anything else.
CREATE FUNCTION packet_version_approval_pricing() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL AND packet_version_pricing_check(NEW.content) IS DISTINCT FROM 'current' THEN
    RAISE EXCEPTION 'a packet version is approved only while its pricing is current: every line on the pricing in effect, under a rule release not withdrawn, with its contract version signed off and covering the service date' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packet_version_approval_pricing BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_approval_pricing();

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

-- A line's calculation summary as @tp/packets lineCalculation() copies it from the stored trace: the method, the
-- release, the steps' amounts in the order they applied (the amount per unit or per visit, the schedule, the
-- charge, the base, then each adjustment's amount after it), the rounding with its unrounded and rounded cents,
-- the observed basis and the patient share. Without the trace's SHA-256, which is over the trace's canonical JSON
-- and is the export job's to check. Null for a trace that priced nothing.
CREATE FUNCTION priced_line_calculation(trace jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  units jsonb := trace -> 'steps' -> 'units';
  per_visit jsonb := trace -> 'steps' -> 'per_visit';
  rounding jsonb := trace -> 'steps' -> 'rounding';
  adjustments jsonb := trace -> 'steps' -> 'adjustments';
  steps jsonb := '[]'::jsonb;
  step record;
BEGIN
  IF trace -> 'outcome' ->> 'result' IS DISTINCT FROM 'priced' OR jsonb_typeof(trace -> 'terms') IS DISTINCT FROM 'object'
     OR jsonb_typeof(rounding) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;
  FOR step IN
    SELECT s.name, s.amount FROM (
      SELECT 1 AS place, 0::bigint AS ordinal, CASE WHEN jsonb_typeof(per_visit) = 'object' THEN 'visit' ELSE 'unit' END AS name,
             CASE WHEN jsonb_typeof(units) = 'object' THEN units -> 'unit_cents' END AS amount
      UNION ALL SELECT 2, 0, 'schedule', CASE WHEN jsonb_typeof(units) = 'object' THEN units -> 'schedule_cents' END
      UNION ALL SELECT 3, 0, 'charge', CASE WHEN jsonb_typeof(units) = 'object' THEN units -> 'charge_cents' END
      UNION ALL SELECT 4, 0, 'base', coalesce(nullif(per_visit -> 'base_cents', 'null'::jsonb), nullif(units -> 'base_cents', 'null'::jsonb))
      UNION ALL SELECT 5, a.ordinal, a.value ->> 'name', a.value -> 'after_cents'
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(adjustments) = 'array' THEN adjustments ELSE '[]'::jsonb END) WITH ORDINALITY a (value, ordinal)
    ) s
    WHERE s.amount IS NOT NULL AND s.amount <> 'null'::jsonb
    ORDER BY s.place, s.ordinal
  LOOP
    steps := steps || jsonb_build_array(jsonb_build_object('step', step.name, 'amount_cents', step.amount));
  END LOOP;
  RETURN jsonb_build_object(
    'method', CASE WHEN trace -> 'agreement' ->> 'outcome' = 'MA_NONCONTRACTED' THEN to_jsonb('MA_NONCONTRACTED'::text) ELSE trace -> 'terms' -> 'method' END,
    'release_no', trace -> 'release' -> 'number',
    'steps', steps,
    'rounding', jsonb_build_object('rule', rounding -> 'rule', 'unrounded_cents', rounding -> 'unrounded_cents', 'rounded_cents', rounding -> 'rounded_cents'),
    'observed_basis', trace -> 'line' -> 'observed_allowed_basis',
    'patient_share_cents', coalesce(trace -> 'steps' -> 'patient_share_cents', 'null'::jsonb)
  );
END;
$$;

-- A tp-packet/2 version states, when it is written, what its inputs give (CO-05: no figure, date or count absent
-- from them): each line's deadline (its status, the day it ends and its source) and calculation (as
-- priced_line_calculation() reads the line's stored trace, and a SHA-256 of it); and its own deadline as the
-- database derives it: its basis by dispute level, its status, its end (the earliest of the lines' windows at
-- the first level, the reopening denial's next window above it), how many lines it has and how many have a
-- verified deadline, causes only when it is not verified, and exactly the sources its lines' windows name, each
-- as it stands: a contract version's cited window (its document, page, quote, hash, days and verifier) or a
-- release record (its release, SHA-256, level and program). Nothing it names changes later: priced_line and
-- rule_record are immutable, a contract window is frozen from approval and a payer response never changes.
CREATE FUNCTION packet_version_deadline_stated() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
  line jsonb;
  trace jsonb;
  window_step jsonb;
  deadline jsonb := NEW.content -> 'deadline';
  verified_lines integer := 0;
  earliest text;
  stated_end text;
  named text[] := ARRAY[]::text[];
  stated text[] := ARRAY[]::text[];
  cited jsonb;
BEGIN
  IF NEW.content ->> 'format' IS DISTINCT FROM 'tp-packet/2' THEN
    RETURN NULL;
  END IF;
  SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.content -> 'lines') LOOP
    SELECT p.trace INTO trace FROM priced_line p WHERE p.id = (line ->> 'priced_line_id')::uuid;
    window_step := trace -> 'steps' -> 'window';
    IF line -> 'deadline' ->> 'status' IS DISTINCT FROM priced_line_deadline_status((line ->> 'priced_line_id')::uuid)
       OR line -> 'deadline' ->> 'ends_on' IS DISTINCT FROM window_step ->> 'ends_on'
       OR line -> 'deadline' ->> 'source' IS DISTINCT FROM window_step ->> 'source' THEN
      RAISE EXCEPTION 'a packet version states each line''s deadline from the line''s own window: its status, the day it ends and its source' USING ERRCODE = 'check_violation';
    END IF;
    IF priced_line_calculation(trace) IS NULL OR (line -> 'calculation') - 'trace_sha256' IS DISTINCT FROM priced_line_calculation(trace)
       OR coalesce(line -> 'calculation' ->> 'trace_sha256', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'a packet version states each line''s calculation as its stored trace has it: the method, the release, the steps, the rounding, the observed basis and the patient share' USING ERRCODE = 'check_violation';
    END IF;
    IF line -> 'deadline' ->> 'status' = 'verified' THEN
      verified_lines := verified_lines + 1;
    END IF;
    IF window_step ->> 'ends_on' IS NOT NULL AND (earliest IS NULL OR window_step ->> 'ends_on' < earliest) THEN
      earliest := window_step ->> 'ends_on';
    END IF;
    -- The evidence the line's window names: its contract version's cited window, or its release record.
    IF window_step ->> 'source' = 'contract' AND coalesce(trace #>> '{agreement,contract_version_id}', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND EXISTS (SELECT 1 FROM contract_version v WHERE v.id = (trace #>> '{agreement,contract_version_id}')::uuid AND v.practice_id = NEW.practice_id AND v.dispute_window_evidence IS NOT NULL) THEN
      named := named || ('contract_window:' || (trace #>> '{agreement,contract_version_id}'));
    ELSIF window_step ->> 'source' = 'release' AND jsonb_typeof(window_step -> 'record') = 'object' THEN
      named := named || ('release_record:' || (trace #>> '{release,number}') || ':' || (window_step -> 'record' ->> 'sha256'));
    END IF;
  END LOOP;
  IF deadline ->> 'basis' IS DISTINCT FROM (CASE WHEN NEW.dispute_level > 1 THEN 'next_level_window' ELSE 'line_windows' END)
     OR deadline ->> 'status' IS DISTINCT FROM packet_version_deadline_status(the_case, NEW.content) THEN
    RAISE EXCEPTION 'a packet version states its deadline as the database derives it: the lines'' windows at the first level, the next level''s window after a reopened denial' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.dispute_level > 1 THEN
    SELECT r.next_window_ends_on::text INTO stated_end
      FROM payer_response r JOIN submission s ON s.id = r.submission_id
     WHERE s.case_id = the_case AND r.reopens_case
     ORDER BY r.received_on DESC, r.created_at DESC, r.id DESC LIMIT 1;
  ELSE
    stated_end := earliest;
  END IF;
  IF deadline -> 'ends_on' IS DISTINCT FROM coalesce(to_jsonb(stated_end), 'null'::jsonb)
     OR deadline -> 'lines' IS DISTINCT FROM to_jsonb(jsonb_array_length(NEW.content -> 'lines'))
     OR deadline -> 'lines_verified' IS DISTINCT FROM to_jsonb(verified_lines)
     OR jsonb_typeof(deadline -> 'causes') IS DISTINCT FROM 'array'
     OR jsonb_path_exists(deadline -> 'causes', '$[*] ? (@.type() != "string" || !(@ like_regex "^[A-Z][A-Z_]{0,39}$"))')
     OR (deadline ->> 'status' = 'verified' AND jsonb_array_length(deadline -> 'causes') > 0) THEN
    RAISE EXCEPTION 'a packet version states the day its deadline ends and its lines as its inputs give them' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(deadline -> 'sources') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'a packet version names the evidence its deadline rests on as it stands' USING ERRCODE = 'check_violation';
  END IF;
  FOR cited IN SELECT value FROM jsonb_array_elements(deadline -> 'sources') LOOP
    IF cited ->> 'kind' = 'contract_window'
       AND (cited - ARRAY['kind', 'contract_version_id', 'days', 'document_id', 'page', 'quote', 'hash', 'verified_by', 'verified_at']) = '{}'::jsonb
       AND EXISTS (
         SELECT 1 FROM contract_version v
          WHERE v.id::text = cited ->> 'contract_version_id' AND v.practice_id = NEW.practice_id AND v.dispute_window_evidence IS NOT NULL
            AND cited -> 'document_id' = v.dispute_window_evidence -> 'document_id' AND cited -> 'page' = v.dispute_window_evidence -> 'page'
            AND cited -> 'quote' = v.dispute_window_evidence -> 'quote' AND cited -> 'hash' = v.dispute_window_evidence -> 'hash'
            AND cited -> 'days' = coalesce(to_jsonb(v.dispute_window_days), 'null'::jsonb)
            AND cited -> 'verified_by' = coalesce(to_jsonb(v.dispute_window_verified_by::text), 'null'::jsonb)
            AND CASE WHEN v.dispute_window_verified_at IS NULL THEN cited -> 'verified_at' = 'null'::jsonb
                     ELSE coalesce(cited ->> 'verified_at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
                          AND (cited ->> 'verified_at')::timestamptz = date_trunc('milliseconds', v.dispute_window_verified_at) END
       ) THEN
      stated := stated || ('contract_window:' || (cited ->> 'contract_version_id'));
    ELSIF cited ->> 'kind' = 'release_record'
       AND (cited - ARRAY['kind', 'release_no', 'sha256', 'program', 'level']) = '{}'::jsonb
       AND jsonb_typeof(cited -> 'release_no') = 'number' AND coalesce(cited ->> 'sha256', '') ~ '^[0-9a-f]{64}$'
       AND cited -> 'level' = coalesce((SELECT to_jsonb(r.verification) FROM rule_record r
                                         WHERE r.release_no::text = cited ->> 'release_no' AND r.record_type = 'dispute_window' AND r.sha256 = cited ->> 'sha256'), 'null'::jsonb)
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(NEW.content -> 'lines') l JOIN priced_line p ON p.id = (l ->> 'priced_line_id')::uuid
          WHERE p.trace #>> '{release,number}' = cited ->> 'release_no' AND p.trace #>> '{steps,window,record,sha256}' = cited ->> 'sha256'
            AND cited -> 'program' = coalesce(p.trace #> '{steps,window,record,key,program}', 'null'::jsonb)
       ) THEN
      stated := stated || ('release_record:' || (cited ->> 'release_no') || ':' || (cited ->> 'sha256'));
    ELSE
      RAISE EXCEPTION 'a packet version names the evidence its deadline rests on as it stands' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF cardinality(stated) <> (SELECT count(DISTINCT x) FROM unnest(stated) x)
     OR (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM unnest(stated) x) IS DISTINCT FROM (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM unnest(named) x) THEN
    RAISE EXCEPTION 'a packet version names exactly the evidence its lines'' windows rest on, each once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER packet_version_deadline_stated AFTER INSERT ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_deadline_stated();

-- The export's refusal in SQL (CO-05): on the export, the version is of the case's dispute level now (one
-- written before a denial reopened the case states the earlier level's deadline), its pricing is still current
-- (packet_version_pricing_check(), audit item #4), its deadline is derived again
-- now, from the content and the rows it names (never from the stored status), and the export carries the
-- verifier's report over the narrative it rendered, which SQL holds to the verifier's format, a pass and the
-- version's narrative SHA-256 (the verifier itself is the job's). Its report is written with the export and
-- never changes.
CREATE FUNCTION packet_version_export_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
BEGIN
  IF OLD.export_sha256 IS NULL AND NEW.export_sha256 IS NOT NULL THEN
    SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
    -- The content's level (a BEFORE trigger sees no generated column of NEW; the content never changes).
    IF the_case IS NULL OR (NEW.content ->> 'dispute_level')::integer IS DISTINCT FROM 1 + case_reopened_levels(the_case) THEN
      RAISE EXCEPTION 'only a version of the case''s dispute level is exported; write the packet again at this level' USING ERRCODE = 'check_violation';
    END IF;
    -- Its pricing is still current (audit item #4): every line on the pricing in effect, its release not
    -- withdrawn, its contract version signed off and covering the service date.
    IF packet_version_pricing_check(NEW.content) IS DISTINCT FROM 'current' THEN
      RAISE EXCEPTION 'a packet version is exported only while its pricing is current: every line on the pricing in effect, under a rule release not withdrawn, with its contract version signed off and covering the service date' USING ERRCODE = 'check_violation';
    END IF;
    IF packet_version_deadline_status(the_case, NEW.content) = 'unverified' THEN
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

-- Whether this connection signed in as the worker's own login (docs/adr/0061): a member of tp_job, the marker role
-- that holds no privilege and that only the worker's login (tp_worker_login, tp_worker_dev locally) is granted;
-- the web's login never is (packages/db/src/roles.ts, apps/worker/src/deploy/logins.ts). session_user is the login
-- the connection signed in as: SET ROLE and SECURITY DEFINER change current_user and never session_user, and only a
-- superuser may SET SESSION AUTHORIZATION, so code on the worker's login, a compromised job's included, cannot pass
-- for a person's request whatever it sets app.actor_id to. A superuser (dev and test only, and able to disable any
-- trigger) is a member of every role and is not taken for a job.
CREATE FUNCTION app_session_is_job() RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT pg_has_role(session_user, 'tp_job', 'MEMBER') AND NOT coalesce((SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = session_user), false)
$$;

-- The download of an export's file (the owner's addition of 2026-10-18): the web request that served the PDF or
-- the CSV records packet_export_pdf_downloaded or packet_export_csv_downloaded once the bytes it read from storage
-- hashed to the version's stored SHA-256 (@tp/worker/packets downloadPacketExport()), in the same transaction.
-- Such an event is recorded only on a connection that is not the worker's (app_session_is_job()), only for a person
-- (a job's actor is its job ID, which names no user), in their own name (audit_event_record), who may read the
-- export there now (phi.export, or audit_finding.validate for the reimbursement reviewer), of an exported version of
-- the event's practice in the caller's scope, as a line-level export. Every role meets it, the owner included;
-- audit_event never changes once written. Its time is the database's: the application role has no grant on
-- audit_event.at.
CREATE FUNCTION audit_event_packet_download() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_session_is_job() THEN
    RAISE EXCEPTION 'a packet export''s download is recorded by the web request that served it, never on the worker''s login' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_actor_is_person() OR NEW.actor_kind IS DISTINCT FROM 'user' OR NEW.actor_id IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a packet export''s download is recorded for the person it was served to, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.practice_id IS NULL OR NOT practice_in_scope(NEW.practice_id)
     OR NOT (coalesce(app_actor_permitted(NEW.practice_id, 'phi.export'), false) OR coalesce(app_actor_permitted(NEW.practice_id, 'audit_finding.validate'), false)) THEN
    RAISE EXCEPTION 'a packet export''s download is recorded for a person who may read the export' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.object_type IS DISTINCT FROM 'packet_version' OR NEW.purpose IS DISTINCT FROM 'line_export'
     OR NOT EXISTS (SELECT 1 FROM packet_version v WHERE v.id = NEW.object_id AND v.practice_id = NEW.practice_id AND v.exported_at IS NOT NULL) THEN
    RAISE EXCEPTION 'a packet export''s download is of an exported packet version of its practice, as a line-level export' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_event_packet_download BEFORE INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action IN ('packet_export_pdf_downloaded', 'packet_export_csv_downloaded'))
  EXECUTE FUNCTION audit_event_packet_download();

-- The files of a packet version's export that this transaction's actor, as a person, downloaded at or after its
-- export, in its practice (audit_event_packet_download admits only such downloads): {csv}, {pdf}, {csv,pdf} or {}.
-- Only the caller's own, of a version in the caller's scope: nothing on the worker's login (session_user is the
-- caller's under definer's rights too), for a job, another person's downloads or a version out of scope. Definer's
-- rights over the audit log, whose own policy admits the practice's administrators alone; the caller's scope is
-- kept.
CREATE FUNCTION packet_export_downloads_of_actor(target uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(array_agg(f.file ORDER BY f.file), '{}'::text[])
    FROM (
      SELECT DISTINCT CASE e.action WHEN 'packet_export_pdf_downloaded' THEN 'pdf' ELSE 'csv' END AS file
        FROM packet_version v
        JOIN audit_event e ON e.object_id = v.id AND e.object_type = 'packet_version' AND e.practice_id = v.practice_id
       WHERE v.id = target AND practice_in_scope(v.practice_id) AND v.exported_at IS NOT NULL
         AND NOT app_session_is_job() AND app_actor_is_person() AND e.actor_id = app_actor_id() AND e.actor_kind = 'user'
         AND e.action IN ('packet_export_pdf_downloaded', 'packet_export_csv_downloaded') AND e.purpose = 'line_export'
         AND e.at >= v.exported_at
    ) f
$$;

-- The export history (20261025090000) with the two download actions; packet_export_downloaded stays listed for
-- the downloads recorded before them.
CREATE OR REPLACE FUNCTION practice_export_history(target uuid, page_size integer, page_offset integer)
RETURNS TABLE (event_id uuid, action text, object_type text, object_id uuid, purpose text, actor_id uuid, at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT e.id, e.action, e.object_type, e.object_id, e.purpose, e.actor_id, e.at
    FROM audit_event e
   WHERE practice_in_scope(target) AND coalesce(app_actor_permitted(target, 'report.read'), false)
     AND e.practice_id = target
     AND e.action IN ('audit_report_downloaded', 'roi_statement_downloaded', 'report_document_downloaded', 'monthly_summary_downloaded', 'packet_export_downloaded',
                      'packet_export_pdf_downloaded', 'packet_export_csv_downloaded')
   ORDER BY e.at DESC, e.id DESC
   LIMIT least(greatest(page_size, 0), 200) OFFSET greatest(page_offset, 0)
$$;

CREATE OR REPLACE FUNCTION practice_export_count(target uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT count(*)::integer
    FROM audit_event e
   WHERE practice_in_scope(target) AND coalesce(app_actor_permitted(target, 'report.read'), false)
     AND e.practice_id = target
     AND e.action IN ('audit_report_downloaded', 'roi_statement_downloaded', 'report_document_downloaded', 'monthly_summary_downloaded', 'packet_export_downloaded',
                      'packet_export_pdf_downloaded', 'packet_export_csv_downloaded')
$$;

-- The attestation (D16): written unattested; once exported, attested once by a reimbursement reviewer in their
-- own name, in a request on a connection that is not the worker's (app_session_is_job()), who drafted, wrote and
-- approved no version of the packet, over the current version still asking for its case's lines at the case's
-- dispute level, while its pricing is current and its deadline not unverified, and once the reviewer has downloaded both its PDF and its
-- CSV, each checked against its SHA-256 (packet_export_downloads_of_actor()). The time is the database's.
CREATE FUNCTION packet_version_attestation_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  the_case uuid;
  current_id uuid;
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
    IF app_session_is_job() THEN
      RAISE EXCEPTION 'a packet''s export is attested in its reviewer''s own request, never on the worker''s login' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT app_actor_is_person() OR NEW.attested_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'audit_finding.validate'), false) THEN
      RAISE EXCEPTION 'a packet''s export is attested by a reimbursement reviewer, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Any version of the packet: its first drafter, every later writer and every approver, this version's too.
    IF app_actor_id() IS NOT DISTINCT FROM NEW.drafted_by OR app_actor_id() IS NOT DISTINCT FROM NEW.approved_by
       OR EXISTS (SELECT 1 FROM packet_version v WHERE v.packet_id = NEW.packet_id AND (v.drafted_by = app_actor_id() OR v.approved_by = app_actor_id())) THEN
      RAISE EXCEPTION 'the person who drafted, wrote or approved a packet does not attest its export' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT p.current_version_id, p.case_id INTO current_id, the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
    IF NEW.id IS DISTINCT FROM current_id OR NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = the_case AND c.state <> 'closed_written_off')
       OR NOT packet_version_matches_case(the_case, NEW.content) THEN
      RAISE EXCEPTION 'only a packet''s current version, still asking for its case''s lines, is attested' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.content ->> 'dispute_level')::integer IS DISTINCT FROM 1 + case_reopened_levels(the_case) THEN
      RAISE EXCEPTION 'only a version of the case''s dispute level is attested' USING ERRCODE = 'check_violation';
    END IF;
    IF packet_version_pricing_check(NEW.content) IS DISTINCT FROM 'current' THEN
      RAISE EXCEPTION 'a packet version whose pricing is no longer current is not attested' USING ERRCODE = 'check_violation';
    END IF;
    IF packet_version_deadline_status(the_case, NEW.content) = 'unverified' THEN
      RAISE EXCEPTION 'a packet version whose deadline is not verified is not attested' USING ERRCODE = 'check_violation';
    END IF;
    -- The attester's own downloads of this version's two files since its export, each recorded by the web request
    -- that served it (none is recorded on the worker's login, nor for a job's actor).
    IF NOT (packet_export_downloads_of_actor(NEW.id) @> ARRAY['csv', 'pdf']) THEN
      RAISE EXCEPTION 'a packet''s export is attested once its reviewer has downloaded both its PDF and its CSV, each checked against its SHA-256' USING ERRCODE = 'check_violation';
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

-- A submission records whether the version it sends was still priced current when it was logged (audit item #4).
-- It is never refused for that: a submission records something that already happened outside the product (the
-- packet went to the payer), so it is logged and flagged, and the submissions page shows the cause with the figures
-- then and now. Null only for a row logged before this migration (no environment holds one). The database writes it,
-- overwriting whatever an INSERT gave; the application role has no grant on it.
ALTER TABLE submission
  ADD COLUMN pricing_check text CONSTRAINT submission_pricing_check_check
    CHECK (pricing_check IN ('current', 'PRICING_NOT_IN_EFFECT', 'RELEASE_WITHDRAWN', 'CONTRACT_VERSION_NOT_SIGNED_OFF', 'CONTRACT_VERSION_NOT_IN_FORCE'));

CREATE FUNCTION submission_pricing_check() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.pricing_check := packet_version_pricing_check((SELECT v.content FROM packet_version v WHERE v.id = NEW.packet_version_id AND v.practice_id = NEW.practice_id));
  RETURN NEW;
END;
$$;
CREATE TRIGGER submission_pricing_check BEFORE INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_pricing_check();

-- ---------------------------------------------------------------------------------------------------
-- audit_report: never on a withdrawn rule release (audit item #4)
-- ---------------------------------------------------------------------------------------------------

-- As before (20261021090000_run_diffs_and_runs_in_effect.sql), and: a report is not requested of a run whose
-- rule release was withdrawn (its content was wrong). An AFTER trigger, so a row of another practice meets the
-- tenant policy first.
CREATE OR REPLACE FUNCTION audit_report_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_run r WHERE r.id = NEW.pricing_run_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'an audit report is of a pricing run of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT pricing_run_in_effect(NEW.pricing_run_id) THEN
    RAISE EXCEPTION 'an audit report is of the pricing run in effect for its period: never a re-run nobody has accepted, nor a run since replaced' USING ERRCODE = 'check_violation';
  END IF;
  IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
    RAISE EXCEPTION 'an audit report is not built on a withdrawn rule release: re-price the period under the release in force and accept that re-run first' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- As before (20261021090000), and: the report job makes a report ready only while its run's rule release is not
-- withdrawn (it fails a queued one with failure_code 'release_withdrawn' instead, which stays allowed), and a ready
-- report whose release was withdrawn since is neither attested nor released.
CREATE OR REPLACE FUNCTION audit_report_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.content IS NOT NULL OR NEW.pdf_key IS NOT NULL OR NEW.csv_key IS NOT NULL OR NEW.attested_by IS NOT NULL OR NEW.released_by IS NOT NULL
       OR NEW.generated_at IS NOT NULL OR NEW.attested_at IS NOT NULL OR NEW.released_at IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
      RAISE EXCEPTION 'an audit report is requested queued' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pricing_run_id, NEW.requested_by, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pricing_run_id, OLD.requested_by, OLD.created_at) THEN
    RAISE EXCEPTION 'an audit report''s practice, run and requester never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'queued' AND NEW.status IN ('ready', 'failed') THEN
    IF app_actor_is_person() THEN
      RAISE EXCEPTION 'only the report job generates an audit report' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.attested_by, NEW.attestation, NEW.released_by) IS DISTINCT FROM (NULL::uuid, NULL::jsonb, NULL::uuid) THEN
      RAISE EXCEPTION 'an audit report is generated before it is attested or released' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'ready' THEN
      IF NOT pricing_run_in_effect(NEW.pricing_run_id) THEN
        RAISE EXCEPTION 'an audit report is generated only while its pricing run is the run in effect for its period' USING ERRCODE = 'check_violation';
      END IF;
      IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
        RAISE EXCEPTION 'an audit report is not built on a withdrawn rule release: the report job fails it as release_withdrawn' USING ERRCODE = 'check_violation';
      END IF;
      NEW.generated_at := now();
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR (NEW.as_of, NEW.content, NEW.pdf_key, NEW.pdf_sha256, NEW.csv_key, NEW.csv_sha256, NEW.generated_at, NEW.failure_code)
        IS DISTINCT FROM (OLD.as_of, OLD.content, OLD.pdf_key, OLD.pdf_sha256, OLD.csv_key, OLD.csv_sha256, OLD.generated_at, OLD.failure_code) THEN
    RAISE EXCEPTION 'an audit report''s numbers and files never change once generated; a new report is generated instead' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.attested_by, NEW.attestation) IS DISTINCT FROM (OLD.attested_by, OLD.attestation) THEN
    IF OLD.attested_by IS NOT NULL OR OLD.status <> 'ready' THEN
      RAISE EXCEPTION 'a ready audit report is attested once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.attested_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'audit_finding.validate'), false) THEN
      RAISE EXCEPTION 'an audit report is attested by a reimbursement reviewer, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.attestation ->> 'pdf_sha256' IS DISTINCT FROM NEW.pdf_sha256 OR NEW.attestation ->> 'csv_sha256' IS DISTINCT FROM NEW.csv_sha256 THEN
      RAISE EXCEPTION 'an attestation names the SHA-256 of the report''s files it was signed over' USING ERRCODE = 'check_violation';
    END IF;
    IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
      RAISE EXCEPTION 'an audit report whose rule release was withdrawn since it was generated is not attested; a new report is generated on the release in force' USING ERRCODE = 'check_violation';
    END IF;
    NEW.attested_at := now();
  ELSIF NEW.attested_at IS DISTINCT FROM OLD.attested_at THEN
    RAISE EXCEPTION 'an attestation''s time is the time it was signed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.released_by IS DISTINCT FROM OLD.released_by THEN
    IF OLD.released_by IS NOT NULL THEN
      RAISE EXCEPTION 'an audit report is released once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.attested_by IS NULL THEN
      RAISE EXCEPTION 'an audit report cannot be released before a reimbursement reviewer signs its attestation' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.released_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'case.work'), false) THEN
      RAISE EXCEPTION 'an audit report is released by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
      RAISE EXCEPTION 'an audit report whose rule release was withdrawn since it was generated is not released; a new report is generated on the release in force' USING ERRCODE = 'check_violation';
    END IF;
    NEW.released_at := now();
  ELSIF NEW.released_at IS DISTINCT FROM OLD.released_at THEN
    RAISE EXCEPTION 'a release''s time is the time it was released' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The export's attempts (audit item #26): every refusal or failure of the export job as a coded audit event
-- ---------------------------------------------------------------------------------------------------

-- The codes an export job's refusal names (the readiness reasons in their order, then the verifier's), and the
-- codes its failure names. @tp/worker/packets PACKET_EXPORT_REFUSALS and PACKET_EXPORT_FAILURES equal them (a
-- database test compares them).
CREATE FUNCTION packet_export_refusal_codes() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY['not_approved', 'not_current', 'outdated', 'case_changed', 'not_case_level', 'window_passed', 'pricing_not_current', 'deadline_unverified', 'inputs_differ', 'verifier_failed']
$$;

CREATE FUNCTION packet_export_failure_codes() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY['store_mismatch', 'render_failed', 'store_failed', 'database_refused', 'unexpected']
$$;

-- An export job's refusal (packet_export_refused), a failed try another follows (packet_export_attempt_failed) or
-- its last failed try (packet_export_failed): written by the job (a service actor, never a person), of a packet
-- version of the event's practice, with one of its codes as the purpose and nothing else (no words, no patient
-- data). Every role meets it, the owner included.
CREATE FUNCTION audit_event_packet_export_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_is_person() OR NEW.actor_kind IS DISTINCT FROM 'service' THEN
    RAISE EXCEPTION 'a packet export''s refusal or failure is recorded by the export job, never in a person''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.object_type IS DISTINCT FROM 'packet_version' OR NEW.practice_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM packet_version v WHERE v.id = NEW.object_id AND v.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a packet export''s refusal or failure is of a packet version of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT coalesce(NEW.purpose = ANY (CASE WHEN NEW.action = 'packet_export_refused' THEN packet_export_refusal_codes() ELSE packet_export_failure_codes() END), false) THEN
    RAISE EXCEPTION 'a packet export''s refusal or failure names one of its codes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_event_packet_export_attempt BEFORE INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action IN ('packet_export_refused', 'packet_export_attempt_failed', 'packet_export_failed'))
  EXECUTE FUNCTION audit_event_packet_export_attempt();

-- The latest export attempt of a packet version, for its packet page: 'exported' once exported (at its export);
-- 'none' when nobody asked; 'in_progress' after the latest request with nothing from the job since; 'retrying',
-- 'refused' or 'failed' with the code of the job's newest event since that request. One row for a version in the
-- caller's scope whose actor drafts packets or exports PHI in its practice, none otherwise. Definer's rights over
-- the audit log, whose own policy admits the practice's administrators alone; the caller's scope is kept.
CREATE FUNCTION packet_version_export_attempt(target uuid)
RETURNS TABLE (state text, code text, requested_at timestamptz, at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH version AS (
    SELECT v.id, v.practice_id, v.exported_at
      FROM packet_version v
     WHERE v.id = target AND practice_in_scope(v.practice_id)
       AND (coalesce(app_actor_permitted(v.practice_id, 'packet.draft'), false) OR coalesce(app_actor_permitted(v.practice_id, 'phi.export'), false))
  ), request AS (
    SELECT max(e.at) AS at
      FROM version v JOIN audit_event e ON e.object_type = 'packet_version' AND e.object_id = v.id AND e.practice_id = v.practice_id
     WHERE e.action = 'packet_export_requested'
  ), outcome AS (
    SELECT e.action, e.purpose, e.at
      FROM version v
      JOIN audit_event e ON e.object_type = 'packet_version' AND e.object_id = v.id AND e.practice_id = v.practice_id
      CROSS JOIN request q
     WHERE e.action IN ('packet_export_refused', 'packet_export_attempt_failed', 'packet_export_failed') AND e.actor_kind = 'service'
       AND q.at IS NOT NULL AND e.at >= q.at
     ORDER BY e.at DESC, e.id DESC
     LIMIT 1
  )
  SELECT CASE WHEN v.exported_at IS NOT NULL THEN 'exported'
              WHEN q.at IS NULL THEN 'none'
              WHEN o.action IS NULL THEN 'in_progress'
              WHEN o.action = 'packet_export_attempt_failed' THEN 'retrying'
              WHEN o.action = 'packet_export_refused' THEN 'refused'
              ELSE 'failed' END,
         CASE WHEN v.exported_at IS NULL THEN o.purpose END,
         q.at,
         CASE WHEN v.exported_at IS NOT NULL THEN v.exported_at ELSE o.at END
    FROM version v CROSS JOIN request q LEFT JOIN outcome o ON true
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges: the export job writes the export's verifier report with the export; a reviewer attests. A download
-- is an audit event, which tp_app inserts as before (20261015140500, 20261015180000), on the web's login only.
-- ---------------------------------------------------------------------------------------------------

GRANT UPDATE (export_verifier_report, attested_by, attestation) ON packet_version TO tp_app;

REVOKE ALL ON FUNCTION contract_window_rule_computed(text, text), ma_dispute_route_confirmed(),
  priced_line_deadline_status(uuid, text), case_next_window_deadline_status(uuid, text), packet_version_deadline_status(uuid, jsonb),
  service_line_priced_in_effect(uuid), priced_line_pricing_check(uuid), packet_version_pricing_check(jsonb), pricing_run_release_withdrawn(uuid), packet_version_approval_pricing(),
  priced_line_calculation(jsonb), packet_version_deadline_stated(), packet_version_export_guard(), packet_version_attestation_rules(), submission_needs_attested_export(),
  submission_pricing_check(), app_session_is_job(), audit_event_packet_download(), packet_export_downloads_of_actor(uuid),
  packet_export_refusal_codes(), packet_export_failure_codes(), audit_event_packet_export_attempt(), packet_version_export_attempt(uuid) FROM PUBLIC;
-- Called by the triggers, which run as the application role, and by the export job and the screens (the review
-- reads the viewer's own downloads; the attestation service asks before it attests; the builder, the export
-- request and the job ask whether a version's pricing is current; the packet page reads the latest attempt; the
-- contract window's CHECK and the deadline's derivation ask whether a window's rule is computed and the route confirmed).
GRANT EXECUTE ON FUNCTION contract_window_rule_computed(text, text), ma_dispute_route_confirmed(),
  priced_line_deadline_status(uuid, text), case_next_window_deadline_status(uuid, text), packet_version_deadline_status(uuid, jsonb),
  service_line_priced_in_effect(uuid), priced_line_pricing_check(uuid), packet_version_pricing_check(jsonb), pricing_run_release_withdrawn(uuid),
  priced_line_calculation(jsonb), app_session_is_job(), packet_export_downloads_of_actor(uuid),
  packet_export_refusal_codes(), packet_export_failure_codes(), packet_version_export_attempt(uuid) TO tp_app;
