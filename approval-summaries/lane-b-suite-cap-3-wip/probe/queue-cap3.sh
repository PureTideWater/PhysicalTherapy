#!/usr/bin/env bash
# The SUITE-CAP-3 candidate matrix: seeds (base code), then the equality pairs at 2,000, then the candidate's sizes.
# Each step under the heavy lock on its own; a step whose result exists is skipped (resumable).
set -uo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:/opt/pg18/bin:$PATH
S=/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad
R=$S/cap3-probe
LOG=$S/cap3-results-try/queue.log
mkdir -p $S/cap3-results-try $S/cap3-results-base2 $S/cap3-results-seeds
seed() { # N spread
  local name="cap3_$(echo "$2" | tr 'A-Z' 'a-z')_$1_seed"
  [ -f "$S/cap3-results-seeds/$name/meta.json" ] && return 0
  echo "$(date -u +%FT%TZ) seed $1 $2" >> $LOG
  TP_REPO=$S/cap3-base OUT=$S/cap3-results-seeds flock /tmp/laneb-heavy.lock $R/probe.sh seed "$1" "$2" >> $LOG 2>&1
}
run() { # label seed state shape [dump]
  local db="${2%_seed}_$3_$(echo "$4" | tr 'A-Z' 'a-z')_$1"; local dir=$S/cap3-results-$([ "$1" = base ] && echo base2 || echo try)
  local last="$db-7b"; [ "$4" = P ] && last="$db-P"
  [ -f "$dir/$last.json" ] && return 0
  echo "$(date -u +%FT%TZ) run $*" >> $LOG
  flock /tmp/laneb-heavy.lock $R/runcap3.sh "$@" >> $LOG 2>&1
  echo "$(date -u +%FT%TZ) done $*" >> $LOG
}
for step in "$@"; do
  # shellcheck disable=SC2086
  set -- $step
  "$@"
done
echo "$(date -u +%FT%TZ) queue end" >> $LOG
