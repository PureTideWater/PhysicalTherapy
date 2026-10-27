#!/usr/bin/env bash
# Rebuilds the PaidWhole build machine in a fresh Claude Code cloud container, exactly as the build session of
# 2026-10-14 to 2026-10-21 had it, so HANDOFF.md's commands work unchanged. Run it as root at the start of a session.
#
#   bash tools/setup-container.sh [branch[:dir] ...]
#
# Each argument is an open branch (co-001/pr-06b-zip4, ...) that gets a worktree: co-001/pr-NN<x>-... goes to
# /home/user/prN<x> (leading zeros dropped), any other branch to /home/user/<last path part>; ":dir" overrides that.
#
# A fresh run takes several minutes: it downloads about 100 MB and fills the 1.2 GB pnpm store through the proxy.
# From Claude Code's Bash tool, run it with run_in_background: true (or timeout: 600000), read the summary when it
# finishes, and run it again until it prints OK. A run cut off part-way is safe to repeat: every part is built beside
# its final path (<path>.tmp.<pid>) and moved into place only when complete, and the next run removes what a cut-off
# run left. Only one run at a time (a lock in /tmp/setup-container).
#
# A second run installs nothing that is in place, but it is not read-only: it fetches origin, fast-forwards branches
# that are behind, and runs pnpm install where node_modules do not match pnpm-lock.yaml. While agents are working in
# the worktrees, use SETUP_CHECK=1.
#
# What it does, each part only when it is missing, each checked by version and against pinned hashes:
#   - PostgreSQL 18.4 in /opt/pg18 from the npm package @embedded-postgres/linux-x64@18.4.0-beta.17 (tarball kept in
#     /opt/pg18-dl, unpacked in /opt/pg18-extract, pg-symlinks.json applied); the tree is compared file for file with
#     the tarball. Cluster /root/pgdata18, superuser postgres:test, trust on the /tmp socket, scram-sha-256 on
#     localhost, port 5433.
#   - PostgreSQL 16 from the Ubuntu archive (/usr/lib/postgresql/16); cluster /root/pgdata, scram-sha-256, port 5432.
#     The build had postgresql-16 16.15-0ubuntu0.24.04.1; another version is reported as a note.
#   - Node v24.22.0 in /opt/node24 from the npm package node-linux-x64@24.22.0, the source of the build's /opt/node24
#     (tarball kept in /opt/node24-dl, unpacked in /opt/node24-extract); the tree is compared file for file with it.
#   - Two Python venvs, each holding exactly pyx12 4.0.0 and defusedxml 0.7.1 (installed by hash from PyPI) and the
#     interpreter's own pip: /opt/py312-ci (Python 3.12, as CI; pip 24.0) and /root/.venvs/tp-oracle (Python 3.13, the
#     base image's /usr/bin/python3.13; pip 26.2.1), the path tools/test-oracle/README.md and older briefs use.
#   - actionlint 1.7.7 in /opt/actionlint (on PATH as /usr/local/bin/actionlint), checked against the release's
#     checksums file and a pinned SHA-256.
#   - gitleaks through the repository's own tools/gitleaks/install.sh (/root/.cache/paidwhole/gitleaks/<version>/),
#     also linked at /tmp/claude-0/gitleaks/gitleaks, the path older briefs use, when /tmp/claude-0 exists.
#   - pnpm 10.34.8, package.json's packageManager version, from the npm registry in /opt/pnpm-10.34.8 (pinned SHA-256
#     and SHA-512; the SHA-512 must also equal packageManager's +sha512), compared file for file with its tarball and
#     linked at /opt/pnpm-bin/pnpm, which every install here runs first on PATH. The base image's pnpm (10.28.0 in
#     /opt/node22/bin) is left alone; it switches to packageManager's version by itself. To run the pinned one in a
#     shell: export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH.
#   - Playwright's Chromium for the version the repository pins (apps/web/package.json), and for the version each
#     branch argument's worktree pins once its install is done (ci-browser's 1.64.1 needs 1248): the base image's builds in
#     PLAYWRIGHT_BROWSERS_PATH when present, else laid out from Google's Chrome for Testing bucket, each zip checked
#     against a pinned SHA-256 (CFT_BUILDS below: revision 1194 for Playwright 1.56.1, 1248 for 1.64.1), because the
#     cloud proxy refuses Playwright's own download hosts.
#   - Starts both servers with HANDOFF's commands and waits until each answers a query.
#   - Clones the repository to /home/user/PhysicalTherapy if absent, checks out claude/build-platform (fast-forwarding
#     it when behind), installs the pre-push hook, runs pnpm install --frozen-lockfile with Node 24 first on PATH, adds
#     the ops worktree /home/user/ops (claude/build-ops) and one worktree per branch argument (each with pnpm install).
#     Branches are fetched by name, so a clone whose fetch refspec is narrower than refs/heads/* works too.
#   - Prints one line per part with its version, then OK, or FAILED and exactly what failed (exit status 1).
#
# Environment:
#   SETUP_CHECK=1   change nothing: no download, install, start, fetch or write; report what is present and current.
#   SETUP_PREFIX    put every path above under this directory instead of / (for testing; the distro packages, the
#                   interpreters, the pnpm store and the socket directory stay where they are). The postgres user
#                   must be able to enter it.
#   PG18_PORT, PG16_PORT (5433, 5432); PG16_SKIP=1 leaves PostgreSQL 16 alone; PG_SOCKET_DIR (/tmp).
#   CLONE_DIR, OPS_DIR, WORKTREE_ROOT (/home/user/PhysicalTherapy, /home/user/ops, /home/user), REPO_URL.
#   ACTIONLINT      with SETUP_CHECK=1, the actionlint binary to check instead of /opt/actionlint/actionlint.
set -uo pipefail
umask 022

usage() { sed -n '2,/^set -uo/{/^set -uo/d;s/^# \{0,1\}//;p}' "$0"; }
case "${1:-}" in -h | --help) usage; exit 0 ;; esac

# ---- pins ------------------------------------------------------------------------------------------------------
PG18_VERSION=18.4
PG18_NPM=@embedded-postgres/linux-x64
PG18_NPM_VERSION=18.4.0-beta.17
PG18_TGZ=embedded-postgres-linux-x64-18.4.0-beta.17.tgz
PG18_TGZ_SHA256=795d587bb466423385db256dc81e61f2ee40c9e10efde21e881f3e997dd1bdb2
PG18_TGZ_SHA512=sha512-jVw/MdDtIX/vICH/DKIe6/mHpiCggdx6QVyza4vt/NbcZFsL0KhwglF6F1Koqx3gRBZ9XtN+vi63EsqSyqOSxA==
PG16_DEB=16.15-0ubuntu0.24.04.1
NODE_VERSION=24.22.0
NODE_NPM=node-linux-x64
NODE_TGZ=node-linux-x64-24.22.0.tgz
NODE_TGZ_SHA256=eb2df9d66e51377d2812bab13836d5c43426f2541814e783ca1fcf34d9893467
NODE_TGZ_SHA512=sha512-O8CHD5heFxunkgkYr3y7DADTb73UQBiWe4hD2xxLbxyYyKP/+ZFfexX+W5cuswtxOcgtrGSKrU2JhzATGgzFPA==
# pnpm@10.34.8 (published 2026-10-23T18:06:37Z by GitHub Actions as a trusted publisher): the SHA-512 is the registry's
# integrity, and the same digest in hex is package.json's packageManager pnpm@10.34.8+sha512.f627a8e9...
PNPM_VERSION=10.34.8
PNPM_TGZ=pnpm-10.34.8.tgz
PNPM_TGZ_SHA256=5be9fac9764583af5fa07015b9b0aa930ef634535df9fa6f464020d72b195630
PNPM_TGZ_SHA512=sha512-9ieo6XE0Ov5J39D2PQKCNCAd+oMdXLWIcz4eX42ya/FpiaMhYatcG02zsf28NzFgYGtbieAC323RmoWt+R/FqA==
PYX12_VERSION=4.0.0
DEFUSEDXML_VERSION=0.7.1
PY_REQUIREMENTS="pyx12==4.0.0 --hash=sha256:8e983b5a3a76a307bea3be9203fb32f0ea1580e13cb66ed60d8b028dc015d1cc --hash=sha256:d45c572e19971f7f67d65227bc7da158b01179ece2947a7038412dd935c59660
defusedxml==0.7.1 --hash=sha256:a352e7e428770286cc899e2542b6cdaedb2b4953ff269a210103ec58f6198a61 --hash=sha256:1bb3032db185915b62d7c6209c5a8792be6a32ab2fedacc84e01b52c51aa3e69"
ACTIONLINT_VERSION=1.7.7
ACTIONLINT_TGZ=actionlint_1.7.7_linux_amd64.tar.gz
ACTIONLINT_TGZ_SHA256=023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757
ACTIONLINT_BASE=https://github.com/rhysd/actionlint/releases/download/v1.7.7
PG_PASSWORD='test'
BASE_BRANCH=claude/build-platform
OPS_BRANCH=claude/build-ops

# ---- settings --------------------------------------------------------------------------------------------------
P="${SETUP_PREFIX:-}"
P="${P%/}"
CHECK="${SETUP_CHECK:-0}"
PG18_PORT="${PG18_PORT:-5433}"
PG16_PORT="${PG16_PORT:-5432}"
PG16_SKIP="${PG16_SKIP:-0}"
SOCK="${PG_SOCKET_DIR:-/tmp}"
REPO_URL="${REPO_URL:-https://github.com/PureTideWater/PhysicalTherapy}"
CLONE_DIR="${CLONE_DIR:-$P/home/user/PhysicalTherapy}"
OPS_DIR="${OPS_DIR:-$P/home/user/ops}"
WORKTREE_ROOT="${WORKTREE_ROOT:-$P/home/user}"
PG18_DIR="$P/opt/pg18"
PG18_DATA="$P/root/pgdata18"
PG18_LOG="$P/tmp/pg18.log"
PG16_BIN=/usr/lib/postgresql/16/bin
PG16_DATA="$P/root/pgdata"
PG16_LOG="$P/tmp/pg16.log"
NODE_DIR="$P/opt/node24"
PY312_DIR="$P/opt/py312-ci"
ORACLE_DIR="$P/root/.venvs/tp-oracle"
PNPM_DIR="$P/opt/pnpm-$PNPM_VERSION"
PNPM_BIN="$P/opt/pnpm-bin"
PNPM_LINK="$PNPM_BIN/pnpm"
ACTIONLINT_DIR="$P/opt/actionlint"
ACTIONLINT_LINK="$P/usr/local/bin/actionlint"
CACHE_HOME="$P/root/.cache"
LEGACY_GITLEAKS_PARENT="$P/tmp/claude-0"
LOG_DIR="$P/tmp/setup-container"
# The PATH pnpm and the installs run with: Node 24 first, then the pinned pnpm (and, under a prefix, the prefix's
# /usr/local/bin).
if [ -n "$P" ]; then RUN_PATH="$NODE_DIR/bin:$PNPM_BIN:$P/usr/local/bin:$PATH"; else RUN_PATH="$NODE_DIR/bin:$PNPM_BIN:$PATH"; fi
BRANCH_ARGS=()
for arg in "$@"; do BRANCH_ARGS+=("${arg%%:*}"); done

