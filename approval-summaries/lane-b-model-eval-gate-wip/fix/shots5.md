# PR #75 uploader screens after fix 3 (co-001/contract-phi-check at 7f77cb19)

All data is synthetic. The PNGs, tiles and crops are in the session scratchpad, which is not inside any git tree. I checked /home/user/ops, /home/user/screens, /home/user/contract-phi-check and /home/user/PhysicalTherapy. Each is clean, and none has a PNG that is changed, untracked or ignored. Nothing was committed or pushed, and no tracked file in /home/user/ops changed: every `cap()` in the sample ran on this build. This run started fresh, because no shots5 progress file existed.

**Result:**
- **M4-1 is resolved.** "Choose a kind" shows whole at 390 in every state.
- **M4-3 is resolved.** Every kind and system select is 448 px at 1280, in every state, light and dark.
- **M4-2 is resolved too,** by fix 3's shorter label: "ERA export" shows whole at 390.
- **Nothing else changed except what fix3.md describes:** the system's help wraps inside the 448 px box. All other differences are data.
- **Nothing is newly clipped, and the dark tokens are unchanged.**
- **The tour cannot take a 390 dark shot.** I asked for `p.contracts.no-kind.390-dark`, and the run recorded it as skipped.

## What fix 3 should change on these screens (7f77cb19 against a8bf75ca, per fix3.md)
- **The placeholder** is "Choose a kind" (it was "Choose the kind of document"). It appears in the Contracts and Reconciliation panels.
- **Both fields (kind and ERA system) use `FIELD_BOX`,** which is `flex w-full min-w-0 max-w-md flex-col gap-1`. Each select is `w-full`. So each select is as wide as the drop zone's column, up to 448 px, whatever is written under it.
- **`max-w-prose` is gone** from the alert div, the hints and the unconfirmed-format note. The field's lines now wrap at the 448 px box.
- **The Uploads page takes its labels from `KIND_NAMES`.** "835 remittance" is unchanged. The ERA option is now "ERA export" (it was "ERA export from a practice-management system").

## The run
- **TOUR_REF** = 7f77cb19…, from `git -C /home/user/contract-phi-check rev-parse HEAD`. The worktree was clean. The commit resolves in /home/user/PhysicalTherapy, the repository that /home/user/screens is a worktree of.
  - setup.sh moved /home/user/screens from a8bf75ca (clean) to 7f77cb19. It ran from 06:54:51 to 06:54:54 and exited 0. pnpm printed "Already up to date" (setup.log).
- **TOUR_DIR** = /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix3
- **TOUR_ONLY** is shots4's, with one id added at the end: `p.contracts.default.*,p.contracts.no-kind.*,p.contracts.held-ready.*,p.reconciliation.default.*,p.uploads.default.*,p.uploads.error-era-system.*,p.uploads.error-era-system.1280-dark,p.abstraction-version.model-names-patient.*,p.abstraction-version.model-too-long.*,p.contracts.no-kind.390-dark`
- **Commands.** Every command began with `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin`. In the README's order:
  - `bash tools/lane-b-screen-tour/setup.sh`, from /home/user/ops;
  - `TOUR_MINUTES=30 flock /tmp/laneb-heavy.lock bash -c '…; bash build.sh > build.log 2>&1; …'`, in the background. The lock times are in lock.log.
  - `bash run.sh` with the TOUR_ONLY above, in the background;
  - `touch $TOUR_DIR/stop`.
- **The build was checked before the capture.** It printed "Compiled successfully in 5.3s" (06:55:11 to 06:55:31). "Choose a kind" is in the uploader's client and SSR chunks. The old placeholder string (`Choose the kind of document"`) is in none of them.
- **Times (UTC):**
  - **Lock:** asked for and got at 06:55:10.
  - **Prepare:** 06:55:31 to 06:56:01. The server was ready at 06:56:04.
  - **Populate:** 06:56:05 to 06:58:52. 11 passed (2.8 min), exit 0.
  - **Capture:** 06:58:52 to 06:59:40. 6 passed (47.4 s), exit 0.
    - progress.log says "DONE 24 shots taken this run; shots.json holds 24 shots and 1 skipped" and "RECORDS 46 found; missing: none".
    - progress.log has no VIEWPORT line, so `scrollTo` was enough for every shot.
