-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- prospect_request_fixed()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: deb5e1b28d963590
-- Trigger function of: prospect_request.prospect_request_fixed
CREATE OR REPLACE FUNCTION public.prospect_request_fixed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.id, NEW.contact_name, NEW.contact_email, NEW.organization_name, NEW.locations, NEW.payers, NEW.billing_arrangement, NEW.created_at,
      NEW.source, NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.paid_click, NEW.referring_firm, NEW.from_screening)
     IS DISTINCT FROM (OLD.id, OLD.contact_name, OLD.contact_email, OLD.organization_name, OLD.locations, OLD.payers, OLD.billing_arrangement, OLD.created_at,
      OLD.source, OLD.utm_source, OLD.utm_medium, OLD.utm_campaign, OLD.paid_click, OLD.referring_firm, OLD.from_screening) THEN
    RAISE EXCEPTION 'a prospect request is kept as it was received' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'declined' AND OLD.declined_reason IS NULL AND NEW.declined_reason = 'not_recorded'
     AND (NEW.status, NEW.organization_id, NEW.reviewed_by, NEW.reviewed_at) IS NOT DISTINCT FROM (OLD.status, OLD.organization_id, OLD.reviewed_by, OLD.reviewed_at) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'converted' THEN
    RAISE EXCEPTION 'a converted request names its organization for good' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'declined' AND (NEW.status, NEW.declined_reason) IS DISTINCT FROM (OLD.status, OLD.declined_reason) THEN
    RAISE EXCEPTION 'a declined request keeps its status and its reason' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'declined' AND OLD.status <> 'declined' THEN
    IF NEW.declined_reason = 'not_recorded' THEN
      RAISE EXCEPTION 'a decline names its reason from the list; not recorded is only the previous image''s' USING ERRCODE = 'check_violation', CONSTRAINT = 'prospect_request_declined_reason';
    END IF;
    IF NEW.declined_reason IS NULL THEN
      NEW.declined_reason := 'not_recorded';
    END IF;
  END IF;
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.prospect_request_fixed() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.prospect_request_fixed() FROM PUBLIC;
