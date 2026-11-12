-- The plans of the block's three reads, as tp_owner, in whatever statistics state the database is in.
\set ON_ERROR_STOP off
SELECT 'pg_class: ' || string_agg(relname || ' reltuples=' || reltuples || ' relpages=' || relpages || ' allvisible=' || relallvisible, '; ') FROM pg_class WHERE relname LIKE 'roi_statement%';
SELECT id AS pid FROM practice ORDER BY id OFFSET 500 LIMIT 1 \gset
BEGIN;
SET LOCAL ROLE tp_owner;
\i A.sql
SELECT length(set_config('app.practice_ids', ARRAY[:'pid'::uuid]::text, true)) AS one_practice_scope;
PREPARE scan(uuid) AS SELECT count(*), count(*) FILTER (WHERE roi_links_valid(s.links) IS NOT TRUE) FROM roi_statement s WHERE s.practice_id = $1;
PREPARE cnt(uuid) AS SELECT count(*) FROM roi_statement s WHERE s.practice_id = $1;
\echo PLAN scan, custom
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) EXECUTE scan(:'pid');
SET LOCAL plan_cache_mode = force_generic_plan;
\echo PLAN scan, generic
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) EXECUTE scan(:'pid');
\echo PLAN closing count, generic
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) EXECUTE cnt(:'pid');
RESET plan_cache_mode;
SELECT length(set_config('app.practice_ids', (SELECT array_agg(id)::text FROM practice), true)) AS whole_scope;
\echo PLAN probe, whole scope
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT EXISTS (SELECT 1 FROM roi_statement);
\echo PLAN whole-scope count, the planner choice (not run)
EXPLAIN (COSTS OFF) SELECT count(*) FROM roi_statement;
\echo PLAN whole-scope check in one statement, the planner choice (not run)
EXPLAIN (COSTS OFF) SELECT practice_id, count(*), count(*) FILTER (WHERE roi_links_valid(links) IS NOT TRUE) FROM roi_statement GROUP BY practice_id;
SET LOCAL enable_seqscan = off;
\echo PLAN the same with enable_seqscan off (not run)
EXPLAIN (COSTS OFF) SELECT practice_id, count(*), count(*) FILTER (WHERE roi_links_valid(links) IS NOT TRUE) FROM roi_statement GROUP BY practice_id;
ROLLBACK;
