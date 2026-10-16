-- The recovery ledger and reconciliation (PRD 1: "nothing is called recovered until the money has
-- posted"; PRD 5, J10 and J11; PRD 6, Recovery ledger and reconciliation; PRD 8, ledger_entry,
-- posting_row, eft_row and The status machine; PRD 13 in full; PRD 20, Proof level and Posting-export
-- templates; Data dictionary, Ledger and reconciliation and practice.settings; test matrix LED-02 to
-- LED-11; docs/adr/0042).
--
-- Five PHI tables, each with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - posting_row: a row of the practice's payment-posting export, read with the practice's template:
--   check or trace number, posting date, amount, the claim reference (encrypted with the practice's
--   key) and, where the export has lines, the code and service date. Stored once per fingerprint (a
--   keyed hash of the row and its occurrence in its export), so a row repeated in a later export, or
--   the same export again, is stored and matched once (LED-08). Never changed, never deleted.
-- - eft_row: a row of the EFT or bank export: trace number, deposit date, amount, the batch it was
--   deposited in. Stored once per fingerprint. Never changed, never deleted.
-- - ledger_match: what the reconcile step (or a person) matched: a remittance's claim to a case line
--   (step 1), a posting row to a remittance (step 2, at the claim or the check level, allocated when a
--   check posted in part), an EFT row to a remittance (step 3, alone or in a batch), a PLB WO or a
--   reversing claim against a case line (a recoupment), a PLB L6 or a claim's interest against a case
--   line. A person's match records the person (step 4). One standing match per piece of evidence; a
--   match is reversed once, by a person, with a reason, never changed otherwise and never deleted.
-- - ledger_entry: signed and append-only. Stages approved, posted, deposited, recouped, reversed,
--   adjusted and interest, each with its evidence (a claim, a payer response, a posting row, an EFT row,
--   a provider adjustment, or for a reversal or an adjustment the entry it corrects) and its sign; the
--   allocated flag; created by a person (manual work, in their own name, with the reconciliation
--   permission) or the system (the reconcile job, no one's name); a reason for a correction. A posted
--   or deposited entry exists only from a standing match of its posting or EFT row, so nothing counts as
--   recovered without one. Every role is refused an UPDATE, a DELETE and a TRUNCATE (LED-10):
--   corrections are new entries.
-- - roi_statement: a generated ROI statement and the entries each figure sums; its recovered and
--   interest figures are checked against those entries when it is written. Written once.
--
-- And, beside them:
--
-- - claim.interest_cents: AMT I, the interest a payer paid on a claim, which the loader stores from here
--   on (PRD 13: "a line-level interest amount ... recorded as its own positive entry category").
-- - practice.settings: proof_level is "posted" or "deposited" when set, and posting_export_template an
--   object (@tp/ledger settings.ts reads them; PRD 20).
-- - ledger_line_stage(line): the stage a line's entries put it at (@tp/ledger lineLedgerStage).
-- - line_status: payer approved and recovered are set from the ledger only, where the line's entries
--   hold the line there, whoever writes the event (the flagged-as-recovered shortcut is refused); the
--   ledger moves a line back, with a negative entry behind it: to actionable on a recoupment (the
--   status machine's one way back, which reopens its case), to payer approved when a proof is reversed.
-- - case_rules: a case with a line moved back from payer approved or recovered, and none still
--   resolved, is awaiting_response again, whatever the payer answered (the recoupment's reopen).
-- - notification kind recoupment, and the figure codes recouped_lines and recouped: a recoupment tells
--   the case's owner (PRD 13, Recoupments and reversals).
--
-- Runs as tp_owner. Safe with the previous image running: new tables, functions and a nullable column;
-- the previous image never sets payer approved or recovered (refused before) and writes no setting the
-- new constraint refuses.

-- ---------------------------------------------------------------------------------------------------
-- Beside the ledger
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE claim ADD COLUMN interest_cents bigint;
GRANT INSERT (interest_cents) ON claim TO tp_app;

ALTER TABLE practice ADD CONSTRAINT practice_ledger_settings CHECK (
  (NOT settings ? 'proof_level' OR settings ->> 'proof_level' IN ('posted', 'deposited'))
  AND (NOT settings ? 'posting_export_template' OR jsonb_typeof(settings -> 'posting_export_template') = 'object')
);

-- The stage that proves recovery for a practice (PRD 20: posted unless the practice says deposited).
CREATE FUNCTION ledger_proof_level(target_practice uuid) RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN p.settings ->> 'proof_level' = 'deposited' THEN 'deposited' ELSE 'posted' END FROM practice p WHERE p.id = target_practice
$$;

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE posting_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- The posting export it came from (a posting_export document).
  source_document_id uuid NOT NULL REFERENCES source_document (id),
  -- Its place among the export's data rows, from 1.
  row_no integer NOT NULL CHECK (row_no >= 1),
  check_or_trace text NOT NULL CHECK (btrim(check_or_trace) <> '' AND char_length(check_or_trace) <= 64),
  posted_on date NOT NULL,
  -- Signed: an export can post a take-back.
  amount_cents bigint NOT NULL,
  -- The practice's claim reference (a patient control number), encrypted with the practice's key (enc).
  claim_reference text CHECK (claim_reference ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  procedure_code text CHECK (procedure_code ~ '^[A-Za-z0-9]{1,20}$'),
  service_date date,
  payer_name text CHECK (char_length(payer_name) BETWEEN 1 AND 200),
  batch text CHECK (char_length(batch) BETWEEN 1 AND 100),
  -- The template's mapped cells by field; the claim reference is never here (it is above, encrypted).
  raw jsonb NOT NULL CHECK (jsonb_typeof(raw) = 'object' AND NOT raw ? 'claim_reference'),
  -- The template that read it: a built-in template's ID, or practice.
  template text NOT NULL CHECK (template ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- The keyed hash of the row and its occurrence in its export.
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posting_row_once UNIQUE (practice_id, fingerprint),
  CONSTRAINT posting_row_position UNIQUE (source_document_id, row_no)
);
CREATE INDEX posting_row_by_check ON posting_row (practice_id, check_or_trace);

CREATE TABLE eft_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  source_document_id uuid NOT NULL REFERENCES source_document (id),
  row_no integer NOT NULL CHECK (row_no >= 1),
  trace text NOT NULL CHECK (btrim(trace) <> '' AND char_length(trace) <= 64),
  deposited_on date NOT NULL,
  amount_cents bigint NOT NULL,
  -- Set when the bank batched several EFTs into one deposit.
  batch_reference text CHECK (char_length(batch_reference) BETWEEN 1 AND 100),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eft_row_once UNIQUE (practice_id, fingerprint),
  CONSTRAINT eft_row_position UNIQUE (source_document_id, row_no)
);
CREATE INDEX eft_row_by_trace ON eft_row (practice_id, trace);

CREATE TABLE ledger_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- claim: a remittance's claim to a case line; posting: a posting row to a remittance; deposit: an EFT
  -- row to a remittance; recoupment: a PLB WO or a reversing claim against a case line; interest: a PLB
  -- L6 or a claim's interest against a case line.
  kind text NOT NULL CHECK (kind IN ('claim', 'posting', 'deposit', 'recoupment', 'interest')),
  claim_id uuid REFERENCES claim (id),
  posting_row_id uuid REFERENCES posting_row (id),
  eft_row_id uuid REFERENCES eft_row (id),
  provider_adjustment_id uuid REFERENCES provider_adjustment (id),
  -- The remittance matched: the posting's or the deposit's, or the claim's or adjustment's own.
  remittance_id uuid NOT NULL REFERENCES remittance (id),
  -- The case line's service line (claim, recoupment and interest matches).
  service_line_id uuid REFERENCES service_line (id),
  -- How a claim compared with the case line: approved (higher), decreased (lower, taking back an
  -- approval) or no_change (the same, or lower with nothing approved).
  outcome text CHECK (outcome IN ('approved', 'decreased', 'no_change')),
  -- claim: a line-level posting row's claim; check: the whole check or part of it; batch: a deposit the
  -- bank batched with others.
  level text CHECK (level IN ('claim', 'check', 'batch')),
  -- A check-level posting of part of the check, or interest split across lines: shares pro rata.
  allocated boolean NOT NULL DEFAULT false,
  -- The person who matched it by hand; null for the reconcile job.
  matched_by uuid REFERENCES "user" (id),
  matched_at timestamptz NOT NULL DEFAULT now(),
  reversed_by uuid REFERENCES "user" (id),
  reversed_at timestamptz,
  -- Why: the person's words, encrypted with the practice's key (enc).
  reversal_reason text CHECK (btrim(reversal_reason) <> '' AND char_length(reversal_reason) <= 8000),
  evidence_id uuid NOT NULL GENERATED ALWAYS AS (coalesce(posting_row_id, eft_row_id, provider_adjustment_id, claim_id)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_match_evidence CHECK (
    CASE kind
      WHEN 'claim' THEN claim_id IS NOT NULL AND num_nonnulls(posting_row_id, eft_row_id, provider_adjustment_id, level) = 0 AND service_line_id IS NOT NULL AND outcome IS NOT NULL
      WHEN 'posting' THEN posting_row_id IS NOT NULL AND num_nonnulls(eft_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND level IN ('claim', 'check')
        AND (claim_id IS NOT NULL) = (level = 'claim')
      WHEN 'deposit' THEN eft_row_id IS NOT NULL AND num_nonnulls(claim_id, posting_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND level IN ('check', 'batch')
      ELSE num_nonnulls(claim_id, provider_adjustment_id) = 1 AND num_nonnulls(posting_row_id, eft_row_id, outcome, level) = 0 AND service_line_id IS NOT NULL
    END
  ),
  CONSTRAINT ledger_match_allocated CHECK (NOT allocated OR (kind = 'posting' AND level = 'check') OR kind = 'interest'),
  CONSTRAINT ledger_match_reversed_together CHECK ((reversed_at IS NULL) = (reversed_by IS NULL) AND (reversed_at IS NULL) = (reversal_reason IS NULL))
);
CREATE INDEX ledger_match_by_remittance ON ledger_match (practice_id, remittance_id);
CREATE INDEX ledger_match_by_line ON ledger_match (practice_id, service_line_id) WHERE service_line_id IS NOT NULL;
-- One standing match per piece of evidence (and case line): a repeated reconcile matches nothing twice.
CREATE UNIQUE INDEX ledger_match_standing ON ledger_match (kind, evidence_id, service_line_id) NULLS NOT DISTINCT WHERE reversed_at IS NULL;

CREATE TABLE ledger_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- The ledger's order.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  case_id uuid NOT NULL REFERENCES "case" (id),
  -- The case line's service line; null for an amount a payer response accepts for the case as a whole.
  service_line_id uuid REFERENCES service_line (id),
  stage text NOT NULL CHECK (stage IN ('approved', 'posted', 'deposited', 'recouped', 'reversed', 'adjusted', 'interest')),
  -- Signed integer cents.
  amount_cents bigint NOT NULL,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('claim', 'payer_response', 'posting_row', 'eft_row', 'provider_adjustment', 'ledger_entry')),
  evidence_id uuid NOT NULL,
  -- The match that created it (every entry but a payer response's approval).
  match_id uuid REFERENCES ledger_match (id),
  allocated boolean NOT NULL DEFAULT false,
  -- The date the money moved, from the evidence (a correction's is its entry's).
  effective_on date NOT NULL,
  -- The person; null for the system (the reconcile job).
  created_by uuid REFERENCES "user" (id),
  -- Why a reversal or adjustment was made: the person's words, encrypted with the practice's key (enc).
  reason text CHECK (btrim(reason) <> '' AND char_length(reason) <= 8000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entry_evidence_of_stage CHECK (
    CASE stage
      WHEN 'approved' THEN evidence_kind IN ('claim', 'payer_response')
      WHEN 'posted' THEN evidence_kind = 'posting_row'
      WHEN 'deposited' THEN evidence_kind = 'eft_row'
      WHEN 'recouped' THEN evidence_kind IN ('provider_adjustment', 'claim')
      WHEN 'interest' THEN evidence_kind IN ('provider_adjustment', 'claim')
      ELSE evidence_kind = 'ledger_entry'
    END
  ),
  CONSTRAINT ledger_entry_sign CHECK (
    CASE stage
      WHEN 'recouped' THEN amount_cents < 0
      WHEN 'reversed' THEN amount_cents <> 0
      WHEN 'adjusted' THEN amount_cents <> 0
      ELSE amount_cents > 0
    END
  ),
  CONSTRAINT ledger_entry_allocated CHECK (NOT allocated OR stage IN ('approved', 'posted', 'deposited', 'interest')),
  CONSTRAINT ledger_entry_correction_says_why CHECK ((stage IN ('reversed', 'adjusted')) = (reason IS NOT NULL)),
  CONSTRAINT ledger_entry_matched CHECK (match_id IS NOT NULL OR evidence_kind IN ('payer_response', 'ledger_entry'))
);
CREATE INDEX ledger_entry_by_case ON ledger_entry (practice_id, case_id, stage);
CREATE INDEX ledger_entry_by_line ON ledger_entry (practice_id, service_line_id, seq);
CREATE INDEX ledger_entry_by_date ON ledger_entry (practice_id, effective_on);
-- An entry is reversed once.
CREATE UNIQUE INDEX ledger_entry_reversed_once ON ledger_entry (evidence_id) WHERE stage = 'reversed';
-- A payer response approves a line once.
CREATE UNIQUE INDEX ledger_entry_response_once ON ledger_entry (evidence_id, service_line_id) NULLS NOT DISTINCT WHERE evidence_kind = 'payer_response';
-- A match creates one entry per line and stage: a replayed reconcile creates nothing twice (JOB-01).
CREATE UNIQUE INDEX ledger_entry_once_per_match ON ledger_entry (match_id, service_line_id, stage) NULLS NOT DISTINCT WHERE match_id IS NOT NULL AND stage NOT IN ('reversed', 'adjusted');

-- The entries each figure of a statement sums (opaque IDs only): recovered, interest, approved but not
-- posted, and the open cases of actionable.
CREATE FUNCTION roi_links_valid(links jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_typeof(links) = 'object'
     AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k) = ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered']
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$$;

CREATE TABLE roi_statement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  -- The stage recovered is proved by; posted says the practice supplies no deposit data.
  proof_level text NOT NULL CHECK (proof_level IN ('posted', 'deposited')),
  -- Fees paid to the product in the period (billing's: zero until billing is wired, milestone 11).
  fees_cents bigint NOT NULL CHECK (fees_cents >= 0),
  -- Recovered principal in the period, net of recoupments and reversals.
  recovered_cents bigint NOT NULL,
  interest_cents bigint NOT NULL,
  approved_unposted_cents bigint NOT NULL CHECK (approved_unposted_cents >= 0),
  actionable_open_cents bigint NOT NULL CHECK (actionable_open_cents >= 0),
  pursuit_hours numeric(9,2) NOT NULL CHECK (pursuit_hours >= 0),
  links jsonb NOT NULL CONSTRAINT roi_statement_links CHECK (roi_links_valid(links)),
  -- The person who generated it on demand; null for the quarterly statement (the reconcile job).
  generated_by uuid REFERENCES "user" (id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  -- The statement's document (the v1 reports print it); null until then.
  document_key text CHECK (document_key ~ '^practices/[0-9a-f-]{36}/reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roi_statement_period CHECK (period_from <= period_to)
);
CREATE INDEX roi_statement_by_period ON roi_statement (practice_id, period_from DESC, generated_at DESC);
-- One quarterly statement per practice and quarter.
CREATE UNIQUE INDEX roi_statement_quarterly ON roi_statement (practice_id, period_from, period_to) WHERE generated_by IS NULL;

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('posting_row', '20261023120000_recovery_ledger', 'posting_row_tenant'),
  ('eft_row', '20261023120000_recovery_ledger', 'eft_row_tenant'),
  ('ledger_match', '20261023120000_recovery_ledger', 'ledger_match_tenant'),
  ('ledger_entry', '20261023120000_recovery_ledger', 'ledger_entry_tenant'),
  ('roi_statement', '20261023120000_recovery_ledger', 'roi_statement_tenant');

CREATE TRIGGER ledger_match_updated_at BEFORE UPDATE ON ledger_match FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------------
-- Rules. Lookups of other rows run under the caller's policies, and only for a row of a practice in
-- the transaction's scope: any other row is left to the tenant policy, which refuses it. They hold for
-- every role.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION ledger_never_changed() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% rows are never changed or deleted: the ledger is append-only and a correction is a new entry', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

CREATE FUNCTION ledger_no_truncate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: the ledger keeps what it recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

-- A posting or EFT row is stored once, in its export's practice, and never changes.
CREATE FUNCTION ledger_export_row_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'an export row is a row of an export of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER posting_row_belongs BEFORE INSERT ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs();
CREATE TRIGGER eft_row_belongs BEFORE INSERT ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_export_row_belongs();
CREATE TRIGGER posting_row_never_changed BEFORE UPDATE OR DELETE ON posting_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed();
CREATE TRIGGER eft_row_never_changed BEFORE UPDATE OR DELETE ON eft_row FOR EACH ROW EXECUTE FUNCTION ledger_never_changed();

-- A match is recorded standing: by the reconcile job in no one's name, or by a person who reconciles
-- postings in their own name, between evidence and a remittance of its practice, the evidence of its
-- kind. It is reversed once, by a person who reconciles postings, in their own name, with a reason;
-- nothing else about it ever changes, and it is never deleted.
CREATE FUNCTION ledger_match_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a match is never deleted; it is reversed' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.kind, NEW.claim_id, NEW.posting_row_id, NEW.eft_row_id, NEW.provider_adjustment_id, NEW.remittance_id, NEW.service_line_id, NEW.outcome, NEW.level,
        NEW.allocated, NEW.matched_by, NEW.matched_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.kind, OLD.claim_id, OLD.posting_row_id, OLD.eft_row_id, OLD.provider_adjustment_id, OLD.remittance_id, OLD.service_line_id, OLD.outcome, OLD.level,
        OLD.allocated, OLD.matched_by, OLD.matched_at, OLD.created_at) THEN
      RAISE EXCEPTION 'a match never changes; it is reversed' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a match is reversed once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reversal_reason IS NULL OR NEW.reversed_by IS DISTINCT FROM app_actor_id() OR NOT app_actor_is_person()
       OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a match is reversed by a person who reconciles postings, in their own name, with a reason' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reversed_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.reversed_by, NEW.reversed_at, NEW.reversal_reason) IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::text) THEN
    RAISE EXCEPTION 'a match is recorded standing' USING ERRCODE = 'check_violation';
  END IF;
  NEW.matched_at := now();
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.matched_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a person who reconciles postings matches by hand, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.matched_by IS NOT NULL THEN
    RAISE EXCEPTION 'the reconcile job matches in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id AND r.status = 'loaded') THEN
    RAISE EXCEPTION 'a match is to a loaded remittance of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a match is to a service line of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'claim' AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code <> '22') THEN
    RAISE EXCEPTION 'a claim match is of a claim of its remittance, never a reversal' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'posting' AND (NOT EXISTS (SELECT 1 FROM posting_row p WHERE p.id = NEW.posting_row_id AND p.practice_id = NEW.practice_id)
        OR (NEW.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id))) THEN
    RAISE EXCEPTION 'a posting match is of a posting row of its practice, and a line-level one of a claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'deposit' AND NOT EXISTS (SELECT 1 FROM eft_row e WHERE e.id = NEW.eft_row_id AND e.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a deposit match is of an EFT row of its practice' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'recoupment' AND NOT (
          EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'recoupment')
          OR EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code = '22')) THEN
    RAISE EXCEPTION 'a recoupment is a PLB WO or a reversing claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND NOT (
          EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'interest')
          OR EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.interest_cents > 0)) THEN
    RAISE EXCEPTION 'interest is a PLB L6 or a claim''s interest of its remittance' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_match_rules BEFORE INSERT OR UPDATE OR DELETE ON ledger_match FOR EACH ROW EXECUTE FUNCTION ledger_match_rules();

