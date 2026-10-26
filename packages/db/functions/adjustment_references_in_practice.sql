-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- adjustment_references_in_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0319bb6e43992a8b
-- Trigger function of: adjustment.adjustment_references_in_practice
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.adjustment_references_in_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF practice_in_scope(NEW.practice_id) THEN
    IF NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'an adjustment belongs to a claim of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.service_line_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.claim_id = NEW.claim_id AND l.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a line-level adjustment belongs to a line of its own claim' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.adjustment_references_in_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.adjustment_references_in_practice() FROM PUBLIC;
