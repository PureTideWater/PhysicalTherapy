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

`env.sh` needs TP_LOCAL_MASTER_KEY in the environment: the development master key the repository's e2e config gives
its server (apps/web/playwright.config.ts, developmentMasterKey); it is not kept here. Before reusing: these files name the session scratchpad of 2026-10-25
(`/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/screens`); point them at the
new session's scratchpad first. Drop tp_e2e_screens and stop the server afterwards.
