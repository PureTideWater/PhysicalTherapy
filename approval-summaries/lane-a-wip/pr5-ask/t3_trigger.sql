\set ON_ERROR_STOP off
SET search_path = t, public;
DROP TABLE IF EXISTS t.roi_statement, t.case_line, t.priced_line, t."case" CASCADE;
CREATE TABLE t.priced_line (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, service_line_id uuid NOT NULL, variance_cents bigint);
CREATE INDEX priced_line_by_service_line ON t.priced_line (practice_id, service_line_id);
CREATE TABLE t."case" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL);
CREATE TABLE t.case_line (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, case_id uuid NOT NULL REFERENCES t."case", service_line_id uuid NOT NULL, priced_line_id uuid NOT NULL REFERENCES t.priced_line,
  CONSTRAINT case_line_once UNIQUE (service_line_id));
CREATE INDEX case_line_by_case ON t.case_line (practice_id, case_id);
CREATE TABLE t.roi_statement (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practice_id uuid NOT NULL, actionable_open_cents bigint NOT NULL CHECK (actionable_open_cents >= 0),
  links jsonb NOT NULL CONSTRAINT roi_statement_links CHECK (t.roi_links_valid_new(links)), document_key text);
CREATE FUNCTION t.practice_in_scope(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
-- Only the proposed block of roi_statement_rules() (the rest of the function is unchanged and not modelled here).
CREATE FUNCTION t.roi_statement_rules_block() RETURNS trigger LANGUAGE plpgsql SET search_path = t, pg_catalog AS $f$
DECLARE
  lines record;
BEGIN
  IF TG_OP <> 'INSERT' OR NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.links ? 'actionable_open_lines' THEN
    SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines')) AS linked,
           (SELECT count(*) FROM priced_line p JOIN case_line l ON l.service_line_id = p.service_line_id AND l.priced_line_id = p.id
             WHERE p.practice_id = NEW.practice_id AND l.practice_id = NEW.practice_id
               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x)
               AND l.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open') x)) AS found,
           (SELECT coalesce(sum(p.variance_cents), 0) FROM priced_line p
             WHERE p.practice_id = NEW.practice_id
               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x)) AS cents
      INTO lines;
    IF lines.linked <> lines.found OR lines.cents <> NEW.actionable_open_cents THEN
      RAISE EXCEPTION 'an ROI statement''s actionable figure is the variance of the priced lines it links, each once and each a line of a case it links' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$f$;
CREATE TRIGGER roi_statement_rules BEFORE INSERT ON t.roi_statement FOR EACH ROW EXECUTE FUNCTION t.roi_statement_rules_block();

-- Synthetic: practice A with 4 cases and 30,795 lines (3,000 cents each), practice B with 1 case and 3 lines.
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
INSERT INTO t."case" (id, practice_id) SELECT ('cccccccc-0000-4000-8000-00000000000' || g)::uuid, :A::uuid FROM generate_series(1,4) g;
INSERT INTO t."case" (id, practice_id) VALUES ('dddddddd-0000-4000-8000-000000000001', :B::uuid);
INSERT INTO t.priced_line (practice_id, service_line_id, variance_cents) SELECT :A::uuid, gen_random_uuid(), 3000 FROM generate_series(1,30795);
INSERT INTO t.priced_line (practice_id, service_line_id, variance_cents) SELECT :B::uuid, gen_random_uuid(), 3000 FROM generate_series(1,3);
INSERT INTO t.case_line (practice_id, case_id, service_line_id, priced_line_id)
  SELECT p.practice_id, CASE WHEN p.practice_id = :A::uuid THEN ('cccccccc-0000-4000-8000-00000000000' || (1 + (row_number() OVER (ORDER BY p.id)) % 4))::uuid ELSE 'dddddddd-0000-4000-8000-000000000001'::uuid END, p.service_line_id, p.id
    FROM t.priced_line p;
ANALYZE t.priced_line; ANALYZE t.case_line; ANALYZE t."case";
\timing on
-- 1. The writer's statement: every line of A's four cases, its figure their sum.
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links)
SELECT :A::uuid, sum(p.variance_cents), jsonb_build_object('recovered', '[]'::jsonb, 'interest', '[]'::jsonb, 'approved_unposted', '[]'::jsonb,
         'actionable_open', (SELECT jsonb_agg(c.id) FROM t."case" c WHERE c.practice_id = :A::uuid),
         'actionable_open_lines', jsonb_agg(p.id))
  FROM t.priced_line p WHERE p.practice_id = :A::uuid;
