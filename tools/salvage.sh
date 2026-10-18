#!/usr/bin/env bash
# Snapshot every build worktree's uncommitted edits (tracked and untracked) to salvage/<branch>-wip on GitHub,
# without touching the worktree, its index or its branch. Safe to run while agents work.
set -u
for wt in /home/user/pr* /home/user/governance /home/user/fix-* ; do
  [ -d "$wt/.git" ] || [ -f "$wt/.git" ] || continue
  br=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
  [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ] || continue
  idx=$(mktemp /tmp/claude-0/salvage-idx.XXXXXX)
  ( cd "$wt" && export GIT_INDEX_FILE="$idx" && git read-tree HEAD && git add -A -- . ':!*.log' 2>/dev/null &&
    t=$(git write-tree) && c=$(git commit-tree "$t" -p HEAD -m "salvage: uncommitted work on $br at $(date -u +%FT%TZ)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR") &&
    if /tmp/claude-0/gitleaks/gitleaks git --log-opts="HEAD..$c" --no-banner . >/dev/null 2>&1; then
      git push -q -f origin "$c:refs/heads/salvage/${br//\//-}-wip" 2>/dev/null && echo "saved $br -> salvage/${br//\//-}-wip ($c)"
    else echo "NOT saved $br: gitleaks found something; look before pushing"; fi )
  rm -f "$idx"
done
