#!/usr/bin/env bash
# Serves the production build the way the container image does (apps/web/Dockerfile): the
# standalone server.js with the static assets copied beside it. Run `next build` first.
# PORT (default 3000) and BIND_HOST (default 127.0.0.1) choose where it listens.
set -euo pipefail
cd "$(dirname "$0")/.."
standalone=.next/standalone/apps/web
if [ ! -f "$standalone/server.js" ]; then
  echo "start-standalone: no standalone build; run pnpm --filter @tp/web build first" >&2
  exit 1
fi
rm -rf "$standalone/.next/static"
cp -R .next/static "$standalone/.next/static"
if [ -d public ]; then
  rm -rf "$standalone/public"
  cp -R public "$standalone/public"
fi
exec env PORT="${PORT:-3000}" HOSTNAME="${BIND_HOST:-127.0.0.1}" NODE_ENV=production node "$standalone/server.js"
