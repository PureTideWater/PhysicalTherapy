\set ON_ERROR_STOP on
DROP SCHEMA IF EXISTS t CASCADE; CREATE SCHEMA t; SET search_path = t, public;
-- Today's body (20261023120000_recovery_ledger.sql:231), as installed.
CREATE FUNCTION t.roi_links_valid_old(links jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_typeof(links) = 'object'
     AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k) = ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered']
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$$;
-- Proposed body.
CREATE FUNCTION t.roi_links_valid_new(links jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_typeof(links) = 'object'
     AND coalesce((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k), '{}') IN (
           ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered'],
           ARRAY['actionable_open', 'actionable_open_lines', 'approved_unposted', 'interest', 'recovered'])
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$$;
CREATE TABLE t.cases (name text, links jsonb);
INSERT INTO t.cases VALUES
 ('four keys, empty', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[]}'),
 ('four keys, ids', '{"recovered":["00000000-0000-4000-8000-000000000001"],"interest":[],"approved_unposted":[],"actionable_open":["00000000-0000-4000-8000-000000000002"]}'),
 ('five keys, empty lines', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":[]}'),
 ('five keys, ids', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":["00000000-0000-4000-8000-000000000002"],"actionable_open_lines":["00000000-0000-4000-8000-0000000000aa","00000000-0000-4000-8000-0000000000bb"]}'),
 ('five keys, uppercase id', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":["00000000-0000-4000-8000-0000000000AA"]}'),
 ('five keys, number in lines', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":[9000]}'),
 ('five keys, lines not array', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":"00000000-0000-4000-8000-0000000000aa"}'),
 ('five keys, lines object', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":{"a":[]}}'),
 ('five keys, text in lines', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":["Jane Doe"]}'),
 ('other fifth key', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_lines":[]}'),
 ('six keys', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":[],"extra":[]}'),
 ('three keys', '{"recovered":[],"interest":[],"approved_unposted":[]}'),
 ('lines without actionable_open', '{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open_lines":[]}'),
 ('empty object', '{}'),
 ('array', '[]'),
 ('json null', 'null');
SELECT name, roi_links_valid_old(links) AS old, roi_links_valid_new(links) AS new,
       CASE WHEN roi_links_valid_old(links) IS NULL THEN 'CHECK passes (null)' WHEN roi_links_valid_old(links) THEN 'CHECK passes' ELSE 'CHECK refuses' END AS old_check,
       CASE WHEN roi_links_valid_new(links) IS NULL THEN 'CHECK passes (null)' WHEN roi_links_valid_new(links) THEN 'CHECK passes' ELSE 'CHECK refuses' END AS new_check
  FROM t.cases;
-- Key order under a glibc locale collation as well as C.
SELECT array_agg(k ORDER BY k COLLATE "C") AS c_order, array_agg(k ORDER BY k COLLATE "en_US.utf8") AS en_order
  FROM jsonb_object_keys('{"recovered":[],"interest":[],"approved_unposted":[],"actionable_open":[],"actionable_open_lines":[]}'::jsonb) k;
