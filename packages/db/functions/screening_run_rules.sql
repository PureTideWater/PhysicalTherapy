-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_run_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f15d5e31592d5d9e
-- Trigger function of: screening_run.screening_run_rules
CREATE OR REPLACE FUNCTION public.screening_run_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.id, NEW.upload_id, NEW.release_no, NEW.release_manifest_sha256, NEW.place_of_service_split_id, NEW.row_count, NEW.created_at, NEW.expires_at,
      NEW.received_at, NEW.rate_subject, NEW.wait_reason, NEW.queue_priority)
     IS DISTINCT FROM (OLD.id, OLD.upload_id, OLD.release_no, OLD.release_manifest_sha256, OLD.place_of_service_split_id, OLD.row_count, OLD.created_at, OLD.expires_at,
      OLD.received_at, OLD.rate_subject, OLD.wait_reason, OLD.queue_priority) THEN
    RAISE EXCEPTION 'a screening run keeps its upload, release, split, row count, dates, account and place in the queue' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'pricing' AND NEW.status = 'pricing' AND NEW.attempts = OLD.attempts THEN
    -- A recorded batch, by the attempt that claimed the run: its progress, forward only. Its CHECKs hold everything
    -- else of a run in pricing empty.
    IF NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.progress_at IS NULL OR NEW.progress_at < OLD.progress_at THEN
      RAISE EXCEPTION 'a screening run being priced moves only its progress, and only forward' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'pricing' AND OLD.status IN ('queued', 'pricing') THEN
    IF NEW.attempts <> OLD.attempts + 1 OR NEW.started_at IS NOT DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'a screening run is claimed one attempt at a time, from when it is claimed' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (OLD.status = 'pricing' AND NEW.status IN ('complete', 'failed')) OR (OLD.status = 'queued' AND NEW.status = 'failed') THEN
    IF NEW.attempts <> OLD.attempts OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.progress_at IS DISTINCT FROM OLD.progress_at THEN
      RAISE EXCEPTION 'a screening run ends on the attempt that priced it' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.converted_at IS NOT NULL OR NEW.first_opened_at IS NOT NULL THEN
      RAISE EXCEPTION 'a screening is opened and converts once it is complete' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'complete' AND NEW.status = 'complete' THEN
    IF (NEW.attempts, NEW.started_at, NEW.completed_at, NEW.engine_version, NEW.result_token_sha256, NEW.failed_at, NEW.failure_code, NEW.progress_at)
       IS DISTINCT FROM (OLD.attempts, OLD.started_at, OLD.completed_at, OLD.engine_version, OLD.result_token_sha256, OLD.failed_at, OLD.failure_code, OLD.progress_at) THEN
      RAISE EXCEPTION 'a complete screening keeps its result and its link' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.converted_prospect_request_id, NEW.converted_at) IS DISTINCT FROM (OLD.converted_prospect_request_id, OLD.converted_at)
       AND (OLD.converted_at IS NOT NULL OR NEW.converted_at IS NULL) THEN
      RAISE EXCEPTION 'a screening converts to an audit request once' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_converted_once';
    END IF;
    IF NEW.first_opened_at IS DISTINCT FROM OLD.first_opened_at AND (OLD.first_opened_at IS NOT NULL OR NEW.first_opened_at IS NULL) THEN
      RAISE EXCEPTION 'a screening result is first opened once' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.converted_prospect_request_id, NEW.converted_at, NEW.first_opened_at) IS NOT DISTINCT FROM (OLD.converted_prospect_request_id, OLD.converted_at, OLD.first_opened_at) THEN
      RAISE EXCEPTION 'a complete screening changes only by its conversion or its first open' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'a screening run moves queued, pricing, then complete or failed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_run_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_run_rules() FROM PUBLIC;
