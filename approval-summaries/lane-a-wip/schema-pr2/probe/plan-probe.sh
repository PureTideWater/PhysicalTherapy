#!/usr/bin/env bash
# Plans of the old and new ledger_line_net line read, as tp_app in one practice's scope, on a never-analyzed ledger
# of growing size (SYNTHETIC rows of one practice, 4 entries a line, written as superuser with triggers off).
set -euo pipefail
A=$1; S=$2; DB=tp_pr2_w11_plan
q() { psql "$A/$DB" -v ON_ERROR_STOP=1 -qAt "$@"; }
q -c "ALTER TABLE ledger_entry SET (autovacuum_enabled = false)" -c "ALTER TABLE ledger_match SET (autovacuum_enabled = false)"
P=11111111-1111-4111-8111-111111111111
have=0
for n in $SIZES; do
  add=$((n - have)); have=$n
  if [ "$add" -gt 0 ]; then
    q -c "BEGIN" -c "SET LOCAL session_replication_role = replica" -c "INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, effective_on) SELECT '$P', gen_random_uuid(), l.line, CASE WHEN g.k % 2 = 0 THEN 'approved' ELSE 'posted' END, 3000, CASE WHEN g.k % 2 = 0 THEN 'claim' ELSE 'posting_row' END, gen_random_uuid(), gen_random_uuid(), DATE '2026-01-01' + (l.i % 300) FROM (SELECT i, gen_random_uuid() AS line FROM generate_series(1, $add / 4) i) l, generate_series(1, 4) g(k)" -c "COMMIT"
  fi
  stats=$(q -c "SELECT 'reltuples ' || reltuples || ' pages ' || pg_relation_size('ledger_entry') / 8192 FROM pg_class WHERE oid = 'ledger_entry'::regclass")
  for body in old new; do
    plan=$( (echo "BEGIN; SET LOCAL ROLE tp_app; SELECT set_config('app.practice_ids', '{$P}', true);"; echo "EXPLAIN (GENERIC_PLAN, COSTS OFF)"; cat "$S/$body-net.sql"; echo ";") | q | grep -E "Scan.* e$|Scan.* e \(|Index Cond|Filter|Sort" | grep -v "ledger_entry_pkey" | tr -s ' ' | tr '\n' '|' | cut -c1-900)
    echo "n=$n ($stats) $body: $plan"
  done
done
