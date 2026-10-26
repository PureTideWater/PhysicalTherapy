#!/usr/bin/env bash
# The browser jobs' system packages, kept between runs and trusted only once checked (docs/adr/0066, Part 3; V3).
# `playwright install --with-deps` runs `sudo apt-get update && apt-get install` for Chromium's libraries and fonts, and
# a pull request's run has spent ten minutes fetching 26 MB from a throttled mirror. The jobs cache the .deb files apt
# downloaded; this script decides which of them apt may see.
#
#   tools/ci/apt-archives.sh verify <dir>   after the cache restore, before the install: `apt-get update` (the archive's
#                                           signed InRelease indexes, fresh), then for each <dir>/*.deb its package,
#                                           version and architecture from apt's own file name (name_version_arch.deb,
#                                           an epoch's colon as %3a), the SHA256 the index just fetched gives for exactly
#                                           that version, and the file's own SHA-256. A file that matches is copied into
#                                           apt's archive directory; one that differs, or whose version the index no
#                                           longer lists, is deleted, and apt downloads that package itself. apt takes a
#                                           file in its archive directory by its size alone (apt-pkg/acquire-item.cc,
#                                           "Make sure the size matches"), so nothing reaches it unchecked. It also
#                                           keeps what apt-get downloads (APT::Keep-Downloaded-Packages), so collect
#                                           finds it. It fails only when apt itself fails.
#   tools/ci/apt-archives.sh collect <dir>  after the install, in the job that saves the cache: copies apt's archive
#                                           directory's .deb files into <dir>, owned by the runner's user, and warns
#                                           when there are none.
#
# APT_ARCHIVES_ROOT (empty on a runner) prefixes /var/cache/apt/archives and /etc/apt/apt.conf.d, for the stub tests.
set -euo pipefail

root="${APT_ARCHIVES_ROOT:-}"
archives="$root/var/cache/apt/archives"
keep_conf="$root/etc/apt/apt.conf.d/90paidwhole-keep-archives"

usage() {
  echo "usage: tools/ci/apt-archives.sh verify|collect <dir>" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
command="$1"
dir="$2"

case "$command" in
  verify)
    sudo apt-get update
    sudo mkdir -p "$(dirname "$keep_conf")" "$archives"
    echo 'APT::Keep-Downloaded-Packages "true";' | sudo tee "$keep_conf" > /dev/null
    kept=0
    discarded=0
    if [ -d "$dir" ]; then
      for file in "$dir"/*.deb; do
        [ -e "$file" ] || continue
        base="$(basename "$file" .deb)"
        name="${base%%_*}"
        rest="${base#*_}"
        arch="${rest##*_}"
        version="${rest%_*}"
        version="${version//%3a/:}"
        version="${version//%3A/:}"
        reason=""
        if ! [[ "$name" =~ ^[a-z0-9][a-z0-9+.-]+$ && "$version" =~ ^[A-Za-z0-9.+~:-]+$ && "$arch" =~ ^[a-z0-9-]+$ && "$base" == "${name}_${rest}" && "$rest" == *_* ]]; then
          reason="its name is not apt's name_version_arch.deb"
        else
          # An Architecture: all package is listed under the native architecture, so it is asked for by version alone.
          if [ "$arch" = all ]; then spec="$name=$version"; else spec="$name:$arch=$version"; fi
          # apt-cache exits 100 for a version no index lists; that is a stale file, not a failure of apt.
          listed="$(apt-cache show "$spec" 2> /dev/null | sed -n 's/^SHA256: //p')" || listed=""
          actual="$(sha256sum "$file" | cut -d ' ' -f 1)"
          if [ -z "$listed" ]; then
            reason="the index lists no $spec"
          elif ! grep -qx -- "$actual" <<< "$listed"; then
            reason="its SHA-256 $actual is not the index's for $spec"
          fi
        fi
        if [ -z "$reason" ]; then
          sudo cp "$file" "$archives/"
          kept=$((kept + 1))
        else
          echo "discarded $(basename "$file"): $reason"
          rm -f "$file"
          discarded=$((discarded + 1))
        fi
      done
    fi
    echo "apt archives: $kept kept (each the signed index's SHA-256 for its version), $discarded discarded"
    ;;
  collect)
    mkdir -p "$dir"
    count=0
    for file in "$archives"/*.deb; do
      [ -e "$file" ] || continue
      cp "$file" "$dir/"
      count=$((count + 1))
    done
    if [ "$count" -eq 0 ]; then
      echo "::warning title=apt archives::apt's archive directory holds no .deb, so nothing is cached for the next run (was APT::Keep-Downloaded-Packages set by verify?)"
    fi
    echo "apt archives: $count collected into $dir"
    ;;
  *)
    usage
    ;;
esac
