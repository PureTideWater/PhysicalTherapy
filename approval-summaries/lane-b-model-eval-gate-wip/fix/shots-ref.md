# PR #75 reference screens at its pre-merge head 7f77cb19 (screens-ref; replaces the lost screens-fix3)

All data is synthetic. The PNGs and tiles are in /tmp/claude-0/sp/phi/screens-ref, which is not inside any git tree. /home/user/ops, /home/user/screens and /home/user/PhysicalTherapy are each clean, and none has a changed, untracked or ignored PNG. Nothing was committed or pushed. No tracked file in /home/user/ops changed, because every `cap()` in the sample ran on this build. /home/user/contract-phi-check was not touched. The run started fresh: no progress file existed.

**Result:** the run took all 24 shots, with 0 skipped and 0 failed. Each is the same size as its shots5 (screens-fix3) copy. What I looked at matches what shots5 recorded for 7f77cb19:
- "Choose a kind" shows whole at 390;
- every kind and system select is 448 px at 1280, in every state, light and dark;
- "ERA export" shows whole at 390;
- the ERA system help wraps inside the 448 px box.

I found no capture fault and nothing new that is wrong (details under Observations).

## The run
- **TOUR_REF:** 7f77cb19af6c53f260bd3f100874b8357cd8bc48. It resolves in /home/user/PhysicalTherapy.
  - /home/user/screens did not exist, so setup.sh created it as a detached worktree at that commit. Afterwards it was clean, with HEAD at 7f77cb19af6c….
  - setup.sh ran from 17:01:02 to 17:01:08 UTC from /home/user/ops and exited 0 (setup.log). pnpm install ran under the lock inside setup.sh.
- **TOUR_DIR:** /tmp/claude-0/sp/phi/screens-ref
- **TOUR_ONLY:** `p.contracts.default.*,p.contracts.no-kind.*,p.contracts.held-ready.*,p.reconciliation.default.*,p.uploads.default.*,p.uploads.error-era-system.*,p.uploads.error-era-system.1280-dark,p.abstraction-version.model-names-patient.*,p.abstraction-version.model-too-long.*`. This is shots5's list without `p.contracts.no-kind.390-dark`.
- **Commands:** every shell began with `export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`. They ran in the order of the README's "From another lane" section and "Set-up and a run":
  - first a prerequisites check: PG 5433 accepting, /opt/pw-browsers present, node v24.22.0, the lock free, port 3297 free;
  - `bash tools/lane-b-screen-tour/setup.sh`;
  - in the background, `TOUR_MINUTES=30 flock /tmp/laneb-heavy.lock bash -c '…bash build.sh > build.log 2>&1…'` (lock times in lock.log);
  - in the background, `bash run.sh` with the TOUR_ONLY above;
  - `touch $TOUR_DIR/stop`.
- **Build:** "Compiled successfully in 35.1s". The build ran from 17:01:19 to 17:02:38.
  - "Choose a kind" is in the uploader's client chunks and its SSR chunk.
  - `Choose the kind of document"` (the old placeholder) is in none of them.
  - The source agrees: uploader.tsx:99 has `CHOOSE_KIND_PLACEHOLDER = 'Choose a kind'`, and :107 has `FIELD_BOX = 'flex w-full min-w-0 max-w-md flex-col gap-1'`.
- **Times (UTC):**
  - lock asked for and got at 17:01:18;
  - prepare from 17:02:38 to 17:03:06, with the server ready at 17:03:09;
  - populate from 17:03:11 to 17:05:48: 11 passed (2.6 min), exit 0;
  - capture from 17:05:48 to 17:06:36: 6 passed (47.7 s), exit 0.
- **progress.log:**
  - "RECORDS 46 found; missing: none"
  - "DONE 24 shots taken this run; shots.json holds 24 shots and 0 skipped"
  - There is no VIEWPORT line, so `scrollTo` was enough for every shot.
- **Nothing was uploaded.** tp_e2e_screens held 23 source_document rows. The newest was created at 17:04:53, during populate. None was created at or after 17:05:48, when the capture started.
- **Stop and the server's end:**
  - `stop` was touched at 17:06:49. build.log says "stopping server at 17:06:51" and "server stopped at 17:06:51".
  - lock.log says "build.sh exit 0 at 17:06:51", so the lock was held for about 5.5 min.
  - `fuser 3297/tcp` printed nothing (exit 1).
  - `flock -n` then got the lock, so it is free.
