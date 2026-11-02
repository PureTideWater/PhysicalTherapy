#!/usr/bin/env bash
# Runs a list of probe steps, each under the heavy lock on its own, logging to $OUT/matrix.log.
# Usage: matrix.sh "seed 6000 R" "shape cap3_r_2000_seed a 7b" ...
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
for step in "$@"; do
  echo "$(date -u +%FT%TZ) start $step" >> "$OUT/matrix.log"
  # shellcheck disable=SC2086
  flock /tmp/laneb-heavy.lock "$HERE/probe.sh" $step >> "$OUT/matrix.log" 2>&1
  echo "$(date -u +%FT%TZ) done $step ($?)" >> "$OUT/matrix.log"
done
