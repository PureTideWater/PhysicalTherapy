-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- uuid_half(uuid,boolean)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2f6916880f7cf611
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.uuid_half(value uuid, first_half boolean)
 RETURNS int8range
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT int8range(half, half, '[]')
    FROM (SELECT ('x' || substr(replace(value::text, '-', ''), CASE WHEN first_half THEN 1 ELSE 17 END, 16))::bit(64)::bigint AS half) h
$function$;
ALTER FUNCTION public.uuid_half(uuid,boolean) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.uuid_half(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uuid_half(uuid,boolean) TO tp_app;
