-- Guards and reads the milestone 6 and 7 review asked for (PRD 3, Reimbursement reviewer: "edit
-- anything" is a must not; PRD 8, The status machine and notification/digest: "no PHI field exists on
-- the table"; PRD 11 step 2, PER_VISIT; PRD 12, From validated to actionable; PRD 5, J8: materiality
-- thresholds are practice settings; test matrix JOB-03; docs/adr/0038, 0039 and 0040).
--
-- - Writes a person makes are the roles' who make them, in SQL as well as in the routes: a person's
--   stage event (a reopen) is a person who works cases, in their own name, and a job's is in no one's;
--   a person creates a pricing run only with mapping.edit (as accepting a re-run already is); a person
--   requests an audit report only with case.work. The reviewer, read-only, can write none of them.
-- - An attestation holds no words: its format, the checklist's item codes and the two SHA-256 only.
-- - A notification's or digest's figures are keyed by a closed list of figure codes, and only the
--   "by payer" figures nest, keyed by opaque IDs: no key a name or a date of birth could be put in.
-- - priced_line_visit_variance_cents(line) and priced_line_shortfall_cents(line): a per-visit line is
--   judged with its visit (the run's lines of the claim, date and rate record the visit amount is
--   carried for): the visit's net variance, and the shortfall a line validates (its variance, at most
--   the visit's net shortfall for a line of a visit). @tp/triage judgeLine holds the same rule.
-- - console_practice_settings(practice) and console_set_practice_settings(practice, zip, settings):
--   the internal console reads and sets a practice's billing ZIP and its pricing and triage settings
--   (platform administrators only; the settings hold no patient's data).
--
-- Runs as tp_owner. Safe with the previous image running: policies only narrow what the previous image's
-- routes already refused (the previous image could store a reviewer's statement, which is now refused);
-- the functions are new.

-- ---------------------------------------------------------------------------------------------------
-- Writes are the roles' who make them
-- ---------------------------------------------------------------------------------------------------

-- A person's stage event (a reopen) is set by a person who works cases, in their own name; triage, a
-- job, sets stages in no one's name.
CREATE POLICY line_status_set_by_case_workers ON line_status AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (
    CASE WHEN (SELECT app_actor_is_person())
      THEN set_by IS NOT DISTINCT FROM app_actor_id() AND coalesce(app_actor_permitted(practice_id, 'case.work'), false)
      ELSE set_by IS NULL
    END
  );

-- As before (20261019160000_triage_cases_and_audit_reports.sql), with the setter's own name checked
-- after the row meets its practice's policies (line_status_belongs below), so a row of another
-- practice is refused by the tenant policy first, whoever it names.
CREATE OR REPLACE FUNCTION line_status_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_stage text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a line''s stage events never change; a reopen is a new event' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('line_status:' || NEW.service_line_id::text, 0));
  IF NEW.stage IN ('payer_approved', 'recovered') THEN
    RAISE EXCEPTION 'a line is payer approved or recovered only from the recovery ledger (milestone 9)' USING ERRCODE = 'check_violation';
  END IF;
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
    IF NEW.set_by IS NULL THEN
      RAISE EXCEPTION 'a reopen is a person''s explicit action' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.set_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION line_status_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.set_by IS NOT NULL AND NEW.set_by IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a stage is set in its setter''s own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a stage is set on a service line of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.priced_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priced_line p WHERE p.id = NEW.priced_line_id AND p.service_line_id = NEW.service_line_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a stage is judged from a priced line of its own service line' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- A person creates a pricing run (or a re-run) with mapping.edit; the monitoring job creates its own.
CREATE POLICY pricing_run_created_by_mappers ON pricing_run AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (created_by IS NULL OR coalesce(app_actor_permitted(practice_id, 'mapping.edit'), false));

-- An audit report is requested by a person who works cases.
CREATE POLICY audit_report_requested_by_case_workers ON audit_report AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (coalesce(app_actor_permitted(practice_id, 'case.work'), false));

-- ---------------------------------------------------------------------------------------------------
-- An attestation holds no words
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE audit_report ADD CONSTRAINT audit_report_attestation_holds_no_words CHECK (
  attestation IS NULL OR (
    (attestation - ARRAY['format', 'checklist', 'pdf_sha256', 'csv_sha256']) = '{}'::jsonb
    AND attestation ->> 'format' = 'tp-attestation/1'
    AND jsonb_typeof(attestation -> 'checklist') = 'array'
    AND NOT jsonb_path_exists(attestation -> 'checklist', '$[*] ? (@.type() != "string" || !(@ like_regex "^[a-z][a-z_]{0,31}$"))')
  )
);

-- ---------------------------------------------------------------------------------------------------
-- Figures keyed by a closed list of codes
-- ---------------------------------------------------------------------------------------------------

-- The figure codes a notification or a digest may hold (apps/worker/src/monitor/chain.ts and
-- apps/worker/src/digest/view.ts), by kind of figure. A code ending in _by_payer is the one kind that
-- nests: an object keyed by payers' opaque IDs. Anything else fits nowhere.
CREATE FUNCTION monitoring_figure_codes(leaf text) RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE leaf
    WHEN 'count' THEN ARRAY[
      'lines', 'priced_lines', 'unpriced_lines', 'validated_lines', 'flagged_lines', 'cases',
      'validated_payers', 'validated_lines_by_payer', 'cases_nearing_deadline', 'recoveries_posted',
      'coverage_lines', 'coverage_priced_lines', 'previous_coverage_lines', 'previous_coverage_priced_lines', 'contracts_expiring']
    WHEN 'cents' THEN ARRAY[
      'billed', 'priced_billed', 'validated_variance', 'validated_variance_by_payer', 'cases_nearing_deadline_actionable', 'recovered',
      'coverage_billed', 'coverage_priced_billed', 'previous_coverage_billed', 'previous_coverage_priced_billed']
    ELSE ARRAY[]::text[]
  END
$$;

-- As before (20261020090000_monitoring_digests_notifications.sql), with the keys from the closed list,
-- and nesting only under a _by_payer code, keyed by opaque IDs.
CREATE OR REPLACE FUNCTION monitoring_figures_valid(figures jsonb, leaf text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  item record;
  inner_item record;
BEGIN
  IF figures IS NULL OR jsonb_typeof(figures) <> 'object' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT e.key, e.value FROM jsonb_each(figures) e LOOP
    IF NOT item.key = ANY (monitoring_figure_codes(leaf)) THEN
      RETURN false;
    END IF;
    IF item.key LIKE '%\_by\_payer' THEN
      IF jsonb_typeof(item.value) <> 'object' THEN
        RETURN false;
      END IF;
      FOR inner_item IN SELECT e.key, e.value FROM jsonb_each(item.value) e LOOP
        IF inner_item.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT monitoring_figure_valid(inner_item.value, leaf) THEN
          RETURN false;
        END IF;
      END LOOP;
    ELSIF NOT monitoring_figure_valid(item.value, leaf) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Per-visit lines judged with their visit
-- ---------------------------------------------------------------------------------------------------

-- A per-visit line's visit (PRD 11 step 2: "applied once per claim per date across the included codes;
-- the first included line carries it and the rest expect zero"): the lines of the same run and claim
-- whose traces carry the same visit (the per_visit step's service date and carrying line) under the
-- same rate record. The visit's net variance is the sum of their variance: what the visit was paid
-- short (positive) or over (negative). Null for a line not in a visit. Read under the caller's policies.
CREATE FUNCTION priced_line_visit_variance_cents(line_id uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(p.trace #> '{steps,per_visit}') = 'object' THEN (
           SELECT coalesce(sum(q.variance_cents), 0)
             FROM priced_line q JOIN service_line ql ON ql.id = q.service_line_id
            WHERE q.pricing_run_id = p.pricing_run_id AND q.practice_id = p.practice_id AND ql.claim_id = l.claim_id
              AND q.rate_record_id IS NOT DISTINCT FROM p.rate_record_id
              AND jsonb_typeof(q.trace #> '{steps,per_visit}') = 'object'
              AND q.trace #>> '{steps,per_visit,service_date}' = p.trace #>> '{steps,per_visit,service_date}'
              AND q.trace #>> '{steps,per_visit,carrier_line_no}' = p.trace #>> '{steps,per_visit,carrier_line_no}')
         END
    FROM priced_line p JOIN service_line l ON l.id = p.service_line_id
   WHERE p.id = line_id
$$;

-- The shortfall a priced line validates (PRD 8, Validated: "the amount is contract-supported"; PRD 12:
-- "a priced line with positive variance is validated"): its variance when positive; for a line of a
-- per-visit visit, at most the visit's net shortfall, and nothing when the visit as a whole was paid in
-- full (the payer spread the visit's amount over its lines). Null when the line validates nothing.
CREATE FUNCTION priced_line_shortfall_cents(line_id uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE
           WHEN p.variance_cents IS NULL OR p.variance_cents <= 0 THEN NULL
           WHEN v.visit IS NULL THEN p.variance_cents
           WHEN v.visit > 0 THEN least(p.variance_cents, v.visit)
         END
    FROM priced_line p CROSS JOIN LATERAL (SELECT priced_line_visit_variance_cents(p.id) AS visit) v
   WHERE p.id = line_id
$$;

REVOKE ALL ON FUNCTION monitoring_figure_codes(text), priced_line_visit_variance_cents(uuid), priced_line_shortfall_cents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION monitoring_figure_codes(text), priced_line_visit_variance_cents(uuid), priced_line_shortfall_cents(uuid) TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- A practice's pricing and triage settings, from the internal console
-- ---------------------------------------------------------------------------------------------------

-- The settings keys the console sets (apps/worker/src/price/settings.ts and @tp/triage settings.ts).
CREATE FUNCTION practice_setting_keys() RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT ARRAY[
    'place_of_service_settings', 'default_rounding', 'line_materiality_cents', 'case_materiality_cents', 'anomaly_minimum_cohort',
    'anomaly_threshold_cents', 'staff_rate_cents_per_hour', 'minutes_per_packet', 'minutes_per_follow_up']
$$;

-- A practice's billing ZIP and settings, for platform administrators (organization.manage). Not PHI:
-- the practice's own address ZIP, materiality, anomaly and pursuit-cost settings.
CREATE FUNCTION console_practice_settings(target uuid) RETURNS TABLE (practice_id uuid, organization_id uuid, name text, zip text, settings jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id, p.organization_id, p.name, p.zip, p.settings
    FROM practice p
   WHERE p.id = target AND app_actor_platform_permitted('organization.manage')
$$;

-- Sets a practice's billing ZIP and its pricing and triage settings (the keys practice_setting_keys()
-- names; a key left out returns to its default; any other key of the settings is kept). Platform
-- administrators only; the update runs in the practice's one practice scope and the caller's scope is
-- restored. The route validates every value and records the audit event.
CREATE FUNCTION console_set_practice_settings(target uuid, new_zip text, new_settings jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  scope text := current_setting('app.practice_ids', true);
  changed boolean;
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator sets a practice''s settings from the console' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF new_zip IS NOT NULL AND new_zip !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'a billing ZIP is five digits' USING ERRCODE = 'check_violation';
  END IF;
  IF new_settings IS NULL OR jsonb_typeof(new_settings) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(new_settings) k WHERE NOT k = ANY (practice_setting_keys())) THEN
    RAISE EXCEPTION 'the console sets the pricing and triage settings only' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.practice_ids', ARRAY[target]::text, true);
  UPDATE practice p SET zip = new_zip, settings = (p.settings - practice_setting_keys()) || new_settings WHERE p.id = target;
  changed := FOUND;
  PERFORM set_config('app.practice_ids', coalesce(scope, '{}'), true);
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION practice_setting_keys(), console_practice_settings(uuid), console_set_practice_settings(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_setting_keys(), console_practice_settings(uuid), console_set_practice_settings(uuid, text, jsonb) TO tp_app;
