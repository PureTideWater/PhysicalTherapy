-- The review of milestones 8 and 9, in the database (PRD 12, The packet, Approval and Submission,
-- response and follow-up; PRD 13, Entries and Matching; PRD 2, step 5; PRD 6, Submissions and payer
-- responses: "follow-up dates; reminders"; PRD 16, Tenant isolation and encryption; CLAUDE.md rules 1
-- and 4, "Check in the handler and in Postgres"; test matrix CAS-08, CAS-12, CAS-13, CAS-14, LED-04,
-- LED-07, LED-09; docs/adr/0047). Every rule holds for every role:
--
-- - ledger_entry: an adjustment is a specialist's (PRD 13: "A specialist corrects an amount after
--   review, with a reason"): the new permission ledger.adjust, which only the contract specialist holds
--   (under a support grant, as everywhere in a practice; docs/adr/0028), and no longer posting.reconcile.
--   The amounts are bounded: the entries evidencing a posting or EFT row, corrections included, net
--   between zero and the row's amount (the upper bound was 20261026090000's); a line's posted, and its
--   deposited, never exceed what was approved for it, corrections included; and an adjustment keeps its
--   entry's net between zero and the entry's evidence (the row's amount for a posted or deposited entry,
--   the entry's own amount, which its evidence set, for any other), so it only ever corrects downward
--   what a remittance, a response or an adjustment of PLB evidenced, and moves a posting between the
--   lines of its row within the row.
-- - line_status: a person who holds ledger.adjust but not case.work (the specialist) writes the stage
--   events their adjustment leads to, and only those: a line forward to payer approved or recovered
--   (line_status_ledger_rules checks the ledger holds it there), or back to exactly the stage its entries
--   now leave it at.
-- - encrypted free text: ledger_match.reversal_reason, ledger_entry.reason, line_status.reason,
--   case_line.written_off_text and case_line.reopen_reason are enc:v1 ciphertext, as every other column
--   of ENCRYPTED_COLUMNS already is (the catalog test now checks them all).
-- - packet_version: the verifier's report is tp-packet-verifier/2 (it now also fails hidden characters,
--   figures in other digits and the case's own identifiers); a version is approved only with the current
--   verifier's passing report, so a version an earlier verifier passed is written again first; and an
--   export's keys lie under the version's own practice and packet.
-- - submission: a submission sends the packet's current version, or one an edit replaced only when it
--   was sent before the edit.
-- - notification kind follow_up (the figure code days_waiting): the reminder a case's owner gets when the
--   follow-up date of a submission the payer has not answered has come.
-- - console_contract_queue(): the regulations a contract specialist has to confirm, counted per practice.
--
-- Runs as tp_owner. Safe with the previous image running: functions replaced keep their signatures (the
-- queue's gains a column, which the previous image's query ignores by name), checks and triggers added;
-- the previous image encrypts every reason it writes, writes export keys under the version's own packet,
-- and logs only current versions from its screens. Its adjustments by a billing manager are refused from
-- here on, as they should be, and its verifier's /1 reports can no longer be approved.

-- ---------------------------------------------------------------------------------------------------
-- The ledger: who adjusts, and how far
-- ---------------------------------------------------------------------------------------------------

INSERT INTO role_permission (role, action, effect) VALUES
  ('contract_specialist', 'ledger.adjust', 'allow'),
  ('reviewer', 'ledger.adjust', 'deny');

-- As before (20261026090000_recovery_ledger_review.sql), with an adjustment a specialist's: a person
-- writes it with ledger.adjust, and every other entry with posting.reconcile.
CREATE OR REPLACE FUNCTION ledger_entry_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target ledger_entry;
  matched ledger_match;
  dated date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a ledger entry is never changed or deleted; a correction is a new entry' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.stage = 'adjusted' THEN
      IF NEW.created_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'ledger.adjust'), false) THEN
        RAISE EXCEPTION 'a specialist corrects an amount after review, in their own name, with the ledger adjustment permission' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NEW.created_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a person writes a ledger entry in their own name, with the reconciliation permission' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'the reconcile job writes ledger entries in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a ledger entry is of a case of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM case_line c WHERE c.case_id = NEW.case_id AND c.service_line_id = NEW.service_line_id) THEN
    RAISE EXCEPTION 'a ledger entry of a line is of a line of its case' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO target FROM ledger_entry t WHERE t.id = NEW.evidence_id AND t.practice_id = NEW.practice_id;
    IF NOT FOUND OR target.stage = 'reversed' OR (target.stage = 'adjusted' AND NEW.stage <> 'reversed') THEN
      RAISE EXCEPTION 'a correction names an entry of a counted stage, or a reversal an adjustment' USING ERRCODE = 'check_violation';
    END IF;
    IF (target.case_id, target.service_line_id, target.match_id) IS DISTINCT FROM (NEW.case_id, NEW.service_line_id, NEW.match_id) THEN
      RAISE EXCEPTION 'a correction is of its entry''s case, line and match' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.match_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.id = NEW.match_id AND m.reversed_at IS NULL) THEN
      RAISE EXCEPTION 'a correction is of an entry whose match stands; a reversed match''s entries are never corrected again' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.stage = 'reversed' AND NEW.amount_cents <> -target.amount_cents THEN
      RAISE EXCEPTION 'a reversal offsets its entry exactly' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'a person reverses or adjusts an entry, with a reason' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.allocated THEN
      RAISE EXCEPTION 'a correction is never allocated' USING ERRCODE = 'check_violation';
    END IF;
    NEW.effective_on := target.effective_on;
    RETURN NEW;
  END IF;
  IF NEW.evidence_kind = 'payer_response' THEN
    -- An amount a payer response accepts (the submissions' table, 20261023090000), for its case.
    IF NEW.match_id IS NOT NULL THEN
      RAISE EXCEPTION 'an approval from a payer response is of a recorded response, with no match' USING ERRCODE = 'check_violation';
    END IF;
    SELECT r.received_on INTO dated FROM payer_response r JOIN submission s ON s.id = r.submission_id
     WHERE r.id = NEW.evidence_id AND r.practice_id = NEW.practice_id AND s.case_id = NEW.case_id AND r.kind IN ('accepted', 'partial');
    IF dated IS NULL THEN
      RAISE EXCEPTION 'an approval from a payer response is of a response accepting an amount for its case' USING ERRCODE = 'check_violation';
    END IF;
    NEW.effective_on := dated;
    RETURN NEW;
  END IF;
  SELECT * INTO matched FROM ledger_match m WHERE m.id = NEW.match_id AND m.practice_id = NEW.practice_id AND m.reversed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an entry comes from a standing match' USING ERRCODE = 'check_violation';
  END IF;
  IF matched.evidence_id IS DISTINCT FROM NEW.evidence_id OR (matched.service_line_id IS NOT NULL AND matched.service_line_id IS DISTINCT FROM NEW.service_line_id)
     OR (matched.kind IN ('posting', 'deposit') AND NEW.service_line_id IS NULL) THEN
    RAISE EXCEPTION 'an entry carries its match''s evidence, for its match''s line' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (CASE NEW.stage
       WHEN 'approved' THEN matched.kind = 'claim' AND matched.outcome = 'approved'
       WHEN 'recouped' THEN (matched.kind = 'claim' AND matched.outcome = 'decreased') OR matched.kind = 'recoupment'
       WHEN 'interest' THEN matched.kind = 'interest'
       WHEN 'posted' THEN matched.kind = 'posting'
       ELSE matched.kind = 'deposit'
     END) THEN
    RAISE EXCEPTION 'a % entry comes from a match of its kind', NEW.stage USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.allocated IS DISTINCT FROM matched.allocated THEN
    RAISE EXCEPTION 'an entry is allocated when its match is' USING ERRCODE = 'check_violation';
  END IF;
  SELECT CASE matched.kind
           WHEN 'posting' THEN (SELECT p.posted_on FROM posting_row p WHERE p.id = matched.posting_row_id)
           WHEN 'deposit' THEN (SELECT e.deposited_on FROM eft_row e WHERE e.id = matched.eft_row_id)
           ELSE (SELECT r.bpr16_date FROM remittance r WHERE r.id = matched.remittance_id)
         END INTO dated;
  NEW.effective_on := dated;
  RETURN NEW;
END;
$$;

-- As before (20261026090000_recovery_ledger_review.sql), and never below zero: a correction of a
-- row's entries leaves the row proving between nothing and its amount.
CREATE OR REPLACE FUNCTION ledger_entry_within_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  root ledger_entry;
  row_id uuid;
  row_amount bigint;
  so_far bigint;
  line_row record;
BEGIN
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.stage IN ('posted', 'deposited') THEN
    row_id := NEW.evidence_id;
  ELSIF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO root FROM ledger_entry t WHERE t.id = NEW.evidence_id;
    IF FOUND AND root.stage = 'adjusted' THEN
      SELECT * INTO root FROM ledger_entry t WHERE t.id = root.evidence_id;
    END IF;
    IF NOT FOUND OR root.stage NOT IN ('posted', 'deposited') THEN
      RETURN NEW;
    END IF;
    row_id := root.evidence_id;
  ELSE
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ledger_evidence:' || row_id::text, 0));
  SELECT coalesce((SELECT p.amount_cents FROM posting_row p WHERE p.id = row_id), (SELECT e.amount_cents FROM eft_row e WHERE e.id = row_id)) INTO row_amount;
  SELECT coalesce(sum(x.amount_cents), 0) INTO so_far FROM (
    SELECT p.amount_cents FROM ledger_entry p WHERE p.evidence_id = row_id AND p.stage IN ('posted', 'deposited')
    UNION ALL
    SELECT c.amount_cents FROM ledger_entry p JOIN ledger_entry c ON c.evidence_id = p.id AND c.stage IN ('reversed', 'adjusted')
     WHERE p.evidence_id = row_id AND p.stage IN ('posted', 'deposited')
    UNION ALL
    SELECT u.amount_cents FROM ledger_entry p JOIN ledger_entry a ON a.evidence_id = p.id AND a.stage = 'adjusted' JOIN ledger_entry u ON u.evidence_id = a.id AND u.stage = 'reversed'
     WHERE p.evidence_id = row_id AND p.stage IN ('posted', 'deposited')
  ) x;
  IF row_amount IS NULL OR so_far + NEW.amount_cents > row_amount THEN
    RAISE EXCEPTION 'the posted or deposited entries of a posting or EFT row never sum past the row''s amount' USING ERRCODE = 'check_violation';
  END IF;
  IF so_far + NEW.amount_cents < 0 THEN
    RAISE EXCEPTION 'the posted or deposited entries of a posting or EFT row, their corrections included, never net below zero' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage = 'posted' THEN
    SELECT m.level, p.procedure_code, p.service_date INTO line_row FROM ledger_match m JOIN posting_row p ON p.id = m.posting_row_id WHERE m.id = NEW.match_id;
    IF line_row.level = 'claim' AND line_row.procedure_code IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.procedure_code = line_row.procedure_code AND (line_row.service_date IS NULL OR l.service_date = line_row.service_date)) THEN
      RAISE EXCEPTION 'a line-level posting posts only the lines of its row''s code and date of service' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- A line's net in one counted stage: its entries of that stage, and the reversals and adjustments of
