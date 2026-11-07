SET search_path = t, public;
CREATE TEMP TABLE payload AS
SELECT 'aaaaaaaa-0000-4000-8000-000000000001'::uuid AS practice_id, sum(p.variance_cents) AS cents, jsonb_build_object('recovered', '[]'::jsonb, 'interest', '[]'::jsonb, 'approved_unposted', '[]'::jsonb,
         'actionable_open', (SELECT jsonb_agg(c.id) FROM t."case" c WHERE c.practice_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
         'actionable_open_lines', jsonb_agg(p.id)) AS links
  FROM t.priced_line p JOIN t.case_line l ON l.priced_line_id = p.id WHERE p.practice_id = 'aaaaaaaa-0000-4000-8000-000000000001';
\timing on
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) SELECT practice_id, cents, links FROM payload;
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) SELECT practice_id, cents, links FROM payload;
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) SELECT practice_id, cents, links FROM payload;
ALTER TABLE t.roi_statement DISABLE TRIGGER roi_statement_rules;
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) SELECT practice_id, cents, links FROM payload;
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) SELECT practice_id, cents, links FROM payload;
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) SELECT practice_id, cents, links FROM payload;
