-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_outcome_campaign_listed()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2f4aca68279c8f28
-- Trigger function of: screening_outcome.screening_outcome_campaign_listed
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_outcome_campaign_listed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.campaign !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'a campaign code is 1 to 64 lower-case letters, digits, dots, hyphens and underscores'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_outcome_campaign';
  END IF;
  NEW.campaign := marketing_campaign_kept(NEW.campaign);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.screening_outcome_campaign_listed() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_outcome_campaign_listed() FROM PUBLIC;