-- them (a reversal of an adjustment counted toward the stage the adjustment corrects), as
-- ledger_line_stage counts them.
CREATE FUNCTION ledger_line_net(line uuid, counted text) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(sum(e.amount_cents), 0)::bigint
    FROM ledger_entry e
    LEFT JOIN ledger_entry t ON e.stage IN ('reversed', 'adjusted') AND t.id = e.evidence_id
    LEFT JOIN ledger_entry r ON t.stage = 'adjusted' AND r.id = t.evidence_id
   WHERE e.service_line_id = line
     AND CASE WHEN e.stage IN ('reversed', 'adjusted') THEN CASE WHEN t.stage = 'adjusted' THEN r.stage ELSE t.stage END ELSE e.stage END = counted
$$;

-- What an entry may do to its line and its entry (PRD 13: "recovered is a derived total, never a typed
-- number"; rule 1): a line's posted, and its deposited, stay at or below what was approved for it,
-- corrections included; and an adjustment keeps the net of the entry it corrects (the entry, its
-- corrections and the reversals of those) between zero and the entry's evidence: the row's amount for a
-- posted or deposited entry, the entry's own amount for an approval, a recoupment or interest. Runs after
-- ledger_entry_rules and ledger_entry_within_evidence (triggers fire in name order), which have checked
-- the entry's stage, its evidence and its row.
CREATE FUNCTION ledger_entry_within_line() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target ledger_entry;
  root ledger_entry;
  counted text;
  approved bigint;
  posted bigint;
  deposited bigint;
  entry_net bigint;
  bound bigint;
BEGIN
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  counted := NEW.stage;
  IF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO target FROM ledger_entry t WHERE t.id = NEW.evidence_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    root := target;
    IF target.stage = 'adjusted' THEN
      SELECT * INTO root FROM ledger_entry t WHERE t.id = target.evidence_id;
    END IF;
    counted := root.stage;
  END IF;
  IF NEW.service_line_id IS NOT NULL AND counted IN ('approved', 'posted', 'deposited') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ledger_line:' || NEW.service_line_id::text, 0));
    approved := ledger_line_net(NEW.service_line_id, 'approved') + CASE WHEN counted = 'approved' THEN NEW.amount_cents ELSE 0 END;
    posted := ledger_line_net(NEW.service_line_id, 'posted') + CASE WHEN counted = 'posted' THEN NEW.amount_cents ELSE 0 END;
    deposited := ledger_line_net(NEW.service_line_id, 'deposited') + CASE WHEN counted = 'deposited' THEN NEW.amount_cents ELSE 0 END;
    IF (counted <> 'approved' OR NEW.amount_cents < 0) AND (posted > approved OR deposited > approved) THEN
      RAISE EXCEPTION 'a line''s posted and deposited never exceed what was approved for it' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.stage = 'adjusted' THEN
    SELECT target.amount_cents + coalesce(sum(c.amount_cents), 0) + NEW.amount_cents INTO entry_net
      FROM (SELECT c.amount_cents FROM ledger_entry c WHERE c.evidence_id = target.id AND c.stage IN ('reversed', 'adjusted')
            UNION ALL
            SELECT u.amount_cents FROM ledger_entry a JOIN ledger_entry u ON u.evidence_id = a.id AND u.stage = 'reversed' WHERE a.evidence_id = target.id AND a.stage = 'adjusted') c;
    IF target.stage IN ('posted', 'deposited') THEN
      SELECT coalesce((SELECT p.amount_cents FROM posting_row p WHERE p.id = target.evidence_id), (SELECT e.amount_cents FROM eft_row e WHERE e.id = target.evidence_id)) INTO bound;
    ELSE
      bound := target.amount_cents;
    END IF;
    IF bound IS NULL OR entry_net < least(0, bound) OR entry_net > greatest(0, bound) THEN
      RAISE EXCEPTION 'an adjustment keeps its entry between zero and what the entry''s evidence shows' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entry_within_line BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_line();

-- As before (20261022090000_review_guards_visit_shortfalls_and_practice_settings.sql), and the
-- specialist's adjustment: a person who holds ledger.adjust writes, in their own name, the moves the
-- ledger makes (forward to payer approved or recovered, which line_status_ledger_rules checks against
-- the entries, or back to exactly where the entries now leave the line), never any other event.
DROP POLICY line_status_set_by_case_workers ON line_status;
CREATE POLICY line_status_set_by_case_workers ON line_status AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (
    CASE WHEN (SELECT app_actor_is_person())
      THEN set_by IS NOT DISTINCT FROM app_actor_id() AND (
        coalesce(app_actor_permitted(practice_id, 'case.work'), false)
        OR (coalesce(app_actor_permitted(practice_id, 'ledger.adjust'), false)
            AND (stage IN ('payer_approved', 'recovered')
                 OR (reopened_from IN ('payer_approved', 'recovered') AND stage = coalesce(ledger_line_stage(service_line_id), 'actionable')))))
      ELSE set_by IS NULL
    END
  );

-- ---------------------------------------------------------------------------------------------------
-- Encrypted free text
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE ledger_match ADD CONSTRAINT ledger_match_reversal_reason_encrypted CHECK (reversal_reason ~ '^enc:v1:[A-Za-z0-9_-]+$');
ALTER TABLE ledger_entry ADD CONSTRAINT ledger_entry_reason_encrypted CHECK (reason ~ '^enc:v1:[A-Za-z0-9_-]+$');
ALTER TABLE line_status ADD CONSTRAINT line_status_reason_encrypted CHECK (reason ~ '^enc:v1:[A-Za-z0-9_-]+$');
ALTER TABLE case_line ADD CONSTRAINT case_line_written_off_text_encrypted CHECK (written_off_text ~ '^enc:v1:[A-Za-z0-9_-]+$');
ALTER TABLE case_line ADD CONSTRAINT case_line_reopen_reason_encrypted CHECK (reopen_reason ~ '^enc:v1:[A-Za-z0-9_-]+$');

-- ---------------------------------------------------------------------------------------------------
-- Packets
-- ---------------------------------------------------------------------------------------------------

-- The verifier's report: tp-packet-verifier/1 as before, or /2 with its three new codes (codes and
-- positions only, never the narrative's text).
CREATE OR REPLACE FUNCTION packet_verifier_report_valid(report jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  item jsonb;
BEGIN
  IF jsonb_typeof(report) IS DISTINCT FROM 'object' OR coalesce(report ->> 'format', '') NOT IN ('tp-packet-verifier/1', 'tp-packet-verifier/2')
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(report) k) IS DISTINCT FROM ARRAY['checked', 'format', 'mismatches', 'narrative_sha256', 'passed', 'sentences']
     OR jsonb_typeof(report -> 'passed') IS DISTINCT FROM 'boolean' OR coalesce(report ->> 'narrative_sha256', '') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(report -> 'sentences') IS DISTINCT FROM 'number' OR jsonb_typeof(report -> 'checked') IS DISTINCT FROM 'number'
     OR jsonb_typeof(report -> 'mismatches') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(report -> 'mismatches') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item) k) IS DISTINCT FROM ARRAY['code', 'end', 'kind', 'sentence', 'start']
       OR (coalesce(item ->> 'code', '') NOT IN ('figure_not_in_input', 'sentence_without_citation', 'unknown_citation', 'unknown_placeholder', 'empty_narrative')
           AND NOT (report ->> 'format' = 'tp-packet-verifier/2' AND item ->> 'code' IN ('hidden_character', 'unreadable_figure', 'identifier_in_narrative')))
       OR NOT (item -> 'kind' = 'null'::jsonb OR item ->> 'kind' IN ('amount', 'percent', 'date', 'month', 'month_day', 'code', 'modifier', 'number', 'identifier', 'placeholder', 'citation'))
       OR jsonb_typeof(item -> 'sentence') IS DISTINCT FROM 'number' OR jsonb_typeof(item -> 'start') IS DISTINCT FROM 'number' OR jsonb_typeof(item -> 'end') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN (report ->> 'passed')::boolean = (jsonb_array_length(report -> 'mismatches') = 0);
