-- Pricing runs and priced lines (PRD 5, J7; PRD 8, pricing_run and priced_line, and Invariants; PRD 9,
-- The release pipeline step 4; PRD 11, Inputs and step 9; Data dictionary, Pricing, triage and cases;
-- test matrix MAP-01 to MAP-05, PRC-12, PRC-14, PRC-15, JOB-01; docs/adr/0029 and 0035).
--
-- Two PHI tables, each with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - pricing_run: a run for a practice and a period (its first and last service dates, inclusive),
--   pinned to a published rule release (the newest one when the run is created: a run against an
--   older release is a rule-release mismatch and is refused), the engine version that prices it and
--   the person who created it. It moves queued -> running -> complete (with its coverage summary and
--   completion time) or failed (with a fixed failure code), and once complete or failed it never
--   changes. Each line's contract version is the one in force on its service date, recorded on the
--   line. A new release, mapping or contract version means a new run.
-- - priced_line: one per run and service line: the mapping, contract version and rate record that
--   priced it (or that were found), the method, expected allowed in cents with the exact unrounded
--   amount beside it (numeric without a scale, so nothing rounds it: docs/adr/0029), observed allowed,
--   the variance, the adjustments applied, the dispute window's last day, or the unpriced reason from
--   the closed list, and the full trace (tp-pricing-trace/1), from which @tp/pricing's recompute()
--   reproduces the amount. Lines are written only while their run is open and never change after.
--
-- Immutability holds for every role, the owner included: triggers refuse any UPDATE of a complete or
-- failed run, any UPDATE or DELETE of a priced line, any DELETE of a run, and TRUNCATE of either.
--
-- Runs as tp_owner. Safe with the previous image running: two new tables; the previous image neither
-- reads nor writes them.

CREATE TABLE pricing_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- The service dates the run prices: [period_from, period_to], both days included.
  period_from date NOT NULL,
  period_to date NOT NULL,
  -- The pinned rule release.
  release_no integer NOT NULL REFERENCES rule_release (release_no),
  -- @tp/pricing's ENGINE_VERSION; the worker prices a run only with that engine.
  engine_version text NOT NULL CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,63}$'),
  created_by uuid NOT NULL REFERENCES "user" (id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  -- The run's summary once complete (tp-pricing-coverage/1): lines and billed dollars priced and in
  -- all, the unpriced reasons by count, the contract versions used and the variance by payer pattern.
  coverage jsonb CHECK (jsonb_typeof(coverage) = 'object'),
  -- Why a run failed, as a fixed code (engine_version_mismatch, unmapped_plan, job_failed).
  failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_run_period CHECK (period_from <= period_to),
  CONSTRAINT pricing_run_coverage_when_complete CHECK ((status = 'complete') = (coverage IS NOT NULL)),
  CONSTRAINT pricing_run_completed_when_complete CHECK ((status = 'complete') = (completed_at IS NOT NULL)),
  CONSTRAINT pricing_run_failure_when_failed CHECK ((status = 'failed') = (failure_code IS NOT NULL))
);
CREATE INDEX pricing_run_by_practice ON pricing_run (practice_id, created_at DESC, id);
CREATE INDEX pricing_run_complete_by_practice ON pricing_run (practice_id, completed_at DESC) WHERE status = 'complete';

