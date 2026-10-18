#!/usr/bin/env bash
# PreToolUse on Edit|Write|MultiEdit|NotebookEdit. The founder's approval is written only on the founder's instruction
# (CO-02, reconciliation-001 D1): refuses any call whose result changes an "Approved by:" line of
# docs/product/domain-model.md, and any change to packages/db/domain-model/approvers.json. The result is rebuilt
# from the call and the file on disk, and a call it cannot rebuild exactly is refused, a NotebookEdit of either file
# among them (it names its file notebook_path; docs/adr/0063). Paths resolve from the hook input's cwd (worktrees),
# links followed. Fails closed without jq.
set -u
command -v jq >/dev/null 2>&1 || { echo "protect-approval: jq is required" >&2; exit 2; }
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty') || { echo "protect-approval: the hook input is not JSON" >&2; exit 2; }
[ -n "$file_path" ] || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
root=$(cd "${cwd:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || root="${cwd:-$PWD}"
case "$file_path" in /*) abs="$file_path" ;; *) abs="$root/$file_path" ;; esac
# "." and ".." segments taken out, symbolic links resolved (the file itself, as a Write follows it, and the part of
# its directory that exists), and the path compared in any case, so no spelling of either path slips past.
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
  target=$(readlink "$abs") || { echo "protect-approval: could not read the link $file_path, so it is refused" >&2; exit 2; }
  case "$target" in /*) ;; *) target="$(dirname "$abs")/$target" ;; esac
  abs=$(clean_path "$target")
  hops=$((hops + 1))
done
case "$(printf '%s' "$abs" | tr '[:upper:]' '[:lower:]')" in
  */docs/product/domain-model.md) rule=approval_line ;;
  */packages/db/domain-model/approvers.json) rule=whole_file ;;
  *) exit 0 ;;
esac
current=/dev/null
[ -f "$abs" ] && current="$abs"
# jq rebuilds the file the call would leave and compares. An edit whose old_string is not in the file exactly once
# as written (or at all, with replace_all) gives null. Claude Code may still apply it, reading CRLF as LF and curly
# quotes as straight, so a result the hook cannot rebuild is refused: it fails closed.
verdict=$(printf '%s' "$input" | jq -r --arg rule "$rule" --rawfile current "$current" '
  def edit($text; $e):
    ($e.old_string // "") as $old | ($e.new_string // "") as $new |
    if $text == null then null
    elif $old == "" then (if $text == "" then $new else null end)
    elif ($text | contains($old) | not) then null
    elif ($e.replace_all // false) then ($text | split($old) | join($new))
    else ($text | split($old)) as $parts | if ($parts | length) > 2 then null else $parts[0] + $new + $parts[1] end
    end;
  def approvals: [split("\n")[] | select(contains("Approved by:"))];
  .tool_input as $in |
  (if .tool_name == "Write" then ($in.content // "")
   elif .tool_name == "Edit" then edit($current; $in)
   elif .tool_name == "MultiEdit" then reduce ($in.edits // [])[] as $e ($current; edit(.; $e))
   else null end) as $after |
  if .tool_name == "NotebookEdit" then "notebook"
  elif (.tool_name | IN("Write", "Edit", "MultiEdit") | not) then "allow"
  elif $after == null then "unbuildable"
  elif $rule == "approval_line" then (if ($after | approvals) == ($current | approvals) then "allow" else "refuse" end)
  elif $after == $current then "allow"
  else "refuse" end
') || { echo "protect-approval: could not read the call for $file_path, so it is refused" >&2; exit 2; }
[ "$verdict" = "allow" ] && exit 0
if [ "$verdict" = "notebook" ]; then
  echo "Blocked: protect-approval cannot rebuild what a NotebookEdit leaves in $file_path, so it cannot tell whether the approval changes, and refuses it." >&2
elif [ "$verdict" = "unbuildable" ]; then
  echo "Blocked: protect-approval cannot rebuild what this call leaves in $file_path (an old_string not in the file exactly once, as written: its line endings and quotes), so it cannot tell whether the approval changes, and refuses it. Send old_string exactly as the file holds it, or Write the whole file." >&2
elif [ "$rule" = "approval_line" ]; then
  echo "Blocked: this call would change the \"Approved by:\" line of $file_path. The founder's approval is written only on the founder's instruction, by the founder; regenerate the document with pnpm db:domain-model and leave that line to them." >&2
else
  echo "Blocked: $file_path lists who may approve the domain model. It changes only on the founder's instruction, by the founder, in the pull request whose document they sign." >&2
fi
exit 2
