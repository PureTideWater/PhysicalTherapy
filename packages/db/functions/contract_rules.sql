-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 06bbdf22fc9bd64e
-- Trigger function of: contract.contract_rules
CREATE OR REPLACE FUNCTION public.contract_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.practice_id, NEW.payer_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.payer_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a contract''s practice and payer never change' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND practice_in_scope(NEW.practice_id)
     AND NOT EXISTS (SELECT 1 FROM payer p WHERE p.id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a contract belongs to a payer of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.contract_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_rules() FROM PUBLIC;
