-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_people(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fef22ffd1c2ffb18
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_version_people(target uuid)
 RETURNS TABLE(drafted_by_email text, approved_by_email text, regulation_confirmed_by_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT d.email, a.email, s.email
    FROM packet_version v
    JOIN "user" d ON d.id = v.drafted_by
    LEFT JOIN "user" a ON a.id = v.approved_by
    LEFT JOIN "user" s ON s.id = v.regulation_confirmed_by
   WHERE v.id = target AND v.practice_id = ANY (coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]))
$function$;
ALTER FUNCTION public.packet_version_people(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_people(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.packet_version_people(uuid) TO tp_app;
