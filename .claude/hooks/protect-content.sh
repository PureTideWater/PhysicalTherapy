#!/usr/bin/env bash
# PreToolUse on Edit|Write|MultiEdit|NotebookEdit. Blocks content/releases always, and packages/db/migrations unless
# the new-migration skill set the marker in the file's repository. The path is taken in the file's own repository (a
# worktree is its own) with "." and ".." segments taken out, symbolic links resolved (the file itself, as a Write
# follows it, and the part of its directory that exists) and compared in any case, as fixture-guard.sh and
# protect-approval.sh take it, so no other spelling of a release or a migration slips past (docs/adr/0063). A
# NotebookEdit names its file notebook_path. Fails closed without jq, on input that is not JSON and on a link it
# cannot read.
set -u
command -v jq >/dev/null 2>&1 || { echo "protect-content: jq is required" >&2; exit 2; }
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty') || { echo "protect-content: the hook input is not JSON" >&2; exit 2; }
[ -n "$file_path" ] || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
root=$(cd "${cwd:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || root="${cwd:-$PWD}"
case "$file_path" in /*) abs="$file_path" ;; *) abs="$root/$file_path" ;; esac
clean_path() {
  local parts=() clean=() part
  IFS=/ read -r -a parts <<< "$1"
  for part in ${parts[@]+"${parts[@]}"}; do
    case "$part" in
      ''|.) ;;
      ..) [ "${#clean[@]}" -eq 0 ] || unset 'clean[${#clean[@]}-1]' ;;
      *) clean+=("$part") ;;
    esac
  done
  printf '/%s' ${clean[@]+"${clean[@]}"}
}
abs=$(clean_path "$abs")
hops=0
while :; do
  dir=$(dirname "$abs")
  while [ ! -d "$dir" ]; do dir=$(dirname "$dir"); done
  real=$(cd "$dir" 2>/dev/null && pwd -P) || real="$dir"
  tail=${abs#"$dir"}
  abs="${real%/}/${tail#/}"
  [ -L "$abs" ] && [ "$hops" -lt 40 ] || break
  target=$(readlink "$abs") || { echo "protect-content: could not read the link $file_path, so it is refused" >&2; exit 2; }
  case "$target" in /*) ;; *) target="$(dirname "$abs")/$target" ;; esac
  abs=$(clean_path "$target")
  hops=$((hops + 1))
done
real=$(dirname "$abs")
while [ ! -d "$real" ]; do real=$(dirname "$real"); done
own=$(cd "$real" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || own="$root"
rel=${abs#"$own"/}
case "$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]')" in
  content/releases/*)
    echo "Blocked: $file_path is a published release. Prepare with /load-release; CI publishes on merge." >&2
    exit 2 ;;
  packages/db/migrations/*)
    [ -f "$own/.claude/.allow-protected-edit" ] && exit 0
    echo "Blocked: $file_path is a migration. Use /new-migration." >&2
    exit 2 ;;
esac
exit 0
