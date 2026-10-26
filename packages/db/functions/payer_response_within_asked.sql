-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- payer_response_within_asked()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: cea09f8a11e093e1
-- Trigger function of: payer_response.payer_response_within_asked
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.payer_response_within_asked()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  asked bigint;
BEGIN
  IF NEW.kind NOT IN ('accepted', 'partial') OR NEW.amount_cents IS NULL OR NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  SELECT coalesce((SELECT sum((l ->> 'variance_cents')::bigint) FROM jsonb_array_elements(v.content -> 'lines') l), 0)
         + coalesce((v.content -> 'interest' ->> 'total_cents')::bigint, 0)
    INTO asked
    FROM submission s JOIN packet_version v ON v.id = s.packet_version_id
   WHERE s.id = NEW.submission_id AND s.practice_id = NEW.practice_id;
  IF FOUND AND NEW.amount_cents > asked THEN
    RAISE EXCEPTION 'a payer response accepts at most what its submission asked: the lines'' variance and the interest line' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.payer_response_within_asked() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.payer_response_within_asked() FROM PUBLIC;
