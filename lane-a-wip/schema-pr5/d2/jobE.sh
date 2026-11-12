#!/bin/bash
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
export PGOPTIONS='-c statement_timeout=600000'
sess() { ./gen_sess.sh "$3" "$4" 0 "$5" "$6" > "out3/$2.sql"; $P -d "$1" -f "out3/$2.sql" > "out3/$2.txt" 2>&1; echo "  $2 exit $?"; }
stamp() { date -u +"%H:%M:%S $*"; }
state() { sess "$1" "$2_timed_auto" auto 0 "month:8 month4:2 $4" "$3"; sess "$1" "$2_explain_auto" auto 1 "month:7" "$3"; sess "$1" "$2_timed_generic" force_generic_plan 0 "month:3" "$3"; sess "$1" "$2_explain_generic" force_generic_plan 1 "month:1" "$3"; }
stamp e1 setup; $P -d pr5_e1 -f setup_d2.sql > out3/e1_setup.txt 2>&1; echo "  exit $?"
./gen_sess.sh auto 0 1 "month:8" S1 > out3/e1_S1_timed_auto.sql
./gen_sess.sh force_generic_plan 0 1 "month:3" S1 > out3/e1_S1_timed_generic.sql
./gen_sess.sh auto 1 1 "month:1" S1 > out3/e1_S1_explain_auto.sql
./gen_sess.sh force_generic_plan 1 1 "month:1" S1 > out3/e1_S1_explain_generic.sql
export N4="$P -d pr5_e1 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f load_lines.sql > out3/e1_load_month.txt 2>&1"
export N3="NEXT=\"\$N4\" $P -d pr5_e1 -f out3/e1_S1_explain_generic.sql > out3/e1_S1_explain_generic.txt 2>&1"
export N2="NEXT=\"\$N3\" $P -d pr5_e1 -f out3/e1_S1_explain_auto.sql > out3/e1_S1_explain_auto.txt 2>&1"
export N1="NEXT=\"\$N2\" $P -d pr5_e1 -f out3/e1_S1_timed_generic.sql > out3/e1_S1_timed_generic.txt 2>&1"
stamp e1 S1; NEXT="$N1" $P -d pr5_e1 -f out3/e1_S1_timed_auto.sql > out3/e1_S1_timed_auto.txt 2>&1; echo "  exit $?"
stamp e1 S2; state pr5_e1 e1_S2 S2 ""
stamp e1 grow to 1M; $P -d pr5_e1 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out3/e1_load_1m.txt 2>&1
state pr5_e1 e1_S2m S2-1M "all:2"
stamp e2 analyzed; $P -d pr5_e2 -f setup_d2.sql > out3/e2_setup.txt 2>&1
$P -d pr5_e2 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f load_lines.sql > out3/e2_load_month.txt 2>&1
$P -d pr5_e2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
state pr5_e2 e2_S3 S3 ""
stamp e2 grow, stale; $P -d pr5_e2 -v from=30796 -v to=1000000 -v cases=40000 -v others=0 -f load_lines.sql > out3/e2_load_1m.txt 2>&1
state pr5_e2 e2_S3stale S3-stale-1M ""
$P -d pr5_e2 -c "ANALYZE priced_line" -c "ANALYZE case_line"
stamp e2 1M analyzed; state pr5_e2 e2_S3m S3-1M "all:2"
stamp e3 S4; $P -d pr5_e3 -f setup_d2.sql > out3/e3_setup.txt 2>&1
$P -d pr5_e3 -v from=1 -v to=10 -v cases=1200 -v others=1 -f load_lines.sql > out3/e3_load_10.txt 2>&1
$P -d pr5_e3 -c "ANALYZE priced_line" -c "ANALYZE case_line"
$P -d pr5_e3 -v from=11 -v to=30795 -v cases=1200 -v others=0 -f load_lines.sql > out3/e3_load_month.txt 2>&1
state pr5_e3 e3_S4 S4-practice-loaded-since-analyze ""
stamp S5 single practice; state pr5_d4 d4_S5 S5 ""
stamp done; touch out3/e.done
