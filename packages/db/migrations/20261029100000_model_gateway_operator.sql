-- The operator role's part in the model gateway's records (docs/adr/0048): a synthetic evaluation run's
-- calls name no practice and are written as tp_operator (20261029090000_model_gateway.sql).
--
-- - The operator reads the feature flags, as the application role does: the gateway obeys the global
--   kill switch for an evaluation call as for every call. Read only; platform administrators set flags
--   through set_feature_flag().
-- - model_call_rules() checks a practice's call against the transaction's actor only when the call names a
--   practice. PostgreSQL checks EXECUTE on every function an expression names when it prepares the
--   expression, so the one condition that named practice_in_scope() and app_actor_is_person() beside the
--   practice test refused the operator's insert of an evaluation call (the operator may call neither).
--   The practice's checks now sit in their own conditions, prepared only for a call that names a
--   practice. The rules themselves are unchanged.
--
-- Runs as tp_owner. Safe with the previous image running: one more read grant on a global table, and a
-- trigger function replaced with the same rules under the same name.

GRANT SELECT ON feature_flag TO tp_operator;

CREATE OR REPLACE FUNCTION model_call_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a model call is kept: its log row is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reviewer_decision IS NOT NULL OR NEW.reviewer_changed_fields IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a model call is logged unreviewed; the reviewer''s decision comes later' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.practice_id IS NOT NULL THEN
      IF practice_in_scope(NEW.practice_id) THEN
        IF NEW.actor_id IS DISTINCT FROM app_actor_id() OR (NEW.actor_kind = 'user') IS DISTINCT FROM app_actor_is_person() THEN
          RAISE EXCEPTION 'a model call is logged in the name of the transaction''s actor' USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF OLD.reviewer_decision IS NOT NULL OR NEW.reviewer_decision IS NULL
     OR (NEW.id, NEW.practice_id, NEW.actor_kind, NEW.actor_id, NEW.purpose, NEW.provider, NEW.model_id, NEW.prompt_version, NEW.idempotency_key,
         NEW.input_hashes, NEW.output_sha256, NEW.tokens_in, NEW.tokens_out, NEW.cost_cents, NEW.cost_unrounded, NEW.citations, NEW.verifier_passed,
         NEW.outcome, NEW.error_code, NEW.attempts, NEW.latency_ms, NEW.created_at)
        IS DISTINCT FROM
        (OLD.id, OLD.practice_id, OLD.actor_kind, OLD.actor_id, OLD.purpose, OLD.provider, OLD.model_id, OLD.prompt_version, OLD.idempotency_key,
         OLD.input_hashes, OLD.output_sha256, OLD.tokens_in, OLD.tokens_out, OLD.cost_cents, OLD.cost_unrounded, OLD.citations, OLD.verifier_passed,
         OLD.outcome, OLD.error_code, OLD.attempts, OLD.latency_ms, OLD.created_at) THEN
    RAISE EXCEPTION 'a model call never changes; only the reviewer''s decision is recorded, once' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT coalesce(app_actor_is_person(), false) OR NOT coalesce(app_actor_permitted(NEW.practice_id, model_review_permission(NEW.purpose)), false) THEN
    RAISE EXCEPTION 'the reviewer''s decision is recorded by a person who may review the call''s purpose in its practice' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.reviewed_by := app_actor_id();
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;
