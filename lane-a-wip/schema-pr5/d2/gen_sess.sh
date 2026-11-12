#!/bin/bash
mode=$1; explain=$2; prime=$3; runs=$4; label=$5
one() { # tag i
cat <<SQL
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN $label mode=$mode tag=$1 run=$2
$( [ "$explain" = 1 ] && [ "$1" != empty ] && echo "SET LOCAL client_min_messages = log;" )
\timing on
INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag = '$1';
\timing off
ROLLBACK;
SQL
}
echo '\set ON_ERROR_STOP on'
if [ "$explain" = 1 ]; then cat <<SQL
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 0;
SET auto_explain.log_analyze = on;
SET auto_explain.log_timing = off;
SET auto_explain.log_nested_statements = on;
SET auto_explain.log_verbose = on;
SET auto_explain.log_parameter_max_length = 0;
SQL
fi
echo "SET SESSION AUTHORIZATION tp_app;"
echo "SET plan_cache_mode = $mode;"
if [ "$prime" = 1 ]; then for i in 1 2 3 4 5 6 7; do one empty $i; done; echo '\! bash -c "$NEXT"'; fi
for tr in $runs; do tag=${tr%%:*}; n=${tr##*:}; for i in $(seq 1 $n); do one $tag $i; done; done
