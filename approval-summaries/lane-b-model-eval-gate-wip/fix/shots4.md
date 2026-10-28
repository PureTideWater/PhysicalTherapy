# PR #75 uploader screens on the merged head (co-001/contract-phi-check at a8bf75ca, with #74)

All data is synthetic. The PNGs and tiles are in the session scratchpad, and none is in a git tree. I checked /home/user/ops, /home/user/screens, /home/user/PhysicalTherapy and /home/user/contract-phi-check: each is clean, with no PNG changed, untracked or ignored. Nothing was committed or pushed. No file in /home/user/ops changed: every `cap()` in the sample ran on this build (all 24 shots taken, none skipped). This run started fresh, because no shots4 progress file existed.

## What the merge brought to these screens (a8bf75ca against 871faff9)
- **`uploader.tsx`:**
  - The refused field's words are #74's `FieldError`: an icon, a bold "Error:" (aria-hidden) and the message at 14 px, in #75's `<div key={attempt} role="alert">`. They were 12 px words before.
  - The help under each select is #74's `Hint` at 14 px. It was 12 px.
  - The invalid border is styles.css's unlayered rule, 2 px. It was a 1 px `aria-invalid:border-destructive`.
  - The file input is aria-hidden and out of the tab order. Nothing shows for this.
- **`packages/ui/src/styles.css`:**
  - Below md, inputs, selects and textareas are 16 px (ADR 0077). This reaches every 390 shot.
  - `select { max-width: 100% }`.
  - `scroll-padding-top`.
- **Other forms on the sample's pages:**
  - **Contracts:** TagForm's Payer and Contract use `showChosen`, and its hints are 14 px.
  - **Version page:** `CheckboxField`, `CheckboxGroup` and `TextAreaField` are used, with new hints.
  - **Reconciliation:** ReverseForm uses `TextAreaField` and `CheckboxField`. It sits inside a closed `<details>`, so no shot shows it.

## The run
- **TOUR_REF** = a8bf75ca…, from `git -C /home/user/contract-phi-check rev-parse HEAD`. That is check 4's docs commit, on top of merge 26388626. The worktree was clean.
  - setup.sh checked /home/user/screens out at a8bf75ca. Before that it was clean at 871faff9.
  - setup.sh ran from 06:01:06 to 06:01:10 and exited 0. pnpm printed "Already up to date" (setup.log).
- **TOUR_DIR** = /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge3
- **TOUR_ONLY** is shots3's, unchanged: `p.contracts.default.*,p.contracts.no-kind.*,p.contracts.held-ready.*,p.reconciliation.default.*,p.uploads.default.*,p.uploads.error-era-system.*,p.uploads.error-era-system.1280-dark,p.abstraction-version.model-names-patient.*,p.abstraction-version.model-too-long.*`
- **Commands.** Every command began with `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin` and followed the README:
  - `bash tools/lane-b-screen-tour/setup.sh`, from /home/user/ops;
  - `TOUR_MINUTES=30 flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1`, in the background, with the lock times in lock.log;
  - `bash run.sh`, with the TOUR_ONLY above, in the background;
  - `touch $TOUR_DIR/stop`.
- **Times (UTC):**
  - The lock was asked for and got at 06:01:29.
  - The build ended at 06:03:16, the prepare (tp_e2e_screens) ran next, and the server was ready at 06:03:48.
  - Populate: 11 passed in 2.5 min, exit 0.
  - Capture: 06:06:18 to 06:07:05. All 6 tests passed in 46.4 s. progress.log says "DONE 24 shots taken this run; shots.json holds 24 shots and 0 skipped" and "RECORDS 46 found; missing: none".
  - progress.log has no VIEWPORT line, so no shot needed more than `scrollTo`.
- **The refused field's checks passed in the capture itself.** They are noKind's and error-era-system's assertions:
  - `#upload-kind-error` and `#upload-format-error` hold the words alone;
  - `aria-invalid` is "true";
  - the select `toBeFocused`;
  - held-ready has no `#upload-kind-error`, and it shows "Upload 1 file".
