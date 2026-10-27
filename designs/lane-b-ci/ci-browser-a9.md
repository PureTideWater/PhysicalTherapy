# A9: the seven brand baselines under Chrome for Testing 156 (PR #77, `co-001/ci-browser` at 64843249)

Lane B, ci-browser (designs/lane-b-ci.md §3.3.1 "A9", §3.3.7 "A9 under the 2026-10-27 direction", §3.3.8 S7 and N2,
§3.3.9). Drafted 2026-10-27. Synthetic brand pictures only: the journey's synthetic practice and persona, and a fixed
synthetic ROI statement.

## 1. Purpose

A9 asks that the seven regenerated brand baselines be inspected against ADR 0058's brand points before PR #77 merges.
Under the co-founder's direction of 2026-10-27 the inspection is his, taken as recommended by the session and recorded
here with its evidence. The note does not block the merge. Its evidence is in `ci-browser-a9/`, beside this file, with
a `SHA256SUMS`.

- **Old:** `apps/web/e2e/brand.spec.ts-snapshots/<name>-chromium-linux.png` at e908c21. These files are unchanged since
  6ddd587 (`git diff --quiet 6ddd587 e908c21` on the directory). They were drawn by Chromium 141.0.7390.37 (revision
  1194) under Playwright 1.56.1.
- **New:** the same files at the branch head, 64843249, committed in 45b2a977. They were drawn by Chrome for Testing
  156.0.8078.4 (revision 1248) under Playwright 1.64.1.

## 2. Method

1. **The pictures.** `<name>.old.png` is `git -C /home/user/ci-browser show e908c21:<path>`. `<name>.new.png` is the
   worktree's file at 64843249 (the worktree is clean, so the file is the HEAD blob).
2. **Exact count.** A pixel counts as changed when any of its RGBA channels differs. The PNGs are decoded with the
   PNG decoder that playwright-core 1.64.1 bundles. The count is checked against ImageMagick's
   `compare -metric AE -fuzz 0`, and the two agree on all seven. The bounding box is the box of the changed pixels.
3. **Regions.** Changed pixels are grouped into 8-connected components. Components within 16 px of each other are
   merged into one region, and each region gets one crop.
4. **The journey's comparator.** The comparison runs through
   `require('…/playwright-core@1.64.1/…/lib/coreBundle.js').utils.getComparator('image/png')`. That is the export
   `./lib/coreBundle` (`package.json:26`; `getComparator` is at `coreBundle.js:8506`, exported at `:11494` and `:77995`).
   It is the same function that `toHaveScreenshot` calls (`:23972`). It loaded and ran.
   - The new picture is the actual and the old picture is the expected, as in the journey.
   - Each picture uses its own setting from `brand.spec.ts`. `VISUAL` (`:70`) uses pixelmatch at the default
     threshold of 0.2, with up to 1% of the pixels allowed to differ. `STRICT` (`:78`) uses a threshold of 0.05,
     with up to 6 pixels allowed to differ.
   - `playwright.config.ts` sets no `expect.toHaveScreenshot` defaults.
   - The verdict comes from that exact setting. The count comes from the same threshold with no allowance
     (`maxDiffPixels: 0`), so that the comparator states its count. pixelmatch skips pixels it takes for antialiasing
     (`includeAA: false`, `coreBundle.js:7628`).
5. **The pictures built for the note.**
   - `<name>.side.png`: the old and new pictures side by side, with a 4 px magenta (`#FF00FF`) separator, made with
     `convert old.png ( -size 4xH xc:#FF00FF ) new.png +append`.
   - `<name>.diff.png`: made only where pixels differ, with `compare -metric AE -fuzz 0 -highlight-color #FF0000
     -lowlight-color #FFFFFF`. Changed pixels are red on white, and the diff holds exactly 1,611 red pixels.
   - `<name>.crop-<k>.png`: the region's box cut from old, new and diff, each enlarged 4x nearest-neighbour
     (`-filter point -resize 400%`), stacked top to bottom (old, new, diff) with 4 px magenta separators.
   - All of these were made with ImageMagick 6.9.12-98 Q16. PIL is not installed in `/opt/py312-ci` or in the
     system Python.
   - Each panel was checked against its source: every side panel, and every crop panel sampled back to 1x, gives
     `compare -metric AE` 0.
