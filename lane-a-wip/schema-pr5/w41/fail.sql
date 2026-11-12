-- A stored statement the new function refuses stops the transaction: three '{}' statements in two practices (today's
-- CHECK passes '{}': its key comparison is null), planted by the superuser of the scratch database, then the block.
\set ON_ERROR_STOP off
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT p.id, date '2001-01-01' + g, date '2001-01-01' + g, 'posted', 0, 0, 0, 0, 0, 0, '{}'
  FROM (SELECT id, row_number() OVER (ORDER BY id) k FROM practice) p CROSS JOIN generate_series(1, 2) g WHERE (p.k = 2) OR (p.k = 3 AND g = 1);
SELECT 'planted: ' || count(*) || ' in ' || count(DISTINCT practice_id) || ' practices' FROM roi_statement WHERE links = '{}';
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE tp_owner;
\i A.sql
\timing on
\i preflight.sql
\timing off
SELECT 'still in the failed transaction (expected an error here): ' || 1;
ROLLBACK;
SELECT 'body after rollback: ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16) FROM pg_proc WHERE proname = 'roi_links_valid';
