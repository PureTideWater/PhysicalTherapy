-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 544872857d27943a
-- Trigger function of: case.case_belongs
CREATE OR REPLACE FUNCTION public.case_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plan p WHERE p.id = NEW.plan_id AND p.payer_id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case is of a plan of its payer and practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.rate_record_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rate_record r WHERE r.id = NEW.rate_record_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case''s rate record is of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.case_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_belongs() FROM PUBLIC;