6. **Shift test (without-seal cover).** The old picture's pixels inside the changed box are taken from one row above,
   and the result is compared exactly with the new picture over the whole picture.
7. **`SHA256SUMS`.** Made with `sha256sum *.png > SHA256SUMS` in `ci-browser-a9/`. Every `.old` line equals the SHA-256
   of `git show e908c21:<path>`. Every `.new` line equals the SHA-256 of `git show 64843249:<path>` and of the committed
   file. All seven pairs match, and `sha256sum -c` passes.

## 3. Results

Each picture's size is its width x height in px, and "allowed" is that setting's limit on changed pixels. All counts
are new against old.

| Picture | Size | Setting | Old SHA-256 | New SHA-256 | Bytes old → new | Exact changed px | Comparator: verdict, count (allowed) | Bounding box |
|---|---|---|---|---|---|---|---|---|
| header-1280 | 1280 x 56 | VISUAL | `7bb82df8…` | `7ddf673c…` | 9,995 → 9,996 | 0 | pass, 0 (716.8) | none |
| header-390 | 390 x 56 | VISUAL | `d400f359…` | `04be07d1…` | 5,418 → 5,418 | 0 | pass, 0 (218.4) | none |
| header-lockup-1280 | 152 x 56 | STRICT | `1ecda0ed…` | `4b3a7781…` | 2,797 → 2,797 | 0 | pass, 0 (6) | none |
| header-lockup-390 | 152 x 56 | STRICT | `df062e5f…` | `e5e0370e…` | 2,802 → 2,802 | 0 | pass, 0 (6) | none |
| report-cover-top | 816 x 200 | STRICT | `66c837fa…` | `0517b2a1…` | 4,638 → 4,638 | 0 | pass, 0 (6) | none |
| report-cover-with-seal | 816 x 1056 | VISUAL | `afcf215c…` | `3ece4f0b…` | 49,661 → 49,664 | 0 | pass, 0 (8,616.96) | none |
| report-cover-without-seal | 816 x 1056 | VISUAL | `a90a01eb…` | `e982852d…` | 35,355 → 35,360 | 1,611 (0.19%) | pass, 117 (8,616.96) | 234 x 27 at (83, 418) |

These are the same SHA-256 pairs as 45b2a977's commit message. Every comparator count is 0 except the without-seal
cover's 117, which is 0.014% of the picture and 1.4% of what VISUAL allows. That cover's largest change in one channel
is 233 of 255.

### Per picture

- **header-1280:** [side](ci-browser-a9/header-1280.side.png). Pixel-identical, no diff or crop.
- **header-390:** [side](ci-browser-a9/header-390.side.png). Pixel-identical, no diff or crop.
- **header-lockup-1280:** [side](ci-browser-a9/header-lockup-1280.side.png). Pixel-identical, no diff or crop.
- **header-lockup-390:** [side](ci-browser-a9/header-lockup-390.side.png). Pixel-identical, no diff or crop.
- **report-cover-top:** [side](ci-browser-a9/report-cover-top.side.png). Pixel-identical, no diff or crop.
- **report-cover-with-seal:** [side](ci-browser-a9/report-cover-with-seal.side.png). Pixel-identical, no diff or crop.
- **report-cover-without-seal:** [side](ci-browser-a9/report-cover-without-seal.side.png),
  [diff](ci-browser-a9/report-cover-without-seal.diff.png),
  [crop 1, the title "ROI statement"](ci-browser-a9/report-cover-without-seal.crop-1.png). The crop is
  234 x 27 at (83, 418), enlarged 4x, shown as old, new, diff.
  - The 1,611 pixels form 44 components. Within 8 px they group into two words, "ROI" (61 x 27 at (83, 418), 454 px)
    and "statement" (165 x 25 at (152, 420), 1,157 px). Within 16 px they are one region, the title.