END;
$$;

-- A version is approved only with the current verifier's report (tp-packet-verifier/2), whose result the
-- approval CHECK already requires to be a pass: a version an earlier verifier passed is written again.
-- Runs before packet_version_rules (triggers fire in name order).
CREATE FUNCTION packet_version_current_verifier() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL AND NEW.verifier_report ->> 'format' IS DISTINCT FROM 'tp-packet-verifier/2' THEN
    RAISE EXCEPTION 'a packet version is approved only once the current verifier has passed it; write the version again' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER packet_version_current_verifier BEFORE UPDATE ON packet_version FOR EACH ROW EXECUTE FUNCTION packet_version_current_verifier();

-- An export's PDF and CSV lie under the version's own practice and packet (as roi_statement's and
-- report_document's keys do under their own), so the record of where the line-level files are never
-- names another tenant's, or another packet's, key space.
ALTER TABLE packet_version ADD CONSTRAINT packet_version_export_keys_its_own CHECK (
  (export_pdf_key IS NULL OR starts_with(export_pdf_key, 'practices/' || practice_id::text || '/packets/' || packet_id::text || '/'))
  AND (export_csv_key IS NULL OR starts_with(export_csv_key, 'practices/' || practice_id::text || '/packets/' || packet_id::text || '/'))
);

-- As before (20261023090000_packets_submissions_and_responses.sql), and of the packet's current version,
-- or of one an edit replaced only when it was sent before the edit.
CREATE OR REPLACE FUNCTION submission_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version record;
  previous record;
  answer_kind text;
  answer_reopens boolean;
  answer_window date;
BEGIN
  IF NOT app_actor_is_person() OR NEW.submitted_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'submission.log'), false) THEN
    RAISE EXCEPTION 'a submission is logged by a person who logs submissions, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('submission:' || NEW.case_id::text, 0));
  SELECT v.export_sha256, v.export_csv_sha256, v.exported_at, v.dispute_level, v.packet_id, v.version_no, p.current_version_id INTO version
    FROM packet_version v JOIN packet p ON p.id = v.packet_id
   WHERE v.id = NEW.packet_version_id AND p.case_id = NEW.case_id AND v.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a submission is of a version of its case''s packet' USING ERRCODE = 'check_violation';
  END IF;
  IF version.exported_at IS NULL THEN
    RAISE EXCEPTION 'a packet is submitted once it is exported' USING ERRCODE = 'check_violation';
  END IF;
  -- The current version, or one an edit replaced only when it was sent before the edit (the day before
  -- the next version was written, UTC): an edit clears the approval, so what was not sent is never logged.
  IF version.current_version_id IS DISTINCT FROM NEW.packet_version_id AND NOT EXISTS (
       SELECT 1 FROM packet_version n
        WHERE n.packet_id = version.packet_id AND n.version_no = version.version_no + 1 AND NEW.submitted_on < (n.created_at AT TIME ZONE 'UTC')::date) THEN
    RAISE EXCEPTION 'a submission sends the packet''s current version; one an edit replaced is logged only when it was sent before the edit' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.export_sha256, NEW.export_csv_sha256) IS DISTINCT FROM (version.export_sha256, version.export_csv_sha256) THEN
    RAISE EXCEPTION 'a submission carries the SHA-256 of the export it sent' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.submitted_on < (version.exported_at AT TIME ZONE 'UTC')::date OR NEW.submitted_on > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'a submission is dated from its export to today' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.state = 'closed_written_off') THEN
    RAISE EXCEPTION 'a case closed written off takes no submission' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.dispute_level IS DISTINCT FROM version.dispute_level THEN
    RAISE EXCEPTION 'a submission sends a version of the case''s dispute level' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.id, s.submitted_on INTO previous
    FROM submission s WHERE s.case_id = NEW.case_id AND s.id <> NEW.id ORDER BY s.submitted_on DESC, s.created_at DESC, s.id DESC LIMIT 1;
  IF FOUND THEN
    IF NEW.submitted_on < previous.submitted_on THEN
      RAISE EXCEPTION 'a submission is dated on or after the case''s last one' USING ERRCODE = 'check_violation';
    END IF;
    SELECT r.kind, r.reopens_case, r.next_window_ends_on INTO answer_kind, answer_reopens, answer_window FROM payer_response r WHERE r.id = submission_latest_response(previous.id);
    IF answer_kind IS NOT NULL AND NOT (answer_kind = 'info_requested' OR answer_reopens) THEN
      RAISE EXCEPTION 'the payer has answered this dispute; only a denial that reopens the case starts the next level' USING ERRCODE = 'check_violation';
    END IF;
    IF answer_reopens AND NEW.submitted_on > answer_window THEN
      RAISE EXCEPTION 'the next dispute level is submitted within its window' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Follow-up reminders
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE notification DROP CONSTRAINT notification_kind_check;
-- follow_up: a submission's follow-up date has come with no response from the payer (subject: the submission).
ALTER TABLE notification ADD CONSTRAINT notification_kind_check CHECK (kind IN ('monitoring_run', 'digest', 'recoupment', 'follow_up'));