- **Tiles:** `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py /tmp/claude-0/sp/phi/screens-ref p.contracts.default. p.contracts.no-kind. p.contracts.held-ready. p.reconciliation.default. p.uploads.default. p.uploads.error-era-system. p.abstraction-version.model-names-patient. p.abstraction-version.model-too-long.`, run from /home/user/ops. It printed "24 shots tiled into 74 tiles", the same count as shots5.
- **Clean-up (README step 6), at 17:07:**
  - `DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)` printed DROP DATABASE.
  - I removed /tmp/tp-e2e-tp_e2e_screens-{billing,dev-auth,documents,mail,model-outputs}, and none is left.
  - The databases left on 5433 are postgres, template0 and template1. This container never had the tp_e2e, tp_e2e_ux or tp_test_* databases that shots5 lists.
- **Retakes:** none was needed.

## Shots
Each PNG is /tmp/claude-0/sp/phi/screens-ref/png/<id>.png, and its tiles are in /tmp/claude-0/sp/phi/screens-ref/tiles/<id>/. Each entry is in /tmp/claude-0/sp/phi/screens-ref/shots.json. Every size is the same as shots5's.

| id | state | role | size | tiles |
|---|---|---|---|---|
| p.contracts.default.1280 | default | era-manager | 1280x1483 | 2 |
| p.contracts.default.1280-dark | default | era-manager | 1280x1483 | 2 |
| p.contracts.default.390 | default | era-manager | 390x2050 | 3 |
| p.contracts.no-kind.1280 | interaction:no-kind | era-manager | 1280x1607 | 3 |
| p.contracts.no-kind.1280-dark | interaction:no-kind | era-manager | 1280x1607 | 3 |
| p.contracts.no-kind.390 | interaction:no-kind | era-manager | 390x2214 | 3 |
| p.contracts.held-ready.1280 | interaction:held-ready | era-manager | 1280x1583 | 2 |
| p.contracts.held-ready.1280-dark | interaction:held-ready | era-manager | 1280x1583 | 2 |
| p.contracts.held-ready.390 | interaction:held-ready | era-manager | 390x2150 | 3 |
| p.reconciliation.default.1280 | default | ledger-manager | 1280x2678 | 4 |
| p.reconciliation.default.1280-dark | default | ledger-manager | 1280x2678 | 4 |
| p.reconciliation.default.390 | default | ledger-manager | 390x4060 | 5 |
| p.uploads.default.1280 | default | pricing-manager | 1280x804 | 2 |
| p.uploads.default.1280-dark | default | pricing-manager | 1280x804 | 2 |
| p.uploads.default.390 | default | pricing-manager | 390x912 | 2 |
| p.uploads.error-era-system.1280 | error | pricing-manager | 1280x1044 | 2 |
| p.uploads.error-era-system.1280-dark | error | pricing-manager | 1280x1044 | 2 |
| p.uploads.error-era-system.390 | error | pricing-manager | 390x1192 | 2 |
| p.abstraction-version.model-names-patient.1280 | interaction:model-names-patient | contract-specialist | 1280x2538 | 4 |
| p.abstraction-version.model-names-patient.1280-dark | interaction:model-names-patient | contract-specialist | 1280x2538 | 4 |
| p.abstraction-version.model-names-patient.390 | interaction:model-names-patient | contract-specialist | 390x3880 | 5 |
| p.abstraction-version.model-too-long.1280 | interaction:model-too-long | contract-specialist | 1280x2498 | 4 |
| p.abstraction-version.model-too-long.1280-dark | interaction:model-too-long | contract-specialist | 1280x2498 | 4 |
| p.abstraction-version.model-too-long.390 | interaction:model-too-long | contract-specialist | 390x3760 | 5 |

## Observations
I looked at all 24 PNGs whole, and at the 390 upload-panel and notice tiles.

**Select widths at 1280,** measured as border pixels on one row. Light and dark are the same.
- **Contracts kind:** x 347 to 794, 448 px, in p.contracts.default. In no-kind (refused) and held-ready (focused), the ring runs from 343 to 798.
- **Reconciliation kind:** 347 to 794, 448 px.
- **Uploads kind:** 322 to 769, 448 px, in default and in error-era-system.
- **Uploads ERA system, refused:** ring 318 to 773, so the border box is 322 to 769, 448 px. It lines up with the kind select.
- These match shots5's figures exactly.

