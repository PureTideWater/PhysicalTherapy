#!/bin/bash
# W59: (1) the writer's cost at practice A's month (note 4.1) on the real schema, quiet machine; (2) the REAL runner
# on the million statements, committed (job1's try was refused by the runner's ownership check on the harness's own
# scratch table m_p, after the migration had run: m_p is dropped first); (3) T14 (job2.sh).
cd "$(dirname "$0")"; export PGPASSWORD=test PATH=/opt/node24/bin:$PATH; P="psql -h localhost -p 5433 -U postgres -X -q -At"
A=c0dfa763-1a17-4107-be21-a47189d1622a
stamp() { date -u +"%H:%M:%S $*"; }
T="'priced_line','case_line','service_line','line_status','claim','case','pricing_run'"
stats() { $P -d w59_wm -c "SELECT 'analyzed: ' || string_agg(relname || '=' || coalesce(last_analyze::text, 'never') || '/' || coalesce(last_autoanalyze::text, 'never'), ' ') FROM pg_stat_user_tables WHERE relname IN ($T)"; }
stamp "writer, never analyzed"; stats > out/writer/wm_never_stats.txt
./gen_writer_sess.sh $A 5 never-analyzed > out/writer/wm_never.sql; $P -d w59_wm -f out/writer/wm_never.sql > out/writer/wm_never.txt 2>&1; echo "  exit $?"
stamp "ANALYZE"; $P -d w59_wm -c "ANALYZE"; stats > out/writer/wm_analyzed_stats.txt
./prep_links.sh $A | $P -d w59_wm > out/writer/wm_links_analyzed.txt 2>&1
stamp "writer, analyzed"; ./gen_writer_sess.sh $A 5 analyzed > out/writer/wm_analyzed.sql; $P -d w59_wm -f out/writer/wm_analyzed.sql > out/writer/wm_analyzed.txt 2>&1; echo "  exit $?"
stamp "the real runner, committed"; $P -d w59_m1 -c "DROP TABLE m_p"
(cd /home/user/PhysicalTherapy && DATABASE_URL=postgres://postgres:test@localhost:5433/w59_m1 pnpm -s exec tsx /home/user/ops/lane-a-wip/schema-pr5/w59/migrate-base.mts real) > out/m1_runner_commit2.txt 2>&1; echo "  exit $?"
$P -d w59_m1 -c "SELECT 'bodies after the runner: ' || string_agg(proname || ' ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16) || ' ' || coalesce(proconfig::text, ''), ', ' ORDER BY proname) FROM pg_proc WHERE proname IN ('roi_links_valid', 'roi_statement_rules')" -c "SELECT 'migrations: ' || count(*) FROM schema_migrations" >> out/m1_runner_commit2.txt 2>&1
stamp "T14"; ./job2.sh > out/job2.log 2>&1
stamp "done"