-- An entry is written once and never changes. It is of a case of its practice and, when it names a
-- line, of a line of that case. The reconcile job writes in no one's name; a person (manual matches,
-- reversals, adjustments) in their own, with the reconciliation permission. Every entry but a payer
-- response's approval comes from a standing match whose evidence it carries, of the kind its stage
-- needs, so a posted or deposited entry exists only for a matched posting or EFT row; its date is its
-- evidence's. A reversal offsets its entry exactly and an adjustment corrects one, each by a person with
-- a reason, of the same case, line and match, dated as the entry it corrects.
CREATE FUNCTION ledger_entry_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
    IF NOT FOUND OR target.stage IN ('reversed', 'adjusted') THEN
      RAISE EXCEPTION 'a correction names an entry of a counted stage' USING ERRCODE = 'check_violation';
    END IF;
    IF (target.case_id, target.service_line_id, target.match_id) IS DISTINCT FROM (NEW.case_id, NEW.service_line_id, NEW.match_id) THEN
      RAISE EXCEPTION 'a correction is of its entry''s case, line and match' USING ERRCODE = 'check_violation';
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
CREATE TRIGGER ledger_entry_rules BEFORE INSERT OR UPDATE OR DELETE ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_rules();

-- A statement is written once, in its generator's name (or the quarterly job's, no one's), and its
-- recovered and interest figures are the sums of the entries it links, every one of its practice.
CREATE FUNCTION roi_statement_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  sums record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'an ROI statement keeps its figures; a new one is generated' USING ERRCODE = 'check_violation';
  END IF;
  NEW.generated_at := now();
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.generated_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'an ROI statement is generated on demand by a person who reconciles postings, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.generated_by IS NOT NULL THEN
    RAISE EXCEPTION 'the quarterly statement is generated in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'recovered')) + (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'interest')) AS linked,
         (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x))
           + (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS found,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x)) AS recovered,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS interest
    INTO sums;
  IF sums.linked <> sums.found OR sums.recovered <> NEW.recovered_cents OR sums.interest <> NEW.interest_cents THEN
    RAISE EXCEPTION 'an ROI statement''s recovered and interest are the sums of the entries it links' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER roi_statement_rules BEFORE INSERT OR UPDATE OR DELETE ON roi_statement FOR EACH ROW EXECUTE FUNCTION roi_statement_rules();

