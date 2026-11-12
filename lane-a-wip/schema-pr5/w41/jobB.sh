#!/bin/bash
# W41 part B: m1 analyzed (the block with and without the closing lock, the floor, the one-statement index option, the
# failing case, a writer beside each closing), then m2 (statistics that say "empty"), then the note's 3.3 as written.
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q -At"
stamp() { date -u +"%H:%M:%S $*"; }
stamp "VACUUM ANALYZE m1"; $P -d pr5w41_m1 -c "VACUUM (ANALYZE) roi_statement" -c "CHECKPOINT"
stamp "plans, analyzed"; $P -d pr5w41_m1 -f plans.sql > out/m1_analyzed_plans.txt 2>&1
stamp "preflight, analyzed, no lock"; $P -d pr5w41_m1 -v lock=0 -f run_preflight.sql > out/m1_analyzed_preflight_lock0.txt 2>&1
stamp "preflight, analyzed, lock"; $P -d pr5w41_m1 -v lock=1 -f run_preflight.sql > out/m1_analyzed_preflight_lock1.txt 2>&1
stamp "floor (superuser, the function alone)"; $P -d pr5w41_m1 -v is_floor=1 -v is_index=0 -f options.sql > out/m1_analyzed_floor.txt 2>&1
stamp "whole scope through the index, one statement"; $P -d pr5w41_m1 -v is_floor=0 -v is_index=1 -f options.sql > out/m1_analyzed_index.txt 2>&1
stamp "failing case"; $P -d pr5w41_m1 -v lock=0 -f fail.sql > out/m1_analyzed_fail.txt 2>&1
stamp "writer beside the scan, no lock (5 rows at 60 s, committed at once)"
$P -d pr5w41_m1 -v wait=60 -v rows=5 -v hold=0 -f writer.sql > out/m1_writer_lock0_writer.txt 2>&1 &
$P -d pr5w41_m1 -v lock=0 -f run_preflight.sql > out/m1_writer_lock0.txt 2>&1; wait
stamp "writer beside the closing, lock (1 row at 150 s, open 90 s)"
$P -d pr5w41_m1 -v wait=150 -v rows=1 -v hold=90 -f writer.sql > out/m1_writer_lock1_writer.txt 2>&1 &
$P -d pr5w41_m1 -v lock=1 -f run_preflight.sql > out/m1_writer_lock1.txt 2>&1; wait
stamp "create and load m2 (analyzed while empty)"; $P -c "DROP DATABASE IF EXISTS pr5w41_m2" -c "CREATE DATABASE pr5w41_m2 TEMPLATE pr5w41_base"
$P -d pr5w41_m2 -v analyze_empty=1 -v practices=1000 -f load.sql > out/m2_load.txt 2>&1; echo "  exit $?"
stamp "plans, analyzed empty"; $P -d pr5w41_m2 -f plans.sql > out/m2_empty_plans.txt 2>&1
stamp "preflight, analyzed empty, lock"; $P -d pr5w41_m2 -v lock=1 -f run_preflight.sql > out/m2_empty_preflight_lock1.txt 2>&1
$P -c "DROP DATABASE pr5w41_m2"
stamp "the note's 3.3 as written (whole scope, one scan)"; $P -d pr5w41_m1 -v is_floor=0 -v is_index=0 -f options.sql > out/m1_analyzed_whole.txt 2>&1
stamp "done B"
