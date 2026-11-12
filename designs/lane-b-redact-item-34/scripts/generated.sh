#!/bin/bash
# generated.sh <out root> [base commit] [head commit or WORKTREE] [seed]: Queues item 34's generated set, in one command.
# Lays the two trees in the gate's layout from the checkout's history (WORKTREE: the checkout's files as they are),
# writes the set (generated-set.mts, 13,780 synthetic letters with seed 34) and runs it through the gate's own worker
# (generated-run.mts). Prints one line; <out root>/out/summary.json holds the counts per form, failures.jsonl each
# letter where a rule's value shows on the head (exit 1 if any), notes.jsonl each residual not as pinned.
# On 83d7bf7d: failures 238. 130 of form a.stored-separator (768 letters) that the base sent whole: rule (c) replaces a
# piece of 5 or more and the piece under 5 beside it is sent, glued to the letter. 108 the base writes the same way
# (a.joiner 57, a.crlf 16, a.stored-separator 35): [SSN] or [PHONE] takes 9 or 10 digits and 1 to 3 are left.
set -uo pipefail
export PATH=/opt/node24/bin:$PATH
ROOT=$1; BASE=${2:-a97d73e4}; HEAD=${3:-WORKTREE}; SEED=${4:-34}; REPO=/home/user/PhysicalTherapy
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; GATE=/home/user/ops/designs/lane-b-redact-ssn-phone/gate
mkdir -p "$ROOT"; ROOT="$(cd "$ROOT" && pwd)"
for t in base:$BASE head:$HEAD; do n=${t%%:*}; c=${t##*:}; d=$ROOT/$n/packages/model-gateway/src; mkdir -p $d
  for f in redact.ts confusables.ts; do if [ "$c" = WORKTREE ]; then cp $REPO/packages/redact/src/$f $d/$f; else git -C $REPO show $c:packages/redact/src/$f > $d/$f; fi; done; done
node "$HERE/generated-set.mts" "$ROOT/corpus" "$SEED" > /dev/null
mkdir -p "$ROOT/out"; cd "$GATE"
flock /tmp/laneb-heavy.lock node --import ./ts-resolve.mjs --max-old-space-size=6000 "$HERE/generated-run.mts" "$ROOT/base/packages/model-gateway/src" "$ROOT/head/packages/model-gateway/src" "$ROOT/corpus" "$ROOT/out" 2> "$ROOT/out/run.stderr"
