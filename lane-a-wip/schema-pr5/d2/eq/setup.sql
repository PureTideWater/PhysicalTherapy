\set ON_ERROR_STOP on
\set A '''00000000-0000-4000-8000-00000000000a'''
DROP TABLE IF EXISTS t_cases, t_rand CASCADE;
CREATE TABLE t_cases (name text PRIMARY KEY, practice uuid NOT NULL, cents bigint NOT NULL, links jsonb NOT NULL);
CREATE TEMP TABLE k AS SELECT
  (SELECT links FROM m_links WHERE tag = 'month') AS month, (SELECT cents FROM m_links WHERE tag = 'month') AS month_cents,
  (SELECT links FROM m_links WHERE tag = 'month4') AS month4,
  (SELECT jsonb_agg(priced_line_id ORDER BY n) FROM m_a_lines WHERE n <= 3) AS l3, (SELECT sum(variance) FROM m_a_lines WHERE n <= 3) AS c3,
  (SELECT jsonb_agg(case_id ORDER BY n) FROM m_a_lines WHERE n <= 3) AS k3,
  (SELECT to_jsonb(old_priced_line_id) FROM m_a_lines WHERE n = 1) AS old1,
  (SELECT to_jsonb(priced_line_id) FROM m_a_lines WHERE n = 1) AS l1, (SELECT variance FROM m_a_lines WHERE n = 1) AS c1,
  (SELECT to_jsonb(p.id) FROM priced_line p WHERE p.practice_id <> :A::uuid ORDER BY p.id LIMIT 1) AS foreign_line,
  (SELECT p.variance_cents FROM priced_line p WHERE p.practice_id <> :A::uuid ORDER BY p.id LIMIT 1) AS foreign_cents,
  (SELECT p.practice_id FROM priced_line p WHERE p.practice_id <> :A::uuid ORDER BY p.id LIMIT 1) AS foreign_practice,
  (SELECT to_jsonb(l.case_id) FROM case_line l WHERE l.practice_id <> :A::uuid ORDER BY l.priced_line_id LIMIT 1) AS foreign_case,
  '{"recovered":[],"interest":[],"approved_unposted":[]}'::jsonb AS base;
