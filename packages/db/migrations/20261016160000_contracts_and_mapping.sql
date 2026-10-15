-- The contract repository and payer and plan mapping (PRD 2, Which agreement governs the line; PRD 3,
-- Personas; PRD 5, J5 and J6; PRD 6, Payer and plan mapping and Contract repository; PRD 8, Core records
-- and Invariants; PRD 9, Contract rate records; PRD 11, Inputs; Data dictionary, Payers, contracts and
-- rates; test matrix CON-01 to CON-07 and MAP-01 to MAP-05; docs/adr/0013, 0017, 0019 and 0028).
--
-- Five PHI tables, each with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - contract: an agreement with a payer. Its versions carry the terms.
-- - contract_version: a version or an amendment, with its documents, its effective window [from, to)
--   (effective_to exclusive, null for open-ended), its windows and its state. States move only
--   forward: draft -> proposed (a model proposal awaiting verification, v1) -> approved (the specialist
--   is done) -> signed_off (the customer accepted; only these price) -> superseded; draft may go
--   straight to approved (v0: the specialist abstracts by hand), and an approved version that is never
--   signed off is superseded by its correction. Approval is a contract specialist's (the platform
--   permission rate_record.approve) and sign-off a practice administrator's or billing manager's
--   (contract.sign_off), each recorded with the user and the time and checked here through the
--   milestone 1 permission functions. Versions of one contract never overlap: an exclusion constraint
--   on the window holds it for every signed-off version and every version that supersedes nothing; a
--   successor (an amendment or a correction) claims its window when it is signed off, and that
--   sign-off closes or supersedes the version it names in the same statement: an amendment that starts
--   later sets the prior version's effective_to to its own start (CON-02, nothing else changes), one
--   that starts on or before it marks it superseded. Nothing else about an approved or signed-off
--   version ever changes (CON-03).
-- - rate_record: a pricing term (scope, method, parameters, flags, rounding, evidence). Records change
--   only while their version is a draft or a proposal. A record is verified by a contract specialist
--   field by field (evidence.approved_fields, each field with its approver and time); a record is
--   verified only with evidence that names a document of its version, a page, a quote and a hash
--   (CON-04), and an edit clears the approvals of what it changed.
-- - contract_calendar_event: dates to act on, derived when a version is signed off.
-- - payer_plan_mapping: a plan's agreement over a window: a contract version, no agreement, Medicare
--   Advantage non-contracted, government or other. A mapping never changes: a correction is a new
--   mapping that supersedes it (MAP-03), and the windows of the mappings in force for a plan never
--   overlap (a mapping may overlap only the mappings it supersedes, directly or through them).
--
-- Two changes to earlier rules, both in docs/adr/0028:
-- - contract.sign_off joins the permission matrix (packages/db/src/authz/permissions.ts): the practice
--   administrator and the billing manager sign off (J5), and so does the firm principal, who does
--   everything a billing manager does (PRD 3); the reviewer is denied it like every write.
-- - A contract specialist reaches a practice only as a support engineer does, through a support grant
--   (PRD 3: the company's internal organization "has grants only through the support path"; PRD 6,
--   Admin console: "no admin screen can read PHI without a support grant"): a support grant may now go
--   to a contract specialist, and under it the specialist holds the contract_specialist role in that
--   practice, never support's.
--
-- Runs as tp_owner. Safe with the previous image running: new tables, functions and matrix rows; the
-- two replaced functions keep their signatures and give the previous image the same answers for
-- support engineers.

-- ---------------------------------------------------------------------------------------------------
-- The permission matrix: customer sign-off (PRD 5, J5).
-- ---------------------------------------------------------------------------------------------------

INSERT INTO role_permission (role, action, effect) VALUES
  ('billing_manager', 'contract.sign_off', 'allow'),
  ('firm_principal', 'contract.sign_off', 'allow'),
  ('practice_admin', 'contract.sign_off', 'allow'),
  ('reviewer', 'contract.sign_off', 'deny');

-- ---------------------------------------------------------------------------------------------------
-- The contract specialist's path into a practice: a support grant (docs/adr/0028).
-- ---------------------------------------------------------------------------------------------------

