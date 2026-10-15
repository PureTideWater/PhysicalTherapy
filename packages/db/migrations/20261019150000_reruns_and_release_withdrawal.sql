-- Re-runs under a new release, their acceptance, and content rollback (PRD 5, J6: "a wrong mapping is
-- corrected by a new mapping ... prior pricing runs stay as they were, and a re-run is offered"; J17:
-- "runs pinned to older releases are unchanged, and a re-run under the new release lists exactly which
-- lines would change before anyone accepts it"; PRD 7, Pricing runs: "compare two runs; re-run under a
-- new release with a diff"; PRD 9, The release pipeline steps 4 and 5; PRD 18, Releases: "a content
-- rollback by loading the previous release, with runs pinned to the withdrawn release flagged rather
-- than changed"; test matrix PRC-19, MAP-03; docs/adr/0037).
--
-- - pricing_run gains rerun_of_id (the complete run of the same practice it prices again) and
--   lines_loaded_by (the original's cut-off: a re-run prices the lines the original priced, so the two
--   compare line for line), both fixed at creation; and accepted_by and accepted_at: a re-run is in
--   effect only once a person accepts it. Accepting is the one step a complete run may take, once, by
--   the person acting (with mapping.edit, for the application role), and never for a run pinned to a
--   withdrawn release; nothing the run priced changes, and its lines stay immutable.
-- - rule_release_withdrawal (global, no practice_id; read-only to the application role): a content
--   rollback. The release in force is withdrawn and the newest published release below it is in force
--   again; the withdrawn release, its records and the runs pinned to it are never changed, and the
--   runs are flagged by this row. A withdrawal is permanent; a correction is a new release.
-- - current_rule_release(): the newest published release not withdrawn. A run pins it (the trigger
--   refuses any other release, as before) and the 835 loader checks code lists against it.
-- - pricing_run_changed_lines(before, after): the lines whose expected allowed, unpriced reason or
--   adjustments differ between two runs, a line priced by one run only included (under the caller's
--   policies).
-- - console_release_runs(): the internal console's affected runs, per release and practice, as counts.
--
-- Runs as tp_owner. Safe with the previous image running: new nullable columns, a new table and new
-- functions; the redefined trigger accepts every row the previous image writes (no re-run, no
-- acceptance), and the previous image's release check (the newest published release) agrees with the
-- new one until a release is withdrawn.

-- ---------------------------------------------------------------------------------------------------
-- Content rollback
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE rule_release_withdrawal (
  -- The release withdrawn: the one in force when it was withdrawn.
  release_no integer PRIMARY KEY REFERENCES rule_release (release_no),
  -- The release in force again: the newest published, not withdrawn, release below it.
  reinstated_release_no integer NOT NULL REFERENCES rule_release (release_no),
  -- Why, in the operator's words: what the content had wrong (never PHI; printable, one line).
  reason text NOT NULL CHECK (reason ~ '^[ -~]+$' AND length(reason) BETWEEN 8 AND 500),
  withdrawn_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rule_release_withdrawal_reinstates_earlier CHECK (reinstated_release_no < release_no)
);

-- The release a pricing run created now pins, and that code lists are checked against.
CREATE FUNCTION current_rule_release() RETURNS integer LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT max(r.release_no) FROM rule_release r
   WHERE r.published_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
$$;

-- A withdrawal names the release in force and reinstates the newest published release below it that
-- is not withdrawn; it is recorded when it is made, and never changes or leaves.
CREATE FUNCTION rule_release_withdrawal_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a rule release withdrawal never changes; a correction is a new release' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.release_no IS DISTINCT FROM current_rule_release() THEN
    RAISE EXCEPTION 'only the rule release in force is withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reinstated_release_no IS DISTINCT FROM (
       SELECT max(r.release_no) FROM rule_release r
        WHERE r.release_no < NEW.release_no AND r.published_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)) THEN
    RAISE EXCEPTION 'a withdrawal reinstates the newest published release before the one withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.withdrawn_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'a withdrawal records the time it was made' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rule_release_withdrawal_rules BEFORE INSERT OR UPDATE OR DELETE ON rule_release_withdrawal
  FOR EACH ROW EXECUTE FUNCTION rule_release_withdrawal_rules();
