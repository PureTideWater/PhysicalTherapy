-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submit_prospect_request(text,text,text,integer,text[],text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e2ae418d0e1c59c6
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.submit_prospect_request(contact text, email text, organization text, location_count integer, payer_names text[], arrangement text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement)
  VALUES (btrim(contact), lower(btrim(email)), btrim(organization), location_count, payer_names, arrangement)
  RETURNING id
$function$;
ALTER FUNCTION public.submit_prospect_request(text,text,text,integer,text[],text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submit_prospect_request(text,text,text,integer,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_prospect_request(text,text,text,integer,text[],text) TO tp_app;

-- submit_prospect_request(text,text,text,integer,text[],text,text,text,text,text,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e227f669a9295eeb
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.submit_prospect_request(contact text, email text, organization text, location_count integer, payer_names text[], arrangement text, heard_from text, campaign_source text, campaign_medium text, campaign_name text, click_kind text, firm text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, source, utm_source, utm_medium,
                                utm_campaign, paid_click, referring_firm)
  VALUES (btrim(contact), lower(btrim(email)), btrim(organization), location_count, payer_names, arrangement, heard_from, campaign_source, campaign_medium,
          campaign_name, click_kind, firm)
  RETURNING id
$function$;
ALTER FUNCTION public.submit_prospect_request(text,text,text,integer,text[],text,text,text,text,text,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submit_prospect_request(text,text,text,integer,text[],text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_prospect_request(text,text,text,integer,text[],text,text,text,text,text,text,text) TO tp_app;
