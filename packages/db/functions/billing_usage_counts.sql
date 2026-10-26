-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_usage_counts()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 82e27747d11f1494
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_usage_counts()
 RETURNS TABLE(organization_id uuid, granted_practices integer, active_practices integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT o.id,
         (SELECT count(DISTINCT g.practice_id) FROM "grant" g JOIN practice p ON p.id = g.practice_id
           WHERE g.organization_id = o.id AND g.revoked_at IS NULL AND g.starts_at <= now() AND g.ends_at > now() AND p.status = 'active')::integer,
         (SELECT count(*) FROM practice p
           WHERE p.status = 'active'
             AND (p.organization_id = o.id
                  OR EXISTS (SELECT 1 FROM "grant" g WHERE g.organization_id = o.id AND g.practice_id = p.id AND g.revoked_at IS NULL AND g.starts_at <= now() AND g.ends_at > now())))::integer
    FROM organization o
   WHERE o.kind IN ('group', 'firm')
   ORDER BY o.id
$function$;
ALTER FUNCTION public.billing_usage_counts() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_usage_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_usage_counts() TO tp_billing;
