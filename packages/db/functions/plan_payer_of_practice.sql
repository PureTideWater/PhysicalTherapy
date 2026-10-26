-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- plan_payer_of_practice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6e80cf334ea6cc0f
-- Trigger function of: plan.plan_payer_of_practice
CREATE OR REPLACE FUNCTION public.plan_payer_of_practice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM payer p WHERE p.id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a plan belongs to a payer of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.plan_payer_of_practice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.plan_payer_of_practice() FROM PUBLIC;
