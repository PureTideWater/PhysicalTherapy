\set A d2d94abf-fe71-45ac-b5a4-58c5971c3164
SET SESSION AUTHORIZATION tp_app; BEGIN; SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{d2d94abf-fe71-45ac-b5a4-58c5971c3164}', true) \g /dev/null
WITH t_plain AS MATERIALIZED (SELECT row_number() OVER () AS ord, q.* FROM (
SELECT c.id, (SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END))::text AS actionable_cents,
            (SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
              WHERE x.case_id = c.id AND x.practice_id = c.practice_id AND (CASE WHEN x.written_off_reason IS NULL AND (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END)) AS line_ids
       FROM "case" c
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
) q), t_one AS MATERIALIZED (SELECT row_number() OVER () AS ord, q.* FROM (
SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c
      CROSS JOIN LATERAL (
    SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents,
           coalesce(array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now), '{}')::text[] AS line_ids
      FROM (SELECT p.id, p.variance_cents, (CASE WHEN x.written_off_reason IS NULL AND st.stage = 'actionable' THEN coalesce(priced_line_pricing_check(x.priced_line_id) = 'current', false) ELSE false END) AS now
              FROM case_line x
              JOIN priced_line p ON p.id = x.priced_line_id
              LEFT JOIN LATERAL (SELECT s.stage FROM line_status s WHERE s.practice_id = x.practice_id AND s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) st ON true
             WHERE x.case_id = c.id AND x.practice_id = c.practice_id
            OFFSET 0) y) a
      WHERE c.practice_id = :'A' AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id
) q)
SELECT 'plain: cases ' || (SELECT count(*) || ', lines ' || sum(cardinality(line_ids)) || ', cents ' || sum(actionable_cents::bigint) FROM t_plain) || E'\none pass: cases ' || (SELECT count(*) || ', lines ' || sum(cardinality(line_ids)) || ', cents ' || sum(actionable_cents::bigint) FROM t_one)
 || E'\nrows (order, case, figure, list) in plain not in one pass: ' || (SELECT count(*) FROM (TABLE t_plain EXCEPT TABLE t_one) d) || '; in one pass not in plain: ' || (SELECT count(*) FROM (TABLE t_one EXCEPT TABLE t_plain) d); ROLLBACK;
