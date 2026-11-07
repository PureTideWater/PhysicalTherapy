SET search_path = t, public;
DROP TABLE IF EXISTS t.big;
CREATE TABLE t.big AS
SELECT jsonb_build_object('recovered', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1,30795)), 'interest','[]'::jsonb,'approved_unposted','[]'::jsonb,'actionable_open', jsonb_build_array(gen_random_uuid())) AS four,
       jsonb_build_object('recovered', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1,30795)), 'interest','[]'::jsonb,'approved_unposted','[]'::jsonb,'actionable_open', jsonb_build_array(gen_random_uuid()),
                          'actionable_open_lines', (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1,30795))) AS five;
\timing on
SELECT roi_links_valid_old(four) FROM t.big;
SELECT roi_links_valid_old(four) FROM t.big;
SELECT roi_links_valid_old(four) FROM t.big;
SELECT roi_links_valid_new(four) FROM t.big;
SELECT roi_links_valid_new(four) FROM t.big;
SELECT roi_links_valid_new(four) FROM t.big;
SELECT roi_links_valid_new(five) FROM t.big;
SELECT roi_links_valid_new(five) FROM t.big;
SELECT roi_links_valid_new(five) FROM t.big;
-- The PDF record on the 30,795-line statement: the CHECK re-runs on the UPDATE.
UPDATE t.roi_statement SET document_key = 'k' WHERE jsonb_array_length(links -> 'actionable_open_lines') > 1;
UPDATE t.roi_statement SET document_key = 'k2' WHERE jsonb_array_length(links -> 'actionable_open_lines') > 1;
\timing off
SELECT pg_column_size(four) AS four_bytes, pg_column_size(five) AS five_bytes FROM t.big;
