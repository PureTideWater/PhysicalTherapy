#!/usr/bin/env bash
# Lane A's continuity snapshot (2026-10-27): every few minutes, put everything a stopped session would lose on GitHub.
# - Each #42 fix-round builder's committed work goes to its own branch co-001/wip-pr42-fix-<key> (fast-forward only,
#   never forced; pushed from the main checkout so the pre-push hook and gitleaks run). CI does not run on these
#   branches (ci.yml and mutation.yml run on pull requests and on claude/build-platform only).
# - Uncommitted changes in those clones go to approval-summaries/lane-a-wip/<key>.uncommitted.patch on claude/build-ops.
# - Workflow agents' progress files and this session's workflow scripts go to approval-summaries/lane-a-wip/ and
#   workflow-scripts/ on claude/build-ops.
# Usage: bash tools/lane-a-snapshot.sh <scratchpad> <workflow-scripts-dir> <until-epoch> [interval-seconds]
set -uo pipefail
SP="$1"; WFS="$2"; UNTIL="$3"; EVERY="${4:-300}"
MAIN=/home/user/PhysicalTherapy; OPS=/home/user/ops; WIP="$OPS/approval-summaries/lane-a-wip"
export GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks
log() { echo "$(date -u +%H:%M:%S) $*"; }
snap() {
  mkdir -p "$WIP/progress"
  for c in "$SP"/pr42/build-*; do
    [ -d "$c/.git" ] || continue
    key="${c##*/build-}"; br="co-001/wip-pr42-fix-$key"
    head="$(git -C "$c" rev-parse HEAD 2>/dev/null)" || continue
    git -C "$c" diff HEAD > "$WIP/$key.uncommitted.patch" 2>/dev/null || true
    [ -s "$WIP/$key.uncommitted.patch" ] || rm -f "$WIP/$key.uncommitted.patch"
    if [ "$(git -C "$MAIN" rev-parse "refs/heads/$br" 2>/dev/null)" != "$head" ]; then
      if git -C "$MAIN" fetch -q "$c" "+HEAD:refs/heads/$br" 2>/dev/null && \
         git -C "$MAIN" push -q origin "refs/heads/$br:refs/heads/$br" 2>&1 | tail -2; then
        log "pushed $br at ${head:0:8}"
      else
        log "push of $br refused or failed (not forced)"
      fi
    fi
  done
  # The integrator works in the PR's own worktree: its unpushed commits go to co-001/wip-pr42-integrate, never to the PR
  # branch (one push per round), and its uncommitted changes to integrate.uncommitted.patch.
  if [ -d /home/user/pr6b4 ]; then
    head="$(git -C /home/user/pr6b4 rev-parse HEAD 2>/dev/null)"
    git -C /home/user/pr6b4 diff HEAD > "$WIP/integrate.uncommitted.patch" 2>/dev/null || true
    [ -s "$WIP/integrate.uncommitted.patch" ] || rm -f "$WIP/integrate.uncommitted.patch"
    if [ -n "$head" ] && [ "$(git -C "$MAIN" ls-remote origin refs/heads/co-001/wip-pr42-integrate 2>/dev/null | cut -f1)" != "$head" ] \
       && [ "$(git -C "$MAIN" rev-parse origin/co-001/pr-06b-mail-streams 2>/dev/null)" != "$head" ]; then
      if git -C "$MAIN" push -q origin "$head:refs/heads/co-001/wip-pr42-integrate" 2>&1 | tail -2; then log "pushed co-001/wip-pr42-integrate at ${head:0:8}"
      else log "push of co-001/wip-pr42-integrate refused or failed (not forced)"; fi
    fi
  fi
  # Copies, with any 40- or 64-hex hash shortened to 8 digits and an ellipsis (gitleaks reads a bare hash as a key).
  for f in "$SP"/progress/*.md; do [ -f "$f" ] && sed -E 's/\b([0-9a-f]{8})[0-9a-f]{32}([0-9a-f]{24})?\b/\1…/g' "$f" > "$WIP/progress/$(basename "$f")"; done
  for s in "$WFS"/*.js; do [ -f "$s" ] && cp -p "$s" "$OPS/workflow-scripts/lane-a-$(basename "$s")"; done
  cd "$OPS" || return
  git add -A approval-summaries/lane-a-wip workflow-scripts designs 2>/dev/null
  # Lane A's design documents are written by workflow agents; commit them as they land (never HANDOFF.md mid-edit).
  if ! git diff --cached --quiet; then
    git commit -q -m "Lane A: continuity snapshot $(date -u +%Y-%m-%dT%H:%MZ) (progress files, workflow scripts, designs, uncommitted patches)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TrKDxeLbxVo7t7zwRXFzrg"
    git pull -q --no-rebase origin claude/build-ops 2>&1 | tail -2
    if git -C "$MAIN" push -q origin claude/build-ops 2>&1 | tail -3; [ "${PIPESTATUS[0]}" = 0 ]; then
      log "pushed claude/build-ops snapshot"
    else
      # Refused (most likely gitleaks on a patch): take the unpushed commits back, leave the patches out, try once more.
      git reset -q --soft origin/claude/build-ops
      git reset -q -- 'approval-summaries/lane-a-wip/*.patch' 2>/dev/null
      if ! git diff --cached --quiet; then
        git commit -q -m "Lane A: continuity snapshot $(date -u +%Y-%m-%dT%H:%MZ) (progress files, workflow scripts, designs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TrKDxeLbxVo7t7zwRXFzrg"
        if git -C "$MAIN" push -q origin claude/build-ops 2>&1 | tail -3; [ "${PIPESTATUS[0]}" = 0 ]; then log "pushed snapshot without patches"
        else git reset -q --soft origin/claude/build-ops; log "snapshot push refused twice; left uncommitted for the next round"; fi
      fi
    fi
  fi
}
while [ "$(date +%s)" -lt "$UNTIL" ]; do snap; sleep "$EVERY"; done
snap; log "snapshot loop ended"
