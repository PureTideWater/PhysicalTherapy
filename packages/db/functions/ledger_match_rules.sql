-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_match_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6b67952d52e9fd1d
-- Trigger function of: ledger_match.ledger_match_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.ledger_match_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a match is never deleted; it is reversed' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.seq, NEW.kind, NEW.claim_id, NEW.posting_row_id, NEW.eft_row_id, NEW.provider_adjustment_id, NEW.remittance_id, NEW.service_line_id, NEW.outcome, NEW.level,
        NEW.allocated, NEW.matched_by, NEW.matched_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.seq, OLD.kind, OLD.claim_id, OLD.posting_row_id, OLD.eft_row_id, OLD.provider_adjustment_id, OLD.remittance_id, OLD.service_line_id, OLD.outcome, OLD.level,
        OLD.allocated, OLD.matched_by, OLD.matched_at, OLD.created_at) THEN
      RAISE EXCEPTION 'a match never changes; it is reversed' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a match is reversed once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reversal_reason IS NULL OR NEW.reversed_by IS DISTINCT FROM app_actor_id() OR NOT app_actor_is_person()
       OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a match is reversed by a person who reconciles postings, in their own name, with a reason' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reversed_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.reversed_by, NEW.reversed_at, NEW.reversal_reason) IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::text) THEN
    RAISE EXCEPTION 'a match is recorded standing' USING ERRCODE = 'check_violation';
  END IF;
  NEW.matched_at := now();
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.matched_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a person who reconciles postings matches by hand, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.matched_by IS NOT NULL THEN
    RAISE EXCEPTION 'the reconcile job matches in no one''s name' USING ERRCODE = 'insufficient_privilege';
  ELSIF NEW.kind = 'interest' AND num_nonnulls(NEW.claim_id, NEW.provider_adjustment_id) = 1 THEN
    -- The reconcile job of the image before docs/adr/0084, during a deploy or after a rollback: it credits interest
    -- from AMT I or the PLB L6 alone. Its insert is skipped (no row, no error), so the rest of its reconcile stands and
    -- the current image credits the interest once. The current image writes both records on every interest match.
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id AND r.status = 'loaded') THEN
    RAISE EXCEPTION 'a match is to a loaded remittance of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a match is to a service line of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'claim' AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code <> '22') THEN
    RAISE EXCEPTION 'a claim match is of a claim of its remittance, never a reversal' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'posting' AND (NOT EXISTS (SELECT 1 FROM posting_row p WHERE p.id = NEW.posting_row_id AND p.practice_id = NEW.practice_id)
        OR (NEW.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id))) THEN
    RAISE EXCEPTION 'a posting match is of a posting row of its practice, and a line-level one of a claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'deposit' AND NOT EXISTS (SELECT 1 FROM eft_row e WHERE e.id = NEW.eft_row_id AND e.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a deposit match is of an EFT row of its practice' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'recoupment' AND NOT (
          EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'recoupment')
          OR EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code = '22')) THEN
    RAISE EXCEPTION 'a recoupment is a PLB WO or a reversing claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND (NEW.provider_adjustment_id IS NULL OR NEW.claim_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'interest')) THEN
    RAISE EXCEPTION 'interest is matched from a PLB L6 of its remittance, for a claim' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND NOT EXISTS (
          SELECT 1 FROM ledger_match c WHERE c.practice_id = NEW.practice_id AND c.service_line_id = NEW.service_line_id AND c.claim_id = NEW.claim_id
             AND c.kind IN ('claim', 'interest') AND c.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'interest reaches a line only through a claim the line has a standing match to' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.ledger_match_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_match_rules() FROM PUBLIC;