CREATE TRIGGER rule_release_withdrawal_no_truncate BEFORE TRUNCATE ON rule_release_withdrawal
  FOR EACH STATEMENT EXECUTE FUNCTION rule_content_no_truncate();

-- Global content: the application role reads and never writes; the release tooling writes as the owner.
REVOKE ALL ON rule_release_withdrawal FROM PUBLIC;
GRANT SELECT ON rule_release_withdrawal TO tp_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rule_release_withdrawal FROM tp_app;

-- ---------------------------------------------------------------------------------------------------
-- Re-runs and their acceptance
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE pricing_run
  ADD COLUMN rerun_of_id uuid REFERENCES pricing_run (id),
  ADD COLUMN lines_loaded_by timestamptz,
  ADD COLUMN accepted_by uuid REFERENCES "user" (id),
  ADD COLUMN accepted_at timestamptz,
  ADD CONSTRAINT pricing_run_rerun_pins_its_lines CHECK ((rerun_of_id IS NULL) = (lines_loaded_by IS NULL)),
  ADD CONSTRAINT pricing_run_rerun_of_another CHECK (rerun_of_id IS DISTINCT FROM id),
  ADD CONSTRAINT pricing_run_acceptance_whole CHECK ((accepted_by IS NULL) = (accepted_at IS NULL)),
  ADD CONSTRAINT pricing_run_accepts_complete_reruns CHECK (accepted_at IS NULL OR (rerun_of_id IS NOT NULL AND status = 'complete'));
CREATE INDEX pricing_run_reruns ON pricing_run (practice_id, rerun_of_id) WHERE rerun_of_id IS NOT NULL;

-- As before (20261018090000_pricing_runs.sql), and: a run pins the release in force (withdrawn releases
-- are not); a re-run prices a complete run of its own practice again, for the same period and up to the
-- same cut-off; and a complete re-run may be accepted, once, by the person acting, unless its release
-- has been withdrawn.
CREATE OR REPLACE FUNCTION pricing_run_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  lines bigint;
  original record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a pricing run is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.coverage IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.failure_code IS NOT NULL
       OR NEW.accepted_by IS NOT NULL OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'a pricing run starts queued' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.release_no IS DISTINCT FROM current_rule_release() THEN
      RAISE EXCEPTION 'rule-release mismatch: a pricing run pins the newest published rule release' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.rerun_of_id IS NOT NULL THEN
      -- Under the caller's policies: a run of another practice is not found.
      SELECT r.practice_id, r.status, r.period_from, r.period_to, coalesce(r.lines_loaded_by, r.created_at) AS cut_off
        INTO original FROM pricing_run r WHERE r.id = NEW.rerun_of_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'a re-run prices a complete run of its own practice again' USING ERRCODE = 'check_violation';
      END IF;
      IF original.practice_id <> NEW.practice_id OR original.status <> 'complete' THEN
        RAISE EXCEPTION 'a re-run prices a complete run of its own practice again' USING ERRCODE = 'check_violation';
      END IF;
      IF (original.period_from, original.period_to, original.cut_off) IS DISTINCT FROM (NEW.period_from, NEW.period_to, NEW.lines_loaded_by) THEN
        RAISE EXCEPTION 'a re-run prices the period and the lines of the run it prices again' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.release_no, NEW.engine_version, NEW.created_by, NEW.created_at, NEW.rerun_of_id, NEW.lines_loaded_by)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.release_no, OLD.engine_version, OLD.created_by, OLD.created_at, OLD.rerun_of_id, OLD.lines_loaded_by) THEN
    RAISE EXCEPTION 'a pricing run''s practice, period, release, engine, creator and the run it prices again never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('complete', 'failed') THEN
    -- The one step a complete run takes: a person accepts a re-run, once (J17).
    IF OLD.status = 'complete' AND OLD.rerun_of_id IS NOT NULL AND OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL
       AND (NEW.status, NEW.coverage, NEW.failure_code, NEW.completed_at) IS NOT DISTINCT FROM (OLD.status, OLD.coverage, OLD.failure_code, OLD.completed_at) THEN
      IF NEW.accepted_at IS DISTINCT FROM now() OR NEW.accepted_by IS DISTINCT FROM app_actor_id() THEN
        RAISE EXCEPTION 'a re-run is accepted by the person acting, when they accept it' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = OLD.release_no) THEN
        RAISE EXCEPTION 'a re-run pinned to a withdrawn rule release is never accepted; re-run it under the release in force' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'a pricing run never changes once it is complete or failed; a new release or mapping means a new run' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.accepted_by, NEW.accepted_at) IS DISTINCT FROM (OLD.accepted_by, OLD.accepted_at) THEN
    RAISE EXCEPTION 'only a complete re-run is accepted' USING ERRCODE = 'check_violation';
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

