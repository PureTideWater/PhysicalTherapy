#!/bin/bash
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
export PGOPTIONS='-c statement_timeout=900000'
sess() { ./gen_sess.sh "$3" "$4" 0 "$5" "$6" > "out2/$2.sql"; $P -d "$1" -f "out2/$2.sql" > "out2/$2.txt" 2>&1; echo "  $2 exit $?"; }
$P -d pr5_d4 -f setup_d.sql > out2/d4_setup.txt 2>&1
$P -d pr5_d4 -v from=1 -v to=30795 -v cases=1200 -v others=0 -f load_lines.sql > out2/d4_load_month.txt 2>&1
$P -d pr5_d4 -c "ANALYZE priced_line" -c "ANALYZE case_line"
date -u +"%H:%M:%S d4 one practice only holds lines, analyzed"
sess pr5_d4 d4_S5_explain_auto auto 1 "month:2" S5-single-practice-analyzed
sess pr5_d4 d4_S5_explain_generic force_generic_plan 1 "month:1" S5-single-practice-analyzed
date -u +"%H:%M:%S d4 done"
