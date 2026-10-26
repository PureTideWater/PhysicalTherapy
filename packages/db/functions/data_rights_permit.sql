-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- data_rights_permit(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 97a340475b983d2f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.data_rights_permit(target_agreement uuid, target_practice uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM agreement a JOIN practice p ON p.id = target_practice
     WHERE a.id = target_agreement AND a.kind = 'data_rights' AND a.signed_at <= now()
       AND (a.practice_id = p.id OR (a.practice_id IS NULL AND a.organization_id = p.organization_id))
  )
$function$;
ALTER FUNCTION public.data_rights_permit(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.data_rights_permit(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.data_rights_permit(uuid,uuid) TO tp_app;
GRANT EXECUTE ON FUNCTION public.data_rights_permit(uuid,uuid) TO tp_operator;
