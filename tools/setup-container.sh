#!/usr/bin/env bash
# Rebuilds the PaidWhole build machine in a fresh Claude Code cloud container, exactly as the build session of
# 2026-10-14 to 2026-10-21 had it, so HANDOFF.md's commands work unchanged. Run it once, as root, at the start of a
# session; running it again changes nothing that is already in place.
#
#   bash tools/setup-container.sh [branch[:dir] ...]
#
# Each argument is an open branch (co-001/pr-06b-zip4, ...) that gets a worktree: co-001/pr-NN<x>-... goes to
# /home/user/prN<x> (leading zeros dropped), any other branch to /home/user/<last path part>; ":dir" overrides that.
#
# What it does, each part only when it is missing, and each checked by version (and by SHA-256 where one is known):
#   - PostgreSQL 18.4 in /opt/pg18 from the npm package @embedded-postgres/linux-x64@18.4.0-beta.17 (tarball kept in
#     /opt/pg18-dl, unpacked in /opt/pg18-extract, pg-symlinks.json applied); cluster /root/pgdata18, superuser
#     postgres:test, trust on the /tmp socket, scram-sha-256 on localhost, port 5433.
#   - PostgreSQL 16 from the Ubuntu archive (/usr/lib/postgresql/16); cluster /root/pgdata, scram-sha-256, port 5432.
#   - Node v24.22.0 in /opt/node24: from nodejs.org checked against its SHASUMS256.txt, or, when the proxy refuses
#     nodejs.org, from the npm package node-linux-x64@24.22.0 checked against a pinned SHA-256 and the registry's
#     SHA-512. Either way /opt/node24 holds bin/node, include, share and the docs, as it does now.
#   - A Python 3.12 venv in /opt/py312-ci with pyx12 4.0.0 and defusedxml 0.7.1, installed by hash from PyPI.
#   - actionlint 1.7.7 in /opt/actionlint (on PATH as /usr/local/bin/actionlint), checked against the release's
#     checksums file and a pinned SHA-256.
#   - gitleaks through the repository's own tools/gitleaks/install.sh (/root/.cache/paidwhole/gitleaks/<version>/),
#     also linked at /tmp/claude-0/gitleaks/gitleaks, the path older briefs use, when /tmp/claude-0 exists.
#   - Starts both servers with HANDOFF's commands and waits until each answers a query.
#   - Clones the repository to /home/user/PhysicalTherapy if absent, checks out claude/build-platform (fast-forwarding
#     it when behind), installs the pre-push hook, runs pnpm install --frozen-lockfile with Node 24 first on PATH, adds
#     the ops worktree /home/user/ops (claude/build-ops) and one worktree per branch argument (each with pnpm install).
#   - Prints one line per part with its version, then OK, or FAILED and exactly what failed (exit status 1).
#
# Environment:
#   SETUP_CHECK=1   change nothing: no download, install, start, fetch or write; report what is present and current.
#   SETUP_PREFIX    put every path above under this directory instead of / (for testing; the distro packages,
#                   the pnpm store and the socket directory stay where they are).
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
NODE_VERSION=24.22.0
NODE_NPM=node-linux-x64
NODE_TGZ=node-linux-x64-24.22.0.tgz
NODE_TGZ_SHA256=eb2df9d66e51377d2812bab13836d5c43426f2541814e783ca1fcf34d9893467
NODE_TGZ_SHA512=sha512-O8CHD5heFxunkgkYr3y7DADTb73UQBiWe4hD2xxLbxyYyKP/+ZFfexX+W5cuswtxOcgtrGSKrU2JhzATGgzFPA==
NODE_DIST=https://nodejs.org/dist/v24.22.0
NODE_DIST_TXZ=node-v24.22.0-linux-x64.tar.xz
PYX12_VERSION=4.0.0
PY_REQUIREMENTS="pyx12==4.0.0 --hash=sha256:8e983b5a3a76a307bea3be9203fb32f0ea1580e13cb66ed60d8b028dc015d1cc --hash=sha256:d45c572e19971f7f67d65227bc7da158b01179ece2947a7038412dd935c59660
defusedxml==0.7.1 --hash=sha256:a352e7e428770286cc899e2542b6cdaedb2b4953ff269a210103ec58f6198a61 --hash=sha256:1bb3032db185915b62d7c6209c5a8792be6a32ab2fedacc84e01b52c51aa3e69"
ACTIONLINT_VERSION=1.7.7
ACTIONLINT_TGZ=actionlint_1.7.7_linux_amd64.tar.gz
ACTIONLINT_TGZ_SHA256=023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757
ACTIONLINT_BASE=https://github.com/rhysd/actionlint/releases/download/v1.7.7
PG_PASSWORD=test
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
PY_DIR="$P/opt/py312-ci"
ACTIONLINT_DIR="$P/opt/actionlint"
ACTIONLINT_LINK="$P/usr/local/bin/actionlint"
CACHE_HOME="$P/root/.cache"
LEGACY_GITLEAKS_PARENT="$P/tmp/claude-0"
LOG_DIR="$P/tmp/setup-container"

