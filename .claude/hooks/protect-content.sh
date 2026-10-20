#!/usr/bin/env bash
# PreToolUse on Edit|Write|MultiEdit|NotebookEdit. Blocks content/releases always, and packages/db/migrations unless
# the new-migration skill set the marker in the file's repository. The path is taken in the file's own repository (a
# worktree is its own) with "." and ".." segments taken out, symbolic links resolved (the file itself, as a Write
# follows it, and the part of its directory that exists) and compared in any case, as fixture-guard.sh and
# protect-approval.sh take it, so no other spelling of a release or a migration slips past (docs/adr/0063). A relative
# path is the session's: it resolves from the hook input's cwd, as Claude Code resolves it. A NotebookEdit names its
# file notebook_path. Anywhere, it also refuses a path holding a control character (a line break ends the path this
# hook reads before the one the tool writes), a path with a ".git" segment (a gitfile there would make another
# directory the file's repository), and the hooks and their settings (.claude/settings*.json, .claude/hooks/,
# .claude/.allow-protected-edit), so no edit switches the guards off. Fails closed without jq, on input that is not
# JSON and on a link it cannot read.
set -u
command -v jq >/dev/null 2>&1 || { echo "protect-content: jq is required" >&2; exit 2; }
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty') || { echo "protect-content: the hook input is not JSON" >&2; exit 2; }
printf '%s' "$input" | jq -e '[.tool_input.file_path, .tool_input.notebook_path] | any(.[]; type == "string" and test("[[:cntrl:]]"))' >/dev/null
case $? in
  1) ;;
  0)
    echo "Blocked: the file path of this call holds a control character (a line break or a tab), which no path in this repository holds; it is refused." >&2
    exit 2 ;;
  *) echo "protect-content: could not read the call's file path, so it is refused" >&2; exit 2 ;;
esac
[ -n "$file_path" ] || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
root=$(cd "${cwd:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || root="${cwd:-$PWD}"
case "$file_path" in /*) abs="$file_path" ;; *) abs="${cwd:-$PWD}/$file_path" ;; esac
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
case "$(printf '%s' "$abs" | tr '[:upper:]' '[:lower:]')/" in
  */.git/*)
    echo "Blocked: $file_path is git's own file or directory (.git). No edit tool writes there: a gitfile would make another directory the repository the guards read paths in." >&2
    exit 2 ;;
  */.claude/settings*.json/|*/.claude/hooks/*|*/.claude/.allow-protected-edit/)
    echo "Blocked: $file_path configures the hooks that guard every edit (.claude/settings*.json, .claude/hooks/, the migration marker). They change only on the founder's instruction, in a pull request the founder reviews (.github/CODEOWNERS), never through an edit tool (docs/adr/0063)." >&2
    exit 2 ;;
esac
# The path in the file's own repository and in each repository around it, so a clone or a gitfile that makes a
# directory its own repository does not make a release or a migration another path.
real=$(dirname "$abs")
while [ ! -d "$real" ]; do real=$(dirname "$real"); done
own=$(cd "$real" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || own="$root"
for _ in 1 2 3 4 5 6 7 8; do
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
  [ "$own" != / ] || break
  own=$(cd "$own/.." 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || break
done
exit 0
