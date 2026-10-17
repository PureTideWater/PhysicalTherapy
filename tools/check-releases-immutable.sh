#!/usr/bin/env bash
# Published content releases never change (PRD section 9). Fails when any file under a
# content/releases/<n> that exists on the base ref differs in the working tree: changed, deleted,
# added or left untracked. Also fails when the working tree has a content/releases/<n> the base ref
# does not: only the publish-content workflow's own commit on main adds a release, and pull-request
# CI never runs on that commit, so a pull request that adds one by hand is refused.
#
# Released prompt versions never change either (PRD 14: prompt text and schemas versioned in the
# repository with a changelog; docs/adr/0048 and 0054): every packages/model-gateway/prompts/<name>/v<n>
# on the base ref must be the same here, so a prompt change is a new version directory, which the
# evaluation gate then holds to a recorded baseline. A new version directory is allowed.
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
  echo "check-releases-immutable: $base has no published releases; nothing to compare."
else
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
  else
    count=$(printf '%s\n' "$releases" | wc -l | tr -d ' ')
    echo "check-releases-immutable: $count published release(s) unchanged against $base."
  fi
fi

# Released prompt versions: each packages/model-gateway/prompts/<name>/v<n> on the base ref, unchanged.
prompt_failed=0
prompt_versions=""
while IFS= read -r name; do
  [ -n "$name" ] || continue
  prompt_versions+=$(git ls-tree -d --name-only "$base" -- "$name/" | grep -E '/v[0-9]+$' || true)
  prompt_versions+=$'\n'
done < <(git ls-tree -d --name-only "$base" -- packages/model-gateway/prompts/)
prompt_count=0
while IFS= read -r version; do
  [ -n "$version" ] || continue
  prompt_count=$((prompt_count + 1))
  changes=$(git diff --no-renames --name-status "$base" -- "$version")
  untracked=$(git ls-files --others --exclude-standard -- "$version")
  if [ -n "$changes" ] || [ -n "$untracked" ]; then
    prompt_failed=1
    echo "check-releases-immutable: the released prompt version $version differs from $base:" >&2
    if [ -n "$changes" ]; then
      printf '%s\n' "$changes" | sed 's/^/  /' >&2
    fi
    if [ -n "$untracked" ]; then
      printf '%s\n' "$untracked" | sed 's/^/  ?\t/' >&2
    fi
  fi
done <<<"$prompt_versions"
if [ "$prompt_failed" -ne 0 ]; then
  failed=1
  echo "Released prompt versions are immutable. Write the change as a new version directory with a changelog entry, and record its evaluation." >&2
elif [ "$prompt_count" -gt 0 ]; then
  echo "check-releases-immutable: $prompt_count released prompt version(s) unchanged against $base."
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
