#!/usr/bin/env bash
# Installs the pinned Trivy that the image scans and the bills of materials run (docs/adr/0066, Part 2) into the
# directory given, and prints its path. The release archive for this machine is downloaded from
# github.com/aquasecurity/trivy's release and checked against the SHA-256 in tools/trivy/release.txt before anything in
# it runs; then its trivy alone is installed, and must report the pinned version. It keeps no cache: each run installs
# its own copy, as the release restores none. This replaces setup-trivy's installer, which downloads from get.trivy.dev
# (gone since 2026-11-03). TRIVY_DOWNLOAD_BASE replaces the release's address (a mirror); the pinned SHA-256 still
# decides. Run it as tools/trivy/install.sh <directory>; a step puts that directory on PATH.
set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "usage: tools/trivy/install.sh <directory>" >&2
  exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
release="$here/release.txt"
version="$(awk '$1 == "version" { print $2 }' "$release")"
case "$(uname -s)_$(uname -m)" in
  Linux_x86_64 | Linux_amd64) platform=linux_x64 asset=Linux-64bit ;;
  Linux_aarch64 | Linux_arm64) platform=linux_arm64 asset=Linux-ARM64 ;;
  *)
    echo "trivy: $release pins no release for $(uname -s) $(uname -m)." >&2
    exit 1
    ;;
esac
expected="$(awk -v platform="$platform" '$1 == platform { print $2 }' "$release")"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ || ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
  echo "trivy: $release does not pin a version and a SHA-256 for $platform." >&2
  exit 1
fi

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

archive="trivy_${version}_${asset}.tar.gz"
base="${TRIVY_DOWNLOAD_BASE:-https://github.com/aquasecurity/trivy/releases/download/v$version}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if ! curl -fsSL --proto '=https,file' --proto-redir '=https' --retry 3 -o "$work/$archive" "$base/$archive"; then
  echo "trivy: could not download $base/$archive." >&2
  exit 1
fi
actual="$(sha256 "$work/$archive")"
if [ "$actual" != "$expected" ]; then
  echo "trivy: $archive has SHA-256 $actual, not the $expected that $release pins, so it is refused and nothing is installed." >&2
  exit 1
fi
mkdir -p "$work/x"
tar -xzf "$work/$archive" --no-same-owner -C "$work/x" trivy
chmod 755 "$work/x/trivy"
reported="$("$work/x/trivy" --version 2>/dev/null | awk '$1 == "Version:" { print $2; exit }')"
if [ "$reported" != "$version" ]; then
  echo "trivy: $archive's trivy reports version ${reported:-none}, not the $version that $release pins, so nothing is installed." >&2
  exit 1
fi
mkdir -p "$1"
dir="$(cd "$1" && pwd -P)"
mv -f "$work/x/trivy" "$dir/trivy"
echo "$dir/trivy"
