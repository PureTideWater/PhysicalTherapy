-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- anomaly_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 39f030b525ce0648
-- Trigger function of: anomaly.anomaly_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.anomaly_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.reviewed_by, NEW.reviewed_at, NEW.validation_requested_by, NEW.validation_requested_at) IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::uuid, NULL::timestamptz) THEN
      RAISE EXCEPTION 'an anomaly is recorded unreviewed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pricing_run_id, NEW.cohort_key, NEW.cohort_size, NEW.modal_allowed_cents, NEW.stats, NEW.line_ids, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pricing_run_id, OLD.cohort_key, OLD.cohort_size, OLD.modal_allowed_cents, OLD.stats, OLD.line_ids, OLD.created_at) THEN
    RAISE EXCEPTION 'an anomaly''s cohort and statistics never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    IF OLD.reviewed_by IS NOT NULL OR NEW.reviewed_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'anomaly.work'), false) THEN
      RAISE EXCEPTION 'an anomaly is marked reviewed once, by a person who works anomalies, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reviewed_at := now();
  ELSIF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'an anomaly''s review time is the time it was marked reviewed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.validation_requested_by IS DISTINCT FROM OLD.validation_requested_by THEN
    IF OLD.validation_requested_by IS NOT NULL OR NEW.validation_requested_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'anomaly.work'), false) THEN
      RAISE EXCEPTION 'an anomaly is converted to a validation request once, by a person who works anomalies, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.validation_requested_at := now();
  ELSIF NEW.validation_requested_at IS DISTINCT FROM OLD.validation_requested_at THEN
    RAISE EXCEPTION 'an anomaly''s validation request time is the time it was requested' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.anomaly_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.anomaly_rules() FROM PUBLIC;
