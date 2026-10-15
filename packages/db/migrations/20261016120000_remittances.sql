-- Remittances, claims and lines: what the 835 loader writes (PRD 5, J4 and J6; PRD 6, 835 parser and
-- Canonical model and matching; PRD 7, Remittances and Claims and lines; PRD 8, Core records and
-- Invariants; PRD 10, Pipeline steps 8 to 10 and What the loader never does; Data dictionary,
-- Documents and remittances and Indexes that matter; test matrix PAR-06 to PAR-30, JOB-01;
-- docs/adr/0015, 0021, 0025 and 0027).
--
-- Eight PHI tables, each with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - remittance: one 835 transaction set that loaded. Unique on (practice, sender, ISA13, TRN02, BPR02),
--   so the same remittance from a second download or two concurrent loads makes one row (PAR-07,
--   PAR-30). It loads only when balanced: a loaded row has no balance difference, and the loader writes
--   a held transaction set only into its parse report, never here (docs/adr/0027).
-- - claim (CLP), service_line (SVC), adjustment (CAS) and provider_adjustment (PLB). The patient and
--   payer claim control numbers are encrypted with the practice's data key; the payer claim control
--   number has the deterministic keyed hash beside it for the claim lookup the dictionary indexes. A
--   reversal links to the claim it reverses and an original to the correction that supersedes it, each
--   link set once. Observed allowed is stored per line with its basis, once.
-- - patient_ref: the minimal identity, upserted by its pseudonym (the keyed hash of the
--   payer-independent patient key); names, date of birth, member ID and group number encrypted.
-- - parse_report: the receipt per document (counts, PLB total, held transaction sets, unknown codes),
--   its errors as codes and positions only, never a field's value.
-- - line_note: a person's note on a service line (PRD 7, Claims and lines: "add a note"), encrypted
--   like the identifiers, since a person may type anything into it.
--
-- Every reference between these tables stays inside one practice (checked under the caller's
-- policies, like plan_payer_of_practice), so the loader can never merge two practices' records.
--
-- Runs as tp_owner. Safe with the previous image running: new tables and functions only.

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE patient_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- HMAC-SHA-256 under the practice's lookup key of the payer-independent patient key (docs/adr/0027):
  -- stable within the practice, meaningless outside it, and gone with the practice's key.
  pseudonym text NOT NULL CHECK (pseudonym ~ '^[0-9a-f]{64}$'),
  last_name text CHECK (last_name ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  first_name text CHECK (first_name ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  dob text CHECK (dob ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  member_id text CHECK (member_id ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  group_number text CHECK (group_number ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX patient_ref_by_pseudonym ON patient_ref (practice_id, pseudonym);

CREATE TABLE remittance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  source_document_id uuid NOT NULL REFERENCES source_document (id),
  -- ISA06 and ISA08 without their padding.
  sender_id text NOT NULL CHECK (btrim(sender_id) <> ''),
  receiver_id text NOT NULL CHECK (btrim(receiver_id) <> ''),
  isa13 text NOT NULL CHECK (btrim(isa13) <> ''),
  gs06 text NOT NULL CHECK (btrim(gs06) <> ''),
  st02 text NOT NULL CHECK (btrim(st02) <> ''),
  -- TRN02, the check or EFT trace number, and TRN03, the payer's originating company identifier.
  trn02 text NOT NULL CHECK (btrim(trn02) <> ''),
  trn03 text NOT NULL CHECK (btrim(trn03) <> ''),
  -- BPR02 as written (never negative) and BPR03: a debit (D) takes the amount back.
  bpr02_cents bigint NOT NULL CHECK (bpr02_cents >= 0),
  bpr_credit_debit text NOT NULL CHECK (bpr_credit_debit IN ('C', 'D')),
  bpr_method text NOT NULL CHECK (btrim(bpr_method) <> ''),
  bpr16_date date NOT NULL,
  payer_name text NOT NULL CHECK (btrim(payer_name) <> ''),
  payer_id uuid NOT NULL REFERENCES payer (id),
  -- The payee's N104 and its qualifier (XX: an NPI).
  payee_npi text NOT NULL CHECK (btrim(payee_npi) <> ''),
  payee_id_qualifier text NOT NULL CHECK (btrim(payee_id_qualifier) <> ''),
  -- DTM 405.
  production_date date,
  -- Claims paid minus PLB amounts minus the payment (docs/adr/0021); balanced exactly when zero.
  balance_diff_cents bigint NOT NULL DEFAULT 0,
  balanced boolean NOT NULL GENERATED ALWAYS AS (balance_diff_cents = 0) STORED,
  claim_count integer NOT NULL CHECK (claim_count >= 0),
  plb_total_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'loaded' CHECK (status IN ('loaded', 'held', 'duplicate')),
  held_reason text CHECK (held_reason ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- A different remittance with a trace the payer already used for this payee (PRD 10, step 8): it
  -- loads and is surfaced for manual review against the earlier one.
  review_reason text CHECK (review_reason IN ('trace_reused_another_date', 'trace_reused_same_date')),
  review_of_remittance_id uuid REFERENCES remittance (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remittance_once UNIQUE (practice_id, sender_id, isa13, trn02, bpr02_cents),
  CONSTRAINT remittance_loads_only_balanced CHECK (status <> 'loaded' OR balance_diff_cents = 0),
  CONSTRAINT remittance_review_names_its_remittance CHECK ((review_reason IS NULL) = (review_of_remittance_id IS NULL)),
  CONSTRAINT remittance_not_reviewed_against_itself CHECK (review_of_remittance_id IS DISTINCT FROM id)
);
CREATE INDEX remittance_by_trace ON remittance (practice_id, trn02);
CREATE INDEX remittance_by_payment_date ON remittance (practice_id, bpr16_date DESC, id);
CREATE INDEX remittance_by_payer ON remittance (practice_id, payer_id, bpr16_date DESC);
CREATE INDEX remittance_by_document ON remittance (source_document_id);

CREATE TABLE claim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  remittance_id uuid NOT NULL REFERENCES remittance (id),
  -- The claim's place in its transaction set, from 1.
  claim_no integer NOT NULL CHECK (claim_no >= 1),
  -- CLP01 and CLP07, encrypted with the practice's data key; CLP07's keyed hash for lookups.
  patient_control_number text NOT NULL CHECK (patient_control_number ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  payer_claim_control_number text NOT NULL CHECK (payer_claim_control_number ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  payer_claim_control_number_hash text NOT NULL CHECK (payer_claim_control_number_hash ~ '^[0-9a-f]{64}$'),
  -- CLP02; 22 is a reversal.
  claim_status_code text NOT NULL CHECK (btrim(claim_status_code) <> ''),
  charge_cents bigint NOT NULL,
  paid_cents bigint NOT NULL,
  patient_resp_cents bigint,
  -- CLP06, CLP08 and CLP09.
  filing_indicator text NOT NULL CHECK (btrim(filing_indicator) <> ''),
  facility_type text,
  frequency_code text,
  patient_ref_id uuid NOT NULL REFERENCES patient_ref (id),
  insured_ref_id uuid REFERENCES patient_ref (id),
  service_from date,
  service_to date,
  reversal_of_claim_id uuid REFERENCES claim (id),
  superseded_by_claim_id uuid REFERENCES claim (id),
  -- AMT AU.
  allowed_cents bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_once UNIQUE (remittance_id, claim_no),
  CONSTRAINT claim_reversal_is_a_reversal CHECK (reversal_of_claim_id IS NULL OR claim_status_code = '22'),
  CONSTRAINT claim_not_its_own_reversal CHECK (reversal_of_claim_id IS DISTINCT FROM id),
  CONSTRAINT claim_not_superseded_by_itself CHECK (superseded_by_claim_id IS DISTINCT FROM id)
);
-- On the deterministic hash of the encrypted value (Data dictionary, Indexes that matter).
CREATE INDEX claim_by_payer_claim_control_number ON claim (practice_id, payer_claim_control_number_hash);
CREATE INDEX claim_by_patient ON claim (practice_id, patient_ref_id);
CREATE INDEX claim_by_reversed ON claim (reversal_of_claim_id) WHERE reversal_of_claim_id IS NOT NULL;

CREATE TABLE service_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  claim_id uuid NOT NULL REFERENCES claim (id),
  line_no integer NOT NULL CHECK (line_no >= 1),
  -- SVC01: the qualifier (HC, NU, ...), the code and the modifiers in their four positions, an empty
  -- position kept as ''.
  procedure_qualifier text NOT NULL CHECK (btrim(procedure_qualifier) <> ''),
  procedure_code text NOT NULL CHECK (btrim(procedure_code) <> ''),
  modifiers text[] NOT NULL DEFAULT '{}' CHECK (cardinality(modifiers) <= 4),
  revenue_code text,
  charge_cents bigint NOT NULL,
  paid_cents bigint NOT NULL,
  -- SVC05 and SVC07 exactly as sent; a value this type cannot hold exactly is never loaded.
  units numeric(9,3),
  original_units numeric(9,3),
  -- DTM 472 (or 150) and, for a range, its last day (DTM 151 or RD8).
  service_date date,
  service_date_to date,
  place_of_service text,
  -- AMT B6.
  line_allowed_cents bigint,
  -- AMT B6 when sent, else SVC03 plus the line's PR adjustments, or plus the claim's PR allocated to
  -- the line when no line carries PR (allocated, docs/adr/0021). Derived once, with its basis.
  observed_allowed_cents bigint NOT NULL,
  observed_allowed_basis text NOT NULL CHECK (observed_allowed_basis IN ('amt_b6', 'paid_plus_pr')),
  observed_allowed_allocated boolean NOT NULL DEFAULT false,
  -- The line's PR adjustments, or its allocated share of the claim's.
  patient_share_cents bigint NOT NULL DEFAULT 0,
  rendering_npi text,
  -- The payer and plan the line was paid under: its plan row (plan belongs to one payer).
  payer_plan_key uuid NOT NULL REFERENCES plan (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_line_once UNIQUE (claim_id, line_no),
  -- A period's last day comes with its first; the dates are stored as the payer sent them.
  CONSTRAINT service_line_dates CHECK (service_date_to IS NULL OR service_date IS NOT NULL),
  -- Observed allowed is what its basis says: AMT B6, or paid plus the patient share.
  CONSTRAINT service_line_observed_from_b6 CHECK (observed_allowed_basis <> 'amt_b6' OR observed_allowed_cents = line_allowed_cents),
  CONSTRAINT service_line_observed_from_paid_and_share CHECK (observed_allowed_basis <> 'paid_plus_pr' OR observed_allowed_cents = paid_cents + patient_share_cents),
  CONSTRAINT service_line_allocated_from_paid_and_share CHECK (NOT observed_allowed_allocated OR observed_allowed_basis = 'paid_plus_pr')
);
CREATE INDEX service_line_by_service_date ON service_line (practice_id, service_date);
CREATE INDEX service_line_by_plan_and_code ON service_line (practice_id, payer_plan_key, procedure_code);

CREATE TABLE adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  claim_id uuid NOT NULL REFERENCES claim (id),
  -- Null for a claim-level CAS.
  service_line_id uuid REFERENCES service_line (id),
  group_code text NOT NULL CHECK (btrim(group_code) <> ''),
  reason_code text NOT NULL CHECK (btrim(reason_code) <> ''),
  -- The group or reason is not in its code list on the payment date: loaded with this flag, never
  -- dropped (PRD 10; PAR-21).
  unknown_code boolean NOT NULL DEFAULT false,
  amount_cents bigint NOT NULL,
  quantity numeric(9,3),
  -- 1-based order within the claim (claim level) or the line.
  position integer NOT NULL CHECK (position >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adjustment_once UNIQUE NULLS NOT DISTINCT (claim_id, service_line_id, position)
);
CREATE INDEX adjustment_by_claim ON adjustment (practice_id, claim_id);
CREATE INDEX adjustment_by_line ON adjustment (service_line_id) WHERE service_line_id IS NOT NULL;

CREATE TABLE provider_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  remittance_id uuid NOT NULL REFERENCES remittance (id),
  -- 1-based order within the transaction set.
  position integer NOT NULL CHECK (position >= 1),
  -- PLB01.
  provider_id text NOT NULL CHECK (btrim(provider_id) <> ''),
  reason_code text NOT NULL CHECK (btrim(reason_code) <> ''),
  reference text,
  -- As the segment carries it: positive reduces the payment (docs/adr/0021).
  amount_cents bigint NOT NULL,
  fiscal_period_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('recoupment', 'forward_balance', 'interest', 'authorized_return', 'other')),
  -- A forward balance is recorded and not counted until it resolves (PRD 13; PAR-17).
  counted boolean NOT NULL GENERATED ALWAYS AS (category <> 'forward_balance') STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_adjustment_once UNIQUE (remittance_id, position)
);
CREATE INDEX provider_adjustment_by_remittance ON provider_adjustment (practice_id, remittance_id);

CREATE TABLE parse_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  source_document_id uuid NOT NULL REFERENCES source_document (id),
  -- loaded: every transaction set loaded or was already loaded; duplicate: every one was a remittance
  -- already loaded from another document; held: none loaded; partially_held: some held, some not.
  outcome text NOT NULL CHECK (outcome IN ('loaded', 'held', 'partially_held', 'duplicate')),
  transactions integer NOT NULL CHECK (transactions >= 0),
  claims integer NOT NULL CHECK (claims >= 0),
  lines integer NOT NULL CHECK (lines >= 0),
  reversals integer NOT NULL CHECK (reversals >= 0),
  held integer NOT NULL CHECK (held >= 0),
  plb_total_cents bigint NOT NULL,
  -- What loaded new rows, and what was a remittance already loaded.
  loaded_transactions integer NOT NULL CHECK (loaded_transactions >= 0),
  loaded_claims integer NOT NULL CHECK (loaded_claims >= 0),
  loaded_lines integer NOT NULL CHECK (loaded_lines >= 0),
  duplicate_transactions integer NOT NULL CHECK (duplicate_transactions >= 0),
  -- "list:code" (carc:Z999), sorted and unique.
  unknown_codes text[] NOT NULL DEFAULT '{}',
  -- Every error with its code, segment index, segment ID and element position (and, for a balance, the
  -- difference); never a field's value.
  errors jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(errors) = 'array'),
  -- One entry per transaction set: its position, ST02, what happened and the remittance it loaded or
  -- was linked to.
  transaction_outcomes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(transaction_outcomes) = 'array'),
  -- The rule release whose CARC and RARC lists checked the codes; null when none was loaded.
  code_list_release integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parse_report_once UNIQUE (source_document_id)
);
CREATE INDEX parse_report_by_practice ON parse_report (practice_id, created_at DESC);

CREATE TABLE line_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  service_line_id uuid NOT NULL REFERENCES service_line (id),
  note text NOT NULL CHECK (note ~ '^enc:v1:[A-Za-z0-9_-]+$'),
  created_by uuid NOT NULL REFERENCES "user" (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX line_note_by_line ON line_note (practice_id, service_line_id, created_at);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('patient_ref', '20261016120000_remittances', 'patient_ref_tenant'),
  ('remittance', '20261016120000_remittances', 'remittance_tenant'),
  ('claim', '20261016120000_remittances', 'claim_tenant'),
  ('service_line', '20261016120000_remittances', 'service_line_tenant'),
  ('adjustment', '20261016120000_remittances', 'adjustment_tenant'),
  ('provider_adjustment', '20261016120000_remittances', 'provider_adjustment_tenant'),
  ('parse_report', '20261016120000_remittances', 'parse_report_tenant'),
  ('line_note', '20261016120000_remittances', 'line_note_tenant');

-- ---------------------------------------------------------------------------------------------------
-- Rules. Each reference must name a row of the same practice, looked up under the caller's policies;
-- a row outside the transaction's scope is left to the tenant policy, which refuses it after them.
-- ---------------------------------------------------------------------------------------------------

CREATE TRIGGER patient_ref_updated_at BEFORE UPDATE ON patient_ref FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER remittance_updated_at BEFORE UPDATE ON remittance FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER claim_updated_at BEFORE UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER service_line_updated_at BEFORE UPDATE ON service_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER adjustment_updated_at BEFORE UPDATE ON adjustment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER provider_adjustment_updated_at BEFORE UPDATE ON provider_adjustment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER parse_report_updated_at BEFORE UPDATE ON parse_report FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER line_note_updated_at BEFORE UPDATE ON line_note FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION remittance_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) THEN
    IF NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id AND d.kind = 'x12_835') THEN
      RAISE EXCEPTION 'a remittance comes from an 835 document of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM payer p WHERE p.id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a remittance names a payer of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.review_of_remittance_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.review_of_remittance_id AND r.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a remittance is reviewed against a remittance of the same practice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER remittance_references_in_practice BEFORE INSERT ON remittance FOR EACH ROW EXECUTE FUNCTION remittance_references_in_practice();

-- A claim's remittance and patient references are the practice's; a reversal reverses a claim of the
-- practice that is not itself a reversal; a correction supersedes a claim of the practice. Each link is
-- set once and never changed or removed.
CREATE FUNCTION claim_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
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
      IF NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id) THEN
        RAISE EXCEPTION 'a claim belongs to a remittance of the same practice' USING ERRCODE = 'check_violation';
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
CREATE TRIGGER claim_references_in_practice BEFORE INSERT OR UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION claim_references_in_practice();

