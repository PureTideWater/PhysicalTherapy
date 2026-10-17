#!/usr/bin/env bash
# PreToolUse on Edit|Write|MultiEdit. The founder's approval is written only on the founder's instruction (CO-02,
# reconciliation-001 D1): refuses any call whose result changes an "Approved by:" line of
# docs/product/domain-model.md, and any change to packages/db/domain-model/approvers.json. The result is rebuilt
# from the call and the file on disk. Paths resolve from the hook input's cwd (worktrees). Fails closed without jq.
set -u
command -v jq >/dev/null 2>&1 || { echo "protect-approval: jq is required" >&2; exit 2; }
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty') || { echo "protect-approval: the hook input is not JSON" >&2; exit 2; }
[ -n "$file_path" ] || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
root=$(cd "${cwd:-.}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || root="${cwd:-$PWD}"
case "$file_path" in /*) abs="$file_path" ;; *) abs="$root/$file_path" ;; esac
case "$abs" in
  */docs/product/domain-model.md) rule=approval_line ;;
  */packages/db/domain-model/approvers.json) rule=whole_file ;;
  *) exit 0 ;;
esac
current=/dev/null
[ -f "$abs" ] && current="$abs"
# jq rebuilds the file the call would leave (null when an edit cannot apply, so nothing is written) and compares.
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
  if $after == null then "allow"
  elif $rule == "approval_line" then (if ($after | approvals) == ($current | approvals) then "allow" else "refuse" end)
  elif $after == $current then "allow"
  else "refuse" end
') || { echo "protect-approval: could not read the call for $file_path, so it is refused" >&2; exit 2; }
[ "$verdict" = "allow" ] && exit 0
if [ "$rule" = "approval_line" ]; then
  echo "Blocked: this call would change the \"Approved by:\" line of $file_path. The founder's approval is written only on the founder's instruction, by the founder; regenerate the document with pnpm db:domain-model and leave that line to them." >&2
else
  echo "Blocked: $file_path lists who may approve the domain model. It changes only on the founder's instruction, by the founder, in the pull request whose document they sign." >&2
fi
exit 2