LINES=()
FAILED=()
REFUSED=()
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
as_pg() { (cd / && runuser -u postgres -- "$@"); }
pg_can_reach() { as_pg test -x "$1" 2>/dev/null; }
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
host_of() { local h="${1#*://}"; printf '%s' "${h%%/*}"; }
psql_bin() {
  if [ -x "$PG16_BIN/psql" ]; then printf '%s' "$PG16_BIN/psql"; else command -v psql 2>/dev/null; fi
}
tail_of() { tail -n "${2:-5}" "$1" 2>/dev/null | tr '\n' ' ' | cut -c1-400; }

if [ "$(id -u)" != 0 ]; then
  echo "setup-container: run this as root (it installs into /opt, runs apt-get and starts PostgreSQL as postgres)." >&2
  exit 1
fi
if checking; then
  export GIT_OPTIONAL_LOCKS=0
else
  mkdir -p "$LOG_DIR"
fi

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
# registry's integrity and to SRI, its SHA-256 equal to SHA256. A DEST already there that matches is reused.
npm_tarball() {
  local name="$1" version="$2" dest="$3" want256="$4" want512="$5" meta url integrity
  if [ -f "$dest" ] && [ "$(sha256 "$dest")" = "$want256" ] && [ "$(sri512 "$dest")" = "$want512" ]; then return 0; fi
  if ! meta="$(curl -fsS --retry 3 --connect-timeout 20 "https://registry.npmjs.org/${name/\//%2f}/$version" 2>&1)"; then
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

# ---- PostgreSQL 18 ---------------------------------------------------------------------------------------------
step_pg18() {
  local dir="$PG18_DIR" dl="$P/opt/pg18-dl" ex="$P/opt/pg18-extract" v bad how="present"
  if [ ! -x "$dir/bin/postgres" ]; then
    if checking; then line FAIL pg18 - "missing: no $dir/bin/postgres"; return 1; fi
    if [ -e "$dir" ]; then line FAIL pg18 - "$dir exists without bin/postgres; move it aside and run again"; return 1; fi
    log "installing PostgreSQL $PG18_VERSION ($PG18_NPM@$PG18_NPM_VERSION) into $dir"
    mkdir -p "$dl"
    npm_tarball "$PG18_NPM" "$PG18_NPM_VERSION" "$dl/$PG18_TGZ" "$PG18_TGZ_SHA256" "$PG18_TGZ_SHA512" || { line FAIL pg18 - "$ERR"; return 1; }
    rm -rf "$ex" "$dir.tmp.$$"
    mkdir -p "$ex"
    if ! tar -xzf "$dl/$PG18_TGZ" -C "$ex" || [ ! -x "$ex/package/native/bin/postgres" ]; then
      line FAIL pg18 - "$dl/$PG18_TGZ did not unpack to package/native/bin/postgres"
      return 1
    fi
    cp -a "$ex/package/native" "$dir.tmp.$$" || { line FAIL pg18 - "could not copy the binaries to $dir"; return 1; }
    bad="$(symlinks "$dir.tmp.$$" apply 2>&1)"
    if [ -n "$bad" ]; then line FAIL pg18 - "could not make the pg-symlinks.json links: $bad"; return 1; fi
    mv "$dir.tmp.$$" "$dir" || { line FAIL pg18 - "could not move the binaries to $dir"; return 1; }
    how="installed from $PG18_NPM@$PG18_NPM_VERSION"
  fi
  # The links come first: postgres needs libicu*.so.60, which exist only as links from pg-symlinks.json.
  if checking; then bad="$(symlinks "$dir" check 2>&1)"; else bad="$(symlinks "$dir" apply 2>&1)"; fi
  if [ -n "$bad" ]; then line FAIL pg18 - "pg-symlinks.json links missing or wrong in $dir: $bad"; return 1; fi
  v="$("$dir/bin/postgres" --version 2>&1)"
  if [ "$v" != "postgres (PostgreSQL) $PG18_VERSION" ]; then line FAIL pg18 - "$dir/bin/postgres reports '$v', not $PG18_VERSION"; return 1; fi
  if [ -f "$dl/$PG18_TGZ" ]; then
    if [ "$(sha256 "$dl/$PG18_TGZ")" != "$PG18_TGZ_SHA256" ]; then line FAIL pg18 "$PG18_VERSION" "$dl/$PG18_TGZ does not match the pinned SHA-256"; return 1; fi
    how="$how; tarball SHA-256 matches the pin"
  fi
  line ok pg18 "$PG18_VERSION" "$dir ($how; pg-symlinks.json applied)"
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
  OK_PG16=1
}

# ---- servers ---------------------------------------------------------------------------------------------------
# init_cluster NAME BINDIR DATA INITDB-ARGS...: an empty cluster at DATA, owned by postgres, superuser postgres:test.
init_cluster() {
  local name="$1" bindir="$2" data="$3" pw out parent
  shift 3
  parent="$(dirname "$data")"
  mkdir -p "$data" && chown postgres:postgres "$data" && chmod 700 "$data" || { ERR="could not create $data"; return 1; }
  # The clusters live in root's home, as they do now; /root is 0755 on the build machine, so postgres can reach them.
  if [ "$parent" = "$P/root" ] && ! pg_can_reach "$parent"; then chmod 755 "$parent"; INIT_NOTE="; $parent set to 0755 so postgres can reach it"; fi
  if ! pg_can_reach "$bindir" || ! pg_can_reach "$data"; then
    ERR="the postgres user cannot reach $bindir or $data (a parent directory is not searchable by it)"
    return 1
  fi
  pw="$(mktemp /tmp/setup-container-pw.XXXXXX)"
  printf '%s\n' "$PG_PASSWORD" >"$pw"
  chown postgres "$pw"
  chmod 600 "$pw"
  out="$LOG_DIR/initdb-$name.log"
  if ! as_pg "$bindir/initdb" -D "$data" -U postgres --pwfile="$pw" --encoding=UTF8 "$@" >"$out" 2>&1; then
    rm -f "$pw"
    ERR="initdb failed: $(tail_of "$out" 3)"
    return 1
  fi
  rm -f "$pw"
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
  local port="$1" sockpw="$2" data="$3" psql i out
  psql="$(psql_bin)"
  if [ -z "$psql" ]; then
    if [ "$(sed -n 8p "$data/postmaster.pid" 2>/dev/null | tr -d ' ')" = ready ]; then SERVER_VERSION="?"; QUERY_NOTE="postmaster.pid says ready (no psql client to query it)"; return 0; fi
    ERR="no psql client to query it, and $data/postmaster.pid does not say ready"
    return 1
  fi
  for i in $(seq 1 60); do
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
  local made=""
  if [ "$OK_PG18" != 1 ]; then line FAIL pg18-server - "skipped: PostgreSQL 18 is not installed"; return 1; fi
  if [ ! -f "$PG18_DATA/PG_VERSION" ]; then
    if checking; then line FAIL pg18-server - "no cluster at $PG18_DATA"; return 1; fi
    if ! locale -a 2>/dev/null | grep -qix 'en_US.utf8'; then
      { command -v locale-gen >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q locales; } >"$LOG_DIR/locales.log" 2>&1
      locale-gen en_US.UTF-8 >>"$LOG_DIR/locales.log" 2>&1
      locale -a 2>/dev/null | grep -qix 'en_US.utf8' || { line FAIL pg18-server - "the en_US.UTF-8 locale the cluster uses is missing and could not be made: $(tail_of "$LOG_DIR/locales.log" 2)"; return 1; }
    fi
    log "creating the PostgreSQL 18 cluster $PG18_DATA (port $PG18_PORT)"
    # en_US.utf8, spelled as the build's cluster has it in postgresql.conf and pg_database.
    init_cluster pg18 "$PG18_DIR/bin" "$PG18_DATA" --locale=en_US.utf8 --auth-local=trust --auth-host=scram-sha-256 || { line FAIL pg18-server - "$ERR"; return 1; }
    made="cluster created (initdb, superuser postgres:$PG_PASSWORD$INIT_NOTE), "
    printf "\n# tp: local PG18 cluster mirroring CI's postgres:18 service\nport = %s\nlisten_addresses = 'localhost'\nunix_socket_directories = '%s'\n" "$PG18_PORT" "$SOCK" >>"$PG18_DATA/postgresql.conf"
  fi
  if [ "$(cat "$PG18_DATA/PG_VERSION")" != 18 ]; then line FAIL pg18-server - "$PG18_DATA holds a PostgreSQL $(cat "$PG18_DATA/PG_VERSION") cluster, not 18"; return 1; fi
  start_server pg18 "$PG18_DIR/bin" "$PG18_DATA" "$PG18_PORT" "$PG18_LOG" || { line FAIL pg18-server - "$ERR"; return 1; }
  ready "$PG18_PORT" "" "$PG18_DATA" || { line FAIL pg18-server - "$ERR"; return 1; }
  if [ "$SERVER_VERSION" != "$PG18_VERSION" ] && [ "$SERVER_VERSION" != "?" ]; then line FAIL pg18-server "$SERVER_VERSION" "port $PG18_PORT answers as PostgreSQL $SERVER_VERSION, not $PG18_VERSION"; return 1; fi
  line ok pg18-server "$SERVER_VERSION" "$made$START_HOW: $PG18_DATA on port $PG18_PORT (trust on the socket); $QUERY_NOTE"
}

step_pg16_server() {
  local made=""
  if [ "$PG16_SKIP" = 1 ]; then line skip pg16-server - "PG16_SKIP=1"; return 0; fi
  if [ "$OK_PG16" != 1 ]; then line FAIL pg16-server - "skipped: PostgreSQL 16 is not installed"; return 1; fi
  if [ ! -f "$PG16_DATA/PG_VERSION" ]; then
    if checking; then line FAIL pg16-server - "no cluster at $PG16_DATA"; return 1; fi
    log "creating the PostgreSQL 16 cluster $PG16_DATA (port $PG16_PORT)"
    init_cluster pg16 "$PG16_BIN" "$PG16_DATA" --locale=C.UTF-8 --auth=scram-sha-256 || { line FAIL pg16-server - "$ERR"; return 1; }
    made="cluster created (initdb, superuser postgres:$PG_PASSWORD$INIT_NOTE), "
  fi
  if [ "$(cat "$PG16_DATA/PG_VERSION")" != 16 ]; then line FAIL pg16-server - "$PG16_DATA holds a PostgreSQL $(cat "$PG16_DATA/PG_VERSION") cluster, not 16"; return 1; fi
  start_server pg16 "$PG16_BIN" "$PG16_DATA" "$PG16_PORT" "$PG16_LOG" || { line FAIL pg16-server - "$ERR"; return 1; }
  ready "$PG16_PORT" "$PG_PASSWORD" "$PG16_DATA" || { line FAIL pg16-server - "$ERR"; return 1; }
  case "$SERVER_VERSION" in 16.* | "?") ;; *) line FAIL pg16-server "$SERVER_VERSION" "port $PG16_PORT answers as PostgreSQL $SERVER_VERSION, not 16"; return 1 ;; esac
  line ok pg16-server "$SERVER_VERSION" "$made$START_HOW: $PG16_DATA on port $PG16_PORT (scram-sha-256); $QUERY_NOTE"
}