- **The refused field's checks passed in the capture itself.** These are noKind's and the error-era-system step's assertions:
  - `#upload-kind-error` and `#upload-format-error` hold only the words;
  - `aria-invalid` is "true";
  - the select is focused (`toBeFocused`);
  - held-ready has no `#upload-kind-error` and shows "Upload 1 file".
- **Nothing was uploaded.**
  - Every upload step ran behind `noUploadRequest`, and none threw.
  - The tour database holds 23 source_document rows. The newest was created at 06:57:39, during populate. None was created at or after 06:58:52, when the capture started.
- **The 390 dark shot.** The tour cannot take one.
  - In capture/tour.spec.ts, `snap()` takes a dark shot only when `width === 1280` (line 442). `cap()` (line 735) and the two `attempt()` lists (lines 804 and 909) add a dark id only at 1280.
  - So the run recorded `p.contracts.no-kind.390-dark` in `skipped`: "named in TOUR_ONLY, but no step of this run took it".
  - I did not change the spec. Every `cap()` runs, so nothing in it was broken. A 390 dark shot would be new capture, and the brief allows a change to /home/user/ops only to repair a `cap()` that no longer runs.
- **Stop:**
  - `stop` was touched at 07:01:45, after I had checked the panels for capture faults (none).
  - build.log says "server stopped at 07:01:45", and build.sh, which held the lock, exited 0 at 07:01:45. The lock was held for about 6.6 minutes and is free now (`flock -n` got it).
  - `fuser 3297/tcp` printed nothing (exit 1), before and after the clean-up.
- **Tiles:** `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> p.contracts.default. p.contracts.no-kind. p.contracts.held-ready. p.reconciliation.default. p.uploads.default. p.uploads.error-era-system. p.abstraction-version.model-names-patient. p.abstraction-version.model-too-long.`, run from /home/user/ops. It printed "24 shots tiled into 74 tiles", the same count as shots4, because every shot's size is unchanged.
- **Clean-up (README step 6), at 07:02:**
  - `DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)` printed DROP DATABASE.
  - I removed the five `/tmp/tp-e2e-tp_e2e_screens-*` directories (billing, dev-auth, documents, mail, model-outputs). None is left.
  - The databases left at localhost:5433 were all there before: postgres, tp_e2e, tp_e2e_ux and three tp_test_*.
- **Retakes:** none was needed. The only skip is the 390 dark id above.

## Shots
Each shot's screen, state and role come from `<TOUR_DIR>/shots.json`. Each PNG is `<TOUR_DIR>/png/<id>.png`, and its tiles are in `<TOUR_DIR>/tiles/<id>/`.
- The comparison is with /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-merge3/png/ (a8bf75ca).
- Every shot is the same size as its merge3 copy.
- shots.json's route, role, width, theme, state and note are the same for all 24 shots. Only the record IDs in the paths differ (a fresh database).

