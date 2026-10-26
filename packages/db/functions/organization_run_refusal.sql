-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- organization_run_refusal(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 28088464051fab99
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.organization_run_refusal(target_organization uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN o.status = 'suspended' THEN 'the organization is suspended: its data stays readable, and new runs start again once a platform administrator reinstates it'
    WHEN o.status = 'closed' THEN 'the organization is closed: its data stays readable, and no new run starts'
    WHEN s.standing = 'suspended' THEN 'the organization is suspended for nonpayment: an invoice has stayed unpaid for 30 days since its payment failed; its data stays readable, and new runs start again once the invoice is paid'
  END
    FROM organization o JOIN billing_standing s ON s.organization_id = o.id
   WHERE o.id = target_organization
$function$;
ALTER FUNCTION public.organization_run_refusal(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.organization_run_refusal(uuid) FROM PUBLIC;
