#!/usr/bin/env bash
# Verifies a release directory against its MANIFEST.json before CI publishes it (PRD section 9;
# docs/adr/0003-content-release-manifest.md). The manifest is
#   { "release": <n>, "files": { "<path relative to the directory>": "<sha256 hex>", ... } }
# and must list every file in the directory except itself, each with a matching SHA-256, and name
# the directory's own number.
#
# Usage: tools/verify-release-manifest.sh content/outgoing/<n>
set -euo pipefail

dir="${1:-}"
if [ -z "$dir" ] || [ ! -d "$dir" ]; then
  echo "usage: tools/verify-release-manifest.sh <release-directory>" >&2
  exit 2
fi
dir="${dir%/}"
name=$(basename "$dir")
manifest="$dir/MANIFEST.json"

fail() {
  echo "verify-release-manifest: $dir: $1" >&2
  exit 1
}

[[ "$name" =~ ^[1-9][0-9]*$ ]] || fail "the directory name must be a release number"
[ -f "$manifest" ] || fail "MANIFEST.json is missing"
jq -e 'type == "object" and (.files | type == "object") and (.files | length > 0)' "$manifest" >/dev/null 2>&1 \
  || fail "MANIFEST.json must be an object with a non-empty \"files\" map"
[ "$(jq -r '.release | tostring' "$manifest")" = "$name" ] || fail "MANIFEST.json names a different release number"

bad_paths=$(jq -r '.files | keys[] | select(startswith("/") or test("(^|/)\\.\\.(/|$)") or test("[\\t\\n]") or . == "MANIFEST.json")' "$manifest")
[ -z "$bad_paths" ] || fail "MANIFEST.json lists paths outside the directory or itself: $bad_paths"
bad_hashes=$(jq -r '.files | to_entries[] | select(.value | type != "string" or (test("^[0-9a-f]{64}$") | not)) | .key' "$manifest")
[ -z "$bad_hashes" ] || fail "MANIFEST.json has values that are not SHA-256 hex digests: $bad_hashes"

listed=$(jq -r '.files | keys[]' "$manifest" | LC_ALL=C sort)
present=$(cd "$dir" && find . \( -type f -o -type l \) ! -path ./MANIFEST.json | sed 's|^\./||' | LC_ALL=C sort)
if [ "$listed" != "$present" ]; then
  echo "verify-release-manifest: $dir: the files present do not match MANIFEST.json (< listed, > present):" >&2
  diff <(printf '%s\n' "$listed") <(printf '%s\n' "$present") >&2 || true
  exit 1
fi

mismatched=0
while IFS=$'\t' read -r path expected; do
  if [ -L "$dir/$path" ]; then
    echo "verify-release-manifest: $dir: $path is a symbolic link" >&2
    mismatched=1
    continue
  fi
  actual=$(sha256sum "$dir/$path" | cut -d' ' -f1)
  if [ "$actual" != "$expected" ]; then
    echo "verify-release-manifest: $dir: SHA-256 mismatch for $path" >&2
    mismatched=1
  fi
done < <(jq -r '.files | to_entries[] | "\(.key)\t\(.value)"' "$manifest")
[ "$mismatched" -eq 0 ] || exit 1

echo "verify-release-manifest: $dir matches its manifest ($(printf '%s\n' "$listed" | wc -l | tr -d ' ') files)."
