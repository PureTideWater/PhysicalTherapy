# Lane B screen tour (tooling)

Captures screens of the PaidWhole web app from its production build, on synthetic data only, and builds a private
gallery page.
- **The first tour** (2026-10-25, built from claude/build-platform 9c57d2d) took 30 screenshots, 26 at 1280 px and 4 at 390 px, in the light theme.
  - They are published at https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c, private to the co-founder's account.
  - It cost about 0.6M agent tokens and about 1 hour, of which about 11 minutes held the heavy lock. Its brief is `workflow-scripts/lane-b-screen-tour-wf_8f5524d1-dad.js`.
- **The whole-app tour** (2026-10-26, the UX/UI and brand baseline review, built from 6ddd587) captures every page the route map `designs/lane-b-ux-review/route-map.json` marks reachable. Its run's numbers are under "The whole-app capture" below.

## The parts
- **`setup.sh`** makes a detached worktree of `TOUR_REF` at `/home/user/screens` and installs its packages under the lock.
  - `TOUR_REF` defaults to `origin/claude/build-platform`; a PR's before and after shots use its base, then its head.
  - To re-serve an existing build, set `TOUR_REF` to the commit it was built from (`git -C /home/user/screens rev-parse HEAD`). Otherwise a moved branch checks out newer sources under the old build, and `serve.sh` prepares the database from those sources.
  - It installs under the lock, so it waits while a server holds it. Mid-session, copy a changed spec with `cp`, then re-run `setup.sh` after `stop`.
  - It then copies the scripts and specs into `$TOUR_DIR`, links `node_modules` and writes the `package.json`.
  - It does not copy `build-only.sh`, `reserve.sh` or `batches.py`: run those by their path here.
- **`env.sh`** gives every step the same synthetic environment:
  - E2E_DATABASE=tp_e2e_screens on PG18 at localhost:5433, and E2E_PORT=3297, so nothing collides with other e2e runs;
  - the development master key. It is derived at run time from `packages/db/src/crypto/key-provider.ts`, the key `apps/web/playwright.config.ts` gives the e2e server. It is never written to a file, so gitleaks never meets it.
- **`build.sh`** runs `pnpm run build` once, then execs `serve.sh`. Run it under one hold of `flock /tmp/laneb-heavy.lock`, which then covers the build and the server's whole life.
- **`build-only.sh`** runs the build alone and releases the lock when it ends (about 80 s at 6ddd587), for example while a spec is still being written. `reserve.sh` then serves that build.
- **`reserve.sh`** re-serves the existing build under its own hold of the lock, from a fresh prepare: it writes its pid, clears `stop` and `ready`, and execs `serve.sh`. Use it for every re-run instead of rebuilding. It logs to `serve.log`, which must say "server stopped" at the end, as build.log does.
- **`serve.sh`** prepares the database with `apps/web/e2e/prepare.ts`, as the repository's e2e webServer does: it drops and recreates tp_e2e_screens and seeds the personas.
  - A capture registers each internal persona's hardware key once per database, so every full capture needs a fresh prepare.
  - It then starts the standalone server and touches `$TOUR_DIR/ready` once `/sign-in` answers.
  - It stops the server at the first of three things: `touch $TOUR_DIR/stop`, `TOUR_MINUTES` (default 22), or three missed answers in a row. It stops it with `fuser -k 3297/tcp`.
- **`run.sh`** waits for `ready`, then runs two Playwright projects:
  - `populate`: the route map's seven populate specs, unchanged and whole (layout-1280, packets, reconciliation, monitoring, billing, contracts and reports). One test is left out with `--grep-invert "webhook route"`: billing.spec.ts's refusal check records nothing, so no screen depends on it. They fill the screens through the real worker jobs.
  - `capture`: `capture/tour.spec.ts` (below).
  - `TOUR_SKIP_POPULATE=1` skips the populate project, for a retake on the database an earlier run populated. Without it, run.sh clears the sessions kept in `$TOUR_DIR/auth`, since the database is fresh.
