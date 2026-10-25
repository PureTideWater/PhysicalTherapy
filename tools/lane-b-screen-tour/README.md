# Lane B screen tour (tooling)

Captures screens of the PaidWhole web app from its production build, on synthetic data only, and builds a private
gallery page. The first tour (2026-10-25, built from claude/build-platform 9c57d2d) took 30 screenshots, 26 at 1280 px
and 4 at 390 px, in the light theme. They are published at https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c, private to
the co-founder's account. That tour cost about 0.6M agent tokens and about 1 hour, of which about 11 minutes held the
heavy lock. Its brief is `workflow-scripts/lane-b-screen-tour-wf_8f5524d1-dad.js`.

## The parts
- **`setup.sh`** makes a detached worktree of `TOUR_REF` at `/home/user/screens` and installs its packages under the lock. `TOUR_REF` defaults to `origin/claude/build-platform`; a PR's before and after shots use its base, then its head. It then copies these files into `$TOUR_DIR`, links `node_modules` and writes the `package.json`.
- **`env.sh`** gives every step the same synthetic environment:
  - E2E_DATABASE=tp_e2e_screens on PG18 at localhost:5433, and E2E_PORT=3297, so nothing collides with other e2e runs;
  - the development master key. It is derived at run time from `packages/db/src/crypto/key-provider.ts`, the key `apps/web/playwright.config.ts` gives the e2e server. It is never written to a file, so gitleaks never meets it.
- **`build.sh`** runs `pnpm run build` once, then execs `serve.sh`. Run it under one hold of `flock /tmp/laneb-heavy.lock`, which then covers the build and the server's whole life.
- **`serve.sh`** prepares the database with `apps/web/e2e/prepare.ts`, as the repository's e2e webServer does: it drops and recreates tp_e2e_screens and seeds the personas.
  - A capture registers the platform administrator's hardware key once per database, so every capture needs a fresh prepare.
  - It then starts the standalone server and touches `$TOUR_DIR/ready` once `/sign-in` answers.
  - It stops the server at the first of three things: `touch $TOUR_DIR/stop`, `TOUR_MINUTES` (default 22), or three missed answers in a row. It stops it with `fuser -k 3297/tcp`.
- **`run.sh`** waits for `ready`, then runs two Playwright projects:
  - `populate`: the repository's own e2e files, unchanged and whole (layout-1280, packets, reconciliation, monitoring, billing and contracts), except the tests its `--grep-invert` names. They fill the screens through the real worker jobs.
  - `capture`: `capture/tour.spec.ts` alone signs in as each role with the e2e helpers and saves full-page PNGs to `$TOUR_DIR/png`, recording each in `shots.json` (file, route, role and width).
- **`redo.sh`** retakes one screen on a fresh database: prepare, serve, the contracts journey, then `capture/contract.spec.ts`. Then it stops the server, drops the database and removes the temporary directories. `capture/mapping.spec.ts` is kept for the mapping screen; point redo.sh at it to use it. Both retake specs read the `ids.json` a tour writes, so they run only after one.
- **`manifest.py`, `gallery.json`, `gallery-build.py` and `gallery-page.html`** belong to the 2026-10-25 tour.
  - `manifest.py` is hard-wired to its 30 screens and their hand curation: 02 from `probe/home-ledger.png`, 24 from the console's release probe, 27 from `probe/phone-home-ledger.png`, and 16 from page 2 of the PDF.
  - `gallery.json` holds that tour's captions; its `file` paths name that session's scratchpad.
  - `gallery-build.py <dir>` fills `gallery-page.html` from a `gallery.json` in `<dir>`. Run it from this directory.
  - A new tour writes its own manifest from `shots.json`, adding a theme field to each entry, and its own `gallery.json`.

## Set-up and a run (any session)
1. `export TOUR_DIR=<this session's scratchpad>/screens`. Every script and spec reads it; nothing names a session.
2. `bash tools/lane-b-screen-tour/setup.sh`. Optionally set `TOUR_REF` first.
3. From `$TOUR_DIR`:
   - `TOUR_MINUTES=<n> flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1`, in the background. 22 minutes was enough for 30 screens; give a whole-app capture 90.
   - Then `bash run.sh`.
   - When it ends, `touch $TOUR_DIR/stop`.
4. **Check that the lock and the server ended together.** build.log must say "server stopped", and `fuser 3297/tcp` must print nothing. If it prints a process, end it with `fuser -k 3297/tcp`, and run nothing heavy until it has gone. (The 2026-10-25 version waited on `lsof`: it released the lock at once while the server ran on for 7 minutes. serve.sh now waits on the server's answers.)
5. **Clean up:**
   - `PGPASSWORD=test psql -h localhost -p 5433 -U postgres -d postgres -c 'DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)'`;
   - `rm -rf /tmp/tp-e2e-tp_e2e_screens-*`.

**Where the pictures go.** The repository is public. Publish the PNGs as a private artifact gallery, as on 2026-10-25, and commit to claude/build-ops only the findings, the manifest and any small crop a finding needs. A later tour reads the gallery's files to compare.

**Growing the capture.** Change `capture/tour.spec.ts` here on claude/build-ops, not the copy in `$TOUR_DIR`. Re-run `setup.sh` to copy it, and push it with the work, so every later tour reuses it.
- The UX/UI review (`designs/lane-b-ux-review-brief.md`) extends it to every page, the dark tokens, and the empty, loading and error states.
- The app has dark tokens but no theme switch and no `prefers-color-scheme` rule. To capture dark, set `data-theme="dark"` on `document.documentElement` after each load, as `apps/web/e2e/brand.spec.ts` does.
