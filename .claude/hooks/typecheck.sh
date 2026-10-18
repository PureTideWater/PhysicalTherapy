#!/usr/bin/env bash
# PostToolUse on Edit|Write of .ts and .tsx: type-checks the touched package; exit 2 puts errors in front of Claude.
set -u
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
case "$file_path" in *.ts|*.tsx) ;; *) exit 0 ;; esac
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
root=$(cd "${cwd:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || root="${cwd:-$PWD}"
rel=${file_path#"$root"/}
pkg=$(printf '%s' "$rel" | cut -d/ -f1-2)
case "$pkg" in apps/*|packages/*) ;; *) exit 0 ;; esac
out=$(cd "$root" && pnpm --filter "./$pkg" -s typecheck 2>&1) && exit 0
printf '%s\n' "$out" | tail -n 40 >&2
exit 2