- **`capture/tour.spec.ts`** is six tests run in order in one worker: the records, public pages and sign-in, the console and account pages, the practice workflow, the practice set-up, and the writes taken last.
  - **What it shoots:** every reachable route as the map's first persona, at 1280x800 light, 1280x800 dark (tokens only) and 390x844 light. Full page, device scale factor 1.
    - **Dark:** after the light shot at 1280, it sets `data-theme="dark"` on `<html>` (as `apps/web/e2e/brand.spec.ts` does), settles, shoots, and removes it.
    - **States:** each empty, loading, error and not-found state and each interaction the map names, at 1280 and 390, light. A second persona appears only where the map says the page differs by role (a viewer, the internal shell, a firm).
  - **Loading states:** a route's `loading.tsx` is held on a client navigation. The spec opens another page, holds only the target's RSC request (header `rsc: 1`, no `next-router-prefetch`) with `page.route`, and clicks the in-app link. It shoots once `[data-slot="loading-state"]` shows, then lets the request go. Pending submits ("Working...", "Sending...", "Waiting for the key...") are held the same way and then aborted, so nothing is sent.
  - **Skips:** a state the map names that cannot be shown on synthetic data is recorded in `skipped` with its reason, never faked. So is a shot that fails, with the first line of its error. A full run also lists every not-reachable route with the map's reason, and any reachable route left without a shot.
  - **Writes:** the spec writes only the on-screen steps the map names, with synthetic values:
    - the public audit request, a support ticket, the screening send and its conversion;
    - the reviewer's support grants (SYN-TOUR-1 to 4 on PACKETS, PACKET DEADLINES, REPORTS and LAYOUT), also opened for a `p.support-access.empty` retake, whose shot opens SYN-TOUR-4;
    - the packet's approval request;
    - and, last, each undone at once: a queued audit report, SYN-CON-E2E ended, the billing firm suspended then reinstated, an empty group created, lockout locked, maintenance on then off.
    - It never publishes terms, switches the global model kill switch or approves another split.
  - **Its browser** rasterizes text as the repository's e2e browser does (no hinting, grayscale antialiasing, `e2e/fonts.conf`; ADR 0058), so the tour's pixels match the brand baselines' rendering.
  - **Sessions:** each persona signs in once per run. Sessions are kept in `$TOUR_DIR/auth`, so a retake on the same database (TOUR_SKIP_POPULATE=1) reuses them, internal personas included. A session that ends mid-run signs in again: the internal personas keep the page that holds their virtual key open for this.
- **Shot ids and retakes.** Each shot's id is `<route key>.<variant>.<width>`, with `.1280-dark` for the dark one. Examples: `p.cases.default.1280`, `p.cases.loading.390`, `console.organization.error-forbidden.1280`.
  - `TOUR_ONLY` (comma-separated ids; a trailing `*` matches a prefix, e.g. `p.packet.*`) restricts the capture to those shots. A restricted run merges its shots into the existing `shots.json`. A retake that fails keeps the earlier shot.
  - Some steps run once per database: the reviewer's and support-expiry's key registration, the invited persona's new password, the screening send, and lockout's lock. Their retakes need a fresh prepare, and the spec says so in the skip.
- **What a run writes in `$TOUR_DIR`:**
  - `png/<id>.png`;
  - `shots.json`: `{ shots, skipped, emails }`. Each shot is `{ file, id, path, routePattern, role, width, theme, state, note }`: theme is `light` or `dark (tokens only)`; state is `default`, `empty`, `loading`, `error`, `not-found` or `interaction:<name>`; role is the persona key or `public`. Each skip is `{ shot, route, reason }`. The note names the 2026-10-25 shot it replaces, where one does (for example "Legacy tour shot 03-uploads").
  - `ids.json`: the records the shots open. It keeps the keys the retake specs and the 2026-10-25 tour read.
  - `progress.log`: one line per shot or skip, for watching a run.
- **`batches.py <TOUR_DIR>`** splits `shots.json` into `batches/batch-NN.json` for the image checkers. Each batch is one area (practice workflow, practice set-up, console and account, public and sign-in), at most 45 shots, in route order. `batches/index.json` lists each batch's area and count.
- **`redo.sh`** retakes one screen on a fresh database: prepare, serve, the contracts journey, then `capture/contract.spec.ts`. Then it stops the server, drops the database and removes the temporary directories.
  - `capture/mapping.spec.ts` is kept for the mapping screen; point redo.sh at it to use it.
  - Both retake specs read the `ids.json` a tour writes, so they run only after one. The whole-app tour already takes both screens (`p.contract-version.default`, `p.mapping.all-plans`); prefer a TOUR_ONLY retake.
