SET SESSION AUTHORIZATION tp_app;
BEGIN;
SELECT set_config('app.actor_id', '22222222-2222-4222-8222-222222222222', true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\o :out_cases
SELECT t.name, t_try(t) FROM t_cases t ORDER BY t.name;
\o :out_rand
SELECT r.i, CASE :'which' WHEN 'D' THEN t_block_d(r.links, '00000000-0000-4000-8000-00000000000a') ELSE t_block_d2(r.links, '00000000-0000-4000-8000-00000000000a') END FROM t_rand r ORDER BY r.i;
\o
ROLLBACK;
