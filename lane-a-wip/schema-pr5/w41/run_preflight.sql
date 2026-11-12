-- Steps 3.2 and 3.3 as the runner runs a file (tp_owner, one transaction, lock_timeout 5 s), rolled back.
\set ON_ERROR_STOP off
SELECT pg_stat_force_next_flush(); SELECT 'io before: heap ' || (heap_blks_read + heap_blks_hit) || ' (read ' || heap_blks_read || '), index ' || (idx_blks_read + idx_blks_hit) FROM pg_statio_user_tables WHERE relname = 'roi_statement';
BEGIN;
SET LOCAL ROLE tp_owner;
SELECT set_config('lock_timeout', '5000ms', true);
\i A.sql
SELECT 'A installed: ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16) FROM pg_proc WHERE proname = 'roi_links_valid';
\timing on
\i preflight.sql
\timing off
SELECT 'scope after: ' || current_setting('app.practice_ids', true);
SELECT 'lock: ' || obj || ' ' || mode || ' x' || n FROM (SELECT CASE WHEN locktype = 'relation' THEN relation::regclass::text ELSE locktype END AS obj, mode, count(*) AS n FROM pg_locks WHERE pid = pg_backend_pid() AND locktype IN ('relation', 'transactionid') GROUP BY 1, 2) q ORDER BY 1;
ROLLBACK;
SELECT pg_stat_force_next_flush(); SELECT 'io after: heap ' || (heap_blks_read + heap_blks_hit) || ' (read ' || heap_blks_read || '), index ' || (idx_blks_read + idx_blks_hit) FROM pg_statio_user_tables WHERE relname = 'roi_statement';
SELECT 'body after rollback: ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16) FROM pg_proc WHERE proname = 'roi_links_valid';
