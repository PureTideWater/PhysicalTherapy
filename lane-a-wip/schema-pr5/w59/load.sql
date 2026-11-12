\set ON_ERROR_STOP on
-- W41, 2026-11-12. SYNTHETIC rows only. 1,000 practices x 1,000 four-key statements of 40 IDs, written a period at a
-- time so that every practice's statements are spread over the whole table (one row in every 1,000): the worst
-- physical order for reading a practice's statements through an index. :analyze_empty = 1 analyzes the empty table
-- first (statistics that say "empty"); autovacuum is off on the table so the state under test stays as built.
ALTER TABLE roi_statement SET (autovacuum_enabled = false, toast.autovacuum_enabled = false);
\if :analyze_empty
ANALYZE roi_statement;
\endif
SET session_replication_role = replica;
INSERT INTO practice (id, name, data_key_ref) SELECT gen_random_uuid(), 'SYNTHETIC practice ' || n, 'local:v1:AAAA' FROM generate_series(1, :practices) n;
CREATE TABLE m_p AS SELECT id, row_number() OVER (ORDER BY id) AS k FROM practice;
\timing on
DO $$
BEGIN
  FOR s IN 1..1000 LOOP
    INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
    SELECT p.id, date '1990-01-01' + s, date '1990-01-01' + s, 'posted', 0, 0, 0, 0, 0, 0,
           jsonb_build_object('recovered', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0),
                              'interest', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0),
                              'approved_unposted', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0),
                              'actionable_open', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0))
      FROM m_p p ORDER BY p.k;
  END LOOP;
END $$;
\timing off
CHECKPOINT;
SELECT 'loaded: ' || count(*) || ' statements, ' || count(DISTINCT practice_id) || ' practices, table ' || pg_size_pretty(pg_total_relation_size('roi_statement')) FROM roi_statement;
SELECT 'pg_class: ' || string_agg(relname || ' reltuples=' || reltuples || ' relpages=' || relpages || ' allvisible=' || relallvisible, '; ') FROM pg_class WHERE relname LIKE 'roi_statement%';
