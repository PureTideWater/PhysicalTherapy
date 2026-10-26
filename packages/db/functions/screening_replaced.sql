-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_replaced(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0447db227547c072
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_replaced(prospect uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM screening_prospect o
      JOIN screening_prospect n ON n.id <> o.id
       AND (n.contact_email = o.contact_email OR (n.zip = o.zip AND screening_practice_key(n.practice_name) = screening_practice_key(o.practice_name)))
      JOIN screening_upload u ON u.prospect_id = n.id AND u.status = 'accepted'
     WHERE o.id = prospect)
$function$;
ALTER FUNCTION public.screening_replaced(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_replaced(uuid) FROM PUBLIC;
