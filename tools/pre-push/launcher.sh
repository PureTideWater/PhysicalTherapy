#!/usr/bin/env bash
# paidwhole pre-push launcher
# tools/pre-push/install.sh (pnpm hooks:install, and the session-start hook of every Claude Code session) copies
# this file to <git common dir>/hooks/pre-push, the hooks directory git reads for the clone and every linked worktree
# of it (docs/adr/0063, audit item #20 (e)). It runs the hook of the branch checked out where the push is made,
# .githooks/pre-push at that working tree's top. A branch cut before the hook has none, so its push is refused, never
# sent unchecked.
set -euo pipefail
top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$top" ] || [ ! -f "$top/.githooks/pre-push" ]; then
  echo "pre-push: ${top:-this repository} has no .githooks/pre-push: this branch predates the pre-push hook, so this push is refused. Merge claude/build-platform into it, or push from a checkout that has the hook, and push again." >&2
  exit 1
fi
exec bash "$top/.githooks/pre-push" "$@"
