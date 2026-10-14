#!/usr/bin/env bash
# PreToolUse on Edit|Write. Blocks content/releases always, and packages/db/migrations unless
# the new-migration skill set the marker. Paths resolve from the hook input's cwd (worktrees).
set -u
command -v jq >/dev/null 2>&1 || { echo "protect-content: jq is required" >&2; exit 2; }
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -n "$file_path" ] || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
root=$(cd "${cwd:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || root="${cwd:-$PWD}"
case "$file_path" in /*) abs="$file_path" ;; *) abs="$root/$file_path" ;; esac
case "$abs" in
  "$root"/content/releases/*)
    echo "Blocked: $file_path is a published release. Prepare with /load-release; CI publishes on merge." >&2
    exit 2 ;;
  "$root"/packages/db/migrations/*)
    [ -f "$root/.claude/.allow-protected-edit" ] && exit 0
    echo "Blocked: $file_path is a migration. Use /new-migration." >&2
    exit 2 ;;
esac
exit 0