**The uploader, screen by screen:**
- **p.contracts.default** (1280, dark, 390): the placeholder "Choose a kind" shows whole at every width, under the help "A document's kind cannot be changed once it is uploaded." It ends well before the chevron at 390.
- **p.contracts.no-kind** (1280, dark, 390):
  - the select has a red border and the focus ring;
  - the error reads "Error: Choose the kind of document for this file, then upload it." on one line at 1280 and three at 390;
  - "Waiting to upload: 1 file", version-1.pdf, and Clear (no Upload button) follow.
  - At 390 the ring stays inside the gutter.
- **p.contracts.held-ready** (1280, dark, 390): "Contract" is chosen and focused with no error, and "Upload 1 file" and Clear show.
- **p.reconciliation.default** (1280, dark, 390): "Choose a kind" shows whole, including at 390 (tile 03).
- **p.uploads.default** (1280, dark, 390): "835 remittance" is chosen.
- **p.uploads.error-era-system** (1280, dark, 390):
  - the kind reads "ERA export", whole at 390;
  - "Which system's export" shows "Choose the system", refused and ringed;
  - the error reads "Error: Choose which system's ERA export this file is, then upload it." on one line at 1280 and two at 390;
  - the help wraps after "Each file" / "of the batch is read with its layout; a CSV export only." on two lines at 1280 and three at 390, as fix3.md describes;
  - export.csv is waiting, with Clear.

**The notices:**
- **p.abstraction-version.model-names-patient** (1280, dark, 390): "Nothing was proposed. This document holds an identifier from the practice's patient records, so it was not sent to the model…". It is whole at 390 (tile 01).
- **p.abstraction-version.model-too-long** (1280, dark, 390): "Nothing was proposed. This document is too long to send to the model, so nothing was sent. Enter its terms by hand below."
- Both pages open "SYNTHETIC FIXED SCHEDULE AGREEMENT, version 1 / With SYNTHETIC PAYER N.", as in shots5.
- At 1280 the source link "contract, 1000 bytes, received 2026-11-01 17:03 UTC (cf1573fb)" fits on one line.

**Dark (tokens only):** I saw no element that is invisible or missing in dark.
- The error words and danger border are the lighter coral, and the ring is the light blue.
- The fills match the surface, as in shots5.

**Data (each run has a fresh prepare, so this differs from shots5 and is not the fix):**
- receipt, approval and ledger times are 17:03 to 17:04 on 2026-11-01;
- the document hashes are 1db1f4ce (the Contracts tag receipt), cf1573fb, 4191fa2e and 0437a658.

**Carried items:**
- **M4-6, unchanged:** at 390 the tables (Contracts, Receipts, Exports, the case-line and ledger tables) scroll sideways behind the "Scroll sideways for more columns." cue.
- **M4-4, unchanged:** the row-form button placement on the Contracts tag form and on the version page's Amend form.
- **"The document's pages are still being read; try again in a minute"** shows on the version page and in the record's "Does not resolve" line. This is the populated data's state at capture time, the same as in shots5. It is not caused by the uploader.
- **Minor, not new:** in the 1280 dark shots, the native date inputs' calendar glyph is faint on the dark field. It is the browser's own control, and it lies outside PR #75's diff.

**No 390 dark shot was asked for or taken.** The tour takes dark only at 1280 (shots5: tour.spec.ts `snap()`), so `p.contracts.no-kind.390-dark` was left out of TOUR_ONLY, as the brief says.

## Files
- Shots: /tmp/claude-0/sp/phi/screens-ref/shots.json (24 shots, 0 skipped); PNGs in /tmp/claude-0/sp/phi/screens-ref/png/
- Tiles: /tmp/claude-0/sp/phi/screens-ref/tiles/index.json (74 tiles)
- Logs, in /tmp/claude-0/sp/phi/screens-ref/: setup.log, lock.log, build.log, run.log, populate.log, capture.log, progress.log and server.log
- Progress: /tmp/claude-0/sp/phi/progress/shots-ref.md
