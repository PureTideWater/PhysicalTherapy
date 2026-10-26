-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_report_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3e46c1342db1a9db
-- Trigger function of: audit_report.audit_report_belongs
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.audit_report_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_run r WHERE r.id = NEW.pricing_run_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'an audit report is of a pricing run of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT pricing_run_in_effect(NEW.pricing_run_id) THEN
    RAISE EXCEPTION 'an audit report is of the pricing run in effect for its period: never a re-run nobody has accepted, nor a run since replaced' USING ERRCODE = 'check_violation';
  END IF;
  IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
    RAISE EXCEPTION 'an audit report is not built on a withdrawn rule release: re-price the period under the release in force and accept that re-run first' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.audit_report_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_report_belongs() FROM PUBLIC;
