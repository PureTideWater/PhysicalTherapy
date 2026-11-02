#!/usr/bin/env bash
# Like matrix.sh, for prep.sh steps: each under the heavy lock, logged to $OUT/matrix.log.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
for step in "$@"; do
  echo "$(date -u +%FT%TZ) start prep $step" >> "$OUT/matrix.log"
  # shellcheck disable=SC2086
  flock /tmp/laneb-heavy.lock "$HERE/prep.sh" $step >> "$OUT/matrix.log" 2>&1
  echo "$(date -u +%FT%TZ) done prep $step ($?)" >> "$OUT/matrix.log"
done
