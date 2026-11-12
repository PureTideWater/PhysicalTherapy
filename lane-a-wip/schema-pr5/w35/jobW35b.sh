#!/bin/bash
# W35, after jobW35.sh: the state W30's degraded S4 run was really in (the other practices' rows missing): both tables
# analyzed at 20 priced lines and 10 case lines in the whole database, then the month loaded, no ANALYZE, and a NEW
# session (no plan cached from before the growth). The databases are jobW35.sh's pr5_f1_*_ten, as it left them.
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
export PGOPTIONS='-c statement_timeout=600000'
G=../d2/gen_sess.sh
sess() { $G "$3" "$4" 0 "$5" "$6" > "out/$2.sql"; $P -d "$1" -f "out/$2.sql" > "out/$2.txt" 2>&1; echo "  $2 exit $?"; }
state() { sess "$1" "$2_timed_auto" auto 0 "month:8 month4:2" "$3"; sess "$1" "$2_explain_auto" auto 1 "month:7" "$3"; sess "$1" "$2_timed_generic" force_generic_plan 0 "month:3" "$3"; sess "$1" "$2_explain_generic" force_generic_plan 1 "month:1" "$3"; }
date -u +"%H:%M:%S S4t D2"; state pr5_f1_d2_ten s4t_d2 S4-tiny-database-D2
date -u +"%H:%M:%S S4t D2 with the header"; state pr5_f1_d2h_ten s4t_d2h S4-tiny-database-D2-header
date -u +"%H:%M:%S done"
