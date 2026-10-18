-- The free screening layer (Change Order 001, CO-04 and CO-12's four screening tables; reconciliation-001 decisions
-- D18 (a), D19 (a), D20 (a) and D21 (a), approved 2026-10-17; milestone 6 follow-up). Decisions: docs/adr/0062,
-- 0053 (prospect_request, the public form's pattern this copies), 0029 (the engine), 0038 (the $5 anomaly default),
-- 0014 and 0019 (platform jobs as the operator role).
--
-- A prospect uploads an aggregate file (one row per code, modifier set, units, place of service, payer product and
-- service-date band, with the allowed total and the claim count) and is emailed a link to what the unchanged engine
-- expects under Medicare for each row. Nothing here is PHI and nothing names a practice: the browser parses the
-- file, the server checks its header names and typed rows, and no byte of it is stored, only its SHA-256, its row
-- count and, when refused, the reasons by code, column position and kind (never a header's text or a cell).
--
-- - screening_prospect: the practice's name, state, five-digit ZIP and the contact address the result link goes to.
--   No ZIP+4: the engine takes a five-digit ZIP alone, so a ZIP whose locality_map record needs its ZIP+4 is refused
--   (screening_zip_plus_four) rather than asked for a ZIP+4 nothing could use.
-- - screening_upload: one file a prospect sent: its hash, its row count, accepted or rejected, and the reasons.
-- - screening_place_of_service_split: the platform's default facility or non-facility setting per place of
--   service, approved by a contract specialist (rate_record.approve; a person, never a model), append-only; the
--   latest approval is in force. A fifth table beside CO-12's four: the engine needs a split and no rule record
--   carries one (fixtures/golden/QUESTIONS.md, Q08).
-- - screening_run: an accepted upload priced under the release in force and the split in force, both pinned at
--   creation, then queued, pricing, complete or failed. Only the SHA-256 of the result link's token is stored.
-- - screening_result: one row per uploaded row, its facts as decoded and, once priced, the engine's figures:
--   the expected line amount (rounded once by the engine, with the unrounded value beside it) times the claim
--   count, in bigint, outside the engine (D19 a), the difference from the allowed total in the file, and whether the
--   engine ranked the code in the reduction across a visit's codes (so a difference there is not called an anomaly on
--   a figure priced alone). MA contracted and commercial rows are never priced (contract_required); medicaid and
--   other rows are not screened.
--
-- The tables live in schema public with row-level security forced and one policy, the owner's; they have no
-- practice_id and no phi_table_registry row, and no role but the owner reads or writes them. The application role
-- reaches them only through the SECURITY DEFINER functions below (submit, reject, read by token, convert, and the
-- console's split), the operator role (platform jobs) only through operator_screening_*(). Nothing is recorded while
-- screening is closed. Every row expires 30 days after the upload: the reads refuse it from expires_at on, and the
-- screening_expiry job deletes it. A run is priced only under its pinned release while that release is published,
-- its manifest unchanged and not withdrawn; a result whose release has since been withdrawn says so. The conversion
-- to an audit request is an audit event (screening_converted) and outlives the expiry.
--
-- Runs as tp_owner. Safe with the previous image running: yes. Added: five tables, their CHECK and trigger
-- functions, the definer functions and their grants. Altered or removed: nothing; no existing table, function,
-- policy, CHECK or grant changes, and no DDL touches a rule, ledger or pricing table. Rollout: migrate, then the
-- new worker (it creates the screening queues), then the new web; a submission whose job cannot be sent yet stays
-- queued and the minute sweep prices it.

-- ---------------------------------------------------------------------------------------------------
-- What a row may hold
-- ---------------------------------------------------------------------------------------------------

-- An upload's rejection reasons: at most 20, each an object of these keys only: a code, and where it applies the
-- column's position (1 to 64), a row (1 to 10,000,000), the first row of a run of them, the field (one of the
-- eight columns) and the PHI kind. Never a header's text or a cell's value.
CREATE FUNCTION screening_rejection_valid(reason jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(reason) IS DISTINCT FROM 'object' THEN false ELSE coalesce(
       jsonb_typeof(reason -> 'code') = 'string'
   AND (reason ->> 'code') IN ('phi_column', 'unknown_column', 'duplicate_column', 'missing_column', 'row_shape', 'invalid_value', 'band_holds_date',
                               'band_in_future', 'duplicate_row', 'no_rows', 'too_many_rows', 'row_count_mismatch')
   AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(reason) k WHERE k NOT IN ('code', 'column', 'row', 'first_row', 'field', 'phi'))
   AND (NOT reason ? 'column' OR (jsonb_typeof(reason -> 'column') = 'number' AND (reason ->> 'column') ~ '^[1-9][0-9]?$' AND (reason ->> 'column')::integer <= 64))
   AND (NOT reason ? 'row' OR (jsonb_typeof(reason -> 'row') = 'number' AND (reason ->> 'row') ~ '^[1-9][0-9]{0,7}$' AND (reason ->> 'row')::integer <= 10000000))
   AND (NOT reason ? 'first_row' OR (jsonb_typeof(reason -> 'first_row') = 'number' AND (reason ->> 'first_row') ~ '^[1-9][0-9]{0,7}$' AND (reason ->> 'first_row')::integer <= 10000000))
   AND (NOT reason ? 'field' OR (jsonb_typeof(reason -> 'field') = 'string'
        AND (reason ->> 'field') IN ('procedure_code', 'modifiers', 'units', 'place_of_service', 'payer_product', 'service_band', 'allowed_total', 'claim_count')))
   AND (NOT reason ? 'phi' OR (jsonb_typeof(reason -> 'phi') = 'string'
        AND (reason ->> 'phi') IN ('name', 'date_of_birth', 'member_id', 'date_of_service', 'claim_number'))), false)
  END
$$;

CREATE FUNCTION screening_rejections_valid(reasons jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(reasons) IS DISTINCT FROM 'array' THEN false
              WHEN jsonb_array_length(reasons) > 20 THEN false
              ELSE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(reasons) r WHERE NOT screening_rejection_valid(r)) END
$$;

-- A place-of-service split: an object of 1 to 99 places (two digits, 01 to 99), each facility or non_facility.
CREATE FUNCTION screening_split_valid(settings jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(settings) IS DISTINCT FROM 'object' THEN false ELSE coalesce(
       (SELECT count(*) FROM jsonb_object_keys(settings)) BETWEEN 1 AND 99
   AND NOT EXISTS (SELECT 1 FROM jsonb_each(settings) e
                    WHERE e.key !~ '^(0[1-9]|[1-9][0-9])$' OR jsonb_typeof(e.value) <> 'string' OR (e.value #>> '{}') NOT IN ('facility', 'non_facility')), false)
  END
$$;

-- A row's modifier set: at most four two-character modifiers, distinct and in ascending (byte) order, so one set
-- has one spelling and the uniqueness of a row's key holds.
CREATE FUNCTION screening_modifiers_valid(modifiers text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(cardinality(modifiers) <= 4
     AND (cardinality(modifiers) = 0 OR (array_ndims(modifiers) = 1 AND array_lower(modifiers, 1) = 1))
     AND array_position(modifiers, NULL) IS NULL
     AND array_to_string(modifiers, ' ') ~ '^([0-9A-Z]{2}( [0-9A-Z]{2}){0,3})?$'
     AND (cardinality(modifiers) < 2 OR modifiers[1] COLLATE "C" < modifiers[2] COLLATE "C")
     AND (cardinality(modifiers) < 3 OR modifiers[2] COLLATE "C" < modifiers[3] COLLATE "C")
     AND (cardinality(modifiers) < 4 OR modifiers[3] COLLATE "C" < modifiers[4] COLLATE "C"), false)
$$;

-- A screening's prospect, upload and run are kept until they expire, then deleted together (screening_expiry).
CREATE FUNCTION screening_kept_until_expiry() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.expires_at > now() THEN
    RAISE EXCEPTION 'a screening is kept until it expires, 30 days after its upload' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_kept_until_expiry';
  END IF;
  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Prospects and uploads
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE screening_prospect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name text NOT NULL CONSTRAINT screening_prospect_practice_name
    CHECK (btrim(practice_name) <> '' AND length(practice_name) <= 200 AND practice_name = btrim(practice_name)),
  -- The 50 states, DC, and the territories USPS serves (PR, VI, GU, AS, MP); format.ts holds the same list.
  state text NOT NULL CONSTRAINT screening_prospect_state CHECK (state IN (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP')),
  zip text NOT NULL CONSTRAINT screening_prospect_zip CHECK (zip ~ '^[0-9]{5}$'),
  -- An address the mail service can send to, lower case: an RFC 5322 dot-atom before the @ (no leading, trailing or
  -- doubled dot) of at most 64 characters, a domain of two or more labels after it with no trailing dot, plain ASCII.
  contact_email text NOT NULL CONSTRAINT screening_prospect_contact_email
    CHECK (contact_email ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
           AND length(contact_email) <= 254 AND strpos(contact_email, '@') <= 65 AND contact_email = lower(contact_email)),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT screening_prospect_expiry CHECK (expires_at = created_at + interval '30 days')
);
CREATE INDEX screening_prospect_by_expiry ON screening_prospect (expires_at);

CREATE TABLE screening_upload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES screening_prospect (id) ON DELETE CASCADE,
  file_sha256 text NOT NULL CONSTRAINT screening_upload_file_sha256 CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CONSTRAINT screening_upload_row_count CHECK (row_count BETWEEN 0 AND 10000000),
  status text NOT NULL CONSTRAINT screening_upload_status CHECK (status IN ('accepted', 'rejected')),
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT screening_upload_reasons CHECK (screening_rejections_valid(rejection_reasons)),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT screening_upload_rejected CHECK (
    (status = 'rejected') = (CASE WHEN jsonb_typeof(rejection_reasons) = 'array' THEN jsonb_array_length(rejection_reasons) > 0 ELSE false END)),
  CONSTRAINT screening_upload_accepted_rows CHECK (status <> 'accepted' OR row_count BETWEEN 1 AND 50000),
  CONSTRAINT screening_upload_expiry CHECK (expires_at = created_at + interval '30 days')
);
CREATE INDEX screening_upload_by_prospect ON screening_upload (prospect_id);

-- ---------------------------------------------------------------------------------------------------
-- The place-of-service split the specialist approves
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE screening_place_of_service_split (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings jsonb NOT NULL CONSTRAINT screening_place_of_service_split_settings CHECK (screening_split_valid(settings)),
  approved_by uuid NOT NULL REFERENCES "user" (id),
  approved_at timestamptz NOT NULL DEFAULT now()
);
-- The split in force: the latest approval, its id breaking a tie.
CREATE INDEX screening_place_of_service_split_in_force ON screening_place_of_service_split (approved_at DESC, id DESC);
CREATE TRIGGER screening_place_of_service_split_append_only BEFORE UPDATE OR DELETE ON screening_place_of_service_split
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_place_of_service_split_no_truncate BEFORE TRUNCATE ON screening_place_of_service_split
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- ---------------------------------------------------------------------------------------------------
-- Runs and results
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE screening_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL UNIQUE REFERENCES screening_upload (id) ON DELETE CASCADE,
  -- The release in force when the run was created (current_rule_release()); deliberately no foreign key, so no
  -- DDL touches rule_release. The manifest's SHA-256 pins its content.
  release_no integer NOT NULL CONSTRAINT screening_run_release_no CHECK (release_no > 0),
  release_manifest_sha256 text NOT NULL CONSTRAINT screening_run_release_manifest CHECK (release_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  place_of_service_split_id uuid NOT NULL REFERENCES screening_place_of_service_split (id),
  row_count integer NOT NULL CONSTRAINT screening_run_row_count CHECK (row_count BETWEEN 1 AND 50000),
  status text NOT NULL DEFAULT 'queued' CONSTRAINT screening_run_status CHECK (status IN ('queued', 'pricing', 'complete', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CONSTRAINT screening_run_attempts CHECK (attempts BETWEEN 0 AND 3),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  engine_version text CONSTRAINT screening_run_engine_version CHECK (engine_version ~ '^[a-z0-9][a-z0-9./-]{0,31}$'),
  failure_code text CONSTRAINT screening_run_failure_code CHECK (failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  -- The SHA-256 of the result link's token; the token itself is never stored.
  result_token_sha256 text UNIQUE CONSTRAINT screening_run_result_token CHECK (result_token_sha256 ~ '^[0-9a-f]{64}$'),
  converted_prospect_request_id uuid REFERENCES prospect_request (id),
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT screening_run_complete CHECK (
    (status = 'complete') = (result_token_sha256 IS NOT NULL)
    AND (status = 'complete') = (completed_at IS NOT NULL)
    AND (status = 'complete') = (engine_version IS NOT NULL)),
  CONSTRAINT screening_run_failed CHECK ((status = 'failed') = (failure_code IS NOT NULL) AND (status = 'failed') = (failed_at IS NOT NULL)),
  CONSTRAINT screening_run_started CHECK (
    (status <> 'queued' OR (started_at IS NULL AND attempts = 0))
    AND (status NOT IN ('pricing', 'complete') OR (started_at IS NOT NULL AND attempts >= 1))),
  CONSTRAINT screening_run_converted CHECK (
    (converted_at IS NULL) = (converted_prospect_request_id IS NULL) AND (converted_at IS NULL OR status = 'complete')),
  CONSTRAINT screening_run_expiry CHECK (expires_at = created_at + interval '30 days')
);
CREATE INDEX screening_run_by_status ON screening_run (status, created_at);

-- A run keeps its upload, release, split, row count and dates; it moves queued to pricing (a stale run is claimed
-- again, one attempt more), pricing to complete or failed, or queued to failed; its token and its conversion are
-- each set once.
CREATE FUNCTION screening_run_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.id, NEW.upload_id, NEW.release_no, NEW.release_manifest_sha256, NEW.place_of_service_split_id, NEW.row_count, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM (OLD.id, OLD.upload_id, OLD.release_no, OLD.release_manifest_sha256, OLD.place_of_service_split_id, OLD.row_count, OLD.created_at, OLD.expires_at) THEN
    RAISE EXCEPTION 'a screening run keeps its upload, release, split, row count and dates' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'pricing' AND OLD.status IN ('queued', 'pricing') THEN
    IF NEW.attempts <> OLD.attempts + 1 OR NEW.started_at IS NOT DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'a screening run is claimed one attempt at a time, from when it is claimed' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (OLD.status = 'pricing' AND NEW.status IN ('complete', 'failed')) OR (OLD.status = 'queued' AND NEW.status = 'failed') THEN
    IF NEW.attempts <> OLD.attempts OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'a screening run ends on the attempt that priced it' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.converted_at IS NOT NULL THEN
      RAISE EXCEPTION 'a screening converts once it is complete' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'complete' AND NEW.status = 'complete' THEN
    IF (NEW.attempts, NEW.started_at, NEW.completed_at, NEW.engine_version, NEW.result_token_sha256)
       IS DISTINCT FROM (OLD.attempts, OLD.started_at, OLD.completed_at, OLD.engine_version, OLD.result_token_sha256) THEN
      RAISE EXCEPTION 'a complete screening keeps its result and its link' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.converted_at IS NOT NULL OR NEW.converted_at IS NULL THEN
      RAISE EXCEPTION 'a screening converts to an audit request once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_converted_once';
    END IF;
  ELSE
    RAISE EXCEPTION 'a screening run moves queued, pricing, then complete or failed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_run_rules BEFORE UPDATE ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_run_rules();

CREATE TABLE screening_result (
  run_id uuid NOT NULL REFERENCES screening_run (id) ON DELETE CASCADE,
  row_no integer NOT NULL CONSTRAINT screening_result_row_no CHECK (row_no BETWEEN 1 AND 50000),
  -- CPT Category I, II, III, PLA and MAAA, or HCPCS Level II: five letters (a name) are never a code.
  procedure_code text NOT NULL CONSTRAINT screening_result_procedure_code CHECK (procedure_code ~ '^([0-9]{4}[0-9FMTU]|[A-V][0-9]{4})$'),
  modifiers text[] NOT NULL CONSTRAINT screening_result_modifiers CHECK (screening_modifiers_valid(modifiers)),
  units integer NOT NULL CONSTRAINT screening_result_units CHECK (units BETWEEN 1 AND 999),
  place_of_service text NOT NULL CONSTRAINT screening_result_place_of_service CHECK (place_of_service ~ '^(0[1-9]|[1-9][0-9])$'),
  payer_product text NOT NULL CONSTRAINT screening_result_payer_product
    CHECK (payer_product IN ('medicare_ffs', 'ma_noncontracted', 'ma_contracted', 'commercial', 'medicaid', 'other')),
  service_band text NOT NULL CONSTRAINT screening_result_service_band CHECK (service_band ~ '^20[0-9]{2}-Q[1-4]$'),
  claim_count integer NOT NULL CONSTRAINT screening_result_claim_count CHECK (claim_count BETWEEN 1 AND 100000),
  -- At most $25,000.00 a claim line, so an identifier typed under the allowed total is refused, never kept as dollars.
  observed_allowed_cents bigint NOT NULL CONSTRAINT screening_result_observed
    CHECK (observed_allowed_cents BETWEEN 0 AND 99999999999 AND observed_allowed_cents <= 2500000::bigint * claim_count),
  disposition text NOT NULL CONSTRAINT screening_result_disposition
    CHECK (disposition IN ('pending', 'priced', 'unpriced', 'rates_change_in_band', 'contract_required', 'not_screened')),
  -- The engine's amount for one line of the row (rounded once, its unrounded value beside it), and that amount
  -- times the claim count, in bigint, and its difference from the allowed total in the file.
  expected_line_cents bigint,
  expected_line_unrounded numeric,
  expected_cents bigint,
  difference_cents bigint,
  -- The engine's trace of the one-line claim ranked its code in the reduction across a visit's codes (the mppr
  -- adjustment's in_pool): a visit with several such codes prices lower than the rows priced alone.
  in_reduction_pool boolean,
  unpriced_reason text CONSTRAINT screening_result_unpriced_reason CHECK (unpriced_reason IN (
    'NO_AGREEMENT', 'NO_MAPPING', 'AMBIGUOUS_RATE', 'NO_RATE_FOR_CODE', 'NO_PFS_VALUE', 'UNSUPPORTED_METHOD', 'SECONDARY_PAYER',
    'MUE_EXCEEDED', 'UNITS_RULE_UNKNOWN', 'DATE_OUTSIDE_VERSIONS', 'REVERSED_CLAIM', 'ENGINE_ERROR')),
  unpriced_detail text CONSTRAINT screening_result_unpriced_detail CHECK (unpriced_detail ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- The SHA-256 of the engine's trace for the row's one-line claim.
  trace_sha256 text CONSTRAINT screening_result_trace_sha256 CHECK (trace_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (run_id, row_no),
  CONSTRAINT screening_result_once UNIQUE (run_id, procedure_code, modifiers, units, place_of_service, payer_product, service_band),
  -- MA contracted and commercial rows are never priced as non-contracted: they cannot be priced without a contract.
  CONSTRAINT screening_result_contract_required CHECK ((payer_product IN ('ma_contracted', 'commercial')) = (disposition = 'contract_required')),
  CONSTRAINT screening_result_not_screened CHECK ((payer_product IN ('medicaid', 'other')) = (disposition = 'not_screened')),
  CONSTRAINT screening_result_medicare CHECK (
    payer_product NOT IN ('medicare_ffs', 'ma_noncontracted') OR disposition IN ('pending', 'priced', 'unpriced', 'rates_change_in_band')),
  CONSTRAINT screening_result_priced CHECK (
    (disposition = 'priced') = (expected_line_cents IS NOT NULL)
    AND (disposition = 'priced') = (expected_line_unrounded IS NOT NULL)
    AND (disposition = 'priced') = (expected_cents IS NOT NULL)
    AND (disposition = 'priced') = (difference_cents IS NOT NULL)
    AND (disposition = 'priced') = (in_reduction_pool IS NOT NULL)),
  CONSTRAINT screening_result_figures CHECK (
    disposition <> 'priced'
    OR (expected_line_cents >= 0 AND abs(expected_line_unrounded - expected_line_cents) < 1
        AND expected_cents = expected_line_cents * claim_count AND difference_cents = expected_cents - observed_allowed_cents)),
  CONSTRAINT screening_result_unpriced CHECK (
    (disposition = 'unpriced') = (unpriced_reason IS NOT NULL) AND (unpriced_detail IS NULL OR unpriced_reason IN ('ENGINE_ERROR', 'NO_PFS_VALUE'))),
  CONSTRAINT screening_result_trace CHECK ((disposition IN ('priced', 'unpriced', 'rates_change_in_band')) = (trace_sha256 IS NOT NULL))
);
-- The rows a run has still to price, in order.
CREATE INDEX screening_result_pending ON screening_result (run_id, row_no) WHERE disposition = 'pending';

-- Rows are inserted with their run, while it is queued, before any is priced.
CREATE FUNCTION screening_result_inserted() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM screening_inserted a LEFT JOIN screening_run r ON r.id = a.run_id
              WHERE r.status IS DISTINCT FROM 'queued' OR a.disposition NOT IN ('pending', 'contract_required', 'not_screened')) THEN
    RAISE EXCEPTION 'a screening''s rows are inserted with its run, before it is priced' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER screening_result_inserted AFTER INSERT ON screening_result REFERENCING NEW TABLE AS screening_inserted
  FOR EACH STATEMENT EXECUTE FUNCTION screening_result_inserted();

-- A row's facts never change; its disposition moves once, from pending to what pricing found.
CREATE FUNCTION screening_result_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.run_id, NEW.row_no, NEW.procedure_code, NEW.modifiers, NEW.units, NEW.place_of_service, NEW.payer_product, NEW.service_band, NEW.claim_count, NEW.observed_allowed_cents)
     IS DISTINCT FROM (OLD.run_id, OLD.row_no, OLD.procedure_code, OLD.modifiers, OLD.units, OLD.place_of_service, OLD.payer_product, OLD.service_band, OLD.claim_count, OLD.observed_allowed_cents) THEN
    RAISE EXCEPTION 'a screening row keeps the facts it was uploaded with' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.disposition <> 'pending' OR NEW.disposition NOT IN ('priced', 'unpriced', 'rates_change_in_band') THEN
    RAISE EXCEPTION 'a screening row is priced once, from pending' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER screening_result_rules BEFORE UPDATE ON screening_result FOR EACH ROW EXECUTE FUNCTION screening_result_rules();

-- Prospects and uploads never change; the three are deleted only once expired, and never truncated.
CREATE TRIGGER screening_prospect_fixed BEFORE UPDATE ON screening_prospect FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_upload_fixed BEFORE UPDATE ON screening_upload FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_prospect_kept_until_expiry BEFORE DELETE ON screening_prospect FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry();
CREATE TRIGGER screening_upload_kept_until_expiry BEFORE DELETE ON screening_upload FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry();
CREATE TRIGGER screening_run_kept_until_expiry BEFORE DELETE ON screening_run FOR EACH ROW EXECUTE FUNCTION screening_kept_until_expiry();
CREATE TRIGGER screening_prospect_no_truncate BEFORE TRUNCATE ON screening_prospect FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_upload_no_truncate BEFORE TRUNCATE ON screening_upload FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_run_no_truncate BEFORE TRUNCATE ON screening_run FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
CREATE TRIGGER screening_result_no_truncate BEFORE TRUNCATE ON screening_result FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- Every table forces row-level security; the owner's policy serves the definer functions below, and no other role
-- holds a privilege on any of them.
ALTER TABLE screening_prospect ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_prospect FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_prospect_owner ON screening_prospect FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_upload FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_upload_owner ON screening_upload FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_place_of_service_split ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_place_of_service_split FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_place_of_service_split_owner ON screening_place_of_service_split FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_run FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_run_owner ON screening_run FOR ALL TO tp_owner USING (true) WITH CHECK (true);
ALTER TABLE screening_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_result FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_result_owner ON screening_result FOR ALL TO tp_owner USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------------------------------
-- The public form (tp_app)
-- ---------------------------------------------------------------------------------------------------

-- The split in force: the latest approval.
CREATE FUNCTION screening_split_in_force() RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.id FROM screening_place_of_service_split s ORDER BY s.approved_at DESC, s.id DESC LIMIT 1
$$;

-- Whether screening is open: the release in force and the split in force, or nulls when either is missing
-- (production stays closed until release 1 is published).
CREATE FUNCTION screening_status() RETURNS TABLE (release_no integer, place_of_service_split_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN o.split IS NULL THEN NULL ELSE o.release END, CASE WHEN o.release IS NULL THEN NULL ELSE o.split END
    FROM (SELECT current_rule_release() AS release, screening_split_in_force() AS split) o
$$;

-- Whether the release in force maps the five-digit ZIP to a locality, and whether it needs the ZIP+4 to (such a ZIP
-- is refused: the engine takes a five-digit ZIP alone).
CREATE FUNCTION screening_zip_status(zip5 text) RETURNS TABLE (known boolean, plus_four_required boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT count(*) > 0, coalesce(bool_or((r.value ->> 'plus_four_required')::boolean), false)
    FROM rule_record r
   WHERE r.release_no = current_rule_release() AND r.record_type = 'locality_map' AND r.key = jsonb_build_object('zip', zip5)
$$;

-- An accepted upload: the prospect, the upload (hash and row count), a queued run pinned to the release and the
-- split in force, and every row, decoded and checked by the server; the arrays are the rows' columns in order
-- (modifier sets space-joined, '' for none). Returns the run. A ZIP the release maps to no locality, or to one that
-- needs its ZIP+4, is refused. The tables' CHECKs and the row key's uniqueness hold the rest; nothing in an error
-- names a value.
CREATE FUNCTION submit_screening(practice text, state_code text, zip5 text, email text, file_sha256 text, codes text[], modifier_sets text[],
  unit_counts integer[], places text[], products text[], bands text[], allowed_cents bigint[], claim_counts integer[], request text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  in_force integer := current_rule_release();
  manifest text;
  split uuid := screening_split_in_force();
  zip_known boolean;
  plus_four boolean;
  n integer := coalesce(cardinality(codes), 0);
  created uuid;
BEGIN
  SELECT r.manifest_sha256 INTO manifest FROM rule_release r WHERE r.release_no = in_force;
  IF in_force IS NULL OR manifest IS NULL OR split IS NULL THEN
    RAISE EXCEPTION 'screening is closed until a rule release is in force and a place-of-service split is approved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_closed';
  END IF;
  SELECT z.known, z.plus_four_required INTO zip_known, plus_four FROM screening_zip_status(zip5) z;
  IF NOT zip_known THEN
    RAISE EXCEPTION 'the rule release in force maps no locality for this ZIP code' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_zip_unknown';
  END IF;
  IF plus_four THEN
    RAISE EXCEPTION 'this ZIP code spans two localities, and the engine takes a five-digit ZIP alone' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_zip_plus_four';
  END IF;
  IF n NOT BETWEEN 1 AND 50000
     OR array_ndims(codes) <> 1 OR array_ndims(modifier_sets) IS DISTINCT FROM 1 OR array_ndims(unit_counts) IS DISTINCT FROM 1
     OR array_ndims(places) IS DISTINCT FROM 1 OR array_ndims(products) IS DISTINCT FROM 1 OR array_ndims(bands) IS DISTINCT FROM 1
     OR array_ndims(allowed_cents) IS DISTINCT FROM 1 OR array_ndims(claim_counts) IS DISTINCT FROM 1
     OR cardinality(modifier_sets) <> n OR cardinality(unit_counts) <> n OR cardinality(places) <> n OR cardinality(products) <> n
     OR cardinality(bands) <> n OR cardinality(allowed_cents) <> n OR cardinality(claim_counts) <> n THEN
    RAISE EXCEPTION 'a screening is 1 to 50,000 rows, every column with a value for each' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_rows';
  END IF;
  WITH prospect AS (
    INSERT INTO screening_prospect (practice_name, state, zip, contact_email)
    VALUES (btrim(practice), state_code, zip5, lower(btrim(email)))
    RETURNING id
  ), upload AS (
    INSERT INTO screening_upload (prospect_id, file_sha256, row_count, status)
    SELECT prospect.id, file_sha256, n, 'accepted' FROM prospect
    RETURNING id
  ), run AS (
    INSERT INTO screening_run (upload_id, release_no, release_manifest_sha256, place_of_service_split_id, row_count)
    SELECT upload.id, in_force, manifest, split, n FROM upload
    RETURNING id
  ), uploaded AS (
    INSERT INTO screening_result (run_id, row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents, disposition)
    SELECT run.id, u.ordinality::integer, u.code, CASE WHEN u.mods = '' THEN '{}'::text[] ELSE string_to_array(u.mods, ' ') END, u.unit_count, u.place,
           u.product, u.band, u.claims, u.allowed,
           CASE WHEN u.product IN ('ma_contracted', 'commercial') THEN 'contract_required' WHEN u.product IN ('medicaid', 'other') THEN 'not_screened' ELSE 'pending' END
      FROM run, unnest(codes, modifier_sets, unit_counts, places, products, bands, allowed_cents, claim_counts)
             WITH ORDINALITY AS u (code, mods, unit_count, place, product, band, allowed, claims, ordinality)
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_submitted', 'screening_run', run.id, 'screening', request FROM run
  RETURNING object_id INTO created;
  RETURN created;
END;
$$;

-- A refused upload: the prospect and the upload with its reasons (codes, positions and kinds only); no run. Nothing
-- is recorded while screening is closed.
CREATE FUNCTION reject_screening_upload(practice text, state_code text, zip5 text, email text, file_sha256 text, row_count integer, reasons jsonb, request text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  created uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM screening_status() o WHERE o.release_no IS NOT NULL AND o.place_of_service_split_id IS NOT NULL) THEN
    RAISE EXCEPTION 'screening is closed until a rule release is in force and a place-of-service split is approved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_closed';
  END IF;
  WITH prospect AS (
    INSERT INTO screening_prospect (practice_name, state, zip, contact_email)
    VALUES (btrim(practice), state_code, zip5, lower(btrim(email)))
    RETURNING id
  ), upload AS (
    INSERT INTO screening_upload (prospect_id, file_sha256, row_count, status, rejection_reasons)
    SELECT prospect.id, file_sha256, $6, 'rejected', reasons FROM prospect
    RETURNING id
  )
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_rejected', 'screening_upload', upload.id, 'screening', request FROM upload
  RETURNING object_id INTO created;
  RETURN created;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The result link (tp_app): each read answers only for a complete run before it expires, by the SHA-256 of the
-- link's token, and computes every figure here as bigint sums of the stored rows.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION screening_result_summary(token_sha256 text)
RETURNS TABLE (
  run_id uuid, practice_name text, state text, zip text, release_no integer, engine_version text, created_at timestamptz, expires_at timestamptz,
  rows integer, claim_lines bigint, observed_cents bigint,
  priced_rows integer, priced_claim_lines bigint, expected_cents bigint, priced_observed_cents bigint, difference_cents bigint,
  contract_rows integer, contract_claim_lines bigint, contract_observed_cents bigint,
  not_screened_rows integer, not_screened_claim_lines bigint, not_screened_observed_cents bigint,
  unpriced_rows integer, unpriced_claim_lines bigint, unpriced_observed_cents bigint,
  converted boolean, release_withdrawn boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.id, p.practice_name, p.state, p.zip, r.release_no, r.engine_version, r.created_at, r.expires_at,
         t.all_rows, t.all_claims, t.all_observed,
         t.priced_rows, t.priced_claims, t.priced_expected, t.priced_observed, t.priced_difference,
         t.contract_rows, t.contract_claims, t.contract_observed,
         t.not_screened_rows, t.not_screened_claims, t.not_screened_observed,
         t.unpriced_rows, t.unpriced_claims, t.unpriced_observed,
         r.converted_at IS NOT NULL,
         EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
    FROM screening_run r
    JOIN screening_upload u ON u.id = r.upload_id
    JOIN screening_prospect p ON p.id = u.prospect_id
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS all_rows,
             coalesce(sum(s.claim_count), 0)::bigint AS all_claims,
             coalesce(sum(s.observed_allowed_cents), 0)::bigint AS all_observed,
             count(*) FILTER (WHERE s.disposition = 'priced')::integer AS priced_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_claims,
             coalesce(sum(s.expected_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_expected,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_observed,
             coalesce(sum(s.difference_cents) FILTER (WHERE s.disposition = 'priced'), 0)::bigint AS priced_difference,
             count(*) FILTER (WHERE s.disposition = 'contract_required')::integer AS contract_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'contract_required'), 0)::bigint AS contract_observed,
             count(*) FILTER (WHERE s.disposition = 'not_screened')::integer AS not_screened_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition = 'not_screened'), 0)::bigint AS not_screened_observed,
             count(*) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band'))::integer AS unpriced_rows,
             coalesce(sum(s.claim_count) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS unpriced_claims,
             coalesce(sum(s.observed_allowed_cents) FILTER (WHERE s.disposition IN ('unpriced', 'rates_change_in_band')), 0)::bigint AS unpriced_observed
        FROM screening_result s WHERE s.run_id = r.id) t
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at
$$;

-- The priced rows by payer product and code, the largest difference first. A group is below by the threshold when
-- its difference is positive and at least $5 a claim line (ADR 0038's default materiality). It is an anomaly only
-- when no row of it is in the reduction across a visit's codes: a row priced alone is before that reduction, which
-- for a typical therapy visit is more than $5 a line, so a pooled code's group is reported as below the figure
-- before the reduction, never as an anomaly on that figure alone.
CREATE FUNCTION screening_result_groups(token_sha256 text)
RETURNS TABLE (payer_product text, procedure_code text, rows integer, claim_lines bigint, expected_cents bigint, observed_cents bigint, difference_cents bigint, anomaly boolean,
  in_reduction_pool boolean, below_before_reduction boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT g.product, g.code, g.row_total, g.claims, g.expected, g.observed, g.difference,
         g.difference > 0 AND g.difference >= 500 * g.claims AND NOT g.pooled,
         g.pooled,
         g.difference > 0 AND g.difference >= 500 * g.claims AND g.pooled
    FROM (SELECT s.payer_product AS product, s.procedure_code AS code, count(*)::integer AS row_total, sum(s.claim_count)::bigint AS claims,
                 sum(s.expected_cents)::bigint AS expected, sum(s.observed_allowed_cents)::bigint AS observed, sum(s.difference_cents)::bigint AS difference,
                 bool_or(s.in_reduction_pool) AS pooled
            FROM screening_run r JOIN screening_result s ON s.run_id = r.id
           WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at AND s.disposition = 'priced'
           GROUP BY s.payer_product, s.procedure_code) g
   ORDER BY g.difference DESC, g.product, g.code
$$;

-- Every row by payer product and what became of it (and why a row could not be priced).
CREATE FUNCTION screening_result_coverage(token_sha256 text)
RETURNS TABLE (payer_product text, disposition text, unpriced_reason text, unpriced_detail text, rows integer, claim_lines bigint, observed_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.payer_product, s.disposition, s.unpriced_reason, s.unpriced_detail, count(*)::integer, sum(s.claim_count)::bigint, sum(s.observed_allowed_cents)::bigint
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at
   GROUP BY s.payer_product, s.disposition, s.unpriced_reason, s.unpriced_detail
   ORDER BY s.payer_product, s.disposition, s.unpriced_reason NULLS FIRST, s.unpriced_detail NULLS FIRST
$$;

-- At most the top 100 priced rows, the largest difference first.
CREATE FUNCTION screening_result_rows(token_sha256 text, top integer)
RETURNS TABLE (row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text,
  claim_count integer, observed_allowed_cents bigint, expected_line_cents bigint, expected_cents bigint, difference_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.row_no, s.procedure_code, s.modifiers, s.units, s.place_of_service, s.payer_product, s.service_band, s.claim_count, s.observed_allowed_cents,
         s.expected_line_cents, s.expected_cents, s.difference_cents
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.result_token_sha256 = token_sha256 AND r.status = 'complete' AND now() < r.expires_at AND s.disposition = 'priced'
   ORDER BY s.difference_cents DESC, s.row_no
   LIMIT least(greatest(coalesce(top, 0), 0), 100)
$$;

-- The conversion from a screening to an audit request: a prospect_request in the screening's contact address and
-- practice name (that table's CHECKs and trigger apply), recorded on the run once and as an audit event, which
-- outlives the screening's expiry. An unknown, expired or incomplete link is no_data_found.
CREATE FUNCTION convert_screening(token_sha256 text, contact text, location_count integer, payer_names text[], arrangement text, request text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
  email text;
  practice text;
  created uuid;
BEGIN
  SELECT r.* INTO target FROM screening_run r
   WHERE r.result_token_sha256 = $1 AND r.status = 'complete' AND now() < r.expires_at
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no screening result at this link' USING ERRCODE = 'no_data_found';
  END IF;
  IF target.converted_at IS NOT NULL THEN
    RAISE EXCEPTION 'a screening converts to an audit request once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_converted_once';
  END IF;
  SELECT p.contact_email, p.practice_name INTO email, practice
    FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
  created := submit_prospect_request(contact, email, practice, location_count, payer_names, arrangement);
  UPDATE screening_run r SET converted_prospect_request_id = created, converted_at = now() WHERE r.id = target.id;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_converted', 'prospect_request', created, 'screening', request);
  RETURN created;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The console (tp_app): the contract specialist approves the place-of-service split (rate_record.approve).
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION console_screening_splits()
RETURNS TABLE (id uuid, settings jsonb, approved_by uuid, approved_by_email text, approved_at timestamptz, in_force boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the screening split is read and approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.id, s.settings, s.approved_by, u.email, s.approved_at, row_number() OVER (ORDER BY s.approved_at DESC, s.id DESC) = 1
      FROM screening_place_of_service_split s LEFT JOIN "user" u ON u.id = s.approved_by
     ORDER BY s.approved_at DESC, s.id DESC
     LIMIT 50;
END;
$$;

CREATE FUNCTION console_approve_screening_split(settings jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  created uuid;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('rate_record.approve'), false) THEN
    RAISE EXCEPTION 'the screening split is approved by a contract specialist' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO screening_place_of_service_split (settings, approved_by) VALUES ($1, app_actor_id()) RETURNING screening_place_of_service_split.id INTO created;
  RETURN created;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The platform jobs (tp_operator): screening_price and screening_expiry
-- ---------------------------------------------------------------------------------------------------

-- Runs to price: queued for at least the age given (the on-demand job takes newer ones), and runs whose pricing
-- started over ten minutes ago (a worker that stopped); at most 100, oldest first.
CREATE FUNCTION operator_screening_due(min_queued_age_seconds integer, at_most integer) RETURNS TABLE (run_id uuid, status text, attempts integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT r.id, r.status, r.attempts FROM screening_run r
   WHERE now() < r.expires_at
     AND ((r.status = 'queued' AND r.created_at <= now() - make_interval(secs => greatest(coalesce(min_queued_age_seconds, 0), 0)))
       OR (r.status = 'pricing' AND r.started_at < now() - interval '10 minutes'))
   ORDER BY r.created_at, r.id
   LIMIT least(greatest(coalesce(at_most, 0), 0), 100)
$$;

-- Claims a run: queued to pricing, or a stale pricing run again with one attempt more (at most three). Returns what
-- pricing needs (the pinned release, whether it is still there as pinned: published, its manifest unchanged and not
-- withdrawn; the prospect's ZIP, the split, the date the run was created in UTC, its row count and the attempt), or
-- nothing when the run is not there to claim.
CREATE FUNCTION operator_screening_claim(run uuid)
RETURNS TABLE (release_no integer, release_manifest_sha256 text, release_available boolean, zip text, settings jsonb, as_of date, row_count integer, attempt integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND OR now() >= target.expires_at THEN
    RETURN;
  END IF;
  IF target.status = 'queued' OR (target.status = 'pricing' AND target.started_at < now() - interval '10 minutes' AND target.attempts < 3) THEN
    UPDATE screening_run r SET status = 'pricing', attempts = target.attempts + 1, started_at = now() WHERE r.id = target.id;
  ELSE
    RETURN;
  END IF;
  RETURN QUERY
    SELECT target.release_no, target.release_manifest_sha256,
           EXISTS (SELECT 1 FROM rule_release rl
                    WHERE rl.release_no = target.release_no AND rl.manifest_sha256 = target.release_manifest_sha256 AND rl.published_at IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = rl.release_no)),
           p.zip, s.settings, (target.created_at AT TIME ZONE 'UTC')::date, target.row_count, target.attempts + 1
      FROM screening_upload u
      JOIN screening_prospect p ON p.id = u.prospect_id
      JOIN screening_place_of_service_split s ON s.id = target.place_of_service_split_id
     WHERE u.id = target.upload_id;
END;
$$;

-- The pinned release's rule records as the engine reads them (with the stored SHA-256 the traces name), the
-- locality map limited to the run's ZIP; only for a run being priced, and only while the release's manifest is
-- the one the run pinned and the release is not withdrawn (content known to be wrong prices nothing).
CREATE FUNCTION operator_screening_release(run uuid)
RETURNS TABLE (record_type text, key jsonb, value jsonb, effective_from text, effective_to text, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM screening_run r
    JOIN screening_upload u ON u.id = r.upload_id
    JOIN screening_prospect p ON p.id = u.prospect_id
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
    JOIN rule_record rr ON rr.release_no = r.release_no
   WHERE r.id = $1 AND r.status = 'pricing'
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
     AND (rr.record_type <> 'locality_map' OR rr.key = jsonb_build_object('zip', p.zip))
   ORDER BY rr.record_type, rr.effective_from, rr.id
$$;

-- The run's rows still to price, after a row number, at most 5,000 at a time.
CREATE FUNCTION operator_screening_rows(run uuid, after_row integer, at_most integer)
RETURNS TABLE (row_no integer, procedure_code text, modifiers text[], units integer, place_of_service text, payer_product text, service_band text,
  claim_count integer, observed_allowed_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s.row_no, s.procedure_code, s.modifiers, s.units, s.place_of_service, s.payer_product, s.service_band, s.claim_count, s.observed_allowed_cents
    FROM screening_run r JOIN screening_result s ON s.run_id = r.id
   WHERE r.id = $1 AND r.status = 'pricing' AND s.disposition = 'pending' AND s.row_no > coalesce($2, 0)
   ORDER BY s.row_no
   LIMIT least(greatest(coalesce($3, 0), 0), 5000)
$$;

-- Records what pricing found for up to 5,000 pending rows of a run being priced; the arrays are the rows' fields in
-- order. Returns how many rows it recorded (a row already recorded is left as it is).
CREATE FUNCTION operator_screening_record(run uuid, row_nos integer[], dispositions text[], expected_line_cents bigint[], expected_line_unrounded numeric[],
  expected_cents bigint[], difference_cents bigint[], in_reduction_pools boolean[], unpriced_reasons text[], unpriced_details text[], trace_sha256s text[]) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  n integer := coalesce(cardinality($2), 0);
  recorded integer;
BEGIN
  IF n > 5000 OR coalesce(cardinality($3), 0) <> n OR coalesce(cardinality($4), 0) <> n OR coalesce(cardinality($5), 0) <> n OR coalesce(cardinality($6), 0) <> n
     OR coalesce(cardinality($7), 0) <> n OR coalesce(cardinality($8), 0) <> n OR coalesce(cardinality($9), 0) <> n OR coalesce(cardinality($10), 0) <> n
     OR coalesce(cardinality($11), 0) <> n THEN
    RAISE EXCEPTION 'at most 5,000 rows at a time, every field with a value for each' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM screening_run r WHERE r.id = $1 AND r.status = 'pricing' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rows are recorded for a run being priced' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE screening_result s
     SET disposition = f.disposition, expected_line_cents = f.line_cents, expected_line_unrounded = f.line_unrounded, expected_cents = f.total_cents,
         difference_cents = f.difference, in_reduction_pool = f.pooled, unpriced_reason = f.reason, unpriced_detail = f.detail, trace_sha256 = f.trace
    FROM unnest($2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS f (row_no, disposition, line_cents, line_unrounded, total_cents, difference, pooled, reason, detail, trace)
   WHERE s.run_id = $1 AND s.row_no = f.row_no AND s.disposition = 'pending';
  GET DIAGNOSTICS recorded = ROW_COUNT;
  RETURN recorded;
END;
$$;

-- Completes a run being priced once no row is pending: the SHA-256 of the link's token (the token itself never
-- reaches the database) and the engine's version. Returns where the link goes and the row count; nothing when the
-- run is already complete (a retry after the email went).
CREATE FUNCTION operator_screening_complete(run uuid, token_sha256 text, engine text, request text) RETURNS TABLE (contact_email text, row_count integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such screening run' USING ERRCODE = 'no_data_found';
  END IF;
  IF target.status = 'complete' THEN
    RETURN;
  END IF;
  IF target.status <> 'pricing' THEN
    RAISE EXCEPTION 'a screening run completes from pricing' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM screening_result s WHERE s.run_id = target.id AND s.disposition = 'pending') THEN
    RAISE EXCEPTION 'a screening run completes once every row is priced' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE screening_run r SET status = 'complete', result_token_sha256 = $2, completed_at = now(), engine_version = $3 WHERE r.id = target.id;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_completed', 'screening_run', target.id, 'screening', $4);
  RETURN QUERY
    SELECT p.contact_email, target.row_count FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
END;
$$;

-- Fails a queued or pricing run with a code. Returns where the notice goes; nothing when the run had already ended.
CREATE FUNCTION operator_screening_fail(run uuid, failure text, request text) RETURNS TABLE (contact_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  target screening_run%ROWTYPE;
BEGIN
  SELECT r.* INTO target FROM screening_run r WHERE r.id = $1 FOR UPDATE;
  IF NOT FOUND OR target.status NOT IN ('queued', 'pricing') THEN
    RETURN;
  END IF;
  UPDATE screening_run r SET status = 'failed', failure_code = $2, failed_at = now() WHERE r.id = target.id;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_failed', 'screening_run', target.id, 'screening', $3);
  RETURN QUERY
    SELECT p.contact_email FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = target.upload_id;
END;
$$;

-- Deletes up to at_most prospects whose screening has expired, with their uploads, runs and rows, each an audit
-- event. Returns how many prospects and runs went.
CREATE FUNCTION operator_screening_expire(at_most integer, request text) RETURNS TABLE (prospects integer, runs integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  doomed uuid[];
  run_total integer;
BEGIN
  SELECT coalesce(array_agg(x.id), '{}') INTO doomed FROM (
    SELECT p.id FROM screening_prospect p WHERE p.expires_at <= now()
     ORDER BY p.expires_at, p.id
     LIMIT least(greatest(coalesce($1, 0), 0), 1000)
       FOR UPDATE SKIP LOCKED) x;
  SELECT count(*)::integer INTO run_total FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE u.prospect_id = ANY (doomed);
  DELETE FROM screening_prospect p WHERE p.id = ANY (doomed);
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  SELECT 'system', 'screening_expired', 'screening_prospect', d.id, 'screening', $2 FROM unnest(doomed) AS d (id);
  RETURN QUERY SELECT cardinality(doomed), run_total;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON screening_prospect, screening_upload, screening_place_of_service_split, screening_run, screening_result FROM PUBLIC;

REVOKE ALL ON FUNCTION screening_rejection_valid(jsonb), screening_rejections_valid(jsonb), screening_split_valid(jsonb), screening_modifiers_valid(text[]),
  screening_kept_until_expiry(), screening_run_rules(), screening_result_inserted(), screening_result_rules(), screening_split_in_force(), screening_status(),
  screening_zip_status(text), submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], text),
  reject_screening_upload(text, text, text, text, text, integer, jsonb, text), screening_result_summary(text), screening_result_groups(text),
  screening_result_coverage(text), screening_result_rows(text, integer), convert_screening(text, text, integer, text[], text, text), console_screening_splits(),
  console_approve_screening_split(jsonb), operator_screening_due(integer, integer), operator_screening_claim(uuid), operator_screening_release(uuid),
  operator_screening_rows(uuid, integer, integer),
  operator_screening_record(uuid, integer[], text[], bigint[], numeric[], bigint[], bigint[], boolean[], text[], text[], text[]),
  operator_screening_complete(uuid, text, text, text), operator_screening_fail(uuid, text, text), operator_screening_expire(integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION screening_status(), screening_zip_status(text),
  submit_screening(text, text, text, text, text, text[], text[], integer[], text[], text[], text[], bigint[], integer[], text),
  reject_screening_upload(text, text, text, text, text, integer, jsonb, text), screening_result_summary(text), screening_result_groups(text),
  screening_result_coverage(text), screening_result_rows(text, integer), convert_screening(text, text, integer, text[], text, text), console_screening_splits(),
  console_approve_screening_split(jsonb) TO tp_app;

GRANT EXECUTE ON FUNCTION operator_screening_due(integer, integer), operator_screening_claim(uuid), operator_screening_release(uuid),
  operator_screening_rows(uuid, integer, integer),
  operator_screening_record(uuid, integer[], text[], bigint[], numeric[], bigint[], bigint[], boolean[], text[], text[], text[]),
  operator_screening_complete(uuid, text, text, text), operator_screening_fail(uuid, text, text), operator_screening_expire(integer, text) TO tp_operator;
