-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_data_rights_agreement(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 015cd610493859a5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_data_rights_agreement(target_practice uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT a.id FROM agreement a JOIN practice p ON p.id = target_practice
   WHERE practice_in_scope(target_practice)
     AND a.kind = 'data_rights' AND a.signed_at <= now()
     AND (a.practice_id = p.id OR (a.practice_id IS NULL AND a.organization_id = p.organization_id))
   ORDER BY a.signed_at DESC, a.id
   LIMIT 1
$function$;
ALTER FUNCTION public.practice_data_rights_agreement(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_data_rights_agreement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_data_rights_agreement(uuid) TO tp_app;
