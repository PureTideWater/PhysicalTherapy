-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_refusal_codes_valid(text[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0a9bdc2eb83f380b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_refusal_codes_valid(codes text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT coalesce(cardinality(codes) <= 14
     AND (cardinality(codes) = 0 OR (array_ndims(codes) = 1 AND array_lower(codes, 1) = 1))
     AND array_position(codes, NULL) IS NULL
     AND NOT EXISTS (SELECT 1 FROM unnest(codes) c
                      WHERE c NOT IN ('phi_column', 'unknown_column', 'duplicate_column', 'missing_column', 'row_shape', 'invalid_value', 'band_holds_date',
                                      'band_in_future', 'band_outside_content', 'duplicate_row', 'no_rows', 'too_many_rows', 'row_count_mismatch',
                                      'too_few_claim_lines'))
     AND codes = ARRAY(SELECT d.c FROM (SELECT DISTINCT c FROM unnest(codes) c) d ORDER BY d.c COLLATE "C"), false)
$function$;
ALTER FUNCTION public.screening_refusal_codes_valid(text[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_refusal_codes_valid(text[]) FROM PUBLIC;
