#!/usr/bin/env bash
# PostgreSQL for a CI job, from docker-compose.yml's one digest-pinned image (docs/adr/0066, Part 2): the database jobs
# of ci.yml and large-zip.yml run it in place of a service container, which cannot read its image from a file.
#
#   tools/ci/postgres.sh up     right after the checkout: starts `docker compose up --wait` in the background and
#                               returns at once, so the image's pull and the server's first start overlap the job's
#                               setup. Compose's output goes to $RUNNER_TEMP/postgres-up.log and its exit status, a
#                               failure included, to $RUNNER_TEMP/postgres-up.status once it has one.
#   tools/ci/postgres.sh wait   just before the first step that uses the database: waits for that status, up to
#                               POSTGRES_WAIT_SECONDS (130). 0 passes: compose's --wait returned only once the
#                               service's healthcheck (pg_isready on TCP) passed. Any other status, or none in time,
#                               fails, printing compose's log.
#
# wait reads compose's own verdict, so it never inspects a container that the pull has yet to create and never starts a
# second `up` that could race the first. No secret and no data: the password is compose's local `test`.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
log="$dir/postgres-up.log"
status="$dir/postgres-up.status"
limit="${POSTGRES_WAIT_SECONDS:-130}"

print_log() {
  if [ -s "$log" ]; then
    echo "--- docker compose up (postgres) ---"
    cat "$log"
    echo "---"
  else
    echo "docker compose up (postgres) wrote nothing."
  fi
}

case "${1:-}" in
  up)
    rm -f "$status" "$status.partial" "$log"
    # Every stream of the background start redirected, so this step ends at once instead of waiting on an open pipe.
    (
      set +e
      cd "$root"
      docker compose up --detach --wait --wait-timeout 120 postgres < /dev/null > "$log" 2>&1
      echo "$?" > "$status.partial"
      mv "$status.partial" "$status"
    ) < /dev/null > /dev/null 2>&1 &
    echo "Starting PostgreSQL from docker-compose.yml in the background (log: $log)."
    ;;
  wait)
    for ((waited = 0; waited < limit; waited++)); do
      if [ -f "$status" ]; then
        code="$(cat "$status")"
        if [ "$code" = 0 ]; then
          echo "PostgreSQL is healthy (docker compose up --wait returned after ${waited} s here)."
          exit 0
        fi
        echo "::error title=PostgreSQL::docker compose up exited with status $code, so the database did not start."
        print_log
        exit 1
      fi
      sleep 1
    done
    echo "::error title=PostgreSQL::docker compose up gave no verdict within $limit s."
    print_log
    exit 1
    ;;
  *)
    echo "usage: tools/ci/postgres.sh up|wait" >&2
    exit 2
    ;;
esac
