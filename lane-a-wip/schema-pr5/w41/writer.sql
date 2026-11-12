-- A writer beside the preflight: after :wait s it inserts :rows four-key statements into the first practice (by ID)
-- and keeps its transaction open :hold s. SYNTHETIC rows; the scratch superuser, so the trigger's scope test is false.
SELECT pg_sleep(:wait);
BEGIN;
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT s.practice_id, date '2002-01-01' + g + :wait, date '2002-01-01' + g + :wait, 'posted', 0, 0, 0, 0, 0, 0, s.links
  FROM (SELECT practice_id, links FROM roi_statement WHERE practice_id = (SELECT min(id::text)::uuid FROM practice) LIMIT 1) s CROSS JOIN generate_series(1, :rows) g;
SELECT pg_sleep(:hold);
COMMIT;
SELECT 'writer committed at ' || clock_timestamp();
