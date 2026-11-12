-- W59: three '{}' statements in two practices (today's CHECK passes '{}'), planted by the scratch superuser in the
-- same transaction, then the REAL migration file as tp_owner. SYNTHETIC rows. Expected: the refusal, counts only.
\set ON_ERROR_STOP off
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT p.id, date '2001-01-01' + g, date '2001-01-01' + g, 'posted', 0, 0, 0, 0, 0, 0, '{}'
  FROM (SELECT id, row_number() OVER (ORDER BY id) k FROM practice) p CROSS JOIN generate_series(1, 2) g WHERE (p.k = 2) OR (p.k = 3 AND g = 1);
SELECT 'planted: ' || count(*) || ' in ' || count(DISTINCT practice_id) || ' practices' FROM roi_statement WHERE links = '{}';
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE tp_owner;
SELECT set_config('lock_timeout', '5000ms', true);
\timing on
\i /home/user/PhysicalTherapy/packages/db/migrations/20261115090000_roi_statement_actionable_lines.sql
\timing off
ROLLBACK;
SELECT 'bodies after rollback: ' || string_agg(proname || ' ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16), ', ' ORDER BY proname) FROM pg_proc WHERE proname IN ('roi_links_valid', 'roi_statement_rules');
SELECT 'statements after: ' || count(*) FROM roi_statement;