- **Nothing was uploaded.**
  - Every upload step ran behind `noUploadRequest`, and none threw.
  - The tour database holds 23 source_document rows. The newest was created at 06:05:24, during populate. None was created after the capture started at 06:06:18; the count is 0.
- **Stop:**
  - `stop` was touched at 06:14:04, after I had checked the shots.
  - build.log says "server stopped at 06:14:07". build.sh, which held the lock, exited 0 at 06:14:07. The lock was held for about 12.6 minutes and is free now (`flock -n` got it).
  - Afterwards `fuser 3297/tcp` printed nothing (exit 1).
- **Tiles:** I ran `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> p.contracts.default. p.contracts.no-kind. p.contracts.held-ready. p.reconciliation.default. p.uploads.default. p.uploads.error-era-system. p.abstraction-version.model-names-patient. p.abstraction-version.model-too-long.` from /home/user/ops.
  - It printed "24 shots tiled into 74 tiles" (70 before).
  - The four extra tiles: p.contracts.no-kind.1280 and its dark shot are now 1607 px tall, and p.uploads.default.1280 and its dark shot 804 px, so each gets a short last tile.
- **Clean-up (README step 6):**
  - `DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)` printed DROP DATABASE.
  - I removed the five `/tmp/tp-e2e-tp_e2e_screens-*` directories (billing, dev-auth, documents, mail, model-outputs), and none is left.
  - The databases left at localhost:5433 were all there before: postgres, tp_e2e, tp_e2e_ux and three tp_test_*.
- **Retakes:** none was needed, and `skipped` is empty.

## Shots
Each shot's screen, state and role come from `<TOUR_DIR>/shots.json`. Each PNG is `<TOUR_DIR>/png/<id>.png`, and its tiles are in `<TOUR_DIR>/tiles/<id>/`. The comparison is with /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge2/png/ (871faff9).

| id | state | role | size now | merge2 | tiles |
|---|---|---|---|---|---|
| p.contracts.default.1280 | default | era-manager | 1280x1483 | 1280x1471 | 2 |
| p.contracts.default.1280-dark | default | era-manager | 1280x1483 | 1280x1471 | 2 |
| p.contracts.default.390 | default | era-manager | 390x2050 | 390x2030 | 3 |
| p.contracts.no-kind.1280 | interaction:no-kind | era-manager | 1280x1607 | 1280x1591 | 3 |
| p.contracts.no-kind.1280-dark | interaction:no-kind | era-manager | 1280x1607 | 1280x1591 | 3 |
| p.contracts.no-kind.390 | interaction:no-kind | era-manager | 390x2214 | 390x2166 | 3 |
| p.contracts.held-ready.1280 | interaction:held-ready | era-manager | 1280x1583 | 1280x1571 | 2 |
| p.contracts.held-ready.1280-dark | interaction:held-ready | era-manager | 1280x1583 | 1280x1571 | 2 |
| p.contracts.held-ready.390 | interaction:held-ready | era-manager | 390x2150 | 390x2130 | 3 |
| p.reconciliation.default.1280 | default | ledger-manager | 1280x2678 | 1280x2674 | 4 |
| p.reconciliation.default.1280-dark | default | ledger-manager | 1280x2678 | 1280x2674 | 4 |
| p.reconciliation.default.390 | default | ledger-manager | 390x4060 | 390x4052 | 5 |
| p.uploads.default.1280 | default | pricing-manager | 1280x804 | 1280x800 | 2 |
| p.uploads.default.1280-dark | default | pricing-manager | 1280x804 | 1280x800 | 2 |
| p.uploads.default.390 | default | pricing-manager | 390x912 | 390x904 | 2 |
| p.uploads.error-era-system.1280 | error | pricing-manager | 1280x1044 | 1280x1028 | 2 |
| p.uploads.error-era-system.1280-dark | error | pricing-manager | 1280x1044 | 1280x1028 | 2 |
| p.uploads.error-era-system.390 | error | pricing-manager | 390x1192 | 390x1164 | 2 |
| p.abstraction-version.model-names-patient.1280 | interaction:model-names-patient | contract-specialist | 1280x2538 | 1280x2536 | 4 |
| p.abstraction-version.model-names-patient.1280-dark | interaction:model-names-patient | contract-specialist | 1280x2538 | 1280x2536 | 4 |
| p.abstraction-version.model-names-patient.390 | interaction:model-names-patient | contract-specialist | 390x3880 | 390x3850 | 5 |
| p.abstraction-version.model-too-long.1280 | interaction:model-too-long | contract-specialist | 1280x2498 | 1280x2496 | 4 |
| p.abstraction-version.model-too-long.1280-dark | interaction:model-too-long | contract-specialist | 1280x2498 | 1280x2496 | 4 |
| p.abstraction-version.model-too-long.390 | interaction:model-too-long | contract-specialist | 390x3760 | 390x3730 | 5 |

