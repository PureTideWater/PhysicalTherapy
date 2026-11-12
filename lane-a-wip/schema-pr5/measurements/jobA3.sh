#!/bin/bash
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
stamp() { date -u +"%H:%M:%S $*"; }
stamp scan i, 1000 practices
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_1000p_run1.txt 2>&1
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_1000p_run2.txt 2>&1
$P -d pr5_pre1 -f pre_explain.sql > out2/pre1_explain_1000p.txt 2>&1
stamp scan ii, 10000 practices
$P -d pr5_pre1 -c "SET session_replication_role = replica" -c "INSERT INTO practice (id, name, data_key_ref) SELECT gen_random_uuid(), 'SYNTHETIC practice ' || n, 'local:v1:AAAA' FROM generate_series(1001, 10000) n"
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_10000p_run1.txt 2>&1
if ! grep -q 'canceling statement' out2/pre1_scan_10000p_run1.txt; then
  $P -d pr5_pre1 -f pre_explain.sql > out2/pre1_explain_10000p.txt 2>&1
fi
stamp scan iii, 10000 five-key statements of 30795 lines
$P -d pr5_pre3 -f pre_scan.sql > out2/pre3_scan_run1.txt 2>&1
stamp scans done; touch out2/scans.done
# last: the state of a practice loaded since the last ANALYZE (one run, 15 minutes at most)
export PGOPTIONS='-c statement_timeout=900000'
$P -d pr5_d3 -f setup_d.sql > out2/d3_setup.txt 2>&1
$P -d pr5_d3 -v from=1 -v to=10 -v cases=1200 -v others=1 -f load_lines.sql > out2/d3_load_10.txt 2>&1
$P -d pr5_d3 -c "ANALYZE priced_line" -c "ANALYZE case_line"
$P -d pr5_d3 -v from=11 -v to=30795 -v cases=1200 -v others=0 -f load_lines.sql > out2/d3_load_month.txt 2>&1
./gen_sess.sh auto 1 0 "month:1" S4-new-practice-since-analyze > out2/d3_S4_explain_auto.sql; $P -d pr5_d3 -f out2/d3_S4_explain_auto.sql > out2/d3_S4_explain_auto.txt 2>&1
stamp all done; touch out2/all.done
