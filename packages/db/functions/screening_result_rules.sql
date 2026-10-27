-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_result_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 740dacdcc9915f56
-- Trigger function of: screening_result.screening_result_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_result_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.run_id, NEW.row_no, NEW.procedure_code, NEW.modifiers, NEW.units, NEW.place_of_service, NEW.payer_product, NEW.service_band, NEW.claim_count, NEW.observed_allowed_cents)
     IS DISTINCT FROM (OLD.run_id, OLD.row_no, OLD.procedure_code, OLD.modifiers, OLD.units, OLD.place_of_service, OLD.payer_product, OLD.service_band, OLD.claim_count, OLD.observed_allowed_cents) THEN
    RAISE EXCEPTION 'a screening row keeps the facts it was uploaded with' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.disposition <> 'pending' OR NEW.disposition NOT IN ('priced', 'unpriced', 'rates_change_in_band') THEN
    RAISE EXCEPTION 'a screening row is priced once, from pending' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_result_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_result_rules() FROM PUBLIC;
