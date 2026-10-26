-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- claim_references_in_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: daa5449712c05f35
-- Trigger function of: claim.claim_references_in_practice
CREATE OR REPLACE FUNCTION public.claim_references_in_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  remittance_provenance text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.reversal_of_claim_id IS NOT NULL AND NEW.reversal_of_claim_id IS DISTINCT FROM OLD.reversal_of_claim_id THEN
      RAISE EXCEPTION 'a reversal''s link to the claim it reverses never changes once set' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.superseded_by_claim_id IS NOT NULL AND NEW.superseded_by_claim_id IS DISTINCT FROM OLD.superseded_by_claim_id THEN
      RAISE EXCEPTION 'a claim''s superseding correction never changes once set' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF practice_in_scope(NEW.practice_id) THEN
    IF TG_OP = 'INSERT' THEN
      SELECT r.provenance INTO remittance_provenance FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'a claim belongs to a remittance of the same practice' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.filing_indicator IS NULL AND remittance_provenance = 'x12_835' THEN
        RAISE EXCEPTION 'a claim of an 835 carries its claim filing indicator (CLP06)' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM patient_ref p WHERE p.id = NEW.patient_ref_id AND p.practice_id = NEW.practice_id)
         OR (NEW.insured_ref_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM patient_ref p WHERE p.id = NEW.insured_ref_id AND p.practice_id = NEW.practice_id)) THEN
        RAISE EXCEPTION 'a claim names patient references of the same practice' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW.reversal_of_claim_id IS NOT NULL AND NEW.reversal_of_claim_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.reversal_of_claim_id END)
       AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.reversal_of_claim_id AND c.practice_id = NEW.practice_id AND c.claim_status_code <> '22') THEN
      RAISE EXCEPTION 'a reversal reverses a claim of the same practice that is not itself a reversal' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.superseded_by_claim_id IS NOT NULL AND NEW.superseded_by_claim_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.superseded_by_claim_id END)
       AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.superseded_by_claim_id AND c.practice_id = NEW.practice_id AND c.claim_status_code <> '22') THEN
      RAISE EXCEPTION 'a claim is superseded by a corrected claim of the same practice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.claim_references_in_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.claim_references_in_practice() FROM PUBLIC;