CREATE TABLE priced_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  pricing_run_id uuid NOT NULL REFERENCES pricing_run (id),
  service_line_id uuid NOT NULL REFERENCES service_line (id),
  -- What the agreement resolved to, as far as it got: the mapping in force, and for a contract the
  -- signed-off version in force on the service date and its rate record.
  mapping_id uuid REFERENCES payer_plan_mapping (id),
  contract_version_id uuid REFERENCES contract_version (id),
  rate_record_id uuid REFERENCES rate_record (id),
  method text CHECK (method IN ('FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED')),
  -- Whole cents after the one rounding, and the exact amount before it.
  expected_allowed_cents bigint,
  expected_unrounded numeric,
  observed_allowed_cents bigint NOT NULL,
  -- Expected allowed minus observed allowed; negative is an overpayment, recorded and never pursued.
  variance_cents bigint,
  unpriced_reason text CHECK (unpriced_reason IN (
    'NO_AGREEMENT', 'NO_MAPPING', 'AMBIGUOUS_RATE', 'NO_RATE_FOR_CODE', 'NO_PFS_VALUE', 'UNSUPPORTED_METHOD',
    'SECONDARY_PAYER', 'MUE_EXCEEDED', 'UNITS_RULE_UNKNOWN', 'DATE_OUTSIDE_VERSIONS', 'REVERSED_CLAIM', 'ENGINE_ERROR'
  )),
  -- [{"name": "mppr", "before_cents": "...", "after_cents": "..."}, ...] in the order they applied.
  adjustments_applied jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(adjustments_applied) = 'array'),
  -- The last day a dispute can be filed (PRD 11 step 8); null when no window is known.
  window_ends_on date,
  trace jsonb NOT NULL CHECK (jsonb_typeof(trace) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT priced_line_once UNIQUE (pricing_run_id, service_line_id),
  -- A line is priced or carries exactly one reason, never both and never neither.
  CONSTRAINT priced_line_priced_or_unpriced CHECK ((unpriced_reason IS NULL) = (expected_allowed_cents IS NOT NULL)),
  CONSTRAINT priced_line_priced_amounts CHECK (
    expected_allowed_cents IS NULL
    OR (expected_allowed_cents >= 0 AND expected_unrounded IS NOT NULL AND abs(expected_unrounded - expected_allowed_cents) < 1
        AND variance_cents IS NOT NULL AND variance_cents = expected_allowed_cents - observed_allowed_cents AND method IS NOT NULL)
  ),
  CONSTRAINT priced_line_unpriced_amounts CHECK (
    expected_allowed_cents IS NOT NULL
    OR (expected_unrounded IS NULL AND variance_cents IS NULL AND window_ends_on IS NULL AND adjustments_applied = '[]'::jsonb)
  ),
  CONSTRAINT priced_line_rate_names_its_version CHECK (rate_record_id IS NULL OR contract_version_id IS NOT NULL),
  CONSTRAINT priced_line_version_names_its_mapping CHECK (contract_version_id IS NULL OR mapping_id IS NOT NULL)
);
CREATE INDEX priced_line_by_reason ON priced_line (pricing_run_id, unpriced_reason);
CREATE INDEX priced_line_underpaid ON priced_line (practice_id, variance_cents DESC) WHERE variance_cents > 0;
-- A line's results across runs (Claims and lines and the line trace read the latest complete run's).
CREATE INDEX priced_line_by_service_line ON priced_line (practice_id, service_line_id);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('pricing_run', '20261018090000_pricing_runs', 'pricing_run_tenant'),
  ('priced_line', '20261018090000_pricing_runs', 'priced_line_tenant');

-- ---------------------------------------------------------------------------------------------------
-- Rules. Lookups of other rows run under the caller's policies; a row whose practice is outside the
-- transaction's scope is left to the tenant policy, which refuses it.
-- ---------------------------------------------------------------------------------------------------

CREATE TRIGGER pricing_run_updated_at BEFORE UPDATE ON pricing_run FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A run is created queued, pinned to the newest published rule release (J7: a rule-release mismatch
-- is refused). It moves queued -> running -> complete or failed, changes nothing else on the way, and
-- never changes again once complete or failed; a run is never deleted. Its completion records the
-- coverage of exactly the lines it holds.
CREATE FUNCTION pricing_run_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  lines bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a pricing run is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.coverage IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
      RAISE EXCEPTION 'a pricing run starts queued' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rule_release r WHERE r.release_no = NEW.release_no AND r.published_at IS NOT NULL)
       OR EXISTS (SELECT 1 FROM rule_release r WHERE r.release_no > NEW.release_no AND r.published_at IS NOT NULL) THEN
      RAISE EXCEPTION 'rule-release mismatch: a pricing run pins the newest published rule release' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.release_no, NEW.engine_version, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.release_no, OLD.engine_version, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a pricing run''s practice, period, release, engine and creator never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('complete', 'failed') THEN
    RAISE EXCEPTION 'a pricing run never changes once it is complete or failed; a new release or mapping means a new run' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'running' AND OLD.status = 'queued' OR NEW.status = OLD.status THEN
    IF (NEW.coverage, NEW.completed_at, NEW.failure_code) IS DISTINCT FROM (OLD.coverage, OLD.completed_at, OLD.failure_code) THEN
      RAISE EXCEPTION 'an open pricing run records its coverage when it completes and its failure when it fails' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'complete' THEN
    IF NEW.completed_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'a pricing run''s completion records the time it completed' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO lines FROM priced_line p WHERE p.pricing_run_id = NEW.id;
    IF (NEW.coverage ->> 'lines') IS DISTINCT FROM lines::text THEN
      RAISE EXCEPTION 'a complete pricing run''s coverage counts exactly the lines it priced' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'failed' THEN
    IF EXISTS (SELECT 1 FROM priced_line p WHERE p.pricing_run_id = NEW.id) THEN
      RAISE EXCEPTION 'a failed pricing run holds no priced lines' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'a pricing run moves queued, running, then complete or failed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pricing_run_rules BEFORE INSERT OR UPDATE OR DELETE ON pricing_run FOR EACH ROW EXECUTE FUNCTION pricing_run_rules();