CREATE FUNCTION service_line_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) THEN
    IF NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a service line belongs to a claim of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM plan p WHERE p.id = NEW.payer_plan_key AND p.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a service line names a plan of the same practice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_line_references_in_practice BEFORE INSERT ON service_line FOR EACH ROW EXECUTE FUNCTION service_line_references_in_practice();

-- A line-level adjustment's line is a line of the adjustment's own claim.
CREATE FUNCTION adjustment_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) THEN
    IF NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'an adjustment belongs to a claim of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.service_line_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.claim_id = NEW.claim_id AND l.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a line-level adjustment belongs to a line of its own claim' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER adjustment_references_in_practice BEFORE INSERT ON adjustment FOR EACH ROW EXECUTE FUNCTION adjustment_references_in_practice();

CREATE FUNCTION provider_adjustment_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a provider adjustment belongs to a remittance of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER provider_adjustment_references_in_practice BEFORE INSERT ON provider_adjustment FOR EACH ROW EXECUTE FUNCTION provider_adjustment_references_in_practice();

CREATE FUNCTION parse_report_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a parse report belongs to a document of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER parse_report_references_in_practice BEFORE INSERT ON parse_report FOR EACH ROW EXECUTE FUNCTION parse_report_references_in_practice();

CREATE FUNCTION line_note_references_in_practice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a note belongs to a service line of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER line_note_references_in_practice BEFORE INSERT ON line_note FOR EACH ROW EXECUTE FUNCTION line_note_references_in_practice();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE patient_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_ref FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_ref_tenant ON patient_ref
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE remittance ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittance FORCE ROW LEVEL SECURITY;
CREATE POLICY remittance_tenant ON remittance
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim FORCE ROW LEVEL SECURITY;
CREATE POLICY claim_tenant ON claim
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE service_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_line FORCE ROW LEVEL SECURITY;
CREATE POLICY service_line_tenant ON service_line
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE adjustment ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjustment FORCE ROW LEVEL SECURITY;
CREATE POLICY adjustment_tenant ON adjustment
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE provider_adjustment ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_adjustment FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_adjustment_tenant ON provider_adjustment
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE parse_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE parse_report FORCE ROW LEVEL SECURITY;
CREATE POLICY parse_report_tenant ON parse_report
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE line_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_note FORCE ROW LEVEL SECURITY;
CREATE POLICY line_note_tenant ON line_note
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Nobody writes a note in another person's name.
CREATE POLICY line_note_created_by_actor ON line_note AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (created_by = app_actor_id());