LINES=()
FAILED=()
REFUSED=()
TMPS=()
ERR=""
INIT_NOTE=""
OK_PG18=0 OK_PG16=0 OK_NODE=0 OK_CLONE=0 OK_MODULES=0

line() { # status part version detail
  LINES+=("$(printf '%-5s %-16s %-11s %s' "$1" "$2" "$3" "$4")")
  if [ "$1" = FAIL ]; then FAILED+=("$2: $4"); fi
}
log() { printf 'setup-container: %s\n' "$*" >&2; }
checking() { [ "$CHECK" = 1 ]; }
sha256() { sha256sum "$1" | awk '{ print $1 }'; }
sri512() { python3 -I -c 'import base64, hashlib, sys
h = hashlib.sha512()
with open(sys.argv[1], "rb") as f:
    for chunk in iter(lambda: f.read(1 << 20), b""):
        h.update(chunk)
print("sha512-" + base64.b64encode(h.digest()).decode())' "$1"; }
json_get() { python3 -I -c 'import json, sys
d = json.load(sys.stdin)
for k in sys.argv[1].split("."):
    d = d[k]
print(d)' "$1"; }
# Commands run as postgres never get fd 9 (the run lock), so a server they start cannot hold it.
as_pg() { (cd / && runuser -u postgres -- "$@") 9>&-; }
pg_can_reach() { as_pg test -x "$1" 2>/dev/null; }
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
host_of() { local h="${1#*://}"; printf '%s' "${h%%/*}"; }
psql_bin() {
  if [ -x "$PG16_BIN/psql" ]; then printf '%s' "$PG16_BIN/psql"; else command -v psql 2>/dev/null; fi
}
tail_of() { tail -n "${2:-5}" "$1" 2>/dev/null | tr '\n' ' ' | cut -c1-400; }
# sweep PATH: removes PATH.tmp.* that a cut-off earlier run left (only outside check mode, under the run lock).
sweep() {
  local p
  for p in "$1".tmp.*; do
    if [ -e "$p" ] || [ -L "$p" ]; then log "removing $p, left by a run that was cut off"; rm -rf "$p"; fi
  done
}
cleanup() { if [ "${#TMPS[@]}" -gt 0 ]; then rm -rf "${TMPS[@]}"; fi; }

if [ "$(id -u)" != 0 ]; then
  echo "setup-container: run this as root (it installs into /opt, runs apt-get and starts PostgreSQL as postgres)." >&2
  exit 1
fi
if checking; then
  export GIT_OPTIONAL_LOCKS=0
else
  mkdir -p "$LOG_DIR"
  exec 9>>"$LOG_DIR/lock"
  if ! command -v flock >/dev/null; then
    log "no flock on this machine, so nothing stops a second run at the same time; do not start one"
  elif ! flock -n 9; then
    echo "setup-container: another run of this script holds $LOG_DIR/lock; let it finish, then run again." >&2
    exit 1
  fi
  # Git's automatic gc would otherwise detach into the background still holding fd 9. Added after the
  # GIT_CONFIG_* entries the environment already sets (the cloud container sets three).
  GC_N="${GIT_CONFIG_COUNT:-0}"
  export "GIT_CONFIG_KEY_$GC_N=gc.autoDetach" "GIT_CONFIG_VALUE_$GC_N=false" "GIT_CONFIG_COUNT=$((GC_N + 1))"
fi
trap cleanup EXIT

# fetch URL DEST: downloads through the proxy; on failure sets ERR, and records a host the proxy refused.
fetch() {
  local url="$1" dest="$2" out
  if out="$(curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 1200 -o "$dest.part" "$url" 2>&1)"; then
    mv -f "$dest.part" "$dest"
    return 0
  fi
  rm -f "$dest.part"
  ERR="could not download $url: $(printf '%s' "$out" | tail -n 1)"
  # With -f, curl reports the proxy's 403 to CONNECT as "returned error: 403", like a server's own 403; the
  # proxy's status page names the hosts it refused, so ask it which this was.
  case "$out" in
    *"response 403"* | *"response 407"* | *"error: 403"* | *"error: 407"*)
      if proxy_refused "$(host_of "$url")"; then
        REFUSED+=("$(host_of "$url")")
        ERR="the proxy refused $(host_of "$url") (403 to CONNECT)"
      fi
      ;;
  esac
  return 1
}
proxy_refused() { # the agent proxy's status lists a refused CONNECT to host $1
  [ -n "${HTTPS_PROXY:-}" ] || return 1
  curl -fsS --max-time 10 "$HTTPS_PROXY/__agentproxy/status" 2>/dev/null | python3 -I -c 'import json, sys
host = sys.argv[1]
d = json.load(sys.stdin)
sys.exit(0 if any(f.get("host") == host + ":443" and f.get("kind") == "connect_rejected" for f in d.get("recentRelayFailures", [])) else 1)' "$1"
}

# npm_tarball NAME VERSION DEST SHA256 SRI: the registry tarball of NAME@VERSION at DEST, its SHA-512 equal to the
# registry's integrity and to SRI, its SHA-256 equal to SHA256. A DEST already there that matches is reused; one
# that does not match is downloaded again.
npm_tarball() {
  local name="$1" version="$2" dest="$3" want256="$4" want512="$5" meta url integrity
  if [ -f "$dest" ]; then
    if [ "$(sha256 "$dest")" = "$want256" ] && [ "$(sri512 "$dest")" = "$want512" ]; then return 0; fi
    log "$dest does not match its pinned SHA-256 and SHA-512; downloading it again"
  fi
  mkdir -p "$(dirname "$dest")"
  if ! meta="$(curl -fsS --retry 3 --connect-timeout 20 --max-time 120 "https://registry.npmjs.org/${name/\//%2f}/$version" 2>&1)"; then
    ERR="could not read $name@$version from registry.npmjs.org: $(printf '%s' "$meta" | tail -n 1)"
    return 1
  fi
  url="$(printf '%s' "$meta" | json_get dist.tarball 2>/dev/null)"
  integrity="$(printf '%s' "$meta" | json_get dist.integrity 2>/dev/null)"
  if [ "$integrity" != "$want512" ]; then
    ERR="registry.npmjs.org gives $name@$version the integrity '$integrity', not the pinned $want512; nothing installed"
    return 1
  fi
  fetch "$url" "$dest" || return 1
  if [ "$(sri512 "$dest")" != "$want512" ] || [ "$(sha256 "$dest")" != "$want256" ]; then
    ERR="$url has SHA-256 $(sha256 "$dest"), not the pinned $want256 (or its SHA-512 differs); refused, nothing installed"
    rm -f "$dest"
    return 1
  fi
}

# symlinks DIR MODE: compares DIR (an unpacked native/ directory) with its pg-symlinks.json, as the package's own
# scripts/hydrate-symlinks.js would make them (relative to the source's directory). MODE apply creates the missing
# ones; both modes print each link that is missing or points elsewhere, so empty output means all are in place.
symlinks() {
  python3 -I -c 'import json, os, sys
root, mode = sys.argv[1], sys.argv[2]
def native(p):
    return p[len("native/"):] if p.startswith("native/") else p
with open(os.path.join(root, "pg-symlinks.json")) as f:
    items = json.load(f)
for item in items:
    source, target = native(item["source"]), native(item["target"])
    base = os.path.dirname(source)
    want = os.path.relpath(source, base)
    link = os.path.join(root, base, os.path.relpath(target, base))
    if os.path.islink(link) and os.readlink(link) == want:
        continue
    if mode == "apply" and not os.path.lexists(link):
        os.symlink(want, link)
        continue
    print(target, end=" ")' "$1" "$2"
}

# tree_check TGZ PREFIX DIR LINKS: compares DIR file for file with the members of TGZ under PREFIX (contents, sizes,
# modes, symlink targets), and reports anything in DIR the tarball does not have, except, with LINKS=1, the links
# pg-symlinks.json lists. Prints "ok <files>" or the differences. Reads only.
tree_check() {
  python3 -I -c 'import hashlib, json, os, stat, sys, tarfile
tgz, prefix, root, links = sys.argv[1:5]
def digest(f):
    h = hashlib.sha256()
    for chunk in iter(lambda: f.read(1 << 20), b""):
        h.update(chunk)
    return h.hexdigest()
bad, seen, files = [], set(), 0
with tarfile.open(tgz, "r:gz") as t:
    for m in t:
        if not m.name.startswith(prefix):
            continue
        rel = m.name[len(prefix):].strip("/")
        if not rel:
            continue
        p = rel
        while p:
            seen.add(p)
            p = os.path.dirname(p)
        path = os.path.join(root, rel)
        if not os.path.lexists(path):
            bad.append("missing " + rel)
            continue
        st = os.lstat(path)
        if m.isfile():
            files += 1
            if not stat.S_ISREG(st.st_mode) or st.st_size != m.size or stat.S_IMODE(st.st_mode) != stat.S_IMODE(m.mode):
                bad.append("differs " + rel)
                continue
            with t.extractfile(m) as a, open(path, "rb") as b:
                if digest(a) != digest(b):
                    bad.append("differs " + rel)
        elif m.isdir():
            if not stat.S_ISDIR(st.st_mode):
                bad.append("differs " + rel)
        elif m.issym():
            if not stat.S_ISLNK(st.st_mode) or os.readlink(path) != m.linkname:
                bad.append("differs " + rel)
        else:
            bad.append("unexpected tar member " + rel)
allowed = set()
if links == "1":
    with open(os.path.join(root, "pg-symlinks.json")) as f:
        for item in json.load(f):
            target = item["target"]
            allowed.add(target[len("native/"):] if target.startswith("native/") else target)
for dirpath, dirnames, filenames in os.walk(root):
    for name in dirnames + filenames:
        rel = os.path.relpath(os.path.join(dirpath, name), root)
        if rel not in seen and rel not in allowed:
            bad.append("extra " + rel)
if bad:
    print(", ".join(bad[:8]) + (" and %d more" % (len(bad) - 8) if len(bad) > 8 else ""))
else:
    print("ok %d" % files)' "$1" "$2" "$3" "$4" 2>&1
}

# tree_against NAME VERSION TGZ SHA256 SRI PREFIX DIR LINKS: DIR compared with the pinned tarball TGZ (tree_check).
# Outside check mode a missing or mismatched TGZ is downloaded again first. Sets TREE, or ERR and returns 1.
tree_against() {
  local name="$1" version="$2" tgz="$3" want256="$4" want512="$5" prefix="$6" dir="$7" links="$8" out
  if checking; then
    if [ ! -f "$tgz" ]; then ERR="no $tgz to compare $dir with; run without SETUP_CHECK to download it again"; return 1; fi
    if [ "$(sha256 "$tgz")" != "$want256" ] || [ "$(sri512 "$tgz")" != "$want512" ]; then
      ERR="$tgz does not match its pinned SHA-256 and SHA-512; run without SETUP_CHECK, which downloads it again"
      return 1
    fi
  else
    npm_tarball "$name" "$version" "$tgz" "$want256" "$want512" || return 1
  fi
  out="$(tree_check "$tgz" "$prefix" "$dir" "$links")"
  case "$out" in
    "ok "*) TREE="${out#ok } files match $(basename "$tgz") (pinned SHA-256 and SHA-512)" ;;
    *) ERR="$dir differs from $(basename "$tgz"): $out; move $dir aside and run again"; return 1 ;;
  esac
}

