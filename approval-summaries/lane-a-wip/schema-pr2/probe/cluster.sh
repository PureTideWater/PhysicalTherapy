#!/usr/bin/env bash
# The private PostgreSQL 18 cluster for the SUITE-CAP-3 profile: port 5494, shared_buffers 128MB (as the shared 5433
# cluster), max_locks_per_transaction raised so the base's per-row advisory locks (about five per line in one reconcile
# pass) fit at 20,000 lines with margin. Its data directory lives OUTSIDE /tmp/claude-0 (the session resets that tree's
# mode to 0700 and the server then PANICs). Usage: cluster.sh up|down|status <datadir> [port]
set -euo pipefail
cmd=${1:?up|down|status}; dir=${2:?datadir}; port=${3:-5494}
BIN=/opt/pg18/bin
as_pg() { runuser -u postgres -- "$@"; }
case "$cmd" in
  up)
    if [ ! -f "$dir/PG_VERSION" ]; then
      mkdir -p "$dir"; chown postgres:postgres "$dir"; chmod 700 "$dir"
      as_pg $BIN/initdb -D "$dir" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
      cat >> "$dir/postgresql.conf" <<CONF
port = $port
listen_addresses = 'localhost'
unix_socket_directories = '/tmp'
shared_buffers = 128MB
max_connections = 100
max_locks_per_transaction = 4096
max_wal_size = 1GB
autovacuum = off
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000
track_functions = all
track_io_timing = on
timezone = 'Etc/UTC'
log_timezone = 'Etc/UTC'
CONF
    fi
    as_pg $BIN/pg_ctl -D "$dir" -l "$dir/server.log" -w start >/dev/null
    psql -h localhost -p "$port" -U postgres -Atc "select 'up ' || current_setting('server_version') || ' locks/tx ' || current_setting('max_locks_per_transaction') || ' shared_buffers ' || current_setting('shared_buffers')"
    ;;
  down)
    as_pg $BIN/pg_ctl -D "$dir" -m fast -w stop >/dev/null || true
    rm -rf "$dir"; echo removed "$dir"
    ;;
  status)
    as_pg $BIN/pg_ctl -D "$dir" status || true
    ;;
esac
