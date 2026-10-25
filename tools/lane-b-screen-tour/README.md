# Lane B screen tour (tooling)

Captures about 30 screens of the PaidWhole web app from its production build on synthetic data only, and builds the
gallery page published on 2026-10-25 (https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c, private to the co-founder's
account; built from claude/build-platform 9c57d2d). Cost: about 0.6M agent tokens, about 1 hour, about 11 minutes of
the heavy lock.

How it ran (workflow-scripts/lane-b-screen-tour-wf_8f5524d1-dad.js is the brief):
1. A detached worktree of the latest claude/build-platform at /home/user/screens, `pnpm install --frozen-lockfile`.
2. `build.sh`: `pnpm build` once (under `flock /tmp/laneb-heavy.lock`). `env.sh` sets E2E_DATABASE=tp_e2e_screens and
   E2E_PORT=3297 so nothing collides with other e2e runs; PG18 at localhost:5433.
3. `serve.sh`: `apps/web/e2e/prepare.ts` (seeds practices, people, agreements), then the standalone server.
4. `run.sh`: five of the repository's own e2e journeys, unchanged (layout-1280, packets' first test, reconciliation,
   monitoring, billing's first test), fill the screens through the real worker jobs; then `capture/tour.spec.ts`
   (through `screens.config.ts`) signs in as each role with the e2e helpers and saves full-page PNGs (1280 px and
   390 px). `redo.sh` with `capture/contract.spec.ts` and `capture/mapping.spec.ts` retakes single screens.
5. `manifest.py` writes manifest.json; a second agent opened every PNG and wrote `gallery.json` (captions, checks).
6. `gallery-build.py <dir>` fills `gallery-page.html` from gallery.json; publish it with the PNGs as `files`.

## Set-up (any session)
1. `export TOUR_DIR=<this session's scratchpad>/screens` (every script and spec reads it; nothing names a session).
2. `bash tools/lane-b-screen-tour/setup.sh`: the detached worktree `/home/user/screens` of the latest
   claude/build-platform, its `pnpm install` under the lock, and these files copied into `$TOUR_DIR` with its
   `node_modules` link and `package.json`.
3. `export TP_LOCAL_MASTER_KEY=<the development master key>`: the one the repository's e2e config gives its server
   (`apps/web/playwright.config.ts`, developmentMasterKey in `apps/web/src/lib/server/config.ts`). It is not kept here,
   so gitleaks never meets it.
4. From `$TOUR_DIR`: `flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1` in the background (one hold of the
   lock for the build and the server's life), then `bash run.sh`; `touch $TOUR_DIR/stop` ends the server. Afterwards drop `tp_e2e_screens` and remove
   `/tmp/tp-e2e-tp_e2e_screens-*` (redo.sh's last lines do both).

`gallery.json` is the record of the 2026-10-25 tour (its `file` paths name that session's scratchpad); a new tour writes
its own. The capture covers the 30 screens of `capture/tour.spec.ts` at both widths in the light theme; the UX/UI review
(`designs/lane-b-ux-review-brief.md`) extends it to every page, the dark theme and the empty, loading and error states.
