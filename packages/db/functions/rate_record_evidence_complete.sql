-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rate_record_evidence_complete(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dd3b8e4585a95c30
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.rate_record_evidence_complete(evidence jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    jsonb_typeof(evidence -> 'document_id') = 'string'
      AND (evidence ->> 'document_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND jsonb_typeof(evidence -> 'page') = 'number' AND (evidence ->> 'page') ~ '^[1-9][0-9]{0,5}$'
      AND jsonb_typeof(evidence -> 'quote') = 'string' AND btrim(evidence ->> 'quote') <> ''
      AND jsonb_typeof(evidence -> 'hash') = 'string' AND (evidence ->> 'hash') ~ '^[0-9a-f]{64}$',
    false)
$function$;
ALTER FUNCTION public.rate_record_evidence_complete(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rate_record_evidence_complete(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_record_evidence_complete(jsonb) TO tp_app;
