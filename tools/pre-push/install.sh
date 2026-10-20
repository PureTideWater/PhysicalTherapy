#!/usr/bin/env bash
# Installs the repository's pre-push hook for this clone and every linked worktree of it (docs/adr/0063, audit item
# #20 (e)): pnpm hooks:install, and the session-start hook of every Claude Code session (.claude/hooks/
# session-start.sh). It copies tools/pre-push/launcher.sh to <git common dir>/hooks/pre-push, which git runs for every
# working tree of the clone whatever branch each has checked out; the launcher runs that branch's .githooks/pre-push,
# or refuses the push when the branch has none. git reads no hook there while core.hooksPath is set, so the
# clone's own `core.hooksPath = .githooks` (the hook's first instruction, which a branch without .githooks skipped
# with no warning) is removed, and any other core.hooksPath is refused. A pre-push hook of the clone's own is never
# overwritten. Run again at any time; it changes nothing when the launcher is already in place.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
launcher="$here/launcher.sh"
marker='# paidwhole pre-push launcher'
common="$(git rev-parse --path-format=absolute --git-common-dir)"
target="$common/hooks/pre-push"

scope_value="$(git config --show-scope --get core.hooksPath || true)"
if [ -n "$scope_value" ]; then
  scope="${scope_value%%$'\t'*}"
  value="${scope_value#*$'\t'}"
  if [ "$scope" = local ] && [ "$value" = .githooks ]; then
    git config --local --unset-all core.hooksPath
  else
    echo "pre-push: core.hooksPath is $value in your $scope git configuration, so git reads hooks there and would never run $target. Remove it (git config --$scope --unset core.hooksPath), or call $target from a pre-push hook there, then run pnpm hooks:install again." >&2
    exit 1
  fi
  if [ -n "$(git config --get core.hooksPath || true)" ]; then
    echo "pre-push: core.hooksPath is still set after removing the clone's .githooks, so git would never run $target. Remove it, then run pnpm hooks:install again." >&2
    exit 1
  fi
fi

if [ -e "$target" ] && ! grep -qxF "$marker" "$target"; then
  echo "pre-push: $target is a pre-push hook of this clone's own, so it is left as it is and the repository's hook is not installed. Move it aside, or delete it, and run pnpm hooks:install again." >&2
  exit 1
fi
if [ -e "$target" ] && cmp -s "$launcher" "$target" && [ -x "$target" ]; then
  echo "pre-push: the hook is installed at $target."
  exit 0
fi
mkdir -p "$common/hooks"
cp "$launcher" "$target.tmp.$$"
chmod 755 "$target.tmp.$$"
mv -f "$target.tmp.$$" "$target"
echo "pre-push: the hook is installed at $target; it runs .githooks/pre-push of the working tree a push is made from."