CREATE TRIGGER posting_row_no_truncate BEFORE TRUNCATE ON posting_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate();
CREATE TRIGGER eft_row_no_truncate BEFORE TRUNCATE ON eft_row FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate();
CREATE TRIGGER ledger_match_no_truncate BEFORE TRUNCATE ON ledger_match FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate();
CREATE TRIGGER ledger_entry_no_truncate BEFORE TRUNCATE ON ledger_entry FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate();
CREATE TRIGGER roi_statement_no_truncate BEFORE TRUNCATE ON roi_statement FOR EACH STATEMENT EXECUTE FUNCTION ledger_no_truncate();

-- ---------------------------------------------------------------------------------------------------
-- A line's stage from the ledger
-- ---------------------------------------------------------------------------------------------------

-- The stage a line's entries put it at (@tp/ledger lineLedgerStage): null without a standing approval,
-- or when a recoupment came after the latest approval (the line is reopened, back to actionable, with the
-- negative entry behind it: the status machine's one way back); recovered when the practice's proof
-- level's entries cover everything approved for it and its latest proof entry came after any
-- recoupment; payer approved otherwise. A reversal or adjustment counts toward the stage of the entry it
-- corrects, and an entry a reversal undid does not stand. Read under the caller's policies.
CREATE FUNCTION ledger_line_stage(line uuid) RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  WITH proof AS (
    SELECT ledger_proof_level(l.practice_id) AS level FROM service_line l WHERE l.id = line
  ), counted AS (
    SELECT e.seq, e.amount_cents, CASE WHEN e.stage IN ('reversed', 'adjusted') THEN t.stage ELSE e.stage END AS stage,
           e.stage NOT IN ('reversed', 'adjusted') AND NOT EXISTS (SELECT 1 FROM ledger_entry u WHERE u.stage = 'reversed' AND u.evidence_id = e.id) AS standing
      FROM ledger_entry e LEFT JOIN ledger_entry t ON e.stage IN ('reversed', 'adjusted') AND t.id = e.evidence_id
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

-- As before (20261022090000_review_guards_visit_shortfalls_and_practice_settings.sql), with payer
-- approved and recovered no longer refused here (the ledger's rules below set them), and with the one
-- reopen that is not a person's: the ledger's, of a line it moved to payer approved or recovered.
CREATE OR REPLACE FUNCTION line_status_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_stage text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a line''s stage events never change; a reopen is a new event' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('line_status:' || NEW.service_line_id::text, 0));
  SELECT s.stage INTO current_stage FROM line_status s WHERE s.service_line_id = NEW.service_line_id ORDER BY s.seq DESC LIMIT 1;
  IF NEW.reopened_from IS NULL THEN
    IF current_stage IS NOT NULL AND line_stage_rank(NEW.stage) <= line_stage_rank(current_stage) THEN
      RAISE EXCEPTION 'line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF current_stage IS NULL OR NEW.reopened_from <> current_stage THEN
      RAISE EXCEPTION 'a reopen names the stage the line is at' USING ERRCODE = 'check_violation';
    END IF;
    IF line_stage_rank(NEW.stage) > line_stage_rank(current_stage) THEN
      RAISE EXCEPTION 'a reopen keeps the line at its stage or moves it back; moving forward is not a reopen' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.set_by IS NULL AND NEW.reopened_from NOT IN ('payer_approved', 'recovered') THEN
      RAISE EXCEPTION 'a reopen is a person''s explicit action' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.set_at := now();
  RETURN NEW;
END;
$$;

-- Payer approved and recovered come from the recovery ledger only (PRD 8, The status machine; PRD 13:
-- "nothing unmatched counts"): an event at either stage, whoever writes it (the reconcile job, or the
-- person whose manual match or reversal moved the line), is refused unless the line's entries put it
-- there, so nothing reaches recovered without a posted or deposited entry from a matched export row.
-- The ledger's own reopen (in no one's name) moves a line back exactly to the stage its entries leave it
-- at (actionable when no approval stands, or a recoupment came after it), and only from one it set.
CREATE FUNCTION line_status_ledger_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  ledger_stage text;
BEGIN
  IF NOT (NEW.stage IN ('payer_approved', 'recovered') OR coalesce(NEW.reopened_from IN ('payer_approved', 'recovered'), false)) OR NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  ledger_stage := ledger_line_stage(NEW.service_line_id);
  IF NEW.stage IN ('payer_approved', 'recovered') AND (ledger_stage IS NULL OR line_stage_rank(ledger_stage) < line_stage_rank(NEW.stage)) THEN
    RAISE EXCEPTION 'the ledger holds no entries that put the line at %: nothing counts as recovered without a posted or deposited entry', NEW.stage USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reopened_from IS NOT NULL AND NEW.set_by IS NULL
     AND (NEW.stage IS DISTINCT FROM coalesce(ledger_stage, 'actionable') OR line_stage_rank(coalesce(ledger_stage, 'actionable')) >= line_stage_rank(NEW.reopened_from)) THEN
    RAISE EXCEPTION 'the ledger moves a line back only to the stage its entries leave it at' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER line_status_ledger_rules BEFORE INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_ledger_rules();

-- ---------------------------------------------------------------------------------------------------
-- A recoupment reopens the case
-- ---------------------------------------------------------------------------------------------------

-- As before (20261023090000_packets_submissions_and_responses.sql), with the reopen a recoupment makes
-- (PRD 13: "reopens the case with a note, and notifies the owner"; @tp/triage deriveCaseState holds the
-- same order): a case with a line moved back from payer approved or recovered to an earlier stage (the
-- ledger's move on a recoupment, or a person's explicit reopen) and no line still resolved waits on the
-- payer again (awaiting_response), whatever the payer answered before. It is never open again: open is
-- triage's state for gathering a pattern's lines.
CREATE OR REPLACE FUNCTION case_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  totals record;
  latest uuid;
  answer_kind text;
  answer_reopens boolean;
  answer_window date;
  derived text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.state := 'open';
    NEW.actionable_cents := 0;
    NEW.deadline_on := NULL;
    NEW.closed_at := NULL;
    NEW.opened_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pattern_key, NEW.payer_id, NEW.plan_id, NEW.rate_record_id, NEW.materiality_cents, NEW.pursuit_cost_cents, NEW.opened_at, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pattern_key, OLD.payer_id, OLD.plan_id, OLD.rate_record_id, OLD.materiality_cents, OLD.pursuit_cost_cents, OLD.opened_at, OLD.created_at) THEN
    RAISE EXCEPTION 'a case''s pattern, payer, plan, rate record, materiality and pursuit estimate never change' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) AS lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL) AS open_lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL AND (
           SELECT s.stage FROM line_status s WHERE s.service_line_id = c.service_line_id ORDER BY s.seq DESC LIMIT 1
         ) IN ('payer_approved', 'recovered')) AS resolved_lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL AND EXISTS (
           SELECT 1 FROM (SELECT s.stage, s.reopened_from FROM line_status s WHERE s.service_line_id = c.service_line_id ORDER BY s.seq DESC LIMIT 1) latest
            WHERE latest.reopened_from IN ('payer_approved', 'recovered') AND latest.stage NOT IN ('payer_approved', 'recovered')
         )) AS reopened_lines,
         coalesce(sum(p.variance_cents) FILTER (WHERE c.written_off_reason IS NULL), 0) AS actionable,
         min(p.window_ends_on) FILTER (WHERE c.written_off_reason IS NULL) AS deadline
    INTO totals
    FROM case_line c JOIN priced_line p ON p.id = c.priced_line_id
   WHERE c.case_id = NEW.id;
  NEW.actionable_cents := totals.actionable;
  NEW.deadline_on := totals.deadline;
  latest := case_latest_submission(NEW.id);
  IF latest IS NOT NULL THEN
    SELECT r.kind, r.reopens_case, r.next_window_ends_on INTO answer_kind, answer_reopens, answer_window FROM payer_response r WHERE r.id = submission_latest_response(latest);
  END IF;
  IF totals.lines > 0 AND totals.open_lines = 0 THEN
    derived := 'closed_written_off';
  ELSIF totals.open_lines > 0 AND totals.resolved_lines = totals.open_lines THEN
    derived := 'resolved';
  ELSIF totals.resolved_lines > 0 THEN
    derived := 'partially_resolved';
  ELSIF totals.reopened_lines > 0 THEN
    derived := 'awaiting_response';
  ELSIF latest IS NULL THEN
    derived := 'open';
  ELSIF answer_kind IS NULL THEN
    derived := 'submitted';
  ELSIF answer_kind = 'info_requested' OR (answer_kind = 'denied' AND answer_reopens) THEN
    derived := 'awaiting_response';
  ELSIF answer_kind = 'partial' THEN
    derived := 'partially_resolved';
  ELSE
    derived := 'resolved';
  END IF;
  IF derived = 'awaiting_response' AND answer_reopens THEN
    NEW.deadline_on := answer_window;
  END IF;
  NEW.state := derived;
  NEW.closed_at := CASE WHEN derived = 'closed_written_off' THEN coalesce(OLD.closed_at, now()) END;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- A recoupment tells the case's owner
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE notification DROP CONSTRAINT notification_kind_check;
-- recoupment: a PLB WO or a reversal took money back on a case (subject: the recoupment's match).
ALTER TABLE notification ADD CONSTRAINT notification_kind_check CHECK (kind IN ('monitoring_run', 'digest', 'recoupment'));

-- As before (20261022090000_review_guards_visit_shortfalls_and_practice_settings.sql), with the
-- recoupment's figures: the lines it took money back on, and how much (negative cents).
CREATE OR REPLACE FUNCTION monitoring_figure_codes(leaf text) RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE leaf
    WHEN 'count' THEN ARRAY[
      'lines', 'priced_lines', 'unpriced_lines', 'validated_lines', 'flagged_lines', 'cases',
      'validated_payers', 'validated_lines_by_payer', 'cases_nearing_deadline', 'recoveries_posted',
      'coverage_lines', 'coverage_priced_lines', 'previous_coverage_lines', 'previous_coverage_priced_lines', 'contracts_expiring',
      'recouped_lines']
    WHEN 'cents' THEN ARRAY[
      'billed', 'priced_billed', 'validated_variance', 'validated_variance_by_payer', 'cases_nearing_deadline_actionable', 'recovered',
      'coverage_billed', 'coverage_priced_billed', 'previous_coverage_billed', 'previous_coverage_priced_billed',
      'recouped']
    ELSE ARRAY[]::text[]
  END
$$;

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE posting_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_row FORCE ROW LEVEL SECURITY;
CREATE POLICY posting_row_tenant ON posting_row
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE eft_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE eft_row FORCE ROW LEVEL SECURITY;
CREATE POLICY eft_row_tenant ON eft_row
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE ledger_match ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_match FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_match_tenant ON ledger_match
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE ledger_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_entry_tenant ON ledger_entry
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE roi_statement ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_statement FORCE ROW LEVEL SECURITY;
CREATE POLICY roi_statement_tenant ON roi_statement
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

-- ---------------------------------------------------------------------------------------------------
-- Privileges. The reconcile job reads exports into rows, matches and writes entries; people who
-- reconcile postings match by hand, reverse matches and their entries, adjust entries and generate ROI
-- statements on demand. Nobody updates or deletes an entry, a row or a statement (LED-10); a match is
-- only ever reversed.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON posting_row, eft_row, ledger_match, ledger_entry, roi_statement FROM PUBLIC;
GRANT SELECT ON posting_row, eft_row, ledger_match, ledger_entry, roi_statement TO tp_app;
GRANT INSERT (id, practice_id, source_document_id, row_no, check_or_trace, posted_on, amount_cents, claim_reference, procedure_code, service_date, payer_name, batch, raw, template, fingerprint)
  ON posting_row TO tp_app;
GRANT INSERT (id, practice_id, source_document_id, row_no, trace, deposited_on, amount_cents, batch_reference, fingerprint) ON eft_row TO tp_app;
GRANT INSERT (id, practice_id, kind, claim_id, posting_row_id, eft_row_id, provider_adjustment_id, remittance_id, service_line_id, outcome, level, allocated, matched_by) ON ledger_match TO tp_app;
GRANT UPDATE (reversed_by, reversal_reason) ON ledger_match TO tp_app;
GRANT INSERT (id, practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, allocated, effective_on, created_by, reason) ON ledger_entry TO tp_app;
GRANT INSERT (id, practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links, generated_by, document_key)
  ON roi_statement TO tp_app;

REVOKE ALL ON FUNCTION ledger_proof_level(uuid), roi_links_valid(jsonb), ledger_never_changed(), ledger_no_truncate(), ledger_export_row_belongs(), ledger_match_rules(), ledger_entry_rules(),
  roi_statement_rules(), ledger_line_stage(uuid), line_status_ledger_rules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger_proof_level(uuid), roi_links_valid(jsonb), ledger_line_stage(uuid) TO tp_app;
