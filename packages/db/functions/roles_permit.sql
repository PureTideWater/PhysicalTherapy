-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- roles_permit(text[],text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1e0aed05610a51f5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.roles_permit(held text[], wanted text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM role_permission p WHERE p.role = ANY (held) AND p.action = wanted AND p.effect = 'allow')
     AND NOT EXISTS (SELECT 1 FROM role_permission p WHERE p.role = ANY (held) AND p.action = wanted AND p.effect = 'deny')
$function$;
ALTER FUNCTION public.roles_permit(text[],text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.roles_permit(text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roles_permit(text[],text) TO tp_app;
