#!/usr/bin/env bash
# Published content releases never change (PRD section 9). Fails when any file under a
# content/releases/<n> that exists on the base ref differs in the working tree: changed, deleted,
# added or left untracked. Passes when the base ref has no content/releases at all. New release
# directories are not checked here; CI's publish-content workflow is what creates them.
#
# Usage: tools/check-releases-immutable.sh <base-ref>     (CI passes origin/<base branch>)
set -euo pipefail

base="${1:-}"
if [ -z "$base" ]; then
  echo "usage: tools/check-releases-immutable.sh <base-ref>" >&2
  exit 2
fi

root=$(git rev-parse --show-toplevel)
cd "$root"

if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null; then
  echo "check-releases-immutable: '$base' is not a commit in this repository" >&2
  exit 2
fi

releases=$(git ls-tree -d --name-only "$base" -- content/releases/)
if [ -z "$releases" ]; then
  echo "check-releases-immutable: $base has no published releases; nothing to compare."
  exit 0
fi

failed=0
while IFS= read -r release; do
  changes=$(git diff --no-renames --name-status "$base" -- "$release")
  untracked=$(git ls-files --others --exclude-standard -- "$release")
  if [ -n "$changes" ] || [ -n "$untracked" ]; then
    failed=1
    echo "check-releases-immutable: $release differs from $base:" >&2
    if [ -n "$changes" ]; then
      printf '%s\n' "$changes" | sed 's/^/  /' >&2
    fi
    if [ -n "$untracked" ]; then
      printf '%s\n' "$untracked" | sed 's/^/  ?\t/' >&2
    fi
  fi
done <<<"$releases"

if [ "$failed" -ne 0 ]; then
  echo "Published releases are immutable. Prepare a new release in content/drafts with /load-release." >&2
  exit 1
fi
count=$(printf '%s\n' "$releases" | wc -l | tr -d ' ')
echo "check-releases-immutable: $count published release(s) unchanged against $base."
