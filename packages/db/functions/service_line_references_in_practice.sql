-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- service_line_references_in_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4a5052e6217f6e34
-- Trigger function of: service_line.service_line_references_in_practice
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.service_line_references_in_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF practice_in_scope(NEW.practice_id) THEN
    IF NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a service line belongs to a claim of the same practice' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM plan p WHERE p.id = NEW.payer_plan_key AND p.practice_id = NEW.practice_id) THEN
      RAISE EXCEPTION 'a service line names a plan of the same practice' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.service_line_references_in_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.service_line_references_in_practice() FROM PUBLIC;
