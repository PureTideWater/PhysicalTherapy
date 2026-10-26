-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_records_kept()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 610c0de9c4c6b698
-- Trigger function of: billing_event.billing_event_kept
-- Trigger function of: billing_event.billing_event_no_truncate
-- Trigger function of: invoice.invoice_no_truncate
-- Trigger function of: subscription.subscription_no_truncate
-- Trigger function of: subscription_claim.subscription_claim_no_truncate
-- Trigger function of: usage_snapshot.usage_snapshot_kept
-- Trigger function of: usage_snapshot.usage_snapshot_no_truncate
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_records_kept()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% rows are kept', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'usage_snapshot' THEN
    RAISE EXCEPTION 'a usage snapshot never changes' USING ERRCODE = 'check_violation';
  END IF;
  -- billing_event: only its outcome, once, from received.
  IF (NEW.id, NEW.stripe_event_id, NEW.type, NEW.occurred_at, NEW.received_at) IS DISTINCT FROM (OLD.id, OLD.stripe_event_id, OLD.type, OLD.occurred_at, OLD.received_at)
     OR OLD.outcome <> 'received' THEN
    RAISE EXCEPTION 'a billing event is recorded once; only its outcome follows' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.billing_records_kept() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_records_kept() FROM PUBLIC;
