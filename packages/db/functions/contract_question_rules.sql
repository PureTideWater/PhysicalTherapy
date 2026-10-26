-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_question_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8aae4f70b8112e03
-- Trigger function of: contract_question.contract_question_rules
CREATE OR REPLACE FUNCTION public.contract_question_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.answer IS NOT NULL OR NEW.closed_by IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a question is asked open, without an answer' USING ERRCODE = 'check_violation';
    END IF;
    IF practice_in_scope(NEW.practice_id) THEN
      IF NOT EXISTS (SELECT 1 FROM contract c WHERE c.id = NEW.contract_id AND c.practice_id = NEW.practice_id) THEN
        RAISE EXCEPTION 'a question is about a contract of the same practice' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.contract_version_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.id = NEW.contract_version_id AND v.contract_id = NEW.contract_id AND v.practice_id = NEW.practice_id) THEN
        RAISE EXCEPTION 'a question names a version of its contract' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.source_document_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id AND d.kind IN ('contract', 'exhibit', 'payer_letter')) THEN
        RAISE EXCEPTION 'a question names a contract, exhibit or payer-letter document of the same practice' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.contract_id, NEW.contract_version_id, NEW.source_document_id, NEW.topic, NEW.question, NEW.asked_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.contract_id, OLD.contract_version_id, OLD.source_document_id, OLD.topic, OLD.question, OLD.asked_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a question never changes; it is answered or withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'an answered or withdrawn question never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'open' THEN
    RAISE EXCEPTION 'a question changes only when it is answered or withdrawn' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.closed_by IS DISTINCT FROM app_actor_id() OR NEW.closed_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'closing a question records who closed it and when' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.contract_question_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_question_rules() FROM PUBLIC;
