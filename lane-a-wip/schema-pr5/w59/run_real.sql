-- W59: the REAL migration file as the runner runs one (tp_owner, one transaction, lock_timeout 5 s), rolled back.
\set ON_ERROR_STOP off
BEGIN;
SET LOCAL ROLE tp_owner;
SELECT set_config('lock_timeout', '5000ms', true);
\timing on
\i /home/user/PhysicalTherapy/packages/db/migrations/20261115090000_roi_statement_actionable_lines.sql
\timing off
SELECT 'scope after: ' || current_setting('app.practice_ids', true);
SELECT 'lock: ' || obj || ' ' || mode || ' x' || n FROM (SELECT CASE WHEN locktype = 'relation' THEN relation::regclass::text ELSE locktype END AS obj, mode, count(*) AS n FROM pg_locks WHERE pid = pg_backend_pid() AND locktype IN ('relation', 'transactionid') GROUP BY 1, 2) q ORDER BY 1;
SELECT 'bodies in the transaction: ' || string_agg(proname || ' ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16), ', ' ORDER BY proname) FROM pg_proc WHERE proname IN ('roi_links_valid', 'roi_statement_rules');
ROLLBACK;
SELECT 'bodies after rollback: ' || string_agg(proname || ' ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16), ', ' ORDER BY proname) FROM pg_proc WHERE proname IN ('roi_links_valid', 'roi_statement_rules');
SELECT 'statements after: ' || count(*) FROM roi_statement;