| id | state | role | size (= merge3) | tiles | what differs from merge3 |
|---|---|---|---|---|---|
| p.contracts.default.1280 | default | era-manager | 1280x1483 | 2 | kind select 448 px (364); "Choose a kind"; data |
| p.contracts.default.1280-dark | default | era-manager | 1280x1483 | 2 | the same |
| p.contracts.default.390 | default | era-manager | 390x2050 | 3 | "Choose a kind" whole (was cut); data |
| p.contracts.no-kind.1280 | interaction:no-kind | era-manager | 1280x1607 | 3 | kind select 448 (414); "Choose a kind"; data |
| p.contracts.no-kind.1280-dark | interaction:no-kind | era-manager | 1280x1607 | 3 | the same |
| p.contracts.no-kind.390 | interaction:no-kind | era-manager | 390x2214 | 3 | "Choose a kind" whole (was cut); data |
| p.contracts.held-ready.1280 | interaction:held-ready | era-manager | 1280x1583 | 2 | kind select 448 (364); data |
| p.contracts.held-ready.1280-dark | interaction:held-ready | era-manager | 1280x1583 | 2 | the same |
| p.contracts.held-ready.390 | interaction:held-ready | era-manager | 390x2150 | 3 | data only (rows 0 to 1615 pixel-identical) |
| p.reconciliation.default.1280 | default | ledger-manager | 1280x2678 | 4 | kind select 448 (364); "Choose a kind"; data |
| p.reconciliation.default.1280-dark | default | ledger-manager | 1280x2678 | 4 | the same |
| p.reconciliation.default.390 | default | ledger-manager | 390x4060 | 5 | "Choose a kind" whole (was cut); data |
| p.uploads.default.1280 | default | pricing-manager | 1280x804 | 2 | kind select 448 (364); data |
| p.uploads.default.1280-dark | default | pricing-manager | 1280x804 | 2 | the same |
| p.uploads.default.390 | default | pricing-manager | 390x912 | 2 | data only (rows 0 to 706 pixel-identical) |
| p.uploads.error-era-system.1280 | error | pricing-manager | 1280x1044 | 2 | kind 448 (364) reading "ERA export"; system 448 (546); system help rewrapped; data |
| p.uploads.error-era-system.1280-dark | error | pricing-manager | 1280x1044 | 2 | the same |
| p.uploads.error-era-system.390 | error | pricing-manager | 390x1192 | 2 | "ERA export" whole (was cut); data |
| p.abstraction-version.model-names-patient.1280 | interaction:model-names-patient | contract-specialist | 1280x2538 | 4 | data only |
| p.abstraction-version.model-names-patient.1280-dark | interaction:model-names-patient | contract-specialist | 1280x2538 | 4 | data only |
| p.abstraction-version.model-names-patient.390 | interaction:model-names-patient | contract-specialist | 390x3880 | 5 | data only |
| p.abstraction-version.model-too-long.1280 | interaction:model-too-long | contract-specialist | 1280x2498 | 4 | data only |
| p.abstraction-version.model-too-long.1280-dark | interaction:model-too-long | contract-specialist | 1280x2498 | 4 | data only |
| p.abstraction-version.model-too-long.390 | interaction:model-too-long | contract-specialist | 390x3760 | 5 | data only |
| p.contracts.no-kind.390-dark | — | — | not taken | — | skipped: the tour takes dark at 1280 only |

## How I compared
- **By eye:** I looked at all 24 shots myself, each as a whole PNG. I also looked at side-by-side crops (new | merge3) of every upload panel and at a sheet of every changed band per pair.
- **Scripts,** in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix3-shots-scripts/:
  - shots4's `cmp.py`, `bands.py`, `side.py`, `colors.py` and `selw.py`;
  - `edges.py`: a select's ring, border, words and chevron as runs on one row;
  - `bandsheet.py`: each changed band, new | old;
  - `darkonly.py`: rows changed in dark but not in light;
  - `fills.py`: a pixel in each image;
  - `textext.py`: the chosen words' extent inside a select.
- **Outputs,** in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix3-shots-crops/:
  - `cmp-all.txt` and `bands-all.txt`;
  - `bands/<id>.bands.png`;
  - the panel crops `*.new-vs-merge3.png`.
- **Widths** are the select's border box, from its first border pixel to its last, with the ring left out. The ring is 4 px further out on each side.

## M4-1 and M4-3: the selects' widths in each state

**At 1280 (light and dark are the same, pixel for pixel in x):**

