-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_window_rule_computed(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: bb55ce276d1c3288
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.contract_window_rule_computed(unit text, measured_from text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(unit = 'calendar_days' AND measured_from = 'payment_date', false)
$function$;
ALTER FUNCTION public.contract_window_rule_computed(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_window_rule_computed(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_window_rule_computed(text,text) TO tp_app;
