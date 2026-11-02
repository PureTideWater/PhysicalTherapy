#!/usr/bin/env bash
# SUITE-CAP-3 profile: the plans PostgreSQL ran inside a pass (trigger bodies included), not its times. Copies <seed> in
# <state> to <..>_<state>_diag, sets auto_explain for that database (nested statements, ANALYZE, statements over
# MIN ms, a SAMPLE share of them), runs the 7b pass (or P after a pre pass when shape is P), and extracts the plans
# from the server log into $OUT/<db>.plans.txt (plans hold no values: the pass binds parameters, and auto_explain logs
# no parameters unless log_parameter_max_length is set; it is set to 0). Usage: diag.sh <seed> <state> <7b|P> [MIN] [SAMPLE]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
: "${OUT:?}" "${TP_REPO:?}"
seed=$1; state=$2; shape=$3; min=${4:-20}; sample=${5:-0.05}
LOGDIR=${PGLOG:-/tmp/laneb-suitecap3-pg-1}
db=$("$HERE/probe.sh" copy "$seed" "$state" diag | tail -1)
psql -h localhost -p 5494 -U postgres -qAt -d postgres \
  -c "ALTER DATABASE $db SET session_preload_libraries = 'auto_explain'" \
  -c "ALTER DATABASE $db SET auto_explain.log_min_duration = '${min}ms'" \
  -c "ALTER DATABASE $db SET auto_explain.log_nested_statements = on" \
  -c "ALTER DATABASE $db SET auto_explain.log_analyze = on" \
  -c "ALTER DATABASE $db SET auto_explain.log_timing = on" \
  -c "ALTER DATABASE $db SET auto_explain.log_triggers = on" \
  -c "ALTER DATABASE $db SET auto_explain.sample_rate = $sample" \
  -c "ALTER DATABASE $db SET auto_explain.log_parameter_max_length = 0"
start=$(wc -l < "$LOGDIR/server.log")
if [ "$shape" = P ]; then
  "$HERE/probe.sh" pass "$db" "$seed" "$db-pre"
fi
"$HERE/probe.sh" pass "$db" "$seed" "$db-$shape" "$OUT/$seed/posting-export.csv"
tail -n +"$((start + 1))" "$LOGDIR/server.log" | grep -v "DETAIL:  Parameters" > "$OUT/$db.plans.txt" || true
echo "$db: $(grep -c 'LOG:  duration' "$OUT/$db.plans.txt") plans"
