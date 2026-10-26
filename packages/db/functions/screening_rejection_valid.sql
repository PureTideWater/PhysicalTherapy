-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_rejection_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9c24ac2e08f6742b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_rejection_valid(reason jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(reason) IS DISTINCT FROM 'object' THEN false ELSE coalesce(
       jsonb_typeof(reason -> 'code') = 'string'
   AND (reason ->> 'code') IN ('phi_column', 'unknown_column', 'duplicate_column', 'missing_column', 'row_shape', 'invalid_value', 'band_holds_date',
                               'band_in_future', 'band_outside_content', 'duplicate_row', 'no_rows', 'too_many_rows', 'row_count_mismatch', 'too_few_claim_lines')
   AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(reason) k WHERE k NOT IN ('code', 'column', 'row', 'first_row', 'field', 'phi'))
   AND (NOT reason ? 'column' OR (jsonb_typeof(reason -> 'column') = 'number' AND (reason ->> 'column') ~ '^[1-9][0-9]?$' AND (reason ->> 'column')::integer <= 64))
   AND (NOT reason ? 'row' OR (jsonb_typeof(reason -> 'row') = 'number' AND (reason ->> 'row') ~ '^[1-9][0-9]{0,7}$' AND (reason ->> 'row')::integer <= 10000000))
   AND (NOT reason ? 'first_row' OR (jsonb_typeof(reason -> 'first_row') = 'number' AND (reason ->> 'first_row') ~ '^[1-9][0-9]{0,7}$' AND (reason ->> 'first_row')::integer <= 10000000))
   AND (NOT reason ? 'field' OR (jsonb_typeof(reason -> 'field') = 'string'
        AND (reason ->> 'field') IN ('procedure_code', 'modifiers', 'units', 'place_of_service', 'payer_product', 'service_band', 'allowed_total', 'claim_count')))
   AND (NOT reason ? 'phi' OR (jsonb_typeof(reason -> 'phi') = 'string'
        AND (reason ->> 'phi') IN ('name', 'date_of_birth', 'member_id', 'date_of_service', 'claim_number'))), false)
  END
$function$;
ALTER FUNCTION public.screening_rejection_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_rejection_valid(jsonb) FROM PUBLIC;
