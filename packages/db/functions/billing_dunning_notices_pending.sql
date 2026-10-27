-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_dunning_notices_pending(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 36abc45aa224268c
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_dunning_notices_pending(at_most integer)
 RETURNS TABLE(invoice_id uuid, stage text, organization_id uuid, user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT d.invoice_id, d.stage, d.organization_id, d.user_id FROM dunning_notice_recipient d
   WHERE d.state = 'pending' AND d.next_attempt_at <= now()
   ORDER BY d.next_attempt_at, d.invoice_id, d.stage, d.user_id
   LIMIT greatest(at_most, 0)
$function$;
ALTER FUNCTION public.billing_dunning_notices_pending(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_dunning_notices_pending(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_dunning_notices_pending(integer) TO tp_billing;
