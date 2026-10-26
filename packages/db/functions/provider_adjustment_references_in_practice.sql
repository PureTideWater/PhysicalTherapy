-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- provider_adjustment_references_in_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d679b25d16c44132
-- Trigger function of: provider_adjustment.provider_adjustment_references_in_practice
CREATE OR REPLACE FUNCTION public.provider_adjustment_references_in_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a provider adjustment belongs to a remittance of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.provider_adjustment_references_in_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.provider_adjustment_references_in_practice() FROM PUBLIC;
