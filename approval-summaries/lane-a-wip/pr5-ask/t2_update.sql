\set ON_ERROR_STOP off
SET search_path = t, public;
DROP TABLE IF EXISTS t.stmt;
-- A table whose CHECK calls the old body; a four-key row; then the body is replaced by one that refuses four keys.
CREATE FUNCTION t.v(links jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT t.roi_links_valid_old(links) $$;
CREATE TABLE t.stmt (id int PRIMARY KEY, links jsonb NOT NULL CHECK (t.v(links)), document_key text);
INSERT INTO t.stmt VALUES (1, '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[]}', NULL);
-- A body that would require five keys (what "requires the fifth key" inside the CHECK alone would mean).
CREATE OR REPLACE FUNCTION t.v(links jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT links ? 'actionable_open_lines' $$;
SELECT 'replace did not revalidate: row still there' AS note, count(*) FROM t.stmt;
-- The statement job records the PDF on the stored row: an UPDATE of document_key only.
UPDATE t.stmt SET document_key = 'practices/x/reports/y/z.pdf' WHERE id = 1;
SELECT 'after update' AS note, document_key FROM t.stmt;
-- With the proposed body (four or five keys), the same update passes.
CREATE OR REPLACE FUNCTION t.v(links jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT t.roi_links_valid_new(links) $$;
UPDATE t.stmt SET document_key = 'practices/x/reports/y/z.pdf' WHERE id = 1;
SELECT 'after update, proposed body' AS note, document_key FROM t.stmt;
