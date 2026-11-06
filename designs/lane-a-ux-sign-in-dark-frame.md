# Design: the dark sign-in frame (UXD-N1), `co-001/ux-sign-in-dark-frame`

Session S4 (Lane A's account), 2026-11-04. Base 9b237a93. Worktree /home/user/ux-dark-frame. Not committed.
Finding: UXD-N1 (approval-summaries/lane-b-ux-sign-in-recovery-review-ux-brand.md). With `data-theme="dark"` the
sign-in frame keeps the Paper ground while the text, link and focus tokens turn dark-mode light, so whatever sits on
the bare ground fades out. It was already like this before #108.

## 1. Where the Paper ground comes from

- `apps/web/src/app/sign-in/layout.tsx:11`: `<div className="flex min-h-screen flex-col items-stretch bg-paper"
  data-slot="sign-in-ground">`. This element wraps every step: /sign-in, /forgot-password (both phases), /mfa,
  /hardware-key, /new-password, /enroll and /register-key.
- `bg-paper` resolves to `--color-paper` (packages/brand/src/tailwind-theme.css), which resolves to `--pw-paper`
  (#F6F4EE, packages/brand/src/tokens.css `:root`). `--pw-paper` is a palette constant, and the dark block
  (`:root[data-theme="dark"], .dark`) never redefines it. Everything else does change: `--pw-fg` becomes #F4F6FA,
  `--pw-fg-muted` #A7B1C2, `--pw-link` and `--pw-focus` #8FB3F0, and `--pw-mark-ring` White.
- Cards and notices bring their own ground. Their surface is `bg-card` (`--card` = `--pw-bg`, packages/ui
  styles.css), which is #0B1626 in dark. That is why the card interiors read correctly in the dark shots. Only what
  sits on the bare frame fails.
- No other element uses `bg-paper` or `sign-in-ground` (grep of apps/web/src and packages/ui).

## 2. Elements in the frame, by ground

On the bare frame ground (affected):
- the stacked lockup: the wordmark is `text-mark-ring`, the ring fills with `--pw-mark-ring`, and the keystone is Brass
- each step's h1 (`text-[2rem] font-bold`, large text) and the StepHeading's "Step n of m" marker (`text-sm
  text-muted-foreground`)
- the links, all `a.underline` with colour from brand.css `a { color: var(--pw-link) }` and hover `--pw-fg`: Forgot
  your password?, Sign in with a hardware key, the Help list's links (Reset it by email, the support mailto, Request an
  audit, Service status), phase 1's Back to sign in, the hardware-key page's back link, and the support mailto on /mfa
  and /hardware-key
- the link button `.pw-link-button` (phase 2's Back to sign in, a POST), with colour `--pw-link` and hover `--pw-fg`
- the Help heading h2 (`text-foreground`, 14 px semibold, which counts as normal text), the Help list's body
  (`text-muted-foreground`), and the paragraphs on /mfa and /hardware-key (`text-sm text-muted-foreground`)
- the focus ring: `:focus-visible { outline: 2px solid var(--pw-focus); outline-offset: 2px }` on links and the link
  button, drawn on the frame ground. ArrivalNotice and RefusalTakeover draw `ring-2 ring-ring` at their edge.

On their own ground (`--pw-bg`, the same in every option, unchanged here):
- the notices: SignInNotice's status Alert (including the locked notice), ArrivalNotice and HardwareKeyRequirement,
  each `bg-card` with title `--pw-fg` and description `--pw-fg-muted`
- the cards: titles, descriptions, labels, the field borders (`--pw-input-border`), the field hints, the refusal and
  error lines (`--pw-danger`), the primary button (`--pw-primary` with `--pw-primary-fg`), the outline buttons, the
  NoEmailList, and the focus ring of controls inside a card

## 3. WCAG relative luminance (sRGB, WCAG 2.x)

For each channel, s = C/255. If s <= 0.04045 the linear value is s/12.92; otherwise it is ((s+0.055)/1.055)^2.4.
Then L = 0.2126 R + 0.7152 G + 0.0722 B, and the ratio is (L_light + 0.05) / (L_dark + 0.05).

| Colour | R, G, B linear | L |
| --- | --- | --- |
| Paper #F6F4EE | 0.9216, 0.9047, 0.8550 | 0.2126(0.9216) + 0.7152(0.9047) + 0.0722(0.8550) = 0.9047 |
| dark --pw-bg #0B1626 | 0.0033, 0.0080, 0.0194 | 0.0078 |
| dark --pw-bg-raised = Ink #0D1E3A | 0.0040, 0.0130, 0.0423 | 0.0132 |
| dark --pw-fg #F4F6FA | 0.9047, 0.9216, 0.9560 | 0.9205 |
| dark --pw-fg-muted #A7B1C2 | 0.3864, 0.4397, 0.5395 | 0.4355 |
| dark --pw-link and --pw-focus #8FB3F0 | 0.2747, 0.4508, 0.8714 | 0.2126(0.2747) + 0.7152(0.4508) + 0.0722(0.8714) = 0.4437 |
| White (dark ring and wordmark) | 1, 1, 1 | 1.0000 |
| Brass #C99A3B | 0.5841, 0.3231, 0.0437 | 0.3584 |
| Slate #526070 | 0.0844, 0.1170, 0.1620 | 0.1133 |
| light --pw-link #1F4E9A | 0.0137, 0.0762, 0.3231 | 0.0807 |
| light --pw-focus #2F5DA8 | 0.0284, 0.1095, 0.3916 | 0.1126 |

Worked examples:
- dark link on Paper: (0.9047 + 0.05) / (0.4437 + 0.05) = 0.9547 / 0.4937 = 1.93
- dark link on --pw-bg: (0.4437 + 0.05) / (0.0078 + 0.05) = 0.4937 / 0.0578 = 8.53
- dark h1 on Paper: (0.9205 + 0.05) / (0.9047 + 0.05) = 0.9705 / 0.9547 = 1.02
- dark h1 on --pw-bg: 0.9705 / 0.0578 = 16.78
- dark muted on Paper: 0.9547 / 0.4855 = 1.97. On --pw-bg: 0.4855 / 0.0578 = 8.39

The script is tools/ratios.py in the scratch folder dark/, run with `/usr/bin/python3 -I`.

## 4. Ratio table (thresholds: text 4.5, large text 3.0, focus 3.0)

| Element (token) | Need | Light today (Paper) | Dark before (Paper) | (a) dark on --pw-bg | (a') dark on --pw-bg-raised | (b) Paper with light tokens in dark |
| --- | --- | --- | --- | --- | --- | --- |
| Links and link button (`--pw-link`) | 4.5 | 7.30 | **1.93** | 8.53 | 7.81 | 7.30 |
| Link hover (`--pw-fg`) | 4.5 | 15.11 | **1.02** | 16.78 | 15.36 | 15.11 |
| h1, 32 px 700 (`--pw-fg`) | 3.0 | 15.11 | **1.02** | 16.78 | 15.36 | 15.11 |
| Help h2, 14 px 600 (`--pw-fg`) | 4.5 | 15.11 | **1.02** | 16.78 | 15.36 | 15.11 |
| Help list, /mfa and /hardware-key lines, step marker (`--pw-fg-muted`) | 4.5 | 5.85 | **1.97** | 8.39 | 7.68 | 5.85 |
| Wordmark (`--pw-mark-ring`; a logotype, exempt, held to 3.0 here) | 3.0 | 15.11 | **1.10** | 18.15 | 16.61 | 15.11 only if `--pw-mark-ring` is re-scoped to Ink |
| Mark ring (graphic) | 3.0 | 15.11 | **1.10** | 18.15 | 16.61 | as above |
| Keystone (Brass, graphic) | (decorative) | 2.34 | 2.34 | 7.06 | 6.46 | 2.34 |
| Focus outline on the ground (`--pw-focus`) | 3.0 | 5.87 | **1.93** | 8.53 | 7.81 | 5.87 |
| Notice and card text on `--pw-bg` (fg, muted) | 4.5 | 16.61 / 6.43 on White | 16.78 / 8.39 | unchanged | unchanged | **1.09 / 1.97** if fg alone is re-scoped and the cards stay dark |
| Field border in card (`--pw-input-border`) | 3.0 | 3.54 on White | 3.51 | unchanged | unchanged | depends on re-scope |
| Card edge on ground (`--pw-border`, decorative) | (none) | 1.31 (Line on Paper) | 1.50 | 1.50 | 1.37 | 1.31 |

Light stays as it is under (a) and (a'), because the `dark:` utility matches only under `[data-theme="dark"]` or
`.dark`. Today's light values: Ink on Paper 15.11, Slate 5.85, link 7.30, focus 5.87, and on the White cards 16.61,
6.43, 8.03, 6.46, with the field border at 3.54.

## 5. Options

(a) Give the frame the dark ground in dark. Ground `--pw-bg`: every element on the bare frame clears its threshold.
The lowest is muted text at 8.39 and the focus outline at 8.53. Everything reads as it does on every other dark screen.
(a') The same on `--pw-bg-raised` (Ink) also passes every threshold (lowest 7.68). But the cards and notices (`--pw-bg`)
would then be darker than their ground (1.09:1). Light shows a White card raised on Paper, so this would turn the
elevation upside down. It would also leave a seam against the `html` ground (`--pw-bg`) whenever overscroll shows
past the frame.
(b) Keep Paper and use light tokens inside the frame. The light link and focus values (#1F4E9A, #2F5DA8) exist only
as `:root`'s values of semantic tokens that dark overrides. They have no palette name. To get them back, either (b1)
state their hex again in a scoped block of tokens.css and tokens.ts (a second copy of the palette, the brand owner's
files), or (b2) add a `[data-theme="light"]` re-scope to the `:root` block and put it on the frame. With (b2) the
frame is simply never dark. Re-scoping only text and link (b0) is worse: the card titles would be Ink on the dark card,
1.09:1. Either way it contradicts BRAND.md section 4, which says in dark mode the ground becomes a deeper ink and text
becomes near-white.

## 6. Decision: (a), the frame's ground is `--pw-bg` in dark

- It is the only option that meets every threshold with existing tokens, adds no token, restates no hex and leaves
  tokens.css alone.
- It matches BRAND.md: section 4's dark-mode rule ("the ground becomes a deeper ink, text becomes near-white, the ring
  turns white and the keystone stays brass") applied to section 7's "Sign-in: stacked lockup, Paper ground". Paper is
  the light ground, and `--pw-bg` is the deeper ink that tokens.css names as dark's ground.
- It matches the tokens.css comment ("Ink becomes the ground"), the `html` ground and the cards' own surface, so the
  frame, the cards and the page edge are one ground, as they are on the dashboard in dark.
- It respects ADR 0056's dark notes: dark mode is tokens only (no toggle, advisory), and no hex is inverted in a
  component. The component chooses a token for each theme, as `Verified.tsx`'s `dark:hidden` and `dark:block` already
  do.
- Light does not change: the class `bg-paper` stays, and brand.spec's light assertion (rgb(246, 244, 238)) still holds.
- (a') is second best, and only on elevation. (b) fails BRAND.md's dark rule or needs the brand owner's files.

## 7. Exact change

- `apps/web/src/app/sign-in/layout.tsx:11`: `bg-paper` becomes `bg-paper dark:bg-bg`. The `dark` custom variant in
  tailwind-theme.css (`&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *)`) and `--color-bg` produce
  `.dark\:bg-bg:where(...)`. It has the same specificity as `.bg-paper`, and Tailwind emits variants after the base
  utilities, so it wins in dark. This is the same mechanism as Verified.tsx's `hidden dark:block`.
- The doc comment above it becomes: "on the Paper ground (dark: the deeper ink ground, `--pw-bg`; BRAND.md sections 4
  and 7)".
- No edit to tokens.css, tokens.ts, brand.css, packages/ui, BRAND.md or ADR 0056. In the PR, ask the brand owner
  whether section 7 should say "Paper ground (the dark ground in dark mode)". Do not edit it ourselves.

## 8. Failing-first tests (commit before the fix, seen red on the base)

1. `apps/web/e2e/a11y.ts`: add `expectAccessibleInDark(page, what)`. It sets `data-theme="dark"` on
   `document.documentElement` (as brand.spec's dashboard step and the tour do), runs `expectAccessible`, which uses
   axe's color-contrast rule, as `${what}, dark`, and removes the attribute in a `finally`. Add `focusContrast(page)`
   too: it returns `{ outline, ground, ratio }` for `document.activeElement`. It computes outline-color against the
   nearest ancestor with a non-transparent background-color, using the WCAG formula above, run in the page.
2. `apps/web/e2e/brand.spec.ts`: a new test, "the sign-in frame reads in dark: the deeper-ink ground, every text and
   link at 4.5:1 and its focus at 3:1; light stays on Paper". It runs at 1280, then 390 for /sign-in:
   - /sign-in, /sign-in?reason=locked, /sign-in/forgot-password (phase 1) and /sign-in/hardware-key: in dark, the
     ground `toHaveCSS('background-color', 'rgb(11, 22, 38)')`, then `expectAccessibleInDark`; then `tabTo` Forgot
     your password? (and Back to sign in on phase 1) and `focusContrast(...).ratio >= 3`. Remove the attribute and
     check the light control: the ground is `rgb(246, 244, 238)`.
   - On the base this is red. axe color-contrast reports the links (1.93), the h1 (1.02), the Help h2 (1.02) and the
     muted lines (1.97), the ground assertion fails, and the focus ratio is 1.93.
3. `apps/web/e2e/sign-in-time.spec.ts`, in the existing steps that already reach the live states: after 'Code step,
   open, lost-authenticator line' (/sign-in/mfa) and after 'Forgot password, code step' (phase 2 with the
   `.pw-link-button`), call `expectAccessibleInDark(page, ...)`. Red on the base for the same reasons: the support link
   and muted line on /mfa, and Back to sign in on phase 2.
- There is no committed sign-in baseline. brand.spec's `toHaveScreenshot` baselines cover only the header and the
  report cover, so no baseline needs updating. If any changes, update it only with the repo's own command
  (`--update-snapshots` through its pnpm script), never by hand.
- Run the tests under `flock /tmp/laneb-heavy.lock`: `pnpm test:e2e -- brand.spec.ts sign-in-time.spec.ts`, then the
  unit suite, lint and typecheck (the `tools/brand-colors` hex check stays green, because no hex is added).

## 9. Shots (the tour, "From another lane"; reuse sgn7e/tour-delta, copied to dark/tour; before = 9b237a93, after = head)

Dark at 1280 and 390, with light at 1280 as controls:
- /sign-in: default, error-wrong-password, error-locked, reason-locked, reason-idle, reason-step-expired,
  reason-restarted, password-reset, password-reset-kept, password-reset-locked
- /sign-in/forgot-password: default (phase 1), reason-step-expired, error-malformed, code-sent (phase 2),
  error-wrong-code, warning, closed
- /sign-in/mfa: default, error
- /sign-in/hardware-key: default, error-locked, reason-hardware-key-required, reason-key-registered
- The layout is shared, so take one each of /sign-in/enroll, /sign-in/new-password and /sign-in/register-key (default,
  with the step marker) in dark at 1280 and 390.

The tour takes dark at 1280 only (`snap`: `width === 1280`). For 390 dark, patch only the scratch copy (dark/tour) so it
also takes `.390-dark` for ids TOUR_ONLY names in full. Do not push to claude/build-ops. Tile with
`/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py`. The PNGs stay off the branch (the repository is public) and are
shared as a private gallery.

## 10. Risks

- Brand intent: section 7 says "Paper ground" without qualification. The brand owner may want a light sign-in in dark,
  which is (b2). That is the brand owner's call (ADR 0056 and 0058). Flag it in the PR and offer (b2) as the
  alternative. Do not build it.
- Cards and notices merge with the ground. They are separated only by `--pw-border` (1.50:1, decorative) and
  `shadow-sm`, as on every dark app screen. Light has the same weak edge (Line on Paper, 1.31). Not a WCAG 1.4.11
  requirement, because a card is not a control.
- The axe dark run may surface other dark issues inside the cards (pre-existing, outside this item). Triage them: fix
  within scope only if they are on the frame; record the rest as follow-ups and do not weaken the check.
- The focus check covers outline rings. The ArrivalNotice and RefusalTakeover box-shadow rings (`ring-ring`, 8.53 on
  `--pw-bg`) are not covered by `focusContrast` unless it also reads the box-shadow. Extend it if cheap, otherwise
  verify them in the shots.
- Setting `data-theme` after hydration (as the dashboard step does) is what the tour does too. If React reconciles
  `<html>` attributes on a later navigation, set the attribute again after each `goto`.
- Tailwind must generate `dark:bg-bg`. Check that the class is in the built CSS (the e2e ground assertion proves it).
- Dark mode has no toggle (ADR 0056), so no user sees the change today. It is low risk, but it is still the right fix:
  the frame is the one place the dark tokens produced unreadable text.
