-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rate_limit_take(text,text,integer,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: bf108aba360585e7
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.rate_limit_take(target_bucket text, target_subject text, max_hits integer, window_seconds integer)
 RETURNS TABLE(allowed boolean, hits integer, retry_after_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  moment timestamptz := clock_timestamp();
  started timestamptz;
  counted integer;
BEGIN
  IF max_hits IS NULL OR max_hits < 1 OR window_seconds IS NULL OR window_seconds < 1 OR window_seconds > 86400 THEN
    RAISE EXCEPTION 'a rate limit has at least one hit in a window of one second to a day' USING ERRCODE = 'check_violation';
  END IF;
  started := to_timestamp(floor(extract(epoch FROM moment) / window_seconds) * window_seconds);
  INSERT INTO rate_limit_counter AS c (bucket, subject, window_start, hits) VALUES (target_bucket, target_subject, started, 1)
    ON CONFLICT (bucket, subject, window_start) DO UPDATE SET hits = c.hits + 1
    RETURNING c.hits INTO counted;
  DELETE FROM rate_limit_counter c WHERE c.bucket = target_bucket AND c.subject = target_subject AND c.window_start < started;
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_counter c WHERE c.window_start < moment - interval '2 days';
  END IF;
  RETURN QUERY SELECT counted <= max_hits, counted,
    CASE WHEN counted <= max_hits THEN 0 ELSE greatest(1, ceil(extract(epoch FROM (started + make_interval(secs => window_seconds) - moment)))::integer) END;
END;
$function$;
ALTER FUNCTION public.rate_limit_take(text,text,integer,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rate_limit_take(text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_take(text,text,integer,integer) TO tp_app;
