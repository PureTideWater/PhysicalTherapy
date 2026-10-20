#!/usr/bin/env bash
# PreToolUse on Edit|Write|MultiEdit|NotebookEdit. Anywhere, refuses a call that writes an X12 interchange whose
# ISA06 sender is not SYNTHSENDER: every interchange header in a Write's content, an Edit's new_string, each
# new_string of a MultiEdit and a NotebookEdit's new_source, wherever in that text it starts (after a byte-order mark,
# white space or other text). Under fixtures/ or packages/synth/ it also refuses any write of a spreadsheet (.xlsx,
# .xls, .xlsm, .ods and the like) and any NotebookEdit (no notebook is a fixture, and the guard cannot rebuild what one
# leaves; docs/adr/0063), and checks the file a Write, Edit or MultiEdit would leave (a CSV or TSV above all) with the
# writer's own guard, packages/synth/src/guard/cli.ts: SYNTHSENDER in an identifier column of every data row
# (docs/adr/0059). A relative path resolves from the hook input's cwd, as Claude Code resolves it, and a path holding
# a control character is refused. Fails closed without jq, node or tsx.
set -u
command -v jq >/dev/null 2>&1 || { echo "fixture-guard: jq is required" >&2; exit 2; }
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty') || { echo "fixture-guard: the hook input is not JSON" >&2; exit 2; }
printf '%s' "$input" | jq -e '[.tool_input.file_path, .tool_input.notebook_path] | any(.[]; type == "string" and test("[[:cntrl:]]"))' >/dev/null
case $? in
  1) ;;
  0)
    echo "Blocked: the file path of this call holds a control character (a line break or a tab), so the fixture guard cannot tell which file it writes, and refuses it." >&2
    exit 2 ;;
  *) echo "fixture-guard: could not read the call's file path, so it is refused" >&2; exit 2 ;;
esac
# An interchange header: "ISA" (not inside a word), its element separator, then ISA01 to ISA06 at their fixed widths,
# the separator repeated between them; ISA06 is the 15 characters after the sixth separator (packages/synth/src/write.ts
# reads the same field).
printf '%s' "$input" | jq -e '
  [ [.tool_input.content, .tool_input.new_string, .tool_input.new_source, (.tool_input.edits[]? | .new_string?)]
    | map(strings) | .[]
    | match("(?<![A-Za-z0-9])ISA([^A-Za-z0-9\\s])[0-9]{2}\\1.{10}\\1[0-9]{2}\\1.{10}\\1.{2}\\1(.{15})\\1"; "g")
    | .captures[1].string | gsub(" "; "") ]
  | any(. != "SYNTHSENDER")' >/dev/null
case $? in
  1) ;;
  0)
    echo "Blocked: ${file_path:-this call} contains an X12 interchange whose sender is not SYNTHSENDER. Real remittances never enter the repository. Generate a twin with pnpm synth." >&2
    exit 2 ;;
  *) echo "fixture-guard: could not read the text this call writes, so it is refused" >&2; exit 2 ;;
esac

# The file's path in its own repository (a worktree is its own) and in each repository around it: "." and ".."
# segments taken out, symbolic links resolved (the file itself, as a Write follows it, and the part of its directory
# that exists), and compared in any case, so no spelling of a fixture's path slips past, and a gitfile or a clone that
# makes a directory of fixtures/ its own repository leaves the path a fixture's.
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
  target=$(readlink "$abs") || { echo "fixture-guard: could not read the link $file_path, so it is refused" >&2; exit 2; }
  case "$target" in /*) ;; *) target="$(dirname "$abs")/$target" ;; esac
  abs=$(clean_path "$target")
  hops=$((hops + 1))
done
real=$(dirname "$abs")
while [ ! -d "$real" ]; do real=$(dirname "$real"); done
top=$(cd "$real" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || top="$root"
rel=""
for _ in 1 2 3 4 5 6 7 8; do
  candidate=${abs#"$top"/}
  case "$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]')" in fixtures/*|packages/synth/*) rel=$candidate; break ;; esac
  [ "$top" != / ] || break
  top=$(cd "$top/.." 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || break
done
[ -n "$rel" ] || exit 0
lower=$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]')
if [ "$(printf '%s' "$input" | jq -r '.tool_name // empty')" = "NotebookEdit" ]; then
  echo "Blocked: $file_path is under fixtures/ or packages/synth/, where no notebook belongs, and the fixture guard cannot rebuild what a NotebookEdit leaves. Generate fixtures with pnpm synth." >&2
  exit 2
fi
case "$lower" in
  *.xlsx|*.xls|*.xlsm|*.xlsb|*.xltx|*.xltm|*.ods|*.fods|*.numbers)
    echo "Blocked: $file_path is a spreadsheet under fixtures/ or packages/synth/. A workbook fixture is generated by packages/synth, which checks it for SYNTHSENDER; it is never written by hand." >&2
    exit 2 ;;
  # Source, data and documents: no fixture rule reads them, and the hook stays fast for them.
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.md) exit 0 ;;
esac

# Anything else there (a CSV or TSV, an .835, a text file) is checked as the file the call would leave.
here=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tsx="$here/node_modules/.bin/tsx"
command -v node >/dev/null 2>&1 || { echo "fixture-guard: node is required to check $file_path" >&2; exit 2; }
[ -x "$tsx" ] || { echo "fixture-guard: tsx is required to check $file_path (pnpm install)" >&2; exit 2; }
printf '%s' "$input" | "$tsx" "$here/packages/synth/src/guard/cli.ts" --hook --label "$rel" --file "$abs" && exit 0
exit 2
