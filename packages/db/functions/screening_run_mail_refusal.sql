-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_run_mail_refusal()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 975f94b6061dd3a9
-- Trigger function of: screening_run.screening_run_mail_refusal
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_run_mail_refusal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF screening_bounce_budget_spent(NEW.rate_subject, NEW.client_subject) THEN
    RAISE EXCEPTION 'too many recent screening emails from this sender could not be delivered' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_bounce_budget';
  END IF;
  IF screening_contact_refused((SELECT p.contact_email FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE u.id = NEW.upload_id)) THEN
    RAISE EXCEPTION 'a screening''s result cannot be emailed to its contact address' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_contact_undeliverable';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_run_mail_refusal() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_run_mail_refusal() FROM PUBLIC;
