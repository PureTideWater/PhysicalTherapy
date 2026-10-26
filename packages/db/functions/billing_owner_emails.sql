-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_owner_emails(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 98dafc8c17d7f83b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.billing_owner_emails(target_organization uuid)
 RETURNS TABLE(email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT u.email FROM membership m JOIN "user" u ON u.id = m.user_id
   WHERE m.organization_id = target_organization AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active'
     AND roles_permit(ARRAY[m.role], 'organization.billing')
   ORDER BY u.email
$function$;
ALTER FUNCTION public.billing_owner_emails(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_owner_emails(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_owner_emails(uuid) TO tp_billing;
