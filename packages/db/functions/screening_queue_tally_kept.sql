-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_queue_tally_kept()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fde98694f4ae27a6
-- Trigger function of: screening_queue_tally.screening_queue_tally_kept
CREATE OR REPLACE FUNCTION public.screening_queue_tally_kept()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.created_at < date_trunc('day', now(), 'UTC') - interval '1 day' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'an entry of the queue''s tally is kept until the UTC day after its own has ended'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'screening_queue_tally_kept';
END;
$function$;
ALTER FUNCTION public.screening_queue_tally_kept() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_queue_tally_kept() FROM PUBLIC;
