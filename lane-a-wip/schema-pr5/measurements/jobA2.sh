#!/bin/bash
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
export PGOPTIONS='-c statement_timeout=900000'
sess() { ./gen_sess.sh "$3" "$4" 0 "$5" "$6" > "out2/$2.sql"; $P -d "$1" -f "out2/$2.sql" > "out2/$2.txt" 2>&1; echo "  $2 exit $?"; }
stamp() { date -u +"%H:%M:%S $*"; }
# the month insert's time in ms from an explain session's first month run (0 when it failed)
fast() { local ms; ms=$(grep -A400 'tag=month run=1' "out2/$1.txt" | grep -m1 '^Time:' | awk '{print int($2)}'); [ -n "$ms" ] && [ "$ms" -lt 5000 ]; }
state() { # db prefix label extra-runs-when-fast
  sess "$1" "$2_explain_auto" auto 1 "month:1" "$3"
  sess "$1" "$2_timed_base" auto 0 "month4:3" "$3"
  if fast "$2_explain_auto"; then
    sess "$1" "$2_timed_auto" auto 0 "month:7 $4" "$3"
    sess "$1" "$2_explain_auto7" auto 1 "month:7" "$3"
    sess "$1" "$2_timed_generic" force_generic_plan 0 "month:3" "$3"
    sess "$1" "$2_explain_generic" force_generic_plan 1 "month:1" "$3"
  fi; }
stamp d1 S2 never analyzed, at the month; state pr5_d1 d1_S2 S2 ""
stamp d1 grow to 1M; $P -d pr5_d1 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out2/d1_load_1m.txt 2>&1; echo "  exit $?"
state pr5_d1 d1_S2m S2-1M "all:1"
stamp d2 setup and month, analyzed; $P -d pr5_d2 -f setup_d.sql > out2/d2_setup.txt 2>&1; echo "  exit $?"
$P -d pr5_d2 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f load_lines.sql > out2/d2_load_month.txt 2>&1
$P -d pr5_d2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
state pr5_d2 d2_S3 S3 ""
stamp d2 grow to 1M, statistics stale; $P -d pr5_d2 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out2/d2_load_1m.txt 2>&1
state pr5_d2 d2_S3stale S3-stale-1M ""
$P -d pr5_d2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
stamp d2 1M analyzed; state pr5_d2 d2_S3m S3-1M "all:2"
stamp d3 analyzed when A had 10 lines, then A month loaded, no analyze since
$P -d pr5_d3 -f setup_d.sql > out2/d3_setup.txt 2>&1
$P -d pr5_d3 -v from=1 -v to=10 -v cases=1200 -v others=1 -f load_lines.sql > out2/d3_load_10.txt 2>&1
$P -d pr5_d3 -c "ANALYZE priced_line" -c "ANALYZE case_line"
$P -d pr5_d3 -v from=11 -v to=30795 -v cases=1200 -v others=0 -f load_lines.sql > out2/d3_load_month.txt 2>&1
state pr5_d3 d3_S4 S4-new-practice-since-analyze ""
stamp D done; touch out2/d.done
unset PGOPTIONS
while [ ! -f out2/pre1.loaded ] || [ ! -f out2/pre3.loaded ]; do sleep 20; done
stamp scan i, 1000 practices
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_1000p_run1.txt 2>&1
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_1000p_run2.txt 2>&1
$P -d pr5_pre1 -f pre_explain.sql > out2/pre1_explain_1000p.txt 2>&1
stamp scan ii, 10000 practices
$P -d pr5_pre1 -c "SET session_replication_role = replica" -c "INSERT INTO practice (id, name, data_key_ref) SELECT gen_random_uuid(), 'SYNTHETIC practice ' || n, 'local:v1:AAAA' FROM generate_series(1001, 10000) n"
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_10000p_run1.txt 2>&1
if ! grep -q 'canceling statement' out2/pre1_scan_10000p_run1.txt; then
  $P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_10000p_run2.txt 2>&1
  $P -d pr5_pre1 -f pre_explain.sql > out2/pre1_explain_10000p.txt 2>&1
fi
stamp scan iii, 10000 five-key statements of 30795 lines
$P -d pr5_pre3 -f pre_scan.sql > out2/pre3_scan_run1.txt 2>&1
stamp all done; touch out2/all.done
