-- W59 T14: a database copied from w59_fresh (the REAL migration applied; nothing installed here). SYNTHETIC rows.
\set ON_ERROR_STOP on
SET session_replication_role = replica;
INSERT INTO practice (id, name, data_key_ref) VALUES ('00000000-0000-4000-8000-00000000000a', 'SYNTHETIC practice A', 'local:v1:AAAA');
INSERT INTO practice (id, name, data_key_ref) SELECT gen_random_uuid(), 'SYNTHETIC other ' || n, 'local:v1:AAAA' FROM generate_series(1, 200) n;
ALTER TABLE priced_line SET (autovacuum_enabled = false);
ALTER TABLE case_line SET (autovacuum_enabled = false);
CREATE TABLE m_links (tag text PRIMARY KEY, links jsonb NOT NULL, cents bigint NOT NULL);
CREATE TABLE m_a_lines (n int PRIMARY KEY, service_line_id uuid, priced_line_id uuid, old_priced_line_id uuid, case_id uuid, variance bigint);
GRANT SELECT ON m_links TO tp_app;
INSERT INTO m_links VALUES ('empty', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":[]}', 0);
SELECT 'function under test: ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16) || ' ' || proconfig::text FROM pg_proc WHERE proname = 'roi_statement_rules';
