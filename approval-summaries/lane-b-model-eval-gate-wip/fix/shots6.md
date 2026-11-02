# PR #75 uploader states and notices on its merged head (cf61a828) compared with the reference (7f77cb19)

All data is synthetic. The PNGs, tiles and comparison crops are in /tmp/claude-0/sp/phi/screens-merge4, which is not inside any git tree. Nothing was committed or pushed. /home/user/ops (1547a516) and /home/user/screens are clean, and no tree among ops, screens and PhysicalTherapy has a PNG, whether changed, untracked or ignored. /home/user/contract-phi-check was only read (`rev-parse`, `log`, `diff --stat`). The run started fresh: no progress file existed.

**Result:** the run took all 24 shots, with 0 skipped and 0 failed. Every id matches the reference, and every shot is exactly the same size as its reference.
- Every uploader panel is pixel-identical to the reference, in every state and at every width, light and dark. Each notice box is also pixel-identical at 1280 light and dark. The 390 notices look the same.
- The only pixels that differ are synthetic data that each fresh prepare makes anew (listed below).
- **Regressions: none.**
- **Differences from #78: none is visible in these shots.** #78's changes are present in the build and the source, and each is invisible by design in these states (see "#78 in these shots").

## The run
- **TOUR_REF:** cf61a82893970404ebfdb7e47b4799f907fcb077, the HEAD of /home/user/contract-phi-check. It holds:
  - 584f5218, the merge of 83d71fd6 (#81, #78);
  - 7cd60740, the ADR docs;
  - 3a033b32 and cf61a828, which change only packages/model-gateway redact.* and two ADRs.
  The diff from 7cd60740 to HEAD touches nothing in apps/web.
- **TOUR_DIR:** /tmp/claude-0/sp/phi/screens-merge4
- **TOUR_ONLY:** the reference's list: `p.contracts.default.*,p.contracts.no-kind.*,p.contracts.held-ready.*,p.reconciliation.default.*,p.uploads.default.*,p.uploads.error-era-system.*,p.uploads.error-era-system.1280-dark,p.abstraction-version.model-names-patient.*,p.abstraction-version.model-too-long.*`. This gives 1280 and 390 light and 1280 dark.
- **Commands:** I followed the README's "From another lane", then "Set-up and a run". Every shell exported `PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
  - **Prerequisites:** PG 5433 was accepting, /opt/pw-browsers was present, node was v24.22.0, the lock was free and port 3297 was free.
  - **Set-up:** `bash tools/lane-b-screen-tour/setup.sh` ran from /home/user/ops and exited 0 at 20:54:02. It moved /home/user/screens (clean, at 7f77cb19) to cf61a828 and ran pnpm install under the lock inside setup.sh.
  - **Build and serve:** in the background, `TOUR_MINUTES=30 flock /tmp/laneb-heavy.lock bash -c '… bash build.sh > build.log …'`. The lock times are in lock.log.
  - **Run:** in the background, `bash run.sh` with the TOUR_ONLY above.
  - **Stop:** `touch $TOUR_DIR/stop`.
- **Build:** the lock was asked for and got at 20:54:07. The log says "Compiled successfully in 52s".
  - "Choose a kind" is in 2 static chunks. The old `Choose the kind of document"` is in none. `beforeunload` (#78's guard) is in 2 chunks.
  - The source agrees:
    - uploader.tsx:110 has `CHOOSE_KIND_PLACEHOLDER = 'Choose a kind'`, and :118 has `FIELD_BOX` (max-w-md).
    - :457 has "Waiting to upload: N files".
    - :666 has `useLeaveGuard(leaveAsks(batch, held.length))`.
    - :847 has `DownloadLinks arrived={props.receiptsNotice}` around `ReceiptList … reportFrom=`.
    - uploads/page.tsx:54-56 has `initialKind="x12_835"`, `reportFrom="uploads"` and `receiptsNotice={<DownloadRefusal …/>}`.
- **Times (UTC):**
  - prepare at 20:55:39, with the server ready at 20:56:10;
  - populate from 20:56:12 to 20:59:10: 11 passed (3.0 min), exit 0;
  - capture from 20:59:10 to 20:59:57: 7 passed (46.6 s), exit 0. The 7th test, "an unmapped plan on LAYOUT, last", comes from the current ops spec. It took no shot here.
- **progress.log:** "RECORDS 46 found; missing: none" and "DONE 24 shots taken this run; shots.json holds 24 shots and 0 skipped". There is no VIEWPORT line.
- **Nothing was uploaded by the capture.** source_document held 23 rows. The newest was created at 20:58:15, during populate. None was created at or after 20:59:15.
- **Stop and the server's end:**
  - `stop` was touched at 21:04:36. build.log says "stopping server at 21:04:38" and "server stopped at 21:04:38".
  - lock.log says "build.sh exit 0 at 21:04:38".
  - `fuser 3297/tcp` printed nothing (exit 1), and `flock -n` then got the lock, so it is free.
  - The lock was held for about 10.5 min, against the reference's 5.5. My wait loop's `pgrep -f "bash run.sh"` matched its own command line, so `stop` came about 4.5 min after the capture ended. The server sat idle in that time, and the shots are unaffected.
- **Tiles:** `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py /tmp/claude-0/sp/phi/screens-merge4 p.contracts.default. p.contracts.no-kind. p.contracts.held-ready. p.reconciliation.default. p.uploads.default. p.uploads.error-era-system. p.abstraction-version.model-names-patient. p.abstraction-version.model-too-long.` printed "24 shots tiled into 74 tiles", the same as the reference.
- **Clean-up (README step 6), at 21:05:**
  - `DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)` printed DROP DATABASE.
  - I ran `rm -rf /tmp/tp-e2e-tp_e2e_screens-*`, and none is left.
  - The databases left on 5433 are postgres, template0 and template1.
  - /tmp/tp-e2e-phi_check5_e2e-* (7 directories, left by check5's e2e run) were already there. They are not this run's, and I left them.

## Shots and comparisons
Each PNG is /tmp/claude-0/sp/phi/screens-merge4/png/<id>.png. Its tiles are in /tmp/claude-0/sp/phi/screens-merge4/tiles/<id>/, and its entry is in /tmp/claude-0/sp/phi/screens-merge4/shots.json. The reference is the same path under /tmp/claude-0/sp/phi/screens-ref/.

I compared each pair pixel by pixel (PIL `ImageChops.difference`), and I looked at every shot myself. "Changed area" is the box around every differing pixel. Rows marked "(I)" are the illustrative crops: each shows the reference on top and this run below, in /tmp/claude-0/sp/phi/screens-merge4/cmp/.

| id | size (ref = this run) | changed area (x0,y0,x1,y1) | what differs | class |
|---|---|---|---|---|
| p.contracts.default.1280 | 1280x1483 | 555,1170-698,1183 | the tag form's receipt only: "17:03 UTC (1db1f4ce)" became "20:56 UTC (da06248f)" | data |
| p.contracts.default.1280-dark | 1280x1483 | same | same | data |
| p.contracts.default.390 | 390x2050 | 34,1516-320,1548 | same receipt line | data |
| p.contracts.no-kind.1280 (I) | 1280x1607 | 555,1294-698,1307 | same receipt line | data |
| p.contracts.no-kind.1280-dark | 1280x1607 | same | same | data |
| p.contracts.no-kind.390 | 390x2214 | 34,1680-320,1712 | same receipt line | data |
| p.contracts.held-ready.1280 | 1280x1583 | 555,1270-698,1283 | same receipt line | data |
| p.contracts.held-ready.1280-dark | 1280x1583 | same | same | data |
| p.contracts.held-ready.390 | 390x2150 | 34,1616-320,1648 | same receipt line | data |
| p.reconciliation.default.1280 (I) | 1280x2678 | 288,1278-989,2466 | times below the panel (Exports, case line, ledger): 17:04 became 20:57 | data |
| p.reconciliation.default.1280-dark | 1280x2678 | same | same | data |
| p.reconciliation.default.390 | 390x4060 | 16,2095-259,3856 | same times | data |
| p.uploads.default.1280 (I) | 1280x804 | 370,607-1038,761 | the Receipts rows only. The times and hashes changed (cf1573fb/4191fa2e/0437a658 became 21cccd6d/b564bde4/39de7910). The two 835 rows (1.4 KiB and 9.5 KiB), received in the same minute, swapped order. | data |
| p.uploads.default.1280-dark | 1280x804 | same | same | data |
| p.uploads.default.390 | 390x912 | 98,707-374,854 | same rows | data |
| p.uploads.error-era-system.1280 | 1280x1044 | 370,847-1038,1001 | same rows | data |
| p.uploads.error-era-system.1280-dark | 1280x1044 | same | same | data |
| p.uploads.error-era-system.390 (I) | 390x1192 | 98,987-374,1134 | same rows | data |
| p.abstraction-version.model-names-patient.1280 (I) | 1280x2538 | 382,201-1238,1478 | "With SYNTHETIC PAYER N." became "With SYNTHETIC PAYER Q.", plus the times and hash (17:03 cf1573fb became 20:56 21cccd6d) | data (see note) |
| p.abstraction-version.model-names-patient.1280-dark | 1280x2538 | same | same | data |
| p.abstraction-version.model-names-patient.390 | 390x3880 | 16,264-371,2399 | same | data |
| p.abstraction-version.model-too-long.1280 | 1280x2498 | 382,201-1238,1438 | same | data |
| p.abstraction-version.model-too-long.1280-dark | 1280x2498 | same | same | data |
| p.abstraction-version.model-too-long.390 | 390x3760 | 16,264-371,2279 | same | data |

Nothing above y=607 (uploads default 1280), y=847 (uploads error 1280), y=1170 (contracts 1280) or y=1278 (reconciliation 1280) differs. At 390 the same holds above the first data row. So every uploader panel is pixel-identical to the reference: the kind and system selects, the help, the error, the focus ring, the waiting list, the buttons, the dashed box and the card. For the notices, I compared the notice box (x 280-1260, y 350-470) on its own: it is identical for both notices at 1280 light and dark.

**The payer letter (N to Q) is not from the PR.** apps/web/e2e/journeys.ts:319 picks the payer for the fixed-schedule contract with `SELECT id FROM payer WHERE practice_id = $1 ORDER BY created_at LIMIT 1`. LAYOUT's payers share one `created_at`, so each fresh prepare can break the tie differently. tour.spec.ts:3176 already says that LAYOUT has both payer N and payer Q. Neither #75 nor #78 changes journeys.ts (the e2e diff from 7f77cb19 is download-refusals.spec.ts and reports.spec.ts only). It is a test-data tie, not a screen change. A side note for whoever owns the e2e helpers: an `ORDER BY created_at, id` there would make the letter stable from run to run.

## The checks the brief names
- **#75's held files and notices are present:**
  - no-kind: "Waiting to upload: 1 file", version-1.pdf, Clear, and no Upload button.
  - held-ready: "Contract" is chosen with no error, and "Upload 1 file" and Clear show.
  - error-era-system: "Waiting to upload: 1 file", export.csv and Clear.
  - Both notices read as in the reference. model-names-patient says "Nothing was proposed. This document holds an identifier from the practice's patient records, so it was not sent to the model…". model-too-long says "Nothing was proposed. This document is too long to send to the model, so nothing was sent. Enter its terms by hand below."
  - Both are whole at 390 (tile 01).
- **"Choose a kind":** whole at every width on Contracts (default, and refused in no-kind) and on Reconciliation, including at 390 (reconciliation tile 03). At 390 it ends well before the chevron.
- **"Waiting to upload":** heading, count, file name and buttons as in the reference, at 1280 and 390, light and dark.
- **The refused field's error and focus:**
  - On Contracts no-kind, the kind select has the red border and the focus ring. "Error: Choose the kind of document for this file, then upload it." fits on one line at 1280 and takes three lines at 390.
  - On Uploads error-era-system, "Which system's export" is "Choose the system", refused and ringed. "Error: Choose which system's ERA export this file is, then upload it." fits on one line at 1280 and takes two at 390. The help wraps on two lines at 1280 and three at 390.
  - At 390 the ring stays inside the gutter.
  - The pixels match the reference, so the select widths (448 px) and the ring positions are the reference's.
- **Clipping:** nothing is clipped that was not clipped before. The 390 tables still scroll sideways behind "Scroll sideways for more columns.", which is carried item M4-6 and is unchanged.
- **Dark tokens:**
  - the error words and danger border are the lighter coral;
  - the ring is the light blue;
  - the fills match the surface;
  - the primary buttons invert;
  - the notice title is coral.
  All are identical to the reference. The native date inputs' calendar glyph is still faint on the dark field. That is the browser's own control and is not new.

## #78 in these shots
I found no visible difference that comes from #78. That is expected for these states.
- **The receipts' Report link** is now a `DownloadLink` with `?from=uploads` (receipt-labels.ts:239 `reportHref`). It renders as the same underlined "Report" link, so the pixels match.
- **`DownloadLinks arrived={receiptsNotice}`** shows nothing without `?refused=` (no refusal is staged in these states), so no notice appears above Receipts. The Receipts heading is at the same y as in the reference.
- **The leave guard** (`useLeaveGuard(leaveAsks(…))`) is a `beforeunload` listener and draws nothing. It is present in the client chunks.
- The populate project includes no download-refusals.spec.ts, and these ids name no refused-download state.

## Classification summary
- Regression: none.
- Expected, from #78: none visible. #78's code is present in the build, and it is invisible by design in these states.
- Data (each fresh prepare): the times, the document hashes, the order of two receipts received in the same minute, and the payer letter N to Q on the version page.
- Carried, unchanged: M4-6 (the 390 tables scroll sideways), M4-4 (the row-form button placement on the tag form and the Amend form), "The document's pages are still being read" (the populated data's state at capture time), and the faint dark date glyph.

## Files
- Shots: /tmp/claude-0/sp/phi/screens-merge4/shots.json (24 shots, 0 skipped); PNGs in /tmp/claude-0/sp/phi/screens-merge4/png/
- Tiles: /tmp/claude-0/sp/phi/screens-merge4/tiles/index.json (74 tiles)
- Comparison crops (reference on top): /tmp/claude-0/sp/phi/screens-merge4/cmp/
- Logs, in /tmp/claude-0/sp/phi/screens-merge4/: setup.log, lock.log, build.log, run.log, populate.log, capture.log, progress.log and server.log
- Progress: /tmp/claude-0/sp/phi/progress/shots6.md
