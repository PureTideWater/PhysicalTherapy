-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- subscription_claim_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 24615116b611dcb0
-- Trigger function of: subscription_claim.subscription_claim_rules
CREATE OR REPLACE FUNCTION public.subscription_claim_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a subscription claim is kept' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.plan, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.plan, OLD.created_at)
     OR NOT ((OLD.status = NEW.status AND OLD.stripe_subscription_id IS NOT DISTINCT FROM NEW.stripe_subscription_id)
             OR (OLD.status = 'pending' AND NEW.status IN ('created', 'failed'))
             OR (OLD.status = 'created' AND NEW.status = 'ended' AND NEW.stripe_subscription_id = OLD.stripe_subscription_id)) THEN
    RAISE EXCEPTION 'a subscription claim moves from pending to created or failed, and from created to ended' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.subscription_claim_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.subscription_claim_rules() FROM PUBLIC;