INSERT INTO t_cases SELECT v.name, coalesce(v.practice, :A::uuid), v.cents, v.links FROM k, LATERAL (VALUES
  ('01 the month: 30,795 lines, 1,200 cases, the right figure', NULL::uuid, k.month_cents, k.month),
  ('02 the month, one cent over', NULL, k.month_cents + 1, k.month),
  ('03 the month, one line listed twice', NULL, k.month_cents, jsonb_set(k.month, '{actionable_open_lines}', (k.month -> 'actionable_open_lines') || k.l1)),
  ('04 the month plus another practice''s line, its cents added', NULL, k.month_cents + k.foreign_cents, jsonb_set(k.month, '{actionable_open_lines}', (k.month -> 'actionable_open_lines') || k.foreign_line)),
  ('05 four keys, the month''s figure', NULL, k.month_cents, k.month4),
  ('06 five keys, an empty line list, figure 0, cases listed', NULL, 0, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', '[]'::jsonb)),
  ('07 an empty line list, figure 5', NULL, 5, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', '[]'::jsonb)),
  ('08 three lines of three cases, the right figure', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', k.l3)),
  ('09 three lines, one twice', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', k.l3 || k.l1)),
  ('10 three lines, one cent under', NULL, k.c3 - 1, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', k.l3)),
  ('11 three lines, one of their cases not listed', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3 - 0, 'actionable_open_lines', k.l3)),
  ('12 the key actionable_open missing, three lines', NULL, k.c3, k.base || jsonb_build_object('actionable_open_lines', k.l3)),
  ('13 the key actionable_open missing, an empty line list', NULL, 0, k.base || jsonb_build_object('actionable_open_lines', '[]'::jsonb)),
  ('14 another practice''s line alone, its figure, its case listed', NULL, k.foreign_cents, k.base || jsonb_build_object('actionable_open', jsonb_build_array(k.foreign_case), 'actionable_open_lines', jsonb_build_array(k.foreign_line))),
  ('15 a superseded priced line of a listed case, figure 0', NULL, 0, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', jsonb_build_array(k.old1))),
  ('16 a line that is no row, figure 0', NULL, 0, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', '["11111111-1111-4111-8111-111111111111"]'::jsonb)),
  ('17 a statement of another practice, out of scope', k.foreign_practice, k.c3, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', k.l3)),
  ('18 a JSON null in the line list, figure 0', NULL, 0, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', '[null]'::jsonb)),
  ('19 a malformed ID in the line list', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', k.l3 || '["zz"]'::jsonb)),
  ('20 an upper-case ID of a real line, the right figure', NULL, k.c1, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', jsonb_build_array(upper(k.l1 #>> '{}')))),
  ('21 the line list is a string, not a list', NULL, 0, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', '"x"'::jsonb)),
  ('22 one line with a figure, figure 0 stated', NULL, 0, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', jsonb_build_array(k.l1))),
  ('23 three lines, their cases each listed twice', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3 || k.k3, 'actionable_open_lines', k.l3)),
  ('24 three lines, a JSON null among the cases', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3 || '[null]'::jsonb, 'actionable_open_lines', k.l3)),
  ('25 a malformed ID among the cases, three lines', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3 || '["zz"]'::jsonb, 'actionable_open_lines', k.l3)),
  ('26 the cases are an object, not a list', NULL, k.c3, k.base || jsonb_build_object('actionable_open', '{}'::jsonb, 'actionable_open_lines', k.l3)),
  ('27 a sixth key', NULL, k.c3, k.base || jsonb_build_object('actionable_open', k.k3, 'actionable_open_lines', k.l3, 'more', '[]'::jsonb))
) v(name, practice, cents, links);
CREATE OR REPLACE FUNCTION t_try(c t_cases) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
  VALUES (c.practice, '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, c.cents, 0, c.links);
  RAISE EXCEPTION 'ACCEPTED' USING ERRCODE = 'P0999';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END $$;
-- The two blocks alone, word for word but for NEW.links -> links and NEW.practice_id -> practice.
CREATE OR REPLACE FUNCTION t_block_d(links jsonb, practice uuid) RETURNS text LANGUAGE sql AS $$
    SELECT row(t.linked, t.found, t.cents)::text FROM (
    SELECT (SELECT count(*) FROM jsonb_array_elements_text(links -> 'actionable_open_lines')) AS linked,
           (SELECT count(*) FROM priced_line p JOIN case_line l ON l.service_line_id = p.service_line_id AND l.priced_line_id = p.id
             WHERE p.practice_id = practice AND l.practice_id = practice
               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(links -> 'actionable_open_lines') x)
               AND l.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(links -> 'actionable_open') x)) AS found,
           (SELECT coalesce(sum(p.variance_cents), 0) FROM priced_line p
             WHERE p.practice_id = practice
               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(links -> 'actionable_open_lines') x)) AS cents) t
$$;
CREATE OR REPLACE FUNCTION t_block_d2(links jsonb, practice uuid) RETURNS text LANGUAGE sql AS $$
    SELECT row(t.linked, t.found, t.cents)::text FROM (
    SELECT (SELECT count(*) FROM jsonb_array_elements_text(links -> 'actionable_open_lines')) AS linked,
           count(*) FILTER (WHERE m.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(links -> 'actionable_open') x)) AS found,
           coalesce(sum(m.variance_cents), 0) AS cents
      FROM (SELECT DISTINCT x::uuid AS id FROM jsonb_array_elements_text(links -> 'actionable_open_lines') x) i
     CROSS JOIN LATERAL (
           SELECT p.variance_cents,
                  (SELECT l.case_id FROM case_line l
                    WHERE l.service_line_id = p.service_line_id AND l.priced_line_id = p.id AND l.practice_id = practice) AS case_id
             FROM priced_line p
            WHERE p.id = i.id AND p.practice_id = practice
           OFFSET 0) m) t
$$;
-- 400 random statements: lines drawn (with repeats) from practice A's first 60 lines, their superseded lines, another
-- practice's lines, IDs of no row and nulls; cases drawn from those lines' cases, another practice's cases and nulls.
CREATE TEMP TABLE pool_l AS
  SELECT to_jsonb(priced_line_id) AS v FROM m_a_lines WHERE n <= 60
  UNION ALL SELECT to_jsonb(old_priced_line_id) FROM m_a_lines WHERE n <= 6
  UNION ALL (SELECT to_jsonb(p.id) FROM priced_line p WHERE p.practice_id <> :A::uuid ORDER BY p.id LIMIT 6)
  UNION ALL SELECT to_jsonb(gen_random_uuid()) FROM generate_series(1, 3)
  UNION ALL SELECT 'null'::jsonb;
CREATE TEMP TABLE pool_c AS
  SELECT to_jsonb(case_id) AS v FROM m_a_lines WHERE n <= 60
  UNION ALL (SELECT to_jsonb(l.case_id) FROM case_line l WHERE l.practice_id <> :A::uuid ORDER BY l.priced_line_id LIMIT 6)
  UNION ALL SELECT 'null'::jsonb;
SELECT setseed(0.42);
CREATE TABLE t_rand AS
SELECT g AS i, jsonb_build_object(
         'actionable_open', (SELECT coalesce(jsonb_agg(v), '[]') FROM (SELECT v FROM pool_c WHERE random() < 0.02 * (g % 50) + 0.01 * g / g) s),
         'actionable_open_lines', (SELECT coalesce(jsonb_agg(v), '[]') FROM (SELECT v FROM pool_l, generate_series(1, 2) r WHERE random() < 0.012 * (g % 40) + 0.01 * g / g) s)) AS links
  FROM generate_series(1, 400) g;
GRANT SELECT ON t_cases, t_rand TO tp_app;
SELECT 'cases ' || (SELECT count(*) FROM t_cases) || ', random ' || (SELECT count(*) FROM t_rand) || ', random with a repeat ' ||
       (SELECT count(*) FROM t_rand t WHERE (SELECT count(*) <> count(DISTINCT e) FROM jsonb_array_elements(t.links -> 'actionable_open_lines') e));