-- The internal role a user holds under a support grant: a current support or contract specialist
-- membership of the internal organization, active, with MFA enrolled; null for anyone else.
CREATE FUNCTION support_grant_role(target_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT min(m.role)
    FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
   WHERE m.user_id = target_user AND o.kind = 'internal' AND m.role IN ('support', 'contract_specialist')
     AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active' AND u.mfa_enrolled
$$;

-- A support grant goes to a support engineer or a contract specialist, never to the person creating it.
CREATE OR REPLACE FUNCTION support_grant_grantee() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT pg_has_role(current_user, 'tp_owner', 'USAGE') AND NEW.user_id = app_actor_id() THEN
    RAISE EXCEPTION 'nobody grants themselves support access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF support_grant_role(NEW.user_id) IS NULL THEN
    RAISE EXCEPTION 'a support grant goes to a support engineer or a contract specialist with a current role' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- As before, except that the support route carries the grantee's internal role: support for a support
-- engineer, contract_specialist for a contract specialist.
CREATE OR REPLACE FUNCTION effective_practice_access() RETURNS TABLE (practice_id uuid, via text, grant_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id, 'ownership', NULL::uuid, m.role
    FROM app_actor_memberships() m
    JOIN practice p ON p.organization_id = m.organization_id
   WHERE m.organization_kind = 'group' AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer')
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT g.practice_id, 'grant', g.id, m.role
    FROM app_actor_memberships() m
    JOIN "grant" g ON g.organization_id = m.organization_id
   WHERE m.organization_kind IN ('group', 'firm')
     AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at
     AND g.scope -> 'roles' ? m.role
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT s.practice_id, 'support', s.id, m.role
    FROM support_grant s
    JOIN app_actor_memberships() m ON m.organization_kind = 'internal' AND m.role IN ('support', 'contract_specialist')
   WHERE s.user_id = app_actor_id()
     AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours'
$$;

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

-- Half of a UUID (its first or last 64 bits) as a one-value range, so a gist exclusion constraint can
-- compare UUIDs exactly beside a date range: two UUIDs are equal exactly when both halves' ranges
-- overlap. (The owner role cannot install btree_gist, and needs nothing from it but this.)
CREATE FUNCTION uuid_half(value uuid, first_half boolean) RETURNS int8range
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT int8range(half, half, '[]')
    FROM (SELECT ('x' || substr(replace(value::text, '-', ''), CASE WHEN first_half THEN 1 ELSE 17 END, 16))::bit(64)::bigint AS half) h
$$;

CREATE TABLE contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  payer_id uuid NOT NULL REFERENCES payer (id),
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  -- The billing entity the contract names, as written.
  billing_entity text CHECK (btrim(billing_entity) <> '' AND char_length(billing_entity) <= 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_by_payer ON contract (practice_id, payer_id);

CREATE TABLE contract_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  contract_id uuid NOT NULL REFERENCES contract (id),
  version_no integer NOT NULL CHECK (version_no >= 1),
  -- The contract, exhibit and payer-letter documents the version is abstracted from.
  source_document_ids uuid[] NOT NULL DEFAULT '{}' CHECK (array_position(source_document_ids, NULL) IS NULL AND cardinality(source_document_ids) <= 100),
  -- The window [effective_from, effective_to): effective_to is the first day the version no longer
  -- covers (an amendment's start), null while the version is open-ended.
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'approved', 'signed_off', 'superseded')),
  approved_by uuid REFERENCES "user" (id),
  approved_at timestamptz,
  signed_off_by uuid REFERENCES "user" (id),
  signed_off_at timestamptz,
  -- The version this one amends (from a later start) or replaces (from the same start or earlier).
  supersedes_id uuid REFERENCES contract_version (id),
  -- The contract's windows; null where the contract is silent (the rule release's commercial defaults apply).
  timely_filing_days integer CHECK (timely_filing_days BETWEEN 1 AND 3650),
  dispute_window_days integer CHECK (dispute_window_days BETWEEN 1 AND 3650),
  -- [{"level": 1, "days": 90}, ...]: the appeal levels the contract defines, in order.
  appeal_levels jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(appeal_levels) = 'array'),
  -- The notice the contract requires before an anniversary (renewal or termination); null if none.
  notice_days integer CHECK (notice_days BETWEEN 1 AND 3650),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_version_number_once UNIQUE (contract_id, version_no),
  CONSTRAINT contract_version_window CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT contract_version_approval_recorded CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CONSTRAINT contract_version_sign_off_recorded CHECK ((signed_off_by IS NULL) = (signed_off_at IS NULL)),
  CONSTRAINT contract_version_approved_past_proposal CHECK ((status IN ('draft', 'proposed')) = (approved_by IS NULL)),
  CONSTRAINT contract_version_signed_off_recorded CHECK (status <> 'signed_off' OR signed_off_by IS NOT NULL),
  CONSTRAINT contract_version_signed_off_only_once_signed CHECK (signed_off_by IS NULL OR status IN ('signed_off', 'superseded')),
  CONSTRAINT contract_version_not_its_own_successor CHECK (supersedes_id IS DISTINCT FROM id),
  -- CON-01: versions of one contract never overlap.
  CONSTRAINT contract_version_windows_never_overlap EXCLUDE USING gist (
    uuid_half(contract_id, true) WITH &&,
    uuid_half(contract_id, false) WITH &&,
    daterange(effective_from, effective_to, '[)') WITH &&
  ) WHERE (status = 'signed_off' OR (supersedes_id IS NULL AND status IN ('draft', 'proposed', 'approved')))
);
CREATE INDEX contract_version_by_contract ON contract_version (practice_id, contract_id, effective_from);
CREATE INDEX contract_version_by_predecessor ON contract_version (supersedes_id) WHERE supersedes_id IS NOT NULL;

