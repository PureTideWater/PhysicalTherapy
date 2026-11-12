-- The other options on the same rows; :opt picks one. Each as tp_owner in one rolled-back transaction, but the floor.
\set ON_ERROR_STOP off
SET statement_timeout = '30min';
BEGIN;
\if :is_floor
-- Measuring device only (scratch database): the superuser is not bound by the policy, so this is the cost of the new
-- function alone over every row. Nothing like it is proposed for the migration.
\i A.sql
SET LOCAL max_parallel_workers_per_gather = 0;
\timing on
SELECT count(*), count(*) FILTER (WHERE roi_links_valid(links) IS NOT TRUE) AS refused FROM roi_statement;
\timing off
\else
SET LOCAL ROLE tp_owner;
SELECT set_config('lock_timeout', '5000ms', true);
\i A.sql
SELECT length(set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true)) AS whole_scope;
\if :is_index
SET LOCAL enable_seqscan = off;
\timing on
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT practice_id, count(*), count(*) FILTER (WHERE roi_links_valid(links) IS NOT TRUE) FROM roi_statement GROUP BY practice_id;
\timing off
\else
\timing on
DO $$
DECLARE refused bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM roi_statement s WHERE roi_links_valid(s.links) IS NOT TRUE) THEN
    SELECT count(*) INTO refused FROM roi_statement s WHERE roi_links_valid(s.links) IS NOT TRUE;
    RAISE EXCEPTION '% stored ROI statements fail the new roi_links_valid', refused USING ERRCODE = 'check_violation';
  END IF;
END $$;
\timing off
\endif
\endif
ROLLBACK;