-- ---------------------------------------------------------------------------------------------------
-- Privileges: loaded records never change (only a claim's reversal and correction links are set,
-- once, and a patient reference's missing member ID, group number or date of birth filled in); the
-- application deletes and truncates nothing (retention, PRD 19).
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON patient_ref, remittance, claim, service_line, adjustment, provider_adjustment, parse_report, line_note FROM PUBLIC;
GRANT SELECT ON patient_ref, remittance, claim, service_line, adjustment, provider_adjustment, parse_report, line_note TO tp_app;
GRANT INSERT (id, practice_id, pseudonym, last_name, first_name, dob, member_id, group_number) ON patient_ref TO tp_app;
GRANT UPDATE (dob, member_id, group_number) ON patient_ref TO tp_app;
GRANT INSERT (id, practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method,
  bpr16_date, payer_name, payer_id, payee_npi, payee_id_qualifier, production_date, balance_diff_cents, claim_count, plb_total_cents, status, held_reason,
  review_reason, review_of_remittance_id) ON remittance TO tp_app;
GRANT INSERT (id, practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
  charge_cents, paid_cents, patient_resp_cents, filing_indicator, facility_type, frequency_code, patient_ref_id, insured_ref_id, service_from, service_to,
  reversal_of_claim_id, superseded_by_claim_id, allowed_cents) ON claim TO tp_app;
GRANT UPDATE (reversal_of_claim_id, superseded_by_claim_id) ON claim TO tp_app;
GRANT INSERT (id, practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, revenue_code, charge_cents, paid_cents, units, original_units,
  service_date, service_date_to, place_of_service, line_allowed_cents, observed_allowed_cents, observed_allowed_basis, observed_allowed_allocated,
  patient_share_cents, rendering_npi, payer_plan_key) ON service_line TO tp_app;
GRANT INSERT (id, practice_id, claim_id, service_line_id, group_code, reason_code, unknown_code, amount_cents, quantity, position) ON adjustment TO tp_app;
GRANT INSERT (id, practice_id, remittance_id, position, provider_id, reason_code, reference, amount_cents, fiscal_period_date, category) ON provider_adjustment TO tp_app;
GRANT INSERT (id, practice_id, source_document_id, outcome, transactions, claims, lines, reversals, held, plb_total_cents, loaded_transactions, loaded_claims,
  loaded_lines, duplicate_transactions, unknown_codes, errors, transaction_outcomes, code_list_release) ON parse_report TO tp_app;
GRANT INSERT (id, practice_id, service_line_id, note, created_by) ON line_note TO tp_app;

REVOKE ALL ON FUNCTION remittance_references_in_practice(), claim_references_in_practice(), service_line_references_in_practice(), adjustment_references_in_practice(),
  provider_adjustment_references_in_practice(), parse_report_references_in_practice(), line_note_references_in_practice() FROM PUBLIC;
