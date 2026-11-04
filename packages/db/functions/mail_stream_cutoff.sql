-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- mail_stream_cutoff(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fe3e57d4187593b9
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.mail_stream_cutoff(request text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  counted record;
BEGIN
  SELECT w.sends, w.bounces, w.complaints INTO counted FROM mail_window_counts('screening') w;
  IF counted.bounces::bigint * 10000 > 300 * greatest(counted.sends, 200)::bigint THEN
    RETURN CASE WHEN mail_stream_pause('bounce_rate', NULL, request) THEN 'bounce_rate' END;
  ELSIF counted.complaints::bigint * 100000 > 80 * greatest(counted.sends, 2500)::bigint THEN
    RETURN CASE WHEN mail_stream_pause('complaint_rate', NULL, request) THEN 'complaint_rate' END;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.mail_stream_cutoff(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.mail_stream_cutoff(text) FROM PUBLIC;
