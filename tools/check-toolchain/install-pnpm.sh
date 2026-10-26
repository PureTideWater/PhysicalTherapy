#!/bin/sh
# Installs the pnpm package.json's packageManager names, after checking the registry's tarball against the sha512
# packageManager carries (pnpm@x.y.z+sha512.<hex>), so the bytes installed are the ones a person committed, not only
# the ones the registry's own answer vouches for. Both Dockerfiles run it in their build stage; check-toolchain holds
# the suffix equal to the registry's dist.integrity for that version and refuses a packageManager without it
# (docs/adr/0066, Part 2; docs/runbooks/dependency-upgrades.md, "pnpm itself").
#
#   sh tools/check-toolchain/install-pnpm.sh <path to package.json>
#
# Exits non-zero, installing nothing, when packageManager is not pnpm@x.y.z+sha512.<128 hex>, when npm cannot fetch
# the tarball, or when its sha512 differs. npm pack also checks the tarball against the registry's integrity.
set -eu

manifest="${1:?usage: install-pnpm.sh <path to package.json>}"
spec="$(node -e '
  const manifest = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  const match = /^pnpm@(\d+\.\d+\.\d+)\+sha512\.([0-9a-f]{128})$/.exec(manifest.packageManager ?? "");
  if (match === null) {
    process.stderr.write(`install-pnpm: ${process.argv[1]}: packageManager is ${JSON.stringify(manifest.packageManager ?? null)}, not pnpm@x.y.z+sha512.<128 hex digits>\n`);
    process.exit(1);
  }
  process.stdout.write(`${match[1]} ${match[2]}`);
' "$manifest")"
version="${spec% *}"
expected="${spec#* }"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
npm pack --silent --pack-destination "$work" "pnpm@${version}" > /dev/null
tarball="$work/pnpm-${version}.tgz"
if [ ! -f "$tarball" ]; then
  echo "install-pnpm: npm pack wrote no pnpm-${version}.tgz" >&2
  exit 1
fi
actual="$(sha512sum "$tarball" | cut -d ' ' -f 1)"
if [ "$actual" != "$expected" ]; then
  echo "install-pnpm: pnpm-${version}.tgz has sha512 ${actual}, but packageManager names ${expected}; refusing to install it" >&2
  exit 1
fi
echo "install-pnpm: pnpm-${version}.tgz matches packageManager's sha512; installing it"
npm install --global --no-audit --no-fund "$tarball"