| Select, shot | Now | merge3 |
|---|---|---|
| Contracts kind, p.contracts.default.1280 / -dark | **448** (x 347 to 794) | 364 |
| Contracts kind, refused, p.contracts.no-kind.1280 / -dark | **448** (347 to 794; ring 343 to 798) | 414 |
| Contracts kind, Contract chosen, p.contracts.held-ready.1280 / -dark | **448** (347 to 794; ring 343 to 798) | 364 |
| Reconciliation kind, p.reconciliation.default.1280 / -dark | **448** (347 to 794) | 364 |
| Uploads kind, p.uploads.default.1280 / -dark | **448** (322 to 769) | 364 |
| Uploads kind, ERA export chosen, p.uploads.error-era-system.1280 / -dark | **448** (322 to 769) | 364 |
| Uploads ERA system, refused, p.uploads.error-era-system.1280 / -dark | **448** (322 to 769; ring 318 to 773) | 546 |

- **M4-3 is resolved.** The Contracts kind select keeps 448 px across default, refused and held-ready, so it no longer widens by 50 px while the error shows.
- The kind and system selects on Uploads now line up: they start and end at the same x.
- These match fix3.md's layout figures (448 for every select at 1280).

**At 390:**

| Select, shot | Now | merge3 | Chosen text (now) |
|---|---|---|---|
| Contracts kind, p.contracts.default.390 | 240 (x 75 to 314) | 240 | "Choose a kind", x 89 to 186, chevron at 302: **whole** (was "Choose the kind of documen") |
| Contracts kind, refused, p.contracts.no-kind.390 | 240 (75 to 314; ring 71 to 318) | 240 | "Choose a kind", 90 to 187: **whole** (was "…documer") |
| Contracts kind, held-ready, p.contracts.held-ready.390 | 240 (ring 71 to 318) | 240 | "Contract": the panel is pixel-identical |
| Reconciliation kind, p.reconciliation.default.390 | 240 (75 to 314) | 240 | "Choose a kind", 89 to 186: **whole** (was "…documen") |
| Uploads kind, p.uploads.default.390 | 290 (50 to 339) | 290 | "835 remittance": pixel-identical |
| Uploads kind, p.uploads.error-era-system.390 | 290 (50 to 339) | 290 | "ERA export", 64 to 142: **whole** (was "ERA export from a practice-manage") |
| Uploads ERA system, p.uploads.error-era-system.390 | 290 (50 to 339) | 290 | "Choose the system", 65 to 198: whole, unchanged |

- **M4-1 is resolved.** The placeholder shows whole in each 390 shot that has it. In each it ends about 115 px before the chevron.
- **M4-2 is resolved.** The chosen ERA kind shows whole.
- **The 390 widths are unchanged,** because the column there is narrower than 448 px. The focus ring still sits inside the gutter and the drop zone: x 71 to 318 on Contracts, 46 to 343 on Uploads.

## Every difference from screens-merge3, by shot

**1. The kind select's placeholder** reads "Choose a kind" in place of "Choose the kind of document". This is fix 3.
- **Shots:** p.contracts.default.1280, -1280-dark and .390; p.contracts.no-kind.1280, -1280-dark and .390; p.reconciliation.default.1280, -1280-dark and .390.
- **Rows:** 926 to 961 (contracts default, at 1280), 922 to 965 (no-kind, at 1280, with the ring), 1012 to 1047 (reconciliation, at 1280), 1263 to 1275 (contracts, at 390) and 1782 to 1794 (reconciliation, at 390).
- **Crops:** `no-kind.1280.panel.new-vs-merge3.png`, `default.390.panel.new-vs-merge3.png`, `no-kind.390.panel.new-vs-merge3.png` and `reconciliation.390.panel.new-vs-merge3.png`.

**2. The selects are 448 px at 1280,** as tabled above. This is fix 3. The extra width shows only in the select's own rows:
- p.contracts.*.1280 and their dark shots, rows 922 to 965;
- p.reconciliation.default.1280 and dark, rows 1012 to 1047;
- p.uploads.default.1280 and p.uploads.error-era-system.1280 and their dark shots, rows 365 to 400 (kind) and 457 to 500 (system).

