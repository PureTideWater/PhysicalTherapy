#!/bin/bash
# W59 T14: one session as tp_app in practice A's job scope; each run is the quarterly INSERT (the REAL trigger), rolled
# back. tag "repeat" stores the month's statement untimed, then times the daily repeat (ON CONFLICT DO NOTHING, T8).
explain=$1; prime=$2; runs=$3; label=$4
INS="INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '00000000-0000-4000-8000-00000000000a', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag ="
one() { # tag i
t=$1; [ "$t" = repeat ] && t=month
cat <<SQL
BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{00000000-0000-4000-8000-00000000000a}', true) \g /dev/null
\echo RUN $label tag=$1 run=$2
$( [ "$1" = repeat ] && echo "$INS 'month';" )
$( [ "$explain" = 1 ] && [ "$1" != empty ] && echo "SET LOCAL client_min_messages = log;" )
\timing on
$INS '$t' ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored';
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
SET auto_explain.log_parameter_max_length = 0;
SQL
fi
echo "SET SESSION AUTHORIZATION tp_app;"
if [ "$prime" = 1 ]; then for i in 1 2 3 4 5 6 7; do one empty $i; done; echo '\! bash -c "$NEXT"'; fi
for tr in $runs; do tag=${tr%%:*}; n=${tr##*:}; for i in $(seq 1 $n); do one $tag $i; done; done
