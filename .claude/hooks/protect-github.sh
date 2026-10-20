#!/usr/bin/env bash
# PreToolUse on the GitHub connector's tools that review a pull request or write files on a branch (.claude/settings.json;
# docs/adr/0063). The build never submits a review: a review of a pull request is the approval of record, the
# founder's alone, so every call that creates, submits or deletes a review is refused, whichever account the connector
# holds. A file written through the GitHub API (create_or_update_file, push_files, delete_file) reaches the branch with
# no edit hook, no pre-push hook and no gitleaks having read it, so every such call is refused, on every path: the
# build writes files in its checkout, where the edit hooks read them, and pushes with git, where the pre-push hook runs
# the fixture check and gitleaks over the commits (audit item #20 (e)). A shell command (gh, git, curl) passes no hook;
# what holds there is that no build session holds the founder's GitHub account (docs/runbooks/github-governance.md,
# step 3), and that the build never pushes with --no-verify (CLAUDE.md). Fails closed without jq and on input it
# cannot read.
set -u
command -v jq >/dev/null 2>&1 || { echo "protect-github: jq is required" >&2; exit 2; }
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty') || { echo "protect-github: the hook input is not JSON" >&2; exit 2; }
case "$tool" in
  mcp__*__pull_request_review_write|mcp__*__create_pending_pull_request_review|mcp__*__submit_pending_pull_request_review|mcp__*__create_and_submit_pull_request_review|mcp__*__delete_pending_pull_request_review)
    echo "Blocked: the build never submits a review. A review of a pull request in this repository is the approval of record, which only the founder gives, from their own GitHub account (docs/runbooks/github-governance.md, step 6; docs/adr/0063). Comment on the pull request instead." >&2
    exit 2 ;;
  mcp__*__create_or_update_file|mcp__*__push_files|mcp__*__delete_file)
    echo "Blocked: $tool writes files on a branch through the GitHub API, where neither the edit hooks nor the pre-push hook (the fixture check and gitleaks) read them. Write the files in the checkout and push them with git (docs/adr/0063)." >&2
    exit 2 ;;
  *) exit 0 ;;
esac