# ---- PostgreSQL 18 ---------------------------------------------------------------------------------------------
step_pg18() {
  local dir="$PG18_DIR" dl="$P/opt/pg18-dl" ex="$P/opt/pg18-extract" tgz v bad how="present" links
  tgz="$dl/$PG18_TGZ"
  if [ ! -x "$dir/bin/postgres" ]; then
    if checking; then line FAIL pg18 - "missing: no $dir/bin/postgres"; return 1; fi
    if [ -e "$dir" ]; then line FAIL pg18 - "$dir exists without bin/postgres; move it aside and run again"; return 1; fi
    log "installing PostgreSQL $PG18_VERSION ($PG18_NPM@$PG18_NPM_VERSION) into $dir"
    npm_tarball "$PG18_NPM" "$PG18_NPM_VERSION" "$tgz" "$PG18_TGZ_SHA256" "$PG18_TGZ_SHA512" || { line FAIL pg18 - "$ERR"; return 1; }
    sweep "$dir"
    TMPS+=("$dir.tmp.$$")
    rm -rf "$ex"
    mkdir -p "$ex"
    if ! tar -xzf "$tgz" -C "$ex" || [ ! -x "$ex/package/native/bin/postgres" ]; then
      line FAIL pg18 - "$tgz did not unpack to package/native/bin/postgres"
      return 1
    fi
    cp -a "$ex/package/native" "$dir.tmp.$$" || { line FAIL pg18 - "could not copy the binaries to $dir.tmp.$$"; return 1; }
    bad="$(symlinks "$dir.tmp.$$" apply 2>&1)"
    if [ -n "$bad" ]; then line FAIL pg18 - "could not make the pg-symlinks.json links: $bad"; return 1; fi
    mv -T "$dir.tmp.$$" "$dir" || { line FAIL pg18 - "could not move the binaries to $dir"; return 1; }
    how="installed from $PG18_NPM@$PG18_NPM_VERSION"
  fi
  # The links come first: postgres needs libicu*.so.60, which exist only as links from pg-symlinks.json.
  links="pg-symlinks.json links in place"
  bad="$(symlinks "$dir" check 2>&1)"
  if [ -n "$bad" ] && ! checking; then
    links="made the missing pg-symlinks.json links ($bad)"
    bad="$(symlinks "$dir" apply 2>&1)"
  fi
  if [ -n "$bad" ]; then line FAIL pg18 - "pg-symlinks.json links missing or wrong in $dir: $bad"; return 1; fi
  v="$("$dir/bin/postgres" --version 2>&1)"
  if [ "$v" != "postgres (PostgreSQL) $PG18_VERSION" ]; then line FAIL pg18 - "$dir/bin/postgres reports '$v', not $PG18_VERSION; move $dir aside and run again"; return 1; fi
  tree_against "$PG18_NPM" "$PG18_NPM_VERSION" "$tgz" "$PG18_TGZ_SHA256" "$PG18_TGZ_SHA512" package/native/ "$dir" 1 || { line FAIL pg18 "$PG18_VERSION" "$ERR"; return 1; }
  line ok pg18 "$PG18_VERSION" "$dir ($how; $links; $TREE)"
  OK_PG18=1
}

# ---- PostgreSQL 16 ---------------------------------------------------------------------------------------------
step_pg16() {
  local v pkg how="present"
  if [ "$PG16_SKIP" = 1 ]; then line skip pg16 - "PG16_SKIP=1"; return 0; fi
  if [ ! -x "$PG16_BIN/postgres" ]; then
    if checking; then line FAIL pg16 - "missing: no $PG16_BIN/postgres"; return 1; fi
    log "installing postgresql-16 from the Ubuntu archive"
    if ! { apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-16; } >"$LOG_DIR/apt-postgresql-16.log" 2>&1; then
      line FAIL pg16 - "apt-get install postgresql-16 failed: $(tail_of "$LOG_DIR/apt-postgresql-16.log" 3)"
      return 1
    fi
    # The package makes its own cluster 16/main (the base image has one too); the build uses /root/pgdata instead.
    if command -v pg_lsclusters >/dev/null && pg_lsclusters 16 main 2>/dev/null | grep -q online; then
      pg_ctlcluster 16 main stop >/dev/null 2>&1 || true
    fi
    how="installed from the Ubuntu archive"
  fi
  v="$("$PG16_BIN/postgres" --version 2>&1)"
  case "$v" in "postgres (PostgreSQL) 16."*) ;; *) line FAIL pg16 - "$PG16_BIN/postgres reports '$v', not 16.x"; return 1 ;; esac
  v="${v#postgres (PostgreSQL) }"
  pkg="$(dpkg-query -W -f '${Version}' postgresql-16 2>/dev/null || true)"
  line ok pg16 "${v%% *}" "$PG16_BIN ($how; distro package postgresql-16 ${pkg:-?})"
  if [ "$pkg" != "$PG16_DEB" ]; then
    line note pg16 "${v%% *}" "the build had postgresql-16 $PG16_DEB; this machine has ${pkg:-no dpkg record} (the Ubuntu archive offers only its newest 16.x)"
  fi
  OK_PG16=1
}

# ---- servers ---------------------------------------------------------------------------------------------------
# init_cluster NAME BINDIR DATA CONF INITDB-ARGS...: an empty cluster at DATA, owned by postgres, superuser
# postgres:test, with CONF appended to its postgresql.conf. It is made at DATA.tmp.<pid> and moved to DATA only when
# initdb and the append have both succeeded, so DATA/PG_VERSION exists only for a complete cluster.
init_cluster() {
  local name="$1" bindir="$2" data="$3" conf="$4" pw out parent tmp
  shift 4
  parent="$(dirname "$data")"
  tmp="$data.tmp.$$"
  if [ -d "$data" ] && [ ! -L "$data" ]; then
    rmdir "$data" 2>/dev/null || { ERR="$data exists without PG_VERSION and is not empty; move it aside and run again"; return 1; }
  elif [ -e "$data" ] || [ -L "$data" ]; then
    ERR="$data exists and is not a cluster directory; move it aside and run again"
    return 1
  fi
  sweep "$data"
  TMPS+=("$tmp")
  mkdir -p "$tmp" && chown postgres:postgres "$tmp" && chmod 700 "$tmp" || { ERR="could not create $tmp"; return 1; }
  # The clusters live in root's home, as they do now; /root is 0755 on the build machine, so postgres can reach them.
  if [ "$parent" = "$P/root" ] && ! pg_can_reach "$parent"; then chmod 755 "$parent"; INIT_NOTE="; $parent set to 0755 so postgres can reach it"; fi
  if ! pg_can_reach "$bindir" || ! pg_can_reach "$tmp"; then
    ERR="the postgres user cannot reach $bindir or $tmp (a parent directory is not searchable by it)"
    return 1
  fi
  # The password file sits in the log directory under a .tmp. name, so a cut-off run's copy is swept like the rest.
  pw="$LOG_DIR/initdb-pw.tmp.$$"
  sweep "$LOG_DIR/initdb-pw"
  TMPS+=("$pw")
  (umask 077 && printf '%s\n' "$PG_PASSWORD" >"$pw") && chown postgres "$pw" || { ERR="could not write the password file $pw"; return 1; }
  out="$LOG_DIR/initdb-$name.log"
  if ! as_pg "$bindir/initdb" -D "$tmp" -U postgres --pwfile="$pw" --encoding=UTF8 "$@" >"$out" 2>&1; then
    rm -f "$pw"
    ERR="initdb failed: $(tail_of "$out" 3)"
    return 1
  fi
  rm -f "$pw"
  if [ -n "$conf" ] && ! printf '%s' "$conf" >>"$tmp/postgresql.conf"; then
    ERR="could not add the port and socket settings to $tmp/postgresql.conf"
    return 1
  fi
  mv -T "$tmp" "$data" || { ERR="could not move the new cluster $tmp to $data"; return 1; }
}

