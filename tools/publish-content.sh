#!/usr/bin/env bash
# Publishes prepared content releases (PRD section 9, step 3). For each content/outgoing/<n>, in
# numeric order: verifies it against its MANIFEST.json, refuses any record below L2 or marked
# synthetic and any number reserved for SYNTHETIC fixtures (900000 and up), moves it to
# content/releases/<n>, commits, and tags content-release-<n>. Prints each published number on
# stdout. Never pushes; the publish-content workflow does that, after running pnpm verify-content on
# each outgoing release. Run only by CI on main; nothing else writes content/releases.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(git rev-parse --show-toplevel)
cd "$root"

[ -d content/outgoing ] || exit 0
mapfile -t releases < <(find content/outgoing -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -n)

for n in "${releases[@]}"; do
  if ! [[ "$n" =~ ^[1-9][0-9]*$ ]]; then
    echo "publish-content: content/outgoing/$n is not a numbered release" >&2
    exit 1
  fi
  if [ "${#n}" -gt 6 ] || [ "$n" -ge 900000 ]; then
    echo "publish-content: release numbers from 900000 are reserved for SYNTHETIC fixture releases" >&2
    exit 1
  fi
  if [ -e "content/releases/$n" ]; then
    echo "publish-content: content/releases/$n already exists; published releases are immutable" >&2
    exit 1
  fi
  if git rev-parse --verify --quiet "refs/tags/content-release-$n" >/dev/null; then
    echo "publish-content: the tag content-release-$n already exists" >&2
    exit 1
  fi
  "$here/verify-release-manifest.sh" "content/outgoing/$n" >&2
  # Second line of defence behind pnpm verify-content: no record below L2 and no synthetic record is
  # ever published, even if the workflow's checker step is skipped.
  unverified=$(find "content/outgoing/$n" -type f -name '*.json' ! -name 'MANIFEST.json' ! -name '*.second-pass.json' -print0 \
    | xargs -0 -r jq -r 'if type == "array" then .[] | select((.verification.level // "L1") == "L1" or (.source.synthetic // false) == true) | "\(input_filename): \(.record_type) \(.key | tojson) \(.verification.level // "no level")\(if (.source.synthetic // false) then " SYNTHETIC" else "" end)" else "\(input_filename): not a JSON array of records" end')
  if [ -n "$unverified" ]; then
    echo "publish-content: content/outgoing/$n holds records below L2 or marked synthetic; only verified content is published:" >&2
    printf '%s\n' "$unverified" | sed 's/^/  /' >&2
    exit 1
  fi
  mkdir -p content/releases
  git mv "content/outgoing/$n" "content/releases/$n"
  manifest_sha=$(sha256sum "content/releases/$n/MANIFEST.json" | cut -d' ' -f1)
  git commit --quiet -m "content: publish release $n" -m "MANIFEST.json sha256 $manifest_sha"
  git tag -a "content-release-$n" -m "Content release $n (MANIFEST.json sha256 $manifest_sha)"
  echo "$n"
done
