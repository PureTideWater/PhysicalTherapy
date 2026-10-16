-- The recovery ledger's review (PRD 13 in full; CLAUDE.md: "Check in the handler and in Postgres",
-- "Count anything as recovered without a ledger_entry at stage posted or deposited", rule 1; test matrix
-- LED-04, LED-07, LED-09; docs/adr/0042 and 0046). Every rule holds for every role:
--
-- - posting_row and eft_row: a row of an export is read from its export by the reconcile job, never
--   written by a person; from an export of its own kind (a posting row of a posting export, an EFT row of
--   an EFT export) that intake stored with a clean malware scan (a zip entry only when its zip is clean
--   too), and not yet loaded. These rows are the evidence of recovery, so nobody in scope can make one up.
-- - ledger_entry: the posted (or deposited) entries of one posting row (or EFT row), their corrections
--   included, never sum past the row's amount; a posted entry of a line-level posting (a row with a
--   procedure code) is of a line of that code and, when the row has one, that date of service; a reversal
--   may offset an adjustment exactly (so a reversed match nets its adjustments to zero, LED-07); and a
--   correction is of an entry whose match stands (a reversed match's entries are never corrected again).
-- - ledger_line_stage: a reversal of an adjustment counts toward the stage the adjustment corrects.
-- - payer_response: an acceptance accepts at most what its submission asked (the version's lines'
--   variance and its interest line), so a slip in the dollars field never approves more than was asked.
--
-- Runs as tp_owner. Safe with the previous image running: functions replaced, two triggers and an index
-- added; the previous image writes export rows only from its reconcile job, from stored clean exports of
-- their kind, and never posts past a row, so every write it makes keeps these rules.

-- ---------------------------------------------------------------------------------------------------
-- Export rows
-- ---------------------------------------------------------------------------------------------------

-- As before (20261023120000_recovery_ledger.sql: a row of an export of its practice), and: written by a
-- practice job (the reconcile job's export load), never in a person's name; of a document of the
-- table's kind, stored (not yet loaded) with a clean malware scan, whose zip, for a zip entry, is clean.
CREATE OR REPLACE FUNCTION ledger_export_row_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
$$;

-- ---------------------------------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------------------------------

-- Corrections and the evidence sums below look entries up by what they name.
CREATE INDEX ledger_entry_by_evidence ON ledger_entry (evidence_id);

-- As before (20261023120000_recovery_ledger.sql), with two changes to corrections: a reversal may name
-- an adjustment (it offsets it exactly), and a correction is of an entry whose match still stands.
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
    IF NEW.created_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
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

-- What a posting or EFT row proves is at most its own amount (PRD 13, Matching steps 2 and 3, tolerance
-- zero; "Nothing unmatched counts"): its posted (or deposited) entries, their reversals and adjustments
-- (and the reversals of those) included, never sum past the row's amount, whichever lines they post and
-- whoever writes them. And a line-level posting (a claim-level match of a row with a procedure code)
-- posts only a line of that code and, when the row has one, that date of service (PRD 13, Matching step
-- 2: "partial postings are matched line by line where the export has lines"). Runs after
-- ledger_entry_rules (triggers fire in name order), which has checked the entry's match and evidence.
CREATE FUNCTION ledger_entry_within_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
CREATE TRIGGER ledger_entry_within_evidence BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_evidence();

-- As before (20261023120000_recovery_ledger.sql), with a reversal of an adjustment counted toward the
-- stage the adjustment corrects (@tp/ledger correctedEntry).
CREATE OR REPLACE FUNCTION ledger_line_stage(line uuid) RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  WITH proof AS (
    SELECT ledger_proof_level(l.practice_id) AS level FROM service_line l WHERE l.id = line
  ), counted AS (
    SELECT e.seq, e.amount_cents,
           CASE WHEN e.stage IN ('reversed', 'adjusted') THEN CASE WHEN t.stage = 'adjusted' THEN r.stage ELSE t.stage END ELSE e.stage END AS stage,
           e.stage NOT IN ('reversed', 'adjusted') AND NOT EXISTS (SELECT 1 FROM ledger_entry u WHERE u.stage = 'reversed' AND u.evidence_id = e.id) AS standing
      FROM ledger_entry e
      LEFT JOIN ledger_entry t ON e.stage IN ('reversed', 'adjusted') AND t.id = e.evidence_id
      LEFT JOIN ledger_entry r ON t.stage = 'adjusted' AND r.id = t.evidence_id
     WHERE e.service_line_id = line
  ), totals AS (
    SELECT coalesce(sum(c.amount_cents) FILTER (WHERE c.stage = 'approved'), 0) AS approved,
           coalesce(sum(c.amount_cents) FILTER (WHERE c.stage = p.level), 0) AS proved,
           coalesce(max(c.seq) FILTER (WHERE c.stage = 'approved' AND c.standing), -1) AS last_approval,
           coalesce(max(c.seq) FILTER (WHERE c.stage = p.level AND c.standing), -1) AS last_proof,
           coalesce(max(c.seq) FILTER (WHERE c.stage = 'recouped' AND c.standing), -1) AS last_recoupment
      FROM proof p LEFT JOIN counted c ON true
  )
  SELECT CASE
           WHEN t.approved <= 0 OR t.last_recoupment > t.last_approval THEN NULL
           WHEN t.proved >= t.approved AND t.last_proof > t.last_recoupment THEN 'recovered'
           ELSE 'payer_approved'
         END
    FROM totals t
$$;

-- ---------------------------------------------------------------------------------------------------
-- Payer responses
-- ---------------------------------------------------------------------------------------------------

-- An acceptance (accepted or partial) accepts at most what its submission's packet version asked: the
-- variance of its lines and its prompt-pay interest line (PRD 12, The packet and What a customer sees as
-- the headline; CLAUDE.md rule 1). A submission outside the practice is payer_response_belongs' refusal.
CREATE FUNCTION payer_response_within_asked() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  asked bigint;
BEGIN
  IF NEW.kind NOT IN ('accepted', 'partial') OR NEW.amount_cents IS NULL OR NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  SELECT coalesce((SELECT sum((l ->> 'variance_cents')::bigint) FROM jsonb_array_elements(v.content -> 'lines') l), 0)
         + coalesce((v.content -> 'interest' ->> 'total_cents')::bigint, 0)
    INTO asked
    FROM submission s JOIN packet_version v ON v.id = s.packet_version_id
   WHERE s.id = NEW.submission_id AND s.practice_id = NEW.practice_id;
  IF FOUND AND NEW.amount_cents > asked THEN
    RAISE EXCEPTION 'a payer response accepts at most what its submission asked: the lines'' variance and the interest line' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payer_response_within_asked BEFORE INSERT ON payer_response FOR EACH ROW EXECUTE FUNCTION payer_response_within_asked();

REVOKE ALL ON FUNCTION ledger_entry_within_evidence(), payer_response_within_asked() FROM PUBLIC;
