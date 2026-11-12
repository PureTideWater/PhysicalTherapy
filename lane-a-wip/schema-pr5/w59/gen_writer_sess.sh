#!/bin/bash
# W59: the writer's query (before, after, the note's one-pass form) and the statement's INSERT (the REAL trigger), as
# tp_app in practice A's scope, each rolled back. $1 = practice A, $2 = runs, $3 = label.
A=$1; runs=$2; label=$3
scope="BEGIN;
SELECT set_config('app.actor_id', gen_random_uuid()::text, true), set_config('app.practice_ids', '{$A}', true) \g /dev/null"
INS="INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links)
SELECT '$A', '2026-07-01', '2026-09-30', 'posted', 0, 0, 0, 0, m.cents, 0, m.links FROM m_links m WHERE m.tag ="
CONF="ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING RETURNING 'stored'"
echo '\set ON_ERROR_STOP on'; echo "\\set A $A"; echo "SET SESSION AUTHORIZATION tp_app;"
for q in before after onepass; do
  for i in $(seq 1 $runs); do echo "$scope"; echo "\\echo RUN $label query=$q run=$i"; echo '\timing on'; cat sql/q_$q.sql; echo '\g /dev/null'; echo '\timing off'; echo "ROLLBACK;"; done
  echo "$scope"; echo "\\echo PLAN $label query=$q"; echo "EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)"; cat sql/q_$q.sql; echo ";"; echo "ROLLBACK;"
done
for t in five four; do for i in $(seq 1 $runs); do echo "$scope"; echo "\\echo RUN $label insert=$t run=$i"; echo '\timing on'; echo "$INS '$t' $CONF;"; echo '\timing off'; echo "ROLLBACK;"; done; done
for i in $(seq 1 $runs); do echo "$scope"; echo "$INS 'five';"; echo "\\echo RUN $label insert=repeat run=$i"; echo '\timing on'; echo "$INS 'five' $CONF;"; echo '\timing off'; echo "ROLLBACK;"; done
