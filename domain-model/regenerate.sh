#!/usr/bin/env bash
# Regenerate the CO-02 domain model from a fresh clone, on a throwaway database, and prove it is deterministic.
#   regenerate.sh <clone of claude/build-platform with pnpm install done> <output.md> [admin-url]
# Creates databases co_dm_<random>_a and _b, migrates both with `pnpm db:migrate`, writes the document from the
# first, checks it against the second, and drops both. Nothing in the clone is changed.
# REQUIRE_APPROVAL=1 adds --require-approval to the check: an existing approved document is kept as it is when the
# text is unchanged, and the check then fails unless its approval line names a person, a date and this text's hash.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$1" && pwd)"; out="$2"; admin="${3:-postgres://postgres:test@localhost:5432/postgres}"
base="${admin%/*}"; tag="co_dm_$(date +%s)_$RANDOM"
cleanup() { for s in a b; do psql "$admin" -qc "DROP DATABASE IF EXISTS ${tag}_$s WITH (FORCE)" >/dev/null; done; }
trap cleanup EXIT
for s in a b; do
  psql "$admin" -qc "CREATE DATABASE ${tag}_$s"
  DATABASE_URL="$base/${tag}_$s" pnpm --dir "$repo" -s db:migrate >/dev/null
done
cross="$(mktemp)"
"$repo/node_modules/.bin/tsx" "$here/check-drizzle-and-catalog.mts" --repo "$repo" --database-url "$base/${tag}_a" > "$cross"
common=(--pg-from "$repo/packages/db" --migrations "$repo/packages/db/migrations" --dictionary "$repo/docs/product/data-dictionary.md"
        --areas "$here/areas.json" --explanations "$here/divergence-explanations.json"
        --commit "$(git -C "$repo" rev-parse HEAD)" --branch "$(git -C "$repo" branch --show-current)" --append "$cross" --strict)
node "$here/generate-domain-model.mjs" --database-url "$base/${tag}_a" "${common[@]}" --out "$out"
node "$here/generate-domain-model.mjs" --database-url "$base/${tag}_b" "${common[@]}" --check "$out" ${REQUIRE_APPROVAL:+--require-approval}
rm -f "$cross"
