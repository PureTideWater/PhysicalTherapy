#!/usr/bin/env bash
# Runs a queue of probe steps, detached from any tool timeout (setsid nohup), one after another, each under the heavy
# lock, skipping a step whose result already exists. Queue file lines: "<runner> <args...> => <result label or ->".
# runner: probe (probe.sh) or prep (prep.sh). Waits first until no other matrix runner is running.
# Usage: setsid nohup runq.sh <queue file> >/dev/null 2>&1 &
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
: "${OUT:?}" "${TP_REPO:?}"
while pgrep -f "cap3-probe/matrix2?\.sh" >/dev/null; do sleep 30; done
while IFS= read -r line; do
  [ -z "$line" ] && continue
  step=${line%% => *}; label=${line##* => }
  if [ "$label" != "-" ] && [ -f "$OUT/$label.json" ]; then
    echo "$(date -u +%FT%TZ) skip $step (have $label)" >> "$OUT/matrix.log"; continue
  fi
  runner=${step%% *}; args=${step#* }
  echo "$(date -u +%FT%TZ) start q $step" >> "$OUT/matrix.log"
  # shellcheck disable=SC2086
  flock /tmp/laneb-heavy.lock "$HERE/$runner.sh" $args >> "$OUT/matrix.log" 2>&1
  echo "$(date -u +%FT%TZ) done q $step ($?)" >> "$OUT/matrix.log"
done < "$1"
echo "$(date -u +%FT%TZ) queue-done $1" >> "$OUT/matrix.log"
