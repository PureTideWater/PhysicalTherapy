-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_run_mail_gate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d65ca371246a478f
-- Trigger function of: screening_run.screening_run_mail_gate
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_run_mail_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF ((NEW.status = 'pricing' AND (OLD.status = 'queued' OR NEW.attempts IS DISTINCT FROM OLD.attempts))
      OR (OLD.status = 'pricing' AND NEW.status = 'complete')
      OR (NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed'))
     AND NOT screening_mail_sending() THEN
    RAISE EXCEPTION 'the screening''s mail is not sending: the run waits' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_mail_paused';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_run_mail_gate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_run_mail_gate() FROM PUBLIC;
