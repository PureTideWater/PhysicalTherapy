-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- roi_statement_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5a8bc6319828acb2
-- Trigger function of: roi_statement.roi_statement_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.roi_statement_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  sums record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an ROI statement keeps its figures; a new one is generated' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.proof_level, NEW.fees_cents, NEW.recovered_cents, NEW.interest_cents, NEW.approved_unposted_cents,
        NEW.actionable_open_cents, NEW.pursuit_hours, NEW.links, NEW.generated_by, NEW.generated_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.proof_level, OLD.fees_cents, OLD.recovered_cents, OLD.interest_cents, OLD.approved_unposted_cents,
        OLD.actionable_open_cents, OLD.pursuit_hours, OLD.links, OLD.generated_by, OLD.generated_at, OLD.created_at)
       OR OLD.document_key IS NOT NULL OR NEW.document_key IS NULL THEN
      RAISE EXCEPTION 'an ROI statement keeps its figures; only its printed PDF is recorded, once' USING ERRCODE = 'check_violation';
    END IF;
    IF practice_in_scope(NEW.practice_id) THEN
      IF app_actor_is_person() THEN
        RAISE EXCEPTION 'the statement job records the printed PDF, in no one''s name' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF left(NEW.document_key, char_length('practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/')) <> 'practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/' THEN
        RAISE EXCEPTION 'a statement''s PDF is stored under its own practice and statement' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.generated_at := now();
  IF NEW.document_key IS NOT NULL OR NEW.pdf_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'a statement is printed after it is written' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.generated_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'an ROI statement is generated on demand by a person who reconciles postings, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.generated_by IS NOT NULL THEN
    RAISE EXCEPTION 'the quarterly statement is generated in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'recovered')) + (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'interest')) AS linked,
         (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x))
           + (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS found,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x)) AS recovered,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS interest
    INTO sums;
  IF sums.linked <> sums.found OR sums.recovered <> NEW.recovered_cents OR sums.interest <> NEW.interest_cents THEN
    RAISE EXCEPTION 'an ROI statement''s recovered and interest are the sums of the entries it links' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.roi_statement_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.roi_statement_rules() FROM PUBLIC;
