SET statement_timeout = '20min';
BEGIN;
SET LOCAL ROLE tp_owner;
\i A.sql
SELECT 'practices in scope ' || (SELECT count(*) FROM practice) || ', scope text length ' || length(set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true));
\echo SAMPLE the preflight's predicate over :n statements read in table order
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) SELECT count(*) FILTER (WHERE roi_links_valid(s.links) IS NOT TRUE) FROM (SELECT links FROM roi_statement LIMIT :n) s;
ROLLBACK;