# start_server NAME BINDIR DATA PORT LOGFILE: HANDOFF's command (pg_ctl -D DATA -o '-p PORT -k /tmp' -l LOG start,
# as postgres), unless the server already runs; then waits until it answers a query.
start_server() {
  local name="$1" bindir="$2" data="$3" port="$4" logfile="$5" running_port
  if as_pg "$bindir/pg_ctl" -D "$data" status >/dev/null 2>&1; then
    running_port="$(sed -n 4p "$data/postmaster.pid" 2>/dev/null)"
    if [ "$running_port" != "$port" ]; then ERR="the cluster at $data already runs on port $running_port, not $port"; return 1; fi
    START_HOW="running"
  else
    if checking; then ERR="not running (start: su postgres -c \"$bindir/pg_ctl -D $data -o '-p $port -k $SOCK' -l $logfile start\")"; return 1; fi
    if port_busy "$port"; then ERR="port $port is taken by another process, so the cluster at $data cannot start"; return 1; fi
    mkdir -p "$(dirname "$logfile")"
    if [ "$(dirname "$logfile")" = "$P/tmp" ] && [ -n "$P" ]; then chmod 1777 "$P/tmp"; fi
    if ! as_pg "$bindir/pg_ctl" -D "$data" -o "-p $port -k $SOCK" -l "$logfile" -w -t 90 start >"$LOG_DIR/pg_ctl-$name.log" 2>&1; then
      ERR="pg_ctl start failed: $(tail_of "$LOG_DIR/pg_ctl-$name.log" 2) $(tail_of "$logfile" 3)"
      return 1
    fi
    START_HOW="started"
  fi
}

# ready PORT PASSWORD-OR-EMPTY DATA: SELECT version() over the socket, and SELECT 1 as postgres:test over TCP.
# Sets SERVER_VERSION to the server's version number.
ready() {
  local port="$1" sockpw="$2" data="$3" psql out
  psql="$(psql_bin)"
  if [ -z "$psql" ]; then
    if [ "$(sed -n 8p "$data/postmaster.pid" 2>/dev/null | tr -d ' ')" = ready ]; then SERVER_VERSION="?"; QUERY_NOTE="postmaster.pid says ready (no psql client to query it)"; return 0; fi
    ERR="no psql client to query it, and $data/postmaster.pid does not say ready"
    return 1
  fi
  for _ in $(seq 1 60); do
    if out="$(PGPASSWORD="$sockpw" PGCONNECT_TIMEOUT=5 "$psql" -X -h "$SOCK" -p "$port" -U postgres -d postgres -Atc 'SELECT version()' 2>&1)"; then
      SERVER_VERSION="$(printf '%s' "$out" | awk '{ print $2 }')"
      if PGPASSWORD="$PG_PASSWORD" PGCONNECT_TIMEOUT=5 "$psql" -X -h localhost -p "$port" -U postgres -d postgres -Atc 'SELECT 1' >/dev/null 2>&1; then
        QUERY_NOTE="SELECT version() over the $SOCK socket and postgres:$PG_PASSWORD over localhost answer"
        return 0
      fi
      ERR="answers on the $SOCK socket but postgres:$PG_PASSWORD over TCP on localhost:$port is refused"
      return 1
    fi
    checking && break
    sleep 1
  done
  ERR="does not answer on port $port: $(printf '%s' "$out" | tail -n 1)"
  return 1
}

step_pg18_server() {
  local made="" conf
  if [ "$OK_PG18" != 1 ]; then line FAIL pg18-server - "skipped: the pg18 part failed"; return 1; fi
  if [ ! -f "$PG18_DATA/PG_VERSION" ]; then
    if checking; then line FAIL pg18-server - "no cluster at $PG18_DATA"; return 1; fi
    if ! locale -a 2>/dev/null | grep -qix 'en_US.utf8'; then
      log "generating the en_US.UTF-8 locale"
      { command -v locale-gen >/dev/null || { apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q locales; }; } >"$LOG_DIR/locales.log" 2>&1
      locale-gen en_US.UTF-8 >>"$LOG_DIR/locales.log" 2>&1
      locale -a 2>/dev/null | grep -qix 'en_US.utf8' || { line FAIL pg18-server - "the en_US.UTF-8 locale the cluster uses is missing and could not be made: $(tail_of "$LOG_DIR/locales.log" 2)"; return 1; }
    fi
    log "creating the PostgreSQL 18 cluster $PG18_DATA (port $PG18_PORT)"
    printf -v conf "\n# tp: local PG18 cluster mirroring CI's postgres:18 service\nport = %s\nlisten_addresses = 'localhost'\nunix_socket_directories = '%s'\n" "$PG18_PORT" "$SOCK"
    # en_US.utf8, spelled as the build's cluster has it in postgresql.conf and pg_database.
    init_cluster pg18 "$PG18_DIR/bin" "$PG18_DATA" "$conf" --locale=en_US.utf8 --auth-local=trust --auth-host=scram-sha-256 || { line FAIL pg18-server - "$ERR"; return 1; }
    made="cluster created (initdb, superuser postgres:$PG_PASSWORD$INIT_NOTE), "
  fi
  if [ "$(cat "$PG18_DATA/PG_VERSION")" != 18 ]; then line FAIL pg18-server - "$PG18_DATA holds a PostgreSQL $(cat "$PG18_DATA/PG_VERSION") cluster, not 18"; return 1; fi
  if ! grep -qxF "port = $PG18_PORT" "$PG18_DATA/postgresql.conf" || ! grep -qxF "listen_addresses = 'localhost'" "$PG18_DATA/postgresql.conf" ||
    ! grep -qxF "unix_socket_directories = '$SOCK'" "$PG18_DATA/postgresql.conf"; then
    line FAIL pg18-server - "$PG18_DATA/postgresql.conf lacks the port = $PG18_PORT, listen_addresses and unix_socket_directories lines this script writes (a cluster creation cut off by an older version of it?); if it holds nothing you need, move it aside and run again"
    return 1
  fi
  start_server pg18 "$PG18_DIR/bin" "$PG18_DATA" "$PG18_PORT" "$PG18_LOG" || { line FAIL pg18-server - "$ERR"; return 1; }
  ready "$PG18_PORT" "" "$PG18_DATA" || { line FAIL pg18-server - "$ERR"; return 1; }
  if [ "$SERVER_VERSION" != "$PG18_VERSION" ] && [ "$SERVER_VERSION" != "?" ]; then line FAIL pg18-server "$SERVER_VERSION" "port $PG18_PORT answers as PostgreSQL $SERVER_VERSION, not $PG18_VERSION"; return 1; fi
  line ok pg18-server "$SERVER_VERSION" "$made$START_HOW: $PG18_DATA on port $PG18_PORT (trust on the socket); $QUERY_NOTE"
}

step_pg16_server() {
  local made=""
  if [ "$PG16_SKIP" = 1 ]; then line skip pg16-server - "PG16_SKIP=1"; return 0; fi
  if [ "$OK_PG16" != 1 ]; then line FAIL pg16-server - "skipped: the pg16 part failed"; return 1; fi
  if [ ! -f "$PG16_DATA/PG_VERSION" ]; then
    if checking; then line FAIL pg16-server - "no cluster at $PG16_DATA"; return 1; fi
    log "creating the PostgreSQL 16 cluster $PG16_DATA (port $PG16_PORT)"
    init_cluster pg16 "$PG16_BIN" "$PG16_DATA" "" --locale=C.UTF-8 --auth=scram-sha-256 || { line FAIL pg16-server - "$ERR"; return 1; }
    made="cluster created (initdb, superuser postgres:$PG_PASSWORD$INIT_NOTE), "
  fi
  if [ "$(cat "$PG16_DATA/PG_VERSION")" != 16 ]; then line FAIL pg16-server - "$PG16_DATA holds a PostgreSQL $(cat "$PG16_DATA/PG_VERSION") cluster, not 16"; return 1; fi
  start_server pg16 "$PG16_BIN" "$PG16_DATA" "$PG16_PORT" "$PG16_LOG" || { line FAIL pg16-server - "$ERR"; return 1; }
  ready "$PG16_PORT" "$PG_PASSWORD" "$PG16_DATA" || { line FAIL pg16-server - "$ERR"; return 1; }
  case "$SERVER_VERSION" in 16.* | "?") ;; *) line FAIL pg16-server "$SERVER_VERSION" "port $PG16_PORT answers as PostgreSQL $SERVER_VERSION, not 16"; return 1 ;; esac
  line ok pg16-server "$SERVER_VERSION" "$made$START_HOW: $PG16_DATA on port $PG16_PORT (scram-sha-256); $QUERY_NOTE"
}

# ---- Node ------------------------------------------------------------------------------------------------------
# Only the npm package: it is the exact source of the build's /opt/node24 (package.json included) and is pinned by
# SHA-256 and SHA-512. nodejs.org is not used: the proxy refuses it, and its SHASUMS256.txt would come from the same
# host, unpinned.
step_node() {
  local dir="$NODE_DIR" dl="$P/opt/node24-dl" ex="$P/opt/node24-extract" tgz v how="present"
  tgz="$dl/$NODE_TGZ"
  if [ ! -x "$dir/bin/node" ]; then
    if checking; then line FAIL node - "missing: no $dir/bin/node"; return 1; fi
    if [ -e "$dir" ]; then line FAIL node - "$dir exists without bin/node; move it aside and run again"; return 1; fi
    log "installing Node v$NODE_VERSION ($NODE_NPM@$NODE_VERSION) into $dir"
    npm_tarball "$NODE_NPM" "$NODE_VERSION" "$tgz" "$NODE_TGZ_SHA256" "$NODE_TGZ_SHA512" || { line FAIL node - "$ERR"; return 1; }
    sweep "$dir"
    TMPS+=("$dir.tmp.$$")
    rm -rf "$ex"
    mkdir -p "$ex"
    tar -xzf "$tgz" -C "$ex" && [ -x "$ex/package/bin/node" ] || { line FAIL node - "$tgz did not unpack to package/bin/node"; return 1; }
    cp -a "$ex/package" "$dir.tmp.$$" || { line FAIL node - "could not copy Node to $dir.tmp.$$"; return 1; }
    mv -T "$dir.tmp.$$" "$dir" || { line FAIL node - "could not move Node to $dir"; return 1; }
    how="installed from registry.npmjs.org $NODE_NPM@$NODE_VERSION"
  fi
  v="$("$dir/bin/node" --version 2>&1)"
  if [ "$v" != "v$NODE_VERSION" ]; then line FAIL node - "$dir/bin/node reports '$v', not v$NODE_VERSION; move $dir aside and run again"; return 1; fi
  tree_against "$NODE_NPM" "$NODE_VERSION" "$tgz" "$NODE_TGZ_SHA256" "$NODE_TGZ_SHA512" package/ "$dir" 0 || { line FAIL node "$v" "$ERR"; return 1; }
  line ok node "$v" "$dir ($how; $TREE)"
  OK_NODE=1
}

