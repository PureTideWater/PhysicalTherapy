-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_version_retired_by(contract_version,contract_version,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d28cf1aa50ff68a3
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.contract_version_retired_by(prior contract_version, retired contract_version, successor_status text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM contract_version n
     WHERE n.supersedes_id = prior.id AND n.contract_id = prior.contract_id AND n.status = successor_status
       AND CASE WHEN retired.status = 'superseded'
                THEN retired.effective_to IS NOT DISTINCT FROM prior.effective_to AND (prior.status = 'approved' OR n.effective_from <= prior.effective_from)
                ELSE prior.status = 'signed_off' AND retired.status = 'signed_off' AND retired.effective_to = n.effective_from
                     AND prior.effective_from < n.effective_from AND (prior.effective_to IS NULL OR n.effective_from < prior.effective_to)
           END
  )
$function$;
ALTER FUNCTION public.contract_version_retired_by(contract_version,contract_version,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_version_retired_by(contract_version,contract_version,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_version_retired_by(contract_version,contract_version,text) TO tp_app;