-- Whether evidence names a document, a page, a quote and a hash (CON-04).
CREATE FUNCTION rate_record_evidence_complete(evidence jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(
    jsonb_typeof(evidence -> 'document_id') = 'string'
      AND (evidence ->> 'document_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND jsonb_typeof(evidence -> 'page') = 'number' AND (evidence ->> 'page') ~ '^[1-9][0-9]{0,5}$'
      AND jsonb_typeof(evidence -> 'quote') = 'string' AND btrim(evidence ->> 'quote') <> ''
      AND jsonb_typeof(evidence -> 'hash') = 'string' AND (evidence ->> 'hash') ~ '^[0-9a-f]{64}$',
    false)
$$;

CREATE TABLE rate_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  contract_version_id uuid NOT NULL REFERENCES contract_version (id),
  -- Codes, modifier sets, places of service, provider types and an effective window (packages/contracts
  -- validates the shapes of scope, parameters and flags).
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object'),
  method text NOT NULL CHECK (method IN ('FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED')),
  parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
  flags jsonb NOT NULL CHECK (jsonb_typeof(flags) = 'object'),
  -- Null where the contract is silent: the practice's default applies (PRD 11, Inputs).
  rounding text CHECK (rounding IN ('HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE')),
  -- {document_id, page, quote, hash, approved_fields: {<field>: {by, at}}}.
  evidence jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(evidence) = 'object'),
  proposed_by text NOT NULL CHECK (proposed_by IN ('specialist', 'model')),
  verified_by uuid REFERENCES "user" (id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_record_verification_recorded CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
  -- CON-04: no verification without a document, a page, a quote and a hash.
  CONSTRAINT rate_record_verified_with_evidence CHECK (verified_by IS NULL OR rate_record_evidence_complete(evidence))
);
CREATE INDEX rate_record_by_version ON rate_record (practice_id, contract_version_id);

CREATE TABLE contract_calendar_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  contract_id uuid NOT NULL REFERENCES contract (id),
  kind text NOT NULL CHECK (kind IN ('anniversary', 'notice_deadline', 'fee_schedule_year', 'amendment')),
  on_date date NOT NULL,
  -- Written by code from the version (no free text).
  note text CHECK (btrim(note) <> '' AND char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_calendar_event_once UNIQUE (contract_id, kind, on_date)
);
CREATE INDEX contract_calendar_event_by_date ON contract_calendar_event (practice_id, on_date);

CREATE TABLE payer_plan_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  plan_id uuid NOT NULL REFERENCES plan (id),
  -- The contract version the plan is mapped to; pricing uses the contract's signed-off version in force
  -- on each service date.
  contract_version_id uuid REFERENCES contract_version (id),
  mapping_kind text NOT NULL CHECK (mapping_kind IN ('no_agreement', 'contract', 'ma_noncontracted', 'government', 'other')),
  -- The window [effective_from, effective_to), effective_to exclusive, null while open-ended.
  effective_from date NOT NULL,
  effective_to date,
  mapped_by uuid NOT NULL REFERENCES "user" (id),
  -- The mapping this one corrects (MAP-03); that mapping is left exactly as it was.
  supersedes_id uuid REFERENCES payer_plan_mapping (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payer_plan_mapping_names_its_version CHECK ((mapping_kind = 'contract') = (contract_version_id IS NOT NULL)),
  CONSTRAINT payer_plan_mapping_window CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT payer_plan_mapping_not_its_own_correction CHECK (supersedes_id IS DISTINCT FROM id)
);
CREATE INDEX payer_plan_mapping_by_plan ON payer_plan_mapping (practice_id, plan_id, effective_from);
CREATE INDEX payer_plan_mapping_by_predecessor ON payer_plan_mapping (supersedes_id) WHERE supersedes_id IS NOT NULL;

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('contract', '20261016160000_contracts_and_mapping', 'contract_tenant'),
  ('contract_version', '20261016160000_contracts_and_mapping', 'contract_version_tenant'),
  ('rate_record', '20261016160000_contracts_and_mapping', 'rate_record_tenant'),
  ('contract_calendar_event', '20261016160000_contracts_and_mapping', 'contract_calendar_event_tenant'),
  ('payer_plan_mapping', '20261016160000_contracts_and_mapping', 'payer_plan_mapping_tenant');

-- ---------------------------------------------------------------------------------------------------
-- Rules. Lookups of other rows run under the caller's policies; a row whose practice is outside the
-- transaction's scope is left to the tenant policy, which refuses it after these triggers.
-- ---------------------------------------------------------------------------------------------------

CREATE TRIGGER contract_updated_at BEFORE UPDATE ON contract FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contract_version_updated_at BEFORE UPDATE ON contract_version FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER rate_record_updated_at BEFORE UPDATE ON rate_record FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contract_calendar_event_updated_at BEFORE UPDATE ON contract_calendar_event FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payer_plan_mapping_updated_at BEFORE UPDATE ON payer_plan_mapping FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A contract's payer is a payer of the same practice.
CREATE FUNCTION contract_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.practice_id, NEW.payer_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.payer_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a contract''s practice and payer never change' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND practice_in_scope(NEW.practice_id)
     AND NOT EXISTS (SELECT 1 FROM payer p WHERE p.id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a contract belongs to a payer of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contract_rules BEFORE INSERT OR UPDATE ON contract FOR EACH ROW EXECUTE FUNCTION contract_rules();

-- The version's documents are clean contract, exhibit or payer-letter documents of its practice, each once.
CREATE FUNCTION contract_version_documents_ok(v contract_version) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT (SELECT count(DISTINCT x) FROM unnest(v.source_document_ids) x) = cardinality(v.source_document_ids)
     AND (SELECT count(*) FROM source_document d
           WHERE d.id = ANY (v.source_document_ids) AND d.practice_id = v.practice_id
             AND d.kind IN ('contract', 'exhibit', 'payer_letter') AND d.scan_status = 'clean') = cardinality(v.source_document_ids)
$$;

-- Whether a successor in `successor_status` names `prior` and retires it as `retired` shows: superseded
-- (a correction starting on or before it, or any successor of a version that was never signed off) or
-- closed at the successor's start (an amendment starting inside its window). Checked before the
-- successor's sign-off is stored (successor approved) and again at commit (successor signed off).
CREATE FUNCTION contract_version_retired_by(prior contract_version, retired contract_version, successor_status text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM contract_version n
     WHERE n.supersedes_id = prior.id AND n.contract_id = prior.contract_id AND n.status = successor_status
       AND CASE WHEN retired.status = 'superseded'
                THEN retired.effective_to IS NOT DISTINCT FROM prior.effective_to AND (prior.status = 'approved' OR n.effective_from <= prior.effective_from)
                ELSE prior.status = 'signed_off' AND retired.status = 'signed_off' AND retired.effective_to = n.effective_from
                     AND prior.effective_from < n.effective_from AND (prior.effective_to IS NULL OR n.effective_from < prior.effective_to)
           END
  )
$$;

CREATE FUNCTION contract_version_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  prior contract_version%ROWTYPE;
  records bigint;
  unverified bigint;
  stray bigint;
  terms_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.signed_off_by IS NOT NULL THEN
      RAISE EXCEPTION 'a contract version starts as a draft' USING ERRCODE = 'check_violation';
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
    terms_changed := (NEW.source_document_ids, NEW.effective_from, NEW.supersedes_id, NEW.timely_filing_days, NEW.dispute_window_days, NEW.appeal_levels, NEW.notice_days)
      IS DISTINCT FROM (OLD.source_document_ids, OLD.effective_from, OLD.supersedes_id, OLD.timely_filing_days, OLD.dispute_window_days, OLD.appeal_levels, OLD.notice_days);

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
        IF terms_changed OR NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
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
      ELSE
        RAISE EXCEPTION 'a contract version moves draft, proposed, approved, signed off, superseded, in that order' USING ERRCODE = 'check_violation';
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
         OR terms_changed OR NEW.effective_to IS DISTINCT FROM OLD.effective_to OR (NEW.approved_by, NEW.approved_at) IS DISTINCT FROM (OLD.approved_by, OLD.approved_at) THEN
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
      IF terms_changed OR (NEW.approved_by, NEW.approved_at, NEW.signed_off_by, NEW.signed_off_at) IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.signed_off_by, OLD.signed_off_at)
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
CREATE TRIGGER contract_version_rules BEFORE INSERT OR UPDATE ON contract_version FOR EACH ROW EXECUTE FUNCTION contract_version_rules();

-- At commit: a version closed or superseded in this transaction has a signed-off successor naming it,
-- whose start is the closed window's end (an amendment) or on or before its start (a correction).
CREATE FUNCTION contract_version_retired_by_signed_successor() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT contract_version_retired_by(OLD, NEW, 'signed_off') THEN
    RAISE EXCEPTION 'a contract version is closed or superseded only by the sign-off of its successor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER contract_version_retired_by_signed_successor AFTER UPDATE ON contract_version
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.status IN ('approved', 'signed_off') AND (NEW.status = 'superseded' OR NEW.effective_to IS DISTINCT FROM OLD.effective_to))
  EXECUTE FUNCTION contract_version_retired_by_signed_successor();

