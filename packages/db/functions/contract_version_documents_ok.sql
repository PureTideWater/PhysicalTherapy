-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_version_documents_ok(contract_version)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fa43e7f02e96754b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.contract_version_documents_ok(v contract_version)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT (SELECT count(DISTINCT x) FROM unnest(v.source_document_ids) x) = cardinality(v.source_document_ids)
     AND (SELECT count(*) FROM source_document d
           WHERE d.id = ANY (v.source_document_ids) AND d.practice_id = v.practice_id
             AND d.kind IN ('contract', 'exhibit', 'payer_letter') AND d.scan_status = 'clean') = cardinality(v.source_document_ids)
$function$;
ALTER FUNCTION public.contract_version_documents_ok(contract_version) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_version_documents_ok(contract_version) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_version_documents_ok(contract_version) TO tp_app;
