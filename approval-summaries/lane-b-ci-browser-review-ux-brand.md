# PR #77 (ci-browser), UX and brand review, on 367a659f

Workflow wf_7b903031-7ca (resumed once: the first attempt, as the `ux-brand-reviewer` agent type with its 30-turn cap, returned nothing; the resumed one ran the same checklist as a default agent and continued from its progress file). Before and after shots: the screen tour at e908c21 and 367a659f (48 pairs, tiled), plus the brand journey's own. Dispositions are in the fix round's summary.

## Summary

UX and brand review of PR #77 at 367a659 against base e908c21. I worked in a fresh clone at /tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/reviews/ux/clone and resumed from ux.progress.md. The standard was the head's .claude/agents/ux-brand-reviewer.md, together with the baseline designs/lane-b-ux-review.md (build-ops b20bffa4), LANES.md and design §3.3.

**What I did**
- Read the PR body, the shell.tsx and brand.spec.ts diffs, and design lane-b-ci.md:1773-1797.
- Used the capture agent's 48 before/after pairs. compare.json shows 0 changed pixels in the header band of every pair (re-counted). I viewed the head tiles of the open switcher and account menu at 1280, 390 and 1280-dark.
- Built static probes from the compiled CSS and read Chromium 1248's accessibility tree through CDP. In the same pages I ran axe-core 4.14.0 (rule label-content-name-mismatch) and a transcription of the PR's computed check, over five variants: base, head, no current practice, long names, the baseline's ruled markup, and a deliberate regression.
- Re-counted the seven baselines with PIL against the 1194 set. Six are 0 px. The seventh, report-cover-without-seal, differs by 1,611 px, all in the title box. Its foot is plain Paper in both.

**What is right**
- The header does not move by a pixel at either width or in dark.
- Both names now contain the visible text, so WCAG 2.5.3 holds and axe passes, including the "Choose a practice" and long-name cases.
- The generated-content initial is aria-hidden, is not announced, shows in forced colours and survives 200% text zoom. It drops out of a copied selection, which does no harm.
- getByLabel still matches.

**What is wrong**
1. Blocking: the new words are not the ones the co-founder's ruling took for this exact defect (UX-094; baseline 6.1 :1369).
2. Should-fix, reproduced in the accessibility tree: because the names come from aria-label, Chrome also puts the visible text in each control's description, so the practice name and the email are each read twice.
3. Smaller items:
   - The new computed check is close to vacuous at 390 px (nit).
   - The PR body calls the cover change antialiasing; it is actually a 1 px downward shift of the title (nit).
   - The screen tour's account-menu selector breaks once this merges (should-fix, in ops tooling).
   - The switcher's open panel runs off the left edge on phones. It is identical at base, so it predates this PR and is listed apart.

**Open baseline findings on these screens** (none worsened, none touched at its cause):
- UX-094: partly fixed here. The names now contain the visible text; the words, the summary's title and the 'Current' mark remain (findings 1 and 2).
- UX-021: still open. At 390 the switcher reads 'SYNTHETI…' (`p.settings.default.390`, `p.settings.practice-switcher.390`).
- UX-093: still open. The panels are native details that do not close on Escape or on a tap outside.
- UX-080, UX-147 and UX-006 (no 'Sign-in and security' link in the account menu): all still open, unchanged.

**Already reported by the capture agent, not repeated here:** run.sh's 5 s pid-file check, and the hard-coded /home/user/screens paths.

## Findings

### UX-1 (blocking; verified-by-reading): The header controls' new names are not the words the co-founder's ruling took for this same finding (UX-094)

