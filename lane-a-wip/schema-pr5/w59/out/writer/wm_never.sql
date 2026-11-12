\set ON_ERROR_STOP on
\set A c0dfa763-1a17-4107-be21-a47189d1622a
SET SESSION AUTHORIZATION tp_app;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=before run=1
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=before run=2
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=before run=3
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=before run=4
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=before run=5
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo PLAN never-analyzed query=before
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
;
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=after run=1
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents, (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)) AS line_ids
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=after run=2
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents, (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)) AS line_ids
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=after run=3
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents, (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)) AS line_ids
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=after run=4
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents, (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)) AS line_ids
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=after run=5
\timing on
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents, (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)) AS line_ids
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo PLAN never-analyzed query=after
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents, (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)) AS line_ids
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
;
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=onepass run=1
\timing on
SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=onepass run=2
\timing on
SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=onepass run=3
\timing on
SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=onepass run=4
\timing on
SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed query=onepass run=5
\timing on
SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
\g /dev/null
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo PLAN never-analyzed query=onepass
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c CROSS JOIN LATERAL (
         SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents, coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
           FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
                   FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
                   LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
                  WHERE x.case_id = c.id AND x.practice_id = c.practice_id
                 OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
;
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=five run=1
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=five run=2
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=five run=3
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=five run=4
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=five run=5
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=four run=1
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'four' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=four run=2
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'four' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=four run=3
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'four' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=four run=4
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'four' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
\echo RUN never-analyzed insert=four run=5
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'four' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five';
\echo RUN never-analyzed insert=repeat run=1
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five';
\echo RUN never-analyzed insert=repeat run=2
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five';
\echo RUN never-analyzed insert=repeat run=3
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five';
\echo RUN never-analyzed insert=repeat run=4
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{c0dfa763-1a17-4107-be21-a47189d1622a}', true) \g /dev/null
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five';
\echo RUN never-analyzed insert=repeat run=5
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT 'c0dfa763-1a17-4107-be21-a47189d1622a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'five' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
