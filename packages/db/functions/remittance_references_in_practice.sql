-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- remittance_references_in_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e23bac606a695625
-- Trigger function of: remittance.remittance_references_in_practice
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.remittance_references_in_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF practice_in_scope(NEW.practice_id) THEN
    IF NOT EXISTS (SELECT 1 FROM source_document d WHERE d.id = NEW.source_document_id AND d.practice_id = NEW.practice_id AND d.kind = NEW.provenance) THEN
      RAISE EXCEPTION 'a remittance comes from a document of its provenance (an 835 or an ERA export) of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM payer p WHERE p.id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a remittance names a payer of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.review_of_remittance_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.review_of_remittance_id AND r.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a remittance is reviewed against a remittance of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.provenance = 'era_export' AND EXISTS (
      SELECT 1 FROM remittance r
       WHERE r.practice_id = NEW.practice_id AND r.payee_npi = NEW.payee_npi AND r.trn02 = NEW.trn02 AND r.bpr_credit_debit = NEW.bpr_credit_debit
         AND r.bpr02_cents = NEW.bpr02_cents AND r.bpr16_date = NEW.bpr16_date
    ) THEN
      RAISE EXCEPTION 'an ERA export of a payment already loaded loads nothing' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.provenance = 'x12_835' AND EXISTS (
      SELECT 1 FROM remittance r
       WHERE r.practice_id = NEW.practice_id AND r.provenance = 'era_export' AND r.payee_npi = NEW.payee_npi AND r.trn02 = NEW.trn02
         AND r.bpr_credit_debit = NEW.bpr_credit_debit AND r.bpr02_cents = NEW.bpr02_cents AND r.bpr16_date = NEW.bpr16_date
    ) THEN
      RAISE EXCEPTION 'an 835 of a payment loaded from an ERA export is held for review, never loaded beside it' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.remittance_references_in_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.remittance_references_in_practice() FROM PUBLIC;
