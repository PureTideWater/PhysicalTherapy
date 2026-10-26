-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_standing(bigint,bigint,bigint,bigint)
-- Body SHA-256 (the SQL-standard body only, from RETURN or BEGIN ATOMIC), as Appendix C prints it: d8feb37d697d3992
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_standing(expected bigint, reduced bigint, observed bigint, claim_lines bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
RETURN CASE WHEN ((COALESCE(reduced, expected) - observed) > (500 * claim_lines)) THEN 'anomaly'::text WHEN (observed >= expected) THEN 'at_or_above'::text WHEN ((reduced IS NOT NULL) AND (observed >= reduced)) THEN 'within_reduction_range'::text ELSE 'below_by_threshold_or_less'::text END;
ALTER FUNCTION public.screening_standing(bigint,bigint,bigint,bigint) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_standing(bigint,bigint,bigint,bigint) FROM PUBLIC;
