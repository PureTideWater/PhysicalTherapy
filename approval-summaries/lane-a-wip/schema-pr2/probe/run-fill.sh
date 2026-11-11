#!/usr/bin/env bash
# Schema PR 2, the state the database review found: one step-7b pass of a seed whose ledger_entry already holds FILL
# SYNTHETIC entries of a tenant that is no practice and was NEVER analyzed (as a ledger stands in the minute between a
# first sizeable commit and automatic analysis; autovacuum is off on this cluster, so it stays so). From run.sh.
#   run-fill.sh <seed db> <none|pr2> <tag> <FILL rows>      env: S, TP_REPO, DRAFT
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
seed=$1; state=$2; tag=$3; fill=$4
P=$S/pr2-probe; OUT=${OUT:-$S/pr2-results}; SEEDS=$OUT/seeds
psqlc() { psql -h localhost -p 5494 -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
db="${seed%_seed}_${state}_fill${fill}_$tag"
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db TEMPLATE $seed"
case "$state" in none) ;; pr2) (echo 'BEGIN; SET LOCAL ROLE tp_owner;'; cat "$DRAFT"; echo 'COMMIT;') | psqlc -d "$db" ;; *) exit 2 ;; esac
psqlc -d "$db" -c "BEGIN" -c "SET LOCAL session_replication_role = replica" -c "INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, effective_on) SELECT '00000000-0000-4000-8000-00000000f111'::uuid, gen_random_uuid(), l.line_id, s.stage, 10000, CASE s.stage WHEN 'approved' THEN 'claim' ELSE 'posting_row' END, gen_random_uuid(), gen_random_uuid(), date '2026-01-01' + (l.i % 300) FROM (SELECT i, gen_random_uuid() AS line_id FROM generate_series(1, ($fill / 2)) AS i) l CROSS JOIN (VALUES ('approved'), ('posted')) AS s (stage)" -c "COMMIT"
psqlc -d "$db" -c "SELECT 'ledger_entry reltuples ' || reltuples || ', rows ' || (SELECT count(*) FROM ledger_entry) FROM pg_class WHERE oid = 'ledger_entry'::regclass" > "$OUT/$db.state.txt"
psqlc -d postgres -c "SELECT pg_stat_statements_reset()" >/dev/null; psqlc -d "$db" -c "SELECT pg_stat_reset()" >/dev/null
cd "$TP_REPO"
set +e
node --max-old-space-size=560 --expose-gc --import tsx "$P/pass.mts" "postgres://postgres:test@localhost:5494/$db" "$SEEDS/$seed/meta.json" "$OUT/$db" "$SEEDS/$seed/posting-export.csv" >"$OUT/$db.log" 2>"$OUT/$db.stderr"
rc=$?
set -e
echo "$db exit $rc: $(cat "$OUT/$db.log")"
sleep 1
psqlc -d "$db" -F $'\t' -c "SELECT funcname, calls, round(total_time)::bigint, round(self_time)::bigint FROM pg_stat_user_functions ORDER BY total_time DESC" > "$OUT/$db.functions.tsv"
psqlc -d "$db" -F $'\t' -c "SELECT stage, count(*), sum(amount_cents) FROM ledger_entry WHERE practice_id <> '00000000-0000-4000-8000-00000000f111' GROUP BY 1 ORDER BY 1" > "$OUT/$db.cents.tsv"
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"
