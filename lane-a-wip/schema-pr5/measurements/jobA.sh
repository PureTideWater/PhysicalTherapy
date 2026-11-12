#!/bin/bash
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
sess() { # db out mode explain runs label
  ./gen_sess.sh "$3" "$4" 0 "$5" "$6" > "out2/$2.sql"; $P -d "$1" -f "out2/$2.sql" > "out2/$2.txt" 2>&1; echo "  $2 exit $?"; }
stamp() { date -u +"%H:%M:%S $*"; }
# ---- d1: never analyzed
stamp d1 setup; $P -d pr5_d1 -f setup_d.sql > out2/d1_setup.txt 2>&1; echo "  exit $?"
./gen_sess.sh auto 0 1 "month:3 month4:2" S1 > out2/d1_S1_timed_auto.sql
./gen_sess.sh force_generic_plan 0 1 "month:3" S1 > out2/d1_S1_timed_generic.sql
./gen_sess.sh auto 1 1 "month:1" S1 > out2/d1_S1_explain_auto.sql
./gen_sess.sh force_generic_plan 1 1 "month:1" S1 > out2/d1_S1_explain_generic.sql
export N4="$P -d pr5_d1 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f load_lines.sql > out2/d1_load_month.txt 2>&1"
export N3="NEXT=\"\$N4\" $P -d pr5_d1 -f out2/d1_S1_explain_generic.sql > out2/d1_S1_explain_generic.txt 2>&1"
export N2="NEXT=\"\$N3\" $P -d pr5_d1 -f out2/d1_S1_explain_auto.sql > out2/d1_S1_explain_auto.txt 2>&1"
export N1="NEXT=\"\$N2\" $P -d pr5_d1 -f out2/d1_S1_timed_generic.sql > out2/d1_S1_timed_generic.txt 2>&1"
stamp d1 S1; NEXT="$N1" $P -d pr5_d1 -f out2/d1_S1_timed_auto.sql > out2/d1_S1_timed_auto.txt 2>&1; echo "  exit $?"
stamp d1 S2
sess pr5_d1 d1_S2_timed_auto auto 0 "month:7 month4:3" S2
sess pr5_d1 d1_S2_explain_auto auto 1 "month:7" S2
sess pr5_d1 d1_S2_timed_generic force_generic_plan 0 "month:3" S2
stamp d1 grow to 1M; $P -d pr5_d1 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out2/d1_load_1m.txt 2>&1; echo "  exit $?"
sess pr5_d1 d1_S2m_timed_auto auto 0 "month:7 month4:2 all:2" S2-1M
sess pr5_d1 d1_S2m_explain_auto auto 1 "month:7 all:1" S2-1M
sess pr5_d1 d1_S2m_timed_generic force_generic_plan 0 "month:3" S2-1M
# ---- d2: analyzed
stamp d2 setup and month; $P -d pr5_d2 -f setup_d.sql > out2/d2_setup.txt 2>&1; echo "  exit $?"
$P -d pr5_d2 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f load_lines.sql > out2/d2_load_month.txt 2>&1
$P -d pr5_d2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
sess pr5_d2 d2_S3_timed_auto auto 0 "month:7 month4:3" S3
sess pr5_d2 d2_S3_explain_auto auto 1 "month:7" S3
sess pr5_d2 d2_S3_timed_generic force_generic_plan 0 "month:3" S3
sess pr5_d2 d2_S3_explain_generic force_generic_plan 1 "month:1" S3
stamp d2 grow to 1M, statistics stale; $P -d pr5_d2 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out2/d2_load_1m.txt 2>&1
sess pr5_d2 d2_S3stale_timed_auto auto 0 "month:7" S3-stale-1M
sess pr5_d2 d2_S3stale_explain_auto auto 1 "month:7" S3-stale-1M
$P -d pr5_d2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
sess pr5_d2 d2_S3m_timed_auto auto 0 "month:7 month4:2 all:2" S3-1M
sess pr5_d2 d2_S3m_explain_auto auto 1 "month:7 all:1" S3-1M
sess pr5_d2 d2_S3m_timed_generic force_generic_plan 0 "month:3" S3-1M
stamp D done; touch out2/d.done
# ---- the preflight scans, once the loads are finished (nothing else running)
while [ ! -f out2/pre1.loaded ] || [ ! -f out2/pre3.loaded ]; do sleep 20; done
stamp scan i, 1000 practices
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_1000p_run1.txt 2>&1
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_1000p_run2.txt 2>&1
$P -d pr5_pre1 -f pre_explain.sql > out2/pre1_explain_1000p.txt 2>&1
touch out2/pre1a.done
stamp scan ii, 10000 practices
$P -d pr5_pre1 -c "SET session_replication_role = replica" -c "INSERT INTO practice (id, name, data_key_ref) SELECT gen_random_uuid(), 'SYNTHETIC practice ' || n, 'local:v1:AAAA' FROM generate_series(1001, 10000) n"
$P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_10000p_run1.txt 2>&1
if ! grep -q 'canceling statement' out2/pre1_scan_10000p_run1.txt; then
  $P -d pr5_pre1 -f pre_scan.sql > out2/pre1_scan_10000p_run2.txt 2>&1
  $P -d pr5_pre1 -f pre_explain.sql > out2/pre1_explain_10000p.txt 2>&1
fi
touch out2/pre1b.done
stamp scan iii, 10000 five-key statements of 30795 lines
$P -d pr5_pre3 -f pre_scan.sql > out2/pre3_scan_run1.txt 2>&1
stamp all done; touch out2/all.done