**3. The Uploads kind reads "ERA export"** where the ERA kind is chosen. This is fix 3.
- **Shots:** p.uploads.error-era-system.1280 and -1280-dark (rows 365 to 400), and .390 (rows 437 to 452).
- **Crops:** `era-system.1280.panel.new-vs-merge3.png` and `era-system.390.panel.new-vs-merge3.png`.

**4. The ERA system's help wraps inside the 448 px box.** This is fix 3 ("the field's lines now wrap at 448 px").
- **Shots:** p.uploads.error-era-system.1280 and -1280-dark, rows 529 to 562.
- The words are unchanged. The first line now ends at "Each file" and the second begins "of the batch is read with its layout; a CSV export only."; before, the break fell after "batch is".
- It is still 2 lines, so the panel's height is unchanged.
- The kind's help and both error lines are pixel-identical: each fits one line inside 448 px at 1280. At 390 their line counts are unchanged: the kind's help takes 2 lines, the kind's error 3, the system's error 2 and the system's help 3.

**5. Data, not the fix.** Each run had its own fresh prepare, so these differ:
- **Receipt, approval and ledger times:** 06:56 to 06:57 now, 06:04 to 06:05 before.
- **Document hashes:** 1ae3fd95, 74ae6331, e80c4e6c and 7c5bda6a now; 1d8033bc, e4b71110, b670adb4 and 887306af before.
- **The rows where these show:**
  - p.contracts.*: the "Documents to tag to a payer" receipt, rows 1170 to 1182, 1270 to 1282 and 1294 to 1306 at 1280; rows 1516 to 1547, 1616 to 1647 and 1680 to 1711 at 390.
  - p.uploads.*: the three Receipts rows.
  - p.reconciliation.default.*: Exports, case line, recoupments.
  - p.abstraction-version.*: the dispute window, Approved, Signed off, the page's source link, the rate record's approvals.
- **On the version page at 1280** (p.abstraction-version.model-names-patient.1280, model-too-long.1280 and their dark shots), the source link "contract, 1000 bytes, received … (1ae3fd95)" now fits on one line. "(1d8033bc)" had wrapped to a second line.
  - "Document …, page 2" and "The document's pages are still being read" sit one line higher as a result.
  - The column's height is set by Rate records, so the page height is unchanged.
  - This is the hash's glyph widths. Crop: `names-patient.1280.source.new-vs-merge3.png`.
- **The version the tour opened** is "With SYNTHETIC PAYER N." in both runs. Rows 0 to 568 (names-patient, at 1280) and 0 to 528 (too-long, at 1280) are pixel-identical, and so are rows 0 to 927 and 0 to 807 at 390, which include the notices. So the notices are pixel-identical again.

**6. The header** is pixel-identical in all 24 shots. shots4's 5/255 avatar antialiasing difference on p.uploads.default.1280 does not recur.

**7. Below the panels,** every row differs only in the data bands above.
- The tag form (p.contracts.*) and the version page's three forms (p.abstraction-version.*), at both widths, are pixel-identical apart from data. So M4-4's button placement is unchanged.
- The 390 tables (M4-6) are unchanged.
- Each shot's last 58 to 1481 rows are pixel-identical to its merge3 copy (cmp-all.txt).

## Nothing newly clipped
- **At 1280:**
  - Every select's words sit well inside the select.
  - The 448 px selects stay inside the drop zone (x 313 to 1222 on Contracts, 288 to 1247 on Uploads).
  - The ring is drawn whole.
- **At 390:**
  - The chosen text is whole in all seven selects (above).
  - The rings end at x 318 (Contracts, Reconciliation) and x 343 (Uploads), inside the 16 px gutter.
- **Wrapping:** no error or help line runs past its box at either width.
- **The rest of each page:** the headers, the tag form, the version page and the tables cut nothing they did not cut in merge3. The only remaining cut is M4-6's table scroll at 390, which is unchanged.

