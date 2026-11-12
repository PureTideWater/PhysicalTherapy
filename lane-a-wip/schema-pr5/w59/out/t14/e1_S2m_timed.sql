\set ON_ERROR_STOP on
SET SESSION AUTHORIZATION tp_app;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=1


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=2


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=3


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=4


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=5


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=6


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=7


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month run=8


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month4 run=1


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month4' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month4 run=2


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month4' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=month4 run=3


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month4' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=repeat run=1
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month';

\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=repeat run=2
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month';

\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=repeat run=3
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month';

\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=repeat run=4
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month';

\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=repeat run=5
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month';

\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'month' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=all run=1


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'all' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=all run=2


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'all' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN S2-never-analyzed-1M tag=all run=3


\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = 'all' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
\timing off
ROLLBACK;
