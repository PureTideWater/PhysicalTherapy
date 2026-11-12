\set ON_ERROR_STOP off
-- The migration's steps 3.2 to 3.4 as the runner runs a file (tp_owner, one transaction, lock_timeout), rolled back.
SET statement_timeout = '45min';
SELECT 'practices ' || (SELECT count(*) FROM practice) || ', statements (pg_class estimate) ' || (SELECT reltuples FROM pg_class WHERE relname = 'roi_statement');
BEGIN;
SET LOCAL ROLE tp_owner;
SELECT set_config('lock_timeout', '5000ms', true);
\timing on
\echo STEP 3.2 A
\i A.sql
\echo STEP 3.3 set_config (every practice)
SELECT length(set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true)) AS scope_text_length;
\echo STEP 3.3 the scan
DO $$
DECLARE refused bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM roi_statement s WHERE roi_links_valid(s.links) IS NOT TRUE) THEN
    SELECT count(*) INTO refused FROM roi_statement s WHERE roi_links_valid(s.links) IS NOT TRUE;
    RAISE EXCEPTION '% stored ROI statements fail the new roi_links_valid', refused USING ERRCODE = 'check_violation';
  END IF;
END $$;
\echo EXTRA (not in the migration) count of statements in the opened scope, the policy alone
SELECT count(*) FROM roi_statement;
\echo STEP 3.3 set_config back
SELECT set_config('app.practice_ids', '{}', true);
\echo STEP 3.4 D
\i D.sql
\timing off
\echo LOCKS held by the transaction of the migration at its end
SELECT locktype, CASE WHEN locktype = 'relation' THEN relation::regclass::text ELSE coalesce(classid::regclass::text, '') END AS object, mode, granted, count(*) FROM pg_locks WHERE pid = pg_backend_pid() GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3;
ROLLBACK;