-- As before (20261023120000_recovery_ledger.sql), with the follow-up reminder's figure: the days since the
-- submission.
CREATE OR REPLACE FUNCTION monitoring_figure_codes(leaf text) RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE leaf
    WHEN 'count' THEN ARRAY[
      'lines', 'priced_lines', 'unpriced_lines', 'validated_lines', 'flagged_lines', 'cases',
      'validated_payers', 'validated_lines_by_payer', 'cases_nearing_deadline', 'recoveries_posted',
      'coverage_lines', 'coverage_priced_lines', 'previous_coverage_lines', 'previous_coverage_priced_lines', 'contracts_expiring',
      'recouped_lines', 'days_waiting']
    WHEN 'cents' THEN ARRAY[
      'billed', 'priced_billed', 'validated_variance', 'validated_variance_by_payer', 'cases_nearing_deadline_actionable', 'recovered',
      'coverage_billed', 'coverage_priced_billed', 'previous_coverage_billed', 'previous_coverage_priced_billed',
      'recouped']
    ELSE ARRAY[]::text[]
  END
$$;

-- ---------------------------------------------------------------------------------------------------
-- The specialist queue
-- ---------------------------------------------------------------------------------------------------

-- As before (20261016200000_contract_questions_and_queue.sql), with the regulations to confirm: the
-- current, unapproved packet versions of each practice that cite the Medicare Advantage regulation and
-- wait for a contract specialist's confirmation (counts only).
DROP FUNCTION console_contract_queue();
CREATE FUNCTION console_contract_queue() RETURNS TABLE (
  practice_id uuid, name text, documents_awaiting bigint, drafts bigint, proposals_awaiting bigint, awaiting_sign_off bigint,
  open_questions bigint, regulations_awaiting bigint, support_grant_ends_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  callers_scope text := current_setting('app.practice_ids', true);
BEGIN
  IF NOT (coalesce(app_actor_platform_permitted('contract.review'), false) OR coalesce(app_actor_platform_permitted('support_grant.create'), false)) THEN
    RETURN;
  END IF;
  -- Every active practice in scope for the one query below; the caller's scope is put back after it.
  PERFORM set_config('app.practice_ids', (SELECT '{' || coalesce(string_agg(p.id::text, ','), '') || '}' FROM practice p WHERE p.status = 'active'), true);
  RETURN QUERY
    SELECT p.id, p.name,
           (SELECT count(*) FROM source_document d
             WHERE d.practice_id = p.id AND d.kind IN ('contract', 'exhibit', 'payer_letter') AND d.scan_status = 'clean' AND d.status = 'stored'
               AND NOT EXISTS (SELECT 1 FROM contract_version v
                                WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids) AND v.status IN ('approved', 'signed_off', 'superseded'))),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'draft'),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'proposed'),
           (SELECT count(*) FROM contract_version v WHERE v.practice_id = p.id AND v.status = 'approved'),
           (SELECT count(*) FROM contract_question q WHERE q.practice_id = p.id AND q.status = 'open'),
           (SELECT count(*) FROM packet_version v JOIN packet k ON k.current_version_id = v.id
             WHERE v.practice_id = p.id AND v.content -> 'citation' ->> 'kind' = 'regulation' AND v.regulation_confirmed_by IS NULL AND v.approved_by IS NULL),
           (SELECT max(least(s.expires_at, s.created_at + interval '4 hours')) FROM support_grant s
             WHERE s.practice_id = p.id AND s.user_id = app_actor_id()
               AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours')
      FROM practice p
     WHERE p.status = 'active'
     ORDER BY p.name, p.id;
  PERFORM set_config('app.practice_ids', coalesce(callers_scope, '{}'), true);
END;
$$;

REVOKE ALL ON FUNCTION ledger_line_net(uuid, text), ledger_entry_within_line(), packet_version_current_verifier(), console_contract_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger_line_net(uuid, text), console_contract_queue() TO tp_app;
