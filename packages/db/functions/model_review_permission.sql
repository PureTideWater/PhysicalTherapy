-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- model_review_permission(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4771b6912529196b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.model_review_permission(call_purpose text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE call_purpose
    WHEN 'proposeContractTerms' THEN 'rate_record.edit'
    WHEN 'readDenialLetter' THEN 'submission.log'
    WHEN 'draftPacketNarrative' THEN 'packet.draft'
    WHEN 'suggestEvidenceRequests' THEN 'case.work'
  END
$function$;
ALTER FUNCTION public.model_review_permission(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.model_review_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.model_review_permission(text) TO tp_app;
GRANT EXECUTE ON FUNCTION public.model_review_permission(text) TO tp_operator;
