-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- mail_state_rank(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 72f7fbe980da4163
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.mail_state_rank(state text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE state WHEN 'pending' THEN -1 WHEN 'sent' THEN 0 WHEN 'delayed' THEN 1 WHEN 'delivered' THEN 2
                    WHEN 'complained' THEN 3 WHEN 'bounced' THEN 3 WHEN 'suppressed' THEN 3 WHEN 'rejected' THEN 3 WHEN 'failed' THEN 3 END
$function$;
ALTER FUNCTION public.mail_state_rank(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.mail_state_rank(text) FROM PUBLIC;