-- The fields of a rate record a specialist approves one by one.
CREATE FUNCTION rate_record_fields() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY['scope', 'method', 'parameters', 'flags', 'rounding']
$$;

-- A rate record changes only while its version is a draft or a proposal (CON-03). Field approvals
-- name the acting specialist and the time; an edit clears the approvals of what it changed (all of
-- them when the citation changes); a record is verified by a specialist once every field is approved
-- and its evidence is complete and cites a document of its version (CON-04).
CREATE FUNCTION rate_record_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  version contract_version%ROWTYPE;
  target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.contract_version_id ELSE NEW.contract_version_id END;
  target_practice uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.practice_id ELSE NEW.practice_id END;
  approvals jsonb;
  field text;
  entry jsonb;
  is_specialist boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.practice_id, NEW.contract_version_id, NEW.proposed_by, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.contract_version_id, OLD.proposed_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a rate record''s version and origin never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(target_practice) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  -- Shares the version's row lock with its approval, so a record never changes under an approving version.
  SELECT * INTO version FROM contract_version v WHERE v.id = target AND v.practice_id = target_practice FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a rate record belongs to a contract version of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  IF version.status NOT IN ('draft', 'proposed') THEN
    RAISE EXCEPTION 'the rate records of an approved or signed-off version never change; supersede the version' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  approvals := coalesce(NEW.evidence -> 'approved_fields', '{}'::jsonb);
  IF jsonb_typeof(approvals) <> 'object' THEN
    RAISE EXCEPTION 'evidence.approved_fields is an object of field approvals' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.verified_by IS NOT NULL OR approvals <> '{}'::jsonb THEN
      RAISE EXCEPTION 'a rate record is verified after it is written, field by field' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- What an edit changed loses its approval.
  IF (NEW.evidence - 'approved_fields') IS DISTINCT FROM (OLD.evidence - 'approved_fields') THEN
    approvals := '{}'::jsonb;
  ELSE
    IF NEW.scope IS DISTINCT FROM OLD.scope THEN approvals := approvals - 'scope'; END IF;
    IF NEW.method IS DISTINCT FROM OLD.method THEN approvals := approvals - 'method' - 'parameters'; END IF;
    IF NEW.parameters IS DISTINCT FROM OLD.parameters THEN approvals := approvals - 'parameters'; END IF;
    IF NEW.flags IS DISTINCT FROM OLD.flags THEN approvals := approvals - 'flags'; END IF;
    IF NEW.rounding IS DISTINCT FROM OLD.rounding THEN approvals := approvals - 'rounding'; END IF;
  END IF;
  NEW.evidence := CASE WHEN approvals = '{}'::jsonb THEN NEW.evidence - 'approved_fields' ELSE jsonb_set(NEW.evidence, '{approved_fields}', approvals) END;

  -- A new approval is the acting specialist's, now.
  is_specialist := coalesce(app_actor_platform_permitted('rate_record.approve'), false);
  FOR field, entry IN SELECT key, value FROM jsonb_each(approvals) LOOP
    IF NOT field = ANY (rate_record_fields()) THEN
      RAISE EXCEPTION 'a field approval names one of the rate record''s fields' USING ERRCODE = 'check_violation';
    END IF;
    IF entry IS DISTINCT FROM (OLD.evidence -> 'approved_fields' -> field) THEN
      IF NOT is_specialist THEN
        RAISE EXCEPTION 'only a contract specialist approves a rate record''s fields' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF jsonb_typeof(entry) <> 'object' THEN
        RAISE EXCEPTION 'a field approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
      IF (entry - 'by' - 'at') <> '{}'::jsonb OR (entry ->> 'by') IS DISTINCT FROM app_actor_id()::text
         OR coalesce((entry ->> 'at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?|Z)$', true) THEN
        RAISE EXCEPTION 'a field approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
      IF (entry ->> 'at')::timestamptz IS DISTINCT FROM now() THEN
        RAISE EXCEPTION 'a field approval records the approving specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  IF NEW.verified_by IS NOT NULL THEN
    IF OLD.verified_by IS NULL THEN
      IF NOT is_specialist THEN
        RAISE EXCEPTION 'only a contract specialist verifies a rate record' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.verified_by IS DISTINCT FROM app_actor_id() OR NEW.verified_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION 'a verification records the verifying specialist and the time' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT (SELECT bool_and(approvals ? f) FROM unnest(rate_record_fields()) f) THEN
        RAISE EXCEPTION 'a rate record is verified once each of its fields is approved' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT rate_record_evidence_complete(NEW.evidence) THEN
        RAISE EXCEPTION 'a rate record cannot be approved without evidence naming a document, a page, a quote and a hash' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT ((NEW.evidence ->> 'document_id')::uuid = ANY (version.source_document_ids)) THEN
        RAISE EXCEPTION 'a rate record''s evidence is a document of its version' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF (NEW.verified_by, NEW.verified_at) IS DISTINCT FROM (OLD.verified_by, OLD.verified_at) THEN
      RAISE EXCEPTION 'a verification is recorded once' USING ERRCODE = 'check_violation';
    ELSIF NOT (SELECT bool_and(approvals ? f) FROM unnest(rate_record_fields()) f) THEN
      -- An edit that cleared an approval clears the verification with it.
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rate_record_rules BEFORE INSERT OR UPDATE OR DELETE ON rate_record FOR EACH ROW EXECUTE FUNCTION rate_record_rules();

-- A calendar event belongs to a contract of the same practice and never changes.
CREATE FUNCTION contract_calendar_event_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a calendar event never changes; signing off a new version derives new events' USING ERRCODE = 'check_violation';
  END IF;
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM contract c WHERE c.id = NEW.contract_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a calendar event belongs to a contract of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contract_calendar_event_rules BEFORE INSERT OR UPDATE ON contract_calendar_event FOR EACH ROW EXECUTE FUNCTION contract_calendar_event_rules();

-- A mapping never changes (MAP-03). Its plan, version and the mapping it corrects belong to its
-- practice, a correction corrects a mapping of the same plan, and a new mapping overlaps no mapping of
-- its plan but the ones it supersedes, directly or through them: so on any date at most one mapping
-- of a plan is in force (the last correction covering that date).
CREATE FUNCTION payer_plan_mapping_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a mapping never changes; correct it with a new mapping that supersedes it' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plan p WHERE p.id = NEW.plan_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a mapping maps a plan of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.contract_version_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.id = NEW.contract_version_id AND v.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a mapping names a contract version of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.supersedes_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.id = NEW.supersedes_id AND m.practice_id = NEW.practice_id AND m.plan_id = NEW.plan_id) THEN
    RAISE EXCEPTION 'a correction supersedes a mapping of the same plan' USING ERRCODE = 'check_violation';
  END IF;
  -- One mapping change per plan at a time, so two corrections never pass this check together.
  PERFORM pg_advisory_xact_lock(hashtextextended('payer_plan_mapping:' || NEW.plan_id::text, 0));
  IF EXISTS (
    WITH RECURSIVE ancestor (id, supersedes_id) AS (
      SELECT m.id, m.supersedes_id FROM payer_plan_mapping m WHERE m.id = NEW.supersedes_id
      UNION
      SELECT m.id, m.supersedes_id FROM payer_plan_mapping m JOIN ancestor a ON m.id = a.supersedes_id
    )
    SELECT 1 FROM payer_plan_mapping m
     WHERE m.plan_id = NEW.plan_id AND m.practice_id = NEW.practice_id
       AND daterange(m.effective_from, m.effective_to, '[)') && daterange(NEW.effective_from, NEW.effective_to, '[)')
       AND m.id NOT IN (SELECT a.id FROM ancestor a)
  ) THEN
    RAISE EXCEPTION 'mappings of one plan never overlap: correct the mapping in force with a mapping that supersedes it' USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payer_plan_mapping_rules BEFORE INSERT OR UPDATE ON payer_plan_mapping FOR EACH ROW EXECUTE FUNCTION payer_plan_mapping_rules();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract FORCE ROW LEVEL SECURITY;
CREATE POLICY contract_tenant ON contract
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE contract_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_version FORCE ROW LEVEL SECURITY;
CREATE POLICY contract_version_tenant ON contract_version
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE rate_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_record FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_record_tenant ON rate_record
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE contract_calendar_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_calendar_event FORCE ROW LEVEL SECURITY;
CREATE POLICY contract_calendar_event_tenant ON contract_calendar_event
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Events are derived in the sign-off's transaction, by the person signing off.
CREATE POLICY contract_calendar_event_by_sign_off ON contract_calendar_event AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (app_actor_permitted(practice_id, 'contract.sign_off'));

ALTER TABLE payer_plan_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE payer_plan_mapping FORCE ROW LEVEL SECURITY;
CREATE POLICY payer_plan_mapping_tenant ON payer_plan_mapping
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Nobody records a mapping in another person's name.
CREATE POLICY payer_plan_mapping_mapped_by_actor ON payer_plan_mapping AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (mapped_by = app_actor_id());

-- ---------------------------------------------------------------------------------------------------
-- Privileges: nothing here is deleted by the application but a draft's rate record; a mapping and a
-- calendar event are never updated.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON contract, contract_version, rate_record, contract_calendar_event, payer_plan_mapping FROM PUBLIC;
GRANT SELECT ON contract, contract_version, rate_record, contract_calendar_event, payer_plan_mapping TO tp_app;
GRANT INSERT (id, practice_id, payer_id, title, billing_entity) ON contract TO tp_app;
GRANT INSERT (id, practice_id, contract_id, version_no, source_document_ids, effective_from, effective_to, supersedes_id,
              timely_filing_days, dispute_window_days, appeal_levels, notice_days) ON contract_version TO tp_app;
GRANT UPDATE (source_document_ids, effective_from, effective_to, supersedes_id, timely_filing_days, dispute_window_days, appeal_levels,
              notice_days, status, approved_by, approved_at, signed_off_by, signed_off_at) ON contract_version TO tp_app;
GRANT INSERT (id, practice_id, contract_version_id, scope, method, parameters, flags, rounding, evidence, proposed_by) ON rate_record TO tp_app;
GRANT UPDATE (scope, method, parameters, flags, rounding, evidence, verified_by, verified_at) ON rate_record TO tp_app;
GRANT DELETE ON rate_record TO tp_app;
GRANT INSERT (id, practice_id, contract_id, kind, on_date, note) ON contract_calendar_event TO tp_app;
GRANT INSERT (id, practice_id, plan_id, contract_version_id, mapping_kind, effective_from, effective_to, mapped_by, supersedes_id) ON payer_plan_mapping TO tp_app;

REVOKE ALL ON FUNCTION
  support_grant_role(uuid), uuid_half(uuid, boolean), rate_record_evidence_complete(jsonb), contract_rules(), contract_version_documents_ok(contract_version),
  contract_version_retired_by(contract_version, contract_version, text), contract_version_rules(), contract_version_retired_by_signed_successor(),
  rate_record_fields(), rate_record_rules(), contract_calendar_event_rules(), payer_plan_mapping_rules()
FROM PUBLIC;
-- Called by the triggers, which run as the application role, and by the constraints and the index.
GRANT EXECUTE ON FUNCTION
  support_grant_role(uuid), uuid_half(uuid, boolean), rate_record_evidence_complete(jsonb), contract_version_documents_ok(contract_version),
  contract_version_retired_by(contract_version, contract_version, text), rate_record_fields()
TO tp_app;