## How I compared
- **By eye:** I looked at every shot myself, as a whole PNG or as side-by-side crops at 1x or 2x, against its screens-merge2 copy.
- **Scripts,** in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge3-shots-scripts/:
  - `cmp.py`: the rows identical from the top and the bottom. The output for all 24 pairs is in `merge3-shots-crops/cmp-all.txt`.
  - `bands.py`: the bands that differ by more than 2/255 at a given shift.
  - `side.py`: new | old crops.
  - `colors.py`: text colours and their contrast.
  - `selw.py`: a select's box width.
- **Crops:** /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge3-shots-crops/.
- **Dark against light.** For each screen, every row that changed between the dark pair also changed between the light pair. The one exception is row 41 of p.uploads.default.1280-dark, the avatar's antialiasing, below. So nothing changed in dark only.
- **Data, not the merge.** Each run had its own fresh prepare, so these differ in every pair:
  - receipt, approval and ledger times (06:04 to 06:05 now, 03:40 to 03:41 before);
  - document hashes (1d8033bc and e4b71110 now; 0515f73a and 9d879b77 before);
  - the order of the two 835 receipts in Receipts;
  - the version the tour opened: "With SYNTHETIC PAYER N." now, "Q." before.
- **The header.** p.uploads.default.1280 and its dark shot differ at x 1010 to 1028, rows 14 to 41, by at most 5/255. That is the "P" avatar's antialiasing. The other shots' headers are pixel-identical.

## Both sides present

**#75's held files and notices are all there, unchanged in behaviour.**
- **p.uploads.error-era-system.1280, .1280-dark and .390.** The panel shows, in order:
  - "Kind of document": ERA export;
  - the help;
  - "Which system’s export", marked;
  - "Error: Choose which system’s ERA export this file is, then upload it." under it, before its help;
  - "Choose files" as an outline button;
  - "Waiting to upload: 1 file", then export.csv, then Clear, with no Upload.
- **p.contracts.no-kind.1280, .1280-dark and .390.** The kind select is marked. Under it are "Error: Choose the kind of document for this file, then upload it.", then the help, the outline "Choose files", "Waiting to upload: 1 file", version-1.pdf and Clear.
- **p.contracts.held-ready.1280, .1280-dark and .390.** "Contract" is chosen, with a 1 px border and the focus ring, and no error line. Then come the help, "Waiting to upload: 1 file", version-1.pdf, and the primary "Upload 1 file" beside an outline Clear.
- **p.contracts.default.*, p.uploads.default.* and p.reconciliation.default.*.** These show the empty panel: the placeholder or the first kind, the help and the primary "Choose files".
- **The notices are pixel-identical to screens-merge2.**
  - **p.abstraction-version.model-too-long.\*:** rows 216 to 528 at 1280, light and dark, and rows 279 to 807 at 390. "Nothing was proposed / This document is too long to send to the model, so nothing was sent. Enter its terms by hand below."
  - **p.abstraction-version.model-names-patient.\*:** rows 216 to 568 at 1280, light and dark, and rows 279 to 927 at 390.
  - Above those rows only the payer line differs (data). Below them, only times and hashes differ until the forms.
  - The rate record at 390 keeps #79's layout, with each approval under its terms (M3-2). Above row 2577, the only bands are data.

