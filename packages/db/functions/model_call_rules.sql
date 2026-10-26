-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- model_call_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: deb8dd551f1aef22
-- Trigger function of: model_call.model_call_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.model_call_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
$function$;
ALTER FUNCTION public.model_call_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.model_call_rules() FROM PUBLIC;
