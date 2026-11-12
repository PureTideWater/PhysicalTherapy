#!/bin/bash
# W59 T14: D2's block (the REAL roi_statement_rules, as the migration stores it) timed on the real schema with the
# tenant policies, 200 other practices' rows present, in three planner states, at A's month (30,795 lines) and at
# 1,000,000 priced lines in the practice. SYNTHETIC rows only.
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q -At"
export PGOPTIONS='-c statement_timeout=600000'
sess() { ./gen_sess.sh "$3" 0 "$4" "$5" > "out/t14/$2.sql"; $P -d "$1" -f "out/t14/$2.sql" > "out/t14/$2.txt" 2>&1; echo "  $2 exit $?"; }
stamp() { date -u +"%H:%M:%S $*"; }
state() { sess "$1" "$2_timed" 0 "month:8 month4:3 repeat:5 $4" "$3"; sess "$1" "$2_explain" 1 "month:1" "$3"; }
mkdir -p out/t14
for d in w59_e1 w59_e2; do $P -c "DROP DATABASE IF EXISTS $d" -c "CREATE DATABASE $d TEMPLATE w59_fresh"; done
stamp e1 setup; $P -d w59_e1 -f setup_t14.sql > out/t14/e1_setup.txt 2>&1; echo "  exit $?"
# S1: priced_line and case_line never analyzed and EMPTY when the session first runs the trigger (7 times); the month
# is loaded by another session while this one stays open; then the same session is timed.
./gen_sess.sh 0 1 "month:8 repeat:3" S1 > out/t14/e1_S1_timed.sql
export NEXT="$P -d w59_e1 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f load_lines.sql > out/t14/e1_load_month.txt 2>&1"
stamp e1 S1; $P -d w59_e1 -f out/t14/e1_S1_timed.sql > out/t14/e1_S1_timed.txt 2>&1; echo "  exit $?"
stamp e1 S2; state w59_e1 e1_S2 S2-never-analyzed-month ""
stamp e1 grow to 1M; $P -d w59_e1 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out/t14/e1_load_1m.txt 2>&1
state w59_e1 e1_S2m S2-never-analyzed-1M "all:3"
stamp e2 setup; $P -d w59_e2 -f setup_t14.sql > out/t14/e2_setup.txt 2>&1
$P -d w59_e2 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f load_lines.sql > out/t14/e2_load_month.txt 2>&1
$P -d w59_e2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
stamp e2 S3; state w59_e2 e2_S3 S3-analyzed-month ""
stamp e2 grow, stale; $P -d w59_e2 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out/t14/e2_load_1m.txt 2>&1
state w59_e2 e2_S3stale S3-stale-1M "all:3"
$P -d w59_e2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
stamp e2 S3m; state w59_e2 e2_S3m S3-analyzed-1M "all:3"
stamp done