- **Where:** apps/web/src/components/shell.tsx:57 and :87 (also apps/web/e2e/brand.spec.ts:363-364, apps/web/e2e/sign-in.spec.ts:18)
- **Evidence:** - The head sets ``aria-label={`${current?.name ?? 'Choose a practice'}, practice switcher`}`` (:57) and ``aria-label={`${shell.email}, account menu`}`` while keeping `title={shell.email}` (:87).
- The baseline (/home/user/ops/designs/lane-b-ux-review.md at b20bffa4) has section 6.1 'Taken under the co-founder's ruling' (:1274). It records at :1369: "UX-094 (C-024): Accessible names start with the visible text: the practice's name then ', switch practice'; the email then ', account and sign out'; the current practice marked 'Current'." UX-094's fix (:3290) says: "Drop both aria-labels and let the visible text start the name ... followed by visually hidden ', switch practice' ... ', account and sign out' ... Remove the title attributes".
- The checklist at the head (.claude/agents/ux-brand-reviewer.md:17) says "a fix takes its section 6.1 words".
- The PR's own design, /home/user/ops/designs/lane-b-ci.md:1778-1781, chose other words and never cites UX-094. `grep -rn 'UX-094|switch practice|account and sign out'` over /home/user/ops finds them only in the baseline and its raw findings: none in the design, the two approval summaries or LANES.md.
- **Scenario:** #77 ships 'SYNTHETIC PHYSICAL THERAPY NORTH, practice switcher' and '<email>, account menu' on every app-shell page. UX PR 67 (`co-001/ux-header-menus`, baseline :149) then has to rename both to the ruled words.
- Screen-reader and speech-input users learn names that change twice.
- Specs and the screen tour that select 'Practice switcher' or 'Account menu' break a second time.
- The words a ruling took for this defect are replaced without anyone ruling on it.
- **Fix proposed:** Take UX-094's naming part, as written, in this PR. The change stays pixel-neutral.
- **Switcher** (:57-58): drop `aria-label`. Make the visible span `{current?.name ?? 'Choose a practice'}<span className="sr-only">, switch practice</span>`, with the suffix inside the name's span so Chrome does not add a space before the comma.
- **Account** (:87-93): drop `aria-label` and the summary's `title`. Keep the `data-initial` span. The email span becomes `sr-only md:not-sr-only md:max-w-[12rem] md:truncate` and ends with `<span className="sr-only">, account and sign out</span>`.
- Add `data-slot="practice-switcher"` and `data-slot="account-menu"` to the two summaries. Change brand.spec.ts:363-364 and sign-in.spec.ts:18 to select by those slots, because getByLabel cannot find a summary named from its content.
- In my probe the CI-19 check, axe 4.14 and the header baselines all still pass on this markup: /tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/reviews/ux/probe2/probe2.json, variant 'ruled-*'.
- Mark UX-094 in the baseline as closed by #77 except 'Current' (a visible change), which stays with PR 67.
- No migration, no freeze exception. The only alternative is a ruling by the co-founder that keeps the PR's words, recorded in reconciliation-001 and in baseline 6.1.

### UX-2 (should-fix; reproduced): Each header control is read with its practice name or email twice: once in the name, again as Chrome's description

- **Where:** apps/web/src/components/shell.tsx:57 and :87
- **Evidence:** Chromium 1248's accessibility tree (CDP Accessibility.getFullAXTree; /tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/reviews/ux/probe/out/probe.json, and probe2/probe2.json) on the head's markup with the compiled app CSS, at 1280, 700 and 390 px:
- Switcher: name="SYNTHETIC PHYSICAL THERAPY NORTH, practice switcher", desc="SYNTHETIC PHYSICAL THERAPY NORTH".
- Account: name="practice-admin@synthetic.test, account menu", desc="practice-admin@synthetic.test".
- With an aria-label present, Chrome exposes the content (and, for the account, the title) as the description.

At base the names were 'Practice switcher' and 'Account menu', with the same descriptions, so nothing was doubled. With UX-094's markup (variant 'ruled-*': no aria-label, no title) desc=null and nothing is said twice.
- **Scenario:** A practice administrator using NVDA with Chrome (object descriptions are read by default) tabs into the header on any page. They hear "SYNTHETIC PHYSICAL THERAPY NORTH, practice switcher, button, collapsed, SYNTHETIC PHYSICAL THERAPY NORTH", then "practice-admin@synthetic.test, account menu, button, collapsed, practice-admin@synthetic.test". With a 70-character practice name and email (probe case 'long'), that is about 280 characters of speech for two controls, on every page.
- **Fix proposed:** The same as UX-1: name both summaries from their content, with visually hidden suffixes, and remove the summary's `title` at :87. Probe2 shows this leaves no description. If UX-1 is instead resolved by keeping aria-label (any words), at least remove `title={shell.email}` at :87. The practice-name echo cannot be removed while an aria-label overrides content.