# ---- Python ----------------------------------------------------------------------------------------------------
# venv_part PART DIR PYTHON SERIES PIP APT: a venv at DIR made by PYTHON (Python SERIES.x), holding exactly pyx12 and
# defusedxml at their pins (installed by hash) and the interpreter's own pip (the build had PIP; another version is
# reported, not changed, since it comes with the interpreter). APT names the Ubuntu packages that provide PYTHON, or
# is empty when the archive has none. A venv this script began carries DIR/.setup-container-incomplete until it is
# complete; the next run removes such a venv and makes it again.
venv_part() {
  local part="$1" dir="$2" python="$3" series="$4" pipwant="$5" apt="$6" py mark pv have x extra="" pipv="" how="present" made=0 req note=""
  py="$dir/bin/python"
  mark="$dir/.setup-container-incomplete"
  if [ -e "$mark" ]; then
    if checking; then line FAIL "$part" - "$dir is a venv a cut-off run began; run without SETUP_CHECK to make it again"; return 1; fi
    log "removing $dir, a venv a cut-off run began"
    rm -rf "$dir"
  fi
  if [ ! -x "$py" ]; then
    if checking; then line FAIL "$part" - "missing: no $py"; return 1; fi
    rmdir "$dir" 2>/dev/null
    if [ -e "$dir" ]; then line FAIL "$part" - "$dir exists without bin/python; move it aside and run again"; return 1; fi
    if [ ! -x "$python" ] || ! "$python" -I -c 'import ensurepip, venv' 2>/dev/null; then
      if [ -z "$apt" ]; then
        line FAIL "$part" - "$python with venv and ensurepip is missing, and the Ubuntu archive has no package for it (the base image brought it); until it is back, use /opt/py312-ci/bin/python where a brief says $dir/bin/python"
        return 1
      fi
      log "installing $apt from the Ubuntu archive"
      # shellcheck disable=SC2086 # APT is a list of package names
      { apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q $apt; } >"$LOG_DIR/apt-$part.log" 2>&1 || { line FAIL "$part" - "apt-get install $apt failed: $(tail_of "$LOG_DIR/apt-$part.log" 3)"; return 1; }
    fi
    log "creating the venv $dir"
    mkdir -p "$dir" && : >"$mark" || { line FAIL "$part" - "could not create $dir"; return 1; }
    made=1
    "$python" -m venv "$dir" >"$LOG_DIR/venv-$part.log" 2>&1 || { rm -rf "$dir"; line FAIL "$part" - "$python -m venv failed: $(tail_of "$LOG_DIR/venv-$part.log" 3)"; return 1; }
    how="created from $python"
  fi
  pv="$("$py" -B -I -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>&1)"
  case "$pv" in "$series".*) ;; *)
    [ "$made" = 1 ] && rm -rf "$dir"
    line FAIL "$part" - "$py is Python $pv, not $series; move $dir aside and run again"
    return 1
    ;;
  esac
  have="$(venv_packages "$py")"
  if ! pinned_in "$have"; then
    if checking; then line FAIL "$part" "$pv" "$dir holds '$have', not pyx12==$PYX12_VERSION and defusedxml==$DEFUSEDXML_VERSION"; return 1; fi
    log "installing pyx12 $PYX12_VERSION and defusedxml $DEFUSEDXML_VERSION into $dir (by hash)"
    req="$LOG_DIR/py-requirements.txt"
    printf '%s\n' "$PY_REQUIREMENTS" >"$req"
    if ! "$py" -I -m pip install --disable-pip-version-check --no-input --no-cache-dir --no-deps --only-binary :all: --require-hashes -r "$req" >"$LOG_DIR/pip-$part.log" 2>&1; then
      if [ "$made" = 1 ]; then rm -rf "$dir"; x="the next run makes the venv again"; else x="if $dir is broken, move it aside and run again"; fi
      line FAIL "$part" "$pv" "pip install pyx12 failed ($x): $(tail_of "$LOG_DIR/pip-$part.log" 3)"
      return 1
    fi
    have="$(venv_packages "$py")"
    if ! pinned_in "$have"; then
      if [ "$made" = 1 ]; then rm -rf "$dir"; x="removed; the next run makes it again"; else x="move it aside and run again"; fi
      line FAIL "$part" "$pv" "after pip install, $dir holds '$have' ($x)"
      return 1
    fi
    how="$how; pyx12 and defusedxml installed by hash"
  fi
  for x in $have; do
    case "${x%%==*}" in
      pyx12 | defusedxml) ;;
      pip) pipv="${x#pip==}" ;;
      *) extra="$extra $x" ;;
    esac
  done
  if [ -n "$extra" ]; then
    [ "$made" = 1 ] && rm -rf "$dir"
    line FAIL "$part" "$pv" "$dir also holds$extra; pip uninstall them or move $dir aside, then run again"
    return 1
  fi
  if ! x="$("$py" -B -I -c 'import pyx12, defusedxml' 2>&1)"; then
    if [ "$made" = 1 ]; then rm -rf "$dir"; else x="$x; move $dir aside and run again"; fi
    line FAIL "$part" "$pv" "import pyx12 fails: $(tail -n 1 <<<"$x")"
    return 1
  fi
  [ "$made" = 1 ] && rm -f "$mark"
  if [ "$pipv" != "$pipwant" ]; then
    note="; pip ${pipv:-missing}, the interpreter's own (the build had $pipwant)"
    line note "$part" "$pv" "pip in $dir is ${pipv:-missing}, not the build's $pipwant; it comes with $python's ensurepip"
  else
    note="; pip $pipv"
  fi
  line ok "$part" "$pv" "$py ($how; exactly pyx12 $PYX12_VERSION and defusedxml $DEFUSEDXML_VERSION$note; import pyx12 works)"
}
venv_packages() { # "name==version ..." of every distribution in the venv of interpreter $1, sorted, lower-case names
  "$1" -B -I -c 'import importlib.metadata as m
print(" ".join(sorted("%s==%s" % (d.metadata["Name"].lower(), d.version) for d in m.distributions())))' 2>&1
}
pinned_in() { # the package list $1 has pyx12 and defusedxml at their pins
  case " $1 " in *" pyx12==$PYX12_VERSION "*) ;; *) return 1 ;; esac
  case " $1 " in *" defusedxml==$DEFUSEDXML_VERSION "*) ;; *) return 1 ;; esac
}
step_python() { venv_part python "$PY312_DIR" /usr/bin/python3.12 3.12 24.0 "python3.12 python3.12-venv"; }
step_oracle_python() {
  local python=/usr/bin/python3.13
  # The build's venv was made by /usr/bin/python3, which the base image points at python3.13; use it while it does,
  # so the venv's pyvenv.cfg matches too.
  if [ "$(readlink -f /usr/bin/python3 2>/dev/null)" = /usr/bin/python3.13 ]; then python=/usr/bin/python3; fi
  venv_part python-oracle "$ORACLE_DIR" "$python" 3.13 26.2.1 ""
}

# ---- actionlint ------------------------------------------------------------------------------------------------
step_actionlint() {
  local bin="$ACTIONLINT_DIR/actionlint" dl="$P/opt/actionlint-dl" v how="present" want sum note=""
  if checking && [ -n "${ACTIONLINT:-}" ]; then bin="$ACTIONLINT"; how="ACTIONLINT"; fi
  if [ ! -x "$bin" ]; then
    if checking; then line FAIL actionlint - "missing: no $bin"; return 1; fi
    log "installing actionlint $ACTIONLINT_VERSION into $ACTIONLINT_DIR"
    mkdir -p "$dl"
    fetch "$ACTIONLINT_BASE/actionlint_${ACTIONLINT_VERSION}_checksums.txt" "$dl/actionlint_${ACTIONLINT_VERSION}_checksums.txt" || { line FAIL actionlint - "$ERR"; return 1; }
    if [ ! -f "$dl/$ACTIONLINT_TGZ" ] || [ "$(sha256 "$dl/$ACTIONLINT_TGZ")" != "$ACTIONLINT_TGZ_SHA256" ]; then
      fetch "$ACTIONLINT_BASE/$ACTIONLINT_TGZ" "$dl/$ACTIONLINT_TGZ" || { line FAIL actionlint - "$ERR"; return 1; }
    fi
    want="$(awk -v f="$ACTIONLINT_TGZ" '$2 == f { print $1 }' "$dl/actionlint_${ACTIONLINT_VERSION}_checksums.txt")"
    sum="$(sha256 "$dl/$ACTIONLINT_TGZ")"
    if [ "$sum" != "$want" ] || [ "$sum" != "$ACTIONLINT_TGZ_SHA256" ]; then
      rm -f "$dl/$ACTIONLINT_TGZ"
      line FAIL actionlint - "$ACTIONLINT_TGZ has SHA-256 $sum; the checksums file says '$want' and the pin $ACTIONLINT_TGZ_SHA256; refused"
      return 1
    fi
    rm -rf "$dl/x"
    mkdir -p "$dl/x" "$ACTIONLINT_DIR"
    sweep "$bin"
    TMPS+=("$bin.tmp.$$")
    tar -xzf "$dl/$ACTIONLINT_TGZ" -C "$dl/x" actionlint && mv -f "$dl/x/actionlint" "$bin.tmp.$$" && chmod 755 "$bin.tmp.$$" && mv -f "$bin.tmp.$$" "$bin" || { line FAIL actionlint - "could not unpack actionlint into $ACTIONLINT_DIR"; return 1; }
    rm -rf "$dl/x"
    how="installed; SHA-256 checked against the release's checksums file and the pin"
  fi
  v="$("$bin" -version 2>&1 | head -n 1)"
  if [ "$v" != "$ACTIONLINT_VERSION" ]; then line FAIL actionlint - "$bin reports '$v', not $ACTIONLINT_VERSION"; return 1; fi
  if [ "$bin" = "$ACTIONLINT_DIR/actionlint" ]; then
    if [ -L "$ACTIONLINT_LINK" ] && [ "$(readlink "$ACTIONLINT_LINK")" = "$bin" ]; then
      note="; on PATH as $ACTIONLINT_LINK"
    elif [ -e "$ACTIONLINT_LINK" ]; then
      note="; $ACTIONLINT_LINK is another file, left as it is"
    elif checking; then
      line FAIL actionlint "$v" "$bin present, but $ACTIONLINT_LINK is missing"
      return 1
    else
      mkdir -p "$(dirname "$ACTIONLINT_LINK")" && ln -s "$bin" "$ACTIONLINT_LINK" && note="; on PATH as $ACTIONLINT_LINK"
    fi
  fi
  line ok actionlint "$v" "$bin ($how$note)"
}

