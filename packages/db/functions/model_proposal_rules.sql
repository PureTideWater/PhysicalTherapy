-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- model_proposal_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 80687fccf4186aae
-- Trigger function of: model_proposal.model_proposal_rules
CREATE OR REPLACE FUNCTION public.model_proposal_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a model proposal is kept: it is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reviewed_at IS NOT NULL OR NEW.eval_example_id IS NOT NULL THEN
      RAISE EXCEPTION 'a model proposal is written unreviewed' USING ERRCODE = 'check_violation';
    END IF;
    -- A row for a practice out of scope is the tenant policy's to refuse.
    IF practice_in_scope(NEW.practice_id) THEN
      IF NEW.proposed_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_is_person(), false) THEN
        RAISE EXCEPTION 'a model proposal is written by the person who asked for it' USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- The call is that person's, in this practice, for this purpose, completed and unreviewed.
      IF NOT EXISTS (
        SELECT 1 FROM model_call c
         WHERE c.id = NEW.model_call_id AND c.practice_id = NEW.practice_id AND c.purpose = NEW.purpose AND c.actor_kind = 'user'
           AND c.actor_id = NEW.proposed_by AND c.outcome = 'completed' AND c.reviewer_decision IS NULL
      ) THEN
        RAISE EXCEPTION 'a model proposal names a completed, unreviewed call its writer made in the practice for its purpose' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.model_call_id, NEW.purpose, NEW.contract_version_id, NEW.source_document_id, NEW.packet_version_id, NEW.proposal,
      NEW.verifier_passed, NEW.proposed_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.practice_id, OLD.model_call_id, OLD.purpose, OLD.contract_version_id, OLD.source_document_id, OLD.packet_version_id, OLD.proposal,
      OLD.verifier_passed, OLD.proposed_by, OLD.created_at)
     OR (OLD.reviewed_at IS NOT NULL AND NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at)
     OR (OLD.eval_example_id IS NOT NULL AND NEW.eval_example_id IS DISTINCT FROM OLD.eval_example_id) THEN
    RAISE EXCEPTION 'a model proposal never changes; its review and its example are recorded once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.reviewed_at IS NULL AND NEW.reviewed_at IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM model_call c WHERE c.id = NEW.model_call_id AND c.reviewer_decision IS NOT NULL) THEN
      RAISE EXCEPTION 'a proposal is reviewed once the reviewer''s decision is recorded on its model call' USING ERRCODE = 'check_violation';
    END IF;
    NEW.reviewed_at := now();
  END IF;
  IF OLD.eval_example_id IS NULL AND NEW.eval_example_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM eval_example e WHERE e.id = NEW.eval_example_id AND e.practice_id = NEW.practice_id AND e.purpose = NEW.purpose AND e.source = 'permitted') THEN
    RAISE EXCEPTION 'a proposal''s example is a permitted example of its own practice and purpose' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.model_proposal_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.model_proposal_rules() FROM PUBLIC;