## 4. The six byte-only changes

Six pictures are pixel-identical: their decoded RGBA buffers are equal byte for byte, and the exact count is 0. Their
files differ in two ways only:

- **Only the row filters differ.** Each file has the same IHDR (8-bit RGB, colour type 2, no interlace), the same chunk
  layout (IHDR, IDAT x n, IEND, no ancillary chunk) and the same zlib level flag (FLEVEL 2). Only the per-row filter
  bytes differ, and so the compressed stream.
- **Some rows that used Paeth now use Up.** In the six, every row whose filter changed went from Paeth to Up, and
  every Sub and Average row kept its filter. The without-seal cover, whose title rows also changed pixels, has 935
  Paeth → Up rows and 9 other filter changes, in rows 419-445. Eight of those rows are among the changed rows
  418-444, and row 445 lies just below them:

| Picture | Rows | Paeth old → new | Up old → new | Rows with another filter |
|---|---|---|---|---|
| header-1280 | 56 | 37 → 20 | 11 → 28 | 17 |
| header-390 | 56 | 36 → 19 | 14 → 31 | 17 |
| header-lockup-1280 | 56 | 47 → 11 | 6 → 42 | 36 |
| header-lockup-390 | 56 | 47 → 11 | 6 → 42 | 36 |
| report-cover-top | 200 | 193 → 14 | 6 → 185 | 179 |
| report-cover-with-seal | 1056 | 882 → 80 | 95 → 897 | 802 |
| report-cover-without-seal | 1056 | 992 → 60 | 34 → 966 | 944 |

The encoder that writes these bytes is the browser's, not Playwright's:

- **Chrome encodes the PNG.** playwright-core 1.64.1 takes a Chromium screenshot as the PNG that `Page.captureScreenshot`
  returns (`coreBundle.js:38820-38825`), and passes it through unchanged (`:22991`). Its only PNG write is the
  comparator's diff (`:8571`).
- **Re-encoding reproduces neither file.** Re-encoding the decoded pixels with playwright-core's bundled PNG encoder
  gives other bytes again, matching neither file.
- **So the scanline filters were picked by Chrome for Testing 156's encoder.** That is the browser build that 1.64.1
  pins. The cause is the upgrade, as ADR 0058's amendment says, but the encoder is the browser's. A later Playwright
  upgrade that moves the browser may rewrite every file in the same way without moving a pixel.

## 5. The without-seal cover: the title drawn 1 px lower

Chrome 156 draws the cover's title "ROI statement" 1 px lower, and nothing else on the cover moves.

**The title's rows.** The title's ink (non-Paper rows in its columns) spans rows 418-443 in the old picture and rows
419-444 in the new. The two hold the same number of non-Paper pixels, 3,253.

**The shift test** (exact, whole picture):

| Test | Changed px |
|---|---|
| Old with the changed box (234 x 27 at (83, 418)) taken from one row above, against new | **0** |
| The same with the box widened 4 px each side (242 x 35 at (79, 414)) | **0** |
| Control: the box taken from one row below (the wrong direction) | 2,247 |
| The whole old picture shifted down 1 px, against new | 10,268 (in 461 x 510 at (81, 90)) |

The last row shows that the rest of the cover's content did not move.

**The comparator.** Under the journey's VISUAL comparator the change counts 117 pixels, against 8,616.96 allowed. It
lies outside every STRICT band: the cover's top band is rows 0-199, and the title starts at row 418.

**What is not established.** This note does not establish why this cover's title moves and the with-seal cover's does
not. The with-seal cover's layout differs from this one's from row 361 down, and that cover has no changed pixel.

