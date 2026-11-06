#!/usr/bin/env bash
# Completeness check (2026-11-06): runrev.sh with OUT=cap3-results-crit and preps m (14.1 ledger_line_net), k (ledger_entry_rules lookups by pkey), mk (both).
# SUITE-CAP-3 review re-measure (base cc3dd7f6 vs candidate 0b6e90eb): one step-7b pass (or shape P) of one seed, with
# one checkout's code, on a fresh TEMPLATE copy, the template's statistics kept (no ANALYZE: autovacuum is off on the
# private cluster, so every copy starts with the statistics the seed left). pg_stat_statements and the function and
# table statistics are reset just before the measured pass and read after it (nested statements included). Run under
# the heavy lock.
#   runrev.sh <code base|cand|d1ts> <seed> <prep none|lmanalyze|lmfill|lefill> <shape 7b|P> <run tag> [dump]
# prep: lmanalyze = ANALYZE ledger_match (analyzed empty); lmfill = 100,000 SYNTHETIC ledger_match rows of a tenant that is
# no practice (superuser, session_replication_role replica), then ANALYZE ledger_match (fillx's method on ledger_match);
# lefill = the same on ledger_entry (fillx.sh).
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
HERE=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad/cap3-probe; CRIT=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad/cap3-probe-crit
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad
code=$1; seed=$2; prep=$3; shape=$4; tag=$5; dump=${6:-}
case "$code" in base) TP_REPO=$S/cap3-base2 ;; cand) TP_REPO=$S/cap3-rev ;; d1ts) TP_REPO=$S/cap3-d1 ;; *) exit 2 ;; esac
export TP_REPO
OUT=$S/cap3-results-crit; SEEDS=$OUT/seeds
psqlc() { psql -h localhost -p 5494 -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
db="${seed%_seed}_${code}_${prep}_$(echo "$shape" | tr 'A-Z' 'a-z')_$tag"
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db TEMPLATE $seed"
psqlc -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" >/dev/null
case "$prep" in
  none) ;;
  lmanalyze) psqlc -d "$db" -c 'ANALYZE ledger_match' ;;
  lmfill) psqlc -d "$db" -f "$HERE/fill-match.sql" ; psqlc -d "$db" -c 'ANALYZE ledger_match' ;;
  m|k|mk|n|nk) psqlc -d "$db" -f "$CRIT/state-$prep.sql" ;;
  lefill) psqlc -d "$db" -f "$HERE/fill-entry.sql" ; psqlc -d "$db" -c 'ANALYZE ledger_entry' ;;
  *) exit 2 ;;
esac
dbid=$(psqlc -d postgres -c "SELECT oid FROM pg_database WHERE datname = '$db'")
pass() { # <out label> [export]
  psqlc -d postgres -c "SELECT pg_stat_statements_reset()" >/dev/null
  psqlc -d "$db" -c "SELECT pg_stat_reset()" >/dev/null
  cd "$TP_REPO"
  set +e
  node --max-old-space-size=560 --expose-gc --import tsx "$HERE/pass.mts" "postgres://postgres:test@localhost:5494/$db" "$SEEDS/$seed/meta.json" "$OUT/$1" ${2:+"$2"} >"$OUT/$1.log" 2>"$OUT/$1.stderr"
  local rc=$?
  set -e
  echo "$1 exit $rc: $(cat "$OUT/$1.log")"
  sleep 1 # let the statistics collector flush (pg_stat_* are flushed at backend exit)
  psqlc -d postgres -F $'\t' -c "SELECT calls, round(total_exec_time)::bigint, shared_blks_hit, shared_blks_read, rows, toplevel, left(regexp_replace(query, '\s+', ' ', 'g'), 900) FROM pg_stat_statements WHERE dbid = $dbid ORDER BY total_exec_time DESC LIMIT 60" > "$OUT/$1.pss.tsv"
  psqlc -d "$db" -F $'\t' -c "SELECT funcname, calls, round(total_time)::bigint, round(self_time)::bigint FROM pg_stat_user_functions ORDER BY total_time DESC" > "$OUT/$1.functions.tsv"
  psqlc -d "$db" -F $'\t' -c "SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_tup_ins, n_live_tup FROM pg_stat_user_tables WHERE n_tup_ins > 0 OR seq_scan > 0 ORDER BY relname" > "$OUT/$1.tables.tsv"
  if [ -n "$dump" ]; then python3 -I "$HERE/dump.py" 5494 "$db" "$seed" > "$OUT/$1.dump.ndjson"; fi
}
if [ "$shape" = P ]; then
  pass "$db-pre"
  pass "$db-P" "$SEEDS/$seed/posting-export.csv"
else
  pass "$db-7b" "$SEEDS/$seed/posting-export.csv"
fi
psqlc -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"
