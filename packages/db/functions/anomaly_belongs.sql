-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- anomaly_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5ef71bf25d7d04c3
-- Trigger function of: anomaly.anomaly_belongs
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.anomaly_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_run r WHERE r.id = NEW.pricing_run_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'an anomaly is of a pricing run of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.anomaly_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.anomaly_belongs() FROM PUBLIC;