**Two corrections.** 45b2a977's message calls this change "Chrome 156's antialiasing". The shift test shows it is a
displacement, as ADR 0058's amendment already says. Section 4's encoder attribution corrects both texts: they say
"1.64.1's PNG encoder", and the encoder is the browser's.

## 6. The header's names: pixel-neutral

Between e908c21 and 64843249, `shell.tsx` changed the practice switcher's and the account's names (0c63d3c4,
9fbc958b; §3.3.9; ADR 0058's amendment, "The header is named by what it shows"):

- **No label attributes:** neither control has an `aria-label` or a `title` any more.
- **Visually hidden text:** ", switch practice" and ", account and sign out".
- **The address** is visually hidden below `md`.
- **The account's initial** is drawn as CSS generated content instead of a text node.

The header has two possible causes of change, these edits and the browser (§3.3.7). Both header pictures and both
lockup bands have 0 changed pixels. So every control box below has 0 changed pixels, the area outside them has 0, and
nothing needs to be attributed. The boxes are the controls' ink extents, measured from the new pictures:

| Picture | Practice switcher | Account |
|---|---|---|
| header-1280 | 264 x 36 at (724, 10): 0 px | 242 x 28 at (1004, 14): 0 px. Initial 28 x 28 at (1004, 14), address 186 x 14 at (1039, 22), chevron 8 x 5 at (1238, 26) |
| header-390 | 116 x 36 at (157, 10): 0 px | initial 28 x 28 at (283, 14): 0 px |

In these pictures, the generated-content initial under 156 draws the same pixels as the text node it replaced did
under 141.

## 7. ADR 0058's brand points

The verdict on each point belongs to the inspection (§8). The pixel facts below are read from the new pictures; each
is identical in the old pictures. "Brass-like" and "Ink-like" mean within 8 per channel of that colour, as
`pixelsUnlike` (`brand.spec.ts`) measures.

1. **Lockup and keystone, header (both widths).**
   - The lockup band equals the header's first 152 columns exactly, at 1280 and at 390 px.
   - Keystone: 9 Brass-like px (rgb 201, 154, 59) in 3 x 3 at (31, 18) at 1280 px, and at (23, 18) at 390 px.
   - Ring and wordmark: 501 Ink-like px (rgb 13, 30, 58) in 121 x 15 at (26, 17) and at (18, 17).
   - The two are 8 px apart, as the places 24 px and 16 px are.
   - The colours, the display face at 700 and the place are held by `expectLockupOnBrand` in the run, not by the
     picture.
2. **Lockup and keystone, cover top band.**
   - `report-cover-top` equals rows 0-199 of both covers exactly.
   - Keystone: 14 Brass-like px in 6 x 3 at (93, 91).
   - Outlined lockup: 763 Ink-like px in 143 x 18 at (88, 91).
3. **Brand colours.** Ink, Brass and Paper are present as above.
   - The cover's ground is Paper to the pixel above the lockup (816 x 60 at (0, 0)) and across the lower left
     (400 x 356 at (0, 700)), on both covers: 0 px unlike Paper.
4. **Faces.**
   - No pixel of any text changed except the without-seal title's 1 px displacement. So the faces are as they were
     under 141.
   - The faces themselves are held by computed checks (display face for the wordmark; Schibsted Grotesk 600 for the
     practice's name).
5. **The seal and its definition line (with-seal cover).**
   - Where the two covers differ below row 600, in 227 x 146 at (508, 822), the with-seal cover holds:
     - 4,709 non-Paper px (the journey requires over 2,000 in the DOM's foot box);
     - 116 Brass-like px;
     - 739 Ink-like px.
   - The box is derived from the pictures, as a stand-in for the journey's `.cover-foot` box.
6. **A blank Paper foot (without-seal cover).** The same box holds 0 px unlike Paper.
7. **The underline.** The brass underline is outside every picture. It is held by its computed colour in the run.

## 8. Visual inspection

**Overall verdict: pass, no finding. All seven meet ADR 0058's brand points, and the cover's 1 px lower title is acceptable.**

The 1 px move also puts the without-seal cover's title back in step with the with-seal cover's (§8.4). This is the
adversarial visual-inspection agent's verdict, given 2026-10-27. Under the 2026-10-27 direction the
co-founder takes it as recommended (§10). A finding would have named the picture, the region, the fault and the
evidence, to be fixed in the PR before the merge. There is none.

### 8.1 What was looked at

- **Every picture.** Every old and new picture at full resolution, every side-by-side, the diff and the crop.
- **Enlargements.** Nearest-neighbour enlargements, 2x to 6x, of:
  - both lockups;
  - the header's controls at both widths;
  - the cover's top band;
  - the seal and its definition line;
  - the title with the kicker and the subheading around it.

### 8.2 What was re-checked without relying on §3

- **The files.**
  - Each `.old.png` has the SHA-256 of `git show e908c21:<path>` and of `git show 6ddd587:<path>`.
  - Each `.new.png` has the SHA-256 of `git show 64843249:<path>` and of the worktree file.
  - This holds for all seven, and `sha256sum -c SHA256SUMS` passes.
- **Exact counts, two ways.**
  - ImageMagick's `compare -metric AE -fuzz 0`.
  - A second PNG decoder, written for this check from the PNG specification: zlib and the five row filters in
    Python's standard library, with no ImageMagick, PIL or Playwright.
  - Both give 0 on six pictures, and 1,611 on the without-seal cover, in 234 x 27 at (83, 418), with a largest
    change of 233 in one channel.
- **The comparator, re-run.** playwright-core 1.64.1's `getComparator('image/png')` from `./lib/coreBundle`, with the
  new picture as actual and each picture's own setting. Six pass at 0. The without-seal cover passes with 117 counted.
- **The shift test, re-run with the second decoder.**
  - With the box taken from one row above: 0 px.
  - With the box widened 4 px each side: 0 px.
  - The control, with the box taken from one row below: 2,247 px.
- **The evidence pictures.**
  - Each side panel equals its source (AE 0), and each separator is `#FF00FF`.
  - The diff has two colours and 1,611 red pixels.
  - The crop's old and new panels, sampled back to 1x, equal their sources.

**The brand colours** are those of `packages/brand/src/tokens.css`:

- Ink `#0D1E3A`, Brass `#C99A3B`, Paper `#F6F4EE`, White `#FFFFFF`, Slate `#526070` and Line `#DAD7CF`;
- bg-inset `#EFF1F4`, the initial's circle.

Every colour named below is an exact pixel value, not a near match, unless it says "-like" (within 8 per channel, as
`pixelsUnlike` measures).

**The faces.**

- **How they were checked.** Each text was drawn again in its self-hosted face, from the woff2 files in
  `packages/brand/assets/fonts`. It was also drawn in the fallbacks this host has, Inter and DejaVu Sans. The two were
  compared with the picture by ink width and by eye.
- **The drawing tool.** ImageMagick's FreeType read the woff2 files. It warns when it cannot read a font file, and it
  gave no warning here.

| Text (picture) | Ink width in the picture | Brand face | Fallbacks |
|---|---|---|---|
| "ROI statement" (cover title) | 234 px | Schibsted Grotesk 700: 236 | Inter 700: 231; DejaVu Sans Bold: 273 |
| "SYNTHETIC OTHER PRACTICE BRAND" (cover) | 320 px | Schibsted Grotesk 600: 324 | Inter 600: 316; DejaVu Sans Bold: 357 |
| "SYNTHETIC OTHER PRACTICE B" (header-1280 switcher, before the ellipsis) | 206 px | IBM Plex Sans 500: 206 | Inter 500: 217 |
| "brand-manager@synthetic.t" (header-1280, before the ellipsis) | 175 px | IBM Plex Sans 400: 175 | Inter 400: 185; DejaVu Sans: 199 |
| Definition line 1 (with-seal cover) | 227 px | IBM Plex Sans 400: 230 | Inter 400: 244 |
| "Menu" (header-390) | 34 px | IBM Plex Sans 500: 34 | Inter 500: 36 |

- **The title is decisive by its shape.** Its "I" carries a bar at the top and the foot, as Schibsted Grotesk draws
  it. Inter's "I" has none.
- **The switcher, the address and the definition line are decisive by width.** They match IBM Plex Sans and not
  Inter, the sans-serif this host prefers.
- **The mono lines are not decided by the pictures.** These are the kicker and the cover's meta lines. Plex Mono and
  DejaVu Sans Mono both advance 0.6 em, and at 10.7 to 11.3 px their shapes do not tell them apart.
  - What holds them is that they are pixel-identical to the 141 baselines. ADR 0058 records every text in those
    baselines as drawn in the brand's faces, by Chromium's own record of the fonts each text node used and by a glyph
    check.
  - The journey's computed checks cover the wordmark and the practice's name, not these lines.
- **The seal's words are outlined art, not text.** "VERIFIED BY PAIDWHOLE" and "RECONCILED TO CASH" are paths, so no
  font face draws them.

### 8.3 Per picture

| Picture | Verdict | Evidence |
|---|---|---|
| header-1280 | **pass** | **No change:** 0 px changed exactly, and 0 under the comparator. **Lockup:** ring and wordmark Ink, with the darkest pixel exactly Ink. Keystone: 9 Brass px in 3 x 3 at (31, 18). The mark's ink starts at x 25, at its place of 24. The wordmark is 100 px wide, as Schibsted Grotesk 700 draws it; Inter 700 gives 99, so the width does not decide it, and the journey's computed check holds its face. **Ground:** White, and row 55 is Line across all 1,280 columns. **Switcher:** 264 x 36 at (724, 10), with a Line border and Ink text in IBM Plex Sans 500. Its 14rem cap truncates it, and the ellipsis is drawn. The chevron is muted. **Account:** the initial "B" in a bg-inset circle, 28 x 28 at (1004, 14). The address is IBM Plex Sans 400, truncated with an ellipsis at 12rem. The chevron is 8 x 5 at (1238, 26). **Spacing:** the controls have 10 px above them and 9 px to the rule, and the initial has 14 px and 13 px. The right edge is 34 px: the header's 24 px, the summary's 8 px and the icon's 2 px. Nothing is clipped. Neither ", switch practice" nor ", account and sign out" shows anywhere. |
| header-390 | **pass** | **No change:** 0 px exactly, and 0 under the comparator. **Lockup:** the same as at 1280, 8 px further left. Columns 8-151 of the 1280 lockup band equal columns 0-143 of the 390 band exactly. Keystone: 9 Brass px in 3 x 3 at (23, 18). **Switcher:** 116 x 36 at (157, 10). It shows "SYNTHETI…", at its 5rem cap. **Account:** the initial 28 x 28 at (283, 14), and no address; below md the address is visually hidden (§6). **Menu:** 53 x 36 at (321, 10), in IBM Plex Sans 500. **Spacing:** 10 px between switcher and initial and 10 px between initial and Menu. The right margin is 16 px, equal to the lockup's left margin. Nothing is clipped, and the controls end at x 373 of 390. |
| header-lockup-1280 | **pass** | **No change:** 0 px under STRICT and exactly. **Same as the header:** it equals header-1280's columns 0-151 exactly. **Colours:** 455 Ink px and 9 Brass px on White, with the Line rule (152 px). **Not clipped:** the wordmark ends at x 147, 4 px inside the band. |
| header-lockup-390 | **pass** | **No change:** 0 px under STRICT and exactly. **Same as the header:** it equals header-390's columns 0-151 exactly. **Colours:** 455 Ink px and 9 Brass px, as at 1280. **Not clipped:** the wordmark ends at x 139. |
| report-cover-top | **pass** | **No change:** 0 px under STRICT and exactly. **Same as both covers:** it equals rows 0-199 of both new covers exactly. **Ground:** Paper, 161,686 of 163,200 px. 816 x 60 at (0, 0) has 0 px unlike Paper. **Lockup:** the outlined lockup, 725 Ink px. Keystone: 12 Brass px in 4 x 3 at (94, 91), 14 Brass-like. No other hue: all but 6 single pixels lie within 3 per channel of a blend of two of Ink, Brass and Paper. |
| report-cover-with-seal | **pass** | **No change:** 0 px exactly, and 0 under the comparator. **The seal, read at 6x:** "VERIFIED BY PAIDWHOLE" over the ring and "RECONCILED TO CASH" under it. The mark is an Ink ring with its keystone: 114 Brass px in 14 x 10 at (679, 846). **The definition line:** three right-aligned Slate lines in IBM Plex Sans 400: "Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace to signed-off contract versions." **The foot:** as `brand.css` lays it out, the foot is 654 x 148 at (81, 822). That is 0.85 in from the sides and 0.9 in from the foot, holding the 96 px seal, the 6 pt gap and three 14.5 px lines. All 4,709 non-Paper px below row 600 lie inside it: 116 Brass-like and 739 Ink-like. **Not clipped:** the seal ends at x 732 and the definition at x 734, on the content edge at 734.4. **Ground and margins:** 0 px unlike Paper outside the content box, and 0 in the two ground boxes (816 x 60 at (0, 0); 400 x 356 at (0, 700)). |
| report-cover-without-seal | **pass** | **The change:** 1,611 px exactly, all inside the title. The comparator counts 117, against 8,616.96 allowed, and no STRICT band reaches the title. **The foot:** blank Paper. The foot box from `brand.css` (654 x 96 at (81, 874)) and the seal's box from the other cover (654 x 148 at (81, 822)) each hold 0 px unlike Paper. So does everything below row 600 (816 x 456). **Ground and margins:** 0 px unlike Paper. **The title:** acceptable; see §8.4. |

### 8.4 The without-seal cover's title, 1 px lower: acceptable

- **Same face and colour.**
  - The new title's 3,253 non-Paper px are the old ones moved down one row, and nothing else changed (the shift test,
    0 px).
  - The title's box holds the same colours before and after: 2,037 Ink px and 2,831 Paper px, plus their blends.
  - The face is Schibsted Grotesk 700 (§8.2).
- **Aligned.**
  - The move is purely vertical, so the title's left edge stays at x 83, on the same left as the kicker, subheading,
    practice and meta lines (x 81-83, by side bearing).
  - Those lines do not move.
- **Inside its box.**
  - By `brand.css` the h1 is 26 pt (34.67 px) with a line height of 1.1, so its line box is 38.13 px tall. Its top
    is at 412.48 px: 86.4 px of padding, the 28 px lockup, half the free space, the kicker's 16.43 px line and the
    10 pt margin.
  - The new ink, rows 419-444, sits 6.5 px below the line box's top and 5.6 px above its foot.
  - This is computed from the stylesheet, not read from the DOM. As a cross-check, the same arithmetic, with IBM Plex
    Mono's ascent of 1.025 em, puts the kicker's baseline at 395.18 px and the first meta line's at 554.62 px. Their
    ink ends on rows 395 and 554, as unhinted glyphs ending there would.
- **In step with the other cover.** This is what the 1 px move does:
  - Under 156, the without-seal cover's whole text block, rows 366-625, equals the with-seal cover's rows 340-599
    pixel for pixel (0 of 212,160 px), the title included.
  - Under 141, the same comparison gave 0 everywhere except the title, which matched only one row higher: 1,611 px
    at 26 rows, 0 at 25.
  - So the clear rows from kicker to title and from title to subheading are now 23 and 21 on both covers. The 141
    without-seal baseline alone had 22 and 22.
- **Why, in part.** By `brand.css` the two covers' text blocks are 25.75 px apart:
  - The seal's foot is 147.5 px tall (96 + 8 + 3 x 14.5), against the empty foot's minimum of 96 px.
  - `justify-content: space-between` puts half of the 51.5 px difference above the block.
  - So each line of the without-seal cover lands on a pixel row from a position 0.75 px further on. It rounds to 26
    rows lower unless its sub-pixel position falls in the one quarter-pixel window that rounds to 25.
  - Under 141 the title alone fell in that window. Under 156 no line does.
  - Which change in Chrome moved the title's sub-pixel position is not established (§5).
- **Verdict: pass.** No regeneration and no CSS change, as §10 recommends. Moving the title back would recreate the
  141 picture's inconsistency.

### 8.5 Notes beside the verdict (not findings)

- **§6 leaves out the Menu control.** Its table for header-390 omits the "Menu" control, 53 x 36 at (321, 10). It has
  0 changed px like the rest. `shell.tsx`'s diff from e908c21 to 64843249 touches only the switcher and the account.
- **The truncation is by design.** "SYNTHETIC OTHER PRACTICE B…", "SYNTHETI…" and "brand-manager@synthetic.t…" are
  cut by the controls' maximum widths (14rem, 5rem, 12rem in `shell.tsx`). They are unchanged from 141, and each
  ellipsis is drawn in the brand face. This is not clipping.
- **Some brand points are not in these pictures.** The lockup's exact place, the wordmark's face and tracking, and the
  brass underline are held by the journey's computed checks, not by these pictures. The underline lies outside every
  picture.

## 9. CI's proof

**Proved.** CI's baseline step on 64843249 (ci.yml run 40581096032, e2e (1/2) job 122461666053, ubuntu-26.04 image
20261012.163.1, 2026-10-27 20:57-20:58 UTC): the brand journey regenerated all seven from nothing into an empty directory
outside the repository (4 passed), and the seven SHA-256s it printed equal the `.new` lines of
`ci-browser-a9/SHA256SUMS` and the committed files:

| Picture | SHA-256 printed by CI (shortened) |
| --- | --- |
| header-1280 | `7ddf673c…` |
| header-390 | `04be07d1…` |
| header-lockup-1280 | `4b3a7781…` |
| header-lockup-390 | `e5e0370e…` |
| report-cover-top | `0517b2a1…` |
| report-cover-with-seal | `3ece4f0b…` |
| report-cover-without-seal | `e982852d…` |

These are the bytes the local run made on Ubuntu 24.04 with the 1248 layout from Google's zips, so ADR 0058's
host-independence claim holds for 1248: the local host and CI's ubuntu-26.04 render the same bytes. The browser check
in the same job found CI's own download from Playwright's mirror equal to `browser.json` in every file.

## 10. The recommended option, taken

**Accept the seven baselines as committed at 64843249, with no regeneration and no change to application code.** This
is the co-founder's inspection, taken as recommended under the 2026-10-27 direction. The reasons:

- Six of the pictures are pixel-identical to the 141 baselines. Their bytes differ only in the browser encoder's choice
  of row filters.
- The seventh differs only by its title drawn 1 px lower. The shift test makes that exact (0 px after the shift). The
  change passes the journey's VISUAL comparison at 117 of 8,616.96 pixels and lies in no STRICT band.
- No brand point moves (§7). The header's new names move no pixel (§6).
- CI's baseline step proves the bytes on ubuntu-26.04 (§9).
- A finding in §8 would be fixed in the PR (regenerated, or the cause fixed) before the merge.

Not taken:

- **Holding the merge for a person's look.** The direction makes the inspection the co-founder's, taken as
  recommended, and A9 does not block the merge.
- **Moving the title back by a CSS change.** That would chase a browser's placement with application code when no brand
  point is wrong, and it would change a picture CI has not proved.

## 11. Files

`ci-browser-a9/` holds 23 PNGs and `SHA256SUMS`:

- `<name>.old.png`, `<name>.new.png` and `<name>.side.png` for each of the seven pictures;
- `report-cover-without-seal.diff.png`;
- `report-cover-without-seal.crop-1.png`.
