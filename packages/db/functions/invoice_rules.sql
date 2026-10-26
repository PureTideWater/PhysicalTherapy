-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- invoice_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7c926f90860ad20e
-- Trigger function of: invoice.invoice_rules
CREATE OR REPLACE FUNCTION public.invoice_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  rank_of constant jsonb := '{"draft": 0, "open": 1, "uncollectible": 2, "paid": 3, "void": 3}';
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an invoice is kept' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.stripe_invoice_id, NEW.stripe_customer_id) IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.stripe_invoice_id, OLD.stripe_customer_id) THEN
    RAISE EXCEPTION 'an invoice belongs to its organization and Stripe invoice for good' USING ERRCODE = 'check_violation';
  END IF;
  IF (rank_of ->> NEW.status)::int < (rank_of ->> OLD.status)::int OR (OLD.status IN ('paid', 'void') AND NEW.status <> OLD.status) THEN
    RAISE EXCEPTION 'an invoice''s status moves forward only' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.first_failed_at IS NOT NULL AND (NEW.first_failed_at IS NULL OR NEW.first_failed_at > OLD.first_failed_at) THEN
    RAISE EXCEPTION 'an invoice''s first failed payment moves earlier only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.invoice_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.invoice_rules() FROM PUBLIC;
