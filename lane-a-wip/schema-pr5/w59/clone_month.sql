-- W59: practice A's month on the REAL schema, with every row the writer's predicate reads. The seed is SYNTHETIC
-- CAS-08 as the suite builds it (w59-world.db.test.ts: one case, three lines 30.00 short, priced_line_pricing_check
-- 'current'); its claims, service lines, priced lines, stage events, stage heads, case lines and cases are copied
-- by the scratch superuser (session_replication_role = replica) to :lines lines in :cases open cases, four lines a
-- claim. SYNTHETIC rows only. vars: A, lines, cases, others.
\set ON_ERROR_STOP on
SET session_replication_role = replica;
ALTER TABLE priced_line SET (autovacuum_enabled = false); ALTER TABLE case_line SET (autovacuum_enabled = false);
ALTER TABLE service_line SET (autovacuum_enabled = false); ALTER TABLE line_status SET (autovacuum_enabled = false);
ALTER TABLE line_status_head SET (autovacuum_enabled = false); ALTER TABLE claim SET (autovacuum_enabled = false); ALTER TABLE "case" SET (autovacuum_enabled = false);
CREATE TABLE m_src AS SELECT row_number() OVER (ORDER BY x.id) - 1 AS k, x.service_line_id AS sl, x.priced_line_id AS pl, s.claim_id AS claim, x.case_id
  FROM case_line x JOIN service_line s ON s.id = x.service_line_id WHERE x.practice_id = :'A';
CREATE TABLE m_case AS SELECT g AS k, CASE WHEN g = 0 THEN (SELECT case_id FROM m_src LIMIT 1) ELSE gen_random_uuid() END AS id FROM generate_series(0, :cases - 1) g;
CREATE TABLE m_claim AS SELECT g AS k, gen_random_uuid() AS id FROM generate_series(0, (:lines - 3) / 4) g;
CREATE TABLE m_line AS SELECT n, n % 3 AS src, gen_random_uuid() AS sl, gen_random_uuid() AS pl, (n - 4) / 4 AS claim_k, 1 + (n - 4) % 4 AS line_no, n % :cases AS case_k FROM generate_series(4, :lines) n;
INSERT INTO claim SELECT (jsonb_populate_record(NULL::claim, to_jsonb(c) || jsonb_build_object('id', m.id, 'claim_no', 1000 + m.k))).* FROM m_claim m JOIN claim c ON c.id = (SELECT claim FROM m_src WHERE k = m.k % 3);
INSERT INTO service_line SELECT (jsonb_populate_record(NULL::service_line, to_jsonb(s) || jsonb_build_object('id', m.sl, 'claim_id', c.id, 'line_no', m.line_no))).*
  FROM m_line m JOIN m_src r ON r.k = m.src JOIN service_line s ON s.id = r.sl JOIN m_claim c ON c.k = m.claim_k ORDER BY m.n;
INSERT INTO priced_line SELECT (jsonb_populate_record(NULL::priced_line, to_jsonb(p) || jsonb_build_object('id', m.pl, 'service_line_id', m.sl))).*
  FROM m_line m JOIN m_src r ON r.k = m.src JOIN priced_line p ON p.id = r.pl ORDER BY m.n;
INSERT INTO line_status OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::line_status, to_jsonb(e) || jsonb_build_object('id', gen_random_uuid(), 'service_line_id', m.sl, 'seq', nextval(pg_get_serial_sequence('line_status', 'seq'))))).*
  FROM m_line m JOIN m_src r ON r.k = m.src JOIN line_status e ON e.service_line_id = r.sl ORDER BY m.n, e.seq;
INSERT INTO line_status_head SELECT (jsonb_populate_record(NULL::line_status_head, to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'service_line_id', m.sl,
         'seq', (SELECT max(e.seq) FROM line_status e WHERE e.practice_id = :'A' AND e.service_line_id = m.sl)))).*
  FROM m_line m JOIN m_src r ON r.k = m.src JOIN line_status_head h ON h.service_line_id = r.sl;
INSERT INTO "case" SELECT (jsonb_populate_record(NULL::"case", to_jsonb(c) || jsonb_build_object('id', m.id, 'pattern_key', c.pattern_key || jsonb_build_object('w59', m.k)))).*
  FROM m_case m CROSS JOIN (SELECT * FROM "case" WHERE practice_id = :'A') c WHERE m.k > 0;
INSERT INTO case_line SELECT (jsonb_populate_record(NULL::case_line, to_jsonb(x) || jsonb_build_object('id', gen_random_uuid(), 'service_line_id', m.sl, 'priced_line_id', m.pl, 'case_id', c.id))).*
  FROM m_line m JOIN m_src r ON r.k = m.src JOIN case_line x ON x.service_line_id = r.sl JOIN m_case c ON c.k = m.case_k ORDER BY m.n;
\if :others
INSERT INTO practice (id, name, data_key_ref) SELECT gen_random_uuid(), 'SYNTHETIC other ' || n, 'local:v1:AAAA' FROM generate_series(1, 200) n;
CREATE TEMP TABLE m_o AS SELECT p.id AS practice_id, gen_random_uuid() AS pl, gen_random_uuid() AS sl, gen_random_uuid() AS run, (g % 200) AS c
  FROM practice p CROSS JOIN generate_series(1, 5000) g WHERE p.name LIKE 'SYNTHETIC other %';
INSERT INTO priced_line (id, practice_id, pricing_run_id, service_line_id, method, expected_allowed_cents, expected_unrounded, observed_allowed_cents, variance_cents, trace)
SELECT pl, practice_id, run, sl, 'FIXED_SCHEDULE', 10500, 10500, 10000, 500, jsonb_build_object('note', repeat('SYNTHETIC ', 60)) FROM m_o;
INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) SELECT practice_id, md5(practice_id::text || c::text)::uuid, sl, pl FROM m_o;
\endif
CHECKPOINT;
SELECT 'A: cases ' || (SELECT count(*) FROM "case" WHERE practice_id = :'A' AND state = 'open') || ', case lines ' || (SELECT count(*) FROM case_line WHERE practice_id = :'A')
    || ', priced lines ' || (SELECT count(*) FROM priced_line WHERE practice_id = :'A') || ', stage events ' || (SELECT count(*) FROM line_status WHERE practice_id = :'A')
    || '; all practices: priced lines ' || (SELECT count(*) FROM priced_line) || ', case lines ' || (SELECT count(*) FROM case_line);
SELECT 'pricing check over A''s case lines: ' || string_agg(r || ' x' || n, ', ') FROM (SELECT priced_line_pricing_check(priced_line_id) AS r, count(*) AS n FROM case_line WHERE practice_id = :'A' GROUP BY 1) q;
SELECT 'analyzed: ' || string_agg(relname || '=' || coalesce(last_analyze::text, 'never') || '/' || coalesce(last_autoanalyze::text, 'never'), ' ') FROM pg_stat_user_tables WHERE relname IN ('priced_line', 'case_line', 'service_line', 'line_status', 'claim', 'case', 'pricing_run');
