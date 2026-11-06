#!/usr/bin/env bash
# Resumable queue of runrev.sh steps (each under the heavy lock; a step whose result json exists is skipped).
#   queue-rev.sh "<code seed prep shape tag [dump]>" ...
set -uo pipefail
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad
R=$S/cap3-probe; OUT=$S/cap3-results-rev; LOG=$OUT/queue.log
for step in "$@"; do
  set -- $step
  db="${2%_seed}_$1_$3_$(echo "$4" | tr 'A-Z' 'a-z')_$5"; last="$db-7b"; [ "$4" = P ] && last="$db-P"
  [ -f "$OUT/$last.json" ] && continue
  echo "$(date -u +%FT%TZ) run $step" >> $LOG
  (cd /tmp && flock /tmp/laneb-heavy.lock "$R/runrev.sh" "$@") >> $LOG 2>&1
  echo "$(date -u +%FT%TZ) done $step" >> $LOG
done
echo "$(date -u +%FT%TZ) queue end" >> $LOG