-- A priced line never changes and is never removed.
CREATE FUNCTION priced_line_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'a priced line never changes; a new run prices the line again' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER priced_line_immutable BEFORE UPDATE OR DELETE ON priced_line FOR EACH ROW EXECUTE FUNCTION priced_line_immutable();

-- Lines join an open run of their own practice, and price a service line, mapping, contract version
-- and rate record of that practice: checked once per statement over the rows it inserted.
CREATE FUNCTION priced_line_rows_belong() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM inserted i LEFT JOIN pricing_run r ON r.id = i.pricing_run_id AND r.practice_id = i.practice_id
     WHERE r.id IS NULL OR r.status NOT IN ('queued', 'running')
  ) THEN
    RAISE EXCEPTION 'a priced line joins an open pricing run of its practice; a complete run never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM inserted i
     WHERE NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = i.service_line_id AND l.practice_id = i.practice_id)
        OR (i.mapping_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.id = i.mapping_id AND m.practice_id = i.practice_id))
        OR (i.contract_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.id = i.contract_version_id AND v.practice_id = i.practice_id))
        OR (i.rate_record_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM rate_record x WHERE x.id = i.rate_record_id AND x.practice_id = i.practice_id AND x.contract_version_id = i.contract_version_id))
  ) THEN
    RAISE EXCEPTION 'a priced line prices a service line under a mapping, version and rate record of its own practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER priced_line_rows_belong AFTER INSERT ON priced_line REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION priced_line_rows_belong();

CREATE FUNCTION pricing_no_truncate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: pricing runs and their lines are kept as they were priced', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER pricing_run_no_truncate BEFORE TRUNCATE ON pricing_run FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate();
CREATE TRIGGER priced_line_no_truncate BEFORE TRUNCATE ON priced_line FOR EACH STATEMENT EXECUTE FUNCTION pricing_no_truncate();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE pricing_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_run FORCE ROW LEVEL SECURITY;
CREATE POLICY pricing_run_tenant ON pricing_run
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Nobody creates a run in another person's name.
CREATE POLICY pricing_run_created_by_actor ON pricing_run AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (created_by = app_actor_id());

ALTER TABLE priced_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE priced_line FORCE ROW LEVEL SECURITY;
CREATE POLICY priced_line_tenant ON priced_line
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

-- ---------------------------------------------------------------------------------------------------
-- Privileges: a run is created by a person and moved on by the price job; a priced line is inserted
-- by the price job and never updated or deleted by anyone.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON pricing_run, priced_line FROM PUBLIC;
GRANT SELECT ON pricing_run, priced_line TO tp_app;
GRANT INSERT (id, practice_id, period_from, period_to, release_no, engine_version, created_by) ON pricing_run TO tp_app;
GRANT UPDATE (status, coverage, failure_code, completed_at) ON pricing_run TO tp_app;
GRANT INSERT (id, practice_id, pricing_run_id, service_line_id, mapping_id, contract_version_id, rate_record_id, method, expected_allowed_cents,
              expected_unrounded, observed_allowed_cents, variance_cents, unpriced_reason, adjustments_applied, window_ends_on, trace) ON priced_line TO tp_app;

REVOKE ALL ON FUNCTION pricing_run_rules(), priced_line_immutable(), priced_line_rows_belong(), pricing_no_truncate() FROM PUBLIC;
