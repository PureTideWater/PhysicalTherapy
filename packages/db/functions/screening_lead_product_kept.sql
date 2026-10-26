-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_lead_product_kept()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5918c9fea644753d
-- Trigger function of: screening_lead_product.screening_lead_product_kept
CREATE OR REPLACE FUNCTION public.screening_lead_product_kept()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM screening_lead l WHERE l.id = OLD.lead_id) THEN
    RAISE EXCEPTION 'a kept screening summary''s products go only with it' USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_lead_kept';
  END IF;
  RETURN OLD;
END;
$function$;
ALTER FUNCTION public.screening_lead_product_kept() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_lead_product_kept() FROM PUBLIC;
