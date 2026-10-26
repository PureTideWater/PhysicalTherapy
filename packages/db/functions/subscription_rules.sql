-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- subscription_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9bff8d1f6d16f0e6
-- Trigger function of: subscription.subscription_rules
CREATE OR REPLACE FUNCTION public.subscription_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a subscription is kept' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.stripe_subscription_id, NEW.stripe_customer_id) IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.stripe_subscription_id, OLD.stripe_customer_id) THEN
    RAISE EXCEPTION 'a subscription belongs to its organization and Stripe subscription for good' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.subscription_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.subscription_rules() FROM PUBLIC;