-- Accepting a re-run is the billing manager's (mapping.edit, as creating a run is), in their own name.
CREATE POLICY pricing_run_accepted_by_actor ON pricing_run AS RESTRICTIVE FOR UPDATE TO tp_app
  USING (true)
  WITH CHECK (accepted_by IS NULL OR (accepted_by = app_actor_id() AND coalesce(app_actor_permitted(practice_id, 'mapping.edit'), false)));

GRANT INSERT (rerun_of_id, lines_loaded_by) ON pricing_run TO tp_app;
GRANT UPDATE (accepted_by, accepted_at) ON pricing_run TO tp_app;

-- The lines two runs price differently (PRD 9 step 4: "a diff of changed lines"): expected allowed,
-- unpriced reason or adjustments applied differ, or one run priced the line and the other did not.
-- Read under the caller's policies.
CREATE FUNCTION pricing_run_changed_lines(before_run uuid, after_run uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT count(*)
    FROM (SELECT * FROM priced_line WHERE pricing_run_id = before_run) a
    FULL JOIN (SELECT * FROM priced_line WHERE pricing_run_id = after_run) b ON b.service_line_id = a.service_line_id
   WHERE a.id IS NULL OR b.id IS NULL
      OR a.expected_allowed_cents IS DISTINCT FROM b.expected_allowed_cents
      OR a.unpriced_reason IS DISTINCT FROM b.unpriced_reason
      OR a.adjustments_applied IS DISTINCT FROM b.adjustments_applied
$$;

-- ---------------------------------------------------------------------------------------------------
-- The internal console's affected runs (Rule releases)
-- ---------------------------------------------------------------------------------------------------

-- Per release and active practice: the complete runs pinned to the release, those of them in effect
-- (not a re-run, or an accepted one), the re-runs made under it, how many were accepted, and how many
-- lines those re-runs priced differently from the runs they price again. Counts only, for a platform
-- administrator (rule_release.manage); anyone else gets no rows. No run, line or claim is named.
CREATE FUNCTION console_release_runs() RETURNS TABLE (
  release_no integer, practice_id uuid, name text, runs bigint, runs_in_effect bigint, reruns bigint, reruns_accepted bigint, changed_lines bigint
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  callers_scope text := current_setting('app.practice_ids', true);
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('rule_release.manage'), false) THEN
    RETURN;
  END IF;
  -- Every active practice in scope for the one query below; the caller's scope is put back after it.
  PERFORM set_config('app.practice_ids', (SELECT '{' || coalesce(string_agg(p.id::text, ','), '') || '}' FROM practice p WHERE p.status = 'active'), true);
  RETURN QUERY
    SELECT r.release_no, p.id, p.name,
           count(*),
           count(*) FILTER (WHERE r.rerun_of_id IS NULL OR r.accepted_at IS NOT NULL),
           count(*) FILTER (WHERE r.rerun_of_id IS NOT NULL),
           count(*) FILTER (WHERE r.accepted_at IS NOT NULL),
           coalesce(sum(pricing_run_changed_lines(r.rerun_of_id, r.id)) FILTER (WHERE r.rerun_of_id IS NOT NULL), 0)::bigint
      FROM pricing_run r JOIN practice p ON p.id = r.practice_id
     WHERE r.status = 'complete' AND p.status = 'active'
     GROUP BY r.release_no, p.id, p.name
     ORDER BY r.release_no DESC, p.name, p.id;
  PERFORM set_config('app.practice_ids', coalesce(callers_scope, '{}'), true);
END;
$$;

REVOKE ALL ON FUNCTION current_rule_release(), rule_release_withdrawal_rules(), pricing_run_changed_lines(uuid, uuid), console_release_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_rule_release(), pricing_run_changed_lines(uuid, uuid), console_release_runs() TO tp_app;
