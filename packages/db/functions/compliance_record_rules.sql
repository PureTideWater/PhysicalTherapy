-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- compliance_record_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7f1e947036b56ec1
-- Trigger function of: compliance_record.compliance_record_rules
CREATE OR REPLACE FUNCTION public.compliance_record_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.occurred_on > current_date THEN
    RAISE EXCEPTION 'evidence is recorded for what has happened' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.compliance_record_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.compliance_record_rules() FROM PUBLIC;
