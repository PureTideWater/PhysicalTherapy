-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_run_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 938278884e08d472
-- Trigger function of: pricing_run.pricing_run_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.pricing_run_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  lines bigint;
  original record;
  split uuid;
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
    -- Under the caller's policies, for a practice of the caller's scope (the application role reads practice_site): a
    -- run of a practice outside it is refused by pricing_run_tenant after this trigger, and is not told whether that
    -- practice has a location.
    IF coalesce(NEW.practice_id = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[]), false)
       AND NOT EXISTS (SELECT 1 FROM practice_site s WHERE s.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a pricing run prices a practice that has its pricing location (its billing ZIP)'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'pricing_run_location_missing';
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
    split := place_of_service_split_in_force();
    IF NEW.place_of_service_split_id IS NULL THEN
      NEW.place_of_service_split_id := split;
    ELSIF NEW.place_of_service_split_id IS DISTINCT FROM split THEN
      RAISE EXCEPTION 'a pricing run pins the place-of-service split in force' USING ERRCODE = 'check_violation', CONSTRAINT = 'pricing_run_split_pinned';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.release_no, NEW.engine_version, NEW.created_by, NEW.created_by_job_id, NEW.created_at, NEW.rerun_of_id, NEW.lines_loaded_by,
      NEW.place_of_service_split_id)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.release_no, OLD.engine_version, OLD.created_by, OLD.created_by_job_id, OLD.created_at, OLD.rerun_of_id, OLD.lines_loaded_by,
      OLD.place_of_service_split_id) THEN
    RAISE EXCEPTION 'a pricing run''s practice, period, release, engine, creator, place-of-service split and the run it prices again never change' USING ERRCODE = 'check_violation';
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
$function$;
ALTER FUNCTION public.pricing_run_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_run_rules() FROM PUBLIC;