**#74's behaviour is present.**
- **The refused field's error and focus are right.** These are p.uploads.error-era-system.1280, .1280-dark and .390, and p.contracts.no-kind.1280, .1280-dark and .390.
  - **Border:** the select's border is 2 px of the danger colour: (181,69,46) in light and (232,132,107) in dark. It was 1 px.
  - **Focus ring:** 2 px, outside the border with a 2 px gap: (47,93,168) in light and (143,179,240) in dark. Nothing cuts the ring at 390: the system select's ring ends at x 343, and the kind select's at about x 318, inside the 16 px gutter and the drop zone.
  - **Error line:** the icon, a bold "Error:" and the words at 14 px.
    - In light they are (181,69,46) on white, 5.45:1. In dark they are (232,132,107) on (11,22,38), 6.87:1.
    - At 390 the words wrap beside "Error:". The system's error takes 2 lines and the kind's 3.
  - **Order:** the error stands under the select and before the help, as the description order requires (error, then hint).
- **The help is 14 px** under every kind and system select, in all 24 shots: (82,96,112) on white, 6.43:1; (167,177,194) on dark, 8.39:1.
  - The tag form's hints on the Contracts page are 14 px too ("As the document names the agreement.", "The date the document says it takes effect.", "Blank while it continues until amended.").
  - So are the version page's hints ("Blank keeps 2026-01-01.", "About the contract’s terms only; never a patient detail.").
- **At 390 every select, input and textarea is 16 px.** This covers:
  - the Contracts filters, the kind select, the tag form's Payer, Contract, title and dates;
  - the uploads kind and system selects;
  - the reconciliation kind select;
  - the version page's dates, "None yet", "Missing pages" and Question.
  - Because of it, the 390 shots grow by 8 to 48 px.
- **The submit button of a row form now stands centred on the row's last field, not at its top.**
  - **On the Contracts tag form** (p.contracts.*.1280 and the dark shots), "Tag to the payer" is at rows 1503 to 1538, and the Last day box at rows 1500 to 1535. Before, the button was at rows 1468 to 1503, level with the label.
  - **On the version page** (p.abstraction-version.*.1280 and the dark shots), "Draft the amendment" is at rows 1688 to 1723. It is centred on the label and box of "The amendment's document" (1680 to 1733). Before, it was at rows 1678 to 1713.
  - This is #74's form layout and not #75's, so it is not a regression of this PR. See M4-4.
- **The dark tokens are unchanged.**
  - The panels' surface is (11,22,38).
  - The help is (167,177,194), the danger colour (232,132,107) and the ring (143,179,240).
  - The notices' rows are pixel-identical to screens-merge2.

## Findings
Each finding gives its shot ids.

