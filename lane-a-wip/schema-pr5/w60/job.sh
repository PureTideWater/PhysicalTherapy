#!/bin/bash
# W60: the writer's query at practice A's month on the real schema (W59's method, its scripts unchanged): before PR 5,
# the plain path as built by step 2, and the one-pass form as built now; never analyzed, then analyzed. And both
# paths' rows compared on this month (EXCEPT both ways, as tp_app in A's scope).
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q -At"
read A DB < out/seed.txt
stamp() { date -u +"%H:%M:%S $*"; }
T="'priced_line','case_line','service_line','line_status','claim','case','pricing_run'"
stats() { $P -d w60_wm -c "SELECT 'analyzed: ' || string_agg(relname || '=' || coalesce(last_analyze::text, 'never') || '/' || coalesce(last_autoanalyze::text, 'never'), ' ') FROM pg_stat_user_tables WHERE relname IN ($T)"; }
equal() { { echo "\\set A $A"; echo "SET SESSION AUTHORIZATION tp_app; BEGIN; SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{$A}', true) \g /dev/null"
  echo "CREATE TEMP TABLE t_plain AS SELECT row_number() OVER () AS ord, q.* FROM ("; cat sql/q_after.sql; echo ") q; CREATE TEMP TABLE t_one AS SELECT row_number() OVER () AS ord, q.* FROM ("; cat sql/q_onepass.sql; echo ") q;"
  echo "SELECT 'plain: cases ' || count(*) || ', lines ' || sum(cardinality(line_ids)) || ', cents ' || sum(actionable_cents::bigint) FROM t_plain; SELECT 'one pass: cases ' || count(*) || ', lines ' || sum(cardinality(line_ids)) || ', cents ' || sum(actionable_cents::bigint) FROM t_one;"
  echo "SELECT 'rows in plain not in one pass: ' || (SELECT count(*) FROM (TABLE t_plain EXCEPT TABLE t_one) d) || '; in one pass not in plain: ' || (SELECT count(*) FROM (TABLE t_one EXCEPT TABLE t_plain) d); ROLLBACK;"; } | $P -d w60_wm; }
stamp "writer, never analyzed"; stats > out/wm_never_stats.txt
./prep_links.sh $A | $P -d w60_wm > out/wm_links.txt 2>&1
./gen_writer_sess.sh $A 5 never-analyzed > out/wm_never.sql; $P -d w60_wm -f out/wm_never.sql > out/wm_never.txt 2>&1; echo "  exit $?"
# (the never-analyzed comparison was not kept: tp_app may not create temporary tables; out/wm_equal.sql, run after ANALYZE, is the comparison of record)
stamp "ANALYZE"; $P -d w60_wm -c "ANALYZE"; stats > out/wm_analyzed_stats.txt
stamp "writer, analyzed"; ./gen_writer_sess.sh $A 5 analyzed > out/wm_analyzed.sql; $P -d w60_wm -f out/wm_analyzed.sql > out/wm_analyzed.txt 2>&1; echo "  exit $?"
psql -h localhost -p 5433 -U postgres -X -q -At -d w60_wm -f out/wm_equal.sql > out/wm_equal_analyzed.txt 2>&1
./summ.sh out/wm_never.txt > out/summary.txt; ./summ.sh out/wm_analyzed.txt >> out/summary.txt
stamp done
