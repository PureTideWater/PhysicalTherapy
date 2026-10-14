#!/usr/bin/env bash
# PreToolUse on Edit|Write. Refuses any X12 content under fixtures/ or packages/synth/ whose ISA06
# sender is not SYNTHSENDER, and any file anywhere that looks like a real remittance.
set -u
input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
content=$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
[ -n "$content" ] || exit 0
case "$content" in
  ISA*)
    sender=$(printf '%s' "$content" | cut -c36-50 | tr -d ' ')
    if [ "$sender" != "SYNTHSENDER" ]; then
      echo "Blocked: $file_path contains an X12 interchange whose sender is not SYNTHSENDER. Real remittances never enter the repository. Generate a twin with pnpm synth." >&2
      exit 2
    fi ;;
esac
exit 0
