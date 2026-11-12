\set ON_ERROR_STOP on
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 0;
SET auto_explain.log_analyze = on;
SET auto_explain.log_timing = off;
SET auto_explain.log_nested_statements = on;
SET auto_explain.log_parameter_max_length = 0;
SET SESSION AUTHORIZATION tp_app;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S3-analyzed-1M tag=month run=1

SET LOCAL client_min_messages = log;
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
