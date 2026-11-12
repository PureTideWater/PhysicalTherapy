#!/bin/bash
# W59 step 4: the stored-statement preflight, measured on the REAL migration file (SYNTHETIC rows, PostgreSQL 18.4,
# port 5433). w59_base is migrated through 20261114090000 by the real runner (migrate-base.mts).
cd "$(dirname "$0")"; export PGPASSWORD=test PATH=/opt/node24/bin:$PATH; P="psql -h localhost -p 5433 -U postgres -X -q -At"
stamp() { date -u +"%H:%M:%S $*"; }
stamp "create m1"; $P -c "DROP DATABASE IF EXISTS w59_m1" -c "CREATE DATABASE w59_m1 TEMPLATE w59_base"
stamp "load m1"; $P -d w59_m1 -v analyze_empty=0 -v practices=1000 -f load.sql > out/m1_load.txt 2>&1; echo "  exit $?"
stamp "real file, never analyzed"; $P -d w59_m1 -f run_real.sql > out/m1_never_real.txt 2>&1
stamp "VACUUM ANALYZE m1"; $P -d w59_m1 -c "VACUUM (ANALYZE) roi_statement" -c "CHECKPOINT"
stamp "real file, analyzed"; $P -d w59_m1 -f run_real.sql > out/m1_analyzed_real.txt 2>&1
stamp "failing case (3 statements in 2 practices fail Appendix A)"; $P -d w59_m1 -f fail_real.sql > out/m1_fail_real.txt 2>&1
stamp "writer beside the closing (1 row at 185 s, open 20 s)"
$P -d w59_m1 -v wait=185 -v rows=1 -v hold=20 -f writer.sql > out/m1_writer20_writer.txt 2>&1 &
$P -d w59_m1 -f run_real.sql > out/m1_writer20_real.txt 2>&1; wait
stamp "writer across the whole closing (1 row at 150 s, open 120 s): the lock cannot be had"
$P -d w59_m1 -v wait=150 -v rows=1 -v hold=120 -f writer.sql > out/m1_writer120_writer.txt 2>&1 &
$P -d w59_m1 -f run_real.sql > out/m1_writer120_real.txt 2>&1; wait
stamp "the real runner, committed (migrate() with packages/db/migrations)"
(cd /home/user/PhysicalTherapy && DATABASE_URL=postgres://postgres:test@localhost:5433/w59_m1 pnpm -s exec tsx /home/user/ops/lane-a-wip/schema-pr5/w59/migrate-base.mts real) > out/m1_runner_commit.txt 2>&1; echo "  exit $?"
$P -d w59_m1 -c "SELECT 'bodies after the runner: ' || string_agg(proname || ' ' || left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16) || ' ' || coalesce(proconfig::text, ''), ', ' ORDER BY proname) FROM pg_proc WHERE proname IN ('roi_links_valid', 'roi_statement_rules')" >> out/m1_runner_commit.txt 2>&1
stamp "done"