\timing off
SELECT '1 accepted' AS r, actionable_open_cents, jsonb_array_length(links -> 'actionable_open_lines') AS lines, pg_column_size(links) AS links_bytes FROM t.roi_statement;
-- 2. A figure one cent off: refused.
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links)
SELECT :A::uuid, 3001, jsonb_build_object('recovered','[]'::jsonb,'interest','[]'::jsonb,'approved_unposted','[]'::jsonb,'actionable_open', jsonb_build_array('cccccccc-0000-4000-8000-000000000001'),
  'actionable_open_lines', jsonb_build_array((SELECT l.priced_line_id FROM t.case_line l WHERE l.case_id = 'cccccccc-0000-4000-8000-000000000001' LIMIT 1)));
-- 3. A line listed twice (figure counts it twice): refused.
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links)
SELECT :A::uuid, 6000, jsonb_build_object('recovered','[]'::jsonb,'interest','[]'::jsonb,'approved_unposted','[]'::jsonb,'actionable_open', jsonb_build_array('cccccccc-0000-4000-8000-000000000001'),
  'actionable_open_lines', jsonb_build_array(x.id, x.id)) FROM (SELECT l.priced_line_id AS id FROM t.case_line l WHERE l.case_id = 'cccccccc-0000-4000-8000-000000000001' LIMIT 1) x;
-- 4. Another practice's line: refused.
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links)
SELECT :A::uuid, 3000, jsonb_build_object('recovered','[]'::jsonb,'interest','[]'::jsonb,'approved_unposted','[]'::jsonb,'actionable_open', jsonb_build_array('dddddddd-0000-4000-8000-000000000001'),
  'actionable_open_lines', jsonb_build_array((SELECT l.priced_line_id FROM t.case_line l WHERE l.practice_id = :B::uuid LIMIT 1)));
-- 5. A line of a case the statement does not link: refused.
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links)
SELECT :A::uuid, 3000, jsonb_build_object('recovered','[]'::jsonb,'interest','[]'::jsonb,'approved_unposted','[]'::jsonb,'actionable_open', jsonb_build_array('cccccccc-0000-4000-8000-000000000002'),
  'actionable_open_lines', jsonb_build_array((SELECT l.priced_line_id FROM t.case_line l WHERE l.case_id = 'cccccccc-0000-4000-8000-000000000001' LIMIT 1)));
-- 6. A priced line on no case line: refused.
INSERT INTO t.priced_line (id, practice_id, service_line_id, variance_cents) VALUES ('eeeeeeee-0000-4000-8000-000000000001', :A::uuid, gen_random_uuid(), 3000);
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links)
SELECT :A::uuid, 3000, jsonb_build_object('recovered','[]'::jsonb,'interest','[]'::jsonb,'approved_unposted','[]'::jsonb,'actionable_open', jsonb_build_array('cccccccc-0000-4000-8000-000000000001'),
  'actionable_open_lines', jsonb_build_array('eeeeeeee-0000-4000-8000-000000000001'));
-- 7. The previous image's four-key statement, any figure: accepted (as today).
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) VALUES (:A::uuid, 9000, '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":["cccccccc-0000-4000-8000-000000000001"]}');
-- 8. No case, no line, zero: accepted.
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) VALUES (:A::uuid, 0, '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":[]}');
-- 9. No line but a nonzero figure: refused.
INSERT INTO t.roi_statement (practice_id, actionable_open_cents, links) VALUES (:A::uuid, 1, '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":[]}');
SELECT count(*) AS stored_rows FROM t.roi_statement;
-- Recompute from the stored IDs (what any later reader does).
SELECT s.actionable_open_cents AS stored, (SELECT sum(p.variance_cents) FROM t.priced_line p WHERE p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(s.links -> 'actionable_open_lines') x)) AS recomputed
  FROM t.roi_statement s WHERE s.links ? 'actionable_open_lines' ORDER BY 1 DESC;
