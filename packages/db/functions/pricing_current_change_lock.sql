-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_current_change_lock()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 98a437bbce011d67
-- Trigger function of: contract_version.contract_version_pricing_current_lock
-- Trigger function of: payer_plan_mapping.payer_plan_mapping_pricing_current_lock
-- Trigger function of: pricing_run.pricing_run_pricing_current_lock
-- Trigger function of: rule_release_withdrawal.rule_release_withdrawal_pricing_current_lock
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.pricing_current_change_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'rule_release_withdrawal' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('pricing_current:withdrawal', 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('pricing_current:' || NEW.practice_id::text, 0));
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.pricing_current_change_lock() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_current_change_lock() FROM PUBLIC;
