#!/usr/bin/env bash
# Schema PR 2: one step-7b pass of one seed on a fresh TEMPLATE copy (no ANALYZE; autovacuum is off on the private
# cluster, so every copy starts with the statistics the seed left), with the tree's own worker code, the ledger
# functions either as the tree's migrations leave them (state none) or with the migration's draft applied as tp_owner
# in one transaction, as the runner applies a file (state pr2). From SUITE-CAP-3's probe-crit/runcrit.sh.
#   run.sh <seed db> <none|pr2> <tag>      env: S (scratch root), TP_REPO (the checkout), DRAFT (the migration's text)
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
seed=$1; state=$2; tag=$3
P=$S/pr2-probe; OUT=${OUT:-$S/pr2-results}; SEEDS=$OUT/seeds
psqlc() { psql -h localhost -p 5494 -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
db="${seed%_seed}_${state}_$tag"
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db TEMPLATE $seed"
psqlc -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" >/dev/null
case "$state" in
  none) ;;
  pr2) (echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$DRAFT"; echo 'COMMIT;') | psqlc -d "$db" ;;
  *) exit 2 ;;
esac
psqlc -d "$db" -c "SELECT p.oid::regprocedure || ' ' || encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.proname IN ('ledger_line_net', 'ledger_entry_rules') ORDER BY 1" > "$OUT/$db.bodies.txt"
dbid=$(psqlc -d postgres -c "SELECT oid FROM pg_database WHERE datname = '$db'")
psqlc -d postgres -c "SELECT pg_stat_statements_reset()" >/dev/null
psqlc -d "$db" -c "SELECT pg_stat_reset()" >/dev/null
cd "$TP_REPO"
set +e
node --max-old-space-size=560 --expose-gc --import tsx "$P/pass.mts" "postgres://postgres:test@localhost:5494/$db" "$SEEDS/$seed/meta.json" "$OUT/$db" "$SEEDS/$seed/posting-export.csv" >"$OUT/$db.log" 2>"$OUT/$db.stderr"
rc=$?
set -e
echo "$db exit $rc: $(cat "$OUT/$db.log")"
sleep 1
psqlc -d postgres -F $'\t' -c "SELECT calls, round(total_exec_time)::bigint, shared_blks_hit, shared_blks_read, rows, toplevel, left(regexp_replace(query, '\s+', ' ', 'g'), 900) FROM pg_stat_statements WHERE dbid = $dbid ORDER BY total_exec_time DESC LIMIT 60" > "$OUT/$db.pss.tsv"
psqlc -d "$db" -F $'\t' -c "SELECT funcname, calls, round(total_time)::bigint, round(self_time)::bigint FROM pg_stat_user_functions ORDER BY total_time DESC" > "$OUT/$db.functions.tsv"
psqlc -d "$db" -F $'\t' -c "SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_tup_ins, n_live_tup FROM pg_stat_user_tables WHERE n_tup_ins > 0 OR seq_scan > 0 ORDER BY relname" > "$OUT/$db.tables.tsv"
psqlc -d "$db" -F $'\t' -c "SELECT stage, count(*), sum(amount_cents) FROM ledger_entry GROUP BY 1 ORDER BY 1" > "$OUT/$db.cents.tsv"
psqlc -d "$db" -F $'\t' -c "SELECT stage, count(*) FROM line_status_head GROUP BY 1 ORDER BY 1" > "$OUT/$db.heads.tsv"
python3 -I "$P/dump.py" 5494 "$db" "$seed" > "$OUT/$db.dump.ndjson"
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"