## The dark tokens (the 1280 dark shots)
- **Unchanged from merge3, measured in both runs:**
  - surface (11,22,38);
  - select fill (11,22,38), the same as the surface, as in merge3 (light: white on white);
  - select border (90,110,142);
  - danger border and error words (232,132,107), 6.87:1;
  - help (167,177,194), 8.39:1;
  - ring (143,179,240).
- **Light, for the same elements:** error (181,69,46) 5.45:1, help (82,96,112) 6.43:1, ring (47,93,168).
- **The new select width uses the same tokens.** Pixels inside the new part of each select (x 711 to 793 at 1280) are the surface colour in dark and white in light. The border and ring there carry the colours above.
- **Nothing changed in dark only.** For each of the eight screens, the set of rows changed between the dark pair equals the set changed between the light pair (`darkonly.py`). The pixels that differ only in dark lie inside those shared text rows: each theme antialiases the changed words differently.

## Findings
1. **M4-1: resolved.** At 390 the kind select's placeholder "Choose a kind" shows whole: p.contracts.default.390, p.contracts.no-kind.390 (refused, 2 px border) and p.reconciliation.default.390. It shows whole at 1280 and in dark as well.
2. **M4-3: resolved.** At 1280 the kind select is 448 px in the default, refused and held-ready states of p.contracts.\*, on p.reconciliation.default and on p.uploads.\*. The ERA system select is 448 px too, so the two Uploads selects line up. Dark is the same. Nothing narrows or widens with the words under it.
3. **M4-2: resolved, as fix3.md judged it.** The kind's ERA option is "ERA export" and shows whole at 390 (p.uploads.error-era-system.390). The words "from a practice-management system" are still on screen, in the system select's help.
4. **The one other visible change is the one fix3.md names.** The ERA system's help rewraps inside 448 px, still on 2 lines: p.uploads.error-era-system.1280 and -1280-dark.
5. **M4-4, carried, unchanged.** It is #74's row-form button placement on the tag form and the version page. Shots: p.contracts.*.1280, p.abstraction-version.*.1280 and their dark shots.
6. **M4-5, still fixed.** The focus ring is drawn at 390 on p.contracts.no-kind.390 and p.contracts.held-ready.390. No VIEWPORT line was logged.
7. **M4-6, carried, unchanged.** These are the 390 tables behind a scroll: p.uploads.*.390, p.contracts.*.390 and p.reconciliation.default.390.
8. **M4-7 (not seen, by sample), carried with two notes.**
   - **A 390 dark shot cannot be taken by this tour.** `snap()` takes dark only at 1280 (tour.spec.ts:442). `p.contracts.no-kind.390-dark` is in `skipped` with the tour's own reason. Seeing the 16 px controls and the refused field's marks dark at phone width would need a change to the capture, which this brief leaves out.
   - **Fix 3 also dropped `max-w-prose` from the unconfirmed-format note** (uploader.tsx:708). That note shows only in p.uploads.era-format, which the sample does not take.
   - **The rest is as in shots4:** no shot focuses a table scroller; #79's file-name span needs Upload; #74's `showChosen` line is not drawn on this data; ReverseForm is inside a closed `<details>`; the keyed `role="alert"` cannot be seen in a still.

**I found no regression from fix 3.** Every difference from screens-merge3 is either fix 3's intended change (the placeholder, the 448 px fields, the "ERA export" label, the help's wrap at 448 px) or data.

## Files
- **Shots:** /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix3/shots.json (24 shots; 1 skip, the 390 dark). The PNGs are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix3/png/
- **Tiles:** /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix3/tiles/index.json (74 tiles)
- **Logs:** setup.log, lock.log, build.log, run.log, populate.log, capture.log and progress.log, all in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix3/
- **Comparison scripts:** /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix3-shots-scripts/
- **Crops, band sheets, cmp-all.txt and bands-all.txt:** /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix3-shots-crops/
- **Progress:** /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/shots5.md
