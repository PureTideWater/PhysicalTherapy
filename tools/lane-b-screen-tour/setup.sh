#!/usr/bin/env bash
# Set-up for a tour in any session: a detached worktree of the latest claude/build-platform at /home/user/screens with
# its packages, and the tour's working directory (TOUR_DIR, a folder in the session's scratchpad) holding these files.
#   TOUR_DIR=<scratchpad>/screens bash tools/lane-b-screen-tour/setup.sh
set -euo pipefail
: "${TOUR_DIR:?set TOUR_DIR to the tour working directory, a folder in this session scratchpad}"
here=$(cd "$(dirname "$0")" && pwd)
export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH
ref="${TOUR_REF:-origin/claude/build-platform}"  # a PR's before and after: its base, then its head
git -C /home/user/PhysicalTherapy fetch -q origin claude/build-platform '+refs/heads/co-001/*:refs/remotes/origin/co-001/*'
if [ -d /home/user/screens ]; then
  if [ -n "$(git -C /home/user/screens status --porcelain)" ]; then echo "/home/user/screens has local changes; look before reusing it"; exit 1; fi
  git -C /home/user/screens checkout -q --detach "$ref"
else
  git -C /home/user/PhysicalTherapy worktree add -q --detach /home/user/screens "$ref"
fi
(cd /home/user/screens && flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile)
mkdir -p "$TOUR_DIR/capture"
cp "$here"/build.sh "$here"/serve.sh "$here"/run.sh "$here"/redo.sh "$here"/env.sh "$here"/screens.config.ts "$here"/manifest.py "$TOUR_DIR"/
cp "$here"/capture/*.spec.ts "$TOUR_DIR/capture/"
ln -sfn /home/user/screens/apps/web/node_modules "$TOUR_DIR/node_modules"
printf '%s\n' '{ "name": "screen-tour-scratch", "private": true, "type": "module" }' >"$TOUR_DIR/package.json"
echo "ready at $(git -C /home/user/screens rev-parse --short HEAD): from \$TOUR_DIR, TOUR_MINUTES=<n> flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1 in the background, then bash run.sh (README, Set-up)"