# ---- repository ------------------------------------------------------------------------------------------------
REMOTE_HEADS=""
REMOTE_NOTE=""
same_repo() { # two remote URLs name the same repository (case and a trailing .git or / aside)
  local a b
  a="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  b="$(printf '%s' "$2" | tr 'A-Z' 'a-z')"
  a="${a%/}"; a="${a%.git}"; b="${b%/}"; b="${b%.git}"
  [ "$a" = "$b" ]
}
remote_head() { # origin's commit for branch $1: ls-remote's in check mode, the fetched ref otherwise
  if checking && [ -n "$REMOTE_HEADS" ]; then
    printf '%s\n' "$REMOTE_HEADS" | awk -v r="refs/heads/$1" '$2 == r { print $1 }'
  else
    git -C "$CLONE_DIR" rev-parse --verify -q "refs/remotes/origin/$1^{commit}"
  fi
}
# compare_origin DIR BRANCH: compares DIR's HEAD with origin's BRANCH; fast-forwards it when behind (not in check mode).
# Sets SYNC to a description; returns 1 when it is behind (check mode), diverged or not on origin.
compare_origin() {
  local dir="$1" branch="$2" head remote ahead behind
  head="$(git -C "$dir" rev-parse HEAD)"
  remote="$(remote_head "$branch")"
  if [ -z "$remote" ]; then SYNC="$branch is not on origin$REMOTE_NOTE"; return 1; fi
  if [ "$head" = "$remote" ]; then SYNC="at ${head:0:7}, the same as origin$REMOTE_NOTE"; return 0; fi
  if ! git -C "$dir" cat-file -e "$remote^{commit}" 2>/dev/null; then
    SYNC="at ${head:0:7}; origin is at ${remote:0:7}, which this clone has not fetched (behind; run without SETUP_CHECK)"
    return 1
  fi
  ahead="$(git -C "$dir" rev-list --count "$remote..$head")"
  behind="$(git -C "$dir" rev-list --count "$head..$remote")"
  if [ "$behind" = 0 ]; then SYNC="at ${head:0:7}, $ahead commit(s) ahead of origin (not pushed)"; return 0; fi
  if [ "$ahead" != 0 ]; then SYNC="at ${head:0:7}, diverged from origin ${remote:0:7} ($ahead ahead, $behind behind)"; return 1; fi
  if checking; then SYNC="at ${head:0:7}, $behind commit(s) behind origin ${remote:0:7} (run without SETUP_CHECK)"; return 1; fi
  if ! git -C "$dir" merge --ff-only -q "$remote" >/dev/null 2>&1; then
    SYNC="at ${head:0:7}, $behind commit(s) behind origin, and the fast-forward failed (local changes in the way?)"
    return 1
  fi
  SYNC="fast-forwarded ${head:0:7}..${remote:0:7} to origin"
}

step_clone() {
  local url cur dirty hook out b fetched=""
  if [ ! -d "$CLONE_DIR/.git" ]; then
    if checking; then line FAIL repo - "no clone at $CLONE_DIR"; return 1; fi
    if [ -e "$CLONE_DIR" ] && [ -n "$(ls -A "$CLONE_DIR" 2>/dev/null)" ]; then line FAIL repo - "$CLONE_DIR exists and is not a git clone"; return 1; fi
    log "cloning $REPO_URL into $CLONE_DIR"
    mkdir -p "$(dirname "$CLONE_DIR")"
    sweep "$CLONE_DIR"
    TMPS+=("$CLONE_DIR.tmp.$$")
    # Cloned beside its path and moved there whole, so a cut-off clone never looks like a clone.
    out="$(git clone -q "$REPO_URL" "$CLONE_DIR.tmp.$$" 2>&1)" || { line FAIL repo - "git clone $REPO_URL failed: $(printf '%s' "$out" | tail -n 1)"; return 1; }
    rmdir "$CLONE_DIR" 2>/dev/null
    mv -T "$CLONE_DIR.tmp.$$" "$CLONE_DIR" || { line FAIL repo - "could not move the clone to $CLONE_DIR"; return 1; }
  fi
  url="$(git -C "$CLONE_DIR" remote get-url origin 2>/dev/null)"
  same_repo "$url" "$REPO_URL" || { line FAIL repo - "$CLONE_DIR's origin is '$url', not $REPO_URL"; return 1; }
  if checking; then
    if REMOTE_HEADS="$(timeout 60 git -C "$CLONE_DIR" ls-remote --heads origin 2>/dev/null)" && [ -n "$REMOTE_HEADS" ]; then
      REMOTE_NOTE=" (ls-remote)"
    else
      REMOTE_HEADS=""
      REMOTE_NOTE=" (origin not reached; compared with the last fetch)"
    fi
  else
    out="$(git -C "$CLONE_DIR" fetch -q --prune origin 2>&1)" || { line FAIL repo - "git fetch origin failed: $(printf '%s' "$out" | tail -n 1)"; return 1; }
    # A clone made with --single-branch (or another narrow refspec) does not fetch the other branches: fetch them by name.
    if ! git -C "$CLONE_DIR" config --get-all remote.origin.fetch | grep -qxF '+refs/heads/*:refs/remotes/origin/*'; then
      for b in "$BASE_BRANCH" "$OPS_BRANCH" ${BRANCH_ARGS[@]+"${BRANCH_ARGS[@]}"}; do
        git -C "$CLONE_DIR" fetch -q origin "+refs/heads/$b:refs/remotes/origin/$b" >/dev/null 2>&1 && fetched="$fetched $b"
      done
      REMOTE_NOTE=" (origin's fetch refspec is narrower than refs/heads/*, so fetched by name:$fetched)"
    fi
  fi
  cur="$(git -C "$CLONE_DIR" symbolic-ref -q --short HEAD)"
  if [ "$cur" != "$BASE_BRANCH" ]; then
    if checking; then line FAIL repo - "$CLONE_DIR is on '${cur:-a detached HEAD}', not $BASE_BRANCH"; return 1; fi
    dirty="$(git -C "$CLONE_DIR" status --porcelain --untracked-files=no)"
    if [ -n "$dirty" ]; then line FAIL repo - "$CLONE_DIR is on '${cur:-a detached HEAD}' with uncommitted changes, so $BASE_BRANCH was not checked out"; return 1; fi
    if ! git -C "$CLONE_DIR" rev-parse --verify -q "refs/heads/$BASE_BRANCH" >/dev/null; then
      new_branch "$BASE_BRANCH" || { line FAIL repo - "could not create the branch $BASE_BRANCH from origin/$BASE_BRANCH"; return 1; }
    fi
    out="$(git -C "$CLONE_DIR" checkout -q "$BASE_BRANCH" 2>&1)" || { line FAIL repo - "git checkout $BASE_BRANCH failed: $(printf '%s' "$out" | tail -n 1)"; return 1; }
  fi
  compare_origin "$CLONE_DIR" "$BASE_BRANCH" || { line FAIL repo - "$CLONE_DIR: $SYNC"; return 1; }
  if checking; then
    if grep -qxF '# paidwhole pre-push launcher' "$(git -C "$CLONE_DIR" rev-parse --path-format=absolute --git-common-dir)/hooks/pre-push" 2>/dev/null; then
      hook="pre-push hook installed"
    else
      line FAIL repo - "$CLONE_DIR has no pre-push launcher (bash tools/pre-push/install.sh)"
      return 1
    fi
  else
    hook="$(cd "$CLONE_DIR" && bash tools/pre-push/install.sh 2>&1)" || { line FAIL repo - "$hook"; return 1; }
    hook="pre-push hook installed"
  fi
  line ok repo "${BASE_BRANCH#claude/}" "$CLONE_DIR on $BASE_BRANCH, $SYNC; $hook"
  OK_CLONE=1
}
# new_branch BRANCH: a local BRANCH at origin/BRANCH that tracks it. Written by hand rather than with --track, which
# refuses a remote-tracking ref that the configured fetch refspec does not cover.
new_branch() {
  git -C "$CLONE_DIR" branch -q --no-track "$1" "refs/remotes/origin/$1" &&
    git -C "$CLONE_DIR" config "branch.$1.remote" origin &&
    git -C "$CLONE_DIR" config "branch.$1.merge" "refs/heads/$1"
}

