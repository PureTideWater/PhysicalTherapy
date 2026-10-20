#!/usr/bin/env bash
# PreToolUse on the GitHub connector's tools that review a pull request or write files on a branch (.claude/settings.json;
# docs/adr/0063). The build never submits a review: a review of a pull request is the approval of record, the
# founder's alone, so every call that creates, submits or deletes a review is refused, whichever account the connector
# holds. A file written through the GitHub API passes none of the edit hooks, so create_or_update_file, push_files and
# delete_file are refused on the paths those hooks guard and on the files that configure the hooks and CI:
# content/releases/, packages/db/migrations/, docs/product/domain-model.md, packages/db/domain-model/, fixtures/,
# packages/synth/, .claude/, .github/ and CLAUDE.md, in any spelling ("/", "." and ".." segments, any case), and
# anywhere when the text holds an X12 interchange whose sender is not SYNTHSENDER (fixture-guard.sh's rule). The build
# writes those in its checkout, where the edit hooks read them, and pushes with git. A shell command (gh, git, curl)
# passes no hook; what holds there is that no build session holds the founder's GitHub account
# (docs/runbooks/github-governance.md, step 3). Fails closed without jq, on input it cannot read and on a write whose
# paths it cannot read.
set -u
command -v jq >/dev/null 2>&1 || { echo "protect-github: jq is required" >&2; exit 2; }
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty') || { echo "protect-github: the hook input is not JSON" >&2; exit 2; }
case "$tool" in
  mcp__*__pull_request_review_write|mcp__*__create_pending_pull_request_review|mcp__*__submit_pending_pull_request_review|mcp__*__create_and_submit_pull_request_review|mcp__*__delete_pending_pull_request_review)
    echo "Blocked: the build never submits a review. A review of a pull request in this repository is the approval of record, which only the founder gives, from their own GitHub account (docs/runbooks/github-governance.md, step 6; docs/adr/0063). Comment on the pull request instead." >&2
    exit 2 ;;
  mcp__*__create_or_update_file|mcp__*__push_files|mcp__*__delete_file) ;;
  *) exit 0 ;;
esac
verdict=$(printf '%s' "$input" | jq -r '
  def clean: split("/") | reduce .[] as $part ([]; if $part == "" or $part == "." then . elif $part == ".." then .[:-1] else . + [$part] end) | join("/") | ascii_downcase;
  def files: .tool_input.files | if type == "array" then .[] | select(type == "object") else empty end;
  ([.tool_input.path, (files | .path)] | map(strings)) as $paths
  | ([.tool_input.content, (files | .content)] | map(strings)) as $texts
  | [$texts[] | match("(?<![A-Za-z0-9])ISA([^A-Za-z0-9\\s])[0-9]{2}\\1.{10}\\1[0-9]{2}\\1.{10}\\1.{2}\\1(.{15})\\1"; "g") | .captures[1].string | gsub(" "; "")] as $senders
  | if ($paths | length) == 0 then "unreadable"
    elif any($paths[]; test("[[:cntrl:]]")) then "unreadable"
    elif any($senders[]; . != "SYNTHSENDER") then "x12"
    else ([$paths[] | clean | select(test("^(content/releases/|packages/db/migrations/|docs/product/domain-model\\.md$|packages/db/domain-model/|fixtures/|packages/synth/|\\.claude/|\\.github/|claude\\.md$)"))] | if length > 0 then "guarded " + .[0] else "allow" end)
    end') || { echo "protect-github: could not read the paths of this $tool call, so it is refused" >&2; exit 2; }
case "$verdict" in
  allow) exit 0 ;;
  unreadable)
    echo "Blocked: protect-github cannot read every path this $tool call writes (none named, or one holding a control character), so it refuses it. Write files in the checkout and push them with git." >&2 ;;
  x12)
    echo "Blocked: this $tool call writes an X12 interchange whose sender is not SYNTHSENDER. Real remittances never enter the repository. Generate a twin with pnpm synth." >&2 ;;
  *)
    echo "Blocked: this $tool call writes ${verdict#guarded } through the GitHub API, where no edit hook reads it. Releases, migrations, the domain model and its approvers, fixtures, packages/synth, .claude, .github and CLAUDE.md are written in the checkout, where the hooks read them, and pushed with git (docs/adr/0063)." >&2 ;;
esac
exit 2
