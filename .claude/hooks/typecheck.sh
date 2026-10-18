#!/usr/bin/env bash
# PostToolUse on Edit|Write|MultiEdit of .ts, .tsx, .mts and .cts: type-checks the touched package, the nearest
# directory above the file with a package.json in the file's own repository (apps/*, packages/*, infra, tools, or the
# root's own files through the root tsconfig.json); exit 2 puts the errors in front of Claude. When the package's
# typecheck script is exactly "tsc --noEmit", it runs that tsc itself, incrementally, its build information kept
# under node_modules/.cache/tp-typecheck: the same check reports the same errors, re-checking only what an edit
# affects (docs/adr/0063). Any other script runs through pnpm, as before. Fails closed without jq, and without node,
# tsc or pnpm where the file needs them.
set -u
command -v jq >/dev/null 2>&1 || { echo "typecheck: jq is required" >&2; exit 2; }
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty') || { echo "typecheck: the hook input is not JSON" >&2; exit 2; }
case "$file_path" in *.ts|*.tsx|*.mts|*.cts) ;; *) exit 0 ;; esac
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
root=$(cd "${cwd:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || root="${cwd:-$PWD}"
case "$file_path" in /*) abs="$file_path" ;; *) abs="$root/$file_path" ;; esac
dir=$(dirname "$abs")
while [ ! -d "$dir" ]; do dir=$(dirname "$dir"); done
dir=$(cd "$dir" 2>/dev/null && pwd -P) || exit 0
# A file outside any repository, or in installed dependencies, belongs to no package of ours.
own=$(cd "$dir" && git rev-parse --show-toplevel 2>/dev/null) || exit 0
case "$dir/" in */node_modules/*) exit 0 ;; esac
pkg=$dir
while [ "$pkg" != "$own" ] && [ "$pkg" != / ] && [ ! -f "$pkg/package.json" ]; do pkg=$(dirname "$pkg"); done
[ "$pkg" != / ] || exit 0
rel=${pkg#"$own"}
rel=${rel#/}
if [ -z "$rel" ]; then
  [ -f "$own/tsconfig.json" ] || exit 0
  script="tsc --noEmit"
  name=root
else
  script=$(jq -r '.scripts.typecheck // empty' "$pkg/package.json" 2>/dev/null) || script=""
  [ -n "$script" ] || exit 0
  name=$(printf '%s' "$rel" | tr '/' '_')
fi
if [ "$script" = "tsc --noEmit" ]; then
  command -v node >/dev/null 2>&1 || { echo "typecheck: node is required to type-check ${rel:-the root}" >&2; exit 2; }
  tsc="$pkg/node_modules/.bin/tsc"
  [ -x "$tsc" ] || tsc="$own/node_modules/.bin/tsc"
  [ -x "$tsc" ] || { echo "typecheck: tsc is not installed in $own (pnpm install), so ${rel:-the root} was not type-checked" >&2; exit 2; }
  cache="$own/node_modules/.cache/tp-typecheck"
  mkdir -p "$cache" 2>/dev/null || { echo "typecheck: cannot write $cache" >&2; exit 2; }
  out=$(cd "$pkg" && "$tsc" --noEmit --incremental --tsBuildInfoFile "$cache/$name.tsbuildinfo" -p tsconfig.json 2>&1) && exit 0
else
  command -v pnpm >/dev/null 2>&1 || { echo "typecheck: pnpm is required to run the typecheck script of $rel" >&2; exit 2; }
  out=$(cd "$own" && pnpm --filter "./$rel" -s typecheck 2>&1) && exit 0
fi
printf 'typecheck: %s does not type-check after this edit:\n' "${rel:-the root}" >&2
printf '%s\n' "$out" | tail -n 40 >&2
exit 2