- **`manifest.py`, `gallery.json`, `gallery-build.py` and `gallery-page.html`** belong to the 2026-10-25 tour.
  - `manifest.py` is hard-wired to its 30 screens and their hand curation: 02 from `probe/home-ledger.png`, 24 from the console's release probe, 27 from `probe/phone-home-ledger.png`, and 16 from page 2 of the PDF.
  - `gallery.json` holds that tour's captions; its `file` paths name that session's scratchpad.
  - `gallery-build.py <dir>` fills `gallery-page.html` from a `gallery.json` in `<dir>`. Run it from this directory.
  - A new tour writes its own manifest from `shots.json` (which now carries the theme) and its own `gallery.json`.

## From another lane (a Lane A session, or any session but Lane B's)
The UX and brand reviewer (`.claude/agents/ux-brand-reviewer.md`) asks for before and after shots of every screen a pull
request changes. This tool takes them in any session.
- **What it needs:** PostgreSQL 18 on port 5433, Playwright's Chromium in `/opt/pw-browsers`, Node 24 and pnpm, all of
  which `tools/setup-container.sh` (on `claude/build-ops`) installs. Fetch it and run it as Lane B's sessions do:
  `git -C <checkout> fetch -q origin claude/build-ops && git -C <checkout> show FETCH_HEAD:tools/setup-container.sh >
  /tmp/setup-container.sh && bash /tmp/setup-container.sh`, until it prints OK.
- **One check:** `pg_isready -h localhost -p 5433 && ls /opt/pw-browsers >/dev/null && echo ready`.
- **The lock:** every heavy step runs under `flock /tmp/laneb-heavy.lock`, one at a time, as below. In a container of
  its own the lock is free; it matters where several sessions share one.
- **A pull request's shots:** two runs of "Set-up and a run" below, each with its own `TOUR_DIR`. The first has
  `TOUR_REF` set to the PR's base commit, the second to its head. Set `TOUR_ONLY` to the sample's ids (prefixes with a
  trailing `*` are fine). Then `python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> <id-prefix ...>` cuts each shot
  into window-height tiles (800 px at 1280, 844 px at 390) under `<TOUR_DIR>/tiles/`, with `index.json`. Give the
  reviewer the tiles of both runs and their `shots.json` entries.
- **The sample** (the reviewer reports any changed route outside it as "not seen, by sample"):
  - every screen and state the diff changes, at 1280 and 390 px light, and 1280 px dark (tokens only);
  - after a change to a shared component, a token or the shell: one shot per layout, at both widths and in the dark
    set, as well;
  - the screens of every baseline finding the PR says it fixes (`designs/lane-b-ux-review.md`, the finding's
    "Screens").
  List the sample in the PR's reviewer table.
- **A route the tour does not take yet:** either lane adds its `cap(...)` calls to `capture/tour.spec.ts` here on
  `claude/build-ops`, and its entry to `designs/lane-b-ux-review/route-map.json`. Pull first, and push through the
  pre-push hook.
- **Data:** synthetic only. The repository is public, so PNGs and tiles never go on a branch. Share them as a private
  gallery (`tools/lane-b-screen-gallery`).

## Set-up and a run (any session)
1. `export TOUR_DIR=<this session's scratchpad>/screens`. Every script and spec reads it; nothing names a session.
2. `bash tools/lane-b-screen-tour/setup.sh`. Optionally set `TOUR_REF` first. Re-run it after every change here: it copies the files into `$TOUR_DIR`.
3. From `$TOUR_DIR`:
   - `TOUR_MINUTES=90 flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1`, in the background. 22 minutes was enough for 30 screens; the whole-app capture needs 90.
     - Or build first with `flock /tmp/laneb-heavy.lock bash <here>/build-only.sh > build.log 2>&1`, then serve with `TOUR_MINUTES=90 flock /tmp/laneb-heavy.lock bash <here>/reserve.sh > serve.log 2>&1`.
   - Then `bash run.sh`, in the background.
   - When it ends, `touch $TOUR_DIR/stop`.
4. **A retake.** Two ways:
   - **Same database:** while the server still runs (before `stop`), `TOUR_SKIP_POPULATE=1 TOUR_ONLY=<ids> bash run.sh`.
   - **Fresh database:** after `stop`, re-serve with `reserve.sh` and run `run.sh` with `TOUR_ONLY`.