### UX-3 (nit; reproduced): The CI-19 check accepts a one-letter visible text matched anywhere in the name, so at 390 px it misses the regression it claims to guard

- **Where:** apps/web/e2e/brand.spec.ts:212 (comment :193, "this check is the only guard there")
- **Evidence:** I transcribed the check (brand.spec.ts:196-215) into probe2. In the regression variant the account's aria-label reverts to "Account menu" and the email is manager@synthetic.test (initial 'M'):
- At 700 and 390 px the only piece is "m"; `/m/i` matches "Account menu", so the check passes.
- axe 4.14 reports no violation and no incomplete there.
- Only the 1280 run fails it, on the email piece.

probe2.json, keys 'regress-normal/700' and 'regress-normal/390'.
- **Scenario:** A later change gives the account control a fixed name at the widths where only the initial shows. For any initial among a, c, o, u, n, t, m or e, the phone-width run stays green and axe stays silent. The 390 px guard the PR describes then does not exist for one in four of the alphabet's letters.
- **Fix proposed:** Hold the first visible piece to the start of the name, which Understanding 2.5.3 calls best practice and which every header control meets today: build the first piece's RegExp with a leading `^`; later pieces stay 'contained'. With the head's names this passes (the switcher starts with the practice name; the account with the email, whose first letter is the initial), and the regression variant fails at 390. Optionally widen the selector to `[role="button"], input, select` so a future non-native control is held too.

### UX-4 (nit; reproduced): The PR body calls the cover's 1,611-pixel change antialiasing; it is the title printed 1 px lower, and 'nothing a customer sees moves by a pixel' is then not exact

- **Where:** PR #77 description ('One changes pixels: report-cover-without-seal ... Chrome 156's antialiasing'; 'Nothing a customer sees moves by a pixel'); the A9 record designs/lane-b-ci/ci-browser-a9.md to be written
- **Evidence:** PIL over the committed head PNG and the 1194 baseline:
- The RGB difference box is (83,418)-(317,445). Ink totals are equal (631,737 both). The dark extent moves from rows 0-24 to 1-25.
- Shifting the old crop down 1 px leaves 0 differing pixels; unshifted, 1,611 (max channel difference 216).
- The other six pictures are 0 px. The cover's foot (y 856-1056) is entirely Paper (246,244,238) in both.
- The committed SHA-256s equal both local runs (run1.txt, run2.txt).
- **Scenario:** Someone reads the A9 record or ADR 0058's notes as a rasteriser change. A later 1 px title move then has no recorded precedent that says Chrome 156 moved the title's line box, and a customer's printed ROI statement title does in fact sit 1 px lower.
- **Fix proposed:** In the PR body and the A9 record: "report-cover-without-seal: Chrome 156 draws the title 'ROI statement' 1 px lower (1,611 pixels in 234 × 27 at 83, 418). Shifted down one pixel, the old picture's title matches the new one exactly, and nothing else on the cover moves." Under 'What it does not change': "every screen's pixels, except that title's 1 px on the printed cover without the seal".

### UX-5 (should-fix; verified-by-reading): After #77 merges, the screen tour's account-menu step matches nothing, so later PRs' UX reviews lose their open-menu shots

