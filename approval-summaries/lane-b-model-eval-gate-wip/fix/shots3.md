# PR #75 uploader screens on the merged head (co-001/contract-phi-check at 871faff9, with #79 and #80)

All data is synthetic. The PNGs and tiles are in the session scratchpad, and none is in a git tree. I checked /home/user/ops, /home/user/screens, /home/user/PhysicalTherapy and /home/user/contract-phi-check: each is clean, with no PNG changed, untracked or ignored. Nothing was committed or pushed. No file in /home/user/ops changed: every `cap()` in the sample ran on this build.

## What the merge brought to these screens (871faff9 against 4b886fcc)
- **`uploader.tsx`:** only #79's file-name span in the "This batch" list: `min-w-48 wrap-anywhere`, no hover title. That list shows only after Upload is pressed, which is a write, so no shot in the sample shows it. The held list ("Waiting to upload") is #75's and is unchanged.
- **`receipts.tsx`:** the Receipts table sits in a `ScrollTable` (`min-w-[48rem]`, `aria-label` = the title).
- **Contracts page:** the Contracts table (`min-w-[54rem]`) and the Calendar table (`36rem`) sit in a `ScrollTable`, and dates use `WholeDates`.
- **Reconciliation page:** the Exports table (`36rem`) and the entry tables (`54rem`) sit in a `ScrollTable`. Times use `UtcTime`, Rows and Matched are mono, and each case line is titled "Case line N of M".
- **Version page (`contracts/review.tsx`):** a rate record's approval now stands under its terms, in a table with two columns and no min-w.
- **`ScrollTable`:** while its table overflows, it shows the caption "Scroll sideways for more columns.", a fade at each edge past which columns lie, and a region named "<label>, scrolls sideways" with tabindex 0.
- **Stacked rows:** `StackedRows` (`components/stacked-rows.tsx`) has no importer in apps/web/src. ADR 0078 "Not covered" leaves the stacked working lists to a later pull request, so no screen in this sample stacks its rows. That is by design.

