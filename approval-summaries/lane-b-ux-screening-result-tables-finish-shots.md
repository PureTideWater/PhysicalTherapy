# PR #83 fix round: after-only shots and one targeted UX verdict (2026-11-01)

PR #83 (co-001/ux-screening-result-tables) at a4efd583af1464da390cfcb3a21cf1468981a421 (the fix round f5e0ceba merged
with claude/build-platform bce57f16). Shots are after only. Per the person's ruling of 2026-11-01 there is no before
run, no full tour and no second review of the rest of the PR. The before state is in findings.json
(.ux_and_brand.findings, .shots). Synthetic data only.

## How the shots were taken
- Tour worktree `/home/user/screens` at a4efd583. It was added through `/home/user/ux-screening-result-tables`, which
  shares the object store, so no fetch was needed (`capture/setup-local.sh`: setup.sh without the fetch).
  - The install took 2.5 s under the lock.
  - Build: `build-only.sh` under the lock, 18:13 to 18:14:46, exit 0.
- One server session from a fresh prepare: `reserve.sh` held the lock from 18:15:00 to 18:16:10.
  - The tour's run took 18:15:33 to 18:15:48 (`TOUR_SKIP_POPULATE=1`, `TOUR_ONLY='screening-result.default.*'`). It made
    one real synthetic send and took 3 shots, with 0 skipped.
  - The harness was then built, and PR #83's capture spec ran from 18:15:50 to 18:16:09 (2 tests passed, 6 shots).
- Shutdown and clean-up:
  - `serve.log` says "server stopped at 18:16:10", and the lock was released with it. `fuser 3297/tcp` printed nothing.
  - `tp_e2e_screens` was dropped (count 0), and `/tmp/tp-e2e-tp_e2e_screens-*` was removed.
- `tile.py`: 9 shots, 114 tiles, in `p4-shots-after/tiles/`.
- Capture spec: `capture/lane-b-ux-screening-result-tables-capture.spec.ts`. Its measurements are in
  `p4-shots-after/capture-measures.json`.
- Harness: `capture/screening-result-harness.mts`, run with `tsx --tsconfig capture/tsconfig.harness.json`.
  - It renders the head's own `ScreeningResultView` with the SYNTHETIC fixtures of the head unit test
    `result-tables.test.tsx`, sliced from the test's text at run time.
  - The spec swaps that render into a script-free copy of the live result's document, served on the server's origin, so
    the app's stylesheets and fonts apply.
  - Its `ScrollTable` shows only its server render.
- Gallery (private, not published): `p4-gallery/gallery/pub1280/index.html`, `pub390/index.html` and
  `pub820/index.html`. The gallery copy of `screening-result-harness.one-other.390` (40,496 px) is scaled to the WebP
  limit; its PNG and tiles are full size.

## Shots
| Shot id | Tiles | What it shows |
|---|---|---|
| `screening-result.default.1280` | 6 | The live one-anomaly result (tour). The top link "Ask for a PaidWhole audit" sits at y 367 to 403 in the 800 px window, under the heading block and the kept paragraph, which is unchanged (t01). |
| `screening-result.default.1280-dark` | 6 | The same in dark tokens. The link uses the primary button's dark tokens: a light fill with dark text (t01). |
| `screening-result.default.390` | 17 | The live result at 390 px. The link is at y 707 to 743 in the 844 px window, so it is in view on load (t01). Coverage items: five rows with no reason have no Reason field (Rows, Claim lines, Allowed in your file); "Original Medicare: Could not be priced" keeps "Reason: The place of service is not in the approved place-of-service split" (t09 to t11). |
| `screening-result.top-audit-link-focus.1280` | 1 | Viewport after Tab press 2 (logo, then the link) and Enter. Focus is on `h2#screening-convert`, `:focus-visible`, drawn as a 2 px `--pw-focus` outline (rgb 47,93,168) with a 2 px offset. The title is at y 88 and the whole form, through "Request an audit", is in view. |
| `screening-result.top-audit-link-focus.390` | 1 | Viewport after the link is tapped in the touch viewport. Focus is on `h2#screening-convert`, with no ring because a tap is not `:focus-visible`. The title is at y 72, and the description and the first three fields are in view. |
| `screening-result.band.820` | 10 | 820x1180 with no mobile emulation. 8 stacked lists show: 4 anomaly groups and 4 top rows; coverage keeps its table. Each list is `262px 378px` with a row gap of 8 px and a column gap of 16 px. Wrapped two-line terms stand 8 px apart (t05, t08). |
| `screening-result-harness.one-other.390` | 48 | The database's one-other shape: FIRST_PAGE with `oneOther(1)`, 51 groups, page 1 of 2. The description reads "…This page lists groups 1 to 50; the table’s last row is the one other group, its rows summed, and the next page lists it." (t05). The list's last item is headed "The one other group, its rows summed" (t40), and its status reads "It is an anomaly" (t41). |
| `screening-result-harness.one-other.1280` | 9 | The same shape at 1280. The same sentence is above the table (t03), and the tfoot row reads "The one other group, its rows summed" (t06). |
| `screening-result-harness.several.390` | 16 | SUMMARY, `onePage(GROUPS)`, COVERAGE and ROWS. The could-not-price card reads "Medicare rows PaidWhole could not price, or whose rates change within the quarter. Coverage, below, gives each outcome, and the reason for a row PaidWhole could not price." (t04). In coverage, the two "Could not be priced" items each give a Reason (place of service; no relative value). "Original Medicare: Rates change within the quarter" and the other rows with no reason have no Reason field (t09, t10). |

