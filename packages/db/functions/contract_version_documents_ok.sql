-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_version_documents_ok(contract_version)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: bf482cd46a5a4a8b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.contract_version_documents_ok(v contract_version)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  document uuid;
BEGIN
  IF cardinality(v.source_document_ids) > 0 THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'a contract version''s documents are checked at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
    END IF;
    FOR document IN SELECT DISTINCT x FROM unnest(v.source_document_ids) x ORDER BY x LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('document_use:' || document::text, 0));
    END LOOP;
    IF EXISTS (SELECT 1 FROM source_document d
                WHERE d.id = ANY (v.source_document_ids) AND d.practice_id = v.practice_id
                  AND (d.filed_for_submission_id IS NOT NULL
                       OR EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id = d.practice_id AND r.document_id = d.id))) THEN
      RAISE EXCEPTION 'a version''s documents are never a payer response''s letter or a letter filed for a submission' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN (SELECT count(DISTINCT x) FROM unnest(v.source_document_ids) x) = cardinality(v.source_document_ids)
     AND (SELECT count(*) FROM source_document d
           WHERE d.id = ANY (v.source_document_ids) AND d.practice_id = v.practice_id
             AND d.kind IN ('contract', 'exhibit', 'payer_letter') AND d.scan_status = 'clean') = cardinality(v.source_document_ids);
END;
$function$;
ALTER FUNCTION public.contract_version_documents_ok(contract_version) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_version_documents_ok(contract_version) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_version_documents_ok(contract_version) TO tp_app;