# ---- Node ------------------------------------------------------------------------------------------------------
step_node() {
  local dir="$NODE_DIR" dl="$P/opt/node24-dl" ex="$P/opt/node24-extract" v how="present" want sum
  if [ ! -x "$dir/bin/node" ]; then
    if checking; then line FAIL node - "missing: no $dir/bin/node"; return 1; fi
    if [ -e "$dir" ]; then line FAIL node - "$dir exists without bin/node; move it aside and run again"; return 1; fi
    log "installing Node v$NODE_VERSION into $dir"
    mkdir -p "$dl"
    rm -rf "$ex" "$dir.tmp.$$"
    mkdir -p "$ex"
    if fetch "$NODE_DIST/SHASUMS256.txt" "$dl/SHASUMS256.txt" && fetch "$NODE_DIST/$NODE_DIST_TXZ" "$dl/$NODE_DIST_TXZ"; then
      want="$(awk -v f="$NODE_DIST_TXZ" '$2 == f { print $1 }' "$dl/SHASUMS256.txt")"
      sum="$(sha256 "$dl/$NODE_DIST_TXZ")"
      if [ -z "$want" ] || [ "$sum" != "$want" ]; then
        rm -f "$dl/$NODE_DIST_TXZ"
        line FAIL node - "$NODE_DIST_TXZ has SHA-256 $sum, not the '$want' SHASUMS256.txt lists; refused"
        return 1
      fi
      tar -xJf "$dl/$NODE_DIST_TXZ" -C "$ex" || { line FAIL node - "could not unpack $NODE_DIST_TXZ"; return 1; }
      local top="$ex/${NODE_DIST_TXZ%.tar.xz}"
      # The same files the build's /opt/node24 holds (node-bin-gen's package): bin/node, include, share, docs.
      mkdir -p "$dir.tmp.$$/bin" && cp -a "$top/bin/node" "$dir.tmp.$$/bin/" && cp -a "$top/include" "$top/share" "$top"/*.md "$top/LICENSE" "$dir.tmp.$$/" || { line FAIL node - "could not copy Node into $dir"; return 1; }
      how="installed from nodejs.org, SHA-256 checked against SHASUMS256.txt"
    else
      local refused="$ERR"
      log "nodejs.org: $refused; using the npm package $NODE_NPM@$NODE_VERSION"
      npm_tarball "$NODE_NPM" "$NODE_VERSION" "$dl/$NODE_TGZ" "$NODE_TGZ_SHA256" "$NODE_TGZ_SHA512" || { line FAIL node - "nodejs.org: $refused; npm: $ERR"; return 1; }
      tar -xzf "$dl/$NODE_TGZ" -C "$ex" && [ -x "$ex/package/bin/node" ] || { line FAIL node - "$dl/$NODE_TGZ did not unpack to package/bin/node"; return 1; }
      cp -a "$ex/package" "$dir.tmp.$$" || { line FAIL node - "could not copy Node into $dir"; return 1; }
      how="nodejs.org: $refused, so installed from registry.npmjs.org $NODE_NPM@$NODE_VERSION, pinned SHA-256 and registry SHA-512 checked"
    fi
    mv "$dir.tmp.$$" "$dir" || { line FAIL node - "could not move Node into $dir"; return 1; }
  elif [ -f "$dl/$NODE_TGZ" ]; then
    if [ "$(sha256 "$dl/$NODE_TGZ")" != "$NODE_TGZ_SHA256" ]; then line FAIL node - "$dl/$NODE_TGZ does not match the pinned SHA-256"; return 1; fi
    how="present; from $NODE_NPM@$NODE_VERSION, tarball SHA-256 matches the pin"
  elif [ -f "$dl/$NODE_DIST_TXZ" ] && [ -f "$dl/SHASUMS256.txt" ]; then
    want="$(awk -v f="$NODE_DIST_TXZ" '$2 == f { print $1 }' "$dl/SHASUMS256.txt")"
    if [ "$(sha256 "$dl/$NODE_DIST_TXZ")" != "$want" ]; then line FAIL node - "$dl/$NODE_DIST_TXZ does not match its SHASUMS256.txt"; return 1; fi
    how="present; from nodejs.org, tarball SHA-256 matches SHASUMS256.txt"
  fi
  v="$("$dir/bin/node" --version 2>&1)"
  if [ "$v" != "v$NODE_VERSION" ]; then line FAIL node - "$dir/bin/node reports '$v', not v$NODE_VERSION"; return 1; fi
  line ok node "$v" "$dir/bin/node ($how)"
  OK_NODE=1
}

# ---- Python ----------------------------------------------------------------------------------------------------
step_python() {
  local py="$PY_DIR/bin/python" pv have how="present" req
  if [ ! -x "$py" ]; then
    if checking; then line FAIL python - "missing: no $py"; return 1; fi
    if [ -e "$PY_DIR" ]; then line FAIL python - "$PY_DIR exists without bin/python; move it aside and run again"; return 1; fi
    if [ ! -x /usr/bin/python3.12 ] || ! /usr/bin/python3.12 -I -c 'import ensurepip, venv' 2>/dev/null; then
      log "installing python3.12 and python3.12-venv from the Ubuntu archive"
      { apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q python3.12 python3.12-venv; } >"$LOG_DIR/apt-python.log" 2>&1 || { line FAIL python - "apt-get install python3.12-venv failed: $(tail_of "$LOG_DIR/apt-python.log" 3)"; return 1; }
    fi
    log "creating the venv $PY_DIR"
    /usr/bin/python3.12 -m venv "$PY_DIR" >"$LOG_DIR/venv.log" 2>&1 || { line FAIL python - "python3.12 -m venv failed: $(tail_of "$LOG_DIR/venv.log" 3)"; return 1; }
    how="created from /usr/bin/python3.12"
  fi
  pv="$("$py" -B -I -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>&1)"
  case "$pv" in 3.12.*) ;; *) line FAIL python - "$py is Python $pv, not 3.12"; return 1 ;; esac
  have="$("$py" -B -I -c 'from importlib.metadata import version; print(version("pyx12"))' 2>/dev/null)"
  if [ "$have" != "$PYX12_VERSION" ]; then
    if checking; then line FAIL python "$pv" "pyx12 is '${have:-not installed}' in $PY_DIR, not $PYX12_VERSION"; return 1; fi
    log "installing pyx12 $PYX12_VERSION into $PY_DIR (by hash)"
    req="$LOG_DIR/py-requirements.txt"
    printf '%s\n' "$PY_REQUIREMENTS" >"$req"
    "$PY_DIR/bin/pip" install --disable-pip-version-check --no-input --no-cache-dir --no-deps --only-binary :all: --require-hashes -r "$req" >"$LOG_DIR/pip.log" 2>&1 || { line FAIL python "$pv" "pip install pyx12 failed: $(tail_of "$LOG_DIR/pip.log" 3)"; return 1; }
    how="$how; pyx12 installed by hash"
  fi
  have="$("$py" -B -I -c 'import pyx12, defusedxml; from importlib.metadata import version; print(version("pyx12"), version("defusedxml"))' 2>&1)" || { line FAIL python "$pv" "import pyx12 fails: $have"; return 1; }
  line ok python "$pv" "$py ($how; import pyx12 works; pyx12 ${have% *}, defusedxml ${have#* })"
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
  local url cur dirty hook out
  if [ ! -d "$CLONE_DIR/.git" ]; then
    if checking; then line FAIL repo - "no clone at $CLONE_DIR"; return 1; fi
    if [ -e "$CLONE_DIR" ] && [ -n "$(ls -A "$CLONE_DIR" 2>/dev/null)" ]; then line FAIL repo - "$CLONE_DIR exists and is not a git clone"; return 1; fi
    log "cloning $REPO_URL into $CLONE_DIR"
    mkdir -p "$(dirname "$CLONE_DIR")"
    out="$(git clone -q "$REPO_URL" "$CLONE_DIR" 2>&1)" || { line FAIL repo - "git clone $REPO_URL failed: $(printf '%s' "$out" | tail -n 1)"; return 1; }
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
  fi
  cur="$(git -C "$CLONE_DIR" symbolic-ref -q --short HEAD)"
  if [ "$cur" != "$BASE_BRANCH" ]; then
    if checking; then line FAIL repo - "$CLONE_DIR is on '${cur:-a detached HEAD}', not $BASE_BRANCH"; return 1; fi
    dirty="$(git -C "$CLONE_DIR" status --porcelain --untracked-files=no)"
    if [ -n "$dirty" ]; then line FAIL repo - "$CLONE_DIR is on '${cur:-a detached HEAD}' with uncommitted changes, so $BASE_BRANCH was not checked out"; return 1; fi
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

pnpm_version() { # pnpm's version, read from its package.json so nothing runs and nothing is written
  local p
  p="$(PATH="$NODE_DIR/bin:$PATH" command -v pnpm 2>/dev/null)" || return 1
  p="$(readlink -f "$p")"
  awk -F'"' '$2 == "version" { print $4; exit }' "$(dirname "$(dirname "$p")")/package.json" 2>/dev/null
}

# modules DIR LABEL: pnpm install --frozen-lockfile in DIR with Node 24 first on PATH; in check mode, whether
# node_modules was installed from DIR's pnpm-lock.yaml as it is now.
modules() {
  local dir="$1" label="$2" out
  if checking; then
    if [ -f "$dir/node_modules/.modules.yaml" ] && cmp -s "$dir/pnpm-lock.yaml" "$dir/node_modules/.pnpm/lock.yaml"; then
      MODULES="node_modules match pnpm-lock.yaml"
      return 0
    fi
    MODULES="node_modules missing or not installed from the current pnpm-lock.yaml (pnpm install --frozen-lockfile)"
    return 1
  fi
  out="$LOG_DIR/pnpm-install-$label.log"
  if ! (cd "$dir" && PATH="$NODE_DIR/bin:$PATH" pnpm install --frozen-lockfile --config.confirmModulesPurge=false) >"$out" 2>&1; then
    MODULES="pnpm install --frozen-lockfile failed in $dir: $(tail_of "$out" 3)"
    return 1
  fi
  MODULES="pnpm install --frozen-lockfile done"
}

step_pnpm() {
  local want have out
  if [ "$OK_CLONE" != 1 ] || [ "$OK_NODE" != 1 ]; then line FAIL pnpm - "skipped: needs Node 24 and the clone"; return 1; fi
  want="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["packageManager"].split("@")[1].split("+")[0])' "$CLONE_DIR/package.json" 2>/dev/null)"
  have="$(pnpm_version)"
  if [ -z "$have" ]; then
    if checking; then line FAIL pnpm - "pnpm is not on PATH"; return 1; fi
    log "installing pnpm $want with npm"
    out="$(PATH="$NODE_DIR/bin:$PATH" npm install -g "pnpm@$want" 2>&1)" || { line FAIL pnpm - "pnpm is missing and npm install -g pnpm@$want failed: $(printf '%s' "$out" | tail -n 1)"; return 1; }
    have="$(pnpm_version)"
  fi
  modules "$CLONE_DIR" main || { line FAIL pnpm "$have" "$MODULES"; return 1; }
  if [ "$have" = "$want" ]; then
    line ok pnpm "$have" "$(PATH="$NODE_DIR/bin:$PATH" command -v pnpm), the packageManager version; $CLONE_DIR: $MODULES"
  else
    line ok pnpm "$have" "packageManager pins $want, which pnpm switches to by itself; $CLONE_DIR: $MODULES"
  fi
  OK_MODULES=1
}

step_playwright() { # the browsers the repository's Playwright needs, from the base image (not downloaded here)
  local pw browsers revs dir missing="" r
  if [ "$OK_MODULES" != 1 ]; then line FAIL playwright - "skipped: needs the clone's node_modules"; return 1; fi
  pw="$(python3 -I -c 'import json, sys; d = json.load(open(sys.argv[1]))
print({**d.get("dependencies", {}), **d.get("devDependencies", {})}["@playwright/test"])' "$CLONE_DIR/apps/web/package.json" 2>/dev/null)"
  browsers="$CLONE_DIR/node_modules/.pnpm/playwright-core@$pw/node_modules/playwright-core/browsers.json"
  revs="$(python3 -I -c 'import json, sys
for b in json.load(open(sys.argv[1]))["browsers"]:
    if b["name"] in ("chromium", "chromium-headless-shell"):
        print(b["name"].replace("-", "_") + "-" + b["revision"])' "$browsers" 2>/dev/null)"
  [ -n "$revs" ] || { line FAIL playwright "$pw" "cannot read $browsers"; return 1; }
  dir="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  for r in $revs; do [ -d "$dir/$r" ] || missing="$missing $r"; done
  if [ -n "$missing" ]; then
    line FAIL playwright "$pw" "missing in $dir:$missing (pnpm --filter @tp/web exec playwright install chromium)"
    return 1
  fi
  line ok playwright "$pw" "$(printf '%s' "$revs" | tr '\n' ' ' | sed 's/ $//') in $dir (from the base image)"
}

# worktree BRANCH DIR PART INSTALL: a worktree of the clone at DIR on BRANCH, current with origin; INSTALL=1 also
# runs pnpm install there.
worktree() {
  local branch="$1" dir="$2" part="$3" install="$4" cur common want out detail
  if [ "$OK_CLONE" != 1 ]; then line FAIL "$part" - "skipped: needs the clone"; return 1; fi
  if [ ! -e "$dir/.git" ]; then
    if checking; then line FAIL "$part" - "no worktree at $dir for $branch"; return 1; fi
    if [ -e "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then line FAIL "$part" - "$dir exists and is not a worktree"; return 1; fi
    [ -n "$(remote_head "$branch")" ] || { line FAIL "$part" - "$branch is not on origin"; return 1; }
    if ! git -C "$CLONE_DIR" rev-parse --verify -q "refs/heads/$branch" >/dev/null; then
      git -C "$CLONE_DIR" branch -q --track "$branch" "origin/$branch" || { line FAIL "$part" - "could not create the branch $branch from origin"; return 1; }
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
  worktree "$branch" "$dir" "$(basename "$dir")" 1
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
