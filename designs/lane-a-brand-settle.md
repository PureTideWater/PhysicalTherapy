# Design: brand-settle (`co-001/brand-settle`)

Session S4 (Lane A's account), 2026-11-05. Base 370b8973. Worktree /home/user/brand-settle. Not committed.
Source: the co-founder's brand rulings of 2026-11-04 (about 22:50 UTC), adopted as recommended ("let's go with these
recommendations"), in `approval-summaries/founder-asks-2026-10-27.md`, "Brand rulings, 2026-11-04". Display only: no
number, stage, PHI or schema changes.

**Decision.** `--pw-unpriced` (light) goes from #7A8594 to **#646E7C**. That keeps the hue and saturation in HSL
(214.6 to 215.0 degrees, 10.8% to 10.7%) and lowers lightness from 52.9% to 43.9%. It is the lightest HSL step at
4.6:1 or more on `--pw-unpriced-bg`, and gives **4.61:1** on its tint, 5.17:1 on White and 4.70:1 on Paper. The
dark pair (#9AA5B5 on #1A2537, 6.18:1) passes and does not change. The unpriced chip's text, and the report's
`.unpriced`, switch from Slate to `--pw-unpriced`. The fail-first test goes in `packages/brand/src/tokens.test.ts`,
using a WCAG formula moved out of `apps/web/e2e/a11y.ts` into `packages/brand/src/contrast.ts` so the repository has
one copy of it.

## 1. Candidate values

WCAG 2.x relative luminance: for each channel, s = C/255. If s <= 0.04045 the linear value is s/12.92, otherwise
((s + 0.055)/1.055)^2.4. Then L = 0.2126 R + 0.7152 G + 0.0722 B, and the ratio is (L_lighter + 0.05) / (L_darker + 0.05).

Grounds:

| Ground | Hex | Linear R, G, B | L |
| --- | --- | --- | --- |
| `--pw-unpriced-bg` | #F0F2F5 | 0.8714, 0.8879, 0.9131 | 0.2126(0.8714) + 0.7152(0.8879) + 0.0722(0.9131) = 0.8862 |
| White (`--pw-bg`, report inside pages) | #FFFFFF | 1, 1, 1 | 1.0000 |
| Paper (report cover, light sign-in) | #F6F4EE | 0.9216, 0.9047, 0.8550 | 0.9047 |
| `--pw-bg-raised` | #F7F8FA | 0.9301, 0.9387, 0.9560 | 0.9381 |
| `--pw-bg-inset` (neutral chip's tint) | #EFF1F4 | 0.8632, 0.8796, 0.9047 | 0.8779 |

The old value: #7A8594 has linear (0.1946, 0.2346, 0.2961), so L = 0.2126(0.1946) + 0.7152(0.2346) + 0.0722(0.2961) = 0.2305.
On the tint: (0.8862 + 0.05) / (0.2305 + 0.05) = 0.9362 / 0.2805 = **3.34:1**. On White: 1.05 / 0.2805 = 3.74:1.
These match ADR 0056's 3.3 and 3.7.

The steps below hold HSL(214.6 degrees, 10.83%) and lower L by 0.5 points each, rounding to hex. OKLCH is shown to
confirm the hue stays put (h 254 to 259, C 0.024 to 0.028 throughout).

| HSL L | Hex | L (WCAG) | on tint | on White | on Paper | on raised | on inset | OKLCH L, C, h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 52.9% | #7A8594 (now) | 0.2305 | 3.34 | 3.74 | 3.40 | 3.52 | 3.31 | 0.613, 0.0262, 256.2 |
| 49.9% | #727D8D | 0.2017 | 3.72 | 4.17 | 3.79 | 3.93 | 3.69 | 0.586, 0.0278, 257.7 |
| 47.4% | #6C7786 | 0.1810 | 4.05 | 4.54 | 4.13 | 4.28 | 4.02 | 0.565, 0.0267, 256.2 |
| 45.9% | #687382 | 0.1682 | 4.29 | 4.81 | 4.38 | 4.53 | 4.25 | 0.552, 0.0269, 256.2 |
| 44.9% | #66717F | 0.1617 | 4.42 | 4.96 | 4.51 | 4.67 | 4.38 | 0.544, 0.0256, 254.5 |
| 44.4% | #656F7E | 0.1564 | 4.54 | 5.09 | 4.62 | 4.79 | 4.50 | 0.539, 0.0265, 258.4 |
| **43.9%** | **#646E7C** | **0.1532** | **4.61** | **5.17** | **4.70** | **4.86** | 4.57 | 0.535, 0.0251, 256.8 |
| 43.4% | #636D7B | 0.1502 | 4.68 | 5.24 | 4.77 | 4.94 | 4.64 | 0.531, 0.0252, 256.8 |
| 42.9% | #626C79 | 0.1470 | 4.75 | 5.33 | 4.85 | 5.02 | 4.71 | 0.527, 0.0238, 255.0 |
| 42.4% | #616A78 | 0.1421 | 4.87 | 5.47 | 4.97 | 5.14 | 4.83 | 0.522, 0.0247, 259.2 |
| 41.9% | #5F6977 | 0.1387 | 4.96 | 5.56 | 5.06 | 5.24 | 4.92 | 0.517, 0.0253, 256.8 |
| 41.4% | #5E6875 | 0.1356 | 5.04 | 5.66 | 5.14 | 5.32 | 5.00 | 0.513, 0.0240, 255.0 |

The whole table, every 0.5-point step, is in the scratch calc (`scratchpad/brand/calc/steps.py`).

Arithmetic for the chosen value: #646E7C = (100, 110, 124), so s = (0.3922, 0.4314, 0.4863). Linear values:
((0.3922 + 0.055)/1.055)^2.4 = 0.1274, ((0.4314 + 0.055)/1.055)^2.4 = 0.1559 and ((0.4863 + 0.055)/1.055)^2.4 = 0.2016.
L = 0.2126(0.1274) + 0.7152(0.1559) + 0.0722(0.2016) = 0.0271 + 0.1115 + 0.0146 = 0.1532.
- On the tint: (0.8862 + 0.05) / (0.1532 + 0.05) = 0.9362 / 0.2032 = 4.61:1.
- On White: 1.05 / 0.2032 = 5.17:1.
- On Paper: 0.9547 / 0.2032 = 4.70:1.

The pick is #646E7C. It is the lightest step in the 4.6 to 5.0 band on its tint, and it is above 4.5 on every
ground the text can sit on: its tint, White and Paper (the report's `.unpriced`), and raised. The one ground below 4.6
is the inset, at 4.57. The chip never sits on the inset, because it carries its own tint; even there it passes 4.5.
Its distance from today's chip text, Slate #526070, is 1.24:1, so the chip reads lighter than Slate but is not Slate.

## 2. The chip's border

**What it is made of.** In `apps/web/src/components/status.tsx:18` the unpriced tone is
`border-status-unpriced bg-status-unpriced-bg text-fg-muted`. The 1 px border is `--color-status-unpriced`, which is
`var(--pw-unpriced)` (`packages/brand/src/tailwind-theme.css:45`). So the border is the token itself, not a mix and
not a separate border token. After the change the border and the text are the same color. The Alerts in
`apps/web/src/components/mapping/months.tsx:62` (`UNPRICED_TINT`) use the same border class, so their outline darkens
too. Their text does not change.

**Every chip tone, light:**

| Tone (statuses) | Text | Tint | Border | Text on tint | Border on tint | Border on White / raised |
| --- | --- | --- | --- | --- | --- | --- |
| whole (Recovered, Priced no shortfall) | #1F7A4D | #EAF4EE | transparent | 4.73 | none | none |
| short (Validated, Actionable, Priced not triaged, Deadline within 14 days) | #B5452E | #F8ECE8 | transparent | 4.71 | none | none |
| danger (failures) | #B5452E | #F8ECE8 | transparent | 4.71 | none | none |
| neutral (Payer approved, Not priced yet, Deadline later or none, system states) | Ink #0D1E3A | #EFF1F4 | Line #DAD7CF | 14.68 | 1.27 | 1.44 / 1.35 |
| unpriced **before** (Unpriced, Flagged, Deadline passed) | Slate #526070 | #F0F2F5 | #7A8594 | 5.73 | 3.34 | 3.74 / 3.52 |
| unpriced **after** | #646E7C | #F0F2F5 | #646E7C | **4.61** | **4.61** | **5.17 / 4.86** |

**Is it distinct?** The label is always present, so the border is never the only cue. It still clears 3:1 (WCAG 1.4.11)
against its tint and the page ground, before and after.

- **Against whole, short and danger:** those chips have no border and a hued tint. Unpriced is the only gray-tinted
  chip with a dark outline.
- **Against neutral:** this is the pair that needs care. Their tints are nearly the same: #F0F2F5 against #EFF1F4,
  1.01:1. What tells them apart is the border and the text:
  - Border: unpriced's border against neutral's Line is 3.59:1 after the change (2.60:1 before). Neutral's Line is
    barely visible (1.27:1 on its tint), while unpriced's border stands at 4.61:1 on its tint.
  - Text: the unpriced text (#646E7C) against neutral's Ink is 3.21:1, so a mid-gray reads clearly apart from near-black.
- **Against its own tint:** 4.61:1, up from 3.34:1.

Darkening the border makes it more distinct than before. No other tone changes.

## 3. The dark pair

| Pair (dark tokens) | Ratio |
| --- | --- |
| `--pw-unpriced` #9AA5B5 on `--pw-unpriced-bg` #1A2537 (text after the change) | **6.18:1**: passes, **unchanged** |
| `--pw-fg-muted` #A7B1C2 on #1A2537 (text today) | 7.12:1 |
| border #9AA5B5 on its tint / `--pw-bg` #0B1626 / raised #0D1E3A | 6.18 / 7.28 / 6.66 |
| border against neutral's dark border #243654 | 4.87 |
| whole #4CBF84 on #12301F; short #E8846B on #3A1C14 | 6.19; 5.86 |

Arithmetic: #9AA5B5 has linear (0.3231, 0.3763, 0.4621), so L = 0.3712. #1A2537 has linear (0.0103, 0.0185, 0.0382),
so L = 0.0182. The ratio is 0.4212 / 0.0682 = 6.18.

## 4. Where unpriced text uses Slate (or a stand-in) because of the low contrast

| File:line | Today | What chose it | Change |
| --- | --- | --- | --- |
| `apps/web/src/components/status.tsx:18` | `unpriced: 'border-status-unpriced bg-status-unpriced-bg text-fg-muted'` (`--pw-fg-muted` = Slate in light, #A7B1C2 in dark) | the doc comment at `status.tsx:5-9` ("unpriced's own gray is 3.7:1 on white ... so its text is Slate and its hue the chip's border"); ADR 0056:97-99 and 0056:131-135 | `text-status-unpriced`; rewrite the comment |
| `apps/worker/src/report/brand.css:73-74` | `.unpriced { color: var(--pw-slate); }` | its comment at :73 ("3.7:1 on white ... its text is Slate, as the web chip's is"); ADR 0056:98-99 | `color: var(--pw-unpriced)`; rewrite the comment |

Checked and left alone:
- `apps/web/src/app/brand.css:46` `.pw-status-unpriced` already reads `color: var(--pw-unpriced)`. It is the drop-in's
  class, and no component uses it (`git grep pw-status-` finds only brand.css). It passes after the change.
- `months.tsx:62` `UNPRICED_TINT` sets only the border and tint. The Alert's own text was not chosen for contrast.
- `packages/ui/src` has no unpriced styling.
- No report template writes `class="unpriced"` today (a grep of `apps/worker/src/report`,
  `reconcile/statement-html.ts` and `packets/html.ts` finds none), so the report change is a dormant rule kept true.
  No PDF page shows the unpriced status.
- `packages/brand/src/tokens.ts:16` is the hand-kept mirror ("keep the two in step"), not generated. Change it to
  #646E7C by hand and add `unpriced: 5.1` to `contrastOnWhite` (the file truncates: short is 5.45 and reads 5.4). No generator or build copy of the tokens exists:
  `brand.css` and `tailwind-theme.css` read the variables.
- Scope note: the unpriced tone also colors **Flagged** (`remittances/display.tsx:55`), **Deadline passed**
  (`triage/display.tsx:37`), screening **anomaly** standings (`screening/anomalies.tsx:165, 356`) and the screening
  dispositions `rates_change_in_band`, `unpriced` and `contract_required` (`screening/coverage.tsx:35-37`). ADR 0056's
  table makes them one tone, so they all take the new text color. No other tone changes.
- `docs/brand/BRAND.md` section 4 lists `--pw-unpriced` with its hex. It is updated with the ratio (section 6 below).

## 5. Contrast tooling and the fail-first test

What exists:
- `apps/web/e2e/a11y.ts:88-133` `focusContrast`: the repository's only WCAG ratio implementation (sRGB
  linearisation, 0.2126/0.7152/0.0722, (L1 + 0.05)/(L2 + 0.05)). It runs inside `page.evaluate`, and
  `brand.spec.ts:415` uses it.
- axe-core's color-contrast rule through `expectAccessible` and `expectAccessibleInDark` (a11y.ts) on the e2e journeys.
- `apps/web/e2e/brand.spec.ts:528-531` checks the short chip's text and tint colors on Claims. Nothing checks an
  unpriced chip.
- `tools/brand-colors` (hex placement only). `packages/brand/src/tokens.test.ts` (words and art only). No unit-level
  token-pair test exists.

**The test to extend: `packages/brand/src/tokens.test.ts`**, which `pnpm test` runs (unit project). It is fast and
deterministic, and it fails on #7A8594 whatever data a journey happens to seed. Add a describe block, "status text on
its tint (WCAG 1.4.3, 1.4.11)":
1. Read `tokens.css` and parse the `--pw-*: #hex` and `var(--pw-*)` declarations of the `:root` block and of the
   `:root[data-theme="dark"], .dark` block. Dark overlays light, and var() references resolve within the merged block.
2. In each theme, for whole, short and unpriced: `contrastRatio(--pw-<tone>, --pw-<tone>-bg) >= 4.5`. On the old
   value this fails with **3.34 < 4.5** in light.
3. For unpriced, in each theme: its color is at least 4.5:1 on `--pw-bg` and `--pw-bg-raised` (the report's text on
   White). Its border (the same token) is at least 3:1 on its tint and on `--pw-bg`, and at least 3:1 against
   `--pw-border`, the neutral chip's border. In light the old value gives 2.60 here and fails a second way.
4. `tokens.ts` `status` and `statusDark` equal the CSS values, and `contrastOnWhite` equals the computed ratio to one
   place, truncated and never overstated (whole 5.32 reads 5.3, short 5.45 reads 5.4, unpriced 5.17 reads 5.1, added).

The test holds **no hex literal**: `tools/brand-colors` allows hex only in four exact files, and this test file is not
one of them. Every value is read from `tokens.css` and `tokens.ts`.

**One formula, not two:** move the WCAG arithmetic into `packages/brand/src/contrast.ts`
(`relativeLuminance(rgb)`, `contrastRatio(a, b)` and `parseColour` for `#rrggbb` and `rgb()/rgba()`), exported from
`@paidwhole/brand`. `focusContrast` then returns `{ outline, ground }` from the page and computes the ratio in Node
with `contrastRatio`. Its result shape stays `{ outline, ground, ratio }`, so `brand.spec.ts:415` is untouched.
`contrast.ts` holds no hex.

**Fail first:** commit 1 (below) adds the tests with the token still #7A8594. Run `pnpm vitest run --project unit
packages/brand` under the lock and save the failing output to `scratchpad/brand/logs/fail-first.log` for the pull
request. The token change comes in the next commit, and the same run is then green.

**Optional e2e check:** at `brand.spec.ts:531`, add a light check that an unpriced-tone chip on Claims has
`color` equal to its `border-top-color`, and a `contrastRatio` against its background of at least 4.5. Add it only if
the journey's claims table shows an unpriced-tone chip (Flagged or Unpriced). The first local e2e run confirms that.
If none renders, do not add a conditional check. The unit test is the gate, and axe on every journey catches a
regression wherever the chip appears.

## 6. Drafted text

### 6.1 ADR 0056

**Status line**, appended after the 0078 link:
`; amended 2026-11-04 by the co-founder's brand rulings (`co-001/brand-settle`; "The brand owner's rulings" below)`

**Replace the whole "Readings of the specification." paragraph (0056:131-135) with:**

> **The brand owner's rulings.** *Amended 2026-11-04 (`co-001/brand-settle`; the co-founder's brand rulings of
> 2026-11-04, about 22:50 UTC, adopted as recommended, recorded in the founder's asks of 2026-10-27, "Brand rulings,
> 2026-11-04"):* this paragraph recorded how the repository read BRAND.md where it disagreed with itself (sign-in's
> lockup and ground) and where one rule could not be met (the unpriced status's text), until the brand owner settled
> them. It answers ADR 0058's D9 question (2). The co-founder, as brand owner, settled them:
>
> 1. **Sign-in's ground.** Every sign-in step sits on Paper in light mode and on the dark ground (`--pw-bg`) in dark
>    mode, as #116 built (`apps/web/src/app/sign-in/layout.tsx`). On dark it shows the reversed stacked lockup (White
>    ring and wordmark, the Brass keystone) and, wherever the seal appears, the reversed seal.
> 2. **BRAND.md section 4** reads "Paper: report covers, print, and the light-theme sign-in". This settles the
>    disagreement among sections 3, 4 and 7, which now say the same: the stacked lockup on Paper in the light theme.
> 3. **`--pw-unpriced` is darkened to at least 4.5:1 on `--pw-unpriced-bg`**, so the unpriced status uses its own
>    color for text. The value moves from #7A8594 (3.3:1 on its tint, 3.7:1 on White) to #646E7C: the same hue and
>    saturation (HSL 215 degrees, 11%) at 43.9% lightness, 4.6:1 on its tint, 5.1:1 on White and 4.7:1 on Paper.
>    The unpriced tone's chip (Unpriced, Flagged, Deadline passed) and the report stylesheet's `.unpriced` take
>    `--pw-unpriced` in place of Slate. The chip's border, the same token, is 4.6:1 on its tint and 3.5:1 against
>    the neutral chip's Line border. The dark pair (#9AA5B5 on #1A2537, 6.1:1) already met the minimum and is
>    unchanged. `packages/brand/src/tokens.test.ts` holds every status color at 4.5:1 or more on its tint, in both
>    themes.
> 4. **Dark mode's ship rule.** Dark mode stays off until a dark-mode pass has checked every screen, PHI screens
>    first. After that it follows `prefers-color-scheme`, with an override in settings. That pass is separate work,
>    queued for Lane B. This amendment records the rule only, and nothing here switches dark mode on.

**In "Status as text on tint" (0056:97-99), replace** "Whole and short are their colors on their tints (4.7:1 and
better). Unpriced's own gray is 3.7:1 on white, below the 4.5:1 text minimum, so an unpriced chip's text is Slate and
its hue is the chip's border; the report stylesheet's `.unpriced` is Slate text likewise." **with:**

> Whole, short and unpriced are their colors on their tints (4.6:1 and better); an unpriced chip's border is its
> color too, which sets it apart from the neutral chip on a near-identical tint. *(Amended 2026-11-04: until the
> brand owner's ruling 3 below, unpriced's gray was 3.7:1 on White, so its chip's text was Slate.)*

**Dark mode paragraph (0056:137-140), last sentence**: replace "Revisit with a setting." with
"Revisit with a setting: the ship rule is the brand owner's ruling 4 above (amended 2026-11-04)."

**Alternatives table row (0056:155):** keep the row and change its right-hand cell to:
"3.7:1 failed the brand's own 4.5:1 text minimum and axe's contrast check; adopted on 2026-11-04 once the brand owner
darkened the token (ruling 3)".

**Consequences (0056:162):** "Dark mode is wired through the tokens but nothing switches it on yet (no `data-theme`
toggle)." gains: "; it ships only under ruling 4's rule."

### 6.2 docs/brand/BRAND.md

- **Section 3**, the Stacked row's Use cell: "Sign-in, on Paper (section 7); square placements (avatars with name,
  tiles)" becomes "Sign-in, on Paper in the light theme and reversed on the dark ground in dark mode (section 7);
  square placements (avatars with name, tiles)".
- **Section 4**, the Paper row's Role cell: "Report covers, print, and the sign-in ground (section 7)" becomes
  "Report covers, print, and the light-theme sign-in". These are the ruling's words. The token column already
  reads "Paper".
- **Section 4**, the Unpriced row: `| Unpriced `--pw-unpriced` | #646E7C | Could not be priced; the reason is always
  shown (4.6:1 on its tint, 5.1:1 on white) |`.
- **Section 7**, the Sign-in bullet: "Sign-in: stacked lockup, Paper ground, nothing else decorative." becomes
  "Sign-in: stacked lockup on the Paper ground in the light theme; in dark mode the dark ground (`--pw-bg`) with the
  reversed stacked lockup; nothing else decorative."
- Sections 1, 2, 5, 6 and 8 to 10 contradict nothing. Section 9 ("Ink and Slate pass on white") stays true. The
  intro's "The readings this file leaves open are recorded in docs/adr/0056" stays accurate, since the ADR now
  records how they were settled. Leave it.

### 6.3 Code comments

- `status.tsx:5-9`: "... Whole, short and unpriced are colored text on their tints (4.6:1 and better; the unpriced
  gray was darkened to meet it, docs/adr/0056, the brand owner's rulings), and unpriced's color is also the chip's
  border, which sets it apart from neutral's near-identical tint. ..."
- `report/brand.css:73`: "/* Unpriced is its own color, 5.1:1 on white (docs/adr/0056, the brand owner's ruling 3) */"

## 7. Commits, shots and risks

**Commits** (one concern each, in /home/user/brand-settle):
1. `brand: the contrast formula in @paidwhole/brand, and a token test that holds each status color to 4.5:1 on its
   tint`. Adds `contrast.ts`, the `tokens.test.ts` block and the `a11y.ts` refactor. Red on #7A8594; the failure is
   logged.
2. `brand: --pw-unpriced darkened to #646E7C (4.6:1 on its tint), its mirror in tokens.ts, and BRAND.md section 4`.
   Green.
3. `web, report: the unpriced status's text takes --pw-unpriced instead of Slate`. Changes `status.tsx` and
   `report/brand.css`, with their comments.
4. `docs: ADR 0056 records the brand owner's rulings of 2026-11-04 in place of its readings; BRAND.md sections 3
   and 7 say the same`.

If a unit test asserts the chip's classes, it fails on commit 3 and is updated in the same commit.
`result-tables.test.tsx:577` matches `class="[^"]*"`, so it is unaffected.

**Shots** (tour: `/home/user/ops/tools/lane-b-screen-tour`, "From another lane"; reuse
`scratchpad/sgn7e/tour-delta`'s env and auth). There are two runs: `TOUR_REF=370b8973` (before) and the branch's
head (after). Each takes 1280 and 390 light, plus 1280-dark named in full. `TOUR_ONLY`:
- `sign-in.default.{1280,390,1280-dark}`
- `p.pricing-run.april.*`: April's run, with NO_AGREEMENT lines and their Unpriced chips in Run lines.
- `p.pricing-run.default.*`: March's run.
- `p.claims.default.*`: the line chips. Flagged and Unpriced appear if present, Recovered and Short for comparison.
- `p.remittance.default.*`: CAS-08's lines and their chips.
- `p.anomalies.cohort.*`: Flagged lines, in the unpriced tone.
- `screening-result.default.*`: anomaly and disposition chips in the unpriced tone.
- `p.coverage.default.*`: the `UNPRICED_TINT` Alert's border.
- `p.pricing-runs.unmapped-plan.*`: the `UNPRICED_TINT` Alert, already shot dark by its step.
- A case or deadline screen with "window passed", if the tour reaches one. Search `DEADLINE_TONE` users and pick the
  id from `shots.json`. Otherwise it is reported "not seen".

There is no chip legend component (a grep of apps/web/src finds none), and no report page shows the unpriced status
(section 4), so neither is shot. Cut tiles with `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR>
<ids>`. Every heavy step runs under `flock /tmp/laneb-heavy.lock`.

**Risks:**
- **Brand baselines:** the committed baselines (`apps/web/e2e/brand.spec.ts-snapshots/`) are header-1280, header-390,
  the two header-lockup images, report-cover-top and report-cover-with-seal/without-seal. None shows an unpriced chip
  or the token, so **none should change**. If CI's baseline step disagrees, regenerate only by
  `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all`, run the way
  `docs/runbooks/ci.md:380-389` describes (CI's runner, `--retries=0`, `E2E_BASELINES_DIR`). Never edit them by hand.
- **The neutral and unpriced pair** keeps a near-identical tint. Distinctness rests on the border (3.59:1 against
  Line) and the text (3.21:1 against Ink), and the label is always present. The reviewer should look at both chips
  side by side in the claims shot.
- **Shared tone:** Flagged, Deadline passed and the screening anomaly and disposition chips change with Unpriced, by
  ADR 0056's mapping. Say so in the PR, so it is not read as touching other statuses.
- **Moved formula:** the `focusContrast` refactor touches the dark sign-in test. Run `brand.spec.ts` once locally
  (under the lock) before pushing.
- **Moved cites:** the reviewer brief cites ADR 0056 by line ("as of 7ef421b; find a moved rule by its words"). The
  amendment shifts lines after :131, and the brief's rule covers that.
- **ADR 0058 D9 (2)** still reads "Until then unpriced text stays Slate". That is a dated question, and the 0056
  amendment cites and answers it. Editing 0058 is outside this item's scope.
- **Gitleaks:** no secrets in scope. If it refuses a push, rewrite the flagged text in a new commit and never touch
  `.gitleaksignore`.