## The run
- **TOUR_REF** = 871faff9… (`git -C /home/user/contract-phi-check rev-parse HEAD`, check 3's merge commit; the worktree was clean). setup.sh checked /home/user/screens out at 871faff9; before that it was clean at 4b886fcc. pnpm: "Already up to date".
- **TOUR_DIR** = /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge2
- **TOUR_ONLY** = `p.contracts.default.*,p.contracts.no-kind.*,p.contracts.held-ready.*,p.reconciliation.default.*,p.uploads.default.*,p.uploads.error-era-system.*,p.uploads.error-era-system.1280-dark,p.abstraction-version.model-names-patient.*,p.abstraction-version.model-too-long.*`. The notice's id in tour.spec.ts is `model-too-long`, from the loop at line 2242; ops already had it committed (b1d71916).
- **Commands.** PATH was /opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin. Every command followed the README:
  - `bash tools/lane-b-screen-tour/setup.sh`, from /home/user/ops (03:38:11 to 03:38:15, exit 0; setup.log);
  - `TOUR_MINUTES=30 flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1`, in the background (lock.log);
  - `bash run.sh`, with the TOUR_ONLY above, in the background;
  - `touch $TOUR_DIR/stop`.
- **Times (UTC):**
  - The lock was free. I asked for it at 03:38:30 and got it at 03:38:31.
  - The build ended at 03:39:26. The prepare (tp_e2e_screens migrated and seeded) ran next, and the server was ready at 03:39:56.
  - Populate: 11 passed in 3.0 min, exit 0.
  - Capture: 03:42:57 to 03:43:43. All 6 tests passed in 45.1 s: "DONE 24 shots taken this run; shots.json holds 24 shots and 0 skipped". RECORDS found 46, with none missing.
  - progress.log has no VIEWPORT line, so no shot needed the blur.
- **Nothing was uploaded.** Each upload step ran behind `noUploadRequest`, and no step threw. On the tour database, the newest source_document was created at 03:41:27 (populate), and none was created after the capture started.
- **Stop:**
  - `stop` was touched at 03:50:00, after I had checked the shots.
  - build.log says "server stopped at 03:50:04", and build.sh, which held the lock, exited 0 at 03:50:04. The lock was held for about 11.6 minutes and is free now.
  - Afterwards `fuser 3297/tcp` printed nothing (exit 1).
- **Tiles:** I ran `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> p.contracts.default. p.contracts.no-kind. p.contracts.held-ready. p.reconciliation.default. p.uploads.default. p.uploads.error-era-system. p.abstraction-version.model-names-patient. p.abstraction-version.model-too-long.` from /home/user/ops. It printed "24 shots tiled into 70 tiles", into `<TOUR_DIR>/tiles/<id>/NN.png` and `<TOUR_DIR>/tiles/index.json`.
- **Clean-up (README step 6):**
  - `DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)` printed DROP DATABASE.
  - I removed the five `/tmp/tp-e2e-tp_e2e_screens-*` directories (billing, dev-auth, documents, mail, model-outputs), and none is left.
  - The databases left at localhost:5433 were all there before: tp_e2e, tp_e2e_ux and three tp_test_*.
- **Retakes:** none was needed, and `skipped` is empty.

## Shots
Each shot's screen, state and role come from `<TOUR_DIR>/shots.json`. Each PNG is `<TOUR_DIR>/png/<id>.png`, and its tiles are `<TOUR_DIR>/tiles/<id>/`. The earlier shots are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix/png/ (53076d28) and /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/png/ (4b886fcc).

| id | state | role | size now | earlier size | tiles |
|---|---|---|---|---|---|
| p.contracts.default.1280 | default | era-manager | 1280x1471 | fix 1280x1471 | 2 |
| p.contracts.default.1280-dark | default | era-manager | 1280x1471 | fix 1280x1471 | 2 |
| p.contracts.default.390 | default | era-manager | 390x2030 | fix 664x2050 | 3 |
| p.contracts.no-kind.1280 | interaction:no-kind | era-manager | 1280x1591 | fix 1280x1591 | 2 |
| p.contracts.no-kind.1280-dark | interaction:no-kind | era-manager | 1280x1591 | fix 1280x1591 | 2 |
| p.contracts.no-kind.390 | interaction:no-kind | era-manager | 390x2166 | fix 664x2186 | 3 |
| p.contracts.held-ready.1280 | interaction:held-ready | era-manager | 1280x1571 | fix 1280x1571 | 2 |
| p.contracts.held-ready.1280-dark | interaction:held-ready | era-manager | 1280x1571 | fix 1280x1571 | 2 |
| p.contracts.held-ready.390 | interaction:held-ready | era-manager | 390x2130 | fix 664x2150 | 3 |
| p.reconciliation.default.1280 | default | ledger-manager | 1280x2674 | fix 1280x2674 | 4 |
| p.reconciliation.default.1280-dark | default | ledger-manager | 1280x2674 | fix 1280x2674 | 4 |
| p.reconciliation.default.390 | default | ledger-manager | 390x4052 | fix 405x4152 | 5 |
| p.uploads.default.1280 | default | pricing-manager | 1280x800 | fix 1280x800 | 1 |
| p.uploads.default.1280-dark | default | pricing-manager | 1280x800 | fix 1280x800 | 1 |
| p.uploads.default.390 | default | pricing-manager | 390x904 | fix 534x1156 | 2 |
| p.uploads.error-era-system.1280 | error | pricing-manager | 1280x1028 | fix 1280x1028 | 2 |
| p.uploads.error-era-system.1280-dark | error | pricing-manager | 1280x1028 | fix 1280x1028 | 2 |
| p.uploads.error-era-system.390 | error | pricing-manager | 390x1164 | fix 534x1352 | 2 |
| p.abstraction-version.model-names-patient.1280 | interaction:model-names-patient | contract-specialist | 1280x2536 | fix2 1280x2532 | 4 |
| p.abstraction-version.model-names-patient.1280-dark | interaction:model-names-patient | contract-specialist | 1280x2536 | fix2 1280x2532 | 4 |
| p.abstraction-version.model-names-patient.390 | interaction:model-names-patient | contract-specialist | 390x3850 | fix2 390x3866 | 5 |
| p.abstraction-version.model-too-long.1280 | interaction:model-too-long | contract-specialist | 1280x2496 | fix2 1280x2492 | 4 |
| p.abstraction-version.model-too-long.1280-dark | interaction:model-too-long | contract-specialist | 1280x2496 | fix2 1280x2492 | 4 |
| p.abstraction-version.model-too-long.390 | interaction:model-too-long | contract-specialist | 390x3730 | fix2 390x3746 | 5 |

## How I compared
- I looked at every shot myself, as a whole PNG or tile by tile, against its screens-fix or screens-fix2 copy.
- Two scripts in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge2-shots-scripts/ found every changed band:
  - `cmp.py` counts the rows identical from the top and from the bottom;
  - `bands.py` lists the bands that differ by more than 2/255 at a given shift.
- The 2x side-by-side crops are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge2-shots-crops/.
- Each run had its own fresh prepare, so these differ in every pair and are data, not the merge: receipt and approval times, document hashes (0515f73a now, 266849ff and b5fa2685 before), ledger sequence numbers (1, 2, 3, 7, 8 now; 1 to 5 before) and the "Documents to tag" receipt.

## Both sides present

**#75's held files and notices are unchanged by the merge.**
- **The uploads shots at 1280, light and dark.** These are p.uploads.default.1280, .1280-dark, p.uploads.error-era-system.1280 and .1280-dark.
  - They are pixel-identical to screens-fix from row 0 to row 599 (default) and to row 827 (era-system): the whole upload panel.
  - That covers the help line, the "Which system’s export" select with its red border and focus ring, the red line "Choose which system’s ERA export this file is, then upload it.", "Waiting to upload: 1 file", export.csv and Clear, with no Upload.
  - Below that, only the receipt rows differ, and only in data.
- **The uploads shots at 390.** p.uploads.default.390 and p.uploads.error-era-system.390 are pixel-identical to screens-fix from row 0 to row 641 and to row 901: the header, the panel, the held file and the "Receipts" heading.
- **The contracts shots, all nine.**
  - They are identical to screens-fix from row 0 to row 353 (1280) and to row 436 (390).
  - Below the contracts table they are identical, after a shift of 0 at 1280 and −20 px at 390, except for the data line.
  - no-kind shows the red select, "Choose the kind of document for this file, then upload it.", the help line, the outline Choose files, "Waiting to upload: 1 file", version-1.pdf and Clear.
  - held-ready shows Contract, the help line, "Waiting to upload: 1 file", version-1.pdf, and the primary "Upload 1 file" beside an outline Clear.
- **The reconciliation shots.** p.reconciliation.default.1280 and .1280-dark are identical from row 0 to row 1267, and .390 from row 0 to row 2011. That takes in the upload panel with its help line.
- **The notices.**
  - In p.abstraction-version.model-too-long.*, the notice is pixel-identical to screens-fix2:
    - rows 0 to 528 at 1280, light and dark, and rows 0 to 807 at 390;
    - the words are notices.ts:54 word for word: one line at 1280, two at 390.
  - In p.abstraction-version.model-names-patient.*, it is identical over rows 0 to 568 at 1280 and rows 0 to 927 at 390.
  - The dark tokens are unchanged:
    - the card is (11,22,38);
    - the title is (232,132,107), 6.87:1;
    - the body is (167,177,194), 8.39:1.

**#79's table behaviour is present.**
- **At 390 no page scrolls sideways any more.** Every 390 shot is 390 px wide. Before, contracts was 664 px, reconciliation 405 and uploads 534.
- **At 390, each wide table scrolls inside its own frame.** This covers Receipts (both uploads shots), the Contracts table (all three contracts shots), and Exports and both entry tables (reconciliation).
  - Each such table has the caption "Scroll sideways for more columns.", in (82,96,112) on white, 6.43:1.
  - Each has a fade at the right edge over the column it cuts. The fade's surface is white, the same as the page and the card, so no band of another colour shows.
  - The table's rule stops inside the 16 px gutter, at x 369.
- **At 1280 every table in the sample fits**, so no caption, fade or region suffix shows, as ADR 0078 intends.
- **Dates stay whole.**
  - The contracts row reads "2026-01-01 / through / 2026-12-31" (WholeDates). Before, "2026-12-" broke from "31".
  - Exports' Uploaded reads "2026-10-28 / 03:41 UTC".
  - The approvals read "…, 2026-10-28 03:40 UTC".
- **Reconciliation:**
  - each case line is titled "Case line 1 of 1, 97110 on 2026-03-09";
  - Rows and Matched are mono;
  - Written by and Reason are floored at 10rem, so those columns move 4 to 6 px at 1280.
- **The version page's rate record (p.abstraction-version.model-*.390):**
  - Each approval ("Approved by contract-specialist@synthetic.test, 2026-10-28 03:40 UTC") now stands under its terms, inside the card.
  - This ends screens-fix2's clip of the "Approved by" column inside the table's scroller ("specialist@synthetic.te", "02:15 UT").
  - At 1280 the same layout is 4 px taller; at 390 it is 16 px shorter.
  - Below the record, everything is identical except data and the known antialiasing on the "Draft the correction" button: at most 15/255, rows 2035 to 2038 at 1280 and row 3287 at 390.

## Findings
Each finding gives its shot ids. None is a regression of #75 or of the merge.

1. **M3-1 (fixed by the merge, capture; was C-1 in fix/shots.md).** p.contracts.no-kind.390 and p.contracts.held-ready.390 now show the kind select's focus ring.
   - In screens-fix, the tour's toTop had to blur the select, because the 664 px wide page left the visual viewport at y 867.
   - Now the page is 390 px wide, no VIEWPORT line was logged, and the ring is drawn: rows 1247 to 1290 are the only non-data band against screens-fix. Crops: `no-kind.390.uploader.new-vs-fix.png` and `held-ready.390.uploader.new-vs-fix.png`.
2. **M3-2 (fixed by the merge; was the 390 rate-record clip in fix/shots2.md).** p.abstraction-version.model-too-long.390 and p.abstraction-version.model-names-patient.390: the "Approved by" column is no longer cut. See "#79's table behaviour" above.
3. **M3-3 (carried, unchanged; was D-1 in fix/shots.md).** The kind select is as wide as its help line: about 312 px at 1280.
   - Shots: p.contracts.default.1280, .no-kind.1280, .held-ready.1280, p.reconciliation.default.1280, and their dark shots.
   - The panel's rows are pixel-identical to screens-fix, so the merge's `max-w-full`/`min-w-0` changed nothing visible there.
4. **M3-4 (carried, unchanged; was D-2 in fix/shots.md).** At 390 the chosen ERA option is cut inside its select: "ERA export from a practice-managemen".
   - Shot: p.uploads.error-era-system.390.
   - Its pixels are identical to screens-fix (rows 0 to 901).
5. **M3-5 (new to the eye, by design, not a regression).** At 390, the cells a person most needs are behind the scroll on three tables, and the blank height of a hidden cell shows as a gap:
   - **Receipts:** only Received, Document and Kind are in view, and Status and Report are behind the scroll. Shots: p.uploads.default.390 and p.uploads.error-era-system.390.
     - The "contract" row shows about 50 px of blank space under its cells. Its hidden Status note wraps there.
   - **Contracts:** only Payer, Contract and Plans are in view. Shots: p.contracts.default.390, .no-kind.390 and .held-ready.390.
     - The row is about 40 px taller than its visible cells, because of the hidden Effective dates and Coverage share.
   - **Reconciliation:** each entry table shows #, Money moved, Stage, Amount and part of Case, and "Case ledger" fades at the edge. Shot: p.reconciliation.default.390.
   - **Before and now.** Before, those columns were off-screen past x 390 as well, and the whole page scrolled to reach them. Now only the table scrolls, and the caption says so. ADR 0078 puts the stacked working lists in a later pull request ("Not covered"), which would put each row's status in view. Record it for that pull request.
6. **M3-6 (not seen, by sample).** Several parts of #79's behaviour are not in these shots:
   - **Dark.** #79's caption and fades are never drawn in dark. The sample's dark shots are at 1280, where every table here fits. The fade's dark surface (`--pw-scroll-surface` defaulting to `--pw-bg`, or a card's raised surface) is not seen. A 390 dark shot would show it; the sample does not name one.
   - **The keyboard.** No shot focuses a scroller. Its region name, its tab stop and the focus outline on `.pw-scroll-frame` cannot show in a still unless it is focused. check3's e2e (`tables-phone.spec.ts`, 56 passed) proves the keyboard path at 390.
   - **#79's file-name span in uploader.tsx.** It shows only in "This batch", after Upload (a write). The held list shows the short synthetic names (version-1.pdf, export.csv) whole; a long name is not exercised.
   - **Stacked rows.** No page uses `StackedRows` yet (see the top).
7. **Not a finding, but for whoever reads the shots.** p.contracts.default.1280 and its no-kind, held-ready and dark shots: "Version 1 (in force)" and the payer cells re-wrap because of WholeDates' column widths. On the version page, the link on "The page" ("…03:40 UTC (0515f73a)") wraps onto a second line at 1280. That is the data's width (its time and hash). The link's markup, the document list in `review.tsx`, is unchanged by the merge.
8. **Seen, existing before, unchanged:**
   - "The document’s pages are still being read; try again in a minute" shows on the signed-off version's page and record;
   - "Enter its terms by hand below" points at a page with no hand-entry form, because the tour opens the notice on a signed-off version (the route map's notReached "draft-forms");
   - "Money moved" wraps in the entry tables' header at 1280.

**No regression was found.** Nothing is clipped that was not clipped before, except the columns each `ScrollTable` now holds behind its caption and fade on purpose. The dark tokens of the notices, the panels and the shell are unchanged.

## Files
- Shots: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge2/shots.json (24 shots, 0 skipped); PNGs in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge2/png/
- Tiles: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge2/tiles/index.json (70 tiles)
- Logs, all in the TOUR_DIR: setup.log, lock.log, build.log, run.log, populate.log, capture.log and progress.log.
- Comparison scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge2-shots-scripts/ (`cmp.py`, `bands.py`)
- 2x crops: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge2-shots-crops/
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/shots3.md
