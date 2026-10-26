-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_current_read_lock(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8d7f18dc2fe222ae
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.pricing_current_read_lock(target_practice uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION 'whether a packet version''s pricing is current is read at READ COMMITTED only: an earlier snapshot would read past a change made since' USING ERRCODE = 'invalid_transaction_state';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('pricing_current:' || target_practice::text, 0));
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('pricing_current:withdrawal', 0));
END;
$function$;
ALTER FUNCTION public.pricing_current_read_lock(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_current_read_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pricing_current_read_lock(uuid) TO tp_app;
