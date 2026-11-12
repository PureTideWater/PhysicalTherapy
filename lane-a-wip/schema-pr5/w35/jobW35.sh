#!/bin/bash
# W35, 2026-11-12: D2 measured again in state S4 (three clean builds), and with Question 2's header line
# (SET plan_cache_mode TO 'force_custom_plan') through the real trigger. SYNTHETIC rows only. PostgreSQL 18.4, the
# machine's defaults, a scratch cluster on port 5433; pr5_base is a database migrated by pnpm db:migrate at 93e137f9.
# Reuses ../d2/gen_sess.sh, ../d2/setup_d2.sql, ../measurements/load_lines.sql and ../d2/eq/*.sql unchanged.
# A.sql is cut from the first ask's Appendix A; D.sql and D2.sql are ../d2/D-as-granted.sql and D2-draft.sql;
# D2h.sql is D2.sql with the one header line after the SET search_path line. Nothing is tuned.
cd "$(dirname "$0")"; export PGPASSWORD=test; P="psql -h localhost -p 5433 -U postgres -X -q"
export PGOPTIONS='-c statement_timeout=600000'
G=../d2/gen_sess.sh; L=../measurements/load_lines.sql
stamp() { date -u +"%H:%M:%S $*"; }
sess() { $G "$3" "$4" 0 "$5" "$6" > "out/$2.sql"; $P -d "$1" -f "out/$2.sql" > "out/$2.txt" 2>&1; echo "  $2 exit $?"; }
state() { sess "$1" "$2_timed_auto" auto 0 "month:8 month4:2" "$3"; sess "$1" "$2_explain_auto" auto 1 "month:7" "$3"; sess "$1" "$2_timed_generic" force_generic_plan 0 "month:3" "$3"; sess "$1" "$2_explain_generic" force_generic_plan 1 "month:1" "$3"; }
fresh() { $P -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1 TEMPLATE pr5_base"; $P -d "$1" -f ../d2/setup_d2.sql > "out/$1_setup.txt" 2>&1; echo "  $1 setup exit $?"; }
install() { $P -d "$1" -c "SET ROLE tp_owner" -f "$2" > /dev/null; echo "  $1 now $2: $($P -d "$1" -Atc "SELECT left(encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), 16) || ' config ' || coalesce(proconfig::text, 'none') FROM pg_proc WHERE proname = 'roi_statement_rules'")"; }
stats() { $P -d "$1" -Atc "SELECT string_agg(relname || ' reltuples=' || reltuples || ' pages=' || relpages, '; ') || '; analyzed ' || (SELECT string_agg(relname || '=' || coalesce(last_analyze::text, 'never') || '/auto ' || coalesce(last_autoanalyze::text, 'never'), ' ') FROM pg_stat_user_tables WHERE relname IN ('priced_line', 'case_line')) || '; rows ' || (SELECT count(*) FROM priced_line) || ' / ' || (SELECT count(*) FROM case_line) FROM pg_class WHERE relname IN ('priced_line', 'case_line')"; }

# ---- 1. S4, three clean builds: statistics from when the practice had 10 lines, then its month loaded, no ANALYZE.
for i in 1 2 3; do
  db=pr5_s4_$i; stamp "S4 build $i"; fresh $db
  $P -d $db -v from=1 -v to=10 -v cases=1200 -v others=1 -f $L > out/s4_${i}_load_10.txt 2>&1
  $P -d $db -c "ANALYZE priced_line" -c "ANALYZE case_line"
  $P -d $db -v from=11 -v to=30795 -v cases=1200 -v others=0 -f $L > out/s4_${i}_load_month.txt 2>&1
  $P -d $db -c "CHECKPOINT"; echo "  $(stats $db)"
  stamp "S4 build $i, D2"; install $db D2.sql; state $db s4_${i}_d2 S4-D2
  stamp "S4 build $i, D2 with the header"; install $db D2h.sql; state $db s4_${i}_d2h S4-D2-header
  echo "  after: $(stats $db)"; [ $i != 1 ] && $P -c "DROP DATABASE $db"