## Verdicts (UX and brand reviewer, these shots only)
- **UXR-01: fixed.**
  - The prospect's one action is at the top at both widths: `screening-result.default.390` t01 (in view on load,
    707 to 743 of 844) and `screening-result.default.1280` t01. The same holds on the harness pages, where the link sits
    above 51 stacked groups.
  - Followed by keyboard, the link moves focus to the form's title with a visible `--pw-focus` ring and the form in view
    (`screening-result.top-audit-link-focus.1280`). Tapped, it does the same without a ring
    (`screening-result.top-audit-link-focus.390`).
  - In dark tokens the link reads as the primary button (`screening-result.default.1280-dark` t01).
  - The link's words are the form title's, "Ask for a PaidWhole audit". This follows the fix round's one-name-for-one-
    thing rule, in place of the review's suggested "Ask for an audit of the rows a contract prices".
- **UXR-02: fixed.** With one other group, the page sentence and the summed row or item name it as one, and they agree:
  `screening-result-harness.one-other.390` t05 and t40, `screening-result-harness.one-other.1280` t03 and t06. The words
  "the table’s last row" remain in that sentence on a phone. They were there before the fix, and they are UXR-08's,
  handed to UX PR 4b ("the last entry"). This is not new.
- **P4-RC-01: fixed** on screen, by the same shots as UXR-02. The sentence's count now takes its noun ("the one other
  group, its rows summed"), as TBL-08 says. The matrix and synth wording are code only.
- **UXR-03: fixed.**
  - In `screening-result.default.390` (t09 to t11), the five coverage items with no reason have no "Reason —" pair, and
    the could-not-price item keeps its reason in words.
  - In `screening-result-harness.several.390` (t09, t10), the rates-change item has no Reason field and both
    could-not-price items have theirs.
- **P4-RC-04: fixed.** The could-not-price card now promises "each outcome, and the reason for a row PaidWhole could not
  price" (`screening-result-harness.several.390` t04). Coverage matches it: the rates-change item shows its outcome chip
  and no empty Reason, and the could-not-price items give reasons (t09, t10). The live result's card has the same
  sentence (capture-measures `couldNotPriceSentence`).
- **UXR-04: fixed.** At 820 px every shown stacked list has an 8 px row gap beside the terms (8 of 8 lists measured), so
  a wrapped two-line term (20 px pitch) stands 8 px apart from the next one (`screening-result.band.820` t05, t08). This
  matches the phone's pair spacing.
- **UXR-05:** not visual; code only.
- **UXR-06:** not visual; code only.
- **P4-RC-03:** not visual; code only.

## New defects the fixes introduced (in what these shots show)
None.

## Not seen or not checked
- `screening-result.converted.*` was not seen. The link's absence once an audit is requested is in code and the unit
  case only.
- A screen reader's reading of the link and the focused heading was not checked.
- Zoom and print were not checked.
- The harness pages run no script.