step_gitleaks() {
  local release ver bin out legacy note=""
  if [ "$OK_CLONE" != 1 ]; then line FAIL gitleaks - "skipped: needs the clone's tools/gitleaks"; return 1; fi
  release="$CLONE_DIR/tools/gitleaks/release.txt"
  ver="$(awk '$1 == "version" { print $2 }' "$release" 2>/dev/null)"
  [ -n "$ver" ] || { line FAIL gitleaks - "$release names no version"; return 1; }
  bin="$CACHE_HOME/paidwhole/gitleaks/$ver/gitleaks"
  if checking; then
    [ -x "$bin" ] || { line FAIL gitleaks - "missing: no $bin"; return 1; }
  else
    out="$(XDG_CACHE_HOME="$CACHE_HOME" bash "$CLONE_DIR/tools/gitleaks/install.sh" 2>&1)" || { line FAIL gitleaks - "tools/gitleaks/install.sh: $(printf '%s' "$out" | tail -n 1)"; return 1; }
    [ "$out" = "$bin" ] || { line FAIL gitleaks - "tools/gitleaks/install.sh put it at '$out', not $bin"; return 1; }
  fi
  out="$("$bin" version 2>&1 | tr -d v)"
  [ "$out" = "$ver" ] || { line FAIL gitleaks - "$bin reports '$out', not $ver"; return 1; }
  if [ -d "$LEGACY_GITLEAKS_PARENT" ]; then
    legacy="$LEGACY_GITLEAKS_PARENT/gitleaks/gitleaks"
    if [ -e "$legacy" ]; then
      if [ "$("$legacy" version 2>&1 | tr -d v)" = "$ver" ]; then note="; also at $legacy"; else note="; $legacy is not $ver, left as it is"; fi
    elif checking; then
      note="; $legacy is missing"
    else
      mkdir -p "$(dirname "$legacy")" && ln -s "$bin" "$legacy" && note="; linked at $legacy"
    fi
  fi
  line ok gitleaks "$ver" "$bin (tools/gitleaks/install.sh, archive SHA-256 pinned in tools/gitleaks/release.txt$note)"
}

pnpm_path() { PATH="$RUN_PATH" command -v pnpm 2>/dev/null; }
pnpm_version() { # pnpm's version, read from its package.json so nothing runs and nothing is written
  local p
  p="$(pnpm_path)" || return 1
  p="$(readlink -f "$p")"
  awk -F'"' '$2 == "version" { print $4; exit }' "$(dirname "$(dirname "$p")")/package.json" 2>/dev/null
}

# pnpm_install: pnpm@PNPM_VERSION from the npm registry (pinned SHA-256 and SHA-512) in PNPM_DIR, outside
# /opt/node24 so Node's tree stays as it is, linked at PNPM_LINK (in its own directory, PNPM_BIN, so the tree holds
# only the tarball's files).
pnpm_install() {
  local dl="$P/opt/pnpm-dl" tmp="$PNPM_DIR.tmp.$$"
  npm_tarball pnpm "$PNPM_VERSION" "$dl/$PNPM_TGZ" "$PNPM_TGZ_SHA256" "$PNPM_TGZ_SHA512" || return 1
  if [ ! -f "$PNPM_DIR/bin/pnpm.cjs" ]; then
    if [ -e "$PNPM_DIR" ]; then ERR="$PNPM_DIR exists without bin/pnpm.cjs; move it aside and run again"; return 1; fi
    sweep "$PNPM_DIR"
    TMPS+=("$tmp")
    mkdir -p "$tmp"
    tar -xzf "$dl/$PNPM_TGZ" -C "$tmp" --strip-components=1 && [ -f "$tmp/bin/pnpm.cjs" ] || { ERR="$dl/$PNPM_TGZ did not unpack to package/bin/pnpm.cjs"; return 1; }
    mv -T "$tmp" "$PNPM_DIR" || { ERR="could not move pnpm to $PNPM_DIR"; return 1; }
  fi
  if [ -L "$PNPM_LINK" ] && [ "$(readlink "$PNPM_LINK")" = "$PNPM_DIR/bin/pnpm.cjs" ]; then return 0; fi
  if [ -L "$PNPM_LINK" ] && [[ "$(readlink "$PNPM_LINK")" == "$P/opt/pnpm-"*/bin/pnpm.cjs ]]; then
    rm -f "$PNPM_LINK" || { ERR="could not replace $PNPM_LINK"; return 1; } # another pin's link: this one replaces it
  fi
  if [ -e "$PNPM_LINK" ] || [ -L "$PNPM_LINK" ]; then ERR="$PNPM_LINK exists but is not pnpm $PNPM_VERSION; move it aside and run again"; return 1; fi
  mkdir -p "$PNPM_BIN" && ln -s "$PNPM_DIR/bin/pnpm.cjs" "$PNPM_LINK" || { ERR="could not link $PNPM_LINK"; return 1; }
}

# modules DIR LABEL: node_modules in DIR installed from DIR's pnpm-lock.yaml as it is now (node_modules/.modules.yaml
# present, node_modules/.pnpm/lock.yaml equal to pnpm-lock.yaml). When they are, nothing runs; otherwise, outside
# check mode, pnpm install --frozen-lockfile with Node 24 first on PATH. pnpm is never told it may remove an existing
# node_modules (confirmModulesPurge): when it wants to, the run stops and says so.
modules() {
  local dir="$1" label="$2" out
  if [ -f "$dir/node_modules/.modules.yaml" ] && cmp -s "$dir/pnpm-lock.yaml" "$dir/node_modules/.pnpm/lock.yaml"; then
    MODULES="node_modules match pnpm-lock.yaml"
    return 0
  fi
  if checking; then
    MODULES="node_modules missing or not installed from the current pnpm-lock.yaml (pnpm install --frozen-lockfile)"
    return 1
  fi
  log "pnpm install --frozen-lockfile in $dir"
  out="$LOG_DIR/pnpm-install-$label.log"
  if ! (cd "$dir" && PATH="$RUN_PATH" pnpm install --frozen-lockfile) >"$out" 2>&1; then
    if grep -q 'ABORTED_REMOVE_MODULES_DIR' "$out"; then
      MODULES="pnpm wants to remove and reinstall $dir/node_modules; once nothing is running there: cd $dir && PATH=$NODE_DIR/bin:\$PATH pnpm install --frozen-lockfile --config.confirmModulesPurge=false, then run this again"
    else
      MODULES="pnpm install --frozen-lockfile failed in $dir: $(tail_of "$out" 3)"
    fi
    return 1
  fi
  if ! cmp -s "$dir/pnpm-lock.yaml" "$dir/node_modules/.pnpm/lock.yaml"; then
    MODULES="pnpm install --frozen-lockfile finished in $dir, but node_modules/.pnpm/lock.yaml differs from pnpm-lock.yaml"
    return 1
  fi
  MODULES="pnpm install --frozen-lockfile done"
}

step_pnpm() {
  local want want512 pin512 have where
  if [ "$OK_CLONE" != 1 ] || [ "$OK_NODE" != 1 ]; then line FAIL pnpm - "skipped: needs Node 24 and the clone"; return 1; fi
  want="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["packageManager"].split("@")[1].split("+")[0])' "$CLONE_DIR/package.json" 2>/dev/null)"
  want512="$(python3 -I -c 'import json, sys; pm = json.load(open(sys.argv[1]))["packageManager"]; print(pm.split("+sha512.")[1] if "+sha512." in pm else "")' "$CLONE_DIR/package.json" 2>/dev/null)"
  pin512="$(python3 -I -c 'import base64, sys; print(base64.b64decode(sys.argv[1].split("-", 1)[1]).hex())' "$PNPM_TGZ_SHA512")"
  if [ "$want" != "$PNPM_VERSION" ]; then line FAIL pnpm - "package.json's packageManager is pnpm@${want:-?} while this script pins $PNPM_VERSION; update the PNPM_* pins"; return 1; fi
  if [ "$want512" != "$pin512" ]; then line FAIL pnpm - "package.json's packageManager names pnpm@$want with SHA-512 '${want512:-none}', not this script's pinned $pin512; nothing installed"; return 1; fi
  if ! { [ -f "$PNPM_DIR/bin/pnpm.cjs" ] && [ -L "$PNPM_LINK" ] && [ "$(readlink "$PNPM_LINK")" = "$PNPM_DIR/bin/pnpm.cjs" ]; }; then
    if checking; then line FAIL pnpm - "pnpm $PNPM_VERSION is not in $PNPM_DIR, linked at $PNPM_LINK"; return 1; fi
    log "installing pnpm $PNPM_VERSION from the npm registry into $PNPM_DIR, linked at $PNPM_LINK"
    pnpm_install || { line FAIL pnpm - "$ERR"; return 1; }
  fi
  have="$(pnpm_version)"
  where="$(pnpm_path)"
  if [ "$have" != "$PNPM_VERSION" ] || [ "$(readlink -f "$where")" != "$(readlink -f "$PNPM_DIR/bin/pnpm.cjs")" ]; then
    line FAIL pnpm "${have:--}" "pnpm first on the install PATH is $where (${have:-unknown}), not $PNPM_LINK ($PNPM_VERSION)"; return 1
  fi
  tree_against pnpm "$PNPM_VERSION" "$P/opt/pnpm-dl/$PNPM_TGZ" "$PNPM_TGZ_SHA256" "$PNPM_TGZ_SHA512" package/ "$PNPM_DIR" 0 || { line FAIL pnpm "$have" "$ERR"; return 1; }
  modules "$CLONE_DIR" main || { line FAIL pnpm "$have" "$MODULES"; return 1; }
  line ok pnpm "$have" "$PNPM_LINK (from registry.npmjs.org; $TREE; its SHA-512 is packageManager's), the packageManager version; $CLONE_DIR: $MODULES"
  OK_MODULES=1
}

# Playwright's Chromium builds by revision, laid out from Google's Chrome for Testing bucket (storage.googleapis.com,
# which the cloud proxy allows) when the base image lacks them: Playwright's own hosts (cdn.playwright.dev,
# playwright.download.prss.microsoft.com) are refused there. A CfT build of a version renders exactly as Playwright's
# own build of it (the CI series' scout, designs/lane-b-ci/scout-playwright-runner.md M7: all seven brand baselines
# byte for byte under 1.56.1). Fields: revision directory | CfT version | zip | the zip's SHA-256 | the directory the
# zip's top folder becomes | a link name=target inside it ('' for none). 1194 is Playwright 1.56.1's (its registry
# reads chrome-linux/chrome and chrome-linux/headless_shell); 1248 is 1.64.1's (CfT's own layout).
CFT_BUILDS='chromium-1194|141.0.7390.37|chrome-linux64.zip|128b0505afabfa89660842aa0a33a1bd5949244a7027f8b44d1d2fd8f23d7669|chrome-linux|
chromium_headless_shell-1194|141.0.7390.37|chrome-headless-shell-linux64.zip|b294238e5ac3e04f5f7fc5e5c017692bf64635e8824c3a7a44bea6a7ef6e147d|chrome-linux|headless_shell=chrome-headless-shell
chromium-1248|156.0.8078.4|chrome-linux64.zip|43fd31766c7533a02dda2ded5ad50c2f861cd5400be7509c0abad71129f79d79|chrome-linux64|
chromium_headless_shell-1248|156.0.8078.4|chrome-headless-shell-linux64.zip|c3e50596aef52c58f8fda3c6b3411c33d34c88b177b3ed1c2243359fd3b8ba20|chrome-headless-shell-linux64|'
CFT_BASE=https://storage.googleapis.com/chrome-for-testing-public

