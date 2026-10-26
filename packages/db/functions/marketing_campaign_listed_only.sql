-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- marketing_campaign_listed_only()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 918ae38efbc9e36e
-- Trigger function of: prospect_request.prospect_request_campaign_listed
-- Trigger function of: screening_lead.screening_lead_campaign_listed
-- Trigger function of: screening_prospect.screening_prospect_campaign_listed
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.marketing_campaign_listed_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.utm_campaign !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'a campaign code is 1 to 64 lower-case letters, digits, dots, hyphens and underscores'
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_utm_campaign';
  END IF;
  NEW.utm_campaign := marketing_campaign_kept(NEW.utm_campaign);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.marketing_campaign_listed_only() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.marketing_campaign_listed_only() FROM PUBLIC;