- **Where:** /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts:872 (ops f35cf30a); /home/user/ops/designs/lane-b-ux-review/route-map.json:25
- **Evidence:** - tour.spec.ts:872: `await page.locator('summary[aria-label="Account menu"]').first().click();` matches the exact old value. At the head, shell.tsx:87 renders `aria-label="<email>, account menu"`.
- The capture agent's read-only probe of the head server found 0 matches for practice-admin, support and platform-admin at 1280 and 390 px, and 1 match for `[aria-label$=", account menu"]`.
- route-map.json:25 still names "aria-label 'Account menu' (apps/web/src/components/shell.tsx:84)".
- LANES.md:17 requires the tour's before and after shots for every PR that changes what a person sees.
- **Scenario:** The first screen-changing PR after #77 runs the tour. Its eight account-menu shots (home, console.organizations, support and terms, at 1280 and 390) time out after 15 s and land in 'skipped'. The reviewer gets no after shot of the open menu: a UX-093 change, for example, is then 'not seen'.
- **Fix proposed:** On claude/build-ops, select by a stable hook instead of the words. Add `data-slot="account-menu"` and `data-slot="practice-switcher"` to the summaries (UX-1's fix) and click `header [data-slot="account-menu"]`, then wait for 'Sign out'. Until those slots exist, use `header summary[aria-label="Account menu"], header summary[aria-label$=", account menu"]`, as the capture agent's copy does. Add the open-switcher state (`p.settings.practice-switcher`) the tour lacks, and update route-map.json:25, :223, :3007 and :3035. This is ops tooling, not a file of the PR.

### UX-6 (should-fix; reproduced): Pre-existing (not caused by #77): below 640 px the practice switcher's open list runs off the left edge and cuts practice names

- **Where:** apps/web/src/components/shell.tsx:46 (DROPDOWN 'absolute right-0') with :61 ('w-72 max-w-[calc(100vw-2rem)]')
- **Evidence:** - Shot `p.settings.practice-switcher.390` (identical at base and head, 0 px changed) shows 'SYNTHETIC PHYSICAL THERAPY NORTH' and '...SOUTH' flush at x=0, with no left border or padding.
- Probe3 (head markup with the panel's real classes, Chromium 1248): at 390 px the panel spans -13 to 275 and the first name's text starts at 0. At 360 px the panel starts at -43 and the text at -30, so about 30 px of every name is cut. At 640 and 1280 px it fits.
- The panel is anchored to the switcher's right edge (about 272 px), and w-72 is 288 px.
- Not in the baseline: the earlier tour had no open-switcher state.
- **Scenario:** A firm user on a 360 px Android phone opens the switcher to change practice. Each practice name loses its first four or five letters (cut at about x = -30), so names that share a suffix ('... GROUP NORTH' and '... GROUP SOUTH' of two firms) can only be told apart after picking one. WCAG 1.4.10 Reflow: content is lost at 320 CSS px.
- **Fix proposed:** Below sm, anchor the switcher's panel to the header rather than the summary: `fixed inset-x-4 top-14 w-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:w-72`. Add a brand-journey assertion at 390 px that the open panel's bounding box lies within [0, innerWidth]. It belongs with UX PR 67 (`co-001/ux-header-menus`, same panel, after #42), with a new baseline entry; it is not a merge condition for #77, which does not touch :46 or :61.

## Not checked

- A real screen reader's speech (NVDA, JAWS, VoiceOver). The doubled name is shown in Chromium's accessibility tree; nobody heard it spoken.
- Keyboard focus order and the focus ring on the two summaries on the live server, which was stopped. Judged from the code: same elements, same classes and the same order as base, so no change.
- Windows High Contrast on a real Windows host. Only Chromium's forced-colors emulation was used: base and head are pixel-identical and the initial shows.
- Printed PDFs (the ROI statement with and without the seal, packets, the payer's copy) from the worker's new headless shell (1248). No before or after pages were rendered, so not seen. Only the brand journey's cover screenshots were compared, and the worker's print-layout tests were not re-run by me.
- Routes outside the 12-layout sample: about 71 of 83 app-shell routes are 'not seen, by sample' after this shell change. The header band was identical on all 48 sampled shots.
- Speech-input matching (Dragon, Voice Control) on the new names. Reasoned from WCAG 2.5.3 only.
- Axe over the full e2e suite under 4.14 with my proposed markup. Only the static probe was run; the PR's 72-scan run is the author's.
- The capture agent's two other tooling findings (run.sh's 5 s pid-file check; the hard-coded /home/user/screens paths). They are its own and not re-verified here.
- The dark (tokens only) header: compared by pixel count only (0 px in the header band). It is advisory under ADR 0056:127-130.
