\set ON_ERROR_STOP on
SET session_replication_role = replica;
INSERT INTO practice (id, name, data_key_ref) SELECT gen_random_uuid(), 'SYNTHETIC practice ' || n, 'local:v1:AAAA' FROM generate_series(1, 1000) n;
CREATE TABLE m_p AS SELECT id, row_number() OVER () AS k FROM practice;
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT p.id, date '1990-01-01' + s, date '1990-01-01' + s, 'posted', 0, 0, 0, 0, 0, 0,
       jsonb_build_object('recovered', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0),
                          'interest', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0),
                          'approved_unposted', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0),
                          'actionable_open', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1, 10) g WHERE g + s + p.k > 0))
  FROM m_p p CROSS JOIN generate_series(1, 1000) s;
\timing off
SELECT 'pre1 loaded: ' || count(*) || ' statements, ' || count(DISTINCT practice_id) || ' practices, table ' || pg_size_pretty(pg_total_relation_size('roi_statement')) FROM roi_statement;
