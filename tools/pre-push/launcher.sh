#!/usr/bin/env bash
# paidwhole pre-push launcher
# tools/pre-push/install.sh (pnpm hooks:install, and the session-start hook of every Claude Code session) copies
# this file to <git common dir>/hooks/pre-push, the hooks directory git reads for the clone and every linked worktree
# of it (docs/adr/0063, audit item #20 (e)). It runs the hook of the branch checked out where the push is made,
# .githooks/pre-push at that working tree's top, whichever branch the push sends. A working tree whose branch has none
# (one cut before the hook, or from main, which has none until launch) is refused, never sent unchecked: such a branch
# is pushed from a working tree of this clone that has the hook (git push origin <branch> there checks its commits).
set -euo pipefail
top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$top" ] || [ ! -f "$top/.githooks/pre-push" ]; then
  echo "pre-push: ${top:-this repository} has no .githooks/pre-push, so this push is refused: the branch checked out there was cut before the pre-push hook, or from main, which has none until launch. Push it from a working tree of this clone that has the hook (one of claude/build-platform, or of a branch cut from it): there, git push origin <branch> runs the hook over that branch's commits. Never merge claude/build-platform into a branch cut from main." >&2
  exit 1
fi
exec bash "$top/.githooks/pre-push" "$@"
