\set ON_ERROR_STOP on
-- vars: from, to, cases, others (0/1)
SET session_replication_role = replica;
\set A '''00000000-0000-4000-8000-00000000000a'''
INSERT INTO m_a_lines SELECT n, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ('00000000-0000-4000-9000-' || lpad((n % :cases)::text, 12, '0'))::uuid, 1 + (random() * 20000)::int FROM generate_series(:from, :to) n;
INSERT INTO priced_line (id, practice_id, pricing_run_id, service_line_id, method, expected_allowed_cents, expected_unrounded, observed_allowed_cents, variance_cents, trace)
SELECT x.id, :A::uuid, x.run, x.sl, 'FIXED_SCHEDULE', 10000 + x.v, 10000 + x.v, 10000, x.v, jsonb_build_object('note', repeat('SYNTHETIC ', 60))
  FROM (SELECT n, old_priced_line_id AS id, '00000000-0000-4000-a000-000000000001'::uuid AS run, service_line_id AS sl, 0::bigint AS v FROM m_a_lines WHERE n BETWEEN :from AND :to
        UNION ALL
        SELECT n, priced_line_id, '00000000-0000-4000-a000-000000000002'::uuid, service_line_id, variance FROM m_a_lines WHERE n BETWEEN :from AND :to) x
 ORDER BY x.n, x.run;
INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id)
SELECT :A::uuid, case_id, service_line_id, priced_line_id FROM m_a_lines WHERE n BETWEEN :from AND :to ORDER BY n;
\if :others
CREATE TEMP TABLE m_o AS SELECT p.id AS practice_id, gen_random_uuid() AS pl, gen_random_uuid() AS sl, gen_random_uuid() AS run, (g % 200) AS c
  FROM practice p CROSS JOIN generate_series(1, 5000) g WHERE p.id <> :A::uuid;
INSERT INTO priced_line (id, practice_id, pricing_run_id, service_line_id, method, expected_allowed_cents, expected_unrounded, observed_allowed_cents, variance_cents, trace)
SELECT pl, practice_id, run, sl, 'FIXED_SCHEDULE', 10500, 10500, 10000, 500, jsonb_build_object('note', repeat('SYNTHETIC ', 60)) FROM m_o;
INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id)
SELECT practice_id, md5(practice_id::text || c::text)::uuid, sl, pl FROM m_o;
\endif
INSERT INTO m_links
SELECT t.tag, jsonb_build_object('recovered', '[]'::jsonb, 'interest', '[]'::jsonb, 'approved_unposted', '[]'::jsonb,
         'actionable_open', (SELECT jsonb_agg(DISTINCT case_id) FROM m_a_lines WHERE n <= t.lim))
       || CASE WHEN t.five THEN jsonb_build_object('actionable_open_lines', (SELECT jsonb_agg(priced_line_id ORDER BY priced_line_id) FROM m_a_lines WHERE n <= t.lim)) ELSE '{}'::jsonb END,
       (SELECT sum(variance) FROM m_a_lines WHERE n <= t.lim)
  FROM (VALUES ('month', 30795, true), ('month4', 30795, false), ('all', 100000000, true)) t(tag, lim, five)
ON CONFLICT (tag) DO UPDATE SET links = EXCLUDED.links, cents = EXCLUDED.cents;
SELECT 'loaded: priced_line ' || (SELECT count(*) FROM priced_line) || ', of A ' || (SELECT count(*) FROM priced_line WHERE practice_id = :A::uuid) || ', case_line ' || (SELECT count(*) FROM case_line)
    || '; reltuples ' || (SELECT string_agg(relname || '=' || reltuples || '/' || relpages, ' ') FROM pg_class WHERE relname IN ('priced_line', 'case_line'))
    || '; analyzed ' || (SELECT string_agg(relname || '=' || coalesce(last_analyze::text, 'never') || '/' || coalesce(last_autoanalyze::text, 'never'), ' ') FROM pg_stat_user_tables WHERE relname IN ('priced_line', 'case_line'));
