-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_modifiers_valid(text[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5ce982845defbad6
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_modifiers_valid(modifiers text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT coalesce(cardinality(modifiers) <= 4
     AND (cardinality(modifiers) = 0 OR (array_ndims(modifiers) = 1 AND array_lower(modifiers, 1) = 1))
     AND array_position(modifiers, NULL) IS NULL
     AND array_to_string(modifiers, ' ') ~ '^([0-9A-Z]{2}( [0-9A-Z]{2}){0,3})?$'
     AND (cardinality(modifiers) < 2 OR modifiers[1] COLLATE "C" < modifiers[2] COLLATE "C")
     AND (cardinality(modifiers) < 3 OR modifiers[2] COLLATE "C" < modifiers[3] COLLATE "C")
     AND (cardinality(modifiers) < 4 OR modifiers[3] COLLATE "C" < modifiers[4] COLLATE "C"), false)
$function$;
ALTER FUNCTION public.screening_modifiers_valid(text[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_modifiers_valid(text[]) FROM PUBLIC;