5. **Check that the lock and the server ended together.** build.log or serve.log must say "server stopped", and `fuser 3297/tcp` must print nothing. If it prints a process, end it with `fuser -k 3297/tcp`, and run nothing heavy until it has gone. (The 2026-10-25 version waited on `lsof`: it released the lock at once while the server ran on for 7 minutes. serve.sh now waits on the server's answers.)
6. **Clean up:**
   - `PGPASSWORD=test psql -h localhost -p 5433 -U postgres -d postgres -c 'DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)'`;
   - `rm -rf /tmp/tp-e2e-tp_e2e_screens-*`.
7. `python3 <here>/batches.py "$TOUR_DIR"` for the image checkers' batches.

If PG18 is down after a container restart: `runuser -u postgres -- /opt/pg18/bin/pg_ctl -D /root/pgdata18 -o "-p 5433 -k /tmp" -l /tmp/pg18.log -w start`.

**Where the pictures go.** The repository is public. Publish the PNGs as a private artifact gallery, as on 2026-10-25. Commit to claude/build-ops only the findings, the manifest and any small crop a finding needs. A later tour reads the gallery's files to compare.

**Growing the capture.** Change `capture/tour.spec.ts` here on claude/build-ops, not the copy in `$TOUR_DIR`. Re-run `setup.sh` to copy it, and push it with the work, so every later tour reuses it.
- A new route: add its `cap(...)` calls in its area's test, with a stable key. The full run's coverage check then stops listing it as a route without a shot.
- The app has dark tokens but no theme switch and no `prefers-color-scheme` rule. That is why the tour sets `data-theme` itself.

## The whole-app capture (2026-10-26)
- **Built from** claude/build-platform 6ddd587. The final run had a fresh prepare. Populate: all 10 tests of the seven specs passed in 3.0 min. Capture: 28.0 min. Then a 10-minute retake on the same database of 256 shell shots at 390 px, after the sticky-header fix below.
- **857 shots:**
  - 1280 light: 385 (84 default, counting the payer's copy PDF; 126 interaction; 75 error; 52 loading; 45 empty; 3 not-found);
  - 1280 dark (tokens only): 83, one per reachable route;
  - 390 light: 389 (83 default; 131 interaction; 75 error; 52 loading; 45 empty; 3 not-found).
- **Coverage:** all 83 reachable routes are shot. `skipped` holds 78 entries, and no shot failed:
  - 72 are states the map names that synthetic data cannot show (36 states at two widths), each with its reason;
  - 6 are the map's not-reachable paths, with the map's reason.
- **The image checkers' batches:** 20, made by `batches.py`:
  - practice workflow: 445 shots in 10 batches;
  - practice set-up: 83 in 2;
  - console and account: 210 in 5;
  - public and sign-in: 119 in 3.
- **The heavy lock:** about 100 minutes in all. The build took 1.3 min, a first server session that debugged the spec 54.6 min, and the final session 44.1 min.
- **Pitfalls the spec now handles** (each found in that session and checked with a probe):
  - A held request must not be unrouted while its handler still waits. Playwright then lets it through, so a "held and aborted" submit was sent. heldShot waits for the handler to abort first.
  - A rail link clicked at 390 px right after the Menu opens shows no loading state; three seconds later, once the prefetch has settled, it does. capLoading scrolls the link into view and waits before the click.
  - At 390 px in mobile emulation a filled date field's label takes the pointer over the submit button below it. `press()` dispatches the click when it cannot land.
  - A field focused by a refusal keeps the mobile visual viewport offset after `scrollTo`, so a full-page shot drew the sticky header mid-page. snap blurs the field first and says so in the shot's note. The blur alone was not enough: `toTop` now checks that the page is at the top before every shot (see "The second retake", below).
  - Steps without a timeout hung the first run. The capture now has a 15 s action timeout, a 45 s navigation timeout and a 240 s bound per step. Its tests no longer run as a serial group, so one failure does not skip the rest.

## The second retake (2026-10-26)
- **What:** the 22 shots the image checkers flagged as capture faults (`batches/retake-input.json`). They were retaken on a fresh prepare of the same build (6ddd587, `TOUR_REF` pinned to it), with populate first (all 10 tests passed in 3.4 min).
  - A TOUR_ONLY capture of all 22 took 16 shots.
  - A same-database retake of the other 6 took them all.
  - `batches/retake.json` holds the 22 entries. `shots.json` still holds 857 shots and 78 skips, and no other entry changed.
- **The heavy lock:** about 10.4 minutes (re-serve 04:12:44 to 04:23:01, plus about 3 s for each of the two `setup.sh` installs).
- **What the spec does now:**
  - **The sticky header mid-page (7 shots at 390 px):** a full-page shot resizes the view to the whole page, and the resize keeps the visual viewport's place in the document. So a visual viewport left below the top scrolls the page there during the shot, and the sticky header is drawn at that place.
    - At 390 px a page wider than the viewport lets the visual viewport sit below the top. A refusal's focus or a click's scroll into view puts it there, and `window.scrollTo` moves only the layout viewport.
    - `toTop` checks the layout scroll, the visual viewport's place and the header's sticky shift, and needs all three at 0 at two checks in a row.
    - In order, it tries `scrollTo`, a blur, `document.documentElement.scrollIntoView`, a wheel and a touch swipe. If none gets the page to the top, the shot fails with the numbers, so a retake keeps the earlier shot.
    - It logs `VIEWPORT <id>` with the before state whenever more than `scrollTo` was needed. In this retake, all 7 needed `scrollIntoView`. For example, p.access-log.older.390 had layout scroll 0 but its visual viewport at y 513.
  - **Filtered empty states:** `filterToEmpty` reaches them through the filter form, as a person does: State Open on PACKETS' cases, and Payer SYNTHETIC PAYER Q on LAYOUT's anomalies.
    - `?state=resolved` matched PACKETS' one case.
    - `?run=` of a run without cohorts left the Pricing run select reading Every run, because it lists only runs with cohorts.
    - The step settles before it looks for the message. Without that, the first try missed the message every time.
  - **`p.proof-level.default`:** opens the other group's practice with the most lines the change would move, using the page's own count. The counts are logged under `RECORDS proof-level counts`.
    - On the populated data every practice counts 0 (LEDGER is deposited with no line posted), so the shot stays on LEDGER.
    - Its note says that 0 is the real count. No populate spec leaves a line the change would move.
  - **`p.support-access.empty`:** opens a grant of the other group that has no reads, chosen when the shot is taken. The grants' reads are logged under `RECORDS grant reads`.
    - Every journey grant holds 3 to 33 reads once populate has run, so the shot opens the reviewer's SYN-TOUR-4 on LAYOUT, which nothing reads before the writes test.
  - **SYNTHETIC CONSOLE EMPTY GROUP:** the writes test creates this group last. A console.organizations or console.billing shot as the platform administrator now fails with the reason, and keeps the earlier shot, when the group is already on the database. Five 390 px shots had listed it after the first same-database retake.
  - **`p.abstraction-ledger.adjust-open`:** the click's scroll into view left the entries table scrolled part of the way across, which cut the opened form at the right edge. This was judged a capture fault.
    - The page draws the whole form in the table's last column, an `overflow-x-auto` scroller, and nothing in the product sets that scroller's offset.
    - The step now scrolls the table to its end, as a person swipes it. The product finding stands: at 390 px the table overflows with no cue that it scrolls.
- **Product findings the retake keeps** (not capture faults): tables that overflow at 390 px (the shots are 439 to 667 px wide), the raw field keys in refusals (`effectiveFrom`, `organizationId`), and the empty fields after a refusal.
- **The check of the retake:** all 22 are ok (`verify/retake.json`, the shots.json fields plus `verdict`, `ok`, `fixable` and `note`). Each earlier fault is gone:
  - the 7 header shots have the header at the top and nowhere else;
  - the 5 console shots list only the seeded organizations;
  - the 4 filtered empty states show the filter beside the message;
  - the two `p.support-access.empty` shots read "No records read";
  - and the Adjust form shows whole.
  - The 3 `p.proof-level.default` images are pixel-identical to the earlier ones. 0 is the page's real count: its query (`lib/routes/settings.ts`) moves only payer_approved lines whose posting covers the approved amount, and no populate spec leaves one. So their relabelled note resolves them. A non-zero default needs a populate change.
- **How to check a sticky-header fix without trusting the eye on a 15,000 px image:** cut the logo strip (x 10 to 150, y 8 to 48) from the top of the shot and slide it down the page, comparing pixels at each step. A fixed shot has dark logo pixels at the top and no close match below. A faulty one has a blank top band and the logo lower down.
  - To see where a retake changed, run `compare -fuzz 1% new.png old.png -compose src diff.png`, then `convert diff.png -trim -format '%@' info:`.
  - For console.compliance.error.390, only the top 391 rows changed.
- **Product findings the check adds:**
  - On a line's page, the Note field carries no invalid mark, although the refusal says "Check the fields marked below". This shows at 1280 too.
  - An older access-log page says nothing of being older and has no link back to the newest.
  - A support-access grant's page marks Practice home in the rail.
