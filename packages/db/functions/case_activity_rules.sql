-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_activity_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7730d96a2329a3c1
-- Trigger function of: case_activity.case_activity_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.case_activity_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a case''s activity never changes and is never deleted; a later note or assignment is a new row' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.case_activity_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_activity_rules() FROM PUBLIC;
