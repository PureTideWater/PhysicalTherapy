#!/usr/bin/env bash
# Makes the synthetic signing keys and signed git objects that tools/check-action-pins/age.test.ts reads (docs/adr/0066,
# Part 5; design §5). Run once, by hand, from any directory; its outputs are committed and the tests never run it:
#   bash tools/check-action-pins/testdata/age/make.sh
# Nothing here is GitHub's: three throwaway ed25519 keys with made-up names stand in for web-flow's current key, its
# retired (expired) one, and a key nobody trusts. Only their public halves are written out; the private keys live in a
# throwaway GNUPGHOME that is killed and deleted on exit.
#
# GNUPGHOME is short (mktemp under /tmp): gpg-agent binds a socket inside it, and a path longer than sun_path's 108
# bytes gives "No agent running". gpg refuses to sign with an expired key, so the retired key is made with no expiry,
# signs one commit 10 days and one 40 days after it was made, and only then gets an expiry 30 days after it was made,
# through a self-signature dated one day after it was made (newer than its first, so it is the one gpg reads): one
# signature precedes the expiry and one follows it. Every time is faked (--faked-system-time), so a rerun makes the same
# keys' dates, though new keys and signatures (ed25519 keys are random).
set -euo pipefail

out="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
home="$(mktemp -d /tmp/gh.XXXXXX)"
repo="$(mktemp -d /tmp/gr.XXXXXX)"
chmod 700 "$home"
cleanup() {
  gpgconf --homedir "$home" --kill all >/dev/null 2>&1 || true
  rm -rf "$home" "$repo"
}
trap cleanup EXIT
export GNUPGHOME="$home" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

made=1735689600       # 2025-01-01T00:00:00Z: every key is made then
day=86400
signed=1748736000     # 2025-06-01T00:00:00Z: the current and the unknown key sign then
tagged=$((signed + 9 * day))
expires=$((made + 30 * day))

gpg_at() {
  local at="$1"
  shift
  gpg --batch --quiet --pinentry-mode loopback --passphrase '' --faked-system-time "${at}!" "$@"
}

key() {
  gpg_at "$made" --quick-gen-key "$1" ed25519 sign never
  gpg --batch --with-colons --list-keys "$1" | awk -F: '$1 == "fpr" { print $10; exit }'
}

current="$(key 'Synthetic current signer <current-signer@example.invalid>')"
retired="$(key 'Synthetic retired signer <retired-signer@example.invalid>')"
unknown="$(key 'Synthetic unknown signer <unknown-signer@example.invalid>')"

# git signs through this wrapper, which fakes gpg's clock to the commit's own time.
cat >"$repo/gpg-at" <<'WRAP'
#!/usr/bin/env bash
exec gpg --faked-system-time "${SIGN_AT}!" "$@"
WRAP
chmod +x "$repo/gpg-at"
git init --quiet "$repo/r"
git -C "$repo/r" config gpg.program "$repo/gpg-at"

# One empty commit, signed by a key at a time (author, committer and signature all at that time); prints its SHA.
commit() {
  local fingerprint="$1" at="$2" message="$3"
  SIGN_AT="$at" GIT_AUTHOR_DATE="@$at +0000" GIT_COMMITTER_DATE="@$at +0000" \
    GIT_AUTHOR_NAME='Synthetic' GIT_AUTHOR_EMAIL='synthetic@example.invalid' \
    GIT_COMMITTER_NAME='Synthetic' GIT_COMMITTER_EMAIL='synthetic@example.invalid' \
    git -C "$repo/r" commit --quiet --allow-empty -S"$fingerprint" -m "$message"
  git -C "$repo/r" rev-parse HEAD
}

signed_commit="$(commit "$current" "$signed" 'signed by the current key')"
unknown_commit="$(commit "$unknown" "$signed" 'signed by a key nobody trusts')"
before_commit="$(commit "$retired" "$((made + 10 * day))" 'signed by the retired key before its expiry')"
after_commit="$(commit "$retired" "$((made + 40 * day))" 'signed by the retired key after its expiry')"

# An annotated tag of the signed commit, made nine days after it.
GIT_COMMITTER_DATE="@$tagged +0000" GIT_COMMITTER_NAME='Synthetic' GIT_COMMITTER_EMAIL='synthetic@example.invalid' \
  git -C "$repo/r" tag --annotate --message 'v1.2.3' v1.2.3 "$signed_commit"
tag_object="$(git -C "$repo/r" rev-parse refs/tags/v1.2.3)"

# Only now does the retired key expire: a self-signature dated a day after the key was made sets it.
gpg_at "$((made + day))" --quick-set-expire "$retired" "$(date -u -d "@$expires" +%Y%m%dT%H%M%S)"

rm -f "$out"/*.commit "$out"/*.tag
for object in "signed:$signed_commit:commit" "unknown:$unknown_commit:commit" "retired-before:$before_commit:commit" "retired-after:$after_commit:commit" "v1.2.3:$tag_object:tag"; do
  IFS=: read -r name sha type <<<"$object"
  git -C "$repo/r" cat-file "$type" "$sha" >"$out/$name.$type"
done
gpg --batch --armor --export-options export-minimal --export "$current" "$retired" >"$out/keys.asc"
{
  echo "# Written by make.sh: the synthetic keys' primary fingerprints, the retired key's expiry, and each object's SHA."
  echo "current $current"
  echo "retired $retired"
  echo "unknown $unknown"
  echo "retired-expires $(date -u -d "@$expires" +%Y-%m-%dT%H:%M:%SZ)"
  echo "signed.commit $signed_commit"
  echo "unknown.commit $unknown_commit"
  echo "retired-before.commit $before_commit"
  echo "retired-after.commit $after_commit"
  echo "v1.2.3.tag $tag_object"
} >"$out/made.txt"
echo "make.sh: wrote $(ls "$out" | grep -v make.sh | tr '\n' ' ')"