# cft_layout REVDIR BROWSERS_DIR: lays out one revision from Chrome for Testing, its zip checked against the pin and
# kept in $CACHE_HOME/paidwhole/cft; the tree is built beside its final path and moved into place only when whole.
cft_layout() {
  local rev="$1" dir="$2" row ver zip sum inner link cache tmp top
  row="$(printf '%s\n' "$CFT_BUILDS" | awk -F'|' -v r="$rev" '$1 == r')"
  [ -n "$row" ] || { ERR="no pinned Chrome for Testing build for $rev"; return 1; }
  IFS='|' read -r _ ver zip sum inner link <<<"$row"
  cache="$CACHE_HOME/paidwhole/cft/$ver"
  mkdir -p "$cache"
  if [ ! -f "$cache/$zip" ] || [ "$(sha256 "$cache/$zip")" != "$sum" ]; then
    fetch "$CFT_BASE/$ver/linux64/$zip" "$cache/$zip" || return 1
  fi
  [ "$(sha256 "$cache/$zip")" = "$sum" ] || { ERR="$zip for $ver does not match its pinned SHA-256"; rm -f "$cache/$zip"; return 1; }
  sweep "$dir/$rev"
  tmp="$dir/$rev.tmp.$$"
  TMPS+=("$tmp")
  mkdir -p "$tmp/unzip"
  if command -v unzip >/dev/null; then
    unzip -q "$cache/$zip" -d "$tmp/unzip" || { ERR="could not unzip $zip"; return 1; }
  else
    python3 -I -c 'import os, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for i in z.infolist():
    path = z.extract(i, sys.argv[2])
    mode = (i.external_attr >> 16) & 0o777
    if mode:
        os.chmod(path, mode)' "$cache/$zip" "$tmp/unzip" || { ERR="could not unpack $zip"; return 1; }
  fi
  top="$(ls "$tmp/unzip")"
  [ "$(printf '%s\n' "$top" | wc -l)" = 1 ] && [ -d "$tmp/unzip/$top" ] || { ERR="$zip holds more than one top folder"; return 1; }
  mv "$tmp/unzip/$top" "$tmp/$inner" && rmdir "$tmp/unzip"
  if [ -n "$link" ]; then ln -s "${link#*=}" "$tmp/$inner/${link%%=*}"; fi
  touch "$tmp/INSTALLATION_COMPLETE" "$tmp/DEPENDENCIES_VALIDATED"
  mv "$tmp" "$dir/$rev"
}

# step_playwright [CHECKOUT PART]: the browsers a checkout's Playwright needs (the main clone's by default, or an
# argument worktree's, which may name another Playwright, as ci-browser's 1.64.1 does): the base image's, else laid
# out from Chrome for Testing.
step_playwright() {
  local checkout="${1:-$CLONE_DIR}" part="${2:-playwright}" pw browsers revs dir missing="" laid="" r ver
  if [ "$checkout" = "$CLONE_DIR" ] && [ "$OK_MODULES" != 1 ]; then line FAIL "$part" - "skipped: needs the clone's node_modules"; return 1; fi
  pw="$(python3 -I -c 'import json, sys; d = json.load(open(sys.argv[1]))
print({**d.get("dependencies", {}), **d.get("devDependencies", {})}["@playwright/test"])' "$checkout/apps/web/package.json" 2>/dev/null)"
  browsers="$checkout/node_modules/.pnpm/playwright-core@$pw/node_modules/playwright-core/browsers.json"
  revs="$(python3 -I -c 'import json, sys
for b in json.load(open(sys.argv[1]))["browsers"]:
    if b["name"] in ("chromium", "chromium-headless-shell"):
        print(b["name"].replace("-", "_") + "-" + b["revision"])' "$browsers" 2>/dev/null)"
  [ -n "$revs" ] || { line FAIL "$part" "$pw" "cannot read $browsers"; return 1; }
  dir="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  for r in $revs; do [ -f "$dir/$r/INSTALLATION_COMPLETE" ] || missing="$missing $r"; done
  if [ -n "$missing" ] && checking; then
    line FAIL "$part" "$pw" "missing in $dir:$missing (run this script without SETUP_CHECK: it lays them out from Chrome for Testing)"
    return 1
  fi
  for r in $missing; do
    if ! cft_layout "$r" "$dir"; then
      line FAIL "$part" "$pw" "$r: $ERR"
      return 1
    fi
    ver="$(printf '%s\n' "$CFT_BUILDS" | awk -F'|' -v r="$r" '$1 == r { print $2 }')"
    laid="$laid $r"
  done
  if [ -n "$laid" ]; then
    line ok "$part" "$pw" "$(printf '%s' "$revs" | tr '\n' ' ' | sed 's/ $//') in $dir (laid out from Chrome for Testing $ver, pinned SHA-256:$laid)"
  else
    line ok "$part" "$pw" "$(printf '%s' "$revs" | tr '\n' ' ' | sed 's/ $//') in $dir (present)"
  fi
}

# worktree BRANCH DIR PART INSTALL: a worktree of the clone at DIR on BRANCH, current with origin; INSTALL=1 also
# runs pnpm install there.
worktree() {
  local branch="$1" dir="$2" part="$3" install="$4" cur common want out detail gitdir
  if [ "$OK_CLONE" != 1 ]; then line FAIL "$part" - "skipped: needs the clone"; return 1; fi
  # A git worktree add that was killed leaves its worktree locked "initializing" and half checked out.
  if [ -e "$dir/.git" ]; then
    gitdir="$(git -C "$dir" rev-parse --absolute-git-dir 2>/dev/null)"
    if [ -n "$gitdir" ] && [ "$(cat "$gitdir/locked" 2>/dev/null)" = initializing ]; then
      if checking; then line FAIL "$part" - "$dir is a git worktree add that was cut off (locked: initializing); run without SETUP_CHECK to make it again"; return 1; fi
      log "removing $dir, a git worktree add that was cut off"
      out="$(git -C "$CLONE_DIR" worktree remove --force --force "$dir" 2>&1)" || { line FAIL "$part" - "could not remove the cut-off worktree $dir: $(printf '%s' "$out" | tail -n 1)"; return 1; }
    fi
  fi
  if [ ! -e "$dir/.git" ]; then
    if checking; then line FAIL "$part" - "no worktree at $dir for $branch"; return 1; fi
    if [ -e "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then line FAIL "$part" - "$dir exists and is not a worktree"; return 1; fi
    [ -n "$(remote_head "$branch")" ] || { line FAIL "$part" - "$branch is not on origin"; return 1; }
    if ! git -C "$CLONE_DIR" rev-parse --verify -q "refs/heads/$branch" >/dev/null; then
      new_branch "$branch" || { line FAIL "$part" - "could not create the branch $branch from origin"; return 1; }
    fi
    log "adding the worktree $dir ($branch)"
    out="$(git -C "$CLONE_DIR" worktree add -q "$dir" "$branch" 2>&1)" || { line FAIL "$part" - "git worktree add $dir $branch failed: $(printf '%s' "$out" | tail -n 1)"; return 1; }
  fi
  common="$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
  want="$(git -C "$CLONE_DIR" rev-parse --path-format=absolute --git-common-dir)"
  [ "$common" = "$want" ] || { line FAIL "$part" - "$dir is not a worktree of $CLONE_DIR"; return 1; }
  cur="$(git -C "$dir" symbolic-ref -q --short HEAD)"
  [ "$cur" = "$branch" ] || { line FAIL "$part" - "$dir is on '${cur:-a detached HEAD}', not $branch"; return 1; }
  compare_origin "$dir" "$branch" || { line FAIL "$part" - "$dir: $SYNC"; return 1; }
  detail="$dir on $branch, $SYNC"
  if [ "$install" = 1 ]; then
    modules "$dir" "$part" || { line FAIL "$part" - "$MODULES"; return 1; }
    detail="$detail; $MODULES"
  fi
  line ok "$part" "${branch##*/}" "$detail"
}

worktree_dir() { # co-001/pr-05-packet-deadline -> pr5, co-001/pr-06b-zip4 -> pr6b, co-001/governance -> governance
  local last="${1##*/}"
  if [[ "$last" =~ ^pr-0*([0-9]+[a-z]?)(-|$) ]]; then printf 'pr%s' "${BASH_REMATCH[1]}"; else printf '%s' "$last"; fi
}

# ---- run -------------------------------------------------------------------------------------------------------
log "$(checking && echo 'checking (SETUP_CHECK=1: nothing is changed)' || echo 'setting up') with prefix '${P:-/}'"
step_pg18
step_pg16
step_node
step_python
step_oracle_python
step_actionlint
step_pg18_server
step_pg16_server
step_clone
step_gitleaks
step_pnpm
step_playwright
worktree "$OPS_BRANCH" "$OPS_DIR" ops 0
for arg in "$@"; do
  branch="${arg%%:*}"
  if [ "$branch" != "$arg" ]; then dir="${arg#*:}"; else dir="$WORKTREE_ROOT/$(worktree_dir "$branch")"; fi
  # An argument worktree's own Playwright may name other browser revisions than the main clone's.
  worktree "$branch" "$dir" "$(basename "$dir")" 1 && step_playwright "$dir" "playwright-$(basename "$dir")"
done

printf '%s\n' "${LINES[@]}"
if [ "${#REFUSED[@]}" -gt 0 ]; then
  printf 'note  the proxy refused: %s\n' "$(printf '%s\n' "${REFUSED[@]}" | sort -u | tr '\n' ' ')"
fi
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo OK
  exit 0
fi
echo "FAILED (${#FAILED[@]}):"
printf -- '- %s\n' "${FAILED[@]}"
exit 1