done
# ---- 2. The control, S3: analyzed at the month.
stamp "S3 build"; fresh pr5_s3
$P -d pr5_s3 -v from=1 -v to=30795 -v cases=1200 -v others=1 -f $L > out/s3_load_month.txt 2>&1
$P -d pr5_s3 -c "ANALYZE priced_line" -c "ANALYZE case_line" -c "CHECKPOINT"; echo "  $(stats pr5_s3)"
stamp "S3, D2"; install pr5_s3 D2.sql; state pr5_s3 s3_d2 S3-D2
stamp "S3, D2 with the header"; install pr5_s3 D2h.sql; state pr5_s3 s3_d2h S3-D2-header
# ---- 3. The review's finding 1: seven statements in one session while both tables are analyzed and tiny (20 priced
# lines, 10 case lines), then the month loaded from another connection with no ANALYZE, then the month's statement
# in the same session. Primed twice over: with the empty statement (as gen_sess.sh primes) and with the practice's
# own 10-line statement. First D2 as it is, then D2 with the header.
f1() { # db file prime-tag runs label
  fresh $1
  $P -d $1 -v from=1 -v to=10 -v cases=1200 -v others=0 -f $L > out/$1_load_10.txt 2>&1
  $P -d $1 -c "ANALYZE priced_line" -c "ANALYZE case_line"; echo "  tiny: $(stats $1)"
  install $1 $2
  $G auto 0 1 "$4" "$5" | sed "s/tag = 'empty'/tag = '$3'/; s/tag=empty/tag=prime-$3/" > out/$1_timed_auto.sql
  NEXT="$P -d $1 -v from=11 -v to=30795 -v cases=1200 -v others=0 -f $L > out/$1_load_month.txt 2>&1" $P -d $1 -f out/$1_timed_auto.sql > out/$1_timed_auto.txt 2>&1; echo "  $1 exit $?"
  echo "  grown: $(stats $1)"
}
stamp "F1 D2, primed empty";             f1 pr5_f1_d2_empty  D2.sql  empty "month:1" F1-D2
stamp "F1 D2 header, primed empty";      f1 pr5_f1_d2h_empty D2h.sql empty "month:3" F1-D2-header
stamp "F1 D2, primed 10 lines";          f1 pr5_f1_d2_ten    D2.sql  month "month:1" F1-D2
stamp "F1 D2 header, primed 10 lines";   f1 pr5_f1_d2h_ten   D2h.sql month "month:3" F1-D2-header
# ---- 4. The function as the database stores it, and the body's hash from that print.
stamp "prints"
for v in D2 D2h; do install pr5_s3 $v.sql; $P -d pr5_s3 -Atc "SELECT pg_get_functiondef('public.roi_statement_rules()'::regprocedure)" > out/functiondef_$v.txt; done
install pr5_s3 D.sql; $P -d pr5_s3 -Atc "SELECT pg_get_functiondef('public.roi_statement_rules()'::regprocedure)" > out/functiondef_D.txt
# ---- 5. Equality through the real trigger and CHECK, the 27 fixed statements (and the 400 random through the blocks):
# D, D2, D2 with the header, on pr5_s3 (the month and 200 other practices, analyzed). D takes minutes a month statement.
export PGOPTIONS="-c statement_timeout=0"
stamp "eq setup"; $P -d pr5_s3 -f ../d2/eq/setup.sql > out/eq_setup.txt 2>&1; echo "  exit $?"
for v in D2 D2h D; do stamp "eq $v"; install pr5_s3 $v.sql
  w=D2; [ $v = D ] && w=D
  $P -d pr5_s3 -At -v out_cases=out/eq_cases_$v.txt -v out_rand=out/eq_rand_$v.txt -v which=$w -f ../d2/eq/run.sql > out/eq_run_$v.txt 2>&1; echo "  exit $?"; done
sha256sum out/eq_cases_*.txt out/eq_rand_*.txt ../d2/eq/cases_D.txt ../d2/eq/cases_D2.txt
stamp done; touch out/w35.done
