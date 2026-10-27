-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_run_bounce_budget()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3e4ac16da6191d20
-- Trigger function of: screening_run.screening_run_bounce_budget
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_run_bounce_budget()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT count(*) FROM screening_bounce_mark b WHERE b.subject_kind = 'account' AND b.subject = NEW.rate_subject AND b.expires_at > now()) >= 3
     OR (NEW.client_subject IS NOT NULL
         AND (SELECT count(*) FROM screening_bounce_mark b WHERE b.subject_kind = 'client' AND b.subject = NEW.client_subject AND b.expires_at > now()) >= 3) THEN
    RAISE EXCEPTION 'too many recent screening emails from this sender could not be delivered' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_bounce_budget';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_run_bounce_budget() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_run_bounce_budget() FROM PUBLIC;