1. **M4-1 (new clip at 390, from #74's 16 px controls meeting #75's kind select).** At 390 the kind select's placeholder "Choose the kind of document" is cut inside its box.
   - **What shows:**
     - "Choose the kind of documen" in p.contracts.default.390 and p.reconciliation.default.390;
     - "Choose the kind of documer" in p.contracts.no-kind.390, where the 2 px refused border takes two more pixels.
     - At 14 px (screens-merge2) it was whole.
   - **Where:** the select fills the drop zone's column, x 75 to 316, about 240 px.
   - **Why it matters:** in p.contracts.no-kind.390 this is the refused field, so the control the person must fix shows a cut prompt. The label above ("Kind of document") and the error ("Choose the kind of document for this file, then upload it.") still say it whole.
   - **Not affected:** p.contracts.held-ready.390 ("Contract") and p.uploads.*.390 ("835 remittance") fit.
   - **Crops:** `default.390.kind-select.new-vs-merge2.png`, `no-kind.390.kind-select.new-vs-merge2.png` and `reconciliation.390.upload.new-vs-merge2.png`.
   - **Cause:** `CHOOSE_KIND_PLACEHOLDER` in uploader.tsx at 16 px is wider than the 240 px column at 390. The kind select does not use #74's `showChosen`.
   - **Status:** a product finding for #75's uploader on this merge, not a capture fault.
2. **M4-2 (carried and a little worse; was M3-4).** At 390 the chosen ERA kind is cut further: "ERA export from a practice-manage". At 14 px it read "…practice-managemen".
   - Shot: p.uploads.error-era-system.390.
   - Crop: `era-system.390.panel.new-vs-merge2.png`.
3. **M4-3 (changed; was M3-3).** The selects are as wide as the widest line under them at 1280, and the kind select now changes width with its state.
   - **Contracts' kind select** is 364 px in p.contracts.default.1280 and p.contracts.held-ready.1280. While the error shows, in p.contracts.no-kind.1280, it is 414 px. In screens-merge2 it was 312 px in all three.
     - So the select widens by 50 px when files wait for the kind and narrows again once Contract is chosen.
     - The cause is the 14 px "Error: …" line, which is wider than the help.
   - **Uploads' kind select** is 364 px (343 before), in p.uploads.default.1280 and p.uploads.error-era-system.1280.
   - **Reconciliation's kind select** is 364 px (312 before), in p.reconciliation.default.1280.
   - **The ERA system select** is 546 px (468 before), in p.uploads.error-era-system.1280.
   - The dark shots show the same widths.
   - Measured with `selw.py`, ring excluded.
4. **M4-4 (#74, not #75; seen on the sample's screens).** The row forms' submit buttons have moved: they are now centred on the last field's label, box and hint, not at its top (above).
   - **Contracts tag form:** "Tag to the payer" ends 3 px below the Last day date box. Shots: p.contracts.default.1280, .no-kind.1280, .held-ready.1280 and their dark shots. Crop: `no-kind.1280.tagform.new-vs-merge2.png`.
   - **Version page:** "Draft the amendment" stands 10 px above the select's top. Shots: p.abstraction-version.model-too-long.1280 and .model-names-patient.1280 and their dark shots. Crop: `model-too-long.1280.forms.new-vs-merge2.png`.
   - Whoever owns #74's layout should judge it. It is not a regression of #75 or of this merge's resolution.
5. **M4-5 (still fixed; was M3-1).** p.contracts.no-kind.390 and p.contracts.held-ready.390 draw the kind select's focus ring. No VIEWPORT line was logged.
6. **M4-6 (carried, unchanged; was M3-5).** At 390 the Receipts, Contracts and entry tables keep Status, Report, Effective, Coverage share and "Case ledger" behind the scroll. The blank height of a hidden cell still shows as a gap.
   - Shots: p.uploads.*.390, p.contracts.*.390 and p.reconciliation.default.390.
   - Below the panels these shots differ only in data, after a shift of 8 to 48 px.
   - ADR 0078 leaves the stacked working lists to a later pull request.
7. **M4-7 (not seen, by sample; was M3-6, with two additions).**
   - **Carried from M3-6:**
     - No 390 dark shot exists, so the 16 px controls, #79's fades and the refused field's marks are not seen dark at phone width.
     - No shot focuses a table scroller.
     - #79's file-name span in "This batch" needs Upload, which is a write.
   - **New:**
     - #74's `showChosen` line on the tag form is not drawn, because no Payer or Contract option is cut on this data.
     - #74's ReverseForm fields are inside a closed "Reverse this match", so p.reconciliation.default.* shows none of them.
   - **Not visible in a still:** the keyed `role="alert"` and the announcement. The capture's own assertions passed: the words in `#upload-*-error` alone, aria-invalid, and focus.

**No regression of #75 was found, and none from the merge's resolution in uploader.tsx.**
- The one new clip is M4-1. It comes from #74's 16 px controls meeting #75's placeholder at 390.
- Every other difference is either #74's intended form styling (the error line, the hints, the 2 px border, the 16 px controls, the button placement), or data.

## Files
- Shots: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge3/shots.json (24 shots, 0 skipped). The PNGs are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge3/png/
- Tiles: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge3/tiles/index.json (74 tiles)
- Logs: setup.log, lock.log, build.log, run.log, populate.log, capture.log and progress.log, all in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge3/
- Comparison scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge3-shots-scripts/ (`cmp.py`, `bands.py`, `side.py`, `colors.py`, `selw.py`)
- Crops and cmp-all.txt: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge3-shots-crops/
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/shots4.md
