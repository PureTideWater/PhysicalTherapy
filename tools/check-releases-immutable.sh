#!/usr/bin/env bash
# Published content releases never change (PRD section 9). Fails when any file under a
# content/releases/<n> that exists on the base ref differs in the working tree: changed, deleted,
# added or left untracked. Also fails when the working tree has a content/releases/<n> the base ref
# does not: only the publish-content workflow's own commit on main adds a release, and pull-request
# CI never runs on that commit, so a pull request that adds one by hand is refused.
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

failed=0
# Release directories that exist here (committed or not) but not on the base ref.
if [ -d content/releases ]; then
  while IFS= read -r present; do
    [ -n "$present" ] || continue
    if ! printf '%s\n' "$releases" | grep -qxF -- "$present"; then
      failed=1
      echo "check-releases-immutable: $present is not on $base; releases are published only by the publish-content workflow from content/outgoing" >&2
    fi
  done < <(find content/releases -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort)
fi

if [ -z "$releases" ]; then
  if [ "$failed" -ne 0 ]; then
    exit 1
  fi
  echo "check-releases-immutable: $base has no published releases; nothing to compare."
  exit 0
fi

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
