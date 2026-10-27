-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_queue_tier(text,integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0e24d0369e589961
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_queue_tier(subject text, row_count integer)
 RETURNS TABLE(wait_reason text, queue_priority smallint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  WITH limits AS (
    SELECT l.account_rows, l.daily_rows FROM screening_wait_limits() l
  ), today AS (
    SELECT date_trunc('day', now(), 'UTC') AS started
  ), account AS (
    SELECT coalesce(sum(t.row_count), 0) + $2 AS rows, count(*) FILTER (WHERE t.wait_reason = 'account_share') AS waiting
      FROM screening_queue_tally t, today WHERE t.rate_subject = $1 AND t.created_at >= today.started
  ), normal AS (
    SELECT coalesce(sum(t.row_count), 0) + $2 AS rows FROM screening_queue_tally t, today WHERE t.wait_reason IS NULL AND t.created_at >= today.started
  )
  SELECT CASE WHEN account.rows > limits.account_rows THEN 'account_share' WHEN normal.rows > limits.daily_rows THEN 'daily_cap' END,
         (CASE WHEN account.rows > limits.account_rows THEN -least(20, 1 + account.waiting)
               WHEN normal.rows > limits.daily_rows THEN -1
               ELSE 0 END)::smallint
    FROM limits, account, normal
$function$;
ALTER FUNCTION public.screening_queue_tier(text,integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_queue_tier(text,integer) FROM PUBLIC;
