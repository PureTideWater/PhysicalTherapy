#!/usr/bin/env bash
# Installs the pinned gitleaks that CI's secret scan and the pre-push hook run (docs/adr/0063, audit item #20 (e)), and
# prints its path. The release archive for this machine is downloaded from github.com/gitleaks/gitleaks and checked
# against the SHA-256 in tools/gitleaks/release.txt before anything in it runs; its gitleaks is then kept in
# ${XDG_CACHE_HOME:-$HOME/.cache}/paidwhole/gitleaks/<version>/, where the pre-push hook looks for it after GITLEAKS.
# A second run finds it there and downloads nothing. GITLEAKS_DOWNLOAD_BASE replaces the release's address (a mirror);
# the pinned SHA-256 still decides. Run it as pnpm gitleaks:install or tools/gitleaks/install.sh.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
release="$here/release.txt"
version="$(awk '$1 == "version" { print $2 }' "$release")"
case "$(uname -s)_$(uname -m)" in
  Linux_x86_64 | Linux_amd64) platform=linux_x64 ;;
  Linux_aarch64 | Linux_arm64) platform=linux_arm64 ;;
  Darwin_x86_64) platform=darwin_x64 ;;
  Darwin_arm64) platform=darwin_arm64 ;;
  *)
    echo "gitleaks: $release pins no release for $(uname -s) $(uname -m); install gitleaks $version yourself and set GITLEAKS to its absolute path." >&2
    exit 1
    ;;
esac
expected="$(awk -v platform="$platform" '$1 == platform { print $2 }' "$release")"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ || ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
  echo "gitleaks: $release does not pin a version and a SHA-256 for $platform." >&2
  exit 1
fi

cache="${XDG_CACHE_HOME:-}"
if [ -z "$cache" ]; then
  [ -n "${HOME:-}" ] || { echo "gitleaks: neither XDG_CACHE_HOME nor HOME is set, so there is nowhere to keep gitleaks." >&2; exit 1; }
  cache="$HOME/.cache"
fi
dir="$cache/paidwhole/gitleaks/$version"
binary="$dir/gitleaks"
if [ -x "$binary" ] && [ "$("$binary" version 2>/dev/null | tr -d 'v')" = "$version" ]; then
  echo "$binary"
  exit 0
fi

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

archive="gitleaks_${version}_${platform}.tar.gz"
base="${GITLEAKS_DOWNLOAD_BASE:-https://github.com/gitleaks/gitleaks/releases/download/v$version}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if ! curl -fsSL --retry 3 -o "$work/$archive" "$base/$archive"; then
  echo "gitleaks: could not download $base/$archive." >&2
  exit 1
fi
actual="$(sha256 "$work/$archive")"
if [ "$actual" != "$expected" ]; then
  echo "gitleaks: $archive has SHA-256 $actual, not the $expected that $release pins, so it is refused and nothing is installed." >&2
  exit 1
fi
mkdir -p "$work/x"
tar -xzf "$work/$archive" -C "$work/x" gitleaks
mkdir -p "$dir"
mv -f "$work/x/gitleaks" "$dir/gitleaks.$$"
chmod 755 "$dir/gitleaks.$$"
mv -f "$dir/gitleaks.$$" "$binary"
echo "$binary"
