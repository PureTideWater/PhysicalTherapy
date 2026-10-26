# Lane B: the UX/UI and brand baseline review

Lane B, 2026-10-26. The screenshots are of `claude/build-platform` at 6ddd587; every finding was checked against the code at 4d99df8 (PR #47 and PR #46 merged on top), and every file:line below reads as it does at 4d99df8. Synthetic data only. The brief is `designs/lane-b-ux-review-brief.md`; the coverage is `designs/lane-b-ux-review/coverage.md`. This document changes no product code: it ranks the findings and proposes the pull requests that fix them, in landing order. It was then revised against an adversarial review of the rules and a fact check of every file:line; section 10 gives each of their points and what was done with it.

## 1. Summary

**What was reviewed.** Every page of PaidWhole as built: 83 routes, each opened as the role that uses it, at 1280 px and 390 px, in light and in the dark tokens, and in the empty, loading, error and interaction states the route map names. That is 857 screenshots and the code behind each screen. They were judged against the brand's written rules (`.claude/rules/brand.md`, `docs/brand/BRAND.md`, `packages/brand`), ADR 0056 and ADR 0058, the copy rules (CO-11 and `tools/brand-copy`), the PRD's cross-cutting requirements (`docs/product/PRD.md:256`), WCAG 2.1 AA with combined audit #103's WCAG 2.2 additions, and the combined audit's experience items (audit #48, #89, #90, #103, #107 and #125).

**The counts.** The eleven reviewers and the retake reviewer wrote 342 findings. Merged by root cause they are **208: 16 blocking, 121 should fix and 71 polish**. Every one was checked against the code at 4d99df8: 185 hold as written, 23 hold with a corrected line or scope. On review four were re-graded from should fix to blocking, because each misleads a person about money or status (UX-020, UX-024, UX-035 and UX-039; their ids are kept). None was dropped whole; the parts not taken are listed at the end of section 7.

- 11 fold into work already in flight, whole or in part (section 4), among them `co-001/ux-forms`, the first proposed PR, already running in its own session.
- 1 is handed whole to Lane A: UX-124 (C-050), the payer's copy cover, to Lane A's PR 12, which rewrites that cover in CO-06's neutral words (section 5).
- 14 need a migration for part of their fix. Those parts go to Lane A (section 5); the Lane B part ships first wherever it stands alone.
- 68 need a file that #42 changes for part of their fix. Those parts wait for #42 and are marked so.
- 91 pull requests are proposed in landing order (section 3): ux-forms in flight, 63 that can start now (some after an open Lane B PR merges), 22 after #42 merges, and 5 that wait on Lane A or on the founder's answer.
- 5 questions go to the founder through the co-founder (section 6.2): dark mode, the terms text, the palette (with the sign-in ground's alias token), the screening's kept-data notices (with the closed link's order) and the screening's sentences held for counsel (the two ZIP sentences and the left-out line). Every other wording, brand, cost and security choice was taken as recommended under the co-founder's ruling and is listed in section 6.1, where two security trade-offs that are not the safer setting are named for the security reviewer.

**The ten most important.** The person's view first.
1. **UX-001 (C-001)**. A refused form throws away what the person typed, or puts a different answer back: after a refusal the console's model form sits on 'Kill switch' for 'Everyone', and a payer response goes back to 'Accepted'. 112 forms share one cause (`apps/web/src/components/action-form.tsx:65`). In flight as `co-001/ux-forms`.
2. **UX-002 (C-003)**. Settings > Defaults showed $5.00 as '$500 per line' and saved it 100-fold if left unchanged. Fixed by PR #54 (merged 2026-10-26 08:56 UTC, after this review's evidence).
3. **UX-003 (C-009)**. Actionable reads $0.00 on the practice home and $30.00 on the ROI statement for the same open case (the earlier tour's item 4, still present).
4. **UX-004 (C-010)**. A suspended organization's billing page says 'In good standing' directly above 'New runs have stopped'.
5. **UX-005 (C-008)**. On a phone the screening result hides Allowed, Difference and Status, so its four anomaly rows read alike: the prospect's first and only view of the product.
6. **UX-006 (C-005)**. Nobody who forgets a password or loses an authenticator or key can get back in: sign-in is a dead end.
7. **UX-007 (C-011)**. Logging the payer's answer sends the person to Uploads, which cannot take a payer letter; the only working path files it as a contract.
8. **UX-008 (C-012)**. Nothing tells the second person that a packet waits for their approval, and each later hand-off is as silent.
9. **UX-009 (C-006)**. The terms page asks a customer to accept terms it never shows: only a version, a storage reference and a hash prefix.
10. **UX-010 (C-004)**. A refused fee-schedule letter replaces Coverage with a raw JSON page, 980 px wide on a phone, with no way back.

The six other blocking findings are UX-011 (most tables have no keyboard-reachable scroller, so at 390 px they push the page sideways or hide columns a keyboard never reaches), UX-012 (the enrolment, code and new-password steps expire in three to five minutes with no warning), and the four re-graded on review: UX-024 (a partly answered case reads 'Resolved' while $30.00 is unexplained and no cash has posted), UX-020 (a case reopened by a recoupment reads 'Awaiting response' while the practice must act), UX-035 ('Log a payer response' starts on 'Accepted', so a hurried save records an approval the payer never gave) and UX-039 (shortfalls past case line 25 never appear, under 'No shortfall on this page of case lines').

**What passed.**
- 683 of the 857 shots drew no flag from the image checkers.
- The brand's colour rules hold in code: component code uses only token utilities (no raw colour; `tools/brand-colors` holds the hex), Brass is never text, and the mark and lockup render correctly in every light shot and every dark shot except sign-in (brand-16).
- The dark tokens pass text contrast everywhere in the second practice set; the only dark failure there is the native control glyphs (a11y-practice-2-15; UX-117 (C-035)).
- The founder's tour fixes of 2026-10-17 and the Approve button (audit #102) hold; neither was raised again.
- Some screens already do what the fixes ask elsewhere, and the fixes copy them: the screening upload form keeps its values after a refusal (`apps/web/src/components/screening/upload-form.tsx:117-142`); Cases formats materiality from cents (`apps/web/src/app/p/[practiceId]/cases/page.tsx:22`); three tables already have row headers (`packets/pricing.tsx:115`, `models/display.tsx:104`, `contracts/review.tsx:245`); the hardware-key form's email field carries `autocomplete="username webauthn"` (`apps/web/src/components/hardware-key.tsx:79`, a11y-other-07; the password form's carries `username`, `apps/web/src/app/sign-in/page.tsx:27`).

## 2. How it was done

**The route map and the capture.** A scout listed the 83 routes (`find apps/web/src/app -name page.tsx` at 6ddd587), the persona that may open each, the record its segments need and the e2e spec that creates it (`designs/lane-b-ux-review/route-map.json`). `tools/lane-b-screen-tour` then captured every page from a fresh prepare, populated by those specs, with synthetic data only:
- 857 shots: 1280 px light, 1280 px dark and 390 px light, plus each state the map names (empty, loading by holding the page's data with `page.route`, not-found by an unknown ID, error by a refused form, and interactions such as an open menu).
- **Dark (tokens only).** No user reaches dark today: nothing sets `data-theme` and the tokens have no `prefers-color-scheme` rule. Dark was captured by setting `data-theme="dark"` after each load, as `apps/web/e2e/brand.spec.ts:407` does, and its contrast is judged as advisory.
- **78 skipped**, each for a reason, never faked: 36 states at both widths (72 shots) that synthetic data cannot show, and 6 route-map entries with no page (for example `/console`). Each is listed with its reason in `designs/lane-b-ux-review/coverage.md`, "States synthetic data cannot show"; section 9 summarises them.
- **The checkers.** A second agent looked at every image first: 683 ok, 152 product flags (the reviewers' leads) and 22 capture faults.
- **The 22 retaken.** The capture faults (sticky headers at 390 px, the empty-filter and zero-read states) were retaken with a `toTop` step, `filterToEmpty` and a zero-read grant chosen at shot time; their checker passed all 22, and a retake reviewer read them with all five lenses (7 findings, retake-01 to retake-07).

**Eleven reviewers**, each with one lens, its own images and the code behind them (`scratchpad/ux/reviewer-common.md`):

| Lens | Images | Findings |
|---|---|---|
| `brand` | 96 | 18 |
| `flows-practice` | 124 | 36 |
| `flows-other` | 85 | 30 |
| `words-practice` | 127 | 56 |
| `words-other` | 76 | 45 |
| `a11y-practice-1` | 107 | 28 |
| `a11y-practice-2` | 107 | 24 |
| `a11y-other` | 152 | 26 |
| `narrow-practice-1` | 115 | 26 |
| `narrow-practice-2` | 115 | 23 |
| `narrow-other` | 142 | 23 |
| `retake` | 22 | 7 |

"Narrow" is the 390 px and states lens; "a11y" is accessibility (WCAG 2.1 AA by hand as well as axe); "other" is the console, sign-in, account, organization and public pages. 1,246 image reads in all.

**This synthesis.** A clusterer merged the 342 findings by root cause into 208 clusters, and a script checked that every finding id sits in exactly one. Two writers verified each cluster against the code at 4d99df8 and settled the members' conflicting fixes (each settlement is in the finding's Notes). This document ranks them (blocking, should fix, polish; then by harm area: money or status, data or work, task flow, accessibility, then clarity, consistency or brand; then by reach, routes and roles touched) and groups them into pull requests in landing order. A harm area only orders findings within a severity: the severity alone says whether a finding meets the blocking test (`reviewer-common.md:52`). It then went to one adversarial reviewer (the brand rules, the freezes, the lanes' rules, the PRD, and taste presented as a rule) and one fact checker (every file:line at 4d99df8), and a reviser applied or rejected each of their points, with the evidence (section 10).

**Numbers.** "UX PR n" is a pull request this review proposes, numbered in landing order (section 3); "Lane A's PR n" is a pull request of reconciliation-001's Lane A plan; "PR #n" is a GitHub pull request; "audit #n" is an item of the combined audit. "#42" alone is Lane A's open PR #42 (mail streams). The UX ids (UX-nnn) were fixed at the first ranking and kept on review, so a re-graded finding keeps its id.

**The screenshots** stay off the repository, which is public. They are published as two private artifact galleries, one per width; the gallery's URL is recorded in `lanes/lane-b.md`. Only the manifest (`designs/lane-b-ux-review/manifest.json`, file names only) and the coverage are committed.

## 3. Proposed pull requests in landing order

Each is one theme and about 400 changed lines of product code at most (tests and docs are extra). Every one changes something a person sees, so in every one the UX and brand review is one of its two adversarial reviews (the brief's "Then", item 2), with before and after shots at 1280 px and 390 px. "Now" means it needs no #42 file; some still wait for an open Lane B PR named under "Depends on". The first group is the blocking fixes, then the shared pieces later PRs build on, then the rest by area, then what waits for #42, then what waits on Lane A or the founder.

- **The blocking group uses today's components.** It adds no local component that the shared pieces then replace: a notice is today's `Alert`, and a date goes through today's `utc()` and `utcDate()` (`apps/web/src/components/format.ts:2,10`), a quarter through one helper beside them, so the date and notice PRs change one place. The stacked rows for phones are one primitive, built in UX PR 3 (`co-001/ux-table-scroll`) and used by every later stacking fix.
- **Overlaps with open pull requests.** Each "Depends on" cell names every open Lane B pull request that changes one of its files, generated from their file lists at their heads of 2026-10-26 ~09:50 UTC (PR #48 at 123b8fa5, PR #49 at ac162d6c, PR #50 at ed85bcf3, PR #51 at 0e086eda, PR #52 at a2eee987 and PR #55 at eea716d7), and PR #53, merged at 09:50 UTC after this review's evidence. `LANES.md` rule 6 applies: the one merged second keeps both. "After PR #n merges" is a wait; "PR #54 (merged)" is a fact.
- **Hot files.** The practice home changes in 17 of these PRs, the packet page in 15 and the case page in 14; each later one merges the earlier work, as rule 6 says.

| # | Branch | What it fixes | Closes | Size | #42 | Depends on |
|---|---|---|---|---|---|---|
| 1 | `co-001/ux-forms` | Forms keep what the person typed, and name the refused field | UX-001, UX-074, UX-081 | M | now (in flight) | PR #50 (adds `refreshOnError` to `action-form.tsx`: the one merged second keeps both); PR #50 also changes `components/action-form.test.tsx`, `lib/http/next.ts` (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 2 | `co-001/ux-suspended-standing` | A suspended organization never reads "In good standing" | UX-004 | S | now | nothing |
| 3 | `co-001/ux-table-scroll` | Every table scrolls by keyboard and shows that it scrolls, and phones get one stacked-row layout | UX-011, UX-079 | M | now | PRs #49, #50 and #51 touch some of the same pages: the one merged second keeps both; PR #49 also changes `app/console/rule-releases/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `components/pricing/diff.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx`, `app/p/[practiceId]/reconciliation/page.tsx`, `components/reports/display.tsx` (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 4 | `co-001/ux-screening-result-tables` | The screening result reads on a phone, and its rows say what they are | UX-005, UX-040, UX-042, UX-043, UX-132, UX-206 | M | now | UX PR 3 (`ux-table-scroll`: `ScrollTable` and the stacked-row primitive) |
| 5 | `co-001/ux-download-refusals` | A refused download comes back to its form, never a JSON page | UX-010 | M | now | PR #49 changes `coverage/page.tsx` and `lib/routes/coverage.ts`: the one merged second keeps both |
| 6 | `co-001/ux-sign-in-time` | Each sign-in step says how long it stays open, warns before it closes, and starts again with the email kept | UX-012, UX-128 | M | now | nothing |
| 7 | `co-001/ux-sign-in-recovery` | Forgot your password: a way back in from the sign-in page | UX-006, UX-066 | L | now | UX PR 1 (`ux-forms`): the reset form keeps the email after a refusal |
| 8 | `co-001/ux-account-security` | A person manages their own sign-in: password, authenticator and a second key, after signing in again | UX-006 | M | now | UX PR 7 (`ux-sign-in-recovery`: the provider calls it adds) |
| 9 | `co-001/ux-home-figures` | One actionable figure on the home and the ROI statement, and the Recovered tile names its period | UX-003, UX-015, UX-140 | M | now | after PR #51 merges (it changes the home page and the Payer approved note); PR #49 (open) also changes `packages/triage/src/index.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #50 (open) also changes `components/format.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/page.tsx`, `components/reconciliation/display.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6) |
| 10 | `co-001/ux-payer-response` | The payer's letter is uploaded inside 'Log a payer response', and its answer starts unchosen | UX-035, UX-007 | M | now | after PR #51 merges (it changes all three pages); UX PR 1 (`ux-forms`); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/e2e/packets.spec.ts`, `app/p/[practiceId]/cases/[caseId]/page.tsx`, `lib/routes/triage.ts` (`LANES.md` rule 6); PR #52 (open) also changes `apps/web/e2e/packets.spec.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 11 | `co-001/ux-packet-queues` | A packet waiting for someone shows on their home and on Cases | UX-008 | L | now | after PR #51 merges (home page); PR #51 also changes `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6) |
| 12 | `co-001/ux-case-summary` | The case says what was asked, what the payer accepted and what is left | UX-020, UX-024, UX-023, UX-033, UX-190 | L | now | after PR #51 merges (case summary); after PR #52 merges (packet subtitle); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 13 | `co-001/ux-ledger-corrections` | Ledger corrections list every shortfall and number entries per practice | UX-039, UX-019, UX-078, UX-162 | L | now | after PR #51 merges (the ledger page, its queries and `shortfalls.ts`); PR #51 also changes `app/p/[practiceId]/abstraction/ledger/page.tsx`, `lib/reconciliation/queries.ts`, `lib/routes/reconciliation-routes.db.test.ts`, `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 14 | `co-001/ux-notice` | One Notice with four kinds, told apart by surface, icon, words and role | UX-082 | L | now | UX PR 1 (`ux-forms`: ActionForm's refusal); PR #50 (open) also changes `components/action-form.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `components/packets/display.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 15 | `co-001/ux-notice-once` | A success notice shows once, from a flash bound to the write, never from the URL | UX-013 | M | now | UX PR 14 (`ux-notice`); PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 16 | `co-001/ux-field-hints` | Every field states the format it checks, and custom forms tie their errors to the field | UX-077, UX-087, UX-090 | M | now | UX PR 1 (`ux-forms`); PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 17 | `co-001/ux-route-messages` | Every refusal says what to do, in words the role can act on | UX-050, UX-064 | M | now | UX PR 1 (`ux-forms`); PR #50 (changes `lib/routes/pricing.ts`) |
| 18 | `co-001/ux-stat-tile` | One figure tile for every headline, in the brand's type | UX-104, UX-114, UX-165 | M | now | after PR #51 merges (reports display, reconciliation display, home, reconciliation page); PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/compare/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `components/reports/display.tsx`, `app/p/[practiceId]/page.tsx`, `components/reconciliation/display.tsx`, `app/p/[practiceId]/reconciliation/page.tsx` (`LANES.md` rule 6) |
| 19 | `co-001/ux-labels` | Stored codes are shown in words, from one label module | UX-100, UX-166 | M | now | PRs #51 (reports display, report HTML) and #50 (releases page): the one merged second keeps both; PR #49 (open) also changes `worker/report/html.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/page.tsx`, `components/reports/display.tsx`, `worker/report/html.ts` (`LANES.md` rule 6); PR #52 (open) also changes `lib/copy/words.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 20 | `co-001/ux-sha256` | A hash is shown whole, wraps evenly, and copies with one button | UX-075, UX-128 | M | now | PR #52 rewrites the packet trace cells: the one merged second keeps both; PR #49 (open) also changes `app/console/rule-releases/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 also changes `components/packets/display.tsx`, `app/p/[practiceId]/lines/[lineId]/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 21 | `co-001/ux-status-chip` | One chip for every state, and danger only for failures | UX-018, UX-106 | M | now | PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 22 | `co-001/ux-page-header` | One page header: breadcrumb, title, lede and an actions slot | UX-157, UX-158 | M | now | PR #52 and the narrative-draft PR change the packet pages; PR #51 the submissions page: coordinate; PR #51 also changes `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx` (`LANES.md` rule 6) |
| 23 | `co-001/ux-buttons` | Busy buttons keep focus and say what is happening; destructive actions follow one rule | UX-081, UX-155 | M | now | UX PR 1 (`ux-forms`); PR #52 and the narrative-draft PR (packet buttons) |
| 24 | `co-001/ux-headings-regions` | Headings follow the page, and regions are named by their titles | UX-095, UX-096 | L | now | PRs #49, #50 and #51 (releases, coverage, reconciliation); PR #52 (packet and line pages): mark its new step titles there; PR #49 also changes `app/p/[practiceId]/coverage/page.tsx`, `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 25 | `co-001/ux-row-headers` | Every table has headers, and each row's controls say which row they act on | UX-073, UX-145 | M | now | PRs #50 and #51 (run and reconciliation pages); PR #52 (packet schedule and line trace); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `components/pricing/diff.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/abstraction/ledger/page.tsx`, `app/p/[practiceId]/reconciliation/page.tsx` (`LANES.md` rule 6); PR #52 also changes `components/packets/display.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 26 | `co-001/ux-empty-states` | Empty and filtered lists name the filter and the next step, with a link | UX-103, UX-108, UX-139, UX-195 | M | now | PRs #50 (run page) and #51 (reconciliation page); PR #49 (Coverage); offer the Coverage and Mapping empty state to audit #32's design; PR #49 also changes `app/p/[practiceId]/coverage/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `app/p/[practiceId]/pricing-runs/page.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx` (`LANES.md` rule 6) |
| 27 | `co-001/ux-job-status` | Pages that wait on a job refresh themselves and say when it is done | UX-086, UX-196 | M | now | PR #50 (run and compare pages); audit #46 (`co-001/verified-seal`, the ROI statement page): coordinate the file; PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `app/p/[practiceId]/pricing-runs/compare/page.tsx` (`LANES.md` rule 6) |
| 28 | `co-001/ux-loading-announce` | Loading states say what is loading, and are announced | UX-076 | S | now | nothing |
| 29 | `co-001/ux-dates` | One date style on every screen, and dates that never break mid-way | UX-027, UX-153, UX-167, UX-187 | L | now | PR #50 (changes `components/format.ts`); PR #54 (merged; receipt labels); PR #51 (open) also changes `app/p/[practiceId]/abstraction/ledger/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 30 | `co-001/ux-counts-and-units` | Counts agree with their nouns, and units print as people write them | UX-115, UX-138 | M | now | after PR #52 merges (`words.ts`, packet pages); PR #51 (case page); PR #49 (open) also changes `app/console/rule-releases/page.tsx`, `tools/brand-copy/scan.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #50 (open) also changes `components/pricing/diff.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `components/packets/display.tsx` (`LANES.md` rule 6) |
| 31 | `co-001/ux-copy-lint` | The copy lint reads every file people read and holds the house rules | UX-101, UX-129, UX-168 | M | now | UX PR 30 (`ux-counts-and-units`: the plural rule); after PR #52 merges (packet page); PR #48 (open) also changes `packages/compliance/src/controls.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #49 (open) also changes `tools/brand-copy/scan.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 32 | `co-001/ux-dark-tokens` | The dark tokens' defects fixed, and native controls take the brand | UX-117, UX-160, UX-164, UX-208 | S | now | nothing |
| 33 | `co-001/ux-focus-touch` | Focus is never hidden under the header, targets are 24 px, and phones do not zoom | UX-080, UX-088, UX-089, UX-161 | M | now | PR #51 (reconciliation page); PR #50 (open) also changes `components/pricing/diff.tsx`, `app/p/[practiceId]/pricing-runs/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6) |
| 34 | `co-001/ux-phone-record-lists` | On a phone, record lists stack each row with its actions | UX-078, UX-079 | L | now | UX PR 3 (`ux-table-scroll`: the stacked-row primitive) |
| 35 | `co-001/ux-cases-list-first` | Cases leads with the list; materiality is set in one place | UX-125, UX-184, UX-200 | M | now | PR #54 (merged; both materiality forms); UX PR 16 (`ux-field-hints`: the reference search) |
| 36 | `co-001/ux-short-one-name` | One name for the shortfall: 'Short (variance)', with its stage | UX-014 | M | now | after PRs #50, #51 and #52 merge (run, case, ledger and packet pages); PR #49 (open) also changes `components/pricing/display.tsx`, `tools/brand-copy/scan.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #50 also changes `components/pricing/display.tsx`, `app/p/[practiceId]/pricing-runs/page.tsx`, `app/p/[practiceId]/pricing-runs/[runId]/page.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx` (`LANES.md` rule 6); PR #52 also changes `components/packets/display.tsx`, `lib/copy/words.ts` (`LANES.md` rule 6); PR #55 (open) also changes `.claude/agents/ux-brand-reviewer.md`: the one merged second keeps both (`LANES.md` rule 6) |
| 37 | `co-001/ux-reconciliation-order` | Reconciliation leads with what is unmatched | UX-173, UX-186 | M | now | after PR #51 merges; PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6) |
| 38 | `co-001/ux-pricing-runs` | A run says whether it was triaged, and Compare compares like with like | UX-029, UX-030, UX-036, UX-084, UX-109 | L | now | after PR #50 merges (run states, `NotInEffectAlert`); PR #49 (open) also changes `components/pricing/display.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `lib/routes/pricing.ts`, `lib/pricing/queries.ts`, `app/p/[practiceId]/pricing-runs/page.tsx`, `components/pricing/display.tsx`, `components/pricing/diff.tsx`, `app/p/[practiceId]/pricing-runs/compare/page.tsx` (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `lib/pricing/queries.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 39 | `co-001/ux-line-to-case` | A line names its case, and its basis is shown, not hovered | UX-056, UX-150 | M | now | after PRs #52 (line page) and #50 (run page) merge; PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`, `lib/routes/remittances.ts` (`LANES.md` rule 6) |
| 40 | `co-001/ux-record-names` | Records and plans are named as their own pages name them | UX-105, UX-116 | L | now | after PRs #49, #50 and #52 merge; PR #49 also changes `app/p/[practiceId]/coverage/page.tsx`, `components/pricing/display.tsx` (`LANES.md` rule 6); PR #50 also changes `components/pricing/display.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`, `packages/packets/src/payer.ts`, `components/packets/display.tsx` (`LANES.md` rule 6) |
| 41 | `co-001/ux-codes-in-words` | Unpriced reasons, methods and 835 fields in plain words | UX-110, UX-174 | M | now | after PRs #49, #50 and #52 merge; PR #54 (merged; receipt page); PR #49 also changes `components/pricing/display.tsx`, `app/p/[practiceId]/coverage/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `components/pricing/diff.tsx`, `components/pricing/display.tsx` (`LANES.md` rule 6); PR #52 also changes `lib/contracts/remedies.ts`, `packages/packets/src/explain.ts` (`LANES.md` rule 6) |
| 42 | `co-001/ux-internal-names` | Customers never read the product's internal names | UX-154, UX-193 | M | now | after PRs #51 and #52 merge; PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/page.tsx`, `app/p/[practiceId]/pricing-runs/compare/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/page.tsx`, `components/reconciliation/display.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 43 | `co-001/ux-who-did-it` | Histories name who acted, truthfully | UX-017, UX-022 | M | now | after PRs #51 and #52 merge; PR #51 also changes `lib/reconciliation/queries.ts` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `lib/packets/review.ts`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 44 | `co-001/ux-packet-status` | The packet page says where the packet stands and what this person does next | UX-063, UX-069 | L | now | after PR #52 and the narrative-draft PR merge; PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `lib/packets/queries.ts` (`LANES.md` rule 6) |
| 45 | `co-001/ux-packet-words` | The packet's checks, lists and review say what to do | UX-126, UX-130, UX-151, UX-194 | M | now | after PR #52 and the narrative-draft PR merge (its guarded refresh); PR #52 also changes `components/packets/display.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx` (`LANES.md` rule 6) |
| 46 | `co-001/ux-waiting-on-someone` | A hand-off that waits on another person shows where the work starts | UX-053, UX-060, UX-061 | M | now | UX PR 11 (`ux-packet-queues`); after PRs #51 and #52 merge; PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6) |
| 47 | `co-001/ux-uploader` | The uploader keeps chosen files, names them, and sizes in KB, MB and GB | UX-049, UX-097, UX-159, UX-163, UX-181 | M | now | PR #54 (merged; `receipt-labels.ts`) |
| 48 | `co-001/ux-uploads-every-kind` | Uploads takes every kind of document a practice sends | UX-062, UX-197 | M | now | UX PR 10 (`ux-payer-response`); UX PR 47 (`ux-uploader`); PR #51 (open) also changes `app/p/[practiceId]/reconciliation/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 49 | `co-001/ux-upload-next` | After an upload, the receipt says what it found and what happens next; a refresh loses nothing | UX-048, UX-123 | L | now | UX PR 47 (`ux-uploader`); PR #54 (merged); after the narrative-draft PR merges (its leave guard) |
| 50 | `co-001/ux-validation-request` | A validation request is traced from the cohort to Coverage and back | UX-070 | M | now | after PRs #49 and #51 merge; UX PR 15 (`ux-notice-once`); PR #49 also changes `lib/routes/coverage.ts`, `app/p/[practiceId]/coverage/page.tsx` (`LANES.md` rule 6); PR #51 also changes `lib/routes/triage.ts` (`LANES.md` rule 6) |
| 51 | `co-001/ux-contract-pages` | Contract pages word a signed-off version, its calendar and its pages truthfully | UX-025, UX-028, UX-113, UX-192 | M | now | nothing |
| 52 | `co-001/ux-a11y-names` | Titles name the record, related controls are grouped, cited words are marked for every reader | UX-144, UX-146, UX-148 | M | now | after PRs #51 and #52 merge; PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `app/p/[practiceId]/lines/[lineId]/page.tsx` (`LANES.md` rule 6) |
| 53 | `co-001/ux-settings-pages` | Settings: one look for the section tabs, the agreements told apart, every request a link | UX-026, UX-152, UX-177, UX-188 | M | now | PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 54 | `co-001/ux-read-only-cards` | Read-only roles see what is set and who sets it, not the doer's instructions | UX-107 | M | now | PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 55 | `co-001/ux-roi-words` | The ROI statement states only what it measures | UX-032, UX-175 | S | now | audit #46 (`co-001/verified-seal`, queued): land with or after it |
| 56 | `co-001/ux-release-pages` | Rule release pages say what this server does and mark the release shown | UX-065, UX-149 | S | now | after PRs #49 and #50 merge; PR #49 also changes `app/console/rule-releases/page.tsx`, `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6) |
| 57 | `co-001/ux-console-records` | Console pages: the location result, the members table, billing status and model flags read right | UX-034, UX-038, UX-057, UX-099, UX-142, UX-202, UX-204 | L | now | PR #54 (merged; console practice and models pages) |
| 58 | `co-001/ux-soc2-todo` | The SOC 2 page lists its actions, and its evidence reads as words | UX-068, UX-127 | M | now | PR #48 (open) also changes `packages/compliance/src/controls.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 59 | `co-001/ux-maintenance` | Maintenance is a state a person can wait through, and comes back to the page | UX-047, UX-198 | M | now | UX PR 1 (`ux-forms`); PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 60 | `co-001/ux-account-pages` | Revoking a device confirms first; staff are told why no digest comes | UX-143, UX-179 | S | now | nothing |
| 61 | `co-001/ux-public-frame` | One public frame: header, width and footer | UX-156 | M | now | nothing |
| 62 | `co-001/ux-not-found` | A missing record is shown inside the app, with the way back | UX-172, UX-178 | M | now | PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 63 | `co-001/ux-screening-result-first` | The screening result leads with its answer and its next step | UX-044, UX-134, UX-136, UX-185 | M | now | UX PR 4 (`ux-screening-result-tables`) |
| 64 | `co-001/ux-sign-in-words` | Sign-in steps say what went wrong on the step itself | UX-054, UX-098, UX-170, UX-180, UX-189 | M | now | UX PR 1 (`ux-forms`); UX PR 7 (`ux-sign-in-recovery`); PR #50 (open) also changes `lib/http/next.ts`, `components/action-form.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 65 | `co-001/ux-second-factor-reset` | A platform administrator resets a lost authenticator from the console | UX-006 | M | after #42 | after #42 merges; UX PR 8 (`ux-account-security`: the second key a staff member recovers with) |
| 66 | `co-001/ux-sign-in-session` | The sign-in steps stay open 15 minutes, Cognito's maximum | UX-012 | S | after #42 | after #42 merges; UX PR 6 (`ux-sign-in-time`: the one constant and the warning) |
| 67 | `co-001/ux-header-menus` | The header menus close as people expect, and name the practice and the account | UX-006, UX-021, UX-093, UX-094, UX-147 | L | after #42 | after #42 merges; UX PR 8 (`ux-account-security`) |
| 68 | `co-001/ux-skip-and-rail` | A skip link, a rail grouped by job, and the current item marked by more than brass | UX-083, UX-084, UX-112, UX-161, UX-168, UX-169 | M | after #42 | after #42 merges; UX PR 67 (`ux-header-menus`) |
| 69 | `co-001/ux-shell-context` | The practice stays chosen off its pages, and each page's help is its own | UX-102, UX-111, UX-157 | M | after #42 | after #42 merges; UX PR 22 (`ux-page-header`); PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 70 | `co-001/ux-organization-area` | The organization's administrator gets an Organization area; 'Billing' is renamed Subscription | UX-120, UX-121 | M | after #42 | after #42 merges |
| 71 | `co-001/ux-forbidden` | A refused page has its own title, words for the role, and a link to the next step | UX-051, UX-092 | L | after #42 | after #42 merges; PR #49 (open) also changes `app/console/rule-releases/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #50 (open) also changes `components/format.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 72 | `co-001/ux-loading-frame` | Loading keeps the header and Menu, and every screen has its loading state | UX-076 | M | after #42 | after #42 merges; UX PR 28 (`ux-loading-announce`) |
| 73 | `co-001/ux-console-home` | `/console` is every internal role's home: what needs a person now | UX-052, UX-182 | L | after #42 | after #42 merges |
| 74 | `co-001/ux-console-support-page` | Console support grants: open ones first, the ticket chosen, End now confirmed | UX-011, UX-055, UX-073, UX-077, UX-078, UX-106, UX-155 | M | after #42 | after #42 merges; UX PRs 3, 16, 21, 23, 25 and 34 (the shared pieces this page takes) |
| 75 | `co-001/ux-users-page` | Users and roles: the refusal points the right way, two-step verification named, rows stack | UX-006, UX-011, UX-013, UX-067, UX-073, UX-078, UX-100, UX-166 | M | after #42 | after #42 merges; UX PRs 3, 15, 19, 25 and 34 |
| 76 | `co-001/ux-support-access` | A support grant names its holder, can be ended by the practice, and its reads are grouped | UX-011, UX-072, UX-100, UX-133, UX-168, UX-199 | L | after #42 | after #42 merges; UX PRs 3 and 19 |
| 77 | `co-001/ux-access-log` | The access log pages both ways, names the record it filters by, and links from records | UX-071, UX-100, UX-137 | M | after #42 | after #42 merges; `LANES.md` queue item 8 (audit #49, the access log's later pages): one PR; PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 78 | `co-001/ux-console-confirm` | The console's widest actions ask for a tick that states the consequence | UX-013, UX-046 | M | after #42 | after #42 merges; PR #54 (merged); UX PR 15 (`ux-notice-once`) |
| 79 | `co-001/ux-console-org-page` | The console's organization page leads with its records | UX-203 | M | after #42 | after #42 merges; UX PRs 57 and 78 |
| 80 | `co-001/ux-support-tickets` | The support form names the page it came from, and the desk sees each ticket's age | UX-058, UX-171, UX-191 | M | after #42 | after #42 merges |
| 81 | `co-001/ux-notification-words` | Notifications: magnitudes in words, counts that agree, and the shortfall in one name | UX-014, UX-031, UX-114, UX-115 | S | after #42 | after #42 merges; UX PRs 18, 30 and 36 |
| 82 | `co-001/ux-home-by-role` | The practice home leads with each role's own work | UX-119, UX-141 | L | after #42 | after #42 merges; UX PRs 9, 11 and 46; PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6) |
| 83 | `co-001/ux-settings-words` | Settings routes: proof level in short sentences, the chain's agreements told apart, messages with a next step | UX-013, UX-026, UX-050, UX-107, UX-109, UX-201 | M | after #42 | after #42 merges; UX PRs 17, 53 and 54 |
| 84 | `co-001/ux-screening-upload-page` | The screening page runs in the order of the task, and its file is chosen and sent | UX-041, UX-082, UX-087, UX-135, UX-156, UX-207 | L | after #42 | after #42 merges; UX PRs 14, 16 and 61 |
| 85 | `co-001/ux-screening-messages` | The screening's messages: one left-out sentence, the result's anchor, figures in mono | UX-013, UX-057, UX-079, UX-113, UX-134, UX-154, UX-205 | M | after #42 | after #42 merges; UX PR 84; the founder's answer on the ZIP sentences; the founder's answer on the left-out sentence (F5) |
| 86 | `co-001/ux-enrol-qr` | Enrolment shows a QR code | UX-128 | S | after #42 | after #42 merges; UX PR 20 (`ux-sha256`: the copy button); ci-deps' licence and age checks for the QR library (PR #48); PR #48 also changes `pnpm-lock.yaml` (`LANES.md` rule 6) |
| 87 | `co-001/ux-terms-text` | The terms page shows the terms | UX-009, UX-026 | M | now (waits on Lane A) | Lane A's legal-text tables (audit #51); the founder's answer (6.2) on which text is the signed-off version; PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6) |
| 88 | `co-001/ux-prospect-context` | An audit request from a screening arrives with its screening | UX-131 | M | now (waits on Lane A) | Lane A's console read function over `screening_lead` |
| 89 | `co-001/ux-screening-kept-notices` | The screening's kept-data notices, reshaped with every clause kept, and the closed link's order | UX-041, UX-122, UX-136 | M | after #42 (waits on founder) | after #42 merges; the founder's answer (6.2), then counsel |
| 90 | `co-001/ux-palette` | The palette: link, focus and surfaces adopted, warm greys, a hover a person can see | UX-176 | S | now (waits on founder) | the founder's answer (6.2) |
| 91 | `co-001/ux-appearance` | People reach dark mode: an Appearance setting, Match my device by default | UX-118, UX-160 | M | after #42 (waits on founder) | the founder's answer (6.2): F1, and F3 for the alias; UX PR 32 (`ux-dark-tokens`); after #42 merges (the account menu's link in `shell.tsx`, and option (c)'s `tenancy.ts`); option (c): Lane A's migration |

### 3.1 In flight (UX PR 1)

#### UX PR 1. Forms keep what the person typed, and name the refused field

`co-001/ux-forms`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **In flight:** Claimed 2026-10-26 04:35 UTC, its own session; no pull request yet.
- **Closes:** UX-001 (C-001); UX-074 (C-013); UX-081 (C-022) (ActionForm's busy button and focus).
- **Files:** `apps/web/src/components/action-form.tsx`, `apps/web/src/components/action-form.test.tsx` (from PR #50), `apps/web/e2e/triage.spec.ts`, `apps/web/e2e/sign-in.spec.ts`, `apps/web/src/components/field.tsx`, `packages/ui/src/styles.css`, `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/http/invoke.ts`, `apps/web/src/components/packets/version-form.tsx`, `apps/web/src/components/packets/export-status.tsx`, `apps/web/src/components/screening/split-form.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/console/status/page.tsx`.
- **Depends on:** PR #50 (adds `refreshOnError` to `action-form.tsx`: the one merged second keeps both); PR #50 also changes `components/action-form.test.tsx`, `lib/http/next.ts` (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `action-form.test.tsx` (a refused state keeps an input, a select, a text area and a check box; clears only password and one-time-code inputs; the summary names the label; focus moves to the summary)
  - e2e: `triage.spec.ts` (a refused write-off keeps its reason), `sign-in.spec.ts` (the email survives a refusal)
  - axe: the refused state of `/p/[practiceId]/cases/[caseId]`, `/console/models` and `/request-audit`
- **Leaves to Lane A or the founder:** Nothing to Lane A or the founder.

### 3.2 Blocking fixes that touch no #42 file (UX PRs 2 to 13)

#### UX PR 2. A suspended organization never reads "In good standing"

`co-001/ux-suspended-standing`. After #42 merges: no. Visible change: yes. Size: S, about 80 lines.
- **Closes:** UX-004 (C-010) (one standing in `billing.ts`, the badge and the next step).
- **Files:** `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/lib/routes/billing.ts`.
- **Depends on:** nothing.
- **Tests to add:**
  - unit: the standing helper in `billing.ts` (suspended and closed never yield good standing)
  - e2e: `billing.spec.ts` (a suspended organization shows "Suspended by PaidWhole" and the support link)
  - copy: `pnpm lint:copy`
- **Leaves to Lane A or the founder:** Lane A: the stored suspension reason, note and time, so the customer's page can say why and what to do next, and the console's reason form (`lib/routes/console.ts`, a #42 file).

#### UX PR 3. Every table scrolls by keyboard and shows that it scrolls, and phones get one stacked-row layout

`co-001/ux-table-scroll`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines (one component, then a wrapper at each of about 35 sites).
- **Closes:** UX-011 (C-002) (outside #42's files); UX-079 (C-043) (part (a): the scroll cue in ScrollTable, and the one stacked-row primitive that parts (b) and (c), UX-005 and UX-078 use).
- **Files:** `apps/web/src/components/scroll-table.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/packet-reviews/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/components/contracts/display.tsx`, `apps/web/src/components/reports/display.tsx`, `apps/web/src/components/reports/documents.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/components/releases/note.tsx`, `apps/web/src/components/screening/coverage.tsx`, `apps/web/src/app/console/screening/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/e2e/a11y.ts`, `apps/web/src/components/stacked-rows.tsx` (new), `apps/web/src/app/brand.css`.
- **Depends on:** PRs #49, #50 and #51 touch some of the same pages: the one merged second keeps both; PR #49 also changes `app/console/rule-releases/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `components/pricing/diff.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx`, `app/p/[practiceId]/reconciliation/page.tsx`, `components/reports/display.tsx` (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `scroll-table.test.tsx` (named region, tab stop rendered on the server, dropped only while the table fits)
  - e2e: `layout-1280.spec.ts` and an `atPhoneWidth` pass over the changed routes (no page wider than the viewport)
  - axe: every changed route at 390 px
  - unit: `stacked-rows.test.tsx` (each row a heading, a definition list and its actions; the brand's expected, paid, short order kept)
- **Leaves to Lane A or the founder:** The three #42 pages (users, console support, support access) take the same wrapper in UX PRs 74, 75 and 76.

#### UX PR 4. The screening result reads on a phone, and its rows say what they are

`co-001/ux-screening-result-tables`. After #42 merges: no. Visible change: yes. Size: M, about 350 lines.
- **Closes:** UX-005 (C-008); UX-040 (C-107); UX-042 (C-118); UX-043 (C-119); UX-132 (C-061); UX-206 (C-203).
- **Files:** `apps/web/src/components/screening/anomalies.tsx`, `apps/web/src/components/screening/coverage.tsx`, `apps/web/e2e/screening-phone.spec.ts` (new), `apps/web/src/components/screening/result.test.tsx`, `apps/web/src/lib/screening/labels.ts`, `apps/web/src/components/screening/result-summary.tsx`.
- **Depends on:** UX PR 3 (`ux-table-scroll`: `ScrollTable` and the stacked-row primitive).
- **Tests to add:**
  - unit: `result.test.tsx` (no screening component uses the short or whole tone; stacked rows hold every column; the count sentence for 0, 1 and 2 anomalies)
  - e2e: `screening-phone.spec.ts` (new; it calls `e2e/screening.ts`, which #42 changes, so the PR merged second updates it; at 390 px every cell of the three tables is in view, no page scroll sideways)
  - axe: `/screening/results/[resultId]` at 1280 and 390 px
  - copy: the screening copy rules (no owed, underpaid or recovered)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 5. A refused download comes back to its form, never a JSON page

`co-001/ux-download-refusals`. After #42 merges: no. Visible change: yes. Size: M, about 180 lines.
- **Closes:** UX-010 (C-004).
- **Files:** `apps/web/src/lib/http/handler.ts`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/lib/routes/coverage.ts`, `apps/web/e2e/onboarding.spec.ts`, `apps/web/src/lib/http/route.ts`, `apps/web/src/lib/http/invoke.ts`, `apps/web/src/lib/http/download-refusal.test.ts` (new).
- **Depends on:** PR #49 changes `coverage/page.tsx` and `lib/routes/coverage.ts`: the one merged second keeps both.
- **Tests to add:**
  - unit: `download-refusal.test.ts` (new; `downloadHandler`'s tests in `http.test.ts` are a #42 file): a navigation refusal answers 303 to its form page, an API refusal as today
  - e2e: `onboarding.spec.ts` (a bad code on the fee-schedule letter returns to Coverage with the field marked)
  - axe: `/p/[practiceId]/coverage` in the refused state
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 6. Each sign-in step says how long it stays open, warns before it closes, and starts again with the email kept

`co-001/ux-sign-in-time`. After #42 merges: no. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-012 (C-007) (now: the limit that binds today (3 minutes), the warning, Start again and the email kept, from one constant (no Cognito change)); UX-128 (C-042) (the step marker on the invited path).
- **Files:** `apps/web/src/lib/auth/pending.ts`, `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/enroll/page.tsx`, `apps/web/src/app/sign-in/mfa/page.tsx`, `apps/web/src/app/sign-in/new-password/page.tsx`, `apps/web/src/components/step-timer.tsx` (new).
- **Depends on:** nothing.
- **Tests to add:**
  - unit: `step-timer.test.tsx` (the limit is one constant, the shorter of Cognito's 3 minutes and the pending cookie; the polite warning at one minute left)
  - e2e: `sign-in.spec.ts` (an expired step returns to `/sign-in` with the email filled; the email never in the URL)
  - axe: `/sign-in/enroll` and `/sign-in/mfa` with the warning shown
- **Leaves to Lane A or the founder:** The 15-minute Cognito session and the pending cookie (`infra/lib/constructs/identity.ts` and `infra/test/identity.test.ts`, #42 files) land together in UX PR 66. The warning uses today's `Alert`, which UX PR 14 later replaces. The security reviewer confirms the lengths at design.

#### UX PR 7. Forgot your password: a way back in from the sign-in page

`co-001/ux-sign-in-recovery`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-006 (C-005) (parts (1), (5) and (2)'s line: the password reset, the help line, and the lost-factor line on the code and key steps); UX-066 (C-075).
- **Files:** `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/app/sign-in/notice.tsx`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/components/hardware-key.tsx`, `apps/web/src/app/sign-in/mfa/page.tsx`, `apps/web/src/app/sign-in/hardware-key/page.tsx`, `apps/web/src/app/sign-in/forgot-password/page.tsx` (new), `apps/web/src/lib/auth/dev-store.ts`, `apps/web/src/lib/auth/provider.ts`, `apps/web/src/lib/auth/cognito-provider.ts`, `apps/web/src/lib/auth/dev-provider.ts`, `apps/web/src/lib/auth/sign-in.ts`.
- **Depends on:** UX PR 1 (`ux-forms`): the reset form keeps the email after a refusal.
- **Tests to add:**
  - unit: the reset route answers alike for a known and an unknown address, uses the `sign_in` bucket (`rate-limit.ts:39`) and records `password_reset_requested` and `password_reset_completed`
  - e2e: `sign-in.spec.ts` (a forgotten password is reset and the second factor is still asked)
  - axe: `/sign-in/forgot-password` and `/sign-in`
  - copy: `pnpm lint:copy`
- **Leaves to Lane A or the founder:** An ADR and the security reviewer at design. No IAM change: Cognito's `ForgotPassword` and `ConfirmForgotPassword` are public client calls.

#### UX PR 8. A person manages their own sign-in: password, authenticator and a second key, after signing in again

`co-001/ux-account-security`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-006 (C-005) (part (4): the Sign-in and security page, with its re-authentication step).
- **Files:** `apps/web/src/app/account/security/page.tsx` (new), `apps/web/src/lib/routes/account.ts`, `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/lib/auth/provider.ts`, `apps/web/src/lib/auth/cognito-provider.ts`, `apps/web/src/lib/auth/dev-provider.ts`, `apps/web/src/lib/auth/sign-in.ts`.
- **Depends on:** UX PR 7 (`ux-sign-in-recovery`: the provider calls it adds).
- **Tests to add:**
  - unit: each change needs a fresh re-authentication (the password and a code, through the provider) and uses that token for the change alone; the new methods in `cognito-provider.ts` and `dev-provider.ts`
  - e2e: `sign-in.spec.ts` (change the password, then sign in with it; a staff member adds a second key)
  - axe: `/account/security`
- **Leaves to Lane A or the founder:** The account menu's link to the new page (`shell.tsx`, a #42 file) lands in UX PR 67; until then `/account/devices` links to it. The console reset of a lost authenticator lands in UX PR 65, after #42. The Locked badge on Users and roles lands in UX PR 75. An ADR and the security reviewer at design.

#### UX PR 9. One actionable figure on the home and the ROI statement, and the Recovered tile names its period

`co-001/ux-home-figures`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-003 (C-009); UX-015 (C-048); UX-140 (C-183).
- **Files:** `packages/triage/src/actionable-sql.ts` (new), `packages/triage/src/index.ts`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/lib/triage/queries.ts`, `apps/worker/src/reconcile/statements.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/components/format.ts`.
- **Depends on:** after PR #51 merges (it changes the home page and the Payer approved note); PR #49 (open) also changes `packages/triage/src/index.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #50 (open) also changes `components/format.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/page.tsx`, `components/reconciliation/display.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: the home tile, Cases and the statement agree on one fixture (a db test); `counted()` on the tile
  - e2e: `reconciliation.spec.ts` (the home and the statement show the same actionable amount)
  - copy: `pnpm lint:copy` (every recovered carries its proof label)
  - unit: LED-11 passes unchanged
  - unit: the Recovered tile's period through one `quarter()` helper beside `utc()` in `components/format.ts`, so the date style changes in one place
- **Leaves to Lane A or the founder:** The payment-engine review, and the adversarial reviewer's check that `packages/ledger` is untouched: the change is in `statements.ts`'s query and `@tp/triage`. It lands before the first production deploy; if later, the statement page dates the change by `generated_at`. Lane A's PR 11 later refreshes the stored column; the live predicate stays the one definition.

#### UX PR 10. The payer's letter is uploaded inside 'Log a payer response', and its answer starts unchosen

`co-001/ux-payer-response`. After #42 merges: no. Visible change: yes. Size: M, about 320 lines.
- **Closes:** UX-035 (C-065); UX-007 (C-011).
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/lib/packets/submissions.ts`, `apps/web/src/lib/contracts/contract-queries.ts`, `apps/web/src/lib/routes/contracts.ts`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/e2e/packets.spec.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/lib/routes/triage.ts`.
- **Depends on:** after PR #51 merges (it changes all three pages); UX PR 1 (`ux-forms`); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/e2e/packets.spec.ts`, `app/p/[practiceId]/cases/[caseId]/page.tsx`, `lib/routes/triage.ts` (`LANES.md` rule 6); PR #52 (open) also changes `apps/web/e2e/packets.spec.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: a payer letter that a payer response links stays out of the tagging and abstraction lists, and a payer's terms letter stays in; the write-off route refuses Window passed while the window is open
  - e2e: `packets.spec.ts` (log a partial answer with its letter uploaded in the form; the typed fields survive the scan)
  - axe: `/p/[practiceId]/cases/[caseId]/submissions`
- **Leaves to Lane A or the founder:** Lane A: the same exclusion in `console_contract_queue()` (a SECURITY DEFINER function, so a migration). `uploader.tsx` changes here only to pass the kind; UX PRs 47, 48 and 49 build the uploader's behaviour on it.

#### UX PR 11. A packet waiting for someone shows on their home and on Cases

`co-001/ux-packet-queues`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-008 (C-012) (the home queues, the Cases filters and the Packet column).
- **Files:** `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/lib/cases/workbench.ts`.
- **Depends on:** after PR #51 merges (home page); PR #51 also changes `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit (db): each queue counts the right versions, excluding the drafter for approval
  - e2e: `packets.spec.ts` (the approver sees the waiting packet on the home and opens it)
  - axe: `/p/[practiceId]` and `/p/[practiceId]/cases` with the filters set
- **Leaves to Lane A or the founder:** Lane A: the notification kinds (approval requested, approved, export attested), which widen `notification_kind_check`; their display is in #42 files.

#### UX PR 12. The case says what was asked, what the payer accepted and what is left

`co-001/ux-case-summary`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-020 (C-124); UX-024 (C-084); UX-023 (C-082); UX-033 (C-092); UX-190 (C-166).
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/lib/cases/workbench.ts`, `apps/web/src/lib/packets/submissions.ts`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/components/triage/display.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`.
- **Depends on:** after PR #51 merges (case summary); after PR #52 merges (packet subtitle); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: the summary's figures come from code on a partial-answer fixture; a reopened case words its cause
  - e2e: `packets.spec.ts` (after a partial answer the case shows asked, accepted and not accepted)
  - copy: `pnpm lint:copy`
  - unit: the dispute figures come from one helper that Lane A's PR 13 can import
- **Leaves to Lane A or the founder:** Lane A: the case state vocabulary (audit #89, Lane A's PRs 8, 10 and 13) replaces 'Resolved' later. Lane A's PR 13 reuses this PR's dispute figures (asked, accepted, not accepted, from one helper in `lib/cases/workbench.ts`) on its Overview tab, with the stage labels it keeps (section 5).

#### UX PR 13. Ledger corrections list every shortfall and number entries per practice

`co-001/ux-ledger-corrections`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-039 (C-086); UX-019 (C-085); UX-078 (C-034) (the ledger's AdjustForm out of its cell); UX-162 (C-165).
- **Files:** `apps/web/src/lib/routes/specialist.ts`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/lib/reconciliation/queries.ts`, `apps/web/src/lib/routes/reconciliation-routes.db.test.ts`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Depends on:** after PR #51 merges (the ledger page, its queries and `shortfalls.ts`); PR #51 also changes `app/p/[practiceId]/abstraction/ledger/page.tsx`, `lib/reconciliation/queries.ts`, `lib/routes/reconciliation-routes.db.test.ts`, `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit (db): `reconciliation-routes.db.test.ts` (shortfalls past the 25th case line; per-practice entry numbers have no gaps)
  - e2e: the ledger page at 390 px
- **Leaves to Lane A or the founder:** The adversarial reviewer confirms the read side only: `approvalShortfalls` called unchanged, no `packages/ledger` change.

### 3.3 Shared pieces later PRs build on (UX PRs 14 to 33)

#### UX PR 14. One Notice with four kinds, told apart by surface, icon, words and role

`co-001/ux-notice`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-082 (C-021) (outside #42's files).
- **Files:** `packages/ui/src/components/alert.tsx`, `packages/ui/src/components/components.test.tsx`, `apps/web/src/components/action-form.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/regulations/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`.
- **Depends on:** UX PR 1 (`ux-forms`: ActionForm's refusal); PR #50 (open) also changes `components/action-form.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `components/packets/display.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `components.test.tsx` (each kind has its role: note, status, alert only for danger; no status colour)
  - e2e: `brand.spec.ts` baselines for the four kinds
  - axe: the routes whose notices change
- **Leaves to Lane A or the founder:** The screening page and `upload-form.tsx` (#42 files) take the Notice in UX PR 84. No warning hue: a new colour would be the brand owner's.

#### UX PR 15. A success notice shows once, from a flash bound to the write, never from the URL

`co-001/ux-notice-once`. After #42 merges: no. Visible change: yes. Size: M, about 250 lines.
- **Closes:** UX-013 (C-018) (outside #42's files).
- **Files:** `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/http/route.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx`, `apps/web/src/lib/routes/compliance.ts`, `apps/web/src/lib/routes/console-models.ts`, `apps/web/src/app/account/notifications/page.tsx`.
- **Depends on:** UX PR 14 (`ux-notice`); PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: the flash cookie is signed, HttpOnly, path-scoped, holds only a code and an opaque id, and lives seconds
  - e2e: `packets.spec.ts` (Back and refresh after Request approval show no stale notice)
  - axe: a page with its success notice shown
- **Leaves to Lane A or the founder:** The notices set in `lib/routes/settings.ts`, `console.ts` and `screening/routes.ts` and on the users page (#42 files) follow in UX PRs 75, 78, 83 and 85.

#### UX PR 16. Every field states the format it checks, and custom forms tie their errors to the field

`co-001/ux-field-hints`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-077 (C-039) (outside #42's files); UX-087 (C-036) (the packet reference search and the template sample); UX-090 (C-071).
- **Files:** `apps/web/src/components/field.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/monthly/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/support/page.tsx`, `apps/web/src/app/brand.css`, `apps/web/src/components/packets/reference-search.tsx`, `apps/web/src/app/p/[practiceId]/cases/by-reference/page.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`.
- **Depends on:** UX PR 1 (`ux-forms`); PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `field.test.tsx` (the hint is in `aria-describedby`, the error first)
  - axe: `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/reports/monthly`, `/support`, `/p/[practiceId]/cases/by-reference` refused
- **Leaves to Lane A or the founder:** The console support page's Ticket field (#42) lands in UX PR 74, the screening file field in UX PR 84.

#### UX PR 17. Every refusal says what to do, in words the role can act on

`co-001/ux-route-messages`. After #42 merges: no. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-050 (C-088) (outside #42's files); UX-064 (C-038).
- **Files:** `apps/web/src/lib/routes/reconciliation.ts`, `packages/contracts/src/services.ts`, `apps/web/src/lib/routes/pricing.ts`, `apps/web/src/lib/routes/roi.ts`, `apps/web/src/lib/routes/schemas.ts`, `packages/triage/src/cases.ts`, `apps/web/src/lib/routes/support.ts`, `apps/web/src/lib/routes/onboarding-routes.db.test.ts`.
- **Depends on:** UX PR 1 (`ux-forms`); PR #50 (changes `lib/routes/pricing.ts`).
- **Tests to add:**
  - unit: the Zod error map turns each default code into words; each route message named here has a test
  - unit (db): `onboarding-routes.db.test.ts` (an incident with no component ticked gets the route's own message)
  - copy: `pnpm lint:copy`
- **Leaves to Lane A or the founder:** The two messages in `lib/routes/settings.ts` (#42) land in UX PR 83.

#### UX PR 18. One figure tile for every headline, in the brand's type

`co-001/ux-stat-tile`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-104 (C-057); UX-114 (C-106) (outside #42's files); UX-165 (C-147).
- **Files:** `apps/web/src/components/brand/stat-tile.tsx` (new), `apps/web/src/components/reports/display.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/e2e/brand.spec.ts`, `apps/web/src/components/remittances/display.tsx`, `apps/web/src/components/reports/roi.tsx`, `apps/web/src/app/type-scale.test.ts`.
- **Depends on:** after PR #51 merges (reports display, reconciliation display, home, reconciliation page); PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/compare/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `components/reports/display.tsx`, `app/p/[practiceId]/page.tsx`, `components/reconciliation/display.tsx`, `app/p/[practiceId]/reconciliation/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `stat-tile.test.tsx` (a `<dl>` with label, value and note)
  - unit: `type-scale.test.ts` fails on `font-mono` beside `font-semibold` or `font-bold`
  - e2e: `brand.spec.ts` tile-row baseline at 1280 and 390 px
- **Leaves to Lane A or the founder:** The monitoring twin of the mono weight (`components/monitoring/display.tsx`, #42) lands in UX PR 81.

#### UX PR 19. Stored codes are shown in words, from one label module

`co-001/ux-labels`. After #42 merges: no. Visible change: yes. Size: M, about 260 lines.
- **Closes:** UX-100 (C-017) (outside #42's files); UX-166 (C-170) (the console page).
- **Files:** `apps/web/src/lib/copy/labels.ts` (new), `apps/web/src/lib/copy/words.ts`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/components/releases/note.tsx`, `apps/web/src/components/reports/display.tsx`, `apps/worker/src/report/html.ts`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/organizations/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/console/status/page.tsx`.
- **Depends on:** PRs #51 (reports display, report HTML) and #50 (releases page): the one merged second keeps both; PR #49 (open) also changes `worker/report/html.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/page.tsx`, `components/reports/display.tsx`, `worker/report/html.ts` (`LANES.md` rule 6); PR #52 (open) also changes `lib/copy/words.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `labels.test.ts` (every stored enum has a label; the fallback for an unmapped code)
  - copy: a render test that no listed page prints a raw enum
- **Leaves to Lane A or the founder:** The support-access, access-log and users pages (#42) take the labels in UX PRs 75, 76 and 77.

#### UX PR 20. A hash is shown whole, wraps evenly, and copies with one button

`co-001/ux-sha256`. After #42 merges: no. Visible change: yes. Size: M, about 250 lines.
- **Closes:** UX-075 (C-016); UX-128 (C-042) (the copy button only).
- **Files:** `apps/web/src/components/sha256.tsx` (new), `apps/web/src/components/packets/display.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/documents/[documentId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/packet-reviews/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/components/copy-button.tsx` (new), `apps/web/src/app/sign-in/enroll/page.tsx`.
- **Depends on:** PR #52 rewrites the packet trace cells: the one merged second keeps both; PR #49 (open) also changes `app/console/rule-releases/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 also changes `components/packets/display.tsx`, `app/p/[practiceId]/lines/[lineId]/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `sha256.test.tsx` (all 64 characters rendered, 16 to a line; the copy button's name)
  - e2e: an `atPhoneWidth` pass over `/p/[practiceId]/reports/roi/[statementId]` and `/p/[practiceId]/lines/[lineId]`
  - axe: those routes at 390 px
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 21. One chip for every state, and danger only for failures

`co-001/ux-status-chip`. After #42 merges: no. Visible change: yes. Size: M, about 260 lines.
- **Closes:** UX-018 (C-104); UX-106 (C-105) (outside #42's files).
- **Files:** `packages/ui/src/components/badge.tsx`, `apps/web/src/components/status.tsx`, `apps/web/src/app/status/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/components/contracts/display.tsx`.
- **Depends on:** PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: Badge `destructive` and StatusChip `danger` appear only for failures and refusals; Badge `secondary` or `outline` never beside a state
  - e2e: `brand.spec.ts` chip baselines
- **Leaves to Lane A or the founder:** The console support page (#42) takes the chip in UX PR 74.

#### UX PR 22. One page header: breadcrumb, title, lede and an actions slot

`co-001/ux-page-header`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-157 (C-192) (outside #42's files); UX-158 (C-144).
- **Files:** `apps/web/src/components/page-header.tsx` (new), `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/app/account/notifications/page.tsx`, `apps/web/src/app/settings/billing/page.tsx`, `apps/web/src/app/status/page.tsx`, `apps/web/src/app/maintenance/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/app/type-scale.test.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/app/console/practices/[practiceId]/page.tsx`.
- **Depends on:** PR #52 and the narrative-draft PR change the packet pages; PR #51 the submissions page: coordinate; PR #51 also changes `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `type-scale.test.ts` (a page's lede must be the PageHeader's)
  - e2e: `brand.spec.ts` header baseline at 1280 and 390 px
  - axe: the detail pages whose titles split
- **Leaves to Lane A or the founder:** Moving 'Help with this screen' out of the shell (`shell.tsx`, #42) lands in UX PR 69. The Verified seal (audit #46, queued) lands first; this PR moves it into the header's right slot.

#### UX PR 23. Busy buttons keep focus and say what is happening; destructive actions follow one rule

`co-001/ux-buttons`. After #42 merges: no. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-081 (C-022) (the hardware-key, packet, Stripe and pager buttons); UX-155 (C-196) (outside #42's files).
- **Files:** `packages/ui/src/components/button.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`, `apps/web/src/components/packets/version-form.tsx`, `apps/web/src/components/packets/export-status.tsx`, `apps/web/src/components/hardware-key.tsx`, `apps/web/src/components/billing/stripe-payment-method.tsx`, `apps/web/src/components/uploads/receipts.tsx`.
- **Depends on:** UX PR 1 (`ux-forms`); PR #52 and the narrative-draft PR (packet buttons).
- **Tests to add:**
  - unit: `button.test.tsx` (busy sets `aria-disabled`, ignores activation, keeps focus; the status line is polite)
  - unit: a test that removing access or a record, reversing one or writing money off takes `destructive`
- **Leaves to Lane A or the founder:** The console support page's End now (#42) lands in UX PR 74.

#### UX PR 24. Headings follow the page, and regions are named by their titles

`co-001/ux-headings-regions`. After #42 merges: no. Visible change: yes. Size: L, about 400 lines (a level prop, then many one-line call sites).
- **Closes:** UX-095 (C-040); UX-096 (C-070).
- **Files:** `packages/ui/src/components/card.tsx`, `packages/ui/src/states/empty-state.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/e2e/a11y.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/app/p/[practiceId]/packet-reviews/page.tsx`, `apps/web/src/app/p/[practiceId]/releases/page.tsx`, `apps/web/src/components/contracts/display.tsx`.
- **Depends on:** PRs #49, #50 and #51 (releases, coverage, reconciliation); PR #52 (packet and line pages): mark its new step titles there; PR #49 also changes `app/p/[practiceId]/coverage/page.tsx`, `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: a region card without a title is a type error; render test that `aria-labelledby` points at the title
  - axe: `heading-order` and `landmark-unique` on the changed routes (by rule id until audit #103 lands)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 25. Every table has headers, and each row's controls say which row they act on

`co-001/ux-row-headers`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-073 (C-028) (outside #42's files); UX-145 (C-145).
- **Files:** `apps/web/src/components/row-label.tsx` (new), `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/components/reports/documents.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/components/reports/roi.tsx`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/app/status/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/components/contracts/review.tsx`.
- **Depends on:** PRs #50 and #51 (run and reconciliation pages); PR #52 (packet schedule and line trace); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `components/pricing/diff.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/abstraction/ledger/page.tsx`, `app/p/[practiceId]/reconciliation/page.tsx` (`LANES.md` rule 6); PR #52 also changes `components/packets/display.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `row-label.test.tsx` (visible words first, so Label in Name holds)
  - axe: `empty-table-header` and `label-content-name-mismatch` by rule id on the changed routes
- **Leaves to Lane A or the founder:** The console support and users pages (#42) in UX PRs 74 and 75.

#### UX PR 26. Empty and filtered lists name the filter and the next step, with a link

`co-001/ux-empty-states`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-103 (C-033); UX-108 (C-032); UX-139 (C-179); UX-195 (C-180).
- **Files:** `apps/web/src/components/filter-bar.tsx` (new), `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/by-reference/page.tsx`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/components/coverage/share.tsx`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`.
- **Depends on:** PRs #50 (run page) and #51 (reconciliation page); PR #49 (Coverage); offer the Coverage and Mapping empty state to audit #32's design; PR #49 also changes `app/p/[practiceId]/coverage/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `app/p/[practiceId]/pricing-runs/page.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `filter-bar.test.tsx` (Clear filters shows only while a filter is set)
  - e2e: the filtered-empty shots of Cases, Anomalies and console tickets
  - copy: `pnpm lint:copy`
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 27. Pages that wait on a job refresh themselves and say when it is done

`co-001/ux-job-status`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-086 (C-031); UX-196 (C-186).
- **Files:** `apps/web/src/components/job-status.tsx` (new), `apps/web/src/components/packets/export-status.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/documents/[documentId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx`.
- **Depends on:** PR #50 (run and compare pages); audit #46 (`co-001/verified-seal`, the ROI statement page): coordinate the file; PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `app/p/[practiceId]/pricing-runs/compare/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `job-status.test.tsx` (polls every 5 s while queued, stops at ten minutes, announces the end)
  - e2e: `reports.spec.ts` (a queued report becomes ready with no reload)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 28. Loading states say what is loading, and are announced

`co-001/ux-loading-announce`. After #42 merges: no. Visible change: yes. Size: S, about 80 lines.
- **Closes:** UX-076 (C-014) (the label and the announcement).
- **Files:** `packages/ui/src/states/loading-state.tsx`, `packages/ui/src/states/states.test.tsx`.
- **Depends on:** nothing.
- **Tests to add:**
  - unit: `states.test.tsx` (the status region mounts empty and receives its label a tick later; `aria-busy` on main)
- **Leaves to Lane A or the founder:** The header-keeping frame and the missing loading files (through `shell.tsx`, #42) land in UX PR 72.

#### UX PR 29. One date style on every screen, and dates that never break mid-way

`co-001/ux-dates`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-027 (C-097) (the formatter and the date form (times stay labelled UTC)); UX-153 (C-146); UX-167 (C-181); UX-187 (C-207).
- **Files:** `apps/web/src/components/when.tsx` (new), `apps/web/src/components/format.ts`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/console/organizations/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/components/reports/documents.tsx`, `apps/web/src/app/p/[practiceId]/reports/monthly/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/documents/[documentId]/page.tsx`, `apps/web/src/lib/routes/monitoring.ts`, `apps/web/src/lib/routes/reports.ts`, `apps/web/src/lib/uploads/receipt-labels.ts`.
- **Depends on:** PR #50 (changes `components/format.ts`); PR #54 (merged; receipt labels); PR #51 (open) also changes `app/p/[practiceId]/abstraction/ledger/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `format.test.ts` (calendar dates as Oct 26, 2026; months as September 2026; quarters as Q4 2026 (Oct–Dec); ISO kept in CSV)
  - e2e: the monthly summary opens on the latest month with lines
  - copy: `pnpm lint:copy`
- **Leaves to Lane A or the founder:** Lane A's PR 12: the practice time zone setting and its definer setter; times switch to it when it exists.

#### UX PR 30. Counts agree with their nouns, and units print as people write them

`co-001/ux-counts-and-units`. After #42 merges: no. Visible change: yes. Size: M, about 260 lines.
- **Closes:** UX-115 (C-054) (outside #42's files); UX-138 (C-167).
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/regulations/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `tools/brand-copy/scan.ts`, `apps/web/src/lib/copy/words.ts`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/components/pricing/diff.tsx`.
- **Depends on:** after PR #52 merges (`words.ts`, packet pages); PR #51 (case page); PR #49 (open) also changes `app/console/rule-releases/page.tsx`, `tools/brand-copy/scan.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #50 (open) also changes `components/pricing/diff.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `components/packets/display.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: count-of-one cases in the display tests; the units formatter on numeric text (never a float)
  - copy: the plural-after-count rule in `tools/brand-copy`, with its `scan.test.ts` cases
- **Leaves to Lane A or the founder:** The notification plurals (`components/monitoring/display.tsx`, #42) in UX PR 81.

#### UX PR 31. The copy lint reads every file people read and holds the house rules

`co-001/ux-copy-lint`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines (most of it the lint and its tests).
- **Closes:** UX-101 (C-053); UX-129 (C-055); UX-168 (C-149) (outside #42's files).
- **Files:** `tools/brand-copy/scan.ts`, `tools/brand-copy/scan.test.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/screening/convert-form.tsx`, `packages/triage/src/cases.ts`, `packages/db/src/authz/permissions.ts`, `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/data/page.tsx`, `apps/web/src/lib/packets/view.ts`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`, `apps/web/src/components/contracts/display.tsx`, `apps/web/src/lib/contracts/display.ts`, `apps/web/src/app/console/compliance/page.tsx`, `packages/compliance/src/controls.ts`.
- **Depends on:** UX PR 30 (`ux-counts-and-units`: the plural rule); after PR #52 merges (packet page); PR #48 (open) also changes `packages/compliance/src/controls.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #49 (open) also changes `tools/brand-copy/scan.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `scan.test.ts` (each new rule fails and passes; the exemption comment works)
  - copy: `pnpm lint:copy` green on the whole tree
- **Leaves to Lane A or the founder:** The straight quotes in `shell.tsx` and the support-access page (#42) are exempted by name until UX PRs 68 and 76.

#### UX PR 32. The dark tokens' defects fixed, and native controls take the brand

`co-001/ux-dark-tokens`. After #42 merges: no. Visible change: yes. Size: S, about 120 lines.
- **Closes:** UX-117 (C-035); UX-160 (C-047) (the static check for palette primitives, with the sign-in layout exempted by name until the alias); UX-164 (C-079); UX-208 (C-197).
- **Files:** `packages/brand/src/tokens.css`, `apps/web/src/app/brand.css`, `apps/web/e2e/brand.spec.ts`, `tools/brand-colors/scan.ts`.
- **Depends on:** nothing.
- **Tests to add:**
  - e2e: `brand.spec.ts` (a print emulation in dark that prints light; checked boxes in Ink)
  - unit: a static check that component code uses no palette-primitive utility outside `packages/brand` (`sign-in/layout.tsx` exempted by name until the alias)
- **Leaves to Lane A or the founder:** The founder's dark-mode question (6.2): nothing here lets a user reach dark. The sign-in ground's alias token (`--pw-bg-sign-in`) is the brand owner's (F3) and lands with the Appearance setting in UX PR 91.

#### UX PR 33. Focus is never hidden under the header, targets are 24 px, and phones do not zoom

`co-001/ux-focus-touch`. After #42 merges: no. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-080 (C-015); UX-088 (C-041); UX-089 (C-045); UX-161 (C-164) (outside #42's files).
- **Files:** `apps/web/src/app/brand.css`, `apps/web/e2e/a11y.ts`, `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/reports/documents.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `packages/ui/src/components/input.tsx`, `packages/ui/src/index.ts`, `apps/web/src/components/field.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md`, `packages/ui/src/components/button.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`.
- **Depends on:** PR #51 (reconciliation page); PR #50 (open) also changes `components/pricing/diff.tsx`, `app/p/[practiceId]/pricing-runs/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `a11y.ts` `tabTo` asserts the focused element is below the header
  - axe: `target-size` by rule id on the changed routes
  - e2e: at 390 px every control computes 16 px
- **Leaves to Lane A or the founder:** The help summary's 44 px row (`shell.tsx`, #42) in UX PR 68. ADR 0056 gains the phone exception to its type scale as a dated '*Amended ...*' line, as ADR 0056:104 does, not an in-place rewrite.

### 3.4 By area, no #42 file (UX PRs 34 to 64)

#### UX PR 34. On a phone, record lists stack each row with its actions

`co-001/ux-phone-record-lists`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-078 (C-034) (the console record pages); UX-079 (C-043) (parts (b) and (c): the sticky naming cell and the stacked working lists).
- **Files:** `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/models/page.tsx`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/console/billing/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md` (a dated amendment).
- **Depends on:** UX PR 3 (`ux-table-scroll`: the stacked-row primitive).
- **Tests to add:**
  - e2e: an `atPhoneWidth` pass on each changed route (each row's action in view)
  - axe: those routes at 390 px
- **Leaves to Lane A or the founder:** The users and console support pages (#42) in UX PRs 74 and 75; the ledger's AdjustForm in UX PR 13. ADR 0056's chrome paragraph gains the stacking rule as a dated '*Amended ...*' line.

#### UX PR 35. Cases leads with the list; materiality is set in one place

`co-001/ux-cases-list-first`. After #42 merges: no. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-125 (C-063); UX-184 (C-198); UX-200 (C-168).
- **Files:** `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx`, `apps/web/src/components/packets/reference-search.tsx`.
- **Depends on:** PR #54 (merged; both materiality forms); UX PR 16 (`ux-field-hints`: the reference search).
- **Tests to add:**
  - e2e: `triage.spec.ts` (the home's deadline link lands on the list)
  - axe: `/p/[practiceId]/cases`
- **Leaves to Lane A or the founder:** Tell Lane A: Lane A's PR 13 (audit #125) keeps only the bulk case work.

#### UX PR 36. One name for the shortfall: 'Short (variance)', with its stage

`co-001/ux-short-one-name`. After #42 merges: no. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-014 (C-083) (outside #42's files).
- **Files:** `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/lib/copy/words.ts`, `tools/brand-copy/scan.ts`, `.claude/agents/ux-brand-reviewer.md` (after PR #55 merges).
- **Depends on:** after PRs #50, #51 and #52 merge (run, case, ledger and packet pages); PR #49 (open) also changes `components/pricing/display.tsx`, `tools/brand-copy/scan.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #50 also changes `components/pricing/display.tsx`, `app/p/[practiceId]/pricing-runs/page.tsx`, `app/p/[practiceId]/pricing-runs/[runId]/page.tsx` (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx` (`LANES.md` rule 6); PR #52 also changes `components/packets/display.tsx`, `lib/copy/words.ts` (`LANES.md` rule 6); PR #55 (open) also changes `.claude/agents/ux-brand-reviewer.md`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - copy: a `tools/brand-copy` rule for the retired exact labels ('Underpaid (validated)', 'Variance (Actionable)'), never the word 'variance'
  - unit: the display tests' column headers
  - e2e: `brand.spec.ts` keeps its header list (:362-374) unchanged
- **Leaves to Lane A or the founder:** The notification words (#42) in UX PR 81. The vocabulary goes in `lib/copy/words.ts` and the reviewer checklist, not `BRAND.md` (the brand owner's). Tell Lane A's PR 13: 'Short (insurer payment)' is reserved for D31's variance.

#### UX PR 37. Reconciliation leads with what is unmatched

`co-001/ux-reconciliation-order`. After #42 merges: no. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-173 (C-182); UX-186 (C-205).
- **Files:** `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`.
- **Depends on:** after PR #51 merges; PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/page.tsx`, `app/p/[practiceId]/abstraction/ledger/page.tsx`, `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `reconciliation.spec.ts` (the home queue's link lands on Unmatched)
  - copy: every recovered carries its proof label
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 38. A run says whether it was triaged, and Compare compares like with like

`co-001/ux-pricing-runs`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-029 (C-125); UX-030 (C-137); UX-036 (C-095); UX-084 (C-026) (the run and compare filters); UX-109 (C-046) (the run, document and release selects).
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/lib/routes/pricing.ts`, `apps/web/src/lib/pricing/queries.ts`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`.
- **Depends on:** after PR #50 merges (run states, `NotInEffectAlert`); PR #49 (open) also changes `components/pricing/display.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `lib/routes/pricing.ts`, `lib/pricing/queries.ts`, `app/p/[practiceId]/pricing-runs/page.tsx`, `components/pricing/display.tsx`, `components/pricing/diff.tsx`, `app/p/[practiceId]/pricing-runs/compare/page.tsx` (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `lib/pricing/queries.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `diff.test.tsx` (the three missing, unpriced and one-sided cases worded apart)
  - e2e: `pricing.spec.ts` (Compare defaults to a run of the same period; Triage this run)
  - axe: `/p/[practiceId]/pricing-runs/compare`
- **Leaves to Lane A or the founder:** Nothing. ADR 0039 (no automatic triage of a person's run) stands.

#### UX PR 39. A line names its case, and its basis is shown, not hovered

`co-001/ux-line-to-case`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-056 (C-126); UX-150 (C-156).
- **Files:** `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/lib/routes/remittances.ts`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`.
- **Depends on:** after PRs #52 (line page) and #50 (run page) merge; PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`, `lib/routes/remittances.ts` (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `viewer-phi.spec.ts` or `pricing.spec.ts` (from a line to its case and back)
  - axe: `/p/[practiceId]/claims`
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 40. Records and plans are named as their own pages name them

`co-001/ux-record-names`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-105 (C-099); UX-116 (C-101).
- **Files:** `apps/web/src/lib/triage/queries.ts`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/regulations/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `packages/packets/src/payer.ts`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/components/contracts/display.tsx`.
- **Depends on:** after PRs #49, #50 and #52 merge; PR #49 also changes `app/p/[practiceId]/coverage/page.tsx`, `components/pricing/display.tsx` (`LANES.md` rule 6); PR #50 also changes `components/pricing/display.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`, `packages/packets/src/payer.ts`, `components/packets/display.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `planName()` on screen equals the payer's copy; a render test that no listed page prints a bare UUID
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 41. Unpriced reasons, methods and 835 fields in plain words

`co-001/ux-codes-in-words`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-110 (C-051); UX-174 (C-184).
- **Files:** `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/lib/contracts/remedies.ts`, `packages/packets/src/explain.ts` (from PR #52), `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/uploads/[documentId]/page.tsx`.
- **Depends on:** after PRs #49, #50 and #52 merge; PR #54 (merged; receipt page); PR #49 also changes `components/pricing/display.tsx`, `app/p/[practiceId]/coverage/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `components/pricing/diff.tsx`, `components/pricing/display.tsx` (`LANES.md` rule 6); PR #52 also changes `lib/contracts/remedies.ts`, `packages/packets/src/explain.ts` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: every reason in `docs/product/unpriced-reasons.md` has a customer wording; the reference meaning unchanged
  - copy: a render test that no reason code reaches a billing manager's screen outside Coverage's reference table
- **Leaves to Lane A or the founder:** No content-pipeline change: the reference text stays word for word.

#### UX PR 42. Customers never read the product's internal names

`co-001/ux-internal-names`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-154 (C-141) (outside #42's files); UX-193 (C-176).
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/lib/packets/export-attempts.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`, `apps/web/src/lib/cases/timeline.ts`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/lib/screening/labels.ts`, `apps/web/src/components/screening/anomalies.tsx`.
- **Depends on:** after PRs #51 and #52 merge; PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/page.tsx`, `app/p/[practiceId]/pricing-runs/compare/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 also changes `app/p/[practiceId]/reconciliation/page.tsx`, `app/p/[practiceId]/page.tsx`, `components/reconciliation/display.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - copy: a `tools/brand-copy` rule for engine version strings, reconcile job and database in read text
- **Leaves to Lane A or the founder:** The screening's sentences (`lib/screening/messages.ts`, `routes.ts`, #42) in UX PR 85.

#### UX PR 43. Histories name who acted, truthfully

`co-001/ux-who-did-it`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-017 (C-098); UX-022 (C-056).
- **Files:** `apps/web/src/lib/copy/actor.ts` (new), `apps/web/src/lib/reports/queries.ts`, `apps/web/src/lib/reports/documents.ts`, `apps/web/src/lib/contracts/contract-queries.ts`, `apps/web/src/lib/contracts/mapping-queries.ts`, `apps/web/src/lib/remittances/queries.ts`, `apps/web/src/lib/reconciliation/queries.ts`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/lib/packets/review.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`.
- **Depends on:** after PRs #51 and #52 merge; PR #51 also changes `lib/reconciliation/queries.ts` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `lib/packets/review.ts`, `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit (db): `actorLabel()` for a member, a former member, PaidWhole staff under a grant and anyone else
  - e2e: `packets.spec.ts` (another reviewer reads who attested)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 44. The packet page says where the packet stands and what this person does next

`co-001/ux-packet-status`. After #42 merges: no. Visible change: yes. Size: L, about 350 lines.
- **Closes:** UX-063 (C-062); UX-069 (C-123).
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/lib/packets/queries.ts`, `apps/web/src/components/packets/version-form.tsx`.
- **Depends on:** after PR #52 and the narrative-draft PR merge; PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `lib/packets/queries.ts` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: the status strip from the regions' facts for each step and viewer
  - e2e: `packets.spec.ts` (the approver's one action is in the first screen at 1280 and 390 px)
  - axe: `/p/[practiceId]/cases/[caseId]/packet`
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 45. The packet's checks, lists and review say what to do

`co-001/ux-packet-words`. After #42 merges: no. Visible change: yes. Size: M, about 260 lines.
- **Closes:** UX-126 (C-078); UX-130 (C-093); UX-151 (C-158); UX-194 (C-177).
- **Files:** `apps/web/src/lib/packets/view.ts`, `apps/web/src/components/packets/version-form.tsx`, `apps/web/src/components/packets/narrative-editor.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/components/packets/countdown.tsx`, `apps/web/src/components/packets/download-watch.tsx` (new).
- **Depends on:** after PR #52 and the narrative-draft PR merge (its guarded refresh); PR #52 also changes `components/packets/display.tsx`, `app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: each live-check mismatch code has its sentence; the polite region announces only a change of verdict
  - e2e: `packets.spec.ts` (after both downloads the attestation is live with no reload)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 46. A hand-off that waits on another person shows where the work starts

`co-001/ux-waiting-on-someone`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-053 (C-131); UX-060 (C-132); UX-061 (C-133).
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/lib/packets/contact.ts`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/versions/[versionId]/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/app/support/page.tsx`.
- **Depends on:** UX PR 11 (`ux-packet-queues`); after PRs #51 and #52 merge; PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`, `app/p/[practiceId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit (db): the sign-off queue counts approved versions; the correspondence blocker counts held versions
  - e2e: `contracts.spec.ts` (a version waiting for sign-off shows on the home)
- **Leaves to Lane A or the founder:** Lane A: an in-app notice to administrators would widen `notification_kind_check`, with UX-008 (C-012)'s kinds.

#### UX PR 47. The uploader keeps chosen files, names them, and sizes in KB, MB and GB

`co-001/ux-uploader`. After #42 merges: no. Visible change: yes. Size: M, about 280 lines.
- **Closes:** UX-049 (C-037); UX-097 (C-072); UX-159 (C-148); UX-163 (C-178); UX-181 (C-185).
- **Files:** `apps/web/src/components/uploads/uploader.tsx`, `packages/ui/src/states/empty-state.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`, `apps/web/src/lib/uploads/receipt-labels.ts`, `apps/web/src/lib/uploads/limits.ts`, `apps/web/src/lib/routes/uploads.ts`, `apps/web/src/components/contracts/forms.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`.
- **Depends on:** PR #54 (merged; `receipt-labels.ts`).
- **Tests to add:**
  - unit: `uploader.test.tsx` (an ERA batch with no system keeps its files and starts on the choice)
  - e2e: `uploads.spec.ts` (an empty file is named by its file name, in the browser only)
  - axe: `/p/[practiceId]/uploads` (the file input is not a tab stop)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 48. Uploads takes every kind of document a practice sends

`co-001/ux-uploads-every-kind`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-062 (C-138); UX-197 (C-188).
- **Files:** `apps/web/src/app/p/[practiceId]/uploads/page.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/lib/routes/uploads.ts`, `apps/web/src/lib/uploads/limits.ts`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`.
- **Depends on:** UX PR 10 (`ux-payer-response`); UX PR 47 (`ux-uploader`); PR #51 (open) also changes `app/p/[practiceId]/reconciliation/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `uploads.spec.ts` (a contract and a posting export chosen from Uploads reach their intake)
  - axe: `/p/[practiceId]/uploads`
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 49. After an upload, the receipt says what it found and what happens next; a refresh loses nothing

`co-001/ux-upload-next`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-048 (C-077); UX-123 (C-127).
- **Files:** `apps/web/src/app/p/[practiceId]/uploads/[documentId]/page.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/lib/routes/uploads.ts`, `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`.
- **Depends on:** UX PR 47 (`ux-uploader`); PR #54 (merged); after the narrative-draft PR merges (its leave guard).
- **Tests to add:**
  - unit: the next-step block from loaded lines (code computes every figure)
  - e2e: `uploads.spec.ts` (a reload keeps the receipts page and the batch's state); `era-exports.spec.ts` (the mapper keeps its column indexes)
- **Leaves to Lane A or the founder:** Nothing. No header text from a customer's export reaches the URL.

#### UX PR 50. A validation request is traced from the cohort to Coverage and back

`co-001/ux-validation-request`. After #42 merges: no. Visible change: yes. Size: M, about 250 lines.
- **Closes:** UX-070 (C-139).
- **Files:** `apps/web/src/lib/routes/triage.ts`, `apps/web/src/lib/routes/coverage.ts`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`.
- **Depends on:** after PRs #49 and #51 merge; UX PR 15 (`ux-notice-once`); PR #49 also changes `lib/routes/coverage.ts`, `app/p/[practiceId]/coverage/page.tsx` (`LANES.md` rule 6); PR #51 also changes `lib/routes/triage.ts` (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `anomalies` journey (convert a cohort; Coverage shows the request and links back)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 51. Contract pages word a signed-off version, its calendar and its pages truthfully

`co-001/ux-contract-pages`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-025 (C-091); UX-028 (C-100); UX-113 (C-103) (outside #42's files); UX-192 (C-175).
- **Files:** `apps/web/src/components/contracts/review.tsx`, `apps/web/src/lib/contracts/display.ts`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/lib/contracts/contract-queries.ts`, `packages/contracts/src/calendar.ts`, `apps/web/src/components/contracts/display.tsx`, `apps/web/src/app/p/[practiceId]/digests/[digestId]/page.tsx`, `apps/web/src/lib/contracts/review.ts`, `apps/web/src/components/figures.tsx` (new), `apps/web/e2e/brand.spec.ts`.
- **Depends on:** nothing.
- **Tests to add:**
  - unit: the alert by version status; the calendar reads the version end at page time
  - e2e: `brand.spec.ts` (a dollar amount in a contract sentence computes Plex Mono)
  - axe: `/p/[practiceId]/contracts/[contractId]`
- **Leaves to Lane A or the founder:** The screening's messages (#42) in UX PR 85.

#### UX PR 52. Titles name the record, related controls are grouped, cited words are marked for every reader

`co-001/ux-a11y-names`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-144 (C-159); UX-146 (C-155); UX-148 (C-157).
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/versions/[versionId]/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx`, `apps/web/src/app/account/notifications/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/components/contracts/display.tsx`.
- **Depends on:** after PRs #51 and #52 merge; PR #51 also changes `app/p/[practiceId]/cases/[caseId]/page.tsx` (`LANES.md` rule 6); PR #52 also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `app/p/[practiceId]/lines/[lineId]/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: a title holding any field from the PHI list fails
  - axe: `/p/[practiceId]/settings/defaults`, `/account/notifications`, the cited page
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 53. Settings: one look for the section tabs, the agreements told apart, every request a link

`co-001/ux-settings-pages`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-026 (C-094) (the description lines on the home and settings pages (the names wait for audit #51)); UX-152 (C-153); UX-177 (C-140); UX-188 (C-208).
- **Files:** `apps/web/src/components/settings/nav.tsx`, `apps/web/src/app/p/[practiceId]/settings/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/correspondence/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Depends on:** PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `brand.spec.ts` settings tabs at 1280 and 390 px
  - axe: the settings routes
- **Leaves to Lane A or the founder:** The chain label in `lib/routes/settings.ts` (#42) in UX PR 83.

#### UX PR 54. Read-only roles see what is set and who sets it, not the doer's instructions

`co-001/ux-read-only-cards`. After #42 merges: no. Visible change: yes. Size: M, about 250 lines.
- **Closes:** UX-107 (C-130) (outside #42's files).
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/correspondence/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/proof-level/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `packages/contracts/src/location.ts`.
- **Depends on:** PR #50 (open) also changes `app/p/[practiceId]/pricing-runs/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `viewer-phi.spec.ts` (a viewer reads no imperative card)
  - copy: `pnpm lint:copy`
- **Leaves to Lane A or the founder:** The proof-level sentence in `lib/routes/settings.ts` (#42) in UX PR 83.

#### UX PR 55. The ROI statement states only what it measures

`co-001/ux-roi-words`. After #42 merges: no. Visible change: yes. Size: S, about 100 lines.
- **Closes:** UX-032 (C-087); UX-175 (C-187).
- **Files:** `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/worker/src/reconcile/statement-html.ts`, `apps/worker/src/reconcile/statements.ts`, `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`.
- **Depends on:** audit #46 (`co-001/verified-seal`, queued): land with or after it.
- **Tests to add:**
  - unit: pursuit hours print only for a statement generated after the time log's release (a dated constant in code), so a stored 0.00 before it reads 'not tracked'
  - e2e: `reports.spec.ts`
- **Leaves to Lane A or the founder:** The 15b session checks that the stored statement's recompute does not expect the printed hours. The payment-engine review confirms that nothing in `statements.ts` changes what recovered computes.

#### UX PR 56. Rule release pages say what this server does and mark the release shown

`co-001/ux-release-pages`. After #42 merges: no. Visible change: yes. Size: S, about 120 lines.
- **Closes:** UX-065 (C-060); UX-149 (C-143).
- **Files:** `apps/web/src/app/console/rule-releases/page.tsx`, `apps/web/src/app/p/[practiceId]/releases/page.tsx`.
- **Depends on:** after PRs #49 and #50 merge; PR #49 also changes `app/console/rule-releases/page.tsx`, `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6); PR #50 also changes `app/p/[practiceId]/releases/page.tsx` (`LANES.md` rule 6).
- **Tests to add:**
  - axe: `/console/rule-releases` and `/p/[practiceId]/releases`
- **Leaves to Lane A or the founder:** No content-pipeline change.

#### UX PR 57. Console pages: the location result, the members table, billing status and model flags read right

`co-001/ux-console-records`. After #42 merges: no. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-034 (C-111); UX-038 (C-059); UX-057 (C-052) (the practice's sentence in `location.ts`); UX-099 (C-044); UX-142 (C-189); UX-202 (C-190); UX-204 (C-200).
- **Files:** `apps/web/src/app/console/practices/[practiceId]/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/pricing/location.ts`, `eslint.config.js`, `apps/web/src/app/console/billing/page.tsx`, `apps/web/src/lib/routes/billing.ts`, `apps/web/src/app/console/models/page.tsx`, `apps/web/src/lib/routes/console-models.ts`, `packages/contracts/src/location.ts`.
- **Depends on:** PR #54 (merged; console practice and models pages).
- **Tests to add:**
  - unit: the `no-restricted-syntax` rule refuses a flex `td`; the flag form needs a choice
  - e2e: `models.spec.ts` (a budget is set in dollars and named in the notice)
  - axe: the four console routes
- **Leaves to Lane A or the founder:** The screening's two ZIP sentences are the founder's (6.2).

#### UX PR 58. The SOC 2 page lists its actions, and its evidence reads as words

`co-001/ux-soc2-todo`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-068 (C-112); UX-127 (C-113).
- **Files:** `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/compliance/actions.ts`, `apps/web/src/lib/routes/compliance.ts`, `packages/compliance/src/controls.ts`.
- **Depends on:** PR #48 (open) also changes `packages/compliance/src/controls.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: every evidence item has its shown words; the to-do list counts each action
  - axe: `/console/compliance`
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 59. Maintenance is a state a person can wait through, and comes back to the page

`co-001/ux-maintenance`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-047 (C-122) (non42 and no migration: the return path, the in-place refusal, the check and the component status); UX-198 (C-191).
- **Files:** `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/maintenance/page.tsx`, `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/routes/support.ts`, `apps/web/src/app/status/page.tsx`.
- **Depends on:** UX PR 1 (`ux-forms`); PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: `monitoring.spec.ts` or a new maintenance journey (a form sent during maintenance keeps its text and returns)
- **Leaves to Lane A or the founder:** Lane A: the stored expected end and message.

#### UX PR 60. Revoking a device confirms first; staff are told why no digest comes

`co-001/ux-account-pages`. After #42 merges: no. Visible change: yes. Size: S, about 120 lines.
- **Closes:** UX-143 (C-162) (the confirmation and the order); UX-179 (C-163) (the staff wording).
- **Files:** `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/lib/routes/account.ts`, `apps/web/src/app/account/notifications/page.tsx`.
- **Depends on:** nothing.
- **Tests to add:**
  - e2e: the devices page (Revoke asks first and names the device)
  - axe: `/account/devices`, `/account/notifications`
- **Leaves to Lane A or the founder:** Lane A: a person-given device name (a column), and per-practice notification choices (widening `user_settings_valid`).

#### UX PR 61. One public frame: header, width and footer

`co-001/ux-public-frame`. After #42 merges: no. Visible change: yes. Size: M, about 260 lines.
- **Closes:** UX-156 (C-142) (outside #42's files).
- **Files:** `apps/web/src/components/public-header.tsx`, `apps/web/src/components/public-layout.tsx` (new), `apps/web/src/app/request-audit/page.tsx`, `apps/web/src/components/screening/result-view.tsx`, `apps/web/src/app/status/page.tsx`, `apps/web/src/app/security/page.tsx`, `apps/web/src/app/maintenance/page.tsx`.
- **Depends on:** nothing.
- **Tests to add:**
  - e2e: `brand.spec.ts` public header and footer baselines
  - axe: `/request-audit`, `/status`, `/security`, `/maintenance`
- **Leaves to Lane A or the founder:** The screening page (#42) in UX PR 84.

#### UX PR 62. A missing record is shown inside the app, with the way back

`co-001/ux-not-found`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-172 (C-174); UX-178 (C-152).
- **Files:** `apps/web/src/app/not-found.tsx`, `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/http/invoke.ts`.
- **Depends on:** PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: an unknown case id renders inside the frame with Back to Cases; an unknown practice still renders the root page
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 63. The screening result leads with its answer and its next step

`co-001/ux-screening-result-first`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-044 (C-120); UX-134 (C-115) (the reorder and the summary (no redirect anchor)); UX-136 (C-121) (the non-legal sentences, in place (the kept paragraph does not move: F4)); UX-185 (C-201).
- **Files:** `apps/web/src/components/screening/convert-form.tsx`, `apps/web/src/app/request-audit/page.tsx`, `apps/web/src/components/screening/result-view.tsx`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/app/screening/results/[resultId]/not-found.tsx`.
- **Depends on:** UX PR 4 (`ux-screening-result-tables`).
- **Tests to add:**
  - unit: `result.test.tsx` (the three summary lines from the page's own figures)
  - unit: `legal-surfaces.test.ts` stays green (the kept spans keep their markers and words)
  - copy: the screening copy rules
- **Leaves to Lane A or the founder:** The redirect's anchor (`lib/screening/routes.ts`, #42) in UX PR 85; the kept notices' shape and the closed link's order are the founder's (F4, 6.2), applied in UX PR 89.

#### UX PR 64. Sign-in steps say what went wrong on the step itself

`co-001/ux-sign-in-words`. After #42 merges: no. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-054 (C-030); UX-098 (C-074); UX-170 (C-160); UX-180 (C-171); UX-189 (C-161).
- **Files:** `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/lib/http/next.ts`, `apps/web/src/components/action-form.tsx`, `apps/web/src/app/sign-in/new-password/page.tsx`, `apps/web/src/app/sign-in/mfa/page.tsx`, `apps/web/src/app/sign-in/enroll/page.tsx`, `apps/web/src/lib/routes/schemas.ts`, `apps/web/e2e/sign-in.spec.ts`, `apps/web/src/components/field.tsx`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/components/hardware-key.tsx`, `apps/web/src/app/sign-in/hardware-key/page.tsx`, `apps/web/src/app/sign-in/notice.tsx`.
- **Depends on:** UX PR 1 (`ux-forms`); UX PR 7 (`ux-sign-in-recovery`); PR #50 (open) also changes `lib/http/next.ts`, `components/action-form.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `sixDigitCode` accepts a pasted code with spaces; no step's words say whether an account exists
  - e2e: `sign-in.spec.ts` (paste a spaced code; Show password; staff sign-in after registering a key)
  - axe: the six sign-in routes in their refused states
- **Leaves to Lane A or the founder:** Nothing.

### 3.5 After #42 merges (UX PRs 65 to 86)

#### UX PR 65. A platform administrator resets a lost authenticator from the console

`co-001/ux-second-factor-reset`. After #42 merges: yes. Visible change: yes. Size: M, about 250 lines.
- **Closes:** UX-006 (C-005) (part (2)'s console reset, its IAM grant and its email).
- **Files:** `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/routes/console.ts`, `infra/lib/constructs/application-role.ts`, `infra/test/application-role.test.ts`, `apps/web/src/lib/auth/provider.ts`, `apps/web/src/lib/auth/cognito-provider.ts`, `apps/web/src/lib/auth/dev-provider.ts`.
- **Depends on:** after #42 merges; UX PR 8 (`ux-account-security`: the second key a staff member recovers with).
- **Tests to add:**
  - unit: the reset needs a platform administrator with a hardware-key session, sets `user.mfa_enrolled` false, ends the sessions and writes the audit event
  - infra: `application-role.test.ts` (the one new action, `cognito-idp:AdminSetUserMFAPreference`, on the role the security reviewer chose)
  - e2e: `sign-in.spec.ts` (after a reset the person enrols again at the next sign-in)
- **Leaves to Lane A or the founder:** The security reviewer at design: which role holds `AdminSetUserMFAPreference` (recommended: a worker job's, not the internet-facing web task's; 6.1 names the trade-off). A lost hardware key has no administrator path (Cognito passkeys): a second key, or a re-invitation.

#### UX PR 66. The sign-in steps stay open 15 minutes, Cognito's maximum

`co-001/ux-sign-in-session`. After #42 merges: yes. Visible change: yes. Size: S, about 60 lines.
- **Closes:** UX-012 (C-007) (Cognito's 15-minute session and the pending cookie, together).
- **Files:** `infra/lib/constructs/identity.ts`, `infra/test/identity.test.ts`, `apps/web/src/lib/auth/pending.ts`.
- **Depends on:** after #42 merges; UX PR 6 (`ux-sign-in-time`: the one constant and the warning).
- **Tests to add:**
  - infra: `identity.test.ts` (authSession 15 minutes; it pins 3 at :109 today)
  - unit: the pending cookie and the stated limit read one constant: 15 minutes, 5 on the code step
- **Leaves to Lane A or the founder:** The security reviewer at design: fifteen minutes is the less strict setting, taken for WCAG 2.2.1 (6.1 names the trade-off). What 2.2.1 still leaves unmet under Cognito's cap goes to audit #103's manual checks.

#### UX PR 67. The header menus close as people expect, and name the practice and the account

`co-001/ux-header-menus`. After #42 merges: yes. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-006 (C-005) (the account menu's Sign-in and security link); UX-021 (C-027); UX-093 (C-023); UX-094 (C-024); UX-147 (C-154).
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/components/disclosure.tsx` (new), `apps/web/e2e/a11y.ts`, `apps/web/src/app/brand.css`, `apps/web/e2e/brand.spec.ts`.
- **Depends on:** after #42 merges; UX PR 8 (`ux-account-security`).
- **Tests to add:**
  - e2e: Escape and a tap outside close each panel and return focus; at 390 px the practice's full name is in view
  - axe: each header panel open, by rule id `label-content-name-mismatch`
  - brand: regenerate and inspect `header-390` (and `header-1280` if the switcher's text moves) under ADR 0058:225-228, committed in this PR
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 68. A skip link, a rail grouped by job, and the current item marked by more than brass

`co-001/ux-skip-and-rail`. After #42 merges: yes. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-083 (C-025); UX-084 (C-026) (the rail); UX-112 (C-069); UX-161 (C-164) (the help summary); UX-168 (C-149) (the strings in `shell.tsx`); UX-169 (C-150).
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/components/public-header.tsx`, `apps/web/src/app/sign-in/layout.tsx`, `apps/web/e2e/a11y.ts`, `apps/web/src/lib/http/route.ts`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/components/help.ts`.
- **Depends on:** after #42 merges; UX PR 67 (`ux-header-menus`).
- **Tests to add:**
  - e2e: the first Tab reaches the skip link and Enter moves into main
  - e2e: specs that find rail links by name updated
  - brand: `brand.spec.ts` rail baseline
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 69. The practice stays chosen off its pages, and each page's help is its own

`co-001/ux-shell-context`. After #42 merges: yes. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-102 (C-066); UX-111 (C-068); UX-157 (C-192) (the help link's move into the page header).
- **Files:** `apps/web/src/proxy.ts`, `apps/web/src/lib/http/invoke.ts`, `apps/web/src/lib/http/next.ts`, `apps/web/src/components/shell.tsx`, `apps/web/src/app/support/page.tsx`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/components/help.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`.
- **Depends on:** after #42 merges; UX PR 22 (`ux-page-header`); PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: the kept practice is used only if the actor still reaches it
  - e2e: from a practice to Support and back, the rail keeps the practice
- **Leaves to Lane A or the founder:** Nothing. The cookie holds an opaque id only.

#### UX PR 70. The organization's administrator gets an Organization area; 'Billing' is renamed Subscription

`co-001/ux-organization-area`. After #42 merges: yes. Visible change: yes. Size: M, about 260 lines.
- **Closes:** UX-120 (C-067); UX-121 (C-090).
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/lib/http/route.ts`, `apps/web/src/lib/http/invoke.ts`, `apps/web/src/app/settings/billing/page.tsx`, `apps/web/src/lib/routes/billing.ts`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/components/settings/nav.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`.
- **Depends on:** after #42 merges.
- **Tests to add:**
  - e2e: `billing.spec.ts` (the administrator reaches users and the subscription from the rail; a billing manager sees no Subscription link)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 71. A refused page has its own title, words for the role, and a link to the next step

`co-001/ux-forbidden`. After #42 merges: yes. Visible change: yes. Size: L, about 380 lines (65 callers pass a title).
- **Closes:** UX-051 (C-020); UX-092 (C-019).
- **Files:** `apps/web/src/components/shell.tsx`, `packages/ui/src/states/permission-state.tsx`, `packages/ui/src/states/states.test.tsx`, `apps/web/src/app/error.tsx`, `apps/web/src/app/**/page.tsx` (the 65 callers of Forbidden), `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/components/format.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/digests/[digestId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`.
- **Depends on:** after #42 merges; PR #49 (open) also changes `app/console/rule-releases/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #50 (open) also changes `components/format.ts`: the one merged second keeps both (`LANES.md` rule 6); PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit: `states.test.tsx` (the title as h1, the action link)
  - axe: the permission state of five routes, `page-has-heading-one` by rule id
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 72. Loading keeps the header and Menu, and every screen has its loading state

`co-001/ux-loading-frame`. After #42 merges: yes. Visible change: yes. Size: M, about 250 lines.
- **Closes:** UX-076 (C-014) (the frame and the missing loading files).
- **Files:** `apps/web/src/components/loading-frame.tsx` (new), `apps/web/src/components/shell.tsx`, `apps/web/src/app/p/[practiceId]/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/settings/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/uploads/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/error.tsx` (new), `apps/web/src/app/**/loading.tsx` (40 files).
- **Depends on:** after #42 merges; UX PR 28 (`ux-loading-announce`).
- **Tests to add:**
  - e2e: the held-loading shots show the header and Menu
  - axe: three loading states
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 73. `/console` is every internal role's home: what needs a person now

`co-001/ux-console-home`. After #42 merges: yes. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-052 (C-108); UX-182 (C-193).
- **Files:** `apps/web/src/app/console/page.tsx` (new), `apps/web/src/lib/routes/console.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/components/shell.tsx`, `apps/web/src/components/help.ts`, `apps/web/src/app/console/organizations/page.tsx`.
- **Depends on:** after #42 merges.
- **Tests to add:**
  - e2e: each internal persona lands on `/console` with its counts linked
  - axe: `/console`
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 74. Console support grants: open ones first, the ticket chosen, End now confirmed

`co-001/ux-console-support-page`. After #42 merges: yes. Visible change: yes. Size: M, about 280 lines.
- **Closes:** UX-011 (C-002) (the console support page); UX-055 (C-110) (the open grants first, the default view and the ticket as a choice); UX-073 (C-028) (the console support page); UX-077 (C-039) (the Ticket field); UX-078 (C-034) (the console support page); UX-106 (C-105) (the console support page); UX-155 (C-196) (End now).
- **Files:** `apps/web/src/app/console/support/page.tsx`, `apps/web/src/lib/routes/console.ts`.
- **Depends on:** after #42 merges; UX PRs 3, 16, 21, 23, 25 and 34 (the shared pieces this page takes).
- **Tests to add:**
  - e2e: the support-grant journey
  - axe: `/console/support` at 1280 and 390 px
- **Leaves to Lane A or the founder:** Lane A: the pending grant request and its decision (a table or a ticket state).

#### UX PR 75. Users and roles: the refusal points the right way, two-step verification named, rows stack

`co-001/ux-users-page`. After #42 merges: yes. Visible change: yes. Size: M, about 280 lines.
- **Closes:** UX-006 (C-005) (part (3): the Locked badge with 'Ask PaidWhole support to unlock'); UX-011 (C-002) (the users page); UX-013 (C-018) (the users page); UX-067 (C-089); UX-073 (C-028) (the users page); UX-078 (C-034) (the users page); UX-100 (C-017) (the users page); UX-166 (C-170) (the users page).
- **Files:** `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`.
- **Depends on:** after #42 merges; UX PRs 3, 15, 19, 25 and 34.
- **Tests to add:**
  - e2e: `onboarding.spec.ts` (an invite refusal links to Help and support)
  - axe: the users page at 1280 and 390 px
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 76. A support grant names its holder, can be ended by the practice, and its reads are grouped

`co-001/ux-support-access`. After #42 merges: yes. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-011 (C-002) (the support-access page); UX-072 (C-136) (the holder, the empty states and the request to end); UX-100 (C-017) (the support-access page); UX-133 (C-064); UX-168 (C-149) (the support-access strings); UX-199 (C-151).
- **Files:** `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/lib/routes/practice.ts`.
- **Depends on:** after #42 merges; UX PRs 3 and 19.
- **Tests to add:**
  - e2e: the support-grant journey from the practice side
  - axe: the support-access page at 390 px
- **Leaves to Lane A or the founder:** Lane A: `end_support_grant()`'s actor check widened to a new practice permission (a SECURITY DEFINER change); until then the page offers the request to end.

#### UX PR 77. The access log pages both ways, names the record it filters by, and links from records

`co-001/ux-access-log`. After #42 merges: yes. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-071 (C-134) (the Newer and Newest links, the page shown and the Who read this links); UX-100 (C-017) (the access-log page); UX-137 (C-135).
- **Files:** `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`.
- **Depends on:** after #42 merges; `LANES.md` queue item 8 (audit #49, the access log's later pages): one PR; PR #51 (open) also changes `app/p/[practiceId]/cases/[caseId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6); PR #52 (open) also changes `app/p/[practiceId]/lines/[lineId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit (db): the record labeller reads under RLS and never returns PHI
  - e2e: from a case to Who read this
- **Leaves to Lane A or the founder:** Lane A: the person, route, action, kind and date filters, and the claim-number lookup (widening `practice_access_log()`).

#### UX PR 78. The console's widest actions ask for a tick that states the consequence

`co-001/ux-console-confirm`. After #42 merges: yes. Visible change: yes. Size: M, about 320 lines.
- **Closes:** UX-013 (C-018) (the console notices in `lib/routes/console.ts`); UX-046 (C-058).
- **Files:** `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/console/models/page.tsx`, `apps/web/src/components/screening/split-form.tsx`, `apps/web/src/app/console/billing/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/lib/routes/console.ts`, `apps/web/src/lib/routes/billing.ts`, `apps/web/src/lib/routes/support.ts`, `apps/web/src/lib/routes/console-models.ts`, `apps/web/src/lib/screening/routes.ts`.
- **Depends on:** after #42 merges; PR #54 (merged); UX PR 15 (`ux-notice-once`).
- **Tests to add:**
  - unit (db): each route refuses without `confirm`
  - e2e: suspend, invoice and maintenance each ask first
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 79. The console's organization page leads with its records

`co-001/ux-console-org-page`. After #42 merges: yes. Visible change: yes. Size: M, about 300 lines.
- **Closes:** UX-203 (C-199).
- **Files:** `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/routes/console.ts`.
- **Depends on:** after #42 merges; UX PRs 57 and 78.
- **Tests to add:**
  - e2e: the organization page at 1280 and 390 px
  - axe: `/console/organizations/[organizationId]`
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 80. The support form names the page it came from, and the desk sees each ticket's age

`co-001/ux-support-tickets`. After #42 merges: yes. Visible change: yes. Size: M, about 220 lines.
- **Closes:** UX-058 (C-109) (the page shown on the form, and the age); UX-171 (C-172); UX-191 (C-173).
- **Files:** `apps/web/src/lib/routes/support.ts`, `apps/web/src/components/shell.tsx`, `apps/web/src/app/support/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`.
- **Depends on:** after #42 merges.
- **Tests to add:**
  - unit: the help link carries a path with opaque ids only, checked against the route registry
- **Leaves to Lane A or the founder:** Lane A: a checked `page_path` column so the desk sees the page, and ticket replies and the thread (a table with `practice_id` and forced RLS), after #42's mail streams.

#### UX PR 81. Notifications: magnitudes in words, counts that agree, and the shortfall in one name

`co-001/ux-notification-words`. After #42 merges: yes. Visible change: yes. Size: S, about 120 lines.
- **Closes:** UX-014 (C-083) (the notifications); UX-031 (C-081); UX-114 (C-106) (the monitoring twin); UX-115 (C-054) (the notifications).
- **Files:** `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/components/monitoring/display.test.tsx` (from #42).
- **Depends on:** after #42 merges; UX PRs 18, 30 and 36.
- **Tests to add:**
  - unit: `display.test.tsx` (a recoupment notification never contains '-$'; count-of-one)
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 82. The practice home leads with each role's own work

`co-001/ux-home-by-role`. After #42 merges: yes. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-119 (C-129); UX-141 (C-206).
- **Files:** `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/routes/practice.ts`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/app/p/[practiceId]/settings/page.tsx`, `apps/web/src/lib/routes/settings.ts`, `apps/web/src/components/settings/getting-started.tsx` (new).
- **Depends on:** after #42 merges; UX PRs 9, 11 and 46; PR #51 (open) also changes `app/p/[practiceId]/page.tsx`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - e2e: the home for a billing manager, an administrator and a viewer
  - axe: `/p/[practiceId]` for three roles
- **Leaves to Lane A or the founder:** Nothing. The combined administrator-and-biller role is audit #90 (Lane A's PR 14).

#### UX PR 83. Settings routes: proof level in short sentences, the chain's agreements told apart, messages with a next step

`co-001/ux-settings-words`. After #42 merges: yes. Visible change: yes. Size: M, about 200 lines.
- **Closes:** UX-013 (C-018) (the notices set in `lib/routes/settings.ts`); UX-026 (C-094) (the chain's description line); UX-050 (C-088) (the two messages in `settings.ts`); UX-107 (C-130) (the proof-level sentence); UX-109 (C-046) (the proof-level choice as two radios); UX-201 (C-169).
- **Files:** `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/p/[practiceId]/settings/proof-level/page.tsx`.
- **Depends on:** after #42 merges; UX PRs 17, 53 and 54.
- **Tests to add:**
  - unit: the proof-level words from the current level; `counted()` names both stages
  - copy: every recovered carries its proof label
- **Leaves to Lane A or the founder:** Nothing.

#### UX PR 84. The screening page runs in the order of the task, and its file is chosen and sent

`co-001/ux-screening-upload-page`. After #42 merges: yes. Visible change: yes. Size: L, about 380 lines.
- **Closes:** UX-041 (C-117) (all but the kept texts); UX-082 (C-021) (the screening page and the upload form); UX-087 (C-036) (the screening file field); UX-135 (C-116); UX-156 (C-142) (the screening page); UX-207 (C-204).
- **Files:** `apps/web/src/app/screening/page.tsx`, `apps/web/src/components/screening/upload-form.tsx`, `apps/web/src/lib/screening/sent.ts`, `apps/web/src/lib/screening/messages.ts`, `apps/web/src/lib/screening/routes.ts`.
- **Depends on:** after #42 merges; UX PRs 14, 16 and 61.
- **Tests to add:**
  - e2e: `screening.spec.ts` (the outline first; the file field marked on a refusal)
  - unit: `legal-surfaces.test.ts` green
  - copy: the screening copy rules
- **Leaves to Lane A or the founder:** The kept notices' shape (UX-122 (C-102)) and their "from your upload" are the founder's (6.2).

#### UX PR 85. The screening's messages: one left-out sentence, the result's anchor, figures in mono

`co-001/ux-screening-messages`. After #42 merges: yes. Visible change: yes. Size: M, about 250 lines.
- **Closes:** UX-013 (C-018) (the screening notices); UX-057 (C-052) (the screening's ZIP sentences (:710 taken; :700 and :701 by the founder's answer)); UX-079 (C-043) (the screening template's stacked reference); UX-113 (C-103) (the screening messages); UX-134 (C-115) (the redirect's anchor); UX-154 (C-141) (the screening sentences); UX-205 (C-202) (the left-out sentence, by the founder's answer (F5)).
- **Files:** `apps/web/src/lib/screening/messages.ts`, `apps/web/src/lib/screening/routes.ts`, `apps/web/src/components/screening/anomalies.tsx`, `apps/web/src/app/screening/page.tsx`.
- **Depends on:** after #42 merges; UX PR 84; the founder's answer on the ZIP sentences; the founder's answer on the left-out sentence (F5).
- **Tests to add:**
  - unit: `messages.test.ts`
  - e2e: `screening.spec.ts` (the request confirmation is in view after sending)
  - copy: the screening copy rules
- **Leaves to Lane A or the founder:** The founder: the screening's two ZIP sentences (:700, :701) and the left-out sentence, held for counsel (F5).

#### UX PR 86. Enrolment shows a QR code

`co-001/ux-enrol-qr`. After #42 merges: yes. Visible change: yes. Size: S, about 100 lines.
- **Closes:** UX-128 (C-042) (the QR code and its dependency).
- **Files:** `apps/web/src/app/sign-in/enroll/page.tsx`, `apps/web/src/app/sign-in/new-password/page.tsx`, `apps/web/package.json`, `pnpm-lock.yaml`.
- **Depends on:** after #42 merges; UX PR 20 (`ux-sha256`: the copy button); ci-deps' licence and age checks for the QR library (PR #48); PR #48 also changes `pnpm-lock.yaml` (`LANES.md` rule 6).
- **Tests to add:**
  - unit: the QR SVG is server-rendered, under the CSP, the secret never logged
- **Leaves to Lane A or the founder:** Nothing.

### 3.6 After Lane A or the founder (UX PRs 87 to 91)

#### UX PR 87. The terms page shows the terms

`co-001/ux-terms-text`. After #42 merges: no. Visible change: yes. Size: M, about 250 lines.
- **Waits on:** Lane A.
- **Closes:** UX-009 (C-006) (the render, what changed, and the return to the page the gate came from); UX-026 (C-094) (the two agreements' names, from audit #51's titles).
- **Files:** `apps/web/src/app/terms/page.tsx`, `apps/web/src/lib/routes/onboarding.ts`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/lib/routes/console-onboarding.ts`, `apps/web/src/lib/http/next.ts`.
- **Depends on:** Lane A's legal-text tables (audit #51); the founder's answer (6.2) on which text is the signed-off version; PR #50 (open) also changes `lib/http/next.ts`: the one merged second keeps both (`LANES.md` rule 6).
- **Tests to add:**
  - unit (db): acceptance records the exact hash shown
  - e2e: `onboarding.spec.ts` (the gate shows the text and returns to the page)
  - axe: `/terms`
- **Leaves to Lane A or the founder:** Lane A: the legal-text store (audit #51). The founder: which document is the signed-off version (the counsel list).

#### UX PR 88. An audit request from a screening arrives with its screening

`co-001/ux-prospect-context`. After #42 merges: no. Visible change: yes. Size: M, about 220 lines.
- **Waits on:** Lane A.
- **Closes:** UX-131 (C-114).
- **Files:** `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/lib/routes/console-onboarding.ts`.
- **Depends on:** Lane A's console read function over `screening_lead`.
- **Tests to add:**
  - e2e: the prospects page shows a screened request's summary
  - axe: `/console/prospects`
- **Leaves to Lane A or the founder:** Lane A: the SECURITY DEFINER read that returns only the kept summary's counts and totals.

#### UX PR 89. The screening's kept-data notices, reshaped with every clause kept, and the closed link's order

`co-001/ux-screening-kept-notices`. After #42 merges: yes. Visible change: yes. Size: M, about 200 lines.
- **Waits on:** founder.
- **Closes:** UX-041 (C-117) (the kept texts' 'from your upload'); UX-122 (C-102); UX-136 (C-121) (the closed link's order (F4)).
- **Files:** `apps/worker/src/screening/wording.ts`, `apps/web/src/lib/screening/retention.ts`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/components/screening/upload-form.tsx`, `apps/web/src/app/request-audit/page.tsx`, `apps/web/src/app/screening/results/[resultId]/not-found.tsx`.
- **Depends on:** after #42 merges; the founder's answer (6.2), then counsel.
- **Tests to add:**
  - unit: `legal-surfaces.test.ts` (markers kept; the review recorded in this PR)
  - copy: the screening copy rules
- **Leaves to Lane A or the founder:** The founder, then counsel: the text.

#### UX PR 90. The palette: link, focus and surfaces adopted, warm greys, a hover a person can see

`co-001/ux-palette`. After #42 merges: no. Visible change: yes. Size: S, about 60 lines (tokens only).
- **Waits on:** founder.
- **Closes:** UX-176 (C-194).
- **Files:** `packages/brand/src/tokens.css`, `packages/brand/src/tokens.ts`, `docs/brand/BRAND.md`.
- **Depends on:** the founder's answer (6.2).
- **Tests to add:**
  - brand: `tools/brand-colors` contrast table; every `brand.spec.ts` baseline regenerated and inspected
- **Leaves to Lane A or the founder:** The brand owner (ADR 0058 D9).

#### UX PR 91. People reach dark mode: an Appearance setting, Match my device by default

`co-001/ux-appearance`. After #42 merges: yes. Visible change: yes. Size: M, about 250 lines.
- **Waits on:** founder.
- **Closes:** UX-118 (C-080) (the tokens' device rule, the server-rendered theme, the setting page and the gate (Lane B)); UX-160 (C-047) (the sign-in ground's alias token (`--pw-bg-sign-in`), after F3).
- **Files:** `packages/brand/src/tokens.css`, `packages/brand/src/tailwind-theme.css`, `apps/web/src/app/sign-in/layout.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/account/appearance/page.tsx` (new), `apps/web/src/lib/routes/account.ts`, `apps/web/src/components/shell.tsx`, `apps/web/e2e/brand.spec.ts`, `apps/web/e2e/a11y.ts`, `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md` (a dated amendment).
- **Depends on:** the founder's answer (6.2): F1, and F3 for the alias; UX PR 32 (`ux-dark-tokens`); after #42 merges (the account menu's link in `shell.tsx`, and option (c)'s `tenancy.ts`); option (c): Lane A's migration.
- **Tests to add:**
  - e2e: compared dark baselines (header, sign-in, a tile row, a status table); axe in both themes; no flash of the wrong theme
- **Leaves to Lane A or the founder:** The founder (it reverses D9 item 3), and the brand owner for the alias (F3). Lane A, for option (c): `user_settings_valid` widened to an `appearance` key, with `tenancy.ts` after #42. ADR 0056's dark-mode paragraph gains a dated '*Amended ...*' line.

## 4. Folded into work already in flight

A finding inside an in-flight item's scope goes to that item, not to a new PR. Each line names what the item takes; the finding's full entry is in section 7.

- **`co-001/ux-forms` (claimed 2026-10-26 04:35 UTC, its own session; UX PR 1 above):** UX-001 (C-001), UX-074 (C-013), UX-081 (C-022). The form keeps every value after a refusal (the client-side dispatch, so React never resets it), the refused field named by its visible label and marked on every control type, the summary first, focus kept, and ActionForm's busy button. The packet, key, Stripe and pager buttons are new work (UX PR 23). Open PR #50 adds `refreshOnError` to `action-form.tsx` and changes `lib/http/next.ts`; open PR #51 changes the case, reconciliation and abstraction-ledger pages, and open PR #52 the line page: the one merged second keeps both, and its session should hear of these overlaps now.
- **`co-001/materiality-cents`, merged as PR #54 (7ef421b, 2026-10-26 08:56 UTC, after this review's evidence):** UX-002 (C-003). It owns the settings page that showed cents as dollars (narrow-practice-2-02, flows-practice-01, words-practice-11) and the console's model budget typed in cents (words-other-21 and flows-other-10's budget part). It also moved the line page's 'unrounded ... cents' and adjustments to dollars (part of UX-016 (C-049)), counted the parse report's nouns (part of UX-115 (C-054)), and passed labels to the settings forms (part of UX-074 (C-013)). The flag form's On/Off half is UX-038 (C-059) (UX PR 57), its own proposal that PR #54 did not take.
- **audit #38, every figure explained in words (PR #52, draft, fix round):** UX-016 (C-049). The trace's steps in words; its fix round also covers the 'As recorded' `<pre>` wrapping and its keyboard scroll. The packet-page findings outside #38's design (UX-022 (C-056), UX-063 (C-062), UX-130 (C-093), UX-194 (C-177)) are follow-ups after PR #52 merges; the payer's copy cover (UX-124 (C-050)) is Lane A's PR 12's (section 5). UX PRs 1, 3, 10, 12, 13, 14, 15, 19, 20, 22, 23, 24, 25, 30, 31, 36, 38, 39, 40, 41, 42, 43, 44, 45, 46, 52, 71 and 77 land after it or beside it.
- **audit #12, ledger amounts in payment terms (PR #51, draft):** UX-037 (C-096). The response log's sentence, worded from the ledger's state, in its fix round (a one-line follow-up if PR #51 has merged). UX PRs 1, 3, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 24, 25, 26, 29, 30, 31, 33, 36, 37, 38, 42, 43, 46, 48, 50, 52, 53, 54, 71, 77, 82 and 87 land after it or beside it, because it changes the home, case, submissions, ledger and reconciliation pages.
- **audit #32, one unmapped plan no longer freezes a month (`co-001/unmapped-plan`, designing):** UX-059 (C-128). The next step after a mapping ('Price 2026-03 to 2026-04'), in its design. Offer it the Coverage and Mapping empty state too (UX-139 (C-179), UX PR 26).
- **audit #46, the Verified seal claims only what it proves (`co-001/verified-seal`, queued in the 15b session):** UX-183 (C-195). The seal's place: #46 lands first, as queued (`LANES.md` queue item 6), and places the seal as today's markup allows; UX PR 22 then builds the header's right slot and moves the seal into it, so #46 waits on nothing that is not in flight. Also for that session, an observation the brand reviewer recorded and this synthesis confirmed, not a numbered finding: the packet's 'Deadline verified' chip (`apps/web/src/lib/packets/view.ts:95`) uses the word the brand keeps for the ledger-gated seal (ADR 0056:93 renames the rate-record case 'Fields checked'); word the deadline status otherwise, keeping the CO-12 enum.
- **audit #48, a narrative draft survives sign-out (`co-001/narrative-draft`, designed, after audit #38 in the same session):** UX-045 (C-076). Return to the interrupted page after sign-in: its design §4.12 covers `/p/` pages; this extends the same validated path to the terms gate, maintenance and non-practice pages. UX PRs 22, 23, 44, 45 and 49 land after it: they reuse its guarded refresh or leave guard, or change the packet forms it changes.
- **audit #103, every route's accessibility under WCAG 2.2 (Lane A's PR 7):** UX-085 (C-029), UX-091 (C-073). The every-route axe gate with its routes, states and rules, and tagged PDFs. See section 5.

Other Lane B items in flight take no finding: PR #50 (audit #10, a superseded re-run cannot be accepted; UX PR 38 (`co-001/ux-pricing-runs`) builds on its run states, and UX PRs 1, 3, 9, 14, 15, 16, 17, 18, 19, 24, 25, 26, 27, 29, 30, 33, 36, 38, 39, 40, 41, 42, 54, 56, 59, 62, 64, 69, 71 and 87 change files it changes), PR #49 (the release content checks; UX PRs 3, 5, 9, 19, 20, 24, 26, 30, 31, 36, 38, 40, 41, 50, 56, 71 and 77 land after it or beside it), PR #53 (audit #84, the model evaluation gate, merged 2026-10-26 09:50 UTC, after this review's evidence; a UX PR that changes one of its files builds on its tree) and the contract PHI check (audit #120, building; the console model pages' findings UX-038 (C-059) and UX-202 (C-190) are outside their scope), PR #48 (ci-deps; no screens; UX PR 86 (`co-001/ux-enrol-qr`)'s QR library goes through its licence and age checks), and PR #55 (`co-001/ux-brand-reviewer`), the checklist this review feeds, which takes UX-014's vocabulary.

## 5. Handed to Lane A

Lane B opens no pull request with a migration. These parts need DDL, so they go to Lane A under "Handed to Lane A" in `LANES.md`. Each Lane B part that stands alone ships first, as section 3 says.

**The migration parts:**
- **UX-004 (C-010)** A suspended organization's billing page says 'In good standing' directly above 'New runs have stopped', with no reason and no next step. Storing the suspension's reason (a closed-list value), note and time on `organization` (or a status-event table), so the customer's page can say why PaidWhole suspended the organization and what to do next, and the console can show it; and the console route's write of them in `lib/routes/console.ts` (a #42 file), after #42 merges.
- **UX-007 (C-011)** Logging the payer's answer sends the person to Uploads, which cannot take a payer letter; the only working path files the letter as a contract document in the specialist's abstraction queue. The same exclusion (a payer letter that a `payer_response` links is not awaiting abstraction) in `console_contract_queue()`, a SECURITY DEFINER function (`packages/db/functions/console_contract_queue.sql`; migration `20261016200000_contract_questions_and_queue.sql:118-140`), recreated in a new migration: Lane A. Until it lands, the console count includes response letters that the web lists leave out.
- **UX-008 (C-012)** Nothing tells the second person a packet waits for their approval: no notification, no home queue, no Cases column; the later hand-offs are as silent. New notification kinds (approval requested, approved, export attested) widen `notification_kind_check`: Lane A, after #42, whose migration sets it again (`20261107090000_mail_streams.sql:797-800`, adding `support_notice_undelivered`), so the new kinds build on that, not on 20261027090000:418. The notification display and query live in `components/monitoring/display.tsx` and `lib/monitoring/queries.ts`, #42 files.
- **UX-009 (C-006)** The terms page asks a customer to read the terms and accept them, but shows no terms: only a version, a storage reference and a hash prefix. The legal-text table of combined audit #51 (append-only, kind, body, SHA-256 checked by the database), its legal-review record kind, and a reference from `terms_version` to the reviewed text. Already Lane A's queued 'legal surfaces' tables' PR (audit #51): hand this screen evidence to it.
- **UX-027 (C-097)** Dates and times: ISO dates and UTC clock times on screen beside browser date pickers in mm/dd/yyyy, so an upload at 9:26 p.m. Eastern shows as the next day. A practice time-zone setting and its definer setter (settings are written only through `practice_set_*` functions, for example `practice_set_materiality`, `settings.ts:317`): ADR 0061 already places a practice time zone in Lane A's PR 12. Hand this screen evidence to it.
- **UX-047 (C-122)** Maintenance throws a customer out of the page and any form they were sending, never brings them back, gives no end time, and the status page shows every part 'Operational' meanwhile. A stored expected end and message for maintenance (today `maintenance_on()` returns a boolean): a value on the maintenance flag or a status row, with its setter: Lane A.
- **UX-055 (C-110)** Support engineers and contract specialists cannot ask for a support grant in the product, and the administrator re-types the ticket into a free-text field. A pending support-grant request (a table, or a ticket state) with its requester, practice, reason and decision, audited, and the grant's link to a real ticket: Lane A.
- **UX-058 (C-109)** A support ticket loses its context on the way in and its answer on the way out: the desk cannot reply in the product and the customer cannot read the reply. Two parts, for Lane A after #42 (which adds the mail streams and support notices this uses): (1) a nullable `page_path` column on `support_ticket` that keeps a path with opaque IDs only, checked by a CHECK and against the route registry, because `support_ticket.screen` admits only a section key (`CHECK (screen ~ '^[a-z][a-z0-9_]{0,63}$')`, migration `20261030090000_customer_sign_in_and_readiness.sql:368`; #42's `20261101120000_support_mail.sql:18-21` adds only `source` and `mail_ref`); (2) a table (or columns) for ticket replies, with the PHI-registry decision that sets its `practice_id` and forced RLS, and the mail-reply threading it needs.
- **UX-071 (C-134)** The access log cannot answer the questions it exists for: no filter by person, route, action or date, no page links into its record filter, and page two has no way back. Widening `practice_access_log()` (SECURITY DEFINER; today record, cursor and limit only) with person, route, action, record-kind and from-date filters, and a claim-number lookup that returns record ids only: Lane A.
- **UX-072 (C-136)** An open support grant is a dead end for the practice administrator: nobody named who holds it, no way to end it or ask for it to end, and an empty state worded as final. `end_support_grant()`'s actor check widened to a holder of a new practice permission (for example `support_grant.end_own`) on their own practice, still recording the security event, and that permission in the matrix: Lane A (a SECURITY DEFINER change, so the founder approves the domain model).
- **UX-118 (C-080)** How people reach dark mode: recommended a per-user Appearance setting, 'Match my device' by default, once the dark set is fixed (a founder decision: it reverses 'dark mode stays off'). Widen `user_settings_valid` (migration `20261020090000`, recreated in a new migration) to admit an `appearance` key whose value is one of 'device', 'light' or 'dark', beside `notifications`; update `UserSettings` in `packages/db/src/schema/tenancy.ts` (a #42 file, so after #42 merges) and regenerate the domain model and the function files. Only if the founder chooses (c).
- **UX-131 (C-114)** An audit request that came from a screening arrives in the console without the screening, so the operator prepares the scoping call blind. A SECURITY DEFINER console read function over `screening_lead` (and its grant to the console's role) that returns only the kept summary's counts and totals for a request: Lane A.
- **UX-143 (C-162)** 'Revoke device' ends another browser's sessions on one click, between two cards both called 'Chrome on Windows'. Add `name text` (nullable, length-checked, at most 60 characters) to `user_device`, with `GRANT UPDATE (name) ON user_device TO tp_app` under the existing self policy, for the person-given device name; the browser `label` keeps being rewritten at sign-in. Only the naming part needs it; the confirmation and order land in Lane B without it.
- **UX-179 (C-163)** Notification preferences are one switch for every practice, and staff with no practice access are offered practice digests. Widen `user_settings_valid` (migration `20261020090000`, recreated in a new migration) to admit `notifications.practices`, an object keyed by practice ID whose values hold optional `digest_email` and `in_app` booleans; update `UserSettings` in `packages/db/src/schema/tenancy.ts` (a #42 file, `pr42-files.txt` line 132, so after #42 merges) and regenerate the domain model and function files.

**For Lane A's PR 7 (audit #103, every route's accessibility under WCAG 2.2):**
- **UX-085 (C-029)**, the gate's gap: visit every page route with a role that can open it (fail when a route has none) at 1280 and 390 px; add `wcag22aa` and turn on `page-has-heading-one`, `heading-order`, `landmark-unique`, `empty-table-header` and `label-content-name-mismatch` by rule id; visit each route also in its refused state (two are already checked and are not gaps: the pricing settings' refused ZIP, `apps/web/e2e/onboarding.spec.ts:542`, and the screening's, `screening.spec.ts:727`), its permission state, with a header menu open and in dark; correct `a11y.ts:5-7`'s comment, which says the gate checks landmarks and headings while their rules are `best-practice` and never run; make `tabTo` (`apps/web/e2e/a11y.ts:36-41`) assert a visible, non-transparent ring of 3:1 and that the focused element is on screen and below the sticky header (2.4.11). The three reviewers' route lists are in a11y-practice-1-28, a11y-practice-2-19 and a11y-other-24. Record as manual checks per route what no tool sees: 3.3.7 (values kept after a refusal), 3.3.8 (paste into the code field), 2.5.3 (visible words in the name), 2.2.1 (step time limits), 4.1.3 (status messages) and focus return after menus, with this review's findings as their first cases.
- **UX-091 (C-073)**, tagged PDFs: `page.pdf({ ..., tagged: true, outline: true })` in `apps/worker/src/report/pdf.ts`, with the test audit #103 names (a StructTreeRoot, a `/Lang`, TH cells, an outline of the headings). Lane B does not change `pdf.ts` in parallel.

**Handed whole, no migration:**
- **UX-124 (C-050)** The payer's copy opens on a cover that asks to 'reprocess underpaid claims' with no amount, no claim count, no service dates, no filing deadline and no reply contact. Handed to Lane A's PR 12, which rewrites this cover once in CO-06's neutral words. The figures to add to the cover's meta, each built by code from the version's stored content (no typed figure): the payment difference and its lines and claims ('Payment difference: $90.00 on 3 lines of 3 claims'), the service-date span ('Service dates 2026-03-05 to 2026-03-07'), the filing deadline relied on with its source, and the reply-to contact with the reference to quote. Keep the Paper cover and the white-label rule. The packet cover has no committed baseline (ADR 0058's cover baselines are the ROI statement's), and the cover shares `apps/worker/src/report/brand.ts` with the ROI covers, so Lane A's PR 12 re-runs the ROI cover baselines if it touches that frame.

**To tell Lane A, no handover needed:**
- Lane A's PR 13 (audit #125) keeps only the bulk case work, because UX PR 35 (`co-001/ux-cases-list-first`) moves the Cases list first and drops the duplicate materiality form (UX-125 (C-063)).
- The case state vocabulary (audit #89, Lane A's PRs 8, 10 and 13) later replaces the display-layer wording of UX-024 (C-084) and UX-020 (C-124).
- Lane A's PR 13 rebuilds the case screen (six tabs, CO-06). Its Overview tab reuses UX PR 12 (`co-001/ux-case-summary`)'s dispute figures (asked, accepted by the payer, not accepted), built in one helper in `apps/web/src/lib/cases/workbench.ts`, so the figures are not built twice (UX-024 (C-084)).
- 'Short (insurer payment)' is reserved for D31's insurer-payment variance in Lane A's PR 13, beside 'Short (variance)', the allowed-amount variance ADR 0056 names (UX-014 (C-083)).
- The combined administrator-and-biller role is audit #90 (Lane A's PR 14), which UX-119 (C-129) does not need; Lane A's PR 12's practice time zone is what UX-027 (C-097) switches its times to.
- `UserSettings` in `packages/db/src/schema/tenancy.ts` is a #42 file, so the hand-overs for UX-118 (C-080) and UX-179 (C-163) land after #42 merges.

## 6. Decisions

### 6.1 Taken under the co-founder's ruling

Wording and visible changes take the recommended option without asking, and are reported afterwards in one list (the co-founder's ruling of 2026-10-25 ~21:34 UTC); so do cost and security trade-offs, the safer taken. Where the brand's written rules are silent, the choice says so in the finding's Rule line. The exact words for each are in its Fix (section 7); the co-founder may change any chosen option, and a ruled one changes only by amending its rule.

**Brand choices the rules decide, applied** (from the brand reviewer's list, brand-16): the sign-in ground in dark is the dark ground (`docs/brand/BRAND.md:84-86`: in dark the ground becomes a deeper ink; the alias token that carries it is the brand owner's, F3) (UX-160, C-047); success notices use no status colour (`.claude/rules/brand.md:26-28`: status colours are for data only) (UX-082, C-021); danger only on failures, and a neutral badge for a system state (ADR 0056:89-92) (UX-018, C-104); the settings sub-navigation's current tab without Brass (`docs/brand/BRAND.md:120-121`: the one brass underline marks the active navigation item, Brass's only job) (UX-177, C-140).

**Brand choices where the rules are silent, chosen** (the rest of brand-16): no warning hue: a ruled neutral notice with an icon and words (UX-082, C-021); no new danger red (UX-018, C-104); one chip at radius-sm, 12 px, weight 500 (UX-106, C-105); tile labels in sentence case (UX-104, C-057); the settings tab's current cue: the text colour with weight and an Ink outline (the inset fill alone measures 1.13:1) (UX-177, C-140); the danger style for actions that remove access, remove or reverse a record, or write money off (UX-155, C-196); one public frame (UX-156, C-142); the seal in the page header's right slot, after audit #46 lands (UX-183, C-195); native controls take Ink (UX-117, C-035); a page title is never the bare brand name (UX-182, C-193). Three of the reviewer's sixteen are the founder's, in 6.2: how people reach dark mode, the palette's surfaces and hover, and the unpriced hue; the sign-in ground's alias token joins F3; a fourth (the word Verified on the deadline chip) goes to audit #46, section 4.

**Security and cost trade-offs (the safer):**
- **UX-006 (C-005)**: The second-factor reset stays with a platform administrator (hardware-key session, audited), not the organization's administrator, so one compromised customer account cannot strip a colleague's second factor; the password reset answers alike for known and unknown addresses, is rate limited through the `sign_in` bucket and records its security events.
- **UX-013 (C-018)**: Success notices travel in a signed, HttpOnly, path-scoped flash cookie holding a code and an opaque id for seconds, not in the URL.
- **UX-102 (C-066)**: The kept practice is an opaque id in an HttpOnly, Secure, SameSite=Lax cookie, honoured only while the actor still reaches it.
- **UX-048 (C-077)**: The template mapper keeps column indexes in the URL, never header text from a customer's export.
- **UX-058 (C-109)**: The ticket's context link carries a path with opaque ids only, checked against the route registry.
- **UX-055 (C-110)**: A support grant is requested in the product and approved by someone else; the requester never grants.
- **UX-072 (C-136)**: The practice administrator may end a support grant to their own practice (break-glass access to their PHI), recorded as a security event (Lane A's definer change).
- **UX-181 (C-185)**: File names in upload refusals are built in the browser and never reach the server, a log or a URL.
- **UX-001 (C-001)**: After a refusal only password and one-time-code inputs clear (WCAG 3.3.7's security exception); nothing typed is echoed back from the server.
- **UX-163 (C-178)**: The upload limit drops from 2 GiB to 2,000,000,000 bytes, so its label is exact; the smaller limit is the safer, and the PRD's 2 GB acceptance holds.

**Security trade-offs that are not the safer setting, named for the security reviewer** (taken as recommended, with the reason, and confirmed at design):
- **UX-006 (C-005)**: The console reset needs a new Cognito grant, `AdminSetUserMFAPreference`: a role that holds it can strip any user's second factor. Recommended: put it on a worker job's role, not the internet-facing web task's, so a compromise of the web task cannot reset a factor by itself. The security reviewer chooses at design (UX PR 65).
- **UX-012 (C-007)**: Fifteen minutes for the enrolment, new-password and key steps (Cognito's maximum), five for the code step, with a warning. This is not the safer setting: it is the less strict one, taken for accessibility (WCAG 2.2.1, level A), because three minutes with no warning shuts out people who type slowly from a mandatory step. The challenge stays single-use and still needs the password and a code. The security reviewer confirms at design (UX PR 66); what 2.2.1 still leaves unmet is recorded for audit #103.

**Every wording and visible choice, by finding:**
- **UX-020 (C-124)**: 'Reopened: the payer took back $18.00 on <date>' with 'Build a packet for the reopened line, or write it off'.
- **UX-024 (C-084)**: The case shows asked, accepted, not accepted, payer approved and recovered; 'Partly accepted on <date>: $60.00 of $90.00' with the next step.
- **UX-004 (C-010)**: The badge reads 'Suspended by PaidWhole' or 'Closed', never 'In good standing'; the next step is 'Open a support ticket'.
- **UX-035 (C-065)**: 'Choose the reason' and 'Choose the payer's answer' as empty first options.
- **UX-039 (C-086)**: 'Shortfalls (3)', paged on their own; empty state 'No shortfall'.
- **UX-006 (C-005)**: The help line: 'Forgot your password? Use the link above. Lost your authenticator app? Write to <support address>. Lost a hardware key? Sign in with your second key.' Promises no reset before one exists, and never a key reset (Cognito has no administrator path for a passkey).
- **UX-007 (C-011)**: 'Log a payer response' takes the letter in its own file field; payer letters leave the contract-tagging lists.
- **UX-008 (C-012)**: Queue names: 'Packets waiting for your approval', 'Approved, not exported', 'Exported, waiting for attestation', 'Attested, submission not logged'; a 'Packet' column on Cases.
- **UX-010 (C-004)**: A refused download returns 303 to its own form, field marked; the codes hint reads 'Five-character codes separated by commas, such as 97110, 97530.'
- **UX-012 (C-007)**: Each step states its limit: 'This step stays open for 3 minutes.' now, 15 after the session PR; 'This step closes in 1 minute. Start it again to get more time.'
- **UX-014 (C-083)**: 'Short (variance)', as ADR 0056 records, with its stage ('Short (variance), validated'); 'shortfall' only in running sentences; 'Short (insurer payment)' reserved for D31.
- **UX-015 (C-048)**: The Recovered tile reads 'to date, since <date>' with 'This quarter (2026-Q4)' under it; 'stage five' leaves every read text.
- **UX-017 (C-098)**: 'a former member of the practice'; 'PaidWhole staff, under a support grant'; 'someone outside the practice'.
- **UX-018 (C-104)**: Danger only for failures and refusals; to-dos as the neutral chip with words (brand-16's choice 5).
- **UX-021 (C-027)**: On a phone the practice's full name gets a second 32 px header row.
- **UX-022 (C-056)**: 'Attested <date> by <email> (reimbursement reviewer) over these files:' and 'They signed this statement: “...”'.
- **UX-023 (C-082)**: 'Actionable $0.00 (no line is still actionable: 3 lines moved on to payer approved)'; 'Written off: none'.
- **UX-025 (C-091)**: Draft: 'Not ready to approve'; signed off: 'A cited page no longer resolves' (warning, not danger).
- **UX-026 (C-094)**: The two agreements keep their labels until audit #51 gives their titles; a description line under each says who accepts it.
- **UX-027 (C-097)**: Calendar dates as 'Oct 26, 2026'; times named by zone (UTC until the practice zone exists); ISO kept in CSV and audit records.
- **UX-028 (C-100)**: '<date>: Version 1 of <agreement> ends. Lines after it are not priced until an amendment or renewal is signed off: upload it here.'
- **UX-029 (C-125)**: 'Not triaged yet: the shortfalls reach a case only after triage.' with 'Triage this run'.
- **UX-030 (C-137)**: 'Compare with the run in effect for this period'; 'Replaced by the run of <date>'.
- **UX-031 (C-081)**: 'A payer took back $18.00 from 1 line of a case: the line is reopened, and recovered (deposited) drops by that amount.'
- **UX-032 (C-087)**: 'Pursuit hours: not tracked yet' with 'PaidWhole does not log time on cases yet, so this statement states no pursuit hours.'
- **UX-033 (C-092)**: Cases '— closed'; the case page 'No deadline to meet: the case is resolved'.
- **UX-034 (C-111)**: 'Location saved: lines price at carrier X, locality Y.'; not settled: 'Check the billing ZIP' as a danger notice.
- **UX-036 (C-095)**: 'Not in this run'; 'Only one run covers this line'; 'These runs share no line: they price different months ...'.
- **UX-037 (C-096)**: '... Recorded as payer approved in the recovery ledger.' worded from the ledger's state.
- **UX-038 (C-059)**: 'Choose a flag' and 'Choose who it applies to', both required; the notice names what was set ('Daily budget for <practice> set to $8.00.').
- **UX-041 (C-117)**: 'Choose' and 'send', never 'upload', for the screening file.
- **UX-042 (C-118)**: 'Medicare figure less allowed, before the reduction across codes'; 'A positive figure means the allowed amount in your file is below Medicare's figure; a negative one, above it.'
- **UX-043 (C-119)**: 'Claims' becomes 'Claim lines'.
- **UX-044 (C-120)**: 'An audit prices your lines under your signed contracts and their own rules, including the rows this screening could not, and names the reason for any line it cannot price.'
- **UX-046 (C-058)**: Each stopping console action asks for a tick naming the consequence with its figures ('Charge $2,500.00 to <organization>'s account on file').
- **UX-047 (C-122)**: The maintenance page shows the end time when stored and returns the person to their page.
- **UX-049 (C-037)**: 'Choose which system's ERA export these 3 files are.' The files are kept until the choice.
- **UX-050 (C-088)**: Messages as instructions: 'Enter a change other than 0.00: a minus sign lowers the entry, such as -5.00.'
- **UX-051 (C-020)**: 'As a billing manager, you cannot <action>.' with no parenthesis; internal staff are told a support grant opens a practice.
- **UX-052 (C-108)**: `/console` lists what needs a person now, each a count linking to its queue.
- **UX-053 (C-131)**: 'Exports need the practice's correspondence contact. <name>, the practice administrator, sets it.'
- **UX-054 (C-030)**: Each sign-in step words its own refusal on its own field; an unknown account and a wrong password get the same words.
- **UX-056 (C-126)**: 'In case: <payer>, plan <plan> (packet version 3, submitted)' with links.
- **UX-059 (C-128)**: 'Price 2026-03 to 2026-04' where pricing can run (in audit #32's design).
- **UX-060 (C-132)**: 'Contract versions waiting for your sign-off' on the home.
- **UX-061 (C-133)**: 'Ask PaidWhole to send it for signature' with 'It is recorded here when it is signed.'
- **UX-062 (C-138)**: 'Kind of document' lists every kind, each with one line on what happens next.
- **UX-063 (C-062)**: A stepper: Written, Approval requested, Approved, Exported, Attested, Submitted, Answered, with one primary action for the viewer.
- **UX-064 (C-038)**: 'Components affected: tick at least one component.'; one Zod error map in plain words ('Enter a value.').
- **UX-065 (C-060)**: 'Releases are prepared and checked in a content checkout and published by CI when their pull request merges.' (no skill name, no variable).
- **UX-066 (C-075)**: 'This account was locked after ten failed attempts. Write to <support address> from this address to have it unlocked.'
- **UX-067 (C-089)**: '... change their role under Members above. If not, open a ticket from Help and support and PaidWhole adds them.'
- **UX-068 (C-112)**: 'Approve 6 policies: unblocks 9 controls'; 'Record 17 workforce attestations'.
- **UX-069 (C-123)**: 'Write a new version' collapsed, with 'A new version replaces version 3 for approval; you would then be its writer and could not approve it.'
- **UX-070 (C-139)**: 'Validation requested for <payer>, plan <plan>, 97110' as a one-time confirmation.
- **UX-072 (C-136)**: 'Held by <email>, PaidWhole support, for ticket <id>; it ends by itself at <time>'; 'Nothing read yet' or 'Nothing was read'.
- **UX-073 (C-028)**: Each row's naming cell is a row header; repeated controls carry the row in hidden text after the visible words ('Line trace' then the claim and line).
- **UX-074 (C-013)**: Fields are named by their visible label; the summary sits first and leads 'Fix the fields listed here, then try again.'
- **UX-076 (C-014)**: Each loading state shows its own label as text ('Loading cases…').
- **UX-077 (C-039)**: Hints: 'Year and month, such as 2026-03'; 'Letters, digits and hyphens, such as SYN-1234'; '64 hexadecimal characters'; 'Ten digits'; 'Four digits'.
- **UX-078 (C-034)**: Below 640 px a record list with actions stacks each row: identity as heading, facts as a definition list, forms full width.
- **UX-079 (C-043)**: Tables show an edge fade and, on a phone, 'Scroll sideways for more columns'; working lists stack on a phone.
- **UX-081 (C-022)**: Busy text 'Working…' for forms, with a polite status line; buttons keep focus.
- **UX-082 (C-021)**: Four notice kinds told apart by surface, icon and words; no warning hue and no status colour for success (brand-16's choices 3 and 4).
- **UX-083 (C-025)**: 'Skip to main content'.
- **UX-084 (C-026)**: The current rail item keeps the brass underline and adds weight 600 and a 2 px Ink bar; no new colour.
- **UX-086 (C-031)**: 'The report is ready. Its PDF and CSV are below.'; past ten minutes, 'This is taking longer than usual'.
- **UX-087 (C-036)**: The reference search and the screening file field tie their message to the control; focus moves to it.
- **UX-089 (C-045)**: Controls are 16 px below 640 px and 14 px from 640 px up.
- **UX-093 (C-023)**: The phone menu button reads 'Menu' and 'Close menu'.
- **UX-094 (C-024)**: Accessible names start with the visible text: the practice's name then ', switch practice'; the email then ', account and sign out'; the current practice marked 'Current'.
- **UX-098 (C-074)**: 'Six digits. Spaces are fine.'
- **UX-100 (C-017)**: One label map in sentence case ('ownership' becomes 'Your practice group'; 'read (case_review)' becomes 'Read, reviewing a case'); CARC and RARC kept as initialisms.
- **UX-101 (C-053)**: No build reference in read text: 'No billing firm can reach this practice. A firm reaches it only through a grant you approve.'
- **UX-103 (C-033)**: Each empty state links its next step ('Go to Uploads', 'Go to Cases', 'Go to Payer and plan mapping'); 'No pricing run has priced this practice yet.'
- **UX-104 (C-057)**: Tile labels in sentence case, Slate 12 px weight 500; values Plex Mono 500 (brand-16's choice 8).
- **UX-105 (C-099)**: Plans as 'SYNTHETIC PAYER Q, plan SYNPLAN-FIX-ONE'; the raw key only on the mapping page as 'Remittance key ...'.
- **UX-106 (C-105)**: One chip: StatusChip, radius-sm, 12 px, weight 500; Badge outline only for tags (brand-16's choice 7).
- **UX-107 (C-130)**: Read-only cards titled by what the reader sees ('The correspondence contact') with 'Set by the practice administrator, <name>.'
- **UX-108 (C-032)**: Cases: 'No open case for these filters' with 'Clear filters'; each list words its own filter.
- **UX-109 (C-046)**: Options lead with what differs: 'March 2026 · in effect · completed 01:25 UTC'; proof level as two radios.
- **UX-110 (C-051)**: Reasons and methods in audit #38's vocabulary for the customer, the code only as secondary text on Coverage's reference table. 'PaidWhole does not price secondary claims', with no 'yet'.
- **UX-111 (C-068)**: Help per page: 'Open a ticket about any screen, or write to support from the address you sign in with. ...'
- **UX-112 (C-069)**: Rail groups 'Work', 'Results', 'Data', 'Set-up', then Notifications and Settings.
- **UX-115 (C-054)**: Counts through `counted()`: '1 line', '1 case nearing its deadline', '1 control ready'.
- **UX-116 (C-101)**: Records by name ('SYNTHETIC FIXED SCHEDULE AGREEMENT, version 1'; 'Record 1: 97110, $50.00 per unit'); 835 fields in words with the code after.
- **UX-117 (C-035)**: Native controls take Ink (`accent-color`), never Brass (brand-16's choice 15).
- **UX-119 (C-129)**: Home sections ordered by role: 'Your work' first for those who work cases; Getting started first for the administrator.
- **UX-121 (C-090)**: Rail 'Subscription'; title 'Subscription and invoices'.
- **UX-123 (C-127)**: A 'What happens next' block on each settled receipt.
- **UX-125 (C-063)**: Cases leads with the list; materiality shown read-only with 'Change them in Settings'.
- **UX-126 (C-078)**: The requirement sits beside the download links; the page follows the downloads.
- **UX-127 (C-113)**: Each evidence item gets shown words ('answers every persona as the persona matrix says (one test per persona)').
- **UX-128 (C-042)**: A server-rendered QR code with 'QR code for your authenticator app. The setup key below is the same.' and 'Copy the setup key'.
- **UX-130 (C-093)**: 'Sentence 4: $1,234.56 is not one of this packet's figures. Use an amount from the line schedule or the contract citation, or remove it; ...'
- **UX-131 (C-114)**: 'From a screening' or 'From the form' on each request.
- **UX-132 (C-061)**: The public result says 'PaidWhole', not 'the engine', and words the reason ('This place of service is in neither the facility nor the non-facility list ...').
- **UX-134 (C-115)**: Three summary lines and one button, 'Ask for an audit of the rows a contract prices'.
- **UX-135 (C-116)**: A three-step outline first; the practice and email last, beside 'Screen the file'.
- **UX-136 (C-121)**: The non-legal sentences reworded in place: 'Check that you copied the whole link from the email. ...'; the kept paragraph's place is F4's.
- **UX-137 (C-135)**: The filtered record named without PHI ('the case <payer>, plan <plan>').
- **UX-138 (C-167)**: Whole units without decimals; '×' as the sign.
- **UX-139 (C-179)**: 'No lines yet' with 'Coverage counts start once 835 files load and a pricing run prices them.'; shares at one decimal.
- **UX-140 (C-183)**: With the BAA on file: 'Upload your first 835 files. ...' with 'Go to Uploads'; without: 'Uploads open once the business associate agreement is on file.'
- **UX-141 (C-206)**: 'Last priced: service <dates>, complete <time>' linked to the run; 'Last job' secondary.
- **UX-142 (C-189)**: 'Owed' becomes 'Unpaid invoices'.
- **UX-143 (C-162)**: 'Revoke Chrome on Windows, last used <time>? Its 1 open session ends now, and it must sign in again with a code.'
- **UX-144 (C-159)**: Titles name the record without PHI ('Packet version 3: SYNTHETIC PAYER Q').
- **UX-146 (C-155)**: Legends 'Confirm every item before you sign'; 'Pursuit cost: all three together, or all blank to clear'; 'What reaches you'.
- **UX-148 (C-157)**: Hidden 'Start of the cited words' and 'End of the cited words'; 'Go to the cited words'.
- **UX-149 (C-143)**: 'Rule release 900001 (in force)' or '... (shown; 900002 is in force)'.
- **UX-154 (C-141)**: 'the reconcile job' becomes 'PaidWhole (automatic match)'; the engine version only on the trace.
- **UX-155 (C-196)**: Destructive style for actions that remove access, remove or reverse a record, or write money off (brand-16's choice 10).
- **UX-156 (C-142)**: One public frame: lockup, 'Free screening', 'Request an audit', 'Sign in'; one reading width; one footer (brand-16's choice 11).
- **UX-158 (C-144)**: A breadcrumb line above a short h1 ('Packet', 'Submissions and responses').
- **UX-160 (C-047)**: The sign-in ground in dark is the dark ground (brand-16's choice 2); Paper stays the light sign-in ground.
- **UX-162 (C-165)**: Actions as outline buttons: 'Download the PDF', 'Download the CSV schedule'.
- **UX-163 (C-178)**: Decimal units KB, MB, GB with no trailing '.0'; the upload limit set to 2,000,000,000 bytes so '2 GB' is exact; document labels start with a capital.
- **UX-166 (C-170)**: 'two-step verification' everywhere; 'Two-step verification not set up'.
- **UX-167 (C-181)**: 'See the recovery ledger'; months as 'September 2026', quarters as 'Q4 2026 (Oct–Dec)'.
- **UX-168 (C-149)**: The curly apostrophe and quotes in all product copy.
- **UX-169 (C-150)**: Rail 'Support grants', 'Support tickets', 'Terms versions'.
- **UX-170 (C-160)**: 'PaidWhole staff: sign in with a hardware key.' as one line under the form.
- **UX-171 (C-172)**: 'We answer within one business day, and within four hours from April through June.'
- **UX-172 (C-174)**: 'This page does not exist, or it needs an account with access to it. ...' with 'Sign in' or 'Go to your workspace'.
- **UX-173 (C-182)**: 'I understand this writes a new ledger entry in my name'; 'I understand this reverses the match and moves recovered (posted or deposited) back'.
- **UX-174 (C-184)**: 'Check or EFT trace number'; 'Payee NPI'; 'Patient share'; X12 references as secondary detail.
- **UX-175 (C-187)**: To a role that can act: 'No ROI statement yet. Choose a period above and generate one; ...'
- **UX-177 (C-140)**: Settings tabs in the text colour; the current one weight 600 with an Ink outline; 'For the practice administrator' as a group heading (brand-16's choice 9 settled to Ink, the fill alone being 1.13:1).
- **UX-178 (C-152)**: 'This case is not in this practice any more, or the link is wrong.' with 'Back to Cases'.
- **UX-179 (C-163)**: 'You reach no practice, so no digest is sent.'
- **UX-180 (C-171)**: 'Not registered'; 'The key was not registered: it did not answer, or the request was cancelled. ...'
- **UX-181 (C-185)**: 'remit-june.csv is empty (0 bytes). Export it again ... and choose it again; the other files were not sent either.' (the name stays in the browser).
- **UX-182 (C-193)**: The home's title is 'Your workspace', never the bare brand name (brand-16's choice 16).
- **UX-183 (C-195)**: The seal sits in the page header's right slot (brand-16's choice 12), in audit #46.
- **UX-185 (C-201)**: 'Locations' becomes 'Number of locations'.
- **UX-186 (C-205)**: Reconciliation leads with Unmatched; the case ledger titled 'Case ledger: <payer>, plan <plan>'.
- **UX-187 (C-207)**: The monthly summary opens on the latest service month with priced lines, chosen from a list.
- **UX-188 (C-208)**: 'Ask PaidWhole to set a place of service' as a pre-filled request.
- **UX-189 (C-161)**: 'Show password' and 'Hide password'.
- **UX-191 (C-173)**: '... name the screen and the record’s ID from the page address instead.'
- **UX-192 (C-175)**: 'Document <id> has 2 pages; page 99 is not one of them.' with 'Show page 1' and 'Show the cited page (page 2)'.
- **UX-193 (C-176)**: 'Line 1: write-off undone; the line stays Actionable (reason on the line)'.
- **UX-194 (C-177)**: '[4] evidence 1: the contract document'; 'interest not computed: the remittance does not say when the payer received the claim.'
- **UX-195 (C-180)**: 'No packet found' with 'Check it against the payer's letter (two groups of five, such as SK6CS-K6CSK) ...'
- **UX-196 (C-186)**: 'The report is being generated; its PDF, line CSV and this checklist open here once it is ready.'
- **UX-197 (C-188)**: 'Upload 835 files or ERA exports' with 'Choose files, or drop them here'.
- **UX-198 (C-191)**: 'No open incidents, and none resolved in the last 14 days. Open one below when customers are affected.'
- **UX-200 (C-168)**: 'In the cases these filters show: actionable $0.00 across 0 cases still being worked, as of <date>.'
- **UX-201 (C-169)**: 'Now: Deposited. ...' then the one change on offer, the count naming both stages.
- **UX-202 (C-190)**: 'When on, it turns every model feature off for everyone; the product keeps working on hand-entered records.'
- **UX-203 (C-199)**: Records first, create forms behind 'Add a practice', 'Invite a member', 'Record an agreement'.
- **UX-204 (C-200)**: Past due shows 'since <date>; new runs stop <date>'; '—' becomes 'After tonight's count'.
- **UX-206 (C-203)**: '1 of 4 groups is an anomaly.'
- **UX-207 (C-204)**: 'The result comes to your email as a link, usually within a minute.'

### 6.2 For the founder, through the co-founder

These change legal text, reverse a recorded founder ruling, or change the palette (the brand owner's, ADR 0058 D9), so they are not taken under the co-founder's ruling. Each has a recommendation; Lane B does the part that needs no answer meanwhile.

**F1. How do people reach dark mode?** (UX-118 (C-080))

- **Why it is the founder's:** This reverses D9 item 3 ('dark mode stays off', `docs/product/reconciliation-001.md:309`).
- **Options:**
  - (a) Keep light only, as ruled.
  - (b) Follow the device's setting, with no switch (no migration).
  - (c) A per-user Appearance setting on its own account page (`/account/appearance`): 'Match my device' (the default), 'Light' and 'Dark', stored with the user's settings and rendered by the server into `<html data-theme>` so the page never flashes the wrong theme. Public and sign-in pages follow the device; print, PDFs, the payer's copy and email stay light.
- **Recommendation:** (c). This is a judgement, not a measured fact: no user has asked for dark (ADR 0056:129). Billing staff work long days in dense tables, and a person who has set their device to dark, some for light sensitivity, gets it without asking. A switch lets the same person force Light to share a screen, take a screenshot for support or print, which (b) cannot. The dark set nearly passes already: in the second practice set it passes text contrast everywhere. The setting appears only behind a gate: the three dark defects fixed, compared dark baselines (header, sign-in, a tile row, a status table) and axe in both themes.
- **Meanwhile:** Lane B lands UX PR 32 (`co-001/ux-dark-tokens`) under the standing ruling: `color-scheme` per theme, a print block that prints light from dark, the unpriced class fixed, native controls in Ink, and a static check for palette primitives. It changes nothing anyone sees in dark while dark stays off; in light only native check boxes and radios change, from the browser's blue to Ink. The sign-in ground's alias token is the brand owner's (F3) and lands with the setting in UX PR 91 (`co-001/ux-appearance`). Option (c) needs a migration for Lane A (`user_settings_valid` widened to an `appearance` key, with `tenancy.ts` after #42); (b) needs none.

**F2. The terms page shows no terms. What does it show?** (UX-009 (C-006))

- **Why it is the founder's:** The terms are legal text on `HANDOFF.md`'s counsel list, and which document is the signed-off version is the founder's.
- **Options:**
  - (a) Leave the page as it is until the legal-surfaces PR: a customer accepts a version they cannot read.
  - (b) Link the stored document by its reference now: nothing checks that the stored file matches the hash the acceptance records.
  - (c) Combined audit #51's option: the signed-off text published into an append-only legal-text store whose SHA-256 the database checks, released only with a recorded legal review over that hash. `/terms` renders the full text above 'I accept these terms', says what changed since the version the person last accepted, records acceptance of that exact hash, and returns the person to the page the gate sent them from.
- **Recommendation:** (c), because acceptance then binds the exact text shown, and the page tells a returning customer what changed. It needs Lane A's legal-text tables (audit #51's PR, a migration whose domain model the founder approves); Lane B renders it in UX PR 87 (`co-001/ux-terms-text`), with the two agreements' names from the same titles (UX-026).
- **Meanwhile:** Nothing changes on the page; the founder names the signed-off document when counsel has it.

**F3. The palette: surfaces, hover, the unpriced hue and the sign-in ground's alias** (UX-176 (C-194))

- **Why it is the founder's:** A palette change is the brand owner's alone (ADR 0058 D9).
- **Options:**
  - (a) Leave the palette as it is.
  - (b) Adopt the link, focus and surface tokens into `BRAND.md` section 4 as they are.
  - (c) Adopt them, retune raised, inset, border-strong and input-border into the warm family of Line and Paper (input-border at 3:1 or more on White, Paper and the raised surface), and give primary-hover a visible step in both themes (1.5:1 or more against the resting fill; today 1.13:1 against Ink).
  - And D9 item 2, still open: darken `--pw-unpriced` from #7A8594 (3.34:1 on its tint, 3.74:1 on White) to #5F6A79 (4.9:1 on its tint, 5.49:1 on White, computed for this review), after which unpriced chips may set their text in their own hue. #5F6A79 is 1.17:1 from Slate (#526070), so text in the darker hue would look almost the same as today's Slate text: the hue's real job is the chip's border.
  - And the sign-in ground (UX-160): an alias `--pw-bg-sign-in`, Paper in light and the dark ground in dark, so the sign-in pages follow dark mode. It adds no colour, but it is an alias, and D9 item 6 sent the alias `--pw-danger-bg` to the brand owner.
- **Recommendation:** (c), and #5F6A79 for item 2: one quiet, warm family, a hover a person can see, and an unpriced hue that meets the brand's own 4.5:1. The colours change in `tokens.css` and `tokens.ts` only, with no component edit (UX PR 90 (`co-001/ux-palette`)), and every baseline is regenerated and inspected. And yes to the sign-in alias, which matters only once dark is reachable (F1).
- **Meanwhile:** Unpriced chips keep Slate text (D9 item 2's interim), and UX PR 21 (`co-001/ux-status-chip`) builds the one chip on today's tokens; the sign-in layout keeps Paper, exempted by name from the palette-primitive check.

**F4. The screening's kept-data notices, and the closed link's order: reshape them?** (UX-122 (C-102))

- **Why it is the founder's:** They are legal surfaces on `HANDOFF.md`'s counsel list (`docs/product/legal-surfaces.md`: decision 7's kept counts, the screening terms, the campaign-code wording), so even a reshaping is the founder's before counsel.
- **Options:**
  - (a) Leave them as they are until counsel.
  - (b) Keep every clause and change only the shape, as the proposed text for counsel: one lead sentence ('This link opens your result until 2026-11-25, or until a later screening for the same practice or from the same email address replaces it.'), then two short lists ('Then we delete:' and 'We keep a record of counts that names no one:'); a one-line summary at the top of the result with the full notice below it; the email hint as a 'What we keep' disclosure at body size; 'kind of paid click' as 'whether you came from a paid ad'; and the kept texts' 'from your upload' in the same words as the rest of the page, which now says 'choose' and 'send' (UX-041 (C-117)).
  - And the closed link's page (`screening-kept-closed-link`, `docs/product/legal-surfaces.md:20`; UX-136 (C-121)): (i) keep the kept notice first, as today; or (ii) put the next steps first ('Check that you copied the whole link from the email. If you sent your file only a few minutes ago, the screening may still be pricing ...') with the notice's words unchanged after them.
- **Recommendation:** (b), and (ii) for the closed link: the prospect reads the result and the next step first, and each notice stays whole and easier to read.
- **Meanwhile:** UX PR 63 (`co-001/ux-screening-result-first`) and UX PR 84 (`co-001/ux-screening-upload-page`) reorder the result and the upload page around the notices without moving or changing a word of them, and reword the closed link's other sentences in place; `legal-surfaces.test.ts` holds the markers. UX PR 89 (`co-001/ux-screening-kept-notices`) applies the answer after #42 merges.

**F5. The screening's sentences held for counsel: the two ZIP sentences and the left-out line** (UX-057 (C-052))

- **Why it is the founder's:** The ZIP sentences are the founder's ruled wording (Q12), held for counsel. The left-out line (UX-205) states the 11-claim-line floor and a left-out total under 11, which `HANDOFF.md:92` puts on counsel's list.
- **Options:**
  - (a) Keep the two ruled sentences (`apps/web/src/lib/screening/routes.ts:700` and `:701`) as they are.
  - (b) Add one next step to each, 'Request an audit instead.', linking to `/request-audit`, and drop `:701`'s 'Try again later.'
  - And the left-out line: (i) keep it ('2 rows of fewer than 11 claim lines each, 11 claim lines and $436.84 allowed'); or (ii) the same clauses as one sentence, as the proposed text for counsel: 'Left out: 2 rows with fewer than 11 claim lines each (11 claim lines and $436.84 allowed in all).', with the amount in the mono face.
- **Recommendation:** (b): every refusal gets a step that works, and it promises no timing; and (ii): the line reads as one statement, with the floor and the total unchanged. The practice's own sentence (`packages/contracts/src/location.ts:65`) and the screening's unknown-ZIP message (`routes.ts:710`) are wording and were taken (UX PR 57 (`co-001/ux-console-records`) and UX PR 85 (`co-001/ux-screening-messages`)).
- **Meanwhile:** The sentences stay as they are; UX PR 85 (`co-001/ux-screening-messages`) applies the answers after #42 merges.

## 7. Findings, ranked

Ranked blocking first, then should fix, then polish; within each by harm area (money or status; data or work; task flow; accessibility; then clarity, consistency or brand) and then by reach (routes plus roles). Each finding keeps its canonical id beside its UX id. The UX ids were fixed at the first ranking: the four findings re-graded to blocking on review keep theirs and are listed with the blocking group. Shot ids name the screenshots in the galleries; file:line reads as at 4d99df8.

### UX-001 (C-001). A refused form throws away what the person typed, or puts back a different value beside the error

- **Severity:** blocking. Harm area: money or status. Reach: 18 routes, 7 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator, screening prospect, anyone signing in.
- **Screens:** `console.models.error.1280`, `p.submissions.error.1280`, `p.case.error.1280`, `p.roi.error.1280`, `settings.billing-org.error.1280`, `request-audit.error.1280`, `p.pricing-settings.error.1280`, `sign-in.error-wrong-password.1280`.
- **Routes:** `/sign-in`, `/request-audit`, `/support`, `/console/models`, `/console/status`, `/console/terms`, `/console/support`, `/console/practices/[practiceId]`, `/settings/billing/[organizationId]`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/submissions`, `/p/[practiceId]/reports/roi`, `/p/[practiceId]/settings/pricing`, `/p/[practiceId]/settings/correspondence`, `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/claims`.
- **Evidence:** After any refusal every uncontrolled field goes back to its defaultValue. The person sees: the console's model flag back at 'Kill switch (every model feature off)' for 'Everyone' under 'value: a budget in whole cents', so typing 500 as asked submits a kill switch (`console.models.error`); the payer response back at 'Accepted' after 'Partial' was refused (`p.submissions.error`) and the write-off reason back at 'Window passed' after 'Other' (`p.case.error`), so a retry records a choice the person did not make; ROI's suggested 07/01/2026 to 09/30/2026, a valid period, beside 'the period ends on or after its first day' (`reports/roi/page.tsx:53-54`); the stored ZIP 27601 outlined red (`settings/pricing/page.tsx:107`, `console/practices/[practiceId]/page.tsx:82`); the simulator's valid routing number back in the field under 'a nine-digit routing number' (PR #47 moved that field to `components/billing/payment-method-card.tsx:101`, still `defaultValue={testRouting}`, so PR #47 did not fix it); all eight public request-audit fields and the support message blank; the sign-in email gone. Cause, confirmed at 4d99df8: `apps/web/src/components/action-form.tsx:32` takes useActionState's dispatcher and `:65` passes it as `<form action={formAction}>`; React 19 requests a form reset before every function action it runs, so a refusal (`apps/web/src/lib/http/next.ts:161-173`) returns over emptied fields, and `ActionState` (`next.ts:124-129`) carries no values. The component's own comment (`action-form.tsx:9-11`) says only that success redirects; it says nothing of a refusal (PR #50's new comment does claim 'the form keeps its state', which this PR corrects when the two meet). 112 `<ActionForm` uses in 60 files share the cause. The screening upload form keeps its values because it submits through onSubmit, preventDefault and startTransition (`components/screening/upload-form.tsx:117-142,159`).
- **Rule:** WCAG 2.2 3.3.7 Redundant Entry (A, adopted by combined audit #103); WCAG 2.1 3.3.1 Error Identification and 3.3.3 Error Suggestion; `docs/product/PRD.md:256` (every error shown with a next step)
- **Fix:** Fix it once in `ActionForm`, client side. Keep `action={formAction}` so the form still posts without script, and add `onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter); startTransition(() => formAction(data)); }}`. A dispatch made by hand is not followed by React's reset, so every typed value, choice and tick stays as the person left it, and nothing is echoed back from the server (no refused text, which may be what the no-PHI check caught, travels in the action state). After a refusal, clear only password and one-time-code inputs (3.3.7's security exception) and keep the email. Success still redirects to a fresh page with a fresh request key. Tests: `action-form.test.tsx` (a refused state keeps an input's, a select's, a textarea's and a checkbox's values and clears a password), and one e2e refusal per form family (write-off reason, payer response, ROI period, ZIP, model flag, sign-in email) asserting the refused value is still there.
- **Size:** S.
- **Files:** `apps/web/src/components/action-form.tsx`, `apps/web/src/components/action-form.test.tsx` (from PR #50), `apps/web/e2e/triage.spec.ts`, `apps/web/e2e/sign-in.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** `co-001/ux-forms`: the form keeps every value after a refusal (in flight, its own session)
- **Proposed PR:** UX PR 1 `co-001/ux-forms`.
- **Sources:** `a11y-other-01`, `a11y-practice-1-03`, `a11y-practice-2-01`, `flows-other-01`, `flows-practice-33`, `narrow-other-01`, `narrow-practice-1-07`, `narrow-practice-2-01`, `words-practice-06`.
- **Verification:** corrected: the billing routing field moved in PR #47 to `components/billing/payment-method-card.tsx:101` (still reset; PR #47 did not fix it); every other cited line confirmed at 4d99df8
- **Notes:** Three fixes were proposed. Chosen: the client-only onSubmit dispatch (five members), because it keeps every field with no per-field code, and echoes nothing back from the server. Writing values back from a captured FormData (a11y-practice-2-01, narrow-practice-2-01) does the same work by hand per control type and still runs React's reset first. Returning values in `ActionState` (flows-practice-33, words-practice-06) sends the person's text, possibly what the no-PHI check refused, back through the server and the page; once the field keeps its value, a message can still quote it client side. Not audit #48: only the narrative draft overlaps it. Open PR #50 adds `refreshOnError` to `action-form.tsx`; whichever merges second keeps both. The pre-answered write-off reason and payer response are UX-035 (C-065).

### UX-002 (C-003). Money settings treat cents as dollars: Settings > Defaults shows $5.00 as '$500 per line' and pre-fills the dollar fields with cents, so saving the form unchanged raises both thresholds 100-fold; the console's model budget is typed in cents

- **Severity:** blocking. Harm area: money or status. Reach: 3 routes, 3 roles.
- **Roles:** billing manager, practice administrator, platform operator.
- **Screens:** `p.defaults.default.1280`, `p.defaults.default.390`, `p.cases.empty.1280`, `p.defaults.notice.1280`, `p.defaults.error.390`, `p.defaults.admin-view.1280`, `console.models.default.1280`, `console.models.error.1280`.
- **Routes:** `/p/[practiceId]/settings/defaults`, `/p/[practiceId]/cases`, `/console/models`.
- **Evidence:** On NORTH (defaults: 500 and 25000 cents) the card reads 'Now $500 per line and $25000 per case' and 'Per line (dollars)' / 'Per case (dollars)' arrive pre-filled 500 and 25000, while the same practice's Cases screen reads $5.00 and $250.00. Cause: the page route returns cents as bare text (`apps/web/src/lib/routes/settings.ts:292` `const text = (cents) => centsToString(cents)`, used at :295 and :299); the page prints it after a typed '$' (`apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx:40`, pursuit at :62) and uses it as the dollar fields' defaultValue (:48-49, :70); the action parses those fields as dollars (`settings.ts:271-275` 'dollars and cents, such as 5.00', saved at :314). Saving untouched stores $500.00 and $25,000.00, so triage stops pursuing every shortfall under $500. The Cases form formats the same values right (`apps/web/src/app/p/[practiceId]/cases/page.tsx:177`, :181 `dollars(...)`). The console's Set a flag takes a budget as typed cents in one free 'Value' field (`apps/web/src/app/console/models/page.tsx:81` 'whole cents for a budget (500 is $5.00)'; refusal `apps/web/src/lib/routes/console-models.ts:158`). The figures also miss the mono face and the thousands separator.
- **Rule:** `CLAUDE.md` rule 2; `docs/product/PRD.md:256` (every money value rendered from cents in the practice's locale); `.claude/rules/brand.md:36` (money in the mono font)
- **Fix:** Take the in-flight PR's shape: one module `apps/web/src/lib/money-input.ts` (`dollarsField` schema and `dollarsForInput`) used by the Defaults and Cases forms, every shown amount through `<Money>` ('Now $5.00 per line and $250.00 per case.'; '$45.00 an hour'), the cards in `components/settings/defaults.tsx`, the console budget entered as 'Daily budget (dollars)' and converted to integer cents in code, and tests that saving each form unchanged leaves the stored cents unchanged. `settings.ts` imports `dollarsField` after #42 merges (Lane A hand-over already recorded by that PR).
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx`, `apps/web/src/components/settings/defaults.tsx` (from PR #54, merged), `apps/web/src/lib/money-input.ts` (from PR #54, merged), `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/console/models/page.tsx`, `apps/web/src/lib/routes/console-models.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** `co-001/materiality-cents` (merged as PR #54): settings amounts in dollars; the console budget in dollars
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `flows-practice-01`, `narrow-practice-2-02`, `words-practice-11`, `words-other-21`.
- **Verification:** confirmed
- **Notes:** Members split on #42: flows-practice-01 and words-practice-11 fix it in `settings.ts` (a #42 file); narrow-practice-2-02 fixes it in the page. PR #54 chose the page and a shared helper and leaves `settings.ts` untouched (its status file), so no #42 file. PR #54 also owns the console budget (added 2026-10-26 ~04:22). The flag form's switch half (On/Off) is UX-038 (C-059). The two materiality forms (Cases and Settings) are UX-125 (C-063).

### UX-020 (C-124). A case reopened by a recoupment reads 'Awaiting response' (and the home counts it 'awaiting a response') though nothing was ever sent

- **Severity:** blocking (re-graded on review from should fix). Harm area: money or status. Reach: 3 routes, 3 roles.
- **Roles:** billing manager, practice administrator, viewer.
- **Screens:** `p.case.viewer.1280`, `p.home.default.1280`, `p.reconciliation.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]`, `/p/[practiceId]/cases`.
- **Evidence:** LEDGER's case shows the chip 'Awaiting response' beside 'No packet yet. Not submitted yet.', and the home counts '1 awaiting a response' (`apps/web/src/app/p/[practiceId]/page.tsx:110-117`). The database derives `awaiting_response` whenever a line was reopened (`packages/db/functions/case_rules.sql:59-60`, the body in force; ADR 0068), here by the payer's $18.00 take-back. What the practice must do (re-dispute the amount taken back, or accept it) is the opposite of waiting.
- **Rule:** Combined audit #89 (one shared wording for status: step plus outcome, such as 'Reopened by a recoupment'); the brief (states that contradict each other)
- **Fix:** Word the case state everywhere through one function that words the derived state by its cause: when it came from reopened lines with no submission, 'Reopened: the payer took back $18.00 on 2026-08-03' with the next step ('Build a packet for the reopened line, or write it off'), counted on the home as 'reopened by a payer', not 'awaiting a response'. The database state and its transitions stay audit #89's.
- **Size:** S.
- **Files:** `apps/web/src/components/triage/display.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 12 `co-001/ux-case-summary`.
- **Sources:** `flows-practice-10`.
- **Verification:** confirmed
- **Notes:** Re-graded from should fix to blocking on review: the case reads 'Awaiting response' while the practice must act, so a person is misled about status (`reviewer-common.md:52`). A display-layer fix ahead of audit #89; audit #89's migration (Lane A's PR 8) later replaces the derivation. PR #51 changes the case and home pages: land after it. Words chosen under the co-founder's ruling (above).

### UX-003 (C-009). Actionable reads $0.00 on the practice home and $30.00 on the ROI statement for the same open case, and the home tile pairs $0.00 with '1 line' (earlier tour item, still present)

- **Severity:** blocking. Harm area: money or status. Reach: 2 routes, 3 roles.
- **Roles:** billing manager, practice administrator, organization administrator.
- **Screens:** `p.home.default.1280`, `p.roi-statement.default.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/reports/roi/[statementId]`.
- **Evidence:** On LEDGER the home tile reads 'Actionable $0.00 / what the packets ask for: 1 line in cases still being worked' while the ROI statement reads 'Actionable in open cases: $30.00'. Three definitions: the tile's dollars sum `ACTIONABLE_NOW` (`apps/web/src/lib/triage/queries.ts:354-357`, stage actionable and pricing current; summed at `apps/web/src/lib/dashboard/queries.ts:97`), but its line count uses no pricing check (`dashboard/queries.ts:93-96`; `ACTIONABLE_NOW_LINES` at `triage/queries.ts:360-363` is not used there); the ROI statement sums the case's stored `c.actionable_cents` (`apps/worker/src/reconcile/statements.ts:73`), which keeps lines that have since dropped out (the comment at `triage/queries.ts:350-352` says the stored column is stale until Lane A's PR 11). The tile renders at `apps/web/src/app/p/[practiceId]/page.tsx:199-205`.
- **Rule:** `docs/product/PRD.md:242` and :331 (a case total equals the sum of its actionable lines); `PRD.md:520` (actionable is what the packets ask for, shown with its label); `docs/brand/BRAND.md:23` ('exact'). Corrected on review: the earlier citation, `PRD.md:258,` is a heading.
- **Fix:** One definition of the actionable figure for every screen and document: move `ACTIONABLE_NOW` and `ACTIONABLE_NOW_LINES` (`apps/web/src/lib/triage/queries.ts:354-363`) into one shared SQL module in `@tp/triage`, `packages/triage/src/actionable-sql.ts` (new), which both apps already import (`apps/web/package.json:35`, `apps/worker/package.json:51`; the worker cannot import from `apps/web`, and a `@tp/worker` export would fall under #42's new `web-entries.test.ts`), have the home tile count with `ACTIONABLE_NOW_LINES` and the ROI statement's open-case figure read `ACTIONABLE_NOW` instead of the stored column, and add a test that the tile, the Cases screen and the statement agree on one fixture. Words through `counted()`: 'what the packets ask for: 0 lines in cases still being worked', and where lines left the figure, '(1 line is no longer actionable: priced again or moved on)'.
- **Size:** M.
- **Files:** `packages/triage/src/actionable-sql.ts` (new), `packages/triage/src/index.ts`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/lib/triage/queries.ts`, `apps/worker/src/reconcile/statements.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 9 `co-001/ux-home-figures`.
- **Sources:** `words-practice-15`.
- **Verification:** confirmed
- **Notes:** Not inside audit #12 (PR #51 changes the home page's payer-approved note and `packages/triage/src/headline.ts`, not the actionable figure or `statements.ts`) nor audit #46 (the seal). Land after PR #51 merges (both change the home page). The statement change is in `apps/worker/src/reconcile/statements.ts`'s query, not in `packages/ledger`: `roiStatement` and every ledger entry are untouched, and actionable is not a ledger stage, so the ledger freeze holds; the adversarial reviewer confirmed that reading (`roi_statement_rules()` checks only the recovered and interest sums). The change still alters what `actionable_open_cents` holds for statements generated after it, beside `apps/worker/src/reconcile/statements.ts:10-12`'s rule that recovered is computed there and nowhere else. So the PR takes the payment-engine review and a test that LED-11 passes unchanged, and lands before the first production deploy, when no stored statement can hold the old meaning; if it lands later, the statement page dates the change by `generated_at`. Lane A's PR 11 later refreshes the stored column (`triage/queries.ts:348-352`); the live predicate stays the one definition.

### UX-024 (C-084). After the payer answers in part, the case says 'Resolved' and drops the amount asked and the amount not accepted, so nobody decides what to do with the rest

- **Severity:** blocking (re-graded on review from should fix). Harm area: money or status. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.case.default.1280`, `p.submissions.default.1280`, `p.cases.default.1280`, `p.home.tiles.1280`, `p.case.write-off-open.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases`, `/p/[practiceId]`.
- **Evidence:** PACKETS' case asked $90.00 on 3 lines and the payer partly accepted $60.00 (submission log). The case reads 'Resolved' with Actionable $0.00, Payer approved $60.00, Recovered (posted) $0.00 and Written off $0.00 (`apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx:73-106`); no figure states the $90.00 asked or the $30.00 not accepted, and 'Packet and dispute' says only 'the payer has answered' (:140-142). The Cases list and the home count it '1 resolved' with $0.00 actionable, so it leaves the working queue while no cash has posted and $30.00 is unexplained.
- **Rule:** Combined audit #89 (one case status; a closed state only for a case that was paid); `docs/product/PRD.md:279` (submissions and responses per case)
- **Fix:** On the case summary show the dispute's own figures, computed by code: asked (the exported version's shortfall), accepted by the payer (the latest response), not accepted (asked less accepted), payer approved and recovered (ledger), each with its stage label. Under 'Packet and dispute' print the latest answer in words ('Partly accepted on 2026-10-26: $60.00 of $90.00') with the next step for the remainder ('Write a level 2 packet' or 'Write the remainder off as payer correct on review'). The state words follow audit #89 when it lands.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/lib/cases/workbench.ts`, `apps/web/src/lib/packets/submissions.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 12 `co-001/ux-case-summary`.
- **Sources:** `flows-practice-06`.
- **Verification:** confirmed
- **Notes:** Re-graded from should fix to blocking on review: the case reads 'Resolved' while $30.00 is unexplained and no cash has posted, so a person is misled about money and status (the blocking test, `reviewer-common.md:52`). The figures and the answer in words need no migration and land in Lane B after PR #51 (which adds to this summary), built in one shared helper that Lane A's PR 13's Overview tab reuses, with the stage labels Lane A's PR 13 keeps. The state vocabulary ('Answered: partly accepted, cash not posted' in place of 'Resolved') is combined audit #89's, in Lane A's PRs 8, 10 and 13; a partial answer spread over every line is audit #11, the ledger side, untouched here. Words chosen under the co-founder's ruling (above).

### UX-004 (C-010). A suspended organization's billing page says 'In good standing' directly above 'New runs have stopped', with no reason and no next step

- **Severity:** blocking. Harm area: money or status. Reach: 2 routes, 2 roles.
- **Roles:** organization administrator, platform operator.
- **Screens:** `settings.billing-org.suspended.1280`, `console.organization.suspended.1280`.
- **Routes:** `/settings/billing/[organizationId]`, `/console/organizations/[organizationId]`.
- **Evidence:** The Standing badge reads `billing.standing` alone (`apps/web/src/app/settings/billing/[organizationId]/page.tsx:43`, labels at :19), which stays 'good' when a platform administrator suspends the organization; the red alert below reads the organization's status (:46-50, text from `apps/web/src/lib/routes/billing.ts:156-158`). So the firm principal reads 'Standing: In good standing' and, under it, 'New runs have stopped: A platform administrator has suspended the organization ...'. Neither says why or what to do: the console's Suspend posts only a status (`apps/web/src/lib/routes/console.ts:96`, update at :107), so no column holds why PaidWhole suspended the organization, and the customer alert links nowhere. (A refused run already carries a reason, 'the organization is suspended: ...', from `organization_run_refusal()`, `packages/db/functions/organization_run_refusal.sql:14-18`, shown as 'Not started: <reason>' by `apps/web/src/lib/http/next.ts:170-171`, so the console card's 'with the reason' at `console/organizations/[organizationId]/page.tsx:60` is true of runs.) Still true after PR #47, which moved these lines but did not change the standing.
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step); the brief's blocking test (misled about status)
- **Fix:** Work out one standing in `billing.ts` from both facts and show only that: when the organization is suspended the badge reads 'Suspended by PaidWhole' (destructive), when closed 'Closed', never 'In good standing'. The console's Suspend asks for a reason from a closed list (unpaid invoice, at the customer's request, security hold, agreement ended) and an optional note, stored with its time and audited; the customer's alert names that reason and its next step ('Pay invoice SIM-0002' or 'Open a support ticket' linking to `/support`), so the customer can act on it. Add the pairing (suspended plus good billing) to the billing page's test.
- **Size:** M.
- **Files:** `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/lib/routes/billing.ts`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/routes/console.ts`.
- **Migration:** yes, for Lane A: Storing the suspension's reason (a closed-list value), note and time on `organization` (or a status-event table), so the customer's page can say why PaidWhole suspended the organization and what to do next, and the console can show it; and the console route's write of them in `lib/routes/console.ts` (a #42 file), after #42 merges.
- **#42:** yes: `apps/web/src/lib/routes/console.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 2 `co-001/ux-suspended-standing` (one standing in `billing.ts`, the badge and the next step).
- **Sources:** `flows-other-11`.
- **Verification:** corrected: the badge is at `page.tsx:43` and the alert at :46-50 at 4d99df8 (the finding cites :41-50 at 6ddd587; PR #47 moved them without fixing them)
- **Notes:** Split: Lane B's part (one standing in `billing.ts`, the badge, the next step to `/support`) needs no migration and no #42 file, and lands now; the stored reason and its console form go to Lane A under 'Handed to Lane A'. Words chosen under the co-founder's ruling: 'Suspended by PaidWhole'; 'Open a support ticket'. Corrected on review: the console card's 'with the reason' was called false; it is true of refused runs, and the hand-over rests on what the customer needs.

### UX-035 (C-065). Choices that record a fact arrive pre-answered: a write-off reason of 'Window passed' and a payer response of 'Accepted'

- **Severity:** blocking (re-graded on review from should fix). Harm area: money or status. Reach: 2 routes, 1 roles.
- **Roles:** billing manager.
- **Screens:** `p.case.write-off-open.1280`, `p.submissions.default.1280`, `p.submissions.notice.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/submissions`.
- **Evidence:** The write-off Reason select has no empty option, so it arrives on the first reason, 'Window passed' (`packages/triage/src/cases.ts:97`; `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx:207-214`), and its `required` never fires; on `p.case.write-off-open.1280` it offers 'Window passed' for a line whose window is open until 2036-04-05. 'Log a payer response' arrives on 'Accepted' (`cases/[caseId]/submissions/page.tsx:307-313`) with 'Received on' prefilled with today (`:317`), so a hurried 'Record the response' logs an acceptance the payer never gave. Both are audited facts about money that feed the case, the ledger's matching and the reports. The route already requires an amount for accepted and partial responses (`apps/web/src/lib/routes/submissions.ts:235-238`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 3.3.4 Error Prevention (Legal, Financial, Data) and 3.3.2 Labels or Instructions; `docs/product/PRD.md:302` (a destructive action confirms with its consequence stated)
- **Fix:** Give both selects a first, empty, disabled option so `required` forces a choice. Words (taken under the co-founder's ruling): 'Choose the reason' and 'Choose the payer's answer'. For a write-off, list only the reasons that can be true for the line (no 'Window passed' while its window is open), and refuse that reason server-side for a line whose window is open, in the write-off route. Keep 'Received on' prefilled (a date the person sees and can change), but say under the response select what an acceptance records.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/lib/routes/triage.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 10 `co-001/ux-payer-response`.
- **Sources:** `flows-practice-07`.
- **Verification:** corrected: the reason label is at `packages/triage/src/cases.ts:97` (not :93); the 'required amount for accepted and partial' part of the member's fix already holds in `routes/submissions.ts:235-238` and is dropped
- **Notes:** Re-graded from should fix to blocking on review: a hurried save records an acceptance the payer never gave, an audited fact about money that feeds the ledger's matching (`reviewer-common.md:52`: misled about money or status). The refused-form reset (UX-001 (C-001)) makes this worse: a refusal silently puts 'Window passed' back. Open PR #51 changes all three files (audit #12): land after it. Bulk write-off (audit #125) should reuse the same empty-first reason select. The reason list itself stays in `packages/triage`; only the web route adds the check.

### UX-005 (C-008). On a phone the screening result's tables hide Allowed, Difference and Status with nothing to say they scroll, so all four 'anomaly' rows read alike

- **Severity:** blocking. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.390`, `screening-result.converted.390`, `screening-result.error-name.390`, `screening-result.default.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** `screening-result.default.390`: 'Anomalies by code and payer product' shows Code, Payer product, Rows, Claim lines and the first Medicare figure; Allowed in your file, both differences and Status are past the card edge. The lede says '1 group of 4 is an anomaly', but the four rows show no status, so on a phone they all read as anomalies. Coverage shows only Payer product and Outcome; 'Rows with the largest differences' stops at a clipped Payer product. Causes, confirmed at 4d99df8: a ten-column table in a region with no visible cue (`apps/web/src/components/screening/anomalies.tsx:286-299`), the top-rows table the same (`:359-360`), and Coverage in a bare `overflow-x-auto` div with no role, name or tabIndex (`components/screening/coverage.tsx:61-62`). A scroll cue alone would still leave expected, allowed and difference apart.
- **Rule:** `.claude/rules/brand.md:36-37` (expected, paid and short appear in that order) and `docs/brand/BRAND.md` section 7, Tables; ADR 0056:51-53; WCAG 2.1 2.1.1 Keyboard (`coverage.tsx:61`); `docs/product/PRD.md:256`
- **Fix:** Below the `sm` breakpoint, render each row of the three screening tables as a stacked block: the code and payer product as its heading; the Medicare figure(s), 'Allowed in your file' and the Difference as a definition list in the mono face, in the brand's order; the Status as text on its tint on its own line. From `sm` up keep the tables, each inside `ScrollTable` (Coverage included, UX-011 (C-002)). The stacked block is UX-011 (C-002)'s one stacked-row primitive, not a local layout. Add a 390 px check that every anomaly row's Status and Difference are visible without scrolling, in a new spec (`apps/web/e2e/screening-phone.spec.ts`) that uses #42's screening helpers unchanged, so this PR need not wait for #42.
- **Size:** M.
- **Files:** `apps/web/src/components/screening/anomalies.tsx`, `apps/web/src/components/screening/coverage.tsx`, `apps/web/e2e/screening-phone.spec.ts` (new).
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 4 `co-001/ux-screening-result-tables`.
- **Sources:** `narrow-other-05`.
- **Verification:** confirmed
- **Notes:** Updates the earlier tour's '1280 screening result tables run past the edge': at 390 px they are clipped, not overflowing, and one layout fixes both widths. The cluster listed `e2e/screening.spec.ts` (#42's) for the check; a new spec file keeps the PR clear of #42; it calls `apps/web/e2e/screening.ts`, which #42 changes (`pr42-files.txt` line 7), so whichever of the two merges second updates the new spec if a helper it calls changed. This is the prospect's first and only view of the product. Wrapping coverage in `ScrollTable`, and the stacked rows, come from UX-011 (C-002)'s PR (`ux-table-scroll`), which now lands first. Kept blocking on review (the adversarial reviewer suggested should fix): Coverage's wrapper has no tab stop (`coverage.tsx:61-62`), so a keyboard user can never reach its hidden columns (2.1.1), the same tables run past the right edge at 1280 px (the earlier tour's item 3), and on a phone the lede's one claim, which group is the anomaly, cannot be checked on screen.

### UX-039 (C-086). Ledger corrections lists shortfalls from the first 25 case lines only, with no way to the rest, and says 'No shortfall on this page of case lines' about a page it never shows

- **Severity:** blocking (re-graded on review from should fix). Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** contract specialist.
- **Screens:** `p.abstraction-ledger.adjust-open.390`, `p.abstraction-ledger.default.1280`.
- **Routes:** `/p/[practiceId]/abstraction/ledger`.
- **Evidence:** The page's shortfalls are the Reconciliation query's current page of case lines filtered to those with a shortfall (`apps/web/src/lib/routes/specialist.ts:114-118`); that query reads 25 case lines a page (`apps/web/src/lib/reconciliation/queries.ts:289`) and computes shortfalls only for them (:405). The only pager on this screen is the entries' (`abstraction/ledger/page.tsx:150`); `?lines=` exists (`specialist.ts:112`) but nothing links to it. So a shortfall on case line 26 or later never appears on the screen built to correct it, while the empty state reads 'No shortfall on this page of case lines' (`page.tsx:129`). No synthetic practice has more than 25 linked lines, so no shot shows the cut itself.
- **Rule:** `docs/product/PRD.md:256` (every list paginated server-side); `PRD.md:260` (an empty state says what to do next); never 'none' over a subset (accuracy)
- **Fix:** Make Shortfalls its own list: `ledgerReviewPage` reads every case line of the practice whose approval a remittance reprocessed, computes shortfalls with the same `approvalShortfalls` called unchanged, and pages them on their own ('Shortfalls (3)', a Pager with param `shortfalls`, 10 a page, largest first). Drop the case-line window from this page. Empty state: 'No shortfall' with 'Every payer approval that a remittance reprocessed was paid in full. A shortfall appears here when a remittance pays part of what the payer's response accepted.' Add a route test with 26 case lines and the shortfall on the 26th.
- **Size:** M.
- **Files:** `apps/web/src/lib/routes/specialist.ts`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/lib/reconciliation/queries.ts`, `apps/web/src/lib/routes/reconciliation-routes.db.test.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 13 `co-001/ux-ledger-corrections`.
- **Sources:** `retake-07`.
- **Verification:** confirmed
- **Notes:** Re-graded from should fix to blocking on review: shortfalls past case line 25 never appear under a false 'No shortfall on this page of case lines', so a person is misled about money (`reviewer-common.md:52`). Read side only: `approvalShortfalls` (from `@tp/worker/ledger`) is called as it is, so no reconcile or ledger logic moves. Open PR #51 changes this page, `queries.ts` and `apps/worker/src/reconcile/shortfalls.ts`: land after it. Empty-state words chosen under the co-founder's ruling (above).

### UX-006 (C-005). No way back in for a person who forgets a password or loses an authenticator or hardware key: sign-in is a dead end

- **Severity:** blocking. Harm area: task flow. Reach: 6 routes, 3 roles.
- **Roles:** anyone signing in, organization administrator, operator.
- **Screens:** `sign-in.default.1280`, `sign-in-mfa.default.1280`, `sign-in-hardware-key.default.1280`, `sign-in.error-locked.1280`, `account.devices.default.1280`, `settings.users.default.1280`.
- **Routes:** `/sign-in`, `/sign-in/mfa`, `/sign-in/hardware-key`, `/account/devices`, `/settings/organizations/[organizationId]/users`, `/console/organizations/[organizationId]`.
- **Evidence:** The sign-in page offers Continue, a hardware-key link, 'New here? Request an audit' and 'Trouble signing in? Check the service status' (`apps/web/src/app/sign-in/page.tsx:26-48`): no 'Forgot your password?'. The code step says nothing about a lost phone (`sign-in/mfa/page.tsx:20-25`). No password or second-factor reset exists anywhere in `apps` or `packages`. The locked notice says 'A platform administrator can unlock it.' (`sign-in/notice.tsx:17`) but no sign-in page names how to reach one: the support address is on `/status` and `/maintenance` only, and `/support` needs a session. The organization's administrator sees only active, invited or 'no MFA' (`settings/organizations/[organizationId]/users/page.tsx:69`); only the console has Unlock (`console/organizations/[organizationId]/page.tsx:155`), and nothing resets a second factor. The account area holds Devices, Notification preferences, Billing and Help (`apps/web/src/components/shell.tsx:281-294`), with no page to change a password, move the authenticator or add a second key. 'New here? Request an audit' sends an invited user, who is also new, to the prospect form. The user pool already allows email recovery (`infra/lib/constructs/identity.ts:84`), so a reset needs no infrastructure change.
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step); `PRD.md:266` (Sign-in and MFA: a lockout implies an unlock path the person can reach)
- **Fix:** Give every sign-in step a way forward, with the safer security choice at each point. (1) `/sign-in`: 'Forgot your password?' starts the identity provider's reset by email (Cognito ForgotPassword and ConfirmForgotPassword; the local store's equivalent), answers the same whether or not the address exists, is rate limited through the existing `sign_in` bucket (`apps/web/src/lib/http/rate-limit.ts:39`; a new bucket would edit that #42 file), records the security events `password_reset_requested` and `password_reset_completed` through `record_security_event()` (migration `20261015180000_tenancy_hardening.sql:90`; the purpose CHECK is a pattern, `20261015140500_audit_and_operations.sql:15`, so no DDL; the design confirms the function admits a request with no signed-in actor, or that event goes to Lane A), and still asks for the second factor afterwards. It is a new provider call (Cognito's public `ForgotPassword` and `ConfirmForgotPassword`, so no IAM change) through `AuthProvider` and its two implementations (`apps/web/src/lib/auth/provider.ts`, `cognito-provider.ts`, `dev-provider.ts`) and the sign-in service (`sign-in.ts`). (2) `/sign-in/mfa` and `/sign-in/hardware-key`: 'Lost your authenticator app? Write to <support address> from the address you sign in with. A platform administrator checks with your organization's administrator, resets your two-step verification, and you set it up again at your next sign-in.' The reset is the console's, beside Unlock (`unlockUser`, `apps/web/src/lib/routes/console.ts:579`): 'Reset two-step verification', platform administrator only, hardware-key session, audited, ending the person's sessions and emailing them. The authenticator lives in Cognito (`cognito-provider.ts:221,239`; the pool requires MFA, `infra/lib/constructs/identity.ts:71`), so the reset is Cognito's `AdminSetUserMFAPreference` plus `user.mfa_enrolled` set false (already granted to the app and admitted for a platform administrator: `packages/db/migrations/20261015140000_tenancy.sql:599`, policy at :509). The web role may make three Cognito admin calls only (`infra/lib/constructs/application-role.ts:14`, pinned by `infra/test/application-role.test.ts:20`), so the call needs a new grant, put on the narrowest role that can hold it: the security reviewer chooses at design between the web task's role and a worker job's (recommended: the worker's, so the internet-facing task cannot strip a factor by itself). `console.ts`, both infra files and the mail it sends are #42's, so this part lands after #42 merges. A lost hardware key has no administrator path: keys are Cognito passkeys, listed and registered with the person's own token (`cognito-provider.ts:284-299`), and Cognito offers an administrator no call to delete one. So a second registered key (part 4) is the recovery for staff, and otherwise a re-invitation; the help line never promises a key reset. (3) Users and roles shows 'Locked' to the organization's administrator, with 'Ask PaidWhole support to unlock'. (4) An account page 'Sign-in and security': change password, replace the authenticator (current code first), add a second hardware key for staff. Each of these Cognito calls needs the person's own access token, which sign-in revokes once the app's session opens (`apps/web/src/lib/auth/sign-in.ts:139-153` calls `provider.release`, `cognito-provider.ts:309-313`), so the page starts with a re-authentication step: the password and a code again, through the provider, for a fresh token used only for that change. (5) Replace the sign-in help line (taken under the co-founder's ruling): 'Invited by your organization? Use the email and temporary password from your invitation. Forgot your password? Use the link above. Lost your authenticator app? Write to <support address>. Lost a hardware key? Sign in with your second key. New to PaidWhole? Request an audit. Service status.' Land the sign-in pages and words first; the account menu link waits for #42 (`shell.tsx`).
- **Size:** L.
- **Files:** `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/mfa/page.tsx`, `apps/web/src/app/sign-in/hardware-key/page.tsx`, `apps/web/src/app/sign-in/notice.tsx`, `apps/web/src/app/sign-in/forgot-password/page.tsx` (new), `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/lib/auth/provider.ts`, `apps/web/src/lib/auth/cognito-provider.ts`, `apps/web/src/lib/auth/dev-provider.ts`, `apps/web/src/lib/auth/sign-in.ts`, `apps/web/src/lib/auth/dev-store.ts`, `apps/web/src/app/account/security/page.tsx` (new), `apps/web/src/lib/routes/account.ts`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/routes/console.ts`, `infra/lib/constructs/application-role.ts`, `infra/test/application-role.test.ts`, `apps/web/src/components/shell.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/console.ts`, `infra/lib/constructs/application-role.ts`, `infra/test/application-role.test.ts`, `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 7 `co-001/ux-sign-in-recovery` (parts (1), (5) and (2)'s line: the password reset, the help line, and the lost-factor line on the code and key steps); UX PR 8 `co-001/ux-account-security` (part (4): the Sign-in and security page, with its re-authentication step); UX PR 65 `co-001/ux-second-factor-reset` (part (2)'s console reset, its IAM grant and its email); UX PR 67 `co-001/ux-header-menus` (the account menu's Sign-in and security link); UX PR 75 `co-001/ux-users-page` (part (3): the Locked badge with 'Ask PaidWhole support to unlock').
- **Sources:** `flows-other-02`, `words-other-06`.
- **Verification:** confirmed
- **Notes:** Chosen: flows-other-02's full recovery, with words-other-06's words as the first part (they must not promise a reset before it exists). Security choice (the co-founder's ruling: the safer): the second-factor reset stays with a platform administrator, not the organization's administrator, so one compromised customer account cannot strip a colleague's second factor. That also keeps it migration-free: `unlock_user` (`packages/db/functions/unlock_user.sql`) and the user table's update policy already admit a platform administrator only; letting an organization's administrator unlock or reset would need a new SECURITY DEFINER function, a migration for Lane A, and is not recommended. No database table holds hardware keys (they are Cognito passkeys), so nothing here goes to Lane A. Widening a role's IAM so it can strip any user's second factor is a security trade-off named for the security reviewer (section 6.1), not taken silently. Needs the security reviewer and an ADR at design. The #42 files are `shell.tsx`, `lib/routes/console.ts`, `infra/lib/constructs/application-role.ts` and `infra/test/application-role.test.ts`: the account menu link and the console reset land after #42 merges; the password reset, the help lines and `/account/security` land now. Corrected on review: the earlier text named only `shell.tsx` and a credential table that does not exist.

### UX-007 (C-011). Logging the payer's answer sends the person to Uploads, which cannot take a payer letter; the only working path files the letter as a contract document in the specialist's abstraction queue

- **Severity:** blocking. Harm area: task flow. Reach: 4 routes, 3 roles.
- **Roles:** billing manager, packet approver, contract specialist.
- **Screens:** `p.submissions.default.1280`, `p.uploads.default.1280`, `p.uploads.era-format.1280`, `p.abstraction.default.1280`, `p.contracts.default.1280`, `p.submissions.notice.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/submissions`, `/p/[practiceId]/uploads`, `/p/[practiceId]/contracts`, `/p/[practiceId]/abstraction`.
- **Evidence:** 'Log a payer response' says 'upload the payer's letter on the Uploads screen first' and, with no document, renders no form, only 'Upload the payer's letter (as a payer letter or other document) on the Uploads screen' (`apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx:290`, :293-297). Uploads offers only '835 remittance' and 'ERA export' (`apps/web/src/app/p/[practiceId]/uploads/page.tsx:40-48`). A payer letter can be uploaded only from Contracts (`apps/web/src/lib/routes/contracts.ts:47`, :123), which is what the e2e journey does (`apps/web/e2e/packets.spec.ts:421-422`), and 'other document' cannot be uploaded anywhere. A letter uploaded there joins the contract documents: on PACKETS the payer's acceptance letter sits in 'Documents awaiting abstraction' with 'A new contract with this payer' (`apps/web/src/lib/contracts/contract-queries.ts:16`, kinds contract, exhibit, payer_letter).
- **Rule:** `docs/product/PRD.md:256` (every error with a next step, and the step must work); `PRD.md:279` (Submissions and responses: log a response with its document)
- **Fix:** Upload the response where it is used: 'Log a payer response' gets its own file field (kind payer_letter, the same presigned upload, scan and receipt as Uploads, through the shared uploader) so the letter is chosen or uploaded inside the form, and the typed fields are kept while it scans. Keep the payer letters that a payer response links out of the contract-tagging and abstraction lists (no `payer_response` names the document: `payer_response.document_id`, `packages/db/migrations/20261023090000_packets_submissions_and_responses.sql:230,254`), and list them on the submissions page. A payer's terms letter (a fee-schedule or policy letter) stays abstractable: the data model admits a payer letter as a contract version's source (`contract_version_documents_ok()`, migration `20261016160000_contracts_and_mapping.sql:291-297`; `CONTRACT_KINDS`, `apps/web/src/lib/contracts/contract-queries.ts:16`; `CONTRACT_DOCUMENT_KINDS`, `apps/web/src/lib/routes/contracts.ts:47`). The specialist's 'documents awaiting abstraction' count is `console_contract_queue()`, a SECURITY DEFINER function (`packages/db/functions/console_contract_queue.sql`), which counts every clean payer letter no version names; the same exclusion there is a migration, for Lane A. The empty state becomes 'Upload the payer's letter here; it can be chosen once it is scanned clean.' Add an e2e step that logs a response from the submissions page alone.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/lib/packets/submissions.ts`, `apps/web/src/lib/contracts/contract-queries.ts`, `apps/web/src/lib/routes/contracts.ts`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/e2e/packets.spec.ts`.
- **Migration:** yes, for Lane A: The same exclusion (a payer letter that a `payer_response` links is not awaiting abstraction) in `console_contract_queue()`, a SECURITY DEFINER function (`packages/db/functions/console_contract_queue.sql`; migration `20261016200000_contract_questions_and_queue.sql:118-140`), recreated in a new migration: Lane A. Until it lands, the console count includes response letters that the web lists leave out.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 10 `co-001/ux-payer-response`.
- **Sources:** `flows-practice-02`.
- **Verification:** confirmed
- **Notes:** Filtering needs no column: a letter uploaded from the submissions page is of kind payer_letter, and the response row links it. Corrected on review: the earlier fix took every payer letter out of abstraction by its kind, which cut the designed path for a payer's terms letter and missed the definer function's count. Open PR #51 changes `submissions/page.tsx` and `e2e/packets.spec.ts`: land after it, or the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-008 (C-012). Nothing tells the second person a packet waits for their approval: no notification, no home queue, no Cases column; the later hand-offs are as silent

- **Severity:** blocking. Harm area: task flow. Reach: 4 routes, 3 roles.
- **Roles:** packet approver, billing manager, practice administrator.
- **Screens:** `p.packet.approver-ready.1280`, `p.home.default.1280`, `p.home.tiles.1280`, `p.cases.default.1280`, `p.notifications.default.1280`, `p.packet.drafter.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/cases`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/notifications`.
- **Evidence:** 'Request approval' writes only a `case_activity` row (`apps/web/src/lib/cases/workbench.ts:110-130`): no notification (kinds are monitoring_run, digest, recoupment and follow_up, `packages/db/migrations/20261027090000_packet_and_ledger_review.sql:418`) and no mail. The home's queues list held files, plans, questions, anomalies, unowned cases, follow-ups and unmatched payments, but no packets waiting for approval, exports to make or attested exports to log (`apps/web/src/app/p/[practiceId]/page.tsx:120-130`). The Cases table never shows the packet's step. The approver finds the request only by opening each case's packet page and scrolling about 3,000 px to 'Approval requested ... by pricing-manager'. The drafter is not told of an approval, nor the practice that an export was attested.
- **Rule:** `docs/product/PRD.md:267` ('jump to any queue'); `PRD.md:278` (request approval, approve by a second person); `CLAUDE.md` Never-list: a packet is never approved by its drafter, so the second person's step is mandatory
- **Fix:** Make each packet hand-off a queue and a notification: home queues and Cases filters for 'Packets waiting for your approval', 'Approved, not exported', 'Exported, waiting for attestation' and 'Attested, submission not logged', each with its count and earliest filing deadline; a 'Packet' column on Cases (draft, approval requested, approved, exported, attested, submitted, answered); and an in-app notification (counts and a link only, no PHI) to the practice's packet approvers, excluding the drafter, when approval is requested, and to the drafter when it is approved, linking to the packet's Approval region.
- **Size:** L.
- **Files:** `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/lib/cases/workbench.ts`, `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/lib/monitoring/queries.ts`.
- **Migration:** yes, for Lane A: New notification kinds (approval requested, approved, export attested) widen `notification_kind_check`: Lane A, after #42, whose migration sets it again (`20261107090000_mail_streams.sql:797-800`, adding `support_notice_undelivered`), so the new kinds build on that, not on 20261027090000:418. The notification display and query live in `components/monitoring/display.tsx` and `lib/monitoring/queries.ts`, #42 files.
- **#42:** yes: `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/lib/monitoring/queries.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 11 `co-001/ux-packet-queues` (the home queues, the Cases filters and the Packet column).
- **Sources:** `flows-practice-03`.
- **Verification:** confirmed
- **Notes:** Split: the home queues, the Cases filters and the Packet column need no migration and no #42 file (home page, dashboard queries, cases page) and land first in Lane B, after PR #51 (which changes the home page). The notifications go to Lane A with the kinds. Queue names chosen under the co-founder's ruling (above).

### UX-009 (C-006). The terms page asks a customer to read the terms and accept them, but shows no terms: only a version, a storage reference and a hash prefix

- **Severity:** blocking. Harm area: task flow. Reach: 2 routes, 4 roles.
- **Roles:** practice administrator, billing manager, organization administrator, platform operator.
- **Screens:** `terms.default.1280`, `terms.account-menu.1280`, `terms.help.1280`, `console.terms.default.1280`, `terms.internal.1280`.
- **Routes:** `/terms`, `/console/terms`.
- **Evidence:** Every customer screen sends a person who owes the terms in force to `/terms` (`apps/web/src/lib/http/next.ts:65-66`). The card shows 'Published ... Document terms/synthetic-2026-10, SHA-256 ca88437093319f39...' as plain mono text, no link (`apps/web/src/app/terms/page.tsx:34-41`), then 'Before you use the workspace, read the terms of use and accept them.' (:61) beside 'I accept these terms' (:64). No text of the terms exists to show: the console's publish form records only a version, a reference and a typed SHA-256 (`apps/web/src/lib/routes/console-onboarding.ts:312-327`, inserted at :331). After accepting, 'Continue to your workspace' goes to '/' (:53), not to the screen the gate interrupted.
- **Rule:** `docs/product/PRD.md:256` (every error with a next step: there is nothing to read); combined audit #51 ('Show the terms before I accept')
- **Fix:** Combined audit #51's best option: publish the terms into a global append-only store of legal texts whose SHA-256 the database checks, released only with a recorded legal review over that hash; the console's publish form takes the signed-off text (or file), hashes it on the server and refuses a typed hash that differs. `/terms` renders the full text above 'I accept these terms', says what changed since the version the person last accepted, records acceptance of that exact hash, and after accepting returns the person to the page the gate sent them from. The card line becomes 'Published 26 October 2026. Read the terms of use below (version synthetic-2026-10).' with the reference and hash moved to a muted 'Version record' line.
- **Size:** M.
- **Files:** `apps/web/src/app/terms/page.tsx`, `apps/web/src/lib/routes/onboarding.ts`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/lib/routes/console-onboarding.ts`, `apps/web/src/lib/http/next.ts`.
- **Migration:** yes, for Lane A: The legal-text table of combined audit #51 (append-only, kind, body, SHA-256 checked by the database), its legal-review record kind, and a reference from `terms_version` to the reviewed text. Already Lane A's queued 'legal surfaces' tables' PR (audit #51): hand this screen evidence to it.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 87 `co-001/ux-terms-text` (the render, what changed, and the return to the page the gate came from).
- **Sources:** `flows-other-13`, `words-other-18`.
- **Verification:** confirmed
- **Notes:** The two members agree on the problem and differ on scope (serve the signed-off document vs show the text or a link); audit #51's best option settles it: the text, held and hash-checked by the database. Rendering the text changes no legal wording, so it is not a founder decision; which document is the signed-off version stays the founder's (counsel list), and the founder approves the domain model in Lane A's PR. The Lane B part (render, return-to) lands with or after that PR; serving the old reference as a link in the meantime is not the best option, because nothing checks that the stored file matches the hash.

### UX-010 (C-004). A refused fee-schedule letter download replaces Coverage with a raw JSON page: the field key 'codes', 980 px wide on a phone, no way back

- **Severity:** blocking. Harm area: task flow. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.coverage.error-letter-codes.390`, `p.coverage.error-letter-codes.1280`.
- **Routes:** `/p/[practiceId]/coverage`, `/p/[practiceId]/coverage/letter`.
- **Evidence:** Typing 'ABC' in Procedure codes and pressing 'Download the letter' navigates to `/coverage/letter?...&codes=ABC`, and the browser shows only `{"status":"invalid","issues":[{"field":"codes",...}]}`: no app frame, no words for a person, no link back, and at 390 px it lays out 980 px wide because a JSON response has no viewport. Causes, confirmed at 4d99df8: the form is a plain GET to the download route (`apps/web/src/app/p/[practiceId]/coverage/page.tsx:347`), served by `downloadHandler` (`coverage/letter/route.ts:7`), which answers every refusal with the JSON outcome (`apps/web/src/lib/http/handler.ts:272-273`, documented at `:255`); the message is `apps/web/src/lib/routes/coverage.ts:189`; the codes input has no pattern or format hint (`coverage/page.tsx:379-380`).
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step) and `:260` (every screen has an error state with a next step); WCAG 2.1 3.3.1 Error Identification, 3.3.3 Error Suggestion, 1.4.10 Reflow
- **Fix:** Make a refused download come back to its form, for every download in the app. (1) In `downloadHandler`, when the request is a page navigation (`Sec-Fetch-Mode: navigate`, or an Accept that prefers text/html), answer a refusal with 303 to the route's own form page, registered on the route (`formPage`), for Coverage `/p/<id>/coverage?letter=refused&payer=..&contract=..&codes=..#letter`: opaque IDs and procedure codes only, never PHI. A non-navigation request keeps the JSON outcome. (2) Coverage reads those values back into the letter form as defaults, marks the codes field `aria-invalid` with the message tied by `aria-describedby`, inside the app frame, so a refresh keeps it. (3) Give the input the route's rule as a `pattern` and a hint under it. Words (taken under the co-founder's ruling): hint 'Five-character codes separated by commas, such as 97110, 97530. Leave blank to ask for the whole schedule.'; refusal 'Procedure codes: “ABC” is not a procedure code. Enter five-character codes separated by commas, such as 97110, 97530, or leave the field blank.'
- **Size:** M.
- **Files:** `apps/web/src/lib/http/handler.ts`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/lib/routes/coverage.ts`, `apps/web/e2e/onboarding.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 5 `co-001/ux-download-refusals`.
- **Sources:** `a11y-practice-1-18`, `narrow-practice-1-09`, `words-practice-42`.
- **Verification:** confirmed
- **Notes:** Chosen: the handler-level redirect (a11y-practice-1-18, narrow-practice-1-09) over a page-first server action (words-practice-42), because it protects every download link (packet PDF and CSV, reports, exports) and keeps the GET form working without script. The codes and payer and contract IDs in the query hold no PHI. Open PR #49 changes `coverage/page.tsx` and `lib/routes/coverage.ts`; whichever merges second keeps both. audit #32 (in flight) owns the coverage page's month and mapping states, not this form.

### UX-011 (C-002). Most tables have no keyboard-reachable scroller: at 390 px they push the whole page sideways or hide columns that a keyboard can never reach

- **Severity:** blocking. Harm area: accessibility. Reach: 32 routes, 6 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator, screening prospect.
- **Screens:** `p.claims.default.390`, `p.cases.default.390`, `console.prospects.default.390`, `p.remittance.default.390`, `p.home.default.390`, `p.contracts.default.390`, `console.rule-releases.notes-open.1280`, `settings.billing-org.default.390`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/claims`, `/p/[practiceId]/cases`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/anomalies`, `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/contracts`, `/p/[practiceId]/contracts/[contractId]`, `/p/[practiceId]/contracts/versions/[versionId]`, `/p/[practiceId]/mapping`, `/p/[practiceId]/remittances`, `/p/[practiceId]/remittances/[remittanceId]`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/pricing-runs/compare`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]/reports/roi`, `/p/[practiceId]/settings/access-log`, `/p/[practiceId]/support-access/[supportGrantId]`, `/p/[practiceId]/uploads`, `/p/[practiceId]/packet-reviews`, `/console/prospects`, `/console/specialist-queue`, `/console/support`, `/console/tickets`, `/console/rule-releases`, `/console/compliance`, `/console/terms`, `/console/organizations/[organizationId]`, `/settings/billing/[organizationId]`, `/settings/organizations/[organizationId]/users`, `/screening/results/[resultId]`.
- **Evidence:** Two failures with one cause. (a) The page scrolls sideways at 390 px and the sticky header and Menu slide away: measured capture widths prospects 959 px, specialist queue 768, support 739-745, remittance 733-745, users 667, Contracts 664, remittances 613, mapping 589, ROI 514-599, access log 515, pricing run 473-489. These tables sit straight in a card with no scroller (`console/prospects/page.tsx:50`, `console/tickets/page.tsx:46`, `console/compliance/page.tsx:159`, `p/[practiceId]/contracts/page.tsx:91`, `p/[practiceId]/remittances/page.tsx:71`, `p/[practiceId]/support-access/[supportGrantId]/page.tsx:45`, and the billing invoices at `settings/billing/[organizationId]/page.tsx:126`, moved there by PR #47 and still bare). (b) A bare `overflow-x-auto` div with no tabIndex, role or name clips the table at the card edge, so columns with no link in them (a case's Deadline and Owner, a line's Short and Status, the agreements' SHA-256, the reconciliation ledger's 'Written by' and 'Reason') can never be reached without a pointer: `p/[practiceId]/page.tsx:438`, `cases/page.tsx:246`, `claims/page.tsx:134`, `anomalies/page.tsx:58,162`, `abstraction/ledger/page.tsx:48`, `cases/[caseId]/packet/page.tsx:546`, `packet-reviews/page.tsx:48`, `reconciliation/page.tsx:136`, `settings/pricing/page.tsx:137`, `components/contracts/review.tsx:240`, `components/reports/display.tsx:120`, `components/reconciliation/template-mapper.tsx:173`, `components/screening/coverage.tsx:61`, `console/screening/page.tsx:82`. Fixed-height text boxes have the same defect: the release notes and check problems (`console/rule-releases/page.tsx:195,213`, `components/releases/note.tsx:94`) and the cited contract page (`components/contracts/display.tsx:91`). The app's own named, focusable scroller exists (`components/scroll-table.tsx:9-15`) but only four files use it; it also lacks the `relative` class ADR 0056 asks for, so a visually hidden header can escape it. 89 `<table` elements in `apps/web/src`; the 390 px guard (`apps/web/e2e/a11y.ts:53`) runs in five specs (`contracts.spec.ts:167`, `onboarding.spec.ts:502,524`, `packets.spec.ts:115,210,341,414`, `screening.spec.ts:402`, `unattested.spec.ts:94`; `screening.spec.ts:728` has its own `noSidewaysScroll`). Three visit these routes (the packet builder, pricing settings, a contract version), but only in states where the wide tables at `cases/[caseId]/packet/page.tsx:546` and `settings/pricing/page.tsx:137` are absent or fit. Confirmed at 4d99df8.
- **Rule:** `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md:51-53` (at a phone's width no page scrolls sideways; a wide table scrolls inside its own card, its scroller `relative`); WCAG 2.1 2.1.1 Keyboard (axe scrollable-region-focusable), 1.4.10 Reflow, 4.1.2 Name, Role, Value
- **Fix:** Every data table goes through one wrapper, `ScrollTable`, with a name taken from the table (for example 'Cases, scrolls sideways'). Change `ScrollTable` itself: add `relative` (ADR 0056:52); make it a small client component that keeps `role="region"` and its name always, renders `tabIndex={0}` on the server (so it is reachable without script) and, through a ResizeObserver, drops the tab stop only while the table fits, so 1280 px gets no idle tab stops; give each table a `min-w-[…]` per its columns (the `components/pricing/location.tsx:13-14` pattern) so cells stop collapsing to one word per line, and `overflow-wrap:anywhere` on long values (emails, plan keys). Give the fixed-height text boxes (release notes, check problems, cited page) the same region treatment with names such as 'Release notes, scrolls' and 'Page 2 of the contract, scrolls'. Name the two unnamed tables (support-access reads, upload receipts). Guard it: a lint or render test that every `<table>` in `apps/web` sits inside `ScrollTable` or a stacked layout, and `atPhoneWidth` run on every page route from the route registry (the per-route visit audit #103 asks for). Land the three pages #42 changes (`console/support`, the users page, the support-access page) after #42 merges.
- **Size:** M.
- **Files:** `apps/web/src/components/scroll-table.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/packet-reviews/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/components/contracts/display.tsx`, `apps/web/src/components/reports/display.tsx`, `apps/web/src/components/reports/documents.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/components/releases/note.tsx`, `apps/web/src/components/screening/coverage.tsx`, `apps/web/src/app/console/screening/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/e2e/a11y.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 3 `co-001/ux-table-scroll` (outside #42's files); UX PR 74 `co-001/ux-console-support-page` (the console support page); UX PR 75 `co-001/ux-users-page` (the users page); UX PR 76 `co-001/ux-support-access` (the support-access page).
- **Sources:** `narrow-practice-1-03`, `a11y-other-14`, `a11y-practice-1-16`, `a11y-practice-2-13`, `narrow-other-03`, `narrow-practice-1-01`, `narrow-practice-2-03`.
- **Verification:** corrected: the billing invoices table moved with PR #47 to `settings/billing/[organizationId]/page.tsx:126` (still bare, not fixed by PR #47); `ScrollTable` also lacks the `relative` class ADR 0056:52 requires; every other cited line confirmed at 4d99df8
- **Notes:** Confirms and widens the earlier tour's 'practice home agreements table cut off at 390 px': it is one of fifteen bare wrappers. Settled conflicts: the tab stop follows overflow (a11y-practice-2-13) rather than always on, because 89 always-on regions would add idle tab stops at 1280 px, but it renders on by default so the region is never unreachable. The visible scroll cue is UX-079 (C-043) and rows that carry forms stack under UX-078 (C-034), through one stacked-row primitive this PR adds; the line trace's JSON blocks are audit #38's (in flight). Open PRs touch some of these files (PR #51: home, reconciliation, ledger, reports display; PR #49: coverage, releases; PR #50: pricing-runs/[runId], pricing display): whichever merges second keeps both. Only the three #42 pages wait for #42.

### UX-012 (C-007). The enrolment, code and new-password steps expire in three to five minutes with no warning and no way to ask for more time

- **Severity:** blocking. Harm area: accessibility. Reach: 4 routes, 1 roles.
- **Roles:** anyone signing in.
- **Screens:** `sign-in-enroll.default.1280`, `sign-in-mfa.default.1280`, `sign-in-new-password.default.1280`, `sign-in.reason-step-expired.1280`.
- **Routes:** `/sign-in/enroll`, `/sign-in/mfa`, `/sign-in/new-password`, `/sign-in`.
- **Evidence:** Each step after the password lives in a sealed cookie of five minutes (fifteen for key registration) (`apps/web/src/lib/auth/pending.ts:15-17`), and Cognito's own sign-in session is set to its three-minute minimum (`infra/lib/constructs/identity.ts:8,14,108`). No step says there is a limit or warns before it ends; on expiry the person is sent to `/sign-in?reason=step_expired` (`apps/web/src/lib/routes/sign-in.ts:94,116`) and reads 'That sign-in step expired. Start again from your email and password.' (`sign-in/notice.tsx:14`), with the email to retype. Enrolment runs over most easily: with no QR code (UX-128 (C-042)) the person types a 32-character key into a phone, then waits for a code, inside three minutes in production. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 2.2.1 Timing Adjustable (A): a time limit is warned of with a way to extend it; WCAG 2.2 3.3.7 Redundant Entry (the retyped email). Under Cognito's 15-minute cap the fix does not meet 2.2.1 in full: 'Start again' re-types the password and a code, which is not the simple action 2.2.1's Extend asks for, and 15 minutes is five times the 3-minute default where Adjust asks for ten. That remainder is a known limit, recorded for audit #103's manual checks.
- **Fix:** Two steps, one constant. Now: say on each step the limit that binds today and time the warning from it. In production that is Cognito's 3-minute sign-in session (`infra/lib/constructs/identity.ts:14`), shorter than the app's 5-minute pending cookie (`apps/web/src/lib/auth/pending.ts:15-17`), so the step says 'This step stays open for 3 minutes.' and, at one minute left, shows a polite live-region warning, 'This step closes in 1 minute. Start it again to get more time.', with a 'Start again' button that returns to the password step with the email filled in. The limit is one constant beside `pendingSeconds`, set to the shorter of the two, and the cookie lengths stay as they are. Keep the email for 'Start again' in a sealed, HttpOnly cookie that outlives the step by 15 minutes, never in the URL, and prefill it on `/sign-in` after an expiry. After #42 merges: set Cognito's `authSession` to its 15-minute maximum and the pending cookie to 15 minutes for the enrol, new-password and key-registration steps together, in one PR, with `infra/test/identity.test.ts` (which pins 3 at :109) and the constant moved with them; the code step keeps five minutes app-side; the warning then comes at two minutes left (one on the code step). With the QR code (UX-128 (C-042)) most people finish well inside the limit.
- **Size:** M.
- **Files:** `apps/web/src/lib/auth/pending.ts`, `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/enroll/page.tsx`, `apps/web/src/app/sign-in/mfa/page.tsx`, `apps/web/src/app/sign-in/new-password/page.tsx`, `apps/web/src/components/step-timer.tsx` (new), `infra/lib/constructs/identity.ts`, `infra/test/identity.test.ts`.
- **Migration:** no.
- **#42:** yes: `infra/lib/constructs/identity.ts`, `infra/test/identity.test.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 6 `co-001/ux-sign-in-time` (now: the limit that binds today (3 minutes), the warning, Start again and the email kept, from one constant (no Cognito change)); UX PR 66 `co-001/ux-sign-in-session` (Cognito's 15-minute session and the pending cookie, together).
- **Sources:** `a11y-other-23`.
- **Verification:** confirmed
- **Notes:** An infrastructure change, not a migration. `infra/lib/constructs/identity.ts` and `infra/test/identity.test.ts` are in #42's list, so the Cognito part lands after #42 merges, with the pending cookie in the same PR; the warning, the stated limit and the email prefill land first. Not the safer setting: the three minutes was a deliberate tightening (`identity.ts:8`), and fifteen is the less strict choice, made for accessibility (WCAG 2.2.1, level A). The challenge stays single-use and still needs the password and a code, while three minutes with no warning shuts out people who type slowly from a mandatory step, so the recommendation is fifteen with the warning. It is named as a trade-off for the security reviewer in section 6.1 and confirmed at design. Audit #48 covers the 30-minute idle limit on PHI screens, not these steps. Corrected on review: the earlier fix had the first PR state 15 minutes while Cognito still allowed 3.

### UX-013 (C-018). Success notices come from a '?notice=' style URL parameter, so a refresh, Back or a shared link replays them over a page that has moved on ('Approval is requested' above 'Approved'; 'Invitation sent' above 'No invitations yet')

- **Severity:** should fix. Harm area: money or status. Reach: 8 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, platform operator.
- **Screens:** `p.packet.notice-requested.1280`, `p.agreements.notice.1280`, `settings.users.notice-invited.1280`, `console.models.notice.1280`, `p.defaults.notice.390`, `console.rule-releases.prepared.1280`, `console.compliance.sent.1280`, `p.packet.notice-exported.390`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/settings/agreements`, `/p/[practiceId]/settings/defaults`, `/settings/organizations/[organizationId]/users`, `/account/notifications`, `/console/models`, `/console/compliance`, `/console/practices/[practiceId]`.
- **Evidence:** Mutations redirect with a flag (`apps/web/src/lib/routes/settings.ts:266`, :318, :415; `mapping.ts:154`; `console-models.ts:168`; `compliance.ts:219`) and about 29 pages render the notice from the URL alone, with no check that the action happened or still holds. The drafter's packet tab, refreshed after approval, still reads 'Approval is requested. A second person ... approves it here.' (`apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx:35`, :189-191) above 'Approved'; 'Agreement chain confirmed' sits above two Missing agreements (`settings/agreements/page.tsx:30-32`); 'Invitation sent' above 'No invitations yet' (`settings/organizations/[organizationId]/users/page.tsx:40-43`); 'The flag is set' beside 'No model flag is set' (`console/models/page.tsx:32`). The compliance page echoes any 1-120 characters from the URL as 'The compliance platform received <reference>' (`compliance.ts:110`). A copied link carries the notice to a colleague.
- **Rule:** `docs/product/PRD.md:256` ('no screen depends on client-side state that a refresh loses', read with `PRD.md:302:` the URL carries filters, not one-time outcomes); WCAG 2.1 SC 4.1.3 (a status message reports a change that happened)
- **Fix:** Make a notice a one-time flash bound to the write: the route wrapper (`lib/http/next.ts`, `lib/http/route.ts`) turns a mutation's notice into a signed, HttpOnly, SameSite=Lax cookie scoped to the target page's path, holding only the notice code and the record's opaque id, with a Max-Age of a few seconds, and redirects to the clean URL. The page shows the notice only when the cookie names this record, and takes its words from the record's current state where it has one ('Approval requested by pricing-manager at 14:02 UTC', and none once approved). Remove the notice parameters from the page schemas, and keep URL state for filters and the public 'sent' pages. Echo nothing from the URL.
- **Size:** M.
- **Files:** `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/http/route.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx`, `apps/web/src/lib/routes/compliance.ts`, `apps/web/src/lib/routes/console-models.ts`, `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/app/account/notifications/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 15 `co-001/ux-notice-once` (outside #42's files); UX PR 75 `co-001/ux-users-page` (the users page); UX PR 78 `co-001/ux-console-confirm` (the console notices in `lib/routes/console.ts`); UX PR 83 `co-001/ux-settings-words` (the notices set in `lib/routes/settings.ts`); UX PR 85 `co-001/ux-screening-messages` (the screening notices).
- **Sources:** `flows-practice-08`, `narrow-other-16`, `narrow-practice-1-25`, `flows-other-23`, `narrow-practice-2-18`.
- **Verification:** confirmed
- **Notes:** Fixes differed: a flash cookie (flows-practice-08, narrow-other-16, narrow-practice-1-25), a notice read from the actor's audit event (flows-other-23), or `history.replaceState` after render (narrow-practice-2-18). The flash cookie is chosen: no state in the URL, nothing to craft or share, it works without script, and it needs no audit read on every render; replaceState still sends the notice in the first URL and needs script. #42 files: `lib/routes/settings.ts`, `console.ts`, `screening/routes.ts` and the users page; the wrapper and the other pages land now, those after #42 merges. Severity: the reviewers split should_fix and polish; should_fix because the notice contradicts the page on money-adjacent steps (approval, agreements).

### UX-014 (C-083). One quantity, five names: 'Short (variance)', 'Underpaid (validated)', 'Variance', 'validated variance', 'shortfall'; and 'Shortfalls' on the abstraction ledger means something else

- **Severity:** should fix. Harm area: money or status. Reach: 7 routes, 3 roles.
- **Roles:** billing manager, practice administrator, contract specialist.
- **Screens:** `p.claims.default.1280`, `p.pricing-runs.default.1280`, `p.pricing-run.default.1280`, `p.case.default.1280`, `p.packet.default.1280`, `p.notifications.default.1280`, `p.abstraction-ledger.default.1280`, `p.digest.default.1280`.
- **Routes:** `/p/[practiceId]/claims`, `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/notifications`, `/p/[practiceId]/abstraction/ledger`.
- **Evidence:** Expected allowed less observed allowed is 'Short (variance)' on Claims and lines (`apps/web/src/app/p/[practiceId]/claims/page.tsx:150`), 'Underpaid (validated)' on runs (`apps/web/src/components/pricing/display.tsx:152`; `pricing-runs/page.tsx:169`), 'Variance' on run and case lines, 'Variance (Actionable)' on the packet's line schedule, 'validated variance' in notifications and the digest, and 'a shortfall of $90.00' in the narrative; 'Shortfalls' on the abstraction ledger (`abstraction/ledger/page.tsx:126-131`) means a payer paying less than its response accepted.
- **Rule:** ADR 0056:55-58 (the line table's columns: Charge, Expected allowed, Observed allowed and Short (variance), pinned by `apps/web/e2e/brand.spec.ts:362-374`); `docs/brand/BRAND.md:78` and :123-124 (Short: 'paid below the contract'; expected, paid and short); `.claude/rules/brand.md:36-37`; CO-06 and D31 (`docs/product/reconciliation-001.md:412-415`: a second, insurer-payment variance in Lane A's PR 13). No written rule for the other four names; recommended (the brief's goal: one product)
- **Fix:** Keep 'Short (variance)', the name ADR 0056 records and the brand journey pins, on every line table, and fold the other names into it, with the stage where one applies: 'Underpaid (validated)' -> 'Short (variance), validated'; 'Variance' (column) -> 'Short (variance)'; 'Variance (Actionable)' -> 'Short (variance), actionable'; 'new validated variance $90.00' -> 'new validated shortfall $90.00' ('shortfall' only in running sentences). Rename the ledger's other meaning 'Approved but paid less'. Reserve 'Short (insurer payment)' for D31's insurer-payment variance, so one bare 'Short' never names two figures, and tell Lane A's PR 13. Record the vocabulary in `apps/web/src/lib/copy/words.ts` and in the reviewer checklist (`.claude/agents/ux-brand-reviewer.md`, PR #55), not in `BRAND.md`, whose additions are the brand owner's (ADR 0058:243-244). A copy-lint rule refuses only the retired exact labels ('Underpaid (validated)', 'Variance (Actionable)'), never the word 'variance', which CO-06's own label uses.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/lib/copy/words.ts`, `tools/brand-copy/scan.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/monitoring/display.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 36 `co-001/ux-short-one-name` (outside #42's files); UX PR 81 `co-001/ux-notification-words` (the notifications).
- **Sources:** `words-practice-30`.
- **Verification:** confirmed
- **Notes:** The packet's printed narrative and PDF words are PR #52's (audit #38): fold the packet line schedule's label into it if it is still open, else follow it. `components/monitoring/display.tsx` is a #42 file: the notification words land after #42 merges; the rest now. PR #50 changes `components/pricing/display.tsx` and the run page, PR #51 the case and ledger pages: the one merged second keeps both. Corrected on review: the earlier fix renamed 'Short (variance)' to 'Short', against ADR 0056:55-58 and the brand journey, and would have collided with D31's second variance; it also put a glossary in `BRAND.md`, the brand owner's. The folded names are chosen under the co-founder's ruling. The column order on Claims (expected, observed, short, paid vs the brand's expected, paid, short) is the brand lens's (see the brand clusters).

### UX-015 (C-048). The home's Recovered tile states no period while a row below, with the same label and a period, shows a different amount ($12.00 vs $0.00); its note says 'stage five'

- **Severity:** should fix. Harm area: money or status. Reach: 4 routes, 3 roles.
- **Roles:** practice administrator, billing manager, organization administrator.
- **Screens:** `p.home.default.1280`, `p.home.tiles.1280`, `p.reconciliation.default.1280`, `p.case.default.1280`, `p.roi-statement.default.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/reports/roi/[statementId]`.
- **Evidence:** On LEDGER the tile reads 'Recovered (deposited) $12.00 / stage five: cash deposited, proved by the bank export, net of recoupments and reversals' with no period (`apps/web/src/app/p/[practiceId]/page.tsx:214-221`), and 'Where things stand' shows 'Recovered (deposited) this quarter $0.00 (2026-Q4 ... stage five only ...)' (:356-362). The tile is all-time and the row this quarter, but nothing on the tile says so. 'stage five' is internal numbering no screen explains (`page.tsx:220`, :361; `apps/web/src/components/reconciliation/display.tsx:103`; `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx:92`). On the same deposited practice the Payer approved note says 'not cash until it posts' (`page.tsx:213`) and the ROI statement's empty line says 'Nothing approved is waiting to be posted.' (`reports/roi/[statementId]/page.tsx:115`), naming posting where the proof is the deposit.
- **Rule:** `docs/product/PRD.md:267` ('recovered this quarter') and PRD 13 (a recovered figure names its period); `PRD.md:520` (each headline figure with its label); `.claude/rules/brand.md:37-38` ('Recovered' always with posted or deposited, kept)
- **Fix:** Put both periods in the Recovered tile: the label stays 'Recovered (deposited)', the value is labelled 'to date' with its first entry's date ('to date, since 2026-06-09'), and a second line in the tile carries the quarter ('This quarter (2026-Q4): $0.00'); the separate 'this quarter' row in 'Where things stand' goes. Drop 'stage five' everywhere a person reads it: 'stage five: cash deposited, ...' -> 'cash deposited, proved by the bank export, net of recoupments and reversals' (home, reconciliation totals, case summary). Word approval notes from the proof level: 'not cash until it posts' -> 'not counted as recovered until it is deposited' (or '... posted'), and 'Nothing approved is waiting to be posted.' -> 'Nothing approved is waiting to be deposited.'
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/components/reconciliation/display.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 9 `co-001/ux-home-figures`.
- **Sources:** `flows-practice-20`, `words-practice-16`.
- **Verification:** confirmed
- **Notes:** Open PR #51 (audit #12) rewrites the Payer approved note on the home and in `components/reports/display.tsx` (it keeps 'not cash until it posts') and changes the home, case and reconciliation pages: offer the proof-level wording of that one note to PR #51's fix round, and land the rest after PR #51 merges. Fix choice: flows-practice-20's (both amounts together in one tile) over words-practice-16's ('all time' on the tile, the row kept), because the two figures then cannot be read apart. The ROI line is not the seal (audit #46). Words chosen under the co-founder's ruling (above).

### UX-016 (C-049). The line trace and the packet review show calculation steps as code: integer cents ('Unit 5000 cents', 'unrounded 10000 cents'), raw JSON in scroll boxes that clip at 390 px and a keyboard cannot scroll, and 'FIXED_SCHEDULE'

- **Severity:** should fix. Harm area: money or status. Reach: 3 routes, 4 roles.
- **Roles:** billing manager, packet approver, packet reviewer, viewer.
- **Screens:** `p.line.default.390`, `p.line.default.1280`, `p.packet-review.default.1280`, `p.packet.default.1280`, `p.line.error.1280`, `p.packet-review.error-needs-downloads.1280`.
- **Routes:** `/p/[practiceId]/lines/[lineId]`, `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review`, `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** Each trace step is `JSON.stringify` in `<pre className='mt-1 overflow-x-auto ...'>` with no tabindex, role or name (`apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx:157`), cut at the box edge at 390 px and unscrollable by keyboard; the method is a bare code (:74), the unpriced reason too (:90), and 'unrounded 10000 cents' prints cents. The packet's contract citation prints `citation.method` unmapped ('FIXED_SCHEDULE', `apps/web/src/components/packets/display.tsx:105`) though :39 maps methods elsewhere; the review's steps read 'Unit 5000 cents ... 10000 cents to $100.00'. The trace numbers two sections 'Step 2'.
- **Rule:** `docs/product/PRD.md:256` (money rendered from cents; accessibility on every screen); WCAG 2.1 SC 2.1.1 (axe scrollable-region-focusable); `CLAUDE.md` rule 2 (the unrounded value kept beside the rounded one, in words a person reads); combined audit #38
- **Fix:** Inside audit #38's renderer (`@tp/packets/explain`): every step as a sentence with amounts in dollars from cents and the unrounded value to the fraction it holds ('2 units × $50.00 = $100.00; rounded once to $100.00'), the method and unpriced reason in words ('Fixed schedule'), steps numbered once each in order, a skipped step saying why. Where the raw record stays as an 'As recorded' disclosure for auditors, its `<pre>` wraps (`white-space: pre-wrap; overflow-wrap: anywhere`) so it never scrolls sideways, and hashes use the shared wrapping hash component.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/lib/pricing/view.ts`, `packages/packets/src/explain.ts` (from PR #52).
- **Migration:** no.
- **#42:** no.
- **In flight:** audit #38, PR #52: the trace's steps in words; its fix round covers the 'As recorded' wrapping and the keyboard
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `words-practice-14`, `narrow-practice-1-06`.
- **Verification:** confirmed
- **Notes:** PR #52's design takes the line page's method, adjustments, unrounded amount and `Citation`'s method in words (its section 12, 'Taken in this PR'), and its own CI found the 390 px sideways scroll on the line page (fix round). This entry makes sure the fix round also covers the 'As recorded' `<pre>` wrapping and the keyboard. PR #54 (materiality-cents) also changes the line page's 'unrounded ... cents' span (mono only): the one merged second keeps PR #52's words.

### UX-017 (C-098). Export histories and sign-offs credit PaidWhole's reviewer, or anyone the practice cannot see, to 'a member of the practice'

- **Severity:** should fix. Harm area: money or status. Reach: 4 routes, 3 roles.
- **Roles:** practice administrator, billing manager, auditor (reader).
- **Screens:** `p.report.default.1280`, `p.contract.default.1280`, `p.contract-version.default.1280`.
- **Routes:** `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]/reports`, `/p/[practiceId]/contracts/[contractId]`, `/p/[practiceId]/contracts/versions/[versionId]`.
- **Evidence:** The audit report's export history reads 'PDF by a member of the practice' beside 'PDF by reports-manager@synthetic.test'; the unnamed downloads are the reimbursement reviewer's, an internal PaidWhole person. Contract pages: 'Signed off: a member of the practice'. Cause: wherever the joined user's email is hidden from the practice scope (`LEFT JOIN "user"`, `apps/web/src/lib/reports/queries.ts:212-213`), pages fall back to the literal (`apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx:148`; `reports/page.tsx:126`, :257, :312; `reports/documents/[documentId]/page.tsx:45`; `reports/roi/[statementId]/page.tsx:45`; `apps/web/src/lib/reconciliation/queries.ts:229`, :233, :282, :634; `apps/web/src/lib/remittances/queries.ts:733`), while triage already says 'a former member of the practice' (`apps/web/src/lib/triage/queries.ts:397`).
- **Rule:** PRD 6 (the audit log and practice-visible access report: who did what, exactly); CO-11 and the brief's honest-claims rule
- **Fix:** One `actorLabel()` helper that words each kind truthfully from what the practice scope can read: a current member -> their email; a member whose membership ended -> 'a former member of the practice'; a user who held a support grant at this practice at that time (`support_grant.user_id`, readable under the practice's policy) -> 'PaidWhole staff, under a support grant'; anyone else -> 'someone outside the practice (a billing firm under your grant, or PaidWhole)'. Replace every literal with it, and test that an internal actor never reads as a practice member.
- **Size:** M.
- **Files:** `apps/web/src/lib/copy/actor.ts` (new), `apps/web/src/lib/reports/queries.ts`, `apps/web/src/lib/reports/documents.ts`, `apps/web/src/lib/contracts/contract-queries.ts`, `apps/web/src/lib/contracts/mapping-queries.ts`, `apps/web/src/lib/remittances/queries.ts`, `apps/web/src/lib/reconciliation/queries.ts`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 43 `co-001/ux-who-did-it`.
- **Sources:** `words-practice-39`.
- **Verification:** confirmed
- **Notes:** The member left open whether the actor's kind is readable without a new definer function: `support_grant` carries `user_id` under the practice's tenant policy (migration 20261015140000:121-134, :579), and memberships are the practice's own, so no migration. A firm user's firm name would need a definer read, so the fallback names both possibilities instead. PR #51 changes `reconciliation/queries.ts`: land after it. Words chosen under the co-founder's ruling (above).

### UX-018 (C-104). The danger red, which reads Short's terracotta, marks states that are not failures: 'To do', 'Missing', 'Open', 'Awaiting approval', 'Not built yet', 'Action needed'

- **Severity:** should fix. Harm area: money or status. Reach: 4 routes, 3 roles.
- **Roles:** practice administrator, contract specialist, platform operator.
- **Screens:** `p.settings.default.1280-dark`, `p.agreements.default.1280-dark`, `console.compliance.default.1280-dark`, `p.contract-version.default.1280`.
- **Routes:** `/p/[practiceId]/settings`, `/p/[practiceId]/settings/agreements`, `/console/compliance`, `/p/[practiceId]/contracts/versions/[versionId]`.
- **Evidence:** Getting started shows red 'To do' badges (`apps/web/src/app/p/[practiceId]/settings/page.tsx:56`); the agreement chain red 'Missing' (`settings/agreements/page.tsx:47`); the SOC 2 page red 'Action needed', 'Partly built', 'Awaiting approval', 'Not built yet' (`apps/web/src/app/console/compliance/page.tsx:72`, :125, :167); an open question to the customer is red (`apps/web/src/components/contracts/display.tsx:146`). All use Badge `destructive`, `--pw-danger` on `--pw-danger-bg`, both reading Short's values (`packages/brand/src/tokens.css:43-46`): on a payment product that colour means 'paid below the contract'.
- **Rule:** `.claude/rules/brand.md:26-28` (status colours are for data only); ADR 0056 (`docs/adr/0056-...md:90-92`: danger is for a failure: a failed run, a refused check, an evidence gap)
- **Fix:** Keep the danger tone for failures and refusals only (a failed job or invoice, a refused export or check, a suspended account, a failed verifier). Show pending and to-do states as the neutral chip with words ('To do', 'Missing', 'Open', 'Awaiting approval', 'Not built yet', 'Action needed'), with urgency carried by words and order (to-dos first). Add a test that Badge `destructive` and StatusChip `danger` appear only beside a failure state.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/components/contracts/display.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 21 `co-001/ux-status-chip`.
- **Sources:** `brand-06`.
- **Verification:** confirmed
- **Notes:** `settings/page.tsx` changed in PR #47 at line 18 only; :56 is unchanged. Brand choice under the co-founder's ruling: no new red for danger (a new hue is a palette change, the brand owner's under ADR 0058 D9); restrict where danger appears instead. Lands with UX-106 (C-105) (one chip component).

### UX-019 (C-085). The ledger's '#' is the platform-wide entry sequence, so a practice's append-only ledger reads 1, 2, 3, 7, 8, as if entries were removed, and the gaps count other practices' entries

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 4 roles.
- **Roles:** billing manager, contract specialist, viewer, auditor (reader).
- **Screens:** `p.reconciliation.default.1280`, `p.reconciliation.case-ledger.1280`, `p.abstraction-ledger.default.1280`, `p.reconciliation.viewer.1280`, `p.abstraction-ledger.adjust-open.1280`.
- **Routes:** `/p/[practiceId]/reconciliation`, `/p/[practiceId]/abstraction/ledger`.
- **Evidence:** The '#' column prints `ledger_entry.seq` (`apps/web/src/app/p/[practiceId]/reconciliation/page.tsx:111`; `abstraction/ledger/page.tsx:64`; selected at `apps/web/src/lib/reconciliation/queries.ts:263`), an identity shared by every practice (`packages/db/migrations/20261023120000_recovery_ledger.sql:177`). LEDGER's five entries read 8, 7, 3, 2, 1 under 'An entry never changes; a correction is an entry of its own', so a reader of an append-only ledger with a gap of three asks what was deleted, and the gap tells one practice how many entries other practices received in between.
- **Rule:** `docs/product/PRD.md:280` (every match shows its evidence); `CLAUDE.md` rule 4 (nothing of another tenant reaches a practice, here a count)
- **Fix:** Number entries per practice in the query (`row_number() OVER (PARTITION BY practice_id ORDER BY seq)`, stable because entries are append-only), label the column 'Entry', and keep the global `seq` off the page (the CSV may keep it under its own name for support).
- **Size:** S.
- **Files:** `apps/web/src/lib/reconciliation/queries.ts`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 13 `co-001/ux-ledger-corrections`.
- **Sources:** `flows-practice-29`.
- **Verification:** confirmed
- **Notes:** flows-practice-29 marked it audit #12; entry numbering is outside audit #12's scope (amounts in payment terms), so it lands right after PR #51, which changes all three files. A read-side query change only: no ledger write, no `packages/ledger` change.

### UX-021 (C-027). At 390 px the header cuts the practice switcher to 'SYNTHETI…' or 'Choose a …', so on a phone nothing names the practice in use

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 4 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator.
- **Screens:** `p.claims.default.390`, `p.cases.default.390`, `p.packet.default.390`, `p.pricing-runs.default.390`, `p.notifications.default.390`, `account.devices.default.390`, `console.screening.default.390`.
- **Routes:** `every page in the app shell, below 640 px`.
- **Evidence:** Below sm the switcher's label is capped at `max-w-[5rem] truncate` (`apps/web/src/components/shell.tsx:57`), so every 390 px header reads 'PaidWhole | SYNTHETI… | P | Menu', and 'Choose a practice' reads 'Choose a …'. Claims, Cases, a case, a packet, Contracts, Coverage and Mapping name the practice in no heading; only the home page's h1 does, and the Menu panel does not (`shell.tsx:322-327`). A firm or group user who works several practices cannot tell on a phone which practice's claims, cases or approval are in front of them; real names that share a first word truncate alike. Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:260` (one practice at a time, with a practice switcher for groups and firms); `docs/brand/BRAND.md:120-121` (the switcher right of the lockup: kept from sm up); the brand is silent on the narrow header: recommended
- **Fix:** Below sm, on a practice route, give the sticky header a second 32 px row under the lockup row holding the switcher's button with the practice's full name (truncated only at the full width), so the name is always in view and one tap opens the list; the first row keeps the lockup, the account and Menu. Off a practice route (console, settings, account), the switcher moves into the Menu panel as a 'Practices' section, the current one marked 'Current'. From sm up nothing changes. Expose the header's height as `--pw-header-height` (3.5rem, or 5.5rem with the second row) so UX-080 (C-015)'s scroll padding follows it, and regenerate ADR 0058's 390 px header baseline.
- **Size:** M.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/app/brand.css`, `apps/web/e2e/brand.spec.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 67 `co-001/ux-header-menus`.
- **Sources:** `narrow-other-10`, `narrow-practice-1-12`, `narrow-practice-2-08`.
- **Verification:** confirmed
- **Notes:** Settled: the second row (narrow-practice-1-12) over the switcher taking the free width (about 150 px, still cutting real names) or a Menu-only section (the name off screen until opened), because on a practice screen which practice a money action applies to must be in view; 32 px of height is the cost. The visible text becomes the accessible name under UX-094 (C-024). Lands after #42 merges (`shell.tsx`). Layout choice taken under the co-founder's ruling.

### UX-022 (C-056). An attested export reads to every other reviewer as their own first-person attestation, and never names who attested

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 3 roles.
- **Roles:** packet reviewer, packet approver, billing manager.
- **Screens:** `p.packet-review.default.1280`, `p.packet-review.notice.1280`, `p.packet.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review`, `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** The Attestation region says 'Attested 2026-10-26 01:26 UTC over these files' and names the attester only when it is the viewer (' by you', `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx:248`), then prints the first-person 'I attest that I downloaded and reviewed this packet's exported PDF and CSV ...' as plain text (:265; `apps/web/src/lib/packets/review.ts:105`), while the same viewer's Exported files say 'You have not downloaded it yet' for both. The page model carries only `byViewer` (`review.ts:128`, :171) though the attester is stored (`attested_by`). The practice's packet page calls the attester 'the reimbursement reviewer'. After attesting, the notice says 'The practice may now log its submission' with no way back to 'Packets to attest'.
- **Rule:** `docs/product/PRD.md:278` and ADR 0061 (the attestation is the reviewer's own signed act over the two SHA-256); PRD 12 (who did what is recorded and shown)
- **Fix:** Name the attester and quote the statement as theirs: 'Attested 2026-10-26 01:26 UTC by packet-reviewer@synthetic.test (reimbursement reviewer) over these files:' (or 'by you'), then 'They signed this statement: “I attest that I downloaded and reviewed this packet’s exported PDF and CSV against the checklist above.”' Keep the bare first person only above an unsigned checklist for the viewer who can sign it. Join the attester's sign-in from `attested_by` in `review.ts`. After attesting, return the reviewer to 'Packets to attest' with the next export in deadline order.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/lib/packets/review.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 43 `co-001/ux-who-did-it`.
- **Sources:** `flows-practice-09`, `words-practice-38`.
- **Verification:** confirmed
- **Notes:** flows-practice-09 marked it audit #38; PR #52's design does not change the attestation wording or identity (it binds the attested PDF by hash), so this is not in audit #38's scope: a small follow-up after PR #52 merges (same two files). The attester's sign-in shown to another internal reviewer is not PHI. Words chosen under the co-founder's ruling (above).

### UX-023 (C-082). Case and packet summaries pair a figure with a count of other lines: 'Actionable $0.00 (3 of 3 lines not written off)', 'Written off $0.00 (0 lines, struck through below)', and say nothing of the part a payer did not accept

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 3 roles.
- **Roles:** billing manager, packet approver, practice administrator.
- **Screens:** `p.case.default.1280`, `p.case.error.1280`, `p.case.empty.1280`, `p.packet.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** On PACKETS' resolved case 'Actionable $0.00 (3 of 3 lines not written off)' (`apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx:77`) reads as three actionable lines worth nothing; 'Written off $0.00 (0 lines, struck through below)' (:80) points at lines that do not exist; 'Payer approved $60.00' of a $90.00 ask with nothing saying what became of the other $30.00. The packet subtitle: 'Actionable: $0.00 on 0 of the 3 lines not written off (the rest are out of the figure: their pricing is no longer current, or they moved past actionable)' (`cases/[caseId]/packet/page.tsx:182-186`).
- **Rule:** `docs/product/PRD.md:520` (each headline figure with its label) and :331 (a case total equals the sum of its actionable lines); `docs/brand/BRAND.md:23` ('exact'). Corrected on review: `PRD.md:258` is a heading.
- **Fix:** Count the lines each figure sums and say where the rest went, through `counted()`: 'Actionable $0.00 (no line is still actionable: 3 lines moved on to payer approved)'; 'Written off: none' (and '$30.00 (1 line, struck through below)' only when there is one); under Payer approved on a partial answer, 'The payer accepted $60.00 of the $90.00 asked; $30.00 was not accepted (partly accepted on 2026-10-26).' Packet subtitle: 'Paid below the contract rate. Actionable now: $0.00 (0 of 3 lines; 3 have moved past actionable), as of 2026-10-26.'
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 12 `co-001/ux-case-summary`.
- **Sources:** `words-practice-33`.
- **Verification:** confirmed
- **Notes:** Open PR #51 adds 'Billable to the patient' and correction words to the case summary, and PR #52 (audit #38) changes the packet page: land after both. Whether a partly accepted case should read Resolved is UX-024 (C-084) and combined audit #89. Words chosen under the co-founder's ruling (above).

### UX-025 (C-091). A signed-off contract version still says 'Publication is blocked ... before the version can be approved' and 'The version can still be approved'

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 3 roles.
- **Roles:** billing manager, contract specialist, practice administrator.
- **Screens:** `p.contract-version.error-unresolved.1280`, `p.contract-version.default.1280`, `p.abstraction-version.default.1280`.
- **Routes:** `/p/[practiceId]/contracts/versions/[versionId]`, `/p/[practiceId]/abstraction/versions/[versionId]`.
- **Evidence:** On a signed-off version, 'Pricing uses this version / Signed off ...' sits above the red 'Publication is blocked / 1 record is not checked against the cited page yet, or cite a page that no longer resolves. Every field of every record is approved against its cited page before the version can be approved.' (`apps/web/src/components/contracts/review.tsx:211-217`, no branch on the version's status; the sentence also mixes subjects, 'is ... or cite'). The dispute-window note on a signed-off version ends '... The version can still be approved.' in red (`apps/web/src/lib/contracts/display.ts:116`).
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); `docs/product/PRD.md:256` (every error with a true next step)
- **Fix:** Word the alert by the version's status. Draft or under review: title 'Not ready to approve', body '1 record is not yet checked against its cited page, or cites a page that no longer resolves. Every field is checked against its page before the version is approved.' Signed off: title 'A cited page no longer resolves' (warning, not danger), body 'This version keeps pricing as signed off. Record 1's cited page cannot be shown now; the contract specialist re-cites it on a corrected version if the document changed.' On a signed-off version the window note drops 'The version can still be approved.' and reads 'Lines priced under this version wait for a verified deadline; keep the contract's own deadline from its words.'
- **Size:** S.
- **Files:** `apps/web/src/components/contracts/review.tsx`, `apps/web/src/lib/contracts/display.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 51 `co-001/ux-contract-pages`.
- **Sources:** `words-practice-17`.
- **Verification:** confirmed
- **Notes:** The data state (no worker read the pages at capture) is synthetic; the wording fault holds for any signed-off version whose page stops resolving. Words chosen under the co-founder's ruling (above).

### UX-026 (C-094). The practice's signed agreement and each person's click-through share a name: 'Terms of use' (Done) on Settings, 'Terms of service' (Missing) on Grants and agreements, 'Terms' on the home

- **Severity:** should fix. Harm area: money or status. Reach: 3 routes, 2 roles.
- **Roles:** practice administrator, organization administrator.
- **Screens:** `p.settings.default.1280`, `p.agreements.default.1280`, `p.agreements.empty.1280`, `p.home.default.1280`.
- **Routes:** `/p/[practiceId]/settings`, `/p/[practiceId]/settings/agreements`, `/p/[practiceId]`.
- **Evidence:** Getting started shows 'Done Terms of use / Accepted with their version and time.' (`apps/web/src/app/p/[practiceId]/settings/page.tsx:15`, the click-through each person accepts) while Grants and agreements shows 'Missing Terms of service' (`apps/web/src/lib/routes/settings.ts:72`, the practice's signed agreement in the chain), and the home calls the chain item 'Terms' (`apps/web/src/app/p/[practiceId]/page.tsx:37`). Two names and two states one page apart, and the checklist's next item depends on the second.
- **Rule:** No written rule; recommended (the brief's goal: one product); `docs/brand/BRAND.md:23` ('exact')
- **Fix:** Tell the two documents apart everywhere, from one label map, by the titles the documents themselves carry: the names of legal instruments come from audit #51's legal-surfaces work (counsel's titles), not from a label choice. Until those titles exist, keep each current label and add one line under it saying who accepts it: under the click-through, 'Each person accepts these when they first sign in. You accepted them on <date>.'; under the practice's signed agreement, 'Signed for the practice by its administrator.', in the chain, on the home's agreement table and in the checklist's chain item.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/page.tsx`, `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 53 `co-001/ux-settings-pages` (the description lines on the home and settings pages (the names wait for audit #51)); UX PR 83 `co-001/ux-settings-words` (the chain's description line); UX PR 87 `co-001/ux-terms-text` (the two agreements' names, from audit #51's titles).
- **Sources:** `words-practice-27`.
- **Verification:** confirmed
- **Notes:** No document's text changes. Corrected on review: the earlier fix renamed the two agreements ('Terms of use (yours)', 'Practice terms of service'); names of legal instruments should match the documents' own titles, which audit #51's legal-surfaces work sets, so the rename waits for those titles and the description line lands now. `lib/routes/settings.ts` is a #42 file: the chain label after #42 merges; the settings page (PR #47 changed only its line 18) and the home now. Words chosen under the co-founder's ruling (above).

### UX-027 (C-097). Dates and times: ISO dates and UTC clock times on screen beside browser date pickers in mm/dd/yyyy, so an upload at 9:26 p.m. Eastern shows as the next day

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 4 roles.
- **Roles:** billing manager, practice administrator, packet approver, viewer.
- **Screens:** `p.uploads.default.1280`, `p.submissions.default.1280`, `p.home.default.1280`, `p.notifications.default.1280`, `p.roi.default.1280`, `p.contracts.default.1280`, `p.reconciliation.default.1280`.
- **Routes:** `/p/[practiceId]/**`.
- **Evidence:** Every shown date is ISO ('2026-10-26', 'File by 2036-04-05') and every time UTC to the minute ('2026-10-26 01:26 UTC'), from `apps/web/src/components/format.ts:1-11`, whose comment reads PRD 6 as 'every date stored and shown in UTC'; every date input renders the browser's US format ('mm/dd/yyyy': Submitted on, First day, Effective from). `PRD.md:256` says dates are stored in UTC with service dates kept as calendar dates; it is silent on display. ADR 0061 (`docs/adr/0061-...md:832-833`) already names the cost (an approval after 7 or 8 p.m. US time prints the next day) and places a practice time zone in Lane A's PR 12.
- **Rule:** No written rule on displayed dates (`PRD.md:256` governs storage and money's locale); recommended
- **Fix:** One date formatter for every screen: calendar dates as 'Oct 26, 2026' (unambiguous, and how a US billing manager reads a payer letter and the date pickers), times in the practice's time zone with the zone named ('Oct 25, 2026, 9:26 PM ET'); ISO kept in CSV exports and audit records. The practice's time zone is a practice setting, defaulted from its billing ZIP at onboarding and editable on Pricing settings. Lane B lands the formatter and the date form now; times switch to the practice's zone when the setting exists (until then they stay labelled UTC).
- **Size:** M.
- **Files:** `apps/web/src/components/format.ts`, `apps/web/src/lib/uploads/receipt-labels.ts`, `apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx`.
- **Migration:** yes, for Lane A: A practice time-zone setting and its definer setter (settings are written only through `practice_set_*` functions, for example `practice_set_materiality`, `settings.ts:317`): ADR 0061 already places a practice time zone in Lane A's PR 12. Hand this screen evidence to it.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 29 `co-001/ux-dates` (the formatter and the date form (times stay labelled UTC)).
- **Sources:** `words-practice-36`.
- **Verification:** confirmed
- **Notes:** The member assumed `practice.settings` could take the zone without a migration; settings are written only through definer functions, so a setter is DDL (Lane A). Printed approval dates on the payer's copy stay with Lane A's PR 12. Date style chosen under the co-founder's ruling: 'Oct 26, 2026'. Owns the months written three ways (part of words-practice-41).

### UX-028 (C-100). The contract calendar says 'No dates ahead' for a signed-off version that ends on 2026-12-31, and implies signing off would have added dates

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 3 roles.
- **Roles:** billing manager, practice administrator, contract specialist.
- **Screens:** `p.contracts.default.1280`, `p.contract.default.1280`, `p.contracts.empty-filtered.1280`.
- **Routes:** `/p/[practiceId]/contracts`, `/p/[practiceId]/contracts/[contractId]`.
- **Evidence:** Contracts lists 'Version 1 (in force) 2026-01-01 through 2026-12-31, Signed off', and the calendar reads 'No dates ahead. Signing off a version records its anniversary, notice deadline, fee-schedule year and amendment dates here.' (`apps/web/src/app/p/[practiceId]/contracts/page.tsx:146`); the contract page 'No dates ahead.' (`contracts/[contractId]/page.tsx:114`). Nothing was recorded because each derived date must fall inside the version's window (`packages/contracts/src/calendar.ts:72-97`; the anniversary 2027-01-01 is outside). The date a billing manager most needs, the version's own end, after which lines go unpriced, is not on the calendar.
- **Rule:** CO-11 and the brief's honest-claims rule; PRD 7 (Contracts: the calendar); `PRD.md:260` (an empty state says what to do next)
- **Fix:** Show each signed-off version's end in the calendar, read from the version record at page time (no stored event): '2026-12-31: Version 1 of SYNTHETIC PAYER C AGREEMENT ends. Lines after it are not priced until an amendment or renewal is signed off: upload it here.' Empty state, truthful: 'No dates ahead in the versions signed off. Anniversaries, notice deadlines and fee-schedule years show here when they fall inside a version's term.'
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/lib/contracts/contract-queries.ts`, `packages/contracts/src/calendar.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 51 `co-001/ux-contract-pages`.
- **Sources:** `words-practice-48`.
- **Verification:** confirmed
- **Notes:** Read at page time, so no migration; a stored calendar event kind for the end date would be DDL and is not needed. `packages/contracts` is not frozen. Words chosen under the co-founder's ruling (above).

### UX-029 (C-125). A run a person creates shows its underpaid total but is never triaged, and its page neither says so nor leads to triage or Cases

- **Severity:** should fix. Harm area: money or status. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.pricing-run.default.1280`, `p.pricing-runs.default.1280`, `p.cases.default.1280`, `p.cases.deadline-14.1280`.
- **Routes:** `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/cases`.
- **Evidence:** The price job queues triage only for runs the monitoring chain created (`apps/worker/src/price/job.ts:13-15`, :47-49), as ADR 0039 decided ('A run a person creates is not chained: its creator triages it from the Cases screen', `docs/adr/0039-...md:69`). A person's run completes with 'Underpaid (validated): $90.00 across 1 payer pattern', and its page lists 'Variance by payer pattern' with no triage state, no action and no link to the case or patterns it feeds (`apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx:216-217`). Triage lives on Cases as 'Triage a run' (`cases/page.tsx:61-88`), so until the person knows to go there the $90.00 is in no case.
- **Rule:** `docs/product/PRD.md:275` and :277 (Pricing runs; Cases: create from a pattern); `PRD.md:260` (each screen says what to do next)
- **Fix:** Keep ADR 0039's rule (no automatic triage of a person's run) and make the step visible on the run page: when not triaged, 'Not triaged yet: the shortfalls reach a case only after triage.' with a 'Triage this run' button (the same action Cases has); once triaged, 'Triaged 2026-10-26: 1 case opened (SYNTHETIC PAYER Q, $90.00 actionable), 0 patterns waiting below the case materiality' with links to each case and to 'Patterns waiting for a case'; 'Triage queued' while it runs.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/lib/routes/pricing.ts`, `apps/web/src/lib/pricing/queries.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 38 `co-001/ux-pricing-runs`.
- **Sources:** `flows-practice-11`.
- **Verification:** corrected: auto-triage of a person's run was a recorded choice (ADR 0039 line 69), so the member's main fix (enqueue triage for every run) would reverse an ADR; its fallback, the visible state and button, is taken and `apps/worker/src/price/job.ts` is not changed
- **Notes:** Open PR #50 (audit #10) changes this page, `lib/routes/pricing.ts` and `lib/pricing/queries.ts`: land after it, and keep re-runs awaiting acceptance out of triage as audit #10 decides. No `packages/pricing` or `apps/worker/src/price` change. Words chosen under the co-founder's ruling (above).

### UX-030 (C-137). Compare two runs defaults to the two newest runs whatever their months, so it reports every line as in one run only; the list's 'Not in effect' never says what replaced the run

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 3 roles.
- **Roles:** billing manager, practice administrator, viewer.
- **Screens:** `p.pricing-runs.default.1280`, `p.compare.default.1280`, `p.compare.diff-filter.1280`, `p.pricing-runs.viewer.1280`.
- **Routes:** `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/pricing-runs/compare`.
- **Evidence:** The compare form preselects the two newest runs whatever their periods (`apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx:110`, :120: `options[1]` and `options[0]`): March against April on LAYOUT. The result is '0 of 0 lines both runs priced are priced differently; 3 only in the first run; 32 only in the second', 35 rows of 'Only one run priced the line', which answers no question a billing manager has; the question compare exists for (what a re-run changes against the run it re-prices) needs two runs of the same lines, found by reading clipped option labels. On LEDGER's list the older March run carries only 'Not in effect' (`apps/web/src/components/pricing/display.tsx:66-69`), with no link to the run that replaced it.
- **Rule:** `docs/product/PRD.md:275` (Pricing runs: compare two runs; re-run under a new release with a diff); `PRD.md:260`
- **Fix:** Offer comparison where it means something: on a run not in effect or awaiting acceptance, 'Compare with the run in effect for this period'; on a run in effect, 'Compare with the run it replaced'. In the free form, default the second run to one of the same period as the first and mark runs of other periods ('2026-04, other period'). On the list, the badge names the replacing run ('Replaced by the run of 2026-10-26 01:26 UTC, which is in effect', linked).
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/lib/routes/pricing.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 38 `co-001/ux-pricing-runs`.
- **Sources:** `flows-practice-26`.
- **Verification:** confirmed
- **Notes:** Open PR #50 (audit #10) adds `NotInEffectAlert`, which names and links the run in effect on a superseded run's own page, so that half is fixed there; the compare defaults, the compare links and the list badge are outside audit #10's scope: land after PR #50, on its run-state helpers. The compare page's cause wording is UX-036 (C-095). Words chosen under the co-founder's ruling (above).

### UX-031 (C-081). 'A payer took back -$18.00': a signed ledger amount printed inside a verb that already says the direction

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.home.default.1280`, `p.notifications.default.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/notifications`.
- **Evidence:** The recoupment notification reads 'A payer took back -$18.00 on 1 lines of a case', which reads as the payer paying $18.00. Cause: `apps/web/src/components/monitoring/display.tsx:53` prints `totals.recouped`, the ledger's negative recouped entry, through `usd()` unchanged (:21-24).
- **Rule:** `docs/product/PRD.md:256` (money from cents, read correctly); `docs/brand/BRAND.md:23` ('exact; a ledger you trust')
- **Fix:** Print the magnitude where the verb carries the direction: 'A payer took back $18.00 from 1 line of a case: the line is reopened, and recovered (deposited) drops by that amount.' Take the absolute value of the recouped cents as a bigint (never a float) in the notification text only; ledger tables keep the signed figure under 'Amount'. Add a test that a recoupment notification never contains '-$'.
- **Size:** S.
- **Files:** `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/components/monitoring/display.test.tsx` (from #42).
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/components/monitoring/display.test.tsx (from #42)` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 81 `co-001/ux-notification-words`.
- **Sources:** `words-practice-02`.
- **Verification:** confirmed
- **Notes:** Not inside audit #12 (PR #51 does not change `components/monitoring/display.tsx`). `display.tsx` is a #42 file and `display.test.tsx` is new in #42: lands after #42 merges, in one change with UX-115 (C-054)'s notification plurals (same lines). Words chosen under the co-founder's ruling (above).

### UX-032 (C-087). The ROI statement prints 'Pursuit hours logged: 0.00' though the product logs no time at all

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 3 roles.
- **Roles:** practice administrator, organization administrator, practice owner (reader).
- **Screens:** `p.roi-statement.default.1280`.
- **Routes:** `/p/[practiceId]/reports/roi/[statementId]`.
- **Evidence:** 'Pursuit hours logged: 0.00 / Hours the cases' time log records for the period; no time log is kept yet.' (`apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx:142-143`; the PDF at `apps/worker/src/reconcile/statement-html.ts:118-119`). A zero states that nobody spent time pursuing; the product cannot know that, because it records no time (`apps/worker/src/reconcile/statements.ts:23`, 'none is kept yet, so none are logged').
- **Rule:** CO-11 and the brief's honest-claims rule (no figure the product cannot prove); `docs/brand/BRAND.md:23` ('exact'); PRD 13 (ROI statement)
- **Fix:** Print no figure where nothing is measured: 'Pursuit hours logged: 0.00' -> 'Pursuit hours: not tracked yet', with 'PaidWhole does not log time on cases yet, so this statement states no pursuit hours.' on screen and in the PDF; print a number only for a statement generated once a time log exists, decided in code: `roi_statement.pursuit_hours` is NOT NULL (migration `20261023120000_recovery_ledger.sql:254`) and the table is frozen ('No migration alters ... `roi_statement`', `docs/product/reconciliation-001.md`, Ledger semantics), so a stored 0.00 cannot say 'not tracked'. The rule: every statement generated before the time log's release reads 'not tracked' (a dated constant in code that the time log's PR sets), whatever its stored value.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/worker/src/reconcile/statement-html.ts`, `apps/worker/src/reconcile/statements.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 55 `co-001/ux-roi-words`.
- **Sources:** `words-practice-37`.
- **Verification:** confirmed
- **Notes:** Not the seal, so not inside audit #46, but audit #46 (`co-001/verified-seal`, queued in the 15b session) changes the same ROI page and report code: land with or after it, and have that session check that the stored statement's recompute does not expect the printed hours. The stored `pursuit_hours` stays; only what is printed changes, so no ledger or schema change. Words chosen under the co-founder's ruling (above).

### UX-033 (C-092). A resolved case shows its old deadline date beside 'no window' on Cases, and beside 'open' on its own page

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.cases.default.1280`, `p.case.default.1280`.
- **Routes:** `/p/[practiceId]/cases`, `/p/[practiceId]/cases/[caseId]`.
- **Evidence:** Same resolved case on PACKETS: Cases shows '2036-04-05' with a 'no window' chip; the case page 'Deadline (earliest open window) 2036-04-05' with 'open'. Cause: Cases passes state 'none' for resolved and written-off cases but keeps the date (`apps/web/src/app/p/[practiceId]/cases/page.tsx:279`), and 'none' is worded 'no window' (`apps/web/src/components/triage/display.tsx:39-44`), the words for a line with no dispute window at all; the case page passes the computed state (`cases/[caseId]/page.tsx:95`).
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); no written rule on the term itself; recommended (the brief's goal: one product)
- **Fix:** Give a closed case its own deadline wording on both screens, with no date: Cases '— closed'; the case page 'No deadline to meet: the case is resolved' (or '... closed, written off'). Add a `closed` deadline state to `DEADLINE_TEXT` and keep 'no window' only for a line or case that has no dispute window.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/components/triage/display.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 12 `co-001/ux-case-summary`.
- **Sources:** `words-practice-19`.
- **Verification:** confirmed
- **Notes:** Case status words are combined audit #89's (Lane A); this is the deadline cell only. PR #51 changes the case page: land after it. Words chosen under the co-founder's ruling (above).

### UX-034 (C-111). 'Created' and 'Location saved' report success beside a billing ZIP that cannot price anything, and never say the practice's months will keep waiting

- **Severity:** should fix. Harm area: money or status. Reach: 2 routes, 2 roles.
- **Roles:** platform operator, practice administrator.
- **Screens:** `console.practice.location-saved.1280`, `console.practice.saved.1280`, `console.practice.default.1280`, `console.organization.created.1280`.
- **Routes:** `/console/practices/[practiceId]`, `/console/organizations/[organizationId]`.
- **Evidence:** After a save the card shows 'Location saved', then 'Billing ZIP: 27601', then 'Medicare's ZIP code list in force does not include 27601. Check the ZIP code.' as an ordinary paragraph (`apps/web/src/app/console/practices/[practiceId]/page.tsx:57-71`), though the card says saving 'queues the practice's monitoring, so months waiting on the location are priced once it is ready'. A new practice gets 'Created. Medicare's ZIP code list in force does not include 27601. Check the ZIP code.' as one unstyled line (`console/organizations/[organizationId]/page.tsx:95-99`). The statuses are known (`apps/web/src/lib/pricing/location.ts:145-150`).
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step); ADR 0056 (a refused check or gap is danger text on the danger tint)
- **Fix:** The save's result follows the location's status: settled, 'Location saved: lines price at carrier X, locality Y.'; not settled, no success notice but a danger notice titled by the step ('Check the billing ZIP') that says what it means ('Months waiting on the location stay unpriced until a ZIP in Medicare's list for release 900001 is saved.'), with the field kept focused and its value. The organization page shows the same notice under the new practice in place of 'Created.', and the practice's Getting started step shows it to its administrator.
- **Size:** S.
- **Files:** `apps/web/src/app/console/practices/[practiceId]/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/pricing/location.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 57 `co-001/ux-console-records`.
- **Sources:** `flows-other-12`.
- **Verification:** corrected: the console practice page's card and notice are at `console/practices/[practiceId]/page.tsx:57-71` at 4d99df8 (the finding cites :56-67); the rest confirmed
- **Notes:** Accepting an unlisted ZIP stays as designed; only the reporting changes, in the pages and `location.ts` (the route, `lib/routes/console.ts`, already returns the status), so no #42 file. The status sentence itself is UX-057 (C-052)'s. PR #54 changes the console practice page: land after it. Words chosen under the co-founder's ruling (above).

### UX-036 (C-095). Compare two runs says 'Not priced by this run' for lines the run never held, 'Only one run priced the line' when neither did, and '0 of 0 lines both runs priced are priced differently'

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.compare.default.1280`, `p.compare.default.1280-dark`.
- **Routes:** `/p/[practiceId]/pricing-runs/compare`.
- **Evidence:** March against April (no line in both): 'Not priced by this run' where the line is not in that run (`apps/web/src/components/pricing/diff.tsx:33`); 'Only one run priced the line' as the cause (:152) though the second run left the line unpriced; summary '0 of 0 lines both runs priced are priced differently; 3 only in the first run; 32 only in the second.' (:58).
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); PRD 7 (compare lists the lines that differ, with the cause)
- **Fix:** Word the three facts apart: a missing side -> 'Not in this run'; an unpriced side -> its reason in words ('Unpriced: no agreement', UX-110 (C-051)); a one-sided line's cause -> 'Only one run covers this line'. When no line is in both runs: 'These runs share no line: they price different months (2026-03 and 2026-04). 3 lines are only in the first run and 32 only in the second.'; otherwise 'Of the 12 lines in both runs, 2 are priced differently' through `counted()`.
- **Size:** S.
- **Files:** `apps/web/src/components/pricing/diff.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 38 `co-001/ux-pricing-runs`.
- **Sources:** `words-practice-29`.
- **Verification:** confirmed
- **Notes:** Open PR #50 (audit #10) changes the compare page and `components/pricing/display.tsx` (not `diff.tsx`): land after it so its superseded-run wording and these agree. Words chosen under the co-founder's ruling (above).

### UX-037 (C-096). The response log says '(Payer approved once the recovery ledger approves it)' after the ledger has already recorded the approval

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.submissions.default.1280`, `p.submissions.error.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/submissions`.
- **Evidence:** '2026-10-26: Partially accepted, $60.00 accepted (Payer approved once the recovery ledger approves it) (with its document)' (`apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx:419`, :424) while the case page shows Payer approved $60.00 from the ledger. The ledger does not approve anything (an approved entry is created when a response accepts an amount); two parentheses in a row; 'Payer approved' capitalised mid-sentence.
- **Rule:** PRD 13 (an approved entry is created when a payer response accepts an amount); CO-11 and the brief's honest-claims rule
- **Fix:** Word it from the ledger's state, passed by the page's query: with the approved entry, '2026-10-26: Partially accepted, $60.00 accepted, with its document. Recorded as payer approved in the recovery ledger.'; before it, '... The recovery ledger records it as payer approved once the payer's letter is matched.' Never a fixed parenthesis.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** audit #12, PR #51: the response log's sentence worded from the ledger's state, in its fix round
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `words-practice-34`.
- **Verification:** confirmed
- **Notes:** What 'payer approved' means is audit #12's ruled subject (PR #51 rewrites the payer-approved notes and this page's response handling), so this sentence folds into PR #51's fix round; if it has merged, a one-line follow-up. Words chosen under the co-founder's ruling (above).

### UX-038 (C-059). 'Set a flag' opens on the kill switch for Everyone and takes its value as typed text ('on', 'off' or a budget); the notice after it names nothing

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** platform operator.
- **Screens:** `console.models.default.1280`, `console.models.default.390`, `console.models.notice.1280`, `console.models.error.390`.
- **Routes:** `/console/models`.
- **Evidence:** The Flag select's first option is 'Kill switch (every model feature off)' and Applies to's first is 'Everyone' (`apps/web/src/lib/routes/console-models.ts:24-28`, :127-131), rendered without a placeholder (`apps/web/src/app/console/models/page.tsx:79-80`), so the form opens one typed word from switching every model feature off for every customer, while the global kill switch already has its own button (:60-63). 'Value' is one free text field for 'on', 'off' or a budget (:81; refusals `console-models.ts:158`, :163). The notice says 'The flag is set' without the flag, scope or value (`page.tsx:32-36`).
- **Rule:** `docs/product/PRD.md:302` (destructive actions confirm with the consequence stated); no written rule on a destructive default; recommended
- **Fix:** Show the control the chosen flag needs: Flag and Applies to start empty ('Choose a flag', 'Choose who it applies to') and are required; the kill switch and the letter reader take an On/Off choice for an organization or a practice (the everyone switch stays on its own card); the daily budget takes dollars (UX-002 (C-003)'s field). The notice names what was set: 'Daily budget for SYNTHETIC OTHER PRACTICE set to $8.00.'
- **Size:** S.
- **Files:** `apps/web/src/app/console/models/page.tsx`, `apps/web/src/lib/routes/console-models.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 57 `co-001/ux-console-records`.
- **Sources:** `flows-other-10`, `narrow-other-02`.
- **Verification:** confirmed
- **Notes:** The budget-in-dollars half is in flight in PR #54 (`co-001/materiality-cents`, UX-002 (C-003)), whose status lists 'a per-key field in the console models form' as a proposal it did not take: this is that proposal; land after PR #54. The form falling back to 'Kill switch' for 'Everyone' after a refusal is the form-reset defect (`co-001/ux-forms`); empty defaults also make that fallback harmless. Words chosen under the co-founder's ruling (above).

### UX-040 (C-107). The public screening result colours an investigatory anomaly in Short, the 'paid below the contract' colour, on a page that says it makes no finding about a payer

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.1280`, `screening-result.default.1280-dark`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** The anomaly row's chip is Short's terracotta on its tint ('Anomaly: more than $5 a claim line below ...'), and the 'others' row turns Short when any group is an anomaly (`apps/web/src/components/screening/anomalies.tsx:151-157`, :262). The same page says nothing here is a finding about a payer, and its coverage table deliberately keeps whole and short off the screening (`apps/web/src/components/screening/coverage.tsx:26-33`).
- **Rule:** ADR 0056 (`docs/adr/0056-...md:80`: Flagged (investigatory) takes the unpriced tone, never a claim); `.claude/rules/brand.md:26-28`; ADR 0058 and `docs/brand/BRAND.md:135-136` (a screening never says owed or underpaid: the copy lint guards the words, but the colour says it anyway)
- **Fix:** Show the anomaly in the unpriced tone (Slate text, unpriced rule) and the other standings neutral, words unchanged. Add a unit test that no screening component uses the short or whole tone.
- **Size:** S.
- **Files:** `apps/web/src/components/screening/anomalies.tsx`, `apps/web/src/components/screening/result.test.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 4 `co-001/ux-screening-result-tables`.
- **Sources:** `brand-11`.
- **Verification:** confirmed
- **Notes:** A rule the brand already states (ADR 0056's table), not taste. Neither file is in #42.

### UX-041 (C-117). The screening says 'Upload a file' and 'remove it and upload again', while promising the file is 'never uploaded'

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening.default.1280`, `screening.error-member-id.1280`, `screening.error-dos.1280`, `screening.error-no-phi.1280`, `screening.error-zip.1280`.
- **Routes:** `/screening`.
- **Evidence:** Lede: 'Upload a file of totals, with no patient information, ...' (`apps/web/src/app/screening/page.tsx:38`). Your file card: 'It is read in this browser and never uploaded: only its rows of totals are sent ...' (`apps/web/src/components/screening/upload-form.tsx:191`). Refusals: '... holds member IDs; remove it and upload again.' (`apps/web/src/lib/screening/messages.ts:83`; the dates-of-service twin at :95; the server's at `apps/web/src/lib/screening/routes.ts:231`). The privacy promise and the verbs around it disagree on the page that asks a prospect to trust it.
- **Rule:** CO-11 and the brief's honest-claims rule (no promise the product cannot prove); `docs/brand/BRAND.md:23` ('exact')
- **Fix:** Use 'choose' and 'send', never 'upload', for the file. Lede: 'Choose a file of totals, with no patient information: your browser reads it and sends only its rows of totals. See where the allowed amounts in it sit against the Medicare fee schedule at your locality, by code and payer product, and how much of your volume cannot be priced without a contract.' Refusals: 'remove it and upload again' -> 'remove the column, save the file and choose it again' (both browser messages and the server's twin).
- **Size:** S.
- **Files:** `apps/web/src/app/screening/page.tsx`, `apps/web/src/lib/screening/messages.ts`, `apps/web/src/lib/screening/routes.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/screening/page.tsx`, `apps/web/src/lib/screening/messages.ts`, `apps/web/src/lib/screening/routes.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 84 `co-001/ux-screening-upload-page` (all but the kept texts); UX PR 89 `co-001/ux-screening-kept-notices` (the kept texts' 'from your upload').
- **Sources:** `words-other-10`.
- **Verification:** confirmed
- **Notes:** All three files are #42's: after #42 merges. The kept texts' 'from your upload' (`apps/worker/src/screening/wording.ts:43`, `lib/screening/retention.ts:34`) are legal surfaces: their change joins UX-122 (C-102)'s founder question. Words chosen under the co-founder's ruling (above).

### UX-042 (C-118). The screening result's 'Difference' columns never say which way the sign runs ('$629.00', '-$266.40')

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.1280`, `screening-result.error-name.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** The anomalies and top-rows tables head two columns 'Difference, before the reduction across codes' and 'Difference, fully reduced across codes' (`apps/web/src/lib/screening/labels.ts:46`, :49) holding '$629.00' and '-$266.40'. Only the summary card explains the sign in words; the top-rows text says it obliquely: '... A row is below a figure where that difference is above zero.' (`apps/web/src/components/screening/anomalies.tsx:354`). A prospect cannot tell whether a positive figure means paid more or less than Medicare.
- **Rule:** The brief's severity rule (misled about money) and honest-claims rule; CO-11 (the screening never says owed or underpaid)
- **Fix:** Name the subtraction in the header and say it once in words: 'Medicare figure less allowed, before the reduction across codes' and 'Medicare figure less allowed, fully reduced across codes'; the sentence becomes 'A positive figure means the allowed amount in your file is below Medicare's figure; a negative one, above it.'
- **Size:** S.
- **Files:** `apps/web/src/lib/screening/labels.ts`, `apps/web/src/components/screening/anomalies.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 4 `co-001/ux-screening-result-tables`.
- **Sources:** `words-other-12`.
- **Verification:** confirmed
- **Notes:** words-other-12 proposed 'Expected less allowed'; 'expected' is the product's word for a contract amount (`BRAND.md` section 6: expected amounts trace to signed-off contract versions), which a screening never has, so 'Medicare figure' is chosen. No 'owed' or 'underpaid' (the screening copy lint). Words chosen under the co-founder's ruling (above).

### UX-043 (C-119). The screening's top-rows table heads its claim-line count 'Claims'

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.1280`, `screening-result.error-name.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** 'Rows with the largest differences' has a column 'Claims' (`apps/web/src/components/screening/anomalies.tsx:370`) holding `claim_count`, which the file's own column guide defines as 'How many claim lines the row sums'; every other card on the page says 'Claim lines'.
- **Rule:** No written rule; recommended (the brief's goal: one product; one noun for one count across a page)
- **Fix:** 'Claims' -> 'Claim lines'.
- **Size:** S.
- **Files:** `apps/web/src/components/screening/anomalies.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 4 `co-001/ux-screening-result-tables`.
- **Sources:** `words-other-13`.
- **Verification:** confirmed
- **Notes:** Lands with UX-042 (C-118) (same file).

### UX-044 (C-120). The screening's audit offer says 'An audit prices every line', a promise the product cannot keep: some lines stay unpriced, with a reason

- **Severity:** should fix. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.1280`, `screening-result.error-name.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** The convert card: 'An audit prices every line under your signed contracts and the contracts' own rules, the rows this screening could not. We already have your practice's name and your email from the screening. No patient information.' (`apps/web/src/components/screening/convert-form.tsx:50`). An audit leaves lines unpriced under the closed list of reasons (`docs/product/unpriced-reasons.md`; `CLAUDE.md` 'Never a guessed price'). The last clause dangles, and its straight apostrophes sit beside the curly ones of the kept text after it.
- **Rule:** CO-11 and the brief's honest-claims rule; `docs/brand/BRAND.md:23` ('never hype'); `CLAUDE.md` conventions (unpriced reasons, never a guessed price)
- **Fix:** 'An audit prices your lines under your signed contracts and their own rules, including the rows this screening could not, and names the reason for any line it cannot price. We already have your practice’s name and your email from the screening, and it holds no patient information.'
- **Size:** S.
- **Files:** `apps/web/src/components/screening/convert-form.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 63 `co-001/ux-screening-result-first`.
- **Sources:** `words-other-14`.
- **Verification:** confirmed
- **Notes:** The kept span after it (screening-kept-convert) is a legal surface and is not changed. Words chosen under the co-founder's ruling (above).

### UX-045 (C-076). Signing in again after a timeout, a gate or an expired step lands on the home page, not the screen the person was on

- **Severity:** should fix. Harm area: data or work. Reach: 4 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `sign-in.reason-idle.1280`, `sign-in.reason-step-expired.1280`, `terms.default.1280`.
- **Routes:** `/sign-in`, `/sign-in/mfa`, `/terms`, `/maintenance`.
- **Evidence:** A refused session redirects to `/sign-in` or `/sign-in?reason=<code>` with no return path (`apps/web/src/lib/http/next.ts`, `signInFor`), and the last sign-in step sends everyone to '/' (`apps/web/src/lib/routes/sign-in.ts:81-83`), which forwards to the first practice's home. So a billing manager signed out after 30 idle minutes on a case or a packet starts again from the practice home, though 'Session expired' promises 'Sign in again to continue' (`sign-in/notice.tsx:8`). The terms gate's 'Continue to your workspace' also goes to '/' (`apps/web/src/app/terms/page.tsx:53-55`). Confirmed at 4d99df8.
- **Rule:** Combined audit #48 (best option: after signing back in the person returns to where they were); `docs/product/PRD.md:256`
- **Fix:** Carry the interrupted page through sign-in, as audit #48's design (§4.12) does for practice pages: `next=<path>` (the path only, opaque IDs, validated against the route registry so it is never an open redirect), kept in the sealed pending sign-in across the password, code and key steps, honoured only if the new user reaches that practice. Extend the same validated path to the terms gate and the maintenance page ('Continue' returns to `next`), and to the console, settings and account pages, which carry no PHI.
- **Size:** S.
- **Files:** `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/lib/auth/pending.ts`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/lib/routes/onboarding.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** audit #48, `co-001/narrative-draft`: return to the interrupted page after sign-in, extended to the terms gate, maintenance and non-practice pages
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `flows-other-17`.
- **Verification:** confirmed
- **Notes:** Checked audit #48's design (`designs/lane-b-narrative-draft.md` §4.12 at /home/user/ops): it covers page loads under `/p/` only and leaves the terms gate, maintenance and non-practice pages going to '/'. Fold the extension into that PR or its follow-up rather than a separate PR. A path carries opaque IDs only, never a name or claim number.

### UX-046 (C-058). The console's widest-reaching actions (end a membership, suspend an organization, issue a $2,500 invoice, approve the place-of-service split, end a support grant, maintenance on, every model feature off) fire on one click, while the customer's End membership asks for a tick

- **Severity:** should fix. Harm area: data or work. Reach: 6 routes, 2 roles.
- **Roles:** platform operator, platform administrator.
- **Screens:** `console.organization.default.1280`, `console.billing.default.1280`, `console.status.default.1280`, `console.models.default.1280`, `console.screening.default.1280`, `console.support.default.1280`, `settings.users.end-membership-ticked.1280`, `console.organization.suspended.1280`.
- **Routes:** `/console/organizations/[organizationId]`, `/console/billing`, `/console/status`, `/console/models`, `/console/screening`, `/console/support`.
- **Evidence:** Each posts at once from one button with hidden fields: 'Suspend the organization', the page's first card (`apps/web/src/app/console/organizations/[organizationId]/page.tsx:65-73`); 'End membership' on every member row, which revokes that person's sessions at once (:161-165); 'Turn maintenance on', which closes every customer screen (`apps/web/src/app/console/status/page.tsx:49-52`); 'Turn every model feature off for everyone' (`apps/web/src/app/console/models/page.tsx:60-63`); 'Approve this split' (`apps/web/src/components/screening/split-form.tsx:92`); 'Issue audit invoice', which charges $2,500.00 to the organization preselected first in the list (`apps/web/src/app/console/billing/page.tsx:80-82`); 'End now' on a support grant (`apps/web/src/app/console/support/page.tsx:99`). The customer's Users and roles requires 'They lose access now' ticked before End membership (`settings/organizations/[organizationId]/users/page.tsx:84-85`).
- **Rule:** `docs/product/PRD.md:302` (every destructive action confirms with the consequence stated); WCAG 2.1 SC 3.3.4 (error prevention for actions that change stored data)
- **Fix:** Every console action that stops customers, people or money takes a required tick that states the consequence with the real figures, checked in the route (a required `confirm` field), not only in the browser: 'Suspend SYNTHETIC BILLING FIRM: 1 practice stops new runs; its data stays readable'; 'Charge $2,500.00 to SYNTHETIC THERAPY GROUP's account on file'; 'Close every customer screen now'; 'Turn every model feature off for every customer'; 'Approve this split: the next run of every practice, and the screening, use it'; 'They lose access now' (console End membership, through one shared `EndMembershipForm` with the users page); 'End this support grant now'. The audit invoice's organization select starts empty ('Choose an organization'). Suspension moves to the foot of the organization page. The restoring side (Reinstate, maintenance off, model features back on) stays one click.
- **Size:** M.
- **Files:** `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/console/models/page.tsx`, `apps/web/src/components/screening/split-form.tsx`, `apps/web/src/app/console/billing/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/lib/routes/console.ts`, `apps/web/src/lib/routes/billing.ts`, `apps/web/src/lib/routes/support.ts`, `apps/web/src/lib/routes/console-models.ts`, `apps/web/src/lib/screening/routes.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/lib/routes/console.ts`, `apps/web/src/lib/screening/routes.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 78 `co-001/ux-console-confirm`.
- **Sources:** `flows-other-09`, `a11y-other-18`.
- **Verification:** confirmed
- **Notes:** a11y-other-18 scoped it to End membership (the reversible switches meet SC 3.3.4); flows-other-09 to every stopping action. `PRD.md:302` asks every destructive action to confirm, so the wider scope is chosen, with the restoring side one click. #42 files: the console support page, the users page, `lib/routes/console.ts`, `lib/screening/routes.ts`: lands after #42 merges (the billing, status and models parts could land first). PR #54 changes the models page: land after it. Words chosen under the co-founder's ruling (above).

### UX-047 (C-122). Maintenance throws a customer out of the page and any form they were sending, never brings them back, gives no end time, and the status page shows every part 'Operational' meanwhile

- **Severity:** should fix. Harm area: data or work. Reach: 3 routes, 3 roles.
- **Roles:** all customer roles, platform operator, public status page reader.
- **Screens:** `maintenance.on.1280`, `maintenance.redirected.1280`, `maintenance.default.1280`, `status.maintenance.1280`, `console.status.default.1280`, `console.status.maintenance-on.1280`.
- **Routes:** `/maintenance`, `/status`, `/console/status`.
- **Evidence:** While maintenance is on, every customer page and form post is redirected to `/maintenance` (`apps/web/src/lib/http/next.ts:68-69`, used by `runAction` at :148-153), so a form being sent is dropped with its text and where the person was is not kept. `/maintenance` is static: it neither checks again nor returns the person, its off state offers 'Back to your workspace' to '/' (`apps/web/src/app/maintenance/page.tsx:17-36`), and it says 'scheduled' with no end: the console's switch is one button with no message or end time (`apps/web/src/app/console/status/page.tsx:49-52`). The public status page says 'Scheduled maintenance is in progress.' above seven components all 'Operational' (`apps/web/src/app/status/page.tsx:24-26`, :36-41). The console's Incidents card renders nothing when there are none (`console/status/page.tsx:86`).
- **Rule:** `docs/product/PRD.md:256` (no state a refresh loses; every error with a next step); the brief (a notice that contradicts the page)
- **Fix:** Make maintenance a state a person can wait through: the switch takes an expected end and an optional message and marks the components it closes 'Under maintenance' (an existing component status) until it is off. `/maintenance` shows the end time, checks a public status JSON route every 30 seconds, and returns the person to the page they were on (a same-origin path carried by the redirect, opaque IDs only). A form post refused for maintenance answers the form in place ('Maintenance started; nothing was saved. Your text is still here; send it again after 14:30 UTC') instead of redirecting. The console's Incidents card says 'No open incidents' when empty.
- **Size:** M.
- **Files:** `apps/web/src/app/maintenance/page.tsx`, `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/routes/support.ts`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/status/page.tsx`.
- **Migration:** yes, for Lane A: A stored expected end and message for maintenance (today `maintenance_on()` returns a boolean): a value on the maintenance flag or a status row, with its setter: Lane A.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 59 `co-001/ux-maintenance` (non42 and no migration: the return path, the in-place refusal, the check and the component status).
- **Sources:** `flows-other-16`.
- **Verification:** confirmed
- **Notes:** Split: the return path, the in-place refusal (which keeps typed text, with `co-001/ux-forms`), the periodic check, the components marked 'Under maintenance' and the empty incidents line need no migration and no #42 file; the end time and message go to Lane A. The public header's lockup linking a signed-in customer to `/sign-in` is UX-156 (C-142)'s. audit #48 covers the sign-out case on packet pages; this is the maintenance case everywhere. Words chosen under the co-founder's ruling (above).

### UX-048 (C-077). A refresh loses the upload batch, the receipts page and a posting-template mapping in progress, with no warning

- **Severity:** should fix. Harm area: data or work. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.uploads.default.390`, `p.uploads.era-format.390`, `p.template.default.390`, `p.template.preview.390`.
- **Routes:** `/p/[practiceId]/uploads`, `/p/[practiceId]/reconciliation/template`.
- **Evidence:** Uploads keep the kind, the ERA system, the batch and its progress in component state (`apps/web/src/components/uploads/uploader.tsx:141-149`) and the receipts page in `useState` (`components/uploads/receipts.tsx:72`), so a refresh drops the batch card, resets the kind to 835 and returns the receipts to page 1; files not yet sent are dropped silently, because no `beforeunload` guard exists anywhere in `apps/web/src`. The template mapper holds the template, system name, date format and all nine column choices in state (`components/reconciliation/template-mapper.tsx:44-49`), so a refresh or a phone locking throws away a mapping that takes minutes to build. Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:256` (no screen depends on client-side state that a refresh loses)
- **Fix:** Put the receipts page, the upload kind and the ERA system in the URL (`router.replace`; none is PHI). Warn before leaving while any file of a batch is still sending; after a reload, the receipts already show the upload waiting with its retry. Keep the template mapper's choices in the URL as column indexes (the template id, the system, the date format and each field's column number, never header text from a customer's file), and warn before leaving with unsaved choices; the sample file stays in the browser and is chosen again. Use audit #48's leave-warning guard for both warnings rather than a second one.
- **Size:** S.
- **Files:** `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 49 `co-001/ux-upload-next`.
- **Sources:** `narrow-practice-2-12`.
- **Verification:** confirmed
- **Notes:** Column indexes rather than header names in the URL: a header row is configuration, but indexes keep any text from a practice's export out of the address entirely (security: the safer). audit #48's design adds a leave warning while a form on a `/p` page is dirty; land this after it and reuse its guard. The receipts' own polling pause is audit #48's too.

### UX-049 (C-037). An ERA upload with no system chosen throws away the chosen files and marks nothing

- **Severity:** should fix. Harm area: data or work. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.uploads.error-era-system.390`, `p.uploads.error-era-system.1280`, `p.uploads.era-format.390`.
- **Routes:** `/p/[practiceId]/uploads`.
- **Evidence:** With 'ERA export' chosen and no system, choosing files shows 'Nothing was uploaded / Choose which system's ERA export the files are, then choose the files again.' (`apps/web/src/components/uploads/uploader.tsx:182-184`, alert `:393-404`): the files are discarded, the system select (`:345-361`) gets no `aria-invalid`, no message and no focus, and on a phone the person goes back through the file picker for every file. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 3.3.1 Error Identification (A) and 3.3.3 Error Suggestion (AA); `docs/product/PRD.md:256` (every error with a next step)
- **Fix:** Keep what the person chose. When the kind needs a system and none is chosen, hold the chosen files in the browser, mark the system select `aria-invalid`, show the message under it (tied by `aria-describedby`) and move focus to it; the batch starts as soon as a system is chosen. Place the system select before the drop zone, and while it is unset the Choose files button's hint says why it waits. Words (taken under the co-founder's ruling): 'Choose which system's ERA export these 3 files are. They upload as soon as you choose.'
- **Size:** S.
- **Files:** `apps/web/src/components/uploads/uploader.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 47 `co-001/ux-uploader`.
- **Sources:** `a11y-practice-2-03`, `narrow-practice-2-13`.
- **Verification:** confirmed
- **Notes:** Settled: keep the files and start on the choice (narrow-practice-2-13) over refusing to open the picker (a11y-practice-2-03), because a drop cannot be refused before it happens and re-picking on a phone is the loss. The files stay in the browser until the person chooses, nothing is sent. Problems naming files by position ('File 1 is empty.') are UX-181 (C-185); the template sample's errors are UX-087 (C-036).

### UX-050 (C-088). Field messages state a rule instead of what to do ('an adjustment changes the amount', 'required', 'versions of one contract never overlap: amend the version in force'), and some give a step the role cannot take

- **Severity:** should fix. Harm area: task flow. Reach: 8 routes, 3 roles.
- **Roles:** billing manager, contract specialist, practice administrator.
- **Screens:** `p.abstraction-ledger.error-adjust-zero.1280`, `p.abstraction-version.error-amend.1280`, `p.contracts.error.1280`, `p.contract.error.1280`, `p.pricing-runs.error.1280`, `p.case.error.1280`, `p.defaults.error.1280`, `p.roi.error.1280`.
- **Routes:** `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/abstraction/versions/[versionId]`, `/p/[practiceId]/contracts`, `/p/[practiceId]/contracts/[contractId]`, `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/settings/defaults`, `/p/[practiceId]/reports/roi`.
- **Evidence:** 'an adjustment changes the amount' (`apps/web/src/lib/routes/reconciliation.ts:136`); 'starts inside the amended version's window' (`packages/contracts/src/services.ts:845`), which reads as a description of the refused date; 'versions of one contract never overlap: amend the version in force, or supersede it' (`services.ts:259`) shown to a billing manager, who can do neither; 'the same month as the first, or later' (`apps/web/src/lib/routes/pricing.ts:315`); 'the period ends on or after its first day' (`apps/web/src/lib/routes/roi.ts:61`); 'required' (`apps/web/src/lib/routes/schemas.ts:19`); 'say why for "other", and only for "other"' (`packages/triage/src/cases.ts:111`); the pursuit cost's 'needs the staff rate and both times together, or none of them' (`apps/web/src/lib/routes/settings.ts:336`).
- **Rule:** `docs/product/PRD.md:256` and :260 (every error with a next step); `docs/brand/BRAND.md:23` (serious, exact, warm)
- **Fix:** Write each message as an instruction that names the value and the way out, in the role's reach: 'Enter a change other than 0.00: a minus sign lowers the entry, such as -5.00.'; 'Choose a date after version 1 starts (2026-01-01) and before it ends: an amendment starts inside the version it amends.'; for the billing manager's forms, 'Version 1 already covers this date (2026-01-01 to 2026-12-31). Choose a date after 2026-12-31, or ask the contract specialist to draft an amendment from this document.' (the specialist keeps the current sentence); 'Choose a last month the same as the first month or later, or leave it blank for one month.'; 'Choose a last day on or after the first day.'; each `requiredText` caller passes its own sentence ('Write the note before adding it.'); 'Say why when the reason is “Other”; leave Why blank for any other reason.'; 'Fill in the staff rate and both times, or leave all three blank to clear the pursuit cost.' Dates come from the record through the shared formatter; route db tests asserting the old strings change with them.
- **Size:** M.
- **Files:** `apps/web/src/lib/routes/reconciliation.ts`, `packages/contracts/src/services.ts`, `apps/web/src/lib/routes/pricing.ts`, `apps/web/src/lib/routes/roi.ts`, `apps/web/src/lib/routes/schemas.ts`, `packages/triage/src/cases.ts`, `apps/web/src/lib/routes/settings.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 17 `co-001/ux-route-messages` (outside #42's files); UX PR 83 `co-001/ux-settings-words` (the two messages in `settings.ts`).
- **Sources:** `words-practice-07`.
- **Verification:** corrected: the ROI period message is in `apps/web/src/lib/routes/roi.ts:61`, not `lib/routes/reports.ts` as assumed; the pursuit message is `settings.ts:336`; the rest confirmed
- **Notes:** `lib/routes/settings.ts` is a #42 file: its two messages land after #42 merges; the rest now. How a refusal is shown (field named by label, summary placement, focus) is `co-001/ux-forms`, in flight; the words themselves are this entry, so give that PR's design this list. PR #50 changes `lib/routes/pricing.ts`: the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-051 (C-020). The permission state reads as a template ('As Billing manager, you cannot do this here (Billing manager cannot edit rate records)') and tells internal staff to ask a customer's administrator, who cannot grant them anything

- **Severity:** should fix. Harm area: task flow. Reach: 5 routes, 5 roles.
- **Roles:** billing manager, contract specialist, platform operator, support staff, practice administrator.
- **Screens:** `p.abstraction-regulations.error-forbidden.1280`, `p.packet-review.error-forbidden.1280`, `p.home.error-forbidden.1280`, `console.screening.error-forbidden.1280`, `settings.billing-org.error-forbidden.1280`, `home.default.1280`, `p.support-access.error-forbidden.1280`, `p.packet.error-forbidden.1280`.
- **Routes:** `/p/[practiceId]/**`, `/console/**`, `/settings/billing/[organizationId]`, `/settings/organizations/[organizationId]/users`, `/`.
- **Evidence:** `packages/ui/src/states/permission-state.tsx:19` renders 'As {role}, you cannot {cannot}.'; `Forbidden` passes `cannot={`do this here (${message})`}` (`apps/web/src/components/shell.tsx:361`); the message is `${roleNames(roles)} cannot ${what}` with `what` the permission's description (`packages/db/src/authz/require.ts:29`), so the role is named twice, capitalised, and the words describe the permission the route checks, not the page ('cannot approve rate records for publication' on the place-of-service split; 'cannot read the practice's access log' on a support-grant page). 32 practice pages hard-code 'Ask the practice's administrator for access.' (for example `apps/web/src/app/p/[practiceId]/page.tsx:153`) and 7 settings pages 'Ask the practice administrator.', shown to contract specialists too, though internal roles reach a practice only through a support grant (`packages/db/src/authz/permissions.ts:108`, `support_grant_required`). Home for support staff: '... Ask your administrator.' (`apps/web/src/app/page.tsx:32`).
- **Rule:** `docs/product/PRD.md:260` (a permission state that explains what the role cannot do); `PRD.md:256` (every error with a next step that works); `docs/brand/BRAND.md:23` (serious, exact, warm)
- **Fix:** Each page passes a short `action` for its own screen; `PermissionState` reads 'As a {role in lower case, with its article}, you cannot {action}.' with no parenthesis (the permission description stays in the audit event). `Forbidden` chooses the next step from who is refused: an internal role gets 'You reach a practice only under a support grant for this work. A platform administrator opens one from the ticket.' with a link to Support tickets or the Specialist queue; a customer role gets 'Your role is set by your practice's administrators. Ask one of them if your work needs this page.' with a link to Users and roles; a page whose work belongs to a named role keeps that sentence and adds its way back ('Open the case'). Examples: 'As a billing manager, you cannot confirm a regulation. The contract specialist confirms it; you see the result on the packet.'; 'As a platform administrator, you cannot approve the place-of-service split. A contract specialist approves it.' Home for internal staff: 'Support reaches a practice only under a support grant, which a platform administrator opens from a ticket. Open Support tickets to see what is waiting.'
- **Size:** M.
- **Files:** `packages/ui/src/states/permission-state.tsx`, `apps/web/src/components/shell.tsx`, `apps/web/src/components/format.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/digests/[digestId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 71 `co-001/ux-forbidden`.
- **Sources:** `words-other-08`, `words-practice-08`, `words-other-07`, `words-practice-09`.
- **Verification:** corrected: the support-grant rule is at `packages/db/src/authz/permissions.ts:108` (the type) and :110-111 (its text); the rest confirmed
- **Notes:** `shell.tsx` and the users page are #42 files, so this lands after #42 merges, in one PR with UX-092 (C-019) (the permission state's missing heading), which changes the same two components. Words chosen under the co-founder's ruling (above).

### UX-052 (C-108). `/console` has no page: internal roles land on a create form, a directory or a dead end ('No practice to open ... Ask your administrator') instead of what needs them

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 5 roles.
- **Roles:** platform administrator, platform operator, support staff, contract specialist, packet reviewer.
- **Screens:** `console.organizations.default.1280`, `home.default.1280`, `home.help.1280`, `console.tickets.default.1280`, `console.specialist-queue.default.1280`, `console.prospects.default.1280`, `console.organizations.help.1280`.
- **Routes:** `/console`, `/`, `/console/organizations`.
- **Evidence:** There is no `apps/web/src/app/console/page.tsx`, so `/console` is the root 404, and the rail's 'Internal console' is a label, not a link (`apps/web/src/components/shell.tsx:232`). '/' sends a platform administrator to `/console/organizations` (`apps/web/src/app/page.tsx:23-25`), which opens on the 'Create organization' form above the directory (`console/organizations/page.tsx:34`): the rarest act leads, and nothing counts new audit requests, open tickets, running support grants, maintenance, a degraded component, an organization past due or a waiting release draft. A support engineer without a grant stays on '/' with 'No practice to open ... Ask your administrator.' (`page.tsx:26-34`) though the ticket queue is their work; the help text tells them to 'pick a practice in the switcher, or open the console' (`apps/web/src/components/help.ts:9`). A reviewer holding a grant is redirected to a practice home they may not open (`page.tsx:19-22`).
- **Rule:** `docs/product/PRD.md:260` (every screen has an empty state that says what to do next); `PRD.md:291-298` (the internal console's screens); no written rule on a console landing; recommended
- **Fix:** Add `/console` as every internal role's home, and send internal roles there from '/': one page of what needs a person now, each a count linking to its filtered queue (new audit requests; open tickets with the oldest's age against the target; support grants open and ending within the hour; specialist work waiting; organizations past due or suspended; maintenance and any component not operational; release drafts and checks), each block shown only to the roles that can act on it. Counts only, from each page's existing query; no PHI. 'Internal console' in the rail becomes a link with the single active underline. 'Create organization' moves behind a button below the directory.
- **Size:** M.
- **Files:** `apps/web/src/app/console/page.tsx` (new), `apps/web/src/lib/routes/console.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/components/shell.tsx`, `apps/web/src/components/help.ts`, `apps/web/src/app/console/organizations/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/console.ts`, `apps/web/src/components/shell.tsx`, `apps/web/src/components/help.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 73 `co-001/ux-console-home`.
- **Sources:** `flows-other-03`.
- **Verification:** confirmed
- **Notes:** `shell.tsx`, `help.ts` and `lib/routes/console.ts` are #42 files: after #42 merges (#42 also changes the console mail and support pages this home links to). Owns the support engineer's home empty state (part of narrow-other-19); UX-051 (C-020) words it for internal staff. Block names chosen under the co-founder's ruling (above).

### UX-053 (C-131). A missing correspondence contact blocks every export, but surfaces only at the last step, to people who cannot set it

- **Severity:** should fix. Harm area: task flow. Reach: 4 routes, 3 roles.
- **Roles:** billing manager, packet approver, practice administrator.
- **Screens:** `p.packet.approver-ready.1280`, `p.packet.drafter.1280`, `p.correspondence.read-only.1280`, `p.home.support-access.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/settings/correspondence`, `/p/[practiceId]`.
- **Evidence:** On LAYOUT, which has no contact ('No correspondence contact is set, so no packet is exported yet', `apps/web/src/app/p/[practiceId]/settings/correspondence/page.tsx:54`), a billing manager can draft, request approval and approve; only the Export region near the foot of the packet page says the practice has none (`apps/web/src/lib/packets/export-attempts.ts:46`), with the settings link shown only to those who can set it (`cases/[caseId]/packet/page.tsx:82-90`) and no name for who can. The administrator's home and the case page say nothing.
- **Rule:** `docs/product/PRD.md:256` (every error with a next step); `PRD.md:260` (a permission state that says who can)
- **Fix:** Treat the contact as a practice-level blocker shown where the work starts: an alert on the case page and at the top of the packet page while none is set ('Exports need the practice's correspondence contact. Dana Admin, the practice administrator, sets it.'), and 'Packets waiting on the correspondence contact' at the top of the administrator's home with the count of approved versions held.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/lib/packets/contact.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 46 `co-001/ux-waiting-on-someone`.
- **Sources:** `flows-practice-19`.
- **Verification:** confirmed
- **Notes:** An in-app notice to the administrators would widen `notification_kind_check` (Lane A, with UX-008 (C-012)'s kinds); the alerts and the home item need none. PR #52 and the narrative-draft PR change the packet page and PR #51 the case and home pages: land after them. Words chosen under the co-founder's ruling (above).

### UX-054 (C-030). Sign-in step refusals mark no field and tell people to check an email and password the step never asked for; the password policy names its gaps badly and is not tied to the field

- **Severity:** should fix. Harm area: task flow. Reach: 5 routes, 1 roles.
- **Roles:** anyone signing in.
- **Screens:** `sign-in-mfa.error.1280`, `sign-in-enroll.error.1280`, `sign-in-new-password.error-policy.1280`, `sign-in-new-password.default.1280`, `sign-in.error-wrong-password.1280`.
- **Routes:** `/sign-in`, `/sign-in/mfa`, `/sign-in/enroll`, `/sign-in/new-password`, `/sign-in/hardware-key`.
- **Evidence:** Every step shows one sentence, 'That did not match. Check the email, the password or the code, and try again.' (`apps/web/src/lib/routes/sign-in.ts:44,46`, used by every step's settle and the hardware-key options handler): on the code and enrolment steps the person typed only a code; on the first step no code; on the key step only an email. It comes back as an error string, so `ActionForm` marks no control and focuses the summary (`components/action-form.tsx:42-52`). The policy refusal reads 'Choose a password that meets the policy.' then 'It needs an uppercase letter, a digit, a symbol.' (`sign-in.ts:86`, joined with ', ' at `action-form.tsx:81`), with no field marked; the rules sit in the card description (`sign-in/new-password/page.tsx:21-24`), not in the field's hint, so a screen-reader user tabbing into 'New password' does not hear them. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 3.3.1 Error Identification, 3.3.2 Labels or Instructions, 3.3.3 Error Suggestion, 1.3.1; `docs/product/PRD.md:256` (every error with a next step)
- **Fix:** Give each step its own refusal, returned as an issue on its own field so `ActionForm` marks and describes it, none saying whether an account exists. Words (taken under the co-founder's ruling): `/sign-in` (no field marked, deliberately): 'That email and password do not match. Check both and try again. Ten failed attempts lock the account.'; `/sign-in/mfa`, on `code`: 'That code did not match. Enter the six-digit code your authenticator app shows now; it changes every 30 seconds.'; `/sign-in/enroll`, on `code`: 'That code did not match. Check that your app holds this account with the setup key above, then enter the code it shows now.'; `/sign-in/hardware-key`: 'That email cannot sign in with a hardware key yet. Check the address. If you have not registered a key, sign in once with your password and code to register it.'; `/sign-in/new-password`, on `password`: 'Choose a stronger password. It still needs an uppercase letter, a digit and a symbol.' (the list joined with commas and a final 'and'). Move the policy into the New password field's `hint` so `aria-describedby` carries it, and keep it visible.
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/lib/http/next.ts`, `apps/web/src/components/action-form.tsx`, `apps/web/src/app/sign-in/new-password/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 64 `co-001/ux-sign-in-words`.
- **Sources:** `a11y-other-08`, `words-other-04`, `words-other-29`.
- **Verification:** confirmed
- **Notes:** Account enumeration stays closed: an unknown account and a wrong password get the same words on each step. The enrolment message drops words-other-04's '{email}' because the step already shows the address. The marking itself comes from UX-074 (C-013)'s ActionForm change; this finding supplies the field keys and words.

### UX-055 (C-110). Support engineers and contract specialists cannot ask for a support grant in the product, and the administrator re-types the ticket into a free-text field

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 3 roles.
- **Roles:** contract specialist, support staff, platform administrator.
- **Screens:** `console.specialist-queue.default.1280`, `console.support.default.1280`, `console.support.ended.1280`, `console.tickets.default.1280`, `console.specialist-queue.all.1280`.
- **Routes:** `/console/specialist-queue`, `/console/support`, `/console/tickets`.
- **Evidence:** A practice with a document awaiting abstraction and no grant shows 'No support grant: ask a platform administrator for one from the ticket' (`apps/web/src/app/console/specialist-queue/page.tsx:106`), though such work comes from an upload, not a ticket, and there is no button to ask; the ticket row has none either (`console/tickets/page.tsx:76-87`). The administrator's form takes the ticket as free text matching `[A-Za-z0-9-]{1,64}` and the practice from every active practice, the first preselected (`apps/web/src/app/console/support/page.tsx:50-57`; `apps/web/src/lib/routes/console.ts:683`, :733), so nothing ties a grant to a real ticket. Grants list open and ended together, up to 100, unpaged (`console.ts:682`); the queue's default view lists practices whose counts are all 0.
- **Rule:** `docs/product/PRD.md:298` (Support: new grant from a ticket); `PRD.md:296` (Specialist queue); no written rule on requesting a grant; recommended (security: the safer)
- **Fix:** Make the request part of the work: on the specialist queue and on each ticket, 'Request access' names the practice and the reason; it shows on `/console/support` as a pending request at the top, with the ticket linked and the practice preselected, and a platform administrator grants or declines it (the requester never grants: the two-person control stays). The grant form's Ticket becomes a choice of open tickets, or 'Specialist work, no ticket' with a required reason. Open grants first, ended ones under 'Ended in the last 7 days'. The queue's default view shows only practices with work waiting.
- **Size:** L.
- **Files:** `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/lib/routes/console.ts`, `apps/web/src/lib/routes/support.ts`.
- **Migration:** yes, for Lane A: A pending support-grant request (a table, or a ticket state) with its requester, practice, reason and decision, audited, and the grant's link to a real ticket: Lane A.
- **#42:** yes: `apps/web/src/app/console/support/page.tsx`, `apps/web/src/lib/routes/console.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 74 `co-001/ux-console-support-page` (the open grants first, the default view and the ticket as a choice).
- **Sources:** `flows-other-08`.
- **Verification:** confirmed
- **Notes:** Security trade-off taken as the safer option under the co-founder's ruling: a logged request that someone else approves. The no-migration parts (open grants first, the queue's default view, the ticket as a choice of open tickets) change `console/support/page.tsx` and `lib/routes/console.ts`, #42 files: after #42 merges.

### UX-056 (C-126). An actionable line names no case: Claims and lines and the line trace have no path to the case, packet or reversal that explains it

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 3 roles.
- **Roles:** billing manager, viewer, packet approver.
- **Screens:** `p.claims.default.1280`, `p.line.default.1280`, `p.line.viewer.1280`, `p.pricing-run.default.1280`.
- **Routes:** `/p/[practiceId]/claims`, `/p/[practiceId]/lines/[lineId]`, `/p/[practiceId]/pricing-runs/[runId]`.
- **Evidence:** The three Actionable 97110 lines on Claims and lines carry the chip and a 'Line trace' link only. The line page links to Claims and lines (`apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx:40`), the contract version, the run, other runs and the remittance, but never to the case that holds the line or its packet. On the viewer's shot 'Reversed' and 'Superseded' stand together (:50-51) with no link to the reversal or the correcting claim and no words on which line now carries the stage. The run's 'Variance by payer pattern' rows lead nowhere near the case.
- **Rule:** `docs/product/PRD.md:270` (Claims and lines: open the line trace) and :277 (Cases: detail with lines, trace); combined audit #107 (reach the remedy)
- **Fix:** Where a line belongs to a case, the line page shows 'In case: SYNTHETIC PAYER Q, plan SYNPLAN-FIX-ONE (packet version 3, submitted)' with links; the stage chip on Claims and lines links to that case; a reversed or superseded line names and links the reversal and the correcting claim with one sentence on which line now carries the stage; each 'Variance by payer pattern' row links to its case or to 'Patterns waiting for a case'.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/lib/routes/remittances.ts`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 39 `co-001/ux-line-to-case`.
- **Sources:** `flows-practice-13`.
- **Verification:** confirmed
- **Notes:** The member marked it audit #38; links between records are outside 'every figure explained in words', so it lands after PR #52 (same line page and `lib/routes/remittances.ts`) and PR #50 (run page). Words chosen under the co-founder's ruling (above).

### UX-057 (C-052). A ZIP code that is right but missing from Medicare's list gets 'Check the ZIP code.' (practice pricing settings) or 'Try again later.' (screening), with no way forward

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 2 roles.
- **Roles:** practice administrator, screening prospect.
- **Screens:** `p.pricing-settings.error.1280`, `p.pricing-settings.default.1280`, `p.settings.default.1280`, `screening.error-zip.1280`.
- **Routes:** `/p/[practiceId]/settings/pricing`, `/p/[practiceId]/settings`, `/screening`.
- **Evidence:** Practice: 'Medicare's ZIP code list in force does not include 27601. Check the ZIP code.' (`packages/contracts/src/location.ts:64-65`, `zip_unknown`), on Pricing location and the Getting started checklist: a person whose ZIP is right has nothing to change, while the ZIP+4 case already gives the right step. Screening: 'PaidWhole has not loaded Medicare's ZIP+4 list for this ZIP code yet, so a screening cannot price it. Try again later.' (`apps/web/src/lib/screening/routes.ts:701`) gives no time and no other route; the ZIP+4 refusal ends with no step (:700); and 'this ZIP code is not in the Medicare locality map in force; check it' (:710) names an internal map. The first two screening sentences are the founder's ruled wording (Q12 of 2026-10-21, 'for counsel to confirm before the screening opens', `routes.ts:691-695`).
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step)
- **Fix:** Practice (taken): 'Medicare's ZIP code list in force does not include 27601. If 27601 is right, tell us through Help and support and we check Medicare's list; until then, months that need it wait.' (the `zip_plus_four_unknown` pattern, with the page's support link). Screening :710 (taken): 'Medicare's ZIP code list does not include this ZIP code. Check it against your practice's mailing address.' Screening :700 and :701 (the founder's): recommend adding one next step to each, 'Request an audit instead.' linking to `/request-audit`, and dropping 'Try again later.', which promises nothing a prospect can act on.
- **Size:** S.
- **Files:** `packages/contracts/src/location.ts`, `apps/web/src/lib/screening/routes.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/screening/routes.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 57 `co-001/ux-console-records` (the practice's sentence in `location.ts`); UX PR 85 `co-001/ux-screening-messages` (the screening's ZIP sentences (:710 taken; :700 and :701 by the founder's answer)).
- **Sources:** `words-practice-28`, `words-other-15`.
- **Verification:** confirmed
- **Notes:** Founder: the screening's two ZIP sentences are a recorded founder ruling (Q12) held for counsel, so changing them goes to the founder through the co-founder. Question: (a) keep the ruled text; (b) add 'Request an audit instead.' and drop 'Try again later.' (recommended: every refusal gets a step that works, and it promises no timing). The practice sentence and :710 are wording, taken under the co-founder's ruling. `lib/screening/routes.ts` is a #42 file, so the screening half lands after #42 merges; `location.ts` lands now.

### UX-058 (C-109). A support ticket loses its context on the way in and its answer on the way out: the desk cannot reply in the product and the customer cannot read the reply

- **Severity:** should fix. Harm area: task flow. Reach: 2 routes, 3 roles.
- **Roles:** support staff, practice administrator, billing manager.
- **Screens:** `support.default.1280`, `support.ticket-opened.1280`, `console.tickets.default.1280`, `console.tickets.all.1280`.
- **Routes:** `/support`, `/console/tickets`.
- **Evidence:** 'Ask support about this screen' sends only the section (`/support?from=${section}`, `apps/web/src/components/shell.tsx:340`), kept in a hidden field the form never shows, so the customer is told to copy 'the record's ID from its address' by hand (`apps/web/src/app/support/page.tsx:43-45`). The desk sees 'screen: remittances' and the message (`apps/web/src/app/console/tickets/page.tsx:69`) and can only Mark answered, Mark closed or Reopen (:76-87): no reply box, so the answer is written in someone's mail client and the product never records it. 'Your tickets' lists number, subject, opened and status (`support/page.tsx:62-83`); an answered ticket cannot be opened. Nothing shows a ticket's age against the published target.
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step); combined audit #103 (an accessibility contact that opens a ticket depends on this loop); no written rule on replies; recommended
- **Fix:** Close the loop in the product: (1) the help link carries the page's path with its opaque IDs only, checked against the route registry, and the form shows 'About: Remittances, remittance 3f2a...' with a link back; (2) each ticket on the desk gets a reply box: the reply is screened for patient information as the ticket is, mailed from the support address through the outbox, stored on the ticket, and marks it answered; a customer's mail reply reopens it; (3) 'Your tickets' opens each ticket to its thread at `/support/[ticketId]`; (4) the desk lists open tickets oldest first with their age against the target.
- **Size:** L.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/app/support/page.tsx`, `apps/web/src/app/support/[ticketId]/page.tsx` (new), `apps/web/src/lib/routes/support.ts`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/tickets/actions.ts`, `apps/worker/src/platform/support-notices.ts`.
- **Migration:** yes, for Lane A: Two parts, for Lane A after #42 (which adds the mail streams and support notices this uses): (1) a nullable `page_path` column on `support_ticket` that keeps a path with opaque IDs only, checked by a CHECK and against the route registry, because `support_ticket.screen` admits only a section key (`CHECK (screen ~ '^[a-z][a-z0-9_]{0,63}$')`, migration `20261030090000_customer_sign_in_and_readiness.sql:368`; #42's `20261101120000_support_mail.sql:18-21` adds only `source` and `mail_ref`); (2) a table (or columns) for ticket replies, with the PHI-registry decision that sets its `practice_id` and forced RLS, and the mail-reply threading it needs.
- **#42:** yes: `apps/web/src/components/shell.tsx`, `apps/worker/src/platform/support-notices.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 80 `co-001/ux-support-tickets` (the page shown on the form, and the age).
- **Sources:** `flows-other-07`.
- **Verification:** confirmed
- **Notes:** Split: showing the page on the customer's form (opaque IDs only, never a name or claim number; `CLAUDE.md` Never-list) and the desk's oldest-first age need no migration, but `shell.tsx` is a #42 file; storing the path so the desk sees it, and the replies and the thread, need DDL (Lane A, 'Handed to Lane A'). Writing the path into the free-text message instead is not taken: nothing would check it. Corrected on review: the earlier Notes said the context link needs no migration.

### UX-059 (C-128). 'Pricing can run' and 'Mapped' stop short of pricing: no link or button to price the months the change affects

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.coverage.no-run.1280`, `p.coverage.default.1280`, `p.plan.notice.1280`, `p.plan.default.1280`, `p.mapping.default.1280`.
- **Routes:** `/p/[practiceId]/coverage`, `/p/[practiceId]/mapping/[planId]`, `/p/[practiceId]/mapping`.
- **Evidence:** On a practice whose lines are loaded and mapped but never priced, Coverage says 'No pricing run has priced this practice's lines yet ...' (`apps/web/src/app/p/[practiceId]/coverage/page.tsx:117-119`) and, in an alert, 'Pricing can run' (:142-145), with no link or button. Saving a mapping returns 'Mapped / ... Its lines on those dates no longer wait on mapping' (`apps/web/src/lib/routes/mapping.ts:154` redirect), but the lines stay unpriced until a run prices their months, and nothing says so or offers it.
- **Rule:** `docs/product/PRD.md:271, :274, :275` (Mapping; Coverage links each reason to its remedy screen; Pricing runs: create a run); `PRD.md:260` (each screen says what to do next)
- **Fix:** Where pricing can now run, name the service months holding unpriced lines and offer 'Price 2026-03 to 2026-04' as a button posting the same create-run action (or, where monitoring will do it, say when). After a mapping is saved or corrected, list the months it affects with that button, and say that a re-run of a month already priced shows its differences before anyone accepts it.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/lib/routes/mapping.ts`, `apps/web/src/lib/routes/coverage.ts`, `apps/web/src/app/p/[practiceId]/pricing-runs/actions.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** audit #32, `co-001/unmapped-plan`: the next step after a mapping, in its design
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `flows-practice-15`.
- **Verification:** confirmed
- **Notes:** audit #32 is still in design (paused until PR #50 merges) and reshapes what a mapping does to a month's pricing on these same pages, so the next step after mapping belongs in its design. PR #49 also changes Coverage and `lib/routes/coverage.ts`: the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-060 (C-132). A contract version the specialist approved waits for the practice's sign-off with no queue or notice, so pricing under it waits unseen

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 2 roles.
- **Roles:** practice administrator, billing manager.
- **Screens:** `p.home.default.1280`, `p.home.support-access.1280`, `p.contracts.default.1280`, `p.contract-version.default.1280`, `p.abstraction.default.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/contracts`, `/p/[practiceId]/contracts/versions/[versionId]`.
- **Evidence:** A version prices only once the specialist has verified every term and the practice has signed it off (Contracts lead). The home's queues count the specialist's open questions but nothing for versions awaiting the practice's sign-off (`apps/web/src/lib/dashboard/queries.ts:115-130`; `apps/web/src/app/p/[practiceId]/page.tsx:120-130`), and no notification kind exists for it. Lines under the version stay unpriced until someone happens to open it.
- **Rule:** `docs/product/PRD.md:272-273` (Contracts: sign off a version; Rate record review: customer signs off); `PRD.md:267` (jump to any queue)
- **Fix:** Add 'Contract versions waiting for your sign-off' to the home's queues for roles holding `contract.sign_off` (count, payer, and the billed dollars of the lines it would price), a 'Waiting for sign-off' filter link on Contracts, and a status strip on the version page for those roles ('Approved by the contract specialist on 2026-10-25; sign it off to price 35 lines, $5,250.00 billed').
- **Size:** S.
- **Files:** `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/versions/[versionId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 46 `co-001/ux-waiting-on-someone`.
- **Sources:** `flows-practice-22`.
- **Verification:** confirmed
- **Notes:** Same family as UX-008 (C-012) (hand-offs without a queue): one PR with UX-008 (C-012)'s home queues. A notification kind would be Lane A's (with UX-008 (C-012)'s). Figures computed by code. Words chosen under the co-founder's ruling (above).

### UX-061 (C-133). Missing agreements are a dead end for the practice administrator: the chain lists 'Missing' with no way to get them signed, and the home lists only those on file

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 2 roles.
- **Roles:** practice administrator, organization administrator.
- **Screens:** `p.agreements.default.1280`, `p.agreements.non-admin.1280`, `p.settings.default.1280`, `p.home.support-access.1280`.
- **Routes:** `/p/[practiceId]/settings/agreements`, `/p/[practiceId]/settings`, `/p/[practiceId]`.
- **Evidence:** On NORTH the chain lists 'Missing: Terms of service' and 'Missing: Data-rights addendum' (`apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx:47`) and ends 'The chain can be confirmed once every agreement is on file; the platform records each as it is signed.' (:66): no signing link, no request, no contact. Envelopes are sent by PaidWhole, not from the product (`apps/web/src/lib/agreements/esign.ts:8-15`). The home's Agreements card lists only the two on file (`apps/web/src/app/p/[practiceId]/page.tsx:428-466`).
- **Rule:** `docs/product/PRD.md:256` (every error with a next step); `PRD.md:282` (Settings: grants and agreements)
- **Fix:** For each missing agreement give the administrator its next step: 'Ask PaidWhole to send it for signature', which opens a Help and support ticket pre-filled with the agreement's kind (no PHI), and one line on who records it ('It is recorded here when it is signed.'). List missing agreements on the administrator's home with the same action (UX-119 (C-129)'s administrator section).
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/support/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 46 `co-001/ux-waiting-on-someone`.
- **Sources:** `flows-practice-23`.
- **Verification:** confirmed
- **Notes:** The two near-identical names ('Terms of use: Done' vs 'Terms of service: Missing') are UX-026 (C-094)'s, which changes `lib/routes/settings.ts` (#42); this entry's next step needs only the pages, so no #42 file. `settings/page.tsx` changed in PR #47 at line 18 only. A signing request sent from the product would wait on the e-signature vendor (ADR 0053), not chosen yet. Words chosen under the co-founder's ruling (above).

### UX-062 (C-138). Uploads lists every kind of document's receipts but takes only 835s and ERA exports; contracts, payer letters and posting or EFT exports each upload from a different screen, and the drop zone never says where

- **Severity:** should fix. Harm area: task flow. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.uploads.default.1280`, `p.uploads.era-format.1280`, `p.uploads.viewer.1280`, `p.contracts.default.1280`, `p.reconciliation.default.1280`, `p.submissions.default.1280`.
- **Routes:** `/p/[practiceId]/uploads`, `/p/[practiceId]/contracts`, `/p/[practiceId]/reconciliation`.
- **Evidence:** The rail's Uploads takes '835 remittance' and 'ERA export from a practice-management system' only (`apps/web/src/app/p/[practiceId]/uploads/page.tsx:40-48`). Contracts takes contract, exhibit and payer letter (`apps/web/src/lib/routes/contracts.ts:47`); Reconciliation takes posting and EFT exports. Yet the Uploads receipts list shows every kind (a contract 'Stored', a posting export and an EFT export 'Loaded'), so a person who opens Uploads to send this month's posting export or the payer's letter sees those kinds listed but cannot upload them there, and nothing says where they go.
- **Rule:** `docs/product/PRD.md:268` (Uploads: drop zone; file receipts with status and reasons); `PRD.md:260`
- **Fix:** Uploads takes every kind a practice sends: 'Kind of document' lists 835, ERA export, posting export, EFT or bank export, contract or exhibit, and payer letter, each routed to its own intake as today, with one line under the chooser on what happens next for that kind (tagging for contracts; matching for exports; the submission it answers for a letter). Contracts, Reconciliation and the submissions page keep their drop zones as shortcuts that preselect the kind.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/uploads/page.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/lib/routes/uploads.ts`, `apps/web/src/lib/uploads/limits.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 48 `co-001/ux-uploads-every-kind`.
- **Sources:** `flows-practice-27`.
- **Verification:** confirmed
- **Notes:** Lands with UX-007 (C-011) (the payer letter uploaded inside 'Log a payer response'); together they give one universal entry and contextual shortcuts. Words chosen under the co-founder's ruling (above).

### UX-063 (C-062). The packet page never says where the packet stands or what this person should do next; each person's one action is about 3,000 px down at 1280 and 5,900 px at 390

- **Severity:** should fix. Harm area: task flow. Reach: 1 routes, 3 roles.
- **Roles:** packet approver, billing manager, packet reviewer.
- **Screens:** `p.packet.approver-ready.1280`, `p.packet.approver-ready.390`, `p.packet.drafter.1280`, `p.packet.default.1280`, `p.packet.error-export-blocked.390`, `p.packet.notice-requested.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** The page opens with Version, Citation, Line table, Deadline, Calculation, Interest, Evidence and Narrative regions (`apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx:224-358`) before Approval (:360) and Export (:446). On approver-ready, 'Approve this version' sits at about y 3,100 of 4,178 px (about 5,880 of 6,930 px at 390); after attestation the next step, 'Log its submission', is a small inline link near y 3,900; on export-blocked the red 'Export blocked' alert is about 6,500 px down at 390. The header shows only the case state chip and a subtitle about the actionable figure, never the packet's own step. The regions have aria-labels but no ids to link to.
- **Rule:** `docs/product/PRD.md:278` (Packet builder: approval panel, export history, log submission); `PRD.md:260` (each screen says what to do next); WCAG 2.1 SC 2.4.1 and 2.4.5 within a long page
- **Fix:** A status strip under the title, server-rendered from the facts the regions use: the packet's step as a short stepper (Written, Approval requested, Approved, Exported, Attested, Submitted, Answered) with who and when, and one primary action for this viewer in this state (Request approval; Approve this version, with links to the line table and narrative to review first; Export PDF and CSV; Log the submission; Log the payer's answer), or why none is theirs ('Waiting for a second person's approval, requested 01:41 UTC by pricing-manager'). Each part links to its region (ids `approval`, `export`, `narrative`, with scroll padding). Nothing moves, so a reviewer still reads top to bottom before approving.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/lib/packets/queries.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 44 `co-001/ux-packet-status`.
- **Sources:** `flows-practice-04`, `narrow-practice-1-24`.
- **Verification:** confirmed
- **Notes:** Not inside audit #38 (figures in words) or audit #48 (the narrative draft), which both change this page in one session: land after PR #52 and the narrative-draft PR merge. The subtitle's wording is audit #38's. The stepper's words chosen under the co-founder's ruling (above). UX-008 (C-012) adds the matching home queues.

### UX-064 (C-038). Opening an incident with no component ticked shows Zod's raw 'Invalid input: expected array, received undefined'

- **Severity:** should fix. Harm area: task flow. Reach: 2 routes, 1 roles.
- **Roles:** operator.
- **Screens:** `console.status.error.1280`, `console.status.error.390`.
- **Routes:** `/console/status`, `every route whose schema lacks its own message`.
- **Evidence:** The refusal reads 'components: Invalid input: expected array, received undefined', and no field is marked. Cause, confirmed at 4d99df8: the checkboxes are named `components[]` (`apps/web/src/app/console/status/page.tsx:119`); with none ticked the key is absent, and the preprocess (`apps/web/src/lib/routes/support.ts:392-395`) passes `undefined` on, so `z.array`'s type check fires before the written `.min(1, 'choose at least one component')` can run. No app-wide Zod error map exists (no `z.config` or `customError` under `apps/web/src/lib`), so any schema without its own message shows Zod's English (Zod 4, `pnpm-workspace.yaml:25`).
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step)
- **Fix:** In the preprocess, map a missing value to `[]` so the route's own message shows; reword it 'tick at least one component' (shown as 'Components affected: tick at least one component.' once UX-074 (C-013) names fields by label and marks the fieldset). Install one Zod error map at module load (`z.config({ customError })` in `apps/web/src/lib/routes/schemas.ts`) that turns every default code into plain words ('Enter a value.', 'Choose at least one.', 'Enter a whole number.', 'Enter a date.'), and add a test that runs each route's sample input with each field removed and fails on any message that starts with 'Invalid input' or 'Expected'.
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/support.ts`, `apps/web/src/lib/routes/schemas.ts`, `apps/web/src/lib/routes/onboarding-routes.db.test.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 17 `co-001/ux-route-messages`.
- **Sources:** `narrow-other-14`, `words-other-02`.
- **Verification:** confirmed
- **Notes:** Words taken under the co-founder's ruling. On this screen a refusal also wipes the title and first update (UX-001 (C-001)). The fieldset marking is UX-074 (C-013)'s.

### UX-065 (C-060). Rule releases says 'Prepare and check releases here', then, on a server with no content checkout, sends the operator to an environment variable, two commands and 'the load-release skill'; the selected release is not marked

- **Severity:** should fix. Harm area: task flow. Reach: 1 routes, 2 roles.
- **Roles:** platform operator, platform administrator.
- **Screens:** `console.rule-releases.default.1280`, `console.rule-releases.prepared.1280`, `console.rule-releases.release.1280`, `console.rule-releases.notes-open.1280`.
- **Routes:** `/console/rule-releases`.
- **Evidence:** The lede promises 'Prepare and check releases here; CI publishes a prepared release when its pull request merges ...' (`apps/web/src/app/console/rule-releases/page.tsx:38-41`). On this server the Drafts card says 'This server has no content checkout (CONTENT_ROOT). Prepare and check releases with pnpm release:assemble and pnpm verify-content in one, as the load-release skill says.' (:152): the page cannot do what its first line offers, and its next step names an environment variable and a coding-assistant skill. The selected release (`?release=`) gets `aria-current` (:75) but no visible mark, so with several releases nobody can tell which one the card below describes.
- **Rule:** `docs/product/PRD.md:297` (Rule releases: drafts, checks, published releases); `PRD.md:256` (every state with a next step that works); the brief's plain-language rule
- **Fix:** Say what this server does: without a content checkout the lede reads 'Releases are prepared and checked in a content checkout and published by CI when their pull request merges. This page shows what is published and which runs each release affects.'; with one, the current lede stays. The Drafts card reads 'This server has no content checkout, so drafts are prepared there: run pnpm release:assemble, then pnpm verify-content, as the content runbook says.' linking `docs/runbooks/content-updates.md`, with no environment variable and no skill named. Mark the selected release in the Published table (bold row and 'Shown below').
- **Size:** S.
- **Files:** `apps/web/src/app/console/rule-releases/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 56 `co-001/ux-release-pages`.
- **Sources:** `flows-other-21`, `words-other-42`.
- **Verification:** confirmed
- **Notes:** PR #49 (release content checks) adds a Content due section to this page and the runbook `docs/runbooks/content-updates.md`, but leaves the lede and the Drafts card as they are, so this is not inside PR #49's scope: land after PR #49 merges and link its runbook. Commands stay (the console's reader runs them; PR #49 shows exact commands by design); the skill name and the variable go. Words and layout only: no content-pipeline change. Words chosen under the co-founder's ruling (above).

### UX-066 (C-075). A locked customer is told 'A platform administrator can unlock it', a role they cannot reach

- **Severity:** should fix. Harm area: task flow. Reach: 2 routes, 1 roles.
- **Roles:** anyone signing in.
- **Screens:** `sign-in.error-locked.1280`, `sign-in-hardware-key.error-locked.1280`.
- **Routes:** `/sign-in`, `/sign-in/hardware-key`.
- **Evidence:** 'Account locked / This account is locked after ten failed attempts. A platform administrator can unlock it.' (`apps/web/src/lib/routes/sign-in.ts:45`; the same words as the `?reason=locked` notice, `apps/web/src/app/sign-in/notice.tsx:17`). A practice's staff do not know who PaidWhole's platform administrators are, and only they unlock (`apps/web/src/lib/routes/console.ts:579`). No sign-in page shows a support address; the only lead is 'Trouble signing in? Check the service status.' The tense reads as a rule, not as what happened. Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:256` (every error with a next step); `PRD.md:266` (Sign-in and MFA: lockout after ten failures)
- **Fix:** Name the way out with the support address the status page already shows (`supportEmail`, `apps/web/src/lib/server/config.ts:269`), passed to the sign-in page and the hardware-key options result. Words (taken under the co-founder's ruling): 'This account was locked after ten failed attempts. Write to <support address> from this address to have it unlocked.'
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/app/sign-in/notice.tsx`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/components/hardware-key.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 7 `co-001/ux-sign-in-recovery`.
- **Sources:** `words-other-05`.
- **Verification:** confirmed
- **Notes:** Lands with UX-006 (C-005) (the sign-in recovery and its help line), which passes the same address to the sign-in pages; `config.ts` is only read here, not changed (it is #42's).

### UX-067 (C-089). The invite refusal says 'change their role below' (the Members list is above) and sends the customer to a platform administrator they cannot reach

- **Severity:** should fix. Harm area: task flow. Reach: 1 routes, 2 roles.
- **Roles:** organization administrator, practice administrator.
- **Screens:** `settings.users.error.1280`.
- **Routes:** `/settings/organizations/[organizationId]/users`.
- **Evidence:** 'email: this address cannot be invited from here; if the person is a member already, change their role below, otherwise a platform administrator adds them' (`apps/web/src/lib/routes/settings.ts:935`, `EMAIL_IN_USE`). The Members table with its Change role controls sits above the invite card (`apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx:48-51`), and a customer has no way to reach a platform administrator but a support ticket.
- **Rule:** `docs/product/PRD.md:256` (every error with a next step that works)
- **Fix:** 'This address cannot be invited from here. If the person is already a member, change their role under Members above. If not, open a ticket from Help and support and PaidWhole adds them.' with Help and support linked (`/support?from=users`).
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 75 `co-001/ux-users-page`.
- **Sources:** `words-other-19`.
- **Verification:** confirmed
- **Notes:** Both files are #42's: after #42 merges. The 'email:' key at the start is the field-key defect owned by `co-001/ux-forms`. Words chosen under the co-founder's ruling (above).

### UX-068 (C-112). The SOC 2 page says 12 controls need action but never lists the actions; each is done through one generic form about 8,800 px down

- **Severity:** should fix. Harm area: task flow. Reach: 1 routes, 2 roles.
- **Roles:** platform administrator, security official.
- **Screens:** `console.compliance.default.1280`, `console.compliance.sent.1280`.
- **Routes:** `/console/compliance`.
- **Evidence:** The summary reads '4 controls ready, 12 needing action, 1 partly built' (`apps/web/src/app/console/compliance/page.tsx:99`), then 17 control cards each with 'Action needed' and its evidence (:122-138). The actions are few and repeated (approve six draft policies, the same 'Awaiting approval `docs/policies/access-control.md`' under five controls; record 17 workforce attestations; record the risk analysis; name the security official), but no row links to where to do it: the only way is the 'Record evidence' form at the foot (:175-200, about y 8,800 of 9,515 px), one record at a time, then a scroll back up to see the badge.
- **Rule:** `docs/product/PRD.md:256` (every state with a next step); no written rule on the checklist's layout; recommended
- **Fix:** A 'To do' list under the summary: one line per distinct action with its count and the controls it unblocks ('Approve 6 policies: unblocks 9 controls'; 'Record 17 workforce attestations'; 'Record the risk analysis'; 'Name the security official'), each opening the record form with that action preselected; each 'Not recorded' or 'Awaiting approval' row in a card links to the same prefilled form. Attestations may name several members for one training date and document (still one evidence record and audit event per member). The control cards stay below as the evidence.
- **Size:** M.
- **Files:** `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/compliance/actions.ts`, `apps/web/src/lib/routes/compliance.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 58 `co-001/ux-soc2-todo`.
- **Sources:** `flows-other-20`.
- **Verification:** confirmed
- **Notes:** Lands with UX-127 (C-113) (the same page's '%s' titles), UX-101 (C-053)'s '(PRD 16)' and UX-018 (C-104)'s red badges on this page. Words chosen under the co-founder's ruling (above).

### UX-069 (C-123). The full narrative editor stays open under an approved, exported and submitted version, directly above Approve, and never says that editing makes the approver its writer

- **Severity:** should fix. Harm area: task flow. Reach: 1 routes, 2 roles.
- **Roles:** packet approver, billing manager.
- **Screens:** `p.packet.approver-ready.1280`, `p.packet.default.1280`, `p.packet.notice-exported.1280`, `p.packet.notice-requested.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** The `VersionForm` (prompt-pay state, evidence checkboxes, the narrative, 'Save as a new version', 'Write a new version from the code-built draft', 'Draft the narrative with the model') renders whenever the version is current (`apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx:334-335`), whatever its approval, export, attestation or submission. On approver-ready it sits directly above 'Approve this version': an approver who fixes a typo becomes the last editor and, by the rule the Approval card states, can no longer approve, and nothing at the editor says so. After submission nothing says what a new version would be for.
- **Rule:** `docs/product/PRD.md:278` (versioned edits; the drafter cannot approve); `PRD.md:302` (a consequential action states its consequence); `CLAUDE.md` Never-list (a packet is never approved by its drafter)
- **Fix:** Once a version has an approval request, collapse the editor behind 'Write a new version' and state its consequence for this viewer: 'A new version replaces version 3 for approval; you would then be its writer and could not approve it.'; after export: 'For a second-level dispute or a correction; the exported version and its submission stay as they are.' Open by default only while the current version is a draft without a request. A collapsed editor keeps any draft text in the page.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/components/packets/version-form.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 44 `co-001/ux-packet-status`.
- **Sources:** `flows-practice-05`.
- **Verification:** confirmed
- **Notes:** The member marked it audit #48. `designs/lane-b-narrative-draft.md` keeps the draft in the open page's memory but does not change when the editor shows, so this is outside audit #48's scope: land right after the narrative-draft PR, which changes the same form (its in-memory draft must survive the collapse). Words chosen under the co-founder's ruling (above).

### UX-070 (C-139). 'Convert to a validation request' drops the person on Coverage with no trace of the cohort, payer or request, preselects the wrong payer's letter, and nothing tracks the request

- **Severity:** should fix. Harm area: task flow. Reach: 2 routes, 1 roles.
- **Roles:** billing manager.
- **Screens:** `p.anomalies.cohort.1280`, `p.anomalies.default.1280`, `p.coverage.default.1280`, `p.coverage.viewer.1280`.
- **Routes:** `/p/[practiceId]/anomalies`, `/p/[practiceId]/coverage`.
- **Evidence:** On an open cohort the actions are 'Mark reviewed' and 'Convert to a validation request' (`apps/web/src/app/p/[practiceId]/anomalies/page.tsx:103-117`). The conversion redirects to plain `/coverage` (`apps/web/src/lib/routes/triage.ts:168`), whose route takes no payer, cohort or notice (`apps/web/src/lib/routes/coverage.ts:92`): no confirmation, no word of which payer to ask, and the 'Request a missing fee schedule' letter preselected to whichever payer sorts first. No screen lists open validation requests; the home's anomaly queue keeps counting the cohort.
- **Rule:** `docs/product/PRD.md:276` (Anomalies: convert to a validation request); `PRD.md:274` (Coverage: a request-to-payer letter for a missing schedule)
- **Fix:** Redirect to Coverage with the cohort's payer, plan and codes, a one-time confirmation (UX-013 (C-018)'s flash: 'Validation requested for SYNTHETIC PAYER N, plan SYNPLAN-OON-CAS, 97110'), and the letter form preselected to that payer, plan and codes; list open validation requests in Coverage's 'What to obtain' with their age and a link back to each cohort; drop a converted cohort from the home's 'to review' queue.
- **Size:** M.
- **Files:** `apps/web/src/lib/routes/triage.ts`, `apps/web/src/lib/routes/coverage.ts`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/lib/dashboard/queries.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 50 `co-001/ux-validation-request`.
- **Sources:** `flows-practice-36`.
- **Verification:** confirmed
- **Notes:** PR #49 changes Coverage and `lib/routes/coverage.ts`, PR #51 `lib/routes/triage.ts`: land after both. Words chosen under the co-founder's ruling (above).

### UX-071 (C-134). The access log cannot answer the questions it exists for: no filter by person, route, action or date, no page links into its record filter, and page two has no way back

- **Severity:** should fix. Harm area: task flow. Reach: 1 routes, 1 roles.
- **Roles:** practice administrator.
- **Screens:** `p.access-log.default.1280`, `p.access-log.older.1280`, `p.access-log.record-filter.1280`.
- **Routes:** `/p/[practiceId]/settings/access-log`.
- **Evidence:** The access log is a newest-first table of 50 rows with 'Older entries' (`apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx:23-85`). Its only filter is one record from the URL (`apps/web/src/lib/routes/settings.ts:797-815`), which the page's comment says is reached 'from that record's own page' (:16), but no page links to it: the only way in is the Settings tab (`apps/web/src/components/settings/nav.tsx:30`). On PACKETS page one is 50 reads by one person within two minutes; support reads under a ticket appear only on page two, which has no 'Newer' link. The database function takes only a record, a cursor and a limit (`packages/db/functions/practice_access_log.sql:8`).
- **Rule:** `docs/product/PRD.md:251` (the access report answers 'who read claim X' in one query); `PRD.md:282`; `PRD.md:302` (filters in the URL)
- **Fix:** Server-side filters in the URL: person, route (membership, grant, support ticket), action, record kind and a date range, plus 'Find a claim' that takes the payer claim control number and resolves it server-side to its record ids without showing PHI to a role that lacks `phi.read`; 'Newest' and 'Newer' links and the page shown; and 'Who read this' links from the case, claim, line and packet pages for the roles that read them.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`.
- **Migration:** yes, for Lane A: Widening `practice_access_log()` (SECURITY DEFINER; today record, cursor and limit only) with person, route, action, record-kind and from-date filters, and a claim-number lookup that returns record ids only: Lane A.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 77 `co-001/ux-access-log` (the Newer and Newest links, the page shown and the Who read this links).
- **Sources:** `flows-practice-24`.
- **Verification:** corrected: the log already filters by one record (from the URL), so 'no filter by record' is inexact; the person, route and date filters need the function widened (a migration), which the member left open
- **Notes:** Split: the 'Newer'/'Newest' links, the page shown and the 'Who read this' links need no migration; the filters do (Lane A). `lib/routes/settings.ts` is a #42 file: one access-log PR after #42 merges with UX-137 (C-135), UX-100 (C-017)'s access-log labels, and `LANES.md` queue item 8 (audit #49, the access log's later pages), which already plans to keep its change in the page and query.

### UX-072 (C-136). An open support grant is a dead end for the practice administrator: nobody named who holds it, no way to end it or ask for it to end, and an empty state worded as final

- **Severity:** should fix. Harm area: task flow. Reach: 1 routes, 1 roles.
- **Roles:** practice administrator.
- **Screens:** `p.support-access.empty.1280`, `p.support-access.empty.390`.
- **Routes:** `/p/[practiceId]/support-access/[supportGrantId]`.
- **Evidence:** The administrator of LAYOUT opens 'Support access for ticket SYN-TOUR-4': 'Open', the window, the reason, 'Expiry notice sent: —', and 'No records read / Nothing of this practice was read under this grant.', worded as final on an open grant with no next step (`apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx:23-35`, :43). The route selects no holder (`apps/web/src/lib/routes/practice.ts:56`, `SUPPORT_GRANT_COLUMNS`, though `support_grant.user_id` exists), and only a platform administrator or the engineer may end a grant (`packages/db/functions/end_support_grant.sql:23`; the console's End now, `apps/web/src/lib/routes/console.ts:760`), though the grant lets that person read the practice's PHI for up to four more hours.
- **Rule:** `docs/product/PRD.md:211` (J15: break-glass grant, the administrator notified with the records read); `PRD.md:260`; `CLAUDE.md` rule 4 and the standing rule's security criterion (the data owner can cut break-glass access)
- **Fix:** Lane B (no migration): name the holder by role and work email (an internal account, not PHI): 'Held by support-engineer@..., PaidWhole support, for ticket SYN-TOUR-4; it ends by itself at 08:21 UTC'; word the empty state by state (open: 'Nothing read yet' with 'Reads under this grant appear here as support works, and in your access log.'; ended: 'Nothing was read' with 'The grant ended without any record of this practice being read.'); add 'Ask PaidWhole to end this access now', a Help and support link naming the ticket. Lane A: let the practice's administrator end a grant on their own practice, then show 'End this access now' with a required tick ('Support loses access to this practice now').
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/lib/routes/practice.ts`, `packages/db/src/authz/permissions.ts`.
- **Migration:** yes, for Lane A: `end_support_grant()`'s actor check widened to a holder of a new practice permission (for example `support_grant.end_own`) on their own practice, still recording the security event, and that permission in the matrix: Lane A (a SECURITY DEFINER change, so the founder approves the domain model).
- **#42:** yes: `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/lib/routes/practice.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 76 `co-001/ux-support-access` (the holder, the empty states and the request to end).
- **Sources:** `retake-06`.
- **Verification:** confirmed
- **Notes:** Security trade-off taken as the safer option under the co-founder's ruling: the data owner can cut break-glass access to its PHI. Both Lane B files are #42's: after #42 merges, in one support-access PR with UX-133 (C-064) (the reads list) and UX-199 (C-151) (the way back). Words chosen under the co-founder's ruling (above).

### UX-073 (C-028). Tables have no row headers, so repeated controls ('Line trace' 35 times, 'Adjust', 'PDF', 'End membership') do not say which row they act on

- **Severity:** should fix. Harm area: accessibility. Reach: 17 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.claims.default.1280`, `p.pricing-run.april.1280`, `settings.users.default.1280`, `console.support.default.1280`, `console.status.default.1280`, `p.abstraction-ledger.default.1280`, `p.access-log.default.1280`, `p.monthly.default.1280`.
- **Routes:** `/p/[practiceId]/claims`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/pricing-runs/compare`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/settings/access-log`, `/p/[practiceId]/reports/monthly`, `/p/[practiceId]/reports`, `/p/[practiceId]/uploads`, `/settings/organizations/[organizationId]/users`, `/console/support`, `/console/status`, `/console/prospects`, `/console/tickets`, `/console/specialist-queue`, `/account/devices`.
- **Evidence:** Claims and lines repeats 'Line trace' 35 times in a cell headed 'Status' (`p/[practiceId]/claims/page.tsx:220-221`); the April run 32 times (`pricing-runs/[runId]/page.tsx:269`); the packet schedules (`components/packets/display.tsx:197`), Compare's 'Second trace' (`components/pricing/diff.tsx:164-175`), the ledger's 'Adjust', the packet versions' and reports' 'PDF' and 'CSV', receipts' 'Report' the same. The access log names its 50 record links by the raw type ('service_line', read as 'service underscore line'; `settings/access-log/page.tsx:69-75`); the monthly table's links are named '0', '3', '$0.00' and 'the ledger's' (`components/reports/documents.tsx:146-158,185-187`). On the console: thirteen 'End now' buttons (`console/support/page.tsx:99`), nine 'Role' selects, 'Change role' and 'End membership' (`settings/organizations/[organizationId]/users/page.tsx:74-85`, whose fourth header cell is empty, `:57`), seven 'Status' selects and 'Set' buttons in a table with no header row (`console/status/page.tsx:60-71`), repeated prospect, ticket and specialist-queue links. Only three tables in the app mark a row header (`components/packets/pricing.tsx:115`, `components/models/display.tsx:104`, `components/contracts/review.tsx:245`), so neither the cell nor table navigation names the row. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 2.4.4 Link Purpose (In Context) (A), 1.3.1 Info and Relationships (A), 2.4.6 Headings and Labels (AA), 4.1.2 Name, Role, Value (A)
- **Fix:** In every table, make the row's identifying cell a `<th scope="row">` (the claim and line, the code and service date, the entry number, the version, the email, the ticket, the component), give an action column a header ('Actions', visually hidden where it has no visible one), and give each repeated control a name that carries its row in visually hidden text after the visible words, so Label in Name holds: 'Line trace<span class="sr-only">, 97110 on 2026-04-03, line 4</span>', 'End now<span class="sr-only">, grant SYN-TOUR-4</span>', a select labelled 'Role' with ' for analyst@synthetic.test' hidden. One helper (`RowLabel`) keeps the pattern. Name the access log's links in words ('Reads of this case') and the monthly table's figures ('3 lines at actionable'). Turn on axe's `empty-table-header` and `td-has-header` rules.
- **Size:** M.
- **Files:** `apps/web/src/components/row-label.tsx` (new), `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/components/reports/documents.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/components/reports/roi.tsx`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 25 `co-001/ux-row-headers` (outside #42's files); UX PR 74 `co-001/ux-console-support-page` (the console support page); UX PR 75 `co-001/ux-users-page` (the users page).
- **Sources:** `a11y-other-10`, `a11y-practice-1-21`, `a11y-practice-2-04`.
- **Verification:** corrected: three tables already have row headers (`packets/pricing.tsx:115`, `models/display.tsx:104`, `contracts/review.tsx:245`); every other cited line confirmed at 4d99df8
- **Notes:** The console support and users pages are #42's; that part lands after #42 merges, the rest first. The packet schedule and line trace are audit #38's screens (in flight, the figures in words): coordinate the row headers with that PR. PR #51 changes the reconciliation page; PR #50 the run page. The monthly summary's link text 'the ledger's' is also UX-167 (C-181) (words).

### UX-074 (C-013). A refused field is named by its code key, marked only by a red border (not at all on selects, text areas or checkbox groups), and its message sits in a summary below the form that says 'marked below'

- **Severity:** should fix. Harm area: accessibility. Reach: 12 routes, 7 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator, screening prospect, anyone signing in.
- **Screens:** `p.correspondence.error.390`, `console.billing.error.1280`, `p.cases.error.1280`, `settings.billing-org.error.1280`, `p.reconciliation.error-reverse.1280`, `console.status.error.1280`, `console.screening.error.1280`, `p.submissions.error.390`.
- **Routes:** `/p/[practiceId]/**`, `/console/billing`, `/console/status`, `/console/screening`, `/console/organizations`, `/console/organizations/[organizationId]`, `/console/practices/[practiceId]`, `/console/terms`, `/settings/billing/[organizationId]`, `/request-audit`, `/sign-in/new-password`, `/screening/results/[resultId]`.
- **Evidence:** The summary lists 'lineMateriality:', 'periodTo:', 'toMonth:', 'payerClaimControlNumber:', 'routingNumber:', 'organizationName:', 'confirm:' where the labels read Per line (dollars), Last day, Last month, Payer claim control number, Routing number, Organization, New password again; a screen reader hears 'Per line (dollars), invalid entry, lineMateriality colon ...' because the item is the control's description (`action-form.tsx:50,75`). Causes, confirmed at 4d99df8: `apps/web/src/components/action-form.tsx:76` prints `labels[issue.field] ?? issue.field`, and only 2 of 112 `<ActionForm>` uses pass `labels` (`settings/pricing/page.tsx:97,112`); `components/packets/version-form.tsx:155` and `export-status.tsx:93` print `issue.field` with no lookup; a path-less issue falls back to the key 'input' (`apps/web/src/lib/http/invoke.ts:84`). The summary renders after the fields (`action-form.tsx:66-84`) yet says 'Check the fields marked below.' (`apps/web/src/lib/http/next.ts:162,180`); on `p.correspondence.error.390` focus lands on Name about 720 px above its message. The only visible mark is `aria-invalid:border-destructive` on Input (`packages/ui/src/components/input.tsx:11`), a change of hue only; SelectField and TextAreaField have no invalid style (`components/field.tsx:75,106`), raw controls none (`cases/[caseId]/page.tsx:208`, `reconciliation/page.tsx:42`), and Field's own inline error slot (`field.tsx:10-17,36-37`) is never fed. A checkbox group named `components[]` (`console/status/page.tsx:119`) is never found by `form.elements.namedItem('components')` (`action-form.tsx:43-45`), so the fieldset gets no mark or focus. The screening split form's problem list (`components/screening/split-form.tsx:109-115`) is not a live region and marks neither field.
- **Rule:** WCAG 2.1 3.3.1 Error Identification, 1.4.1 Use of Color, 1.3.1 Info and Relationships, 1.3.3 Sensory Characteristics ('below'), 4.1.3 Status Messages (the split form); `docs/product/PRD.md:256` (every error shown with a next step)
- **Fix:** In `ActionForm` and the field components, one change. (1) Name each issue by the visible label of the control it resolves to (`control.labels[0].textContent`, or the fieldset's `<legend>` for a group), read in the effect that already finds the control; `labels` stays only as an override; an issue that resolves to no control shows its message alone, never a key. Use the same in `version-form.tsx` and `export-status.tsx`. (2) Provide the refusal through a context that `Field`, `SelectField` and `TextAreaField` read, rendering the message in Field's existing inline slot under the control with `aria-invalid` and `aria-describedby`; move the raw controls onto those components. (3) Put the summary at the top of the form, each item a link that focuses its field. Words (taken under the co-founder's ruling): the lead becomes 'Fix the fields listed here, then try again.' (true wherever it sits); items read '<Label>: <message>'. (4) One invalid look for every control, not hue alone: `[aria-invalid='true'] { border-color: var(--pw-danger); border-width: 2px }` in `packages/ui/src/styles.css`. (5) A group refusal marks its fieldset (first checkbox `aria-invalid`, issue id on the fieldset's `aria-describedby`, focus there). (6) The split form's problems sit in a `role="status"` region present from the first render, mark the field they concern, and block the post while any remain. Tests: no camelCase key followed by ':' in any rendered refusal; the summary precedes the first control.
- **Size:** M.
- **Files:** `apps/web/src/components/action-form.tsx`, `apps/web/src/components/field.tsx`, `packages/ui/src/styles.css`, `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/http/invoke.ts`, `apps/web/src/components/packets/version-form.tsx`, `apps/web/src/components/packets/export-status.tsx`, `apps/web/src/components/screening/split-form.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/console/status/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** `co-001/ux-forms`: the refused field named by its label, marked, the summary first, focus kept
- **Proposed PR:** UX PR 1 `co-001/ux-forms`.
- **Sources:** `a11y-other-02`, `a11y-practice-1-01`, `a11y-practice-1-02`, `a11y-practice-2-02`, `narrow-other-12`, `narrow-practice-1-08`, `narrow-practice-2-06`, `words-other-01`, `words-other-03`, `words-practice-04`, `words-practice-05`, `a11y-other-09`.
- **Verification:** confirmed
- **Notes:** Settled conflicts: the name comes from the DOM label (five members) rather than a registration context (two), because it also covers raw controls and groups and no page can forget it; the inline message does use a context, since React must render it. The summary moves to the top (four members) and the sentence changes to words-other-03's, which holds wherever the summary sits. The message rewrites in words-other-01 (for example 'Routing number: enter the nine digits of the routing number.') are each route's words and fold into UX-050 (C-088) (route messages), which keeps this PR clear of #42's `routes/console.ts` and `screening/routes.ts`. The raw Zod message on the status form is UX-064 (C-038). `version-form.tsx` is a packet page that audit #38 and audit #48 also touch; coordinate. Open PR #50 adds `refreshOnError` to `action-form.tsx`; whichever merges second keeps both. PR #51 changes the case, reconciliation and ledger pages.

### UX-075 (C-016). SHA-256 hashes run off the screen at 390 px, squeeze a table column to one character, or are cut short with the full value only in a hover title

- **Severity:** should fix. Harm area: accessibility. Reach: 12 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.line.default.390`, `p.roi-statement.default.390`, `p.packet.default.390`, `p.packet-reviews.default.390`, `console.rule-releases.default.390`, `p.report.default.390`, `terms.default.1280`, `console.organization.default.1280`.
- **Routes:** `/p/[practiceId]/lines/[lineId]`, `/p/[practiceId]/reports/roi/[statementId]`, `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]/reports/[reportId]/review`, `/p/[practiceId]/reports/documents/[documentId]`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/packet-reviews`, `/console/rule-releases`, `/console/terms`, `/console/compliance`, `/console/organizations/[organizationId]`, `/terms`.
- **Evidence:** Three failures of one missing component, confirmed at 4d99df8. (a) Unbroken: the line trace's '(manifest 6d346c8f…)' widens every priced line to 509 px at 390 (`lines/[lineId]/page.tsx:109`), for every role; the ROI statement (`reports/roi/[statementId]/page.tsx:74`, the earlier tour's defect, still there), the audit report PDF and CSV (`reports/[reportId]/page.tsx:82,92`), the checklist and report documents, and the rule release manifest (`console/rule-releases/page.tsx:101`) the same. (b) Squeezed: `Hash` (`components/packets/display.tsx:73-82`) renders all 64 characters as `break-all` though its comment says 'shortened on screen', so in an auto-width column it collapses to one character a line: Versions rows about 500 px tall on the packet page, and the 'PDF SHA-256' column a reviewer attests over cut unreadable at the card edge (`packet-reviews/page.tsx:40,56`). (c) Hover-only: the home agreements, the terms page, the console's terms, agreements and compliance records show 12 or 16 characters with the full value only in `title` (`p/[practiceId]/page.tsx:456-458`, `terms/page.tsx:37-38`, `console/terms/page.tsx:49-50`, `console/organizations/[organizationId]/page.tsx:257-258`, `console/compliance/page.tsx:215`), which touch and keyboard never show.
- **Rule:** ADR 0056:51-53 (no page scrolls sideways at a phone's width); WCAG 2.1 1.4.10 Reflow, 1.3.1 and 2.1.1 (information on pointer hover only); `.claude/rules/brand.md:36` (every code in the mono face). The brand is silent on how a hash is shown; recommended.
- **Fix:** One shared `<Sha256 value label />` in `apps/web/src/components/sha256.tsx`, replacing `Hash` and every raw span: the whole value, always visible, in the mono face, set to `max-w-[16ch] break-all` so it wraps in four even lines of sixteen characters (in running text, definition lists and table cells alike), with a 'Copy' button (at least 24 by 24 px, accessible name 'Copy the SHA-256') that copies the whole value and says 'Copied' in a polite status. No `title`, no truncation: the page exists to record and compare the value, and a reviewer attests over it. Keep `data-sha256` for tests. Use it on the line trace, the ROI statement, the audit report and checklist, report documents, the packet's Versions and trace, Packets to attest, the rule release manifest, the terms page, and the console's terms, agreements and compliance records.
- **Size:** M.
- **Files:** `apps/web/src/components/sha256.tsx` (new), `apps/web/src/components/packets/display.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/documents/[documentId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/packet-reviews/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/terms/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 20 `co-001/ux-sha256`.
- **Sources:** `narrow-practice-1-02`, `narrow-practice-1-05`, `narrow-practice-2-04`, `narrow-other-13`, `a11y-other-12`.
- **Verification:** confirmed
- **Notes:** Confirms and widens the earlier tour's 'ROI statement SHA-256 does not wrap at 390 px': same cause on eleven screens. Settled: the whole value wrapping at 16 characters (a11y-other-12, narrow-practice-2-04) over a 12-character prefix in tables (three members), because a prefix hides the value the page records and the reviewer attests over, and a copy control alone does not let a person read and compare it. The dates and IDs that split at hyphens (narrow-other-13) are UX-153 (C-146). The packet's trace cells are being rewritten by audit #38 (in flight): tell that PR, or land after it; the ROI page's seal is audit #46's, not this. PR #51 also changes the home page.

### UX-076 (C-014). Loading screens drop the header and Menu, show no words, and are not announced; the practice home, settings, uploads and support access have none

- **Severity:** should fix. Harm area: accessibility. Reach: 8 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.cases.loading.390`, `p.packet.loading.390`, `p.pricing-run.loading.390`, `console.rule-releases.loading.390`, `console.specialist-queue.loading.390`, `settings.billing-org.loading.390`, `account.notifications.loading.390`, `p.reconciliation.loading.390`.
- **Routes:** `/p/[practiceId]/**`, `/console/billing`, `/console/rule-releases`, `/console/specialist-queue`, `/console/practices/[practiceId]`, `/settings/billing`, `/settings/billing/[organizationId]`, `/account/notifications`.
- **Evidence:** Each loading shot is the still mark, a bar and grey rows on a blank page: no header, no lockup, no Menu, no Sign out; 28 of the 390 px loading shots are one byte-identical image, so nothing says what is loading (the rule releases and specialist queue shots are the same picture). Causes, confirmed at 4d99df8: `LoadingState` puts its label in an sr-only span inside a node carrying `role="status"`, `aria-live="polite"` and `aria-busy="true"` together (`packages/ui/src/states/loading-state.tsx:20-27`); `aria-busy` asks assistive technology to hold announcements and never clears (Next replaces the node), and a live region inserted with its text already in it is often not announced at all. All 40 `loading.tsx` files render a bare `<main className="mx-auto flex max-w-5xl flex-col gap-4 p-8">` (for example `p/[practiceId]/cases/loading.tsx:6-7`): the shell is drawn by each page from its own route result (`components/shell.tsx:13-19,304`), so the frame vanishes and the gutter jumps from 16 px (`shell.tsx:334`) to 32 px. The practice home, the settings pages, `/uploads` and the support-access grant have no `loading.tsx`, so a slow load leaves the previous screen up with no sign of work. The error boundary has the same frameless layout (`apps/web/src/app/error.tsx:13`).
- **Rule:** WCAG 2.1 4.1.3 Status Messages and 3.2.3 Consistent Navigation; `docs/product/PRD.md:260` (every screen has a loading state); `docs/brand/BRAND.md:127-128` and ADR 0056 (the mark still, a plain bar: kept). The brand is silent on a visible loading label and on the frame; recommended.
- **Fix:** (1) `LoadingState` shows its label as visible text beside the bar ('Loading cases…', `text-sm text-fg-muted`), drops `aria-busy` from the status node, and becomes a small client component whose `role="status"` region mounts empty and receives the label one tick later, so it is announced; `aria-busy="true"` moves to the loading `<main>`. Update `states.test.tsx` to match. (2) A `LoadingFrame` draws the same header and rail as `AppShell` with no per-request data (the lockup link, inert placeholders the size of the switcher, the account and the Menu), with the shell's own main padding (`px-4 py-6 md:p-8`), so the frame never blinks; extract the header markup from `shell.tsx` into a shared `ShellHeader` so the two cannot drift, keeping `shell.tsx:13-19`'s rule (no practice list or role is drawn while loading). (3) A `shape` prop (list, detail, form, report) instead of N identical rows. (4) Add `loading.tsx` for the practice home, settings, uploads and the support-access grant, and a practice-level `error.tsx` in the same frame. Part (1) lands first; parts (2) to (4) wait for #42 (`shell.tsx`).
- **Size:** M.
- **Files:** `packages/ui/src/states/loading-state.tsx`, `packages/ui/src/states/states.test.tsx`, `apps/web/src/components/loading-frame.tsx` (new), `apps/web/src/components/shell.tsx`, `apps/web/src/app/p/[practiceId]/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/settings/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/uploads/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/loading.tsx` (new), `apps/web/src/app/p/[practiceId]/error.tsx` (new), `apps/web/src/app/**/loading.tsx` (40 files).
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 28 `co-001/ux-loading-announce` (the label and the announcement); UX PR 72 `co-001/ux-loading-frame` (the frame and the missing loading files).
- **Sources:** `a11y-other-26`, `a11y-practice-1-17`, `a11y-practice-2-10`, `narrow-other-07`, `narrow-practice-1-10`, `narrow-practice-2-05`.
- **Verification:** confirmed
- **Notes:** Words taken under the co-founder's ruling: the visible label is the one each file already passes ('Loading cases', 'Loading the pricing run'), with an ellipsis. Chosen: a frame shared with the shell (four members) over a real practice layout, which `shell.tsx:13-19` rules out because the switcher must come from each request. A root-layout live region written by a hook (a11y-practice-2-10) was weighed; the delayed-label region does the same with no global state. The label and announcement part touches no #42 file; the frame does, through `shell.tsx`.

### UX-077 (C-039). Fields never state the format they check (month fields, ticket, hash, NPI and tax ID fields, the no-patient-information rule); it lives in card text or placeholders

- **Severity:** should fix. Harm area: accessibility. Reach: 9 routes, 4 roles.
- **Roles:** billing manager, practice administrator, operator, organization administrator.
- **Screens:** `p.pricing-runs.default.1280`, `p.remittances.default.1280`, `p.reports.default.1280`, `console.support.default.1280`, `console.compliance.default.1280`, `support.default.1280`, `support.error.1280`.
- **Routes:** `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/remittances`, `/p/[practiceId]/claims`, `/p/[practiceId]/reports`, `/p/[practiceId]/reports/monthly`, `/console/support`, `/console/compliance`, `/console/organizations/[organizationId]`, `/support`.
- **Evidence:** Seven `type="month"` inputs carry no hint (`pricing-runs/page.tsx:87,91`, `remittances/page.tsx:47,51`, `claims/page.tsx:80,84`, `reports/page.tsx:198`, `reports/monthly/page.tsx:53`): Chromium shows '--------- ----', and Firefox and desktop Safari render a plain text box where the person must guess '2026-03'. Pattern-checked fields with no hint fall back to the browser's 'Please match the requested format.': Ticket (`console/support/page.tsx:56`), the compliance SHA-256 (`console/compliance/page.tsx:191`; the agreement SHA-256 does carry one, `console/organizations/[organizationId]/page.tsx:274`), NPI and tax ID last four (`:108-109`). On `/support` the rule that most often refuses a ticket, no patient names, dates of birth, member IDs or claim numbers, sits in the card description (`support/page.tsx:42-46`), not tied to Subject or the message. Placeholders carry the format elsewhere (for example the reference search's 'SK6CS-K6CSK'). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 3.3.2 Labels or Instructions (A), 3.3.3 Error Suggestion (AA), 1.3.1 Info and Relationships (A)
- **Fix:** Every field that checks a format states it in a hint through `Field`'s `hint` prop, so `aria-describedby` carries it and it stays visible: month fields 'Year and month, such as 2026-03'; Ticket 'Letters, digits and hyphens, such as SYN-1234'; SHA-256 '64 hexadecimal characters'; NPI 'Ten digits'; tax ID 'Four digits'. On `/support` put the no-patient-information rule in the Subject and message hints (its words follow UX-191 (C-173)). Move the raw month `Input`s onto `Field`. Add a unit test that fails when a `Field` has `pattern` or `type="month"` without `hint`. Placeholders keep only examples already stated in a hint.
- **Size:** S.
- **Files:** `apps/web/src/components/field.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/monthly/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/support/page.tsx`, `apps/web/src/app/console/support/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/console/support/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 16 `co-001/ux-field-hints` (outside #42's files); UX PR 74 `co-001/ux-console-support-page` (the Ticket field).
- **Sources:** `a11y-other-20`, `a11y-practice-2-14`.
- **Verification:** confirmed
- **Notes:** The console Ticket field is on `console/support/page.tsx` (#42's): that line lands after #42 merges; the rest first. The placeholders' own contrast is UX-090 (C-071). The six-digit code fields already state their format. Words taken under the co-founder's ruling.

### UX-078 (C-034). At 390 px rows that carry forms or long names do not stack: each row's action sits off-screen, the ledger correction opens in a 180 px cell, names wrap one word per line

- **Severity:** should fix. Harm area: accessibility. Reach: 9 routes, 3 roles.
- **Roles:** organization administrator, operator, practice administrator.
- **Screens:** `settings.users.default.390`, `console.support.default.390`, `console.prospects.default.390`, `p.abstraction-ledger.error-adjust-zero.390`, `console.organization.default.390`, `console.models.default.390`, `console.status.default.390`, `p.abstraction-ledger.default.390`.
- **Routes:** `/settings/organizations/[organizationId]/users`, `/console/organizations/[organizationId]`, `/console/support`, `/console/tickets`, `/console/prospects`, `/console/models`, `/console/status`, `/console/billing`, `/p/[practiceId]/abstraction/ledger`.
- **Evidence:** At 390 px the Role select, Change role, 'They lose access now' and End membership run from x 370 to 667, right of the viewport, in an unlabelled fourth column (`settings/organizations/[organizationId]/users/page.tsx:51-89`, header `:57`); 'End now' sits at x 650-740 while Ticket and Practice are at x 75-230 (`console/support/page.tsx:65`); tickets' and prospects' actions likewise (`console/tickets/page.tsx:46`, `console/prospects/page.tsx:50`). Even in a scroller, reaching the button scrolls the email or grant out of view, so ending the wrong membership or grant is easy. The ledger's AdjustForm, a `<details>` with a 12 px summary holding an ActionForm, opens inside the row's last cell (`p/[practiceId]/abstraction/ledger/page.tsx:20-43,75`): about 180 px wide, its consequence runs about 30 lines, and focusing the amount scrolls the entry's number, stage and amount off the left edge, so the specialist corrects a ledger amount without seeing which entry. Tables that do fit wrap names one word per line and push controls into the card edge (`console/models/page.tsx:120`, `console/status/page.tsx:60-72`, `console/billing/page.tsx:40`). Confirmed at 4d99df8.
- **Rule:** ADR 0056:51-53 (no page scrolls sideways; a definition list stacks its terms over their values); WCAG 2.1 1.4.10 Reflow, 1.3.2 Meaningful Sequence, 3.3.2 Labels or Instructions; the brand is silent on in-table forms: recommended
- **Fix:** Below `sm`, render each row of a record list that carries actions as a stacked item: the identity (email, ticket and practice, organization, component, model feature) as its heading, the facts as a definition list, and the row's forms full width underneath, so each action reads with the row it changes; from `sm` up keep the table, with a visible 'Actions' header on the action column. Take the ledger's AdjustForm out of the cell: the row keeps a full-size 'Adjust entry 7' button, and opening it shows the form in a full-width row under the entry (`<td colSpan>`), or in the entry's stacked item below `sm`, headed by its target, 'Entry 7, Recouped, 2026-08-03, −$18.00, the reconcile job'; the same for the Shortfalls list. Record the rule in ADR 0056's chrome paragraph beside the definition-list rule: a table of figures scrolls in its card (UX-011 (C-002)); a list of records with per-row actions stacks.
- **Size:** M.
- **Files:** `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/models/page.tsx`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/console/billing/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/app/console/support/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 13 `co-001/ux-ledger-corrections` (the ledger's AdjustForm out of its cell); UX PR 34 `co-001/ux-phone-record-lists` (the console record pages); UX PR 74 `co-001/ux-console-support-page` (the console support page); UX PR 75 `co-001/ux-users-page` (the users page).
- **Sources:** `narrow-other-04`, `narrow-other-20`, `narrow-practice-1-11`.
- **Verification:** confirmed
- **Notes:** The users and console support pages are #42's: that part lands after #42 merges; the rest first. The ledger page is in open PR #51 (audit #12, ledger amounts in payment terms): land the AdjustForm part after it. The ledger change is layout only (no ledger package change). The ADR line adds to ADR 0056, it reverses nothing. Layout choice taken under the co-founder's ruling.

### UX-079 (C-043). At 390 px a table's hidden columns give no sign that they exist, and on the working lists they are what the person came for (a case's deadline and owner, a line's shortfall and status)

- **Severity:** should fix. Harm area: accessibility. Reach: 7 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, screening prospect, operator.
- **Screens:** `p.cases.deadline-14.390`, `p.claims.viewer.390`, `p.cases.default.390`, `p.claims.default.390`, `screening.default.390`, `console.screening.default.390`, `p.packet.default.390`, `p.anomalies.cohort.390`.
- **Routes:** `/p/[practiceId]/cases`, `/p/[practiceId]/claims`, `/p/[practiceId]/anomalies`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]`, `/screening`, `/console/screening`.
- **Evidence:** Every cut-off table ends flush at the card edge, mid-word or mid-figure ('Actiona…', '1.0(', '$14.0(', 'Exa'), with no fade, arrow or words to say more lies to the right; phone scrollbars are hidden at rest. `ScrollTable` (`apps/web/src/components/scroll-table.tsx:9-15`) is a bare scroller with no cue. On the working lists the hidden columns are the point: Cases (`p/[practiceId]/cases/page.tsx:246-287`) shows payer, pattern, state, lines and total while Deadline, Pursuit cost and Owner are off screen, even on `p.cases.deadline-14.390`, the dashboard's deadline deep link; Claims and lines (`claims/page.tsx:136-154`) stops after Expected allowed, so Short, Paid, Patient share and Status are hidden. The case page's own lines already stack into cards and read well at 390 px (`cases/[caseId]/page.tsx:160-172`). The screening's column reference ('What the file holds', `apps/web/src/app/screening/page.tsx`) cuts its Example column; the console's split history hides Facility, Non-facility and Status. Confirmed at 4d99df8.
- **Rule:** `docs/brand/BRAND.md:123-124` and `.claude/rules/brand.md:36-37` (expected, paid and short together, in that order); `docs/product/PRD.md:270,277` (Claims and lines shows status; the case list shows deadline and owner); ADR 0056:52 sets the scroller but is silent on a cue and on which columns stay in view: recommended
- **Fix:** Three parts, in UX-011 (C-002)'s table PR. (a) `ScrollTable` shows that it scrolls: CSS-only edge fades in token colours by the `background-attachment: local` technique, written as classes (no style attribute, so the CSP holds), appearing only while columns lie past an edge, plus the visible caption 'Scroll sideways for more columns' below `sm` while it overflows. (b) The row's naming cell (payer and plan, claim, version) is `position: sticky` at the left, so the far columns stay tied to their row. (c) Below `sm` the working lists (Cases, Claims and lines, the anomaly's Flagged lines) render each row as a stacked card, as the case page's lines do: the naming link first; expected, observed and short in the brand's order in the mono face; the status, deadline and owner; the row's action last. The screening's three-column reference stacks as a definition list per column below `sm`. Reference tables (Agreements, Fields, Versions) keep (a) and (b).
- **Size:** M.
- **Files:** `apps/web/src/components/scroll-table.tsx`, `apps/web/src/app/brand.css`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/app/console/screening/page.tsx`, `apps/web/src/app/screening/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/screening/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 3 `co-001/ux-table-scroll` (part (a): the scroll cue in ScrollTable, and the one stacked-row primitive that parts (b) and (c), UX-005 and UX-078 use); UX PR 34 `co-001/ux-phone-record-lists` (parts (b) and (c): the sticky naming cell and the stacked working lists); UX PR 85 `co-001/ux-screening-messages` (the screening template's stacked reference).
- **Sources:** `narrow-practice-1-04`, `narrow-other-06`.
- **Verification:** confirmed
- **Notes:** Confirms the earlier tour's 'practice home agreements table cut off at 390 px' (UX-011 (C-002) owns its scroller) and updates 'screening template table cut off at 390 px': it is not cut off but scrolls with no cue. The brand's 'no gradients or shadows' (`docs/brand/BRAND.md:147`) is about the mark, so an edge fade on a table is allowed; the brand is silent on scroll cues. The ledger's stacked rows are UX-078 (C-034). The screening page is #42's, so that part lands after #42 merges. The packet tables are audit #38's screens; audit #38 rewrites the calculation cells, so coordinate. Audit #107 adds columns to Claims and lines; land the stacked layout with or before it. Layout taken under the co-founder's ruling.

### UX-080 (C-015). The 56 px sticky header covers the focused control and fragment targets: no scroll padding is set

- **Severity:** should fix. Harm area: accessibility. Reach: 6 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.packet.default.1280`, `p.roi-statement.default.1280`, `p.report.default.1280`, `p.reconciliation.case-ledger.1280`, `p.claims.error.390`, `console.practice.error.390`, `p.packet.default.390`, `p.line.default.1280`.
- **Routes:** `every route with the app header`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/reports/roi/[statementId]`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/reports/[reportId]`, `/console/practices/[practiceId]`.
- **Evidence:** The header is `sticky top-0 z-30 h-14` with an opaque background (`apps/web/src/components/shell.tsx:315`), and no `scroll-padding` or `scroll-margin` exists anywhere in `apps/web/src`, `packages/ui` or `packages/brand` (confirmed by search at 4d99df8; `apps/web/src/app/brand.css:6-13` sets none). So Shift+Tab up a long page (packet 4,510 px at 1280, 7,000 px or more at 390), ActionForm's focus on the first refused control (`components/action-form.tsx:52`), and fragment links (the ROI statement's entry link to `reconciliation#entry-<id>`, `components/reports/roi.tsx:70`; the report's `#stage-*` links, `components/reports/display.tsx:93,104`; the case's `#notes`) bring their target to the viewport's top edge, behind the header. The keyboard helper `tabTo` (`apps/web/e2e/a11y.ts:36-41`) checks only that an outline exists, not that the element is visible.
- **Rule:** WCAG 2.2 2.4.11 Focus Not Obscured (Minimum) (AA), which combined audit #103 adds ('focus not hidden under the sticky header'); WCAG 2.1 2.4.3 Focus Order
- **Fix:** One rule in `apps/web/src/app/brand.css`, scoped to pages that have the sticky header: `html:has([data-slot="app-header"]) { scroll-padding-top: calc(3.5rem + 0.5rem); }`, with a comment tying it to the header's `h-14` (if the phone header gains a second row under UX-021 (C-027), the value follows it through one custom property, `--pw-header-height`). It covers focus scrolling, Tab and fragment jumps without touching `shell.tsx`. Extend `tabTo` to assert, at 1280 and 390 px, that the focused element's top lies below the header's bottom while Shift+Tabbing back through the packet builder, and that the `#entry-<id>` row is visible after following an ROI entry link.
- **Size:** S.
- **Files:** `apps/web/src/app/brand.css`, `apps/web/e2e/a11y.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 33 `co-001/ux-focus-touch`.
- **Sources:** `a11y-practice-1-08`, `a11y-practice-2-06`, `narrow-other-08`, `narrow-practice-1-13`, `narrow-practice-2-09`.
- **Verification:** confirmed
- **Notes:** Settled: the rule goes in `brand.css` (four members) but scoped with `:has([data-slot="app-header"])` (narrow-other-08's idea), so public pages without the sticky header keep their scroll positions. Kept out of `shell.tsx`, so it need not wait for #42. audit #103's per-route gate (Lane A's PR 7) can reuse the helper.

### UX-081 (C-022). Busy buttons take the disabled attribute, so keyboard focus drops to the page and the wait and its end are never announced

- **Severity:** should fix. Harm area: accessibility. Reach: 5 routes, 6 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator, anyone signing in.
- **Screens:** `sign-in-hardware-key.default.1280`, `sign-in-hardware-key.error-no-credential.1280`, `sign-in-register-key.error.1280`, `p.cases.notice.1280`, `p.submissions.notice.1280`, `p.packet.notice-exported.1280`, `p.uploads.default.1280`.
- **Routes:** `every route with a form`, `/sign-in/hardware-key`, `/sign-in/register-key`, `/p/[practiceId]/uploads`, `/settings/billing/[organizationId]`.
- **Evidence:** Every busy button is disabled under the person's focus, so focus falls to `<body>` and the next Tab starts again at the lockup; the new words on a disabled button are not announced. Confirmed at 4d99df8: `ActionForm` (`apps/web/src/components/action-form.tsx:86-87`, 'Working…' outside any live region; its own comment at `:12-13` records the dropped focus), the packet version and export buttons (`components/packets/version-form.tsx:63`, `export-status.tsx:102`), the hardware-key sign-in and registration ('Waiting for the key…', `components/hardware-key.tsx:83-85,126-128`; on failure the Problem alert at `:26-36` takes no focus), the live Stripe form (`components/billing/stripe-payment-method.tsx:221`, moved by PR #47 and unchanged in behaviour), and the receipts pager, whose 'Older' disables itself on the last page and announces nothing (`components/uploads/receipts.tsx:193-200`).
- **Rule:** WCAG 2.1 2.4.3 Focus Order (A) and 4.1.3 Status Messages (AA)
- **Fix:** One `busy` behaviour on the shared `Button` (or a `SubmitButton` in `apps/web/src/components`): while busy it sets `aria-disabled="true"` and ignores activation (an early return in the click or submit handler) instead of `disabled`, so it keeps focus; a polite `role="status"` element inside the form, present from the first render, says what is happening. Words (taken under the co-founder's ruling): 'Working…' for forms; 'Waiting for your hardware key. Touch it, then confirm with its PIN or fingerprint.' for the key buttons. On a key failure, focus moves to the Problem alert (`tabIndex={-1}`), as `ActionForm` does for a refusal. The receipts pager uses `aria-disabled` at its ends and announces 'Page 2 of 3, 50 files' in a polite status. Use it in `ActionForm`, the two packet buttons, both key buttons and the Stripe form. The saved notice's focus is UX-082 (C-021)'s.
- **Size:** S.
- **Files:** `packages/ui/src/components/button.tsx`, `apps/web/src/components/action-form.tsx`, `apps/web/src/components/packets/version-form.tsx`, `apps/web/src/components/packets/export-status.tsx`, `apps/web/src/components/hardware-key.tsx`, `apps/web/src/components/billing/stripe-payment-method.tsx`, `apps/web/src/components/uploads/receipts.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** `co-001/ux-forms` (ActionForm's busy button and focus; the key buttons, packet buttons, Stripe form and pager are new work)
- **Proposed PR:** UX PR 1 `co-001/ux-forms` (ActionForm's busy button and focus); UX PR 23 `co-001/ux-buttons` (the hardware-key, packet, Stripe and pager buttons).
- **Sources:** `a11y-practice-1-04`, `a11y-other-07`, `a11y-practice-2-23`.
- **Verification:** corrected: the Stripe button moved with PR #47 to `components/billing/stripe-payment-method.tsx:221` (still disabled while pending); two more busy buttons found at `packets/version-form.tsx:63` and `packets/export-status.tsx:102`
- **Notes:** The notice after a save (focus and announcement of '?notice=' confirmations) belongs to UX-082 (C-021) (notices) and UX-013 (C-018) (URL notices), writer B's. The packet buttons sit on packet pages that audit #38 and audit #48 also change; coordinate. The key registration's 'Not signed in' title is UX-180 (C-171).

### UX-082 (C-021). Every notice is an assertive alert (Alert defaults to role='alert'), and success, information, warning and danger look alike: a white card, with danger only in the title

- **Severity:** should fix. Harm area: accessibility. Reach: 8 routes, 2 roles.
- **Roles:** all signed-in roles, screening prospect.
- **Screens:** `p.roi-statement.default.1280`, `p.defaults.notice.1280`, `account.notifications.saved.1280`, `p.packet.default.1280`, `p.contract-version.default.1280`, `settings.billing-org.default.1280`, `screening.sent-waiting.1280`, `request-audit.default.1280`.
- **Routes:** `/p/[practiceId]/**`, `/account/notifications`, `/settings/**`, `/console/**`, `/screening`, `/request-audit`, `/support`, `/terms`.
- **Evidence:** `packages/ui/src/components/alert.tsx:6-14` has two variants: default is `bg-card` (a white bordered box like a Card) and destructive is the same box with danger text only, no danger tint. `Alert` defaults to `role='alert'` (:18), and most of its 257 call sites take it, so 'Your preferences are saved.' (`apps/web/src/app/account/notifications/page.tsx:32`), standing explanations ('Pricing uses this version', `apps/web/src/components/contracts/review.tsx:52`) and the 120-word 'Check your email' box (`apps/web/src/app/screening/page.tsx:43`) interrupt a screen reader as an error does. Warnings split by screen: 'A payment failed' is default (`settings/billing/[organizationId]/page.tsx:53`) while 'Follow-up due' is destructive (`cases/[caseId]/page.tsx:60`); the same Medicare Advantage route notice is destructive on the packet (`components/packets/display.tsx:235`) and default on Regulations (`abstraction/regulations/page.tsx:58`). Sign-in already uses role='status' (`apps/web/src/app/sign-in/notice.tsx:26`).
- **Rule:** WCAG 2.1 SC 4.1.3 (status messages) and SC 1.3.1; ADR 0056 (`docs/adr/0056-...md:90-92`: a system state is a neutral badge, a failure is danger text on the danger tint); `.claude/rules/brand.md:26-28` (status colours are for data only); `docs/brand/BRAND.md:81-82`
- **Fix:** One `Notice` in `packages/ui` with four kinds told apart by surface, icon and words, none borrowing a status colour: info, the inset tint with its rule, an 'i' icon, role='note'; success, the ground with its rule, a check icon, a title saying what was done, role='status', focused after the redirect that set it (UX-013 (C-018)'s flash); warning, the ground with a 3 px Ink left rule, a warning icon, a title naming the action needed, role='status'; danger, danger text and rule on `--pw-danger-bg`, an alert icon, role='alert', focused as ActionForm already does. `Alert`'s default role follows its kind, so no caller gets role='alert' by accident. Map every call site to a kind by what it says, and add a test that every Notice passes a kind. Icons are inline SVG, aria-hidden, drawn once in `packages/ui`.
- **Size:** L.
- **Files:** `packages/ui/src/components/alert.tsx`, `packages/ui/src/components/components.test.tsx`, `apps/web/src/components/action-form.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/regulations/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/app/screening/page.tsx`, `apps/web/src/components/screening/upload-form.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/screening/page.tsx`, `apps/web/src/components/screening/upload-form.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 14 `co-001/ux-notice` (outside #42's files); UX PR 84 `co-001/ux-screening-upload-page` (the screening page and the upload form).
- **Sources:** `brand-05`, `a11y-other-16`, `a11y-practice-1-05`, `a11y-practice-2-21`.
- **Verification:** corrected: 'A payment failed' is at `settings/billing/[organizationId]/page.tsx:53` at 4d99df8 (brand-05 cites :52); the rest confirmed
- **Notes:** Default role differed: none (a11y-practice-1-05), status (a11y-other-16), note for information (brand-05). Settled by kind, so each message's urgency matches its role. Brand choices taken under the co-founder's ruling, the rules being silent: no warning hue (an amber would sit between Short and Brass and would be a palette change, the brand owner's under ADR 0058 D9), and success uses no status colour (Whole stays data only). The component and the non-#42 call sites land now; the screening page and `upload-form.tsx` (#42 files) after #42 merges. Coordinate with `co-001/ux-forms`, which changes ActionForm's refusal.

### UX-083 (C-025). No skip link: 17 to 22 header and rail tab stops before every page's content

- **Severity:** should fix. Harm area: accessibility. Reach: 2 routes, 7 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator, anyone signing in, screening prospect.
- **Screens:** `p.home.default.1280`, `p.cases.default.1280`, `console.organizations.default.1280`, `console.compliance.default.1280`, `p.pricing-runs.default.1280`, `account.devices.internal-shell.1280`.
- **Routes:** `every page in the app shell`, `public and sign-in pages`.
- **Evidence:** Tab order on every shell page: the lockup link, the switcher, the account menu, then up to 18 rail links (`apps/web/src/components/shell.tsx:185-294`), then 'Help with this screen' (`:335`), and only then the page. No skip link exists anywhere in `apps/web/src` or the root layout (`apps/web/src/app/layout.tsx`). The header, the named navs and `<main>` (`shell.tsx:315,331,334`) let a screen-reader user jump by landmark, so 2.4.1 is met to the letter; a sighted keyboard user has no jump. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 2.4.1 Bypass Blocks (met through landmarks, ARIA11; the skip link is G1, which serves sighted keyboard users); `docs/product/PRD.md:256` (keyboard navigation on every screen)
- **Fix:** Make the first focusable element of `AppShell`, the public header and the sign-in layout a link 'Skip to main content', visually hidden until it takes focus (`sr-only focus:not-sr-only`, shown at the top left over the header with the `--pw-focus` ring), pointing to `<main id="main" tabIndex={-1}>`. Add a keyboard check: the first Tab on a practice page reaches the skip link, and Enter moves focus into main.
- **Size:** S.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/components/public-header.tsx`, `apps/web/src/app/sign-in/layout.tsx`, `apps/web/e2e/a11y.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 68 `co-001/ux-skip-and-rail`.
- **Sources:** `a11y-other-25`, `a11y-practice-1-09`, `a11y-practice-2-08`.
- **Verification:** confirmed
- **Notes:** Severity should_fix (one member said polish): not a conformance failure, but about 22 stops on every page of a keyboard-heavy product. Lands after #42 merges (`shell.tsx`); the public header and sign-in layout parts are free. Words taken under the co-founder's ruling: 'Skip to main content'.

### UX-084 (C-026). The current rail item, and the current line or diff filter, are marked by a 2.4:1 brass underline or by weight alone

- **Severity:** should fix. Harm area: accessibility. Reach: 3 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.home.tiles.1280`, `console.billing.default.1280`, `p.cases.default.1280`, `p.compare.diff-filter.1280`, `p.pricing-run.default.1280`, `account.devices.default.1280`.
- **Routes:** `every page in the app shell`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/pricing-runs/compare`.
- **Evidence:** `RailLink` marks the current page with `font-medium` and a 2 px brass underline (`apps/web/src/components/shell.tsx:117-120`). Brass #C99A3B on the rail's #F7F8FA is 2.42:1 (computed from `packages/brand/src/tokens.css:10,26`), under the 3:1 a state indicator needs, and 500 against 400 weight at 14 px is hard to see. The line filters on a pricing run and the diff filters on compare differ only by weight 500 against 400, all underlined links (`pricing-runs/[runId]/page.tsx:227`, `pricing-runs/compare/page.tsx:91-92`). `aria-current` is set, so screen readers are told; a low-vision sighted user is not. In dark the underline is 6.5:1. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.4.11 Non-text Contrast (AA) for the indicator of a state; `.claude/rules/brand.md:32` keeps Brass as the single active-nav underline (kept), and is silent on a second cue: recommended
- **Fix:** Keep the brass underline and add a cue that carries the state by itself: the current rail item at weight 600 in `--pw-fg` with a 2 px `--pw-fg` bar on its inline-start edge (15.6:1 on the rail; `border-s-2 border-fg`, the others `border-transparent` so nothing shifts). The current filter on a pricing run and on compare is shown as bold text that is not a link, with `aria-current="true"`, and each filter shows its count ('Short (12)'). Dark mode uses the same tokens.
- **Size:** S.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 38 `co-001/ux-pricing-runs` (the run and compare filters); UX PR 68 `co-001/ux-skip-and-rail` (the rail).
- **Sources:** `a11y-other-22`, `a11y-practice-1-11`, `a11y-practice-2-09`.
- **Verification:** confirmed
- **Notes:** Brand choice taken under the co-founder's ruling: the Ink inline-start bar with weight 600 (two members) over weight alone (a11y-other-22), because weight is not a contrast cue and the bar uses an existing token, leaves brass its one job and adds no colour (not a palette change). The settings tab's current mark is UX-177 (C-140) and the chosen release's is UX-149 (C-143) (a11y-practice-2-09's other parts). The rail part waits for #42 (`shell.tsx`); the filter part can land first. Open PR #50 changes `pricing-runs/[runId]/page.tsx`; whichever merges second keeps both.

### UX-085 (C-029). The e2e accessibility gate never visits half the routes, checks no refused, forbidden, open-menu or dark state, runs no WCAG 2.2 rules, and passes an invisible focus ring

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 7 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator, anyone signing in, screening prospect.
- **Screens:** `sign-in.default.1280`, `sign-in-mfa.error.1280`, `console.support.error.1280`, `console.organizations.account-menu.1280`, `console.organizations.error-forbidden.1280`.
- **Routes:** `every page route`.
- **Evidence:** `expectAccessible` runs axe with the tags wcag2a, wcag2aa, wcag21a and wcag21aa only (`apps/web/e2e/a11y.ts:12`), so target-size (wcag22aa), page-has-heading-one, heading-order, empty-table-header and label-content-name-mismatch never run. It is called in 12 specs (66 calls; `contracts.spec.ts` imports `a11y.ts` only for `atPhoneWidth`, with `{ axe: false }` at :167), on pages as loaded: never on the six sign-in steps, the abstraction, contracts, mapping or line-trace routes, 18 of the 28 routes in one practice set, nor on a permission state, with a header menu open, or in dark, and after a refusal on all but two forms (the pricing settings' refused ZIP, `apps/web/e2e/onboarding.spec.ts:536-542`, and the screening's, `screening.spec.ts:715-727`; also a refused export, `packets.spec.ts:251`). The file's own comment says the gate checks 'landmarks, headings' (`a11y.ts:5-7`), but the landmark and heading rules are tagged `best-practice`, so the tags at `:12` never run them. `tabTo` accepts any element whose `outlineStyle` is not 'none' or whose `boxShadow` is not 'none' (`a11y.ts:37-40`), so a transparent or zero-width outline passes, and nothing checks the focused element is on screen. Confirmed at 4d99df8.
- **Rule:** Combined audit #103 (every route under WCAG 2.2's rules, focus not hidden under the sticky header, manual checks recorded); `docs/product/PRD.md:256` (accessibility on every screen)
- **Fix:** Inside audit #103's generated every-route check (Lane A, PR 7): visit each page route with a role that can open it, failing when a route has none, at 1280 and 390 px; add `wcag22aa` and enable `page-has-heading-one`, `heading-order`, `landmark-unique`, `empty-table-header` and `label-content-name-mismatch` by rule id; visit each route also in its refused state (the first ActionForm submitted with a bad value; the pricing settings and screening ZIP refusals are already covered), its permission state, with each header panel open, and with `data-theme="dark"` (advisory while dark is off, UX-118 (C-080)); make `tabTo` assert an outline at least 2 px wide with 3:1 against the page and that `document.elementFromPoint` at the focused element's centre returns it. Record as manual checks, with this review's findings as their first cases: 3.3.7 (values kept after a refusal), 3.3.8 (paste into the code field), 2.5.3, 2.2.1 (step time limits), 2.4.4 in context, 4.1.3 and focus return after menus.
- **Size:** M.
- **Files:** `apps/web/e2e/a11y.ts`, `apps/web/e2e/onboarding.spec.ts`, `apps/web/e2e/security.spec.ts`, `apps/web/e2e/contracts.spec.ts`, `apps/web/e2e/mapping.spec.ts`, `apps/web/e2e/reports.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** audit #103, Lane A's PR 7: the every-route accessibility gate: routes, states, rules, the focus check
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `a11y-other-24`, `a11y-practice-1-28`, `a11y-practice-2-19`.
- **Verification:** confirmed
- **Notes:** Not a Lane B PR: the route, state and rule lists go to Lane A for audit #103's gate in Lane A's PR 7. Lane B's own fixes add their checks as they land (UX-080 (C-015) and UX-093 (C-023) extend `tabTo`; UX-011 (C-002) runs `atPhoneWidth`), which audit #103 then generalises. Lane A's PR 7 is a schema PR only for its read functions; this part needs no DDL. Corrected on review: 12 specs, not 13, and two refused states are already checked.

### UX-086 (C-031). Reports, documents, ROI statements, runs and Compare say 'reload in a moment': nothing refreshes and nothing announces when the work is done

- **Severity:** should fix. Harm area: accessibility. Reach: 5 routes, 3 roles.
- **Roles:** billing manager, practice administrator, packet approver.
- **Screens:** `p.report.generating.1280`, `p.report.generating.390`, `p.reports.default.1280`, `p.report-review.empty.390`.
- **Routes:** `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]/reports/documents/[documentId]`, `/p/[practiceId]/reports/roi/[statementId]`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/pricing-runs/compare`.
- **Evidence:** A queued audit report shows a static 'Generating … reload in a moment' alert (`reports/[reportId]/page.tsx:51-56`); the same manual reload stands for a printing document (`reports/documents/[documentId]/page.tsx:51`), a printing ROI statement (`reports/roi/[statementId]/page.tsx:79`), a run being priced (`pricing-runs/[runId]/page.tsx:173-177`) and Compare waiting on a run (`pricing-runs/compare/page.tsx:75`). Nothing refreshes, so anyone, and a screen-reader user in particular, learns of completion only by reloading by hand. The product already does it right twice: the packet export's status refreshes itself in a polite region with 'Check again' (`components/packets/export-status.tsx:15-44`), and upload receipts poll (`components/uploads/receipts.tsx:84-104`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 4.1.3 Status Messages (AA); `docs/product/PRD.md:256` (every error shown with a next step) and `:260` (a loading state per screen)
- **Fix:** Generalise the export's pattern into one `JobStatus` client component and use it on the five pages: a `role="status"` polite region that calls `router.refresh()` every 5 seconds while the job is queued or running, says how long it has waited, offers 'Check again', and when the job ends announces it ('The report is ready. Its PDF and CSV are below.'). Past ten minutes it stops polling and says 'This is taking longer than usual. Reload the page later; if it is still not ready, open a support ticket from Help with this screen.' The export status then uses the same component.
- **Size:** S.
- **Files:** `apps/web/src/components/job-status.tsx` (new), `apps/web/src/components/packets/export-status.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/documents/[documentId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 27 `co-001/ux-job-status`.
- **Sources:** `a11y-practice-2-11`, `flows-practice-34`, `narrow-practice-2-17`.
- **Verification:** confirmed
- **Notes:** Words taken under the co-founder's ruling. The ROI statement page is audit #46's screen (the Verified seal, queued in the 15b session) but the printing wait is outside the seal's scope; coordinate the file. Open PR #50 changes the run and compare pages; whichever merges second keeps both. The checklist's file links before the files exist are another finding.

### UX-087 (C-036). Forms built outside ActionForm (packet reference search, the screening file field, the template sample) do not tie a refused value to its control or announce it

- **Severity:** should fix. Harm area: accessibility. Reach: 3 routes, 4 roles.
- **Roles:** billing manager, packet approver, practice administrator, screening prospect.
- **Screens:** `p.by-reference.error.1280`, `screening.error-dos.1280`, `screening.error-member-id.1280`, `screening.file-ready.1280`, `p.template.error.1280`, `p.template.preview.1280`.
- **Routes:** `/p/[practiceId]/cases/by-reference`, `/screening`, `/p/[practiceId]/reconciliation/template`.
- **Evidence:** Packet reference: 'Not a reference' shows in an alert under the form (`p/[practiceId]/cases/by-reference/page.tsx:35-40`) while the field still holding 'hello' has no `aria-invalid` and is described only by its hint (`components/packets/reference-search.tsx:9`). Screening file field: the 'Not sent' alert (`components/screening/upload-form.tsx:249-262`) is not in the input's `aria-describedby` and the input is not marked; pressing 'Screen the file' with a refused file returns silently (`upload-form.tsx:126-128`); 'Reading the file in this browser…' sits outside the live region while the button is disabled (`:223,282`). Posting template: 'That file is not a CSV with a header row.' is a plain `<p>` (`components/reconciliation/template-mapper.tsx:100-104`), not tied to the file input or announced, and the preview's one-line result appears with no status role (`:156-207`). The screening form's own server refusals are well built (shown under each field, focus moved, `upload-form.tsx:88-95`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 3.3.1 Error Identification (A), 4.1.3 Status Messages (AA), 1.3.1 Info and Relationships (A)
- **Fix:** Reference search: `ReferenceSearch` takes the refusal; the input gets `aria-invalid` and the message under it with an id placed first in `aria-describedby` (ahead of the hint); the page's separate alert goes. Screening file field: give 'Not sent' an id, add it to the file input's `aria-describedby` with `aria-invalid="true"` while it shows; on a submit with a refused or missing file, move focus to the file input instead of returning silently; put 'Reading the file in this browser…' inside the existing `role="status"` region, and keep the button enabled while reading, saying 'Wait until the file has been read.' if pressed. Template sample: tie the sample problem to its file input (`aria-describedby`, `aria-invalid`) and put the preview's one-line result in a `role="status"` region.
- **Size:** S.
- **Files:** `apps/web/src/components/packets/reference-search.tsx`, `apps/web/src/app/p/[practiceId]/cases/by-reference/page.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`, `apps/web/src/components/screening/upload-form.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/screening/upload-form.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 16 `co-001/ux-field-hints` (the packet reference search and the template sample); UX PR 84 `co-001/ux-screening-upload-page` (the screening file field).
- **Sources:** `a11y-practice-1-19`, `a11y-other-15`.
- **Verification:** confirmed
- **Notes:** The screening file part lands after #42 merges (`upload-form.tsx` is #42's); the reference search and template parts first. The reference search's layout is UX-184 (C-198); its hand-drawn Find button joins UX-108 (C-032)'s `FilterBar` button style. Words taken under the co-founder's ruling.

### UX-088 (C-041). Stacked small links in table cells sit 4 px apart or touching, below the 24 px target size

- **Severity:** should fix. Harm area: accessibility. Reach: 5 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.remittance.viewer.1280`, `p.remittance.viewer.390`, `p.compare.default.1280`, `p.remittance.plb.390`, `p.monthly.month.390`.
- **Routes:** `/p/[practiceId]/remittances/[remittanceId]`, `/p/[practiceId]/pricing-runs/compare`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/reports/monthly`, `/p/[practiceId]/reconciliation`.
- **Evidence:** A remittance's Links cell stacks 12 px links ('Reversed in a later remittance', 'Superseded by a corrected claim', '1 line') about 16 px tall, 4 px apart (`p/[practiceId]/remittances/[remittanceId]/page.tsx:181-202`, `text-xs`, `flex-col gap-1`), so 24 px circles on neighbours overlap and neither the size nor the spacing exception holds. Compare stacks 'First trace' and 'Second trace' with no gap at all (`components/pricing/diff.tsx:164-175`), on every line priced in both runs. 'Reverse this match', the way into a ledger reversal, is a 12 px summary (`reconciliation/page.tsx:35`). axe's target-size rule is tagged wcag22aa, outside the gate's tags (`apps/web/e2e/a11y.ts:12`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.2 2.5.8 Target Size (Minimum) (AA), adopted by combined audit #103
- **Fix:** Give stacked or adjacent table links and summaries a 24 px box: `inline-flex min-h-6 items-center` with `gap-2` between stacked links and `text-sm` in the Links cell, on the remittance claims, Compare's trace links and the 'Reverse this match' summary; make the monthly summary's single-digit count links cover their cell's padding. Run axe's `target-size` rule (UX-085 (C-029) adds `wcag22aa` to audit #103's gate).
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/reports/documents.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 33 `co-001/ux-focus-touch`.
- **Sources:** `a11y-practice-2-05`, `narrow-practice-2-14`.
- **Verification:** confirmed
- **Notes:** PR #51 changes the reconciliation page; whichever merges second keeps both. The comfortable 44 px phone targets are UX-161 (C-164) (polish).

### UX-089 (C-045). Form controls are 14 px, so iPhone Safari zooms the page on every field a person taps

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 6 roles.
- **Roles:** billing manager, practice administrator, organization administrator, operator, screening prospect, anyone signing in.
- **Screens:** `sign-in.default.390`, `request-audit.default.390`, `screening.default.390`, `p.correspondence.default.390`, `p.pricing-settings.default.390`, `p.roi.default.390`, `p.remittances.default.390`, `sign-in-mfa.default.390`.
- **Routes:** `every route with a form, below 640 px`.
- **Evidence:** The input is `text-sm` (14 px) at every width (`packages/ui/src/components/input.tsx:11`), as are the select and the textarea (`apps/web/src/components/field.tsx:75,106`) and the raw selects and controls on many pages (for example `components/uploads/uploader.tsx`, `components/reconciliation/template-mapper.tsx`, `p/[practiceId]/pricing-runs/page.tsx`, `cases/page.tsx:77`, `cases/[caseId]/page.tsx:208`). iOS Safari zooms into any focused field under 16 px and leaves the page zoomed, so after typing an email on `/sign-in` or `/request-audit` the person pinches back out. The viewport sets no maximum scale (`apps/web/src/app/layout.tsx:29`), which is right and must stay. Chromium captures cannot show the zoom; the cause is in the code, confirmed at 4d99df8.
- **Rule:** ADR 0056:49-50 sets 'tables and dense controls 14', written for the desktop and silent on phones: recommended. Never met with `maximum-scale=1`, which would fail WCAG 1.4.4 Resize Text
- **Fix:** Form controls take 16 px below the `sm` breakpoint and 14 px from `sm` up (`text-base sm:text-sm`): in `Input`, and in one shared control class in `packages/ui` used by `SelectField`, `TextAreaField`, the native date and month inputs and every raw `<select>` and `<textarea>` (which move onto it). Nothing changes at 1280 px. Add the phone exception to ADR 0056's type-scale sentence ('controls are 16 px below 640 px, so a phone does not zoom').
- **Size:** S.
- **Files:** `packages/ui/src/components/input.tsx`, `packages/ui/src/index.ts`, `apps/web/src/components/field.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 33 `co-001/ux-focus-touch`.
- **Sources:** `narrow-other-09`, `narrow-practice-2-10`.
- **Verification:** confirmed
- **Notes:** Settled: below `sm` (narrow-other-09) rather than `md`, because the zoom is iPhone Safari's and iPadOS Safari does not zoom in its desktop mode, so tablets keep the dense 14 px. Brand choice taken under the co-founder's ruling. Several of these pages are also in open PRs (PR #51: case and reconciliation pages); whichever merges second keeps both.

### UX-090 (C-071). Placeholder text is 3.3:1

- **Severity:** should fix. Harm area: accessibility. Reach: 4 routes, 3 roles.
- **Roles:** billing manager, practice administrator, packet approver.
- **Screens:** `p.claims.default.1280`, `p.coverage.default.1280`, `p.cases.default.1280`, `p.by-reference.default.1280`.
- **Routes:** `/p/[practiceId]/claims`, `/p/[practiceId]/coverage`, `/p/[practiceId]/cases`, `/p/[practiceId]/cases/by-reference`.
- **Evidence:** Tailwind v4's preflight colours `::placeholder` at 50% of the text colour, measured RGB(134,142,156) on white, 3.3:1, on '97110' (Claims code), '97110, 97530' (Coverage procedure codes) and 'SK6CS-K6CSK' (packet reference). Neither `apps/web/src/app/brand.css` nor `packages/ui/src/styles.css` sets a placeholder colour (searched at 4d99df8). These placeholders are the only place some formats are shown (`claims/page.tsx:76`, `coverage/page.tsx:379`, `components/packets/reference-search.tsx:9`), and they vanish on typing. axe's colour-contrast rule does not test placeholders.
- **Rule:** WCAG 2.1 1.4.3 Contrast (Minimum); `.claude/rules/brand.md:40` (text at least 4.5:1)
- **Fix:** In `apps/web/src/app/brand.css` (base layer) set `::placeholder { color: var(--pw-fg-muted); opacity: 1; }` (6.4:1 light, 8.4:1 dark). The format each placeholder carries moves into the field's hint (UX-077 (C-039)), so the placeholder holds only an example already stated there.
- **Size:** S.
- **Files:** `apps/web/src/app/brand.css`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 16 `co-001/ux-field-hints`.
- **Sources:** `a11y-practice-1-12`.
- **Verification:** confirmed
- **Notes:** The format-in-placeholder half of the member is UX-077 (C-039).

### UX-091 (C-073). Every PDF prints untagged: the payer's copy, reports and statements have no structure for a screen reader

- **Severity:** should fix. Harm area: accessibility. Reach: 4 routes, 3 roles.
- **Roles:** billing manager, packet approver, practice administrator.
- **Screens:** `p.packet-pdf.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet/[versionId]/pdf`, `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]/reports/documents/[documentId]`, `/p/[practiceId]/reports/roi/[statementId]`.
- **Evidence:** The worker prints with `page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true })` (`apps/worker/src/report/pdf.ts:29`): no `tagged` and no `outline` option, so every PDF has no structure tree, headings, table headers or bookmarks, though the HTML it prints already has `lang="en"` and real headings. `playwright-core` 1.56.1 (`apps/worker/package.json:53`) supports both options. The payer's copy has no HTML equivalent for its reader. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships applied to PDF (techniques PDF6, PDF9); combined audit #103 ('Report and packet PDFs print untagged'; best option: print every PDF tagged with an outline)
- **Fix:** `page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true })`, and the test audit #103 names: each printed PDF has a StructTreeRoot, a `/Lang` and TH cells in its tables, and its outline lists the document's headings.
- **Size:** S.
- **Files:** `apps/worker/src/report/pdf.ts`, `apps/worker/src/report/pdf.test.ts` (new).
- **Migration:** no.
- **#42:** no.
- **In flight:** audit #103, Lane A's PR 7: tagged PDFs
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `a11y-practice-2-18`.
- **Verification:** confirmed
- **Notes:** A report renderer, not the engine, ledger or content pipeline. Combined audit #103 places tagged PDFs in Lane A's PR 7, so it folds there rather than becoming a Lane B PR; Lane B should not change `pdf.ts` in parallel. Open PRs #49 and #51 change other files under `apps/worker/src/report`.

### UX-092 (C-019). A permission-refused page has no heading naming the screen and no link to the place its next step names

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.packet.error-forbidden.390`, `console.organizations.error-forbidden.1280`, `p.home.error-forbidden.1280`, `p.packet-review.error-forbidden.1280`, `settings.billing-org.error-forbidden.1280`, `p.access-log.error-forbidden.390`, `p.abstraction.error-forbidden.390`, `console.specialist-queue.error-forbidden.1280`.
- **Routes:** `every route's permission state (65 pages render Forbidden)`.
- **Evidence:** Under the shell there is only a bordered box 'Not available to your role / As Contract specialist, you cannot do this here (...)': no h1 or h2, so heading navigation finds nothing and only the tab title says which screen refused; the next step names a place ('open the case to see its state') with no link, and on a phone the only way on is Menu. Causes, confirmed at 4d99df8: `Forbidden` renders `AppShell` with `PermissionState` alone and takes no title or action (`apps/web/src/components/shell.tsx:357-364`); `PermissionState` is an Alert with `role="note"` and a div title, text props only (`packages/ui/src/states/permission-state.tsx:13-24`). 65 pages render `Forbidden`. axe's page-has-heading-one is best-practice, outside the WCAG tags `apps/web/e2e/a11y.ts:12` runs. The global error page has the same gap (`apps/web/src/app/error.tsx:13-24`).
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships and 2.4.6 Headings and Labels; `docs/product/PRD.md:260` (a permission state that explains what the role cannot do) and `:256` (every error shown with a next step)
- **Fix:** `Forbidden` takes a required `title` (the page's own name, the same words as its metadata title, for example 'Packet builder') and an optional `action` ({ href, label }), keeps its `section` so the rail marks where the person is, and renders the title as the page's `<h1>` above the card. `PermissionState` renders its title as an `<h2>` and an optional action link, as `EmptyState` does. Each page passes its nearest useful place: the packet 'Open the case', the review 'Back to Packets to attest', the access log 'Back to Settings', a practice page 'Go to Practice home'; where the next step is a person, link 'Help and support' with the screen named (`/support?from=<section>`). The global `error.tsx` gets an `<h1>` too. Add a forbidden state to the per-route axe run with `page-has-heading-one` enabled.
- **Size:** M.
- **Files:** `apps/web/src/components/shell.tsx`, `packages/ui/src/states/permission-state.tsx`, `packages/ui/src/states/states.test.tsx`, `apps/web/src/app/error.tsx`, `apps/web/src/app/**/page.tsx` (the 65 callers of Forbidden), `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 71 `co-001/ux-forbidden`.
- **Sources:** `a11y-other-13`, `a11y-practice-1-15`, `narrow-practice-1-16`, `narrow-practice-2-20`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges: `Forbidden` is in `shell.tsx`, and three of its callers are #42's pages. The permission words themselves (the role named twice, the raw permission, a next step staff cannot take) are UX-051 (C-020). A title derived from `section` was weighed and rejected: one section serves several screens (the packet builder and its review).

### UX-093 (C-023). The header's practice switcher, account menu and phone Menu stay open: Escape, a tap outside or leaving them does not close them, and they cover what is focused next

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `console.organizations.account-menu.1280`, `support.account-menu.1280`, `home.account-menu.1280`, `support.menu.390`, `console.organization.menu.390`, `home.menu.390`, `p.contracts.help.1280`.
- **Routes:** `every page in the app shell`.
- **Evidence:** All three are native `<details>` with no script (`apps/web/src/components/shell.tsx:55,83,322`), so none closes on Escape, on a click or tap elsewhere, or when focus leaves; the account menu and the phone Menu can be open at once. The open account panel (`w-72`, `z-40`, `shell.tsx:46,91`) sits exactly over 'Help with this screen' at the top right of main (`shell.tsx:335-336`): Tab past 'Sign out' runs through the rail and lands on that control, wholly under the still-open panel (`console.organizations.account-menu.1280`). At 390 px the Menu button looks the same open as closed, the panel has no backdrop (the page shows straight beneath it), and its height cap `max-h-[calc(100vh-3.5rem)]` (`shell.tsx:324`) runs under iOS Safari's toolbar. 'Help and support' is never marked current, because its rail link is hard-coded `active={false}` (`shell.tsx:291`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.2 2.4.11 Focus Not Obscured (Minimum) (AA, adopted by combined audit #103); WCAG 2.1 2.4.7 Focus Visible and 2.1.1 Keyboard; ADR 0056:46 (below md the rail folds into the header's Menu); silent on dismissal: recommended
- **Fix:** One small client `Disclosure` for the three header panels (a button with `aria-expanded` and `aria-controls`, not `role="menu"`): Escape closes it and returns focus to its button; a pointer press outside, or focus leaving the button and panel, closes it; opening one closes the others. The phone Menu's button reads 'Close menu' and looks pressed (`bg-bg-inset`, `aria-expanded`) while open, a backdrop under the panel closes it on tap, and the panel is capped at `100dvh` minus the header. Mark 'Help and support' current on `/support`. Without script the panels keep working as today's `<details>` fallback. Add to the keyboard helper: with each panel open, Tab onward and assert the focused element is not covered (`document.elementFromPoint` at its centre).
- **Size:** M.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/components/disclosure.tsx` (new), `apps/web/e2e/a11y.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 67 `co-001/ux-header-menus`.
- **Sources:** `a11y-other-03`, `a11y-practice-1-07`, `narrow-other-17`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges (`shell.tsx`). Words taken under the co-founder's ruling: 'Menu' / 'Close menu'. The sticky header covering focus is UX-080 (C-015) (one rule in `brand.css`, no #42 file); the switcher's name and truncation are UX-094 (C-024) and UX-021 (C-027), and all three header changes can share one PR after #42.

### UX-094 (C-024). The practice switcher and account menu are announced as 'Practice switcher' and 'Account menu', dropping the practice and email they show

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.home.default.1280`, `p.pricing-runs.default.1280`, `p.pricing-runs.viewer.1280`, `support.account-menu.1280`, `settings.users.default.1280`, `console.organizations.account-menu.1280`.
- **Routes:** `every page in the app shell`.
- **Evidence:** The switcher's summary carries `aria-label="Practice switcher"` (`apps/web/src/components/shell.tsx:56`), which replaces its visible text ('SYNTHETIC OTHER PRACTICE L…' or 'Choose a practice'), so a screen reader never hears which practice is open and a speech user who says the visible name gets no match. The account summary's `aria-label="Account menu"` (`shell.tsx:84`) replaces the visible email, and the email is only in `title`. The visible practice name is cut at 14rem with the full name nowhere in the control (`shell.tsx:57`): the LAYOUT and LEDGER practices both read 'SYNTHETIC OTHER PRACTICE L…'. axe's label-content-name-mismatch is experimental, outside the tags `apps/web/e2e/a11y.ts:12` runs. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 2.5.3 Label in Name (A) and 4.1.2 Name, Role, Value (A)
- **Fix:** Drop both `aria-label`s and let the visible text start the name: the practice's full name in the DOM (truncated only by CSS, never by slicing), followed by visually hidden ', switch practice'; the email followed by visually hidden ', account and sign out', with the email kept as visually hidden text below md where only the initial shows. In the switcher's list, mark the current practice with the word 'Current' as well as `aria-current`, not weight alone. Remove the `title` attributes once the name is reachable. Turn on axe's label-content-name-mismatch rule in `a11y.ts` for these two controls.
- **Size:** S.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/e2e/a11y.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 67 `co-001/ux-header-menus`.
- **Sources:** `a11y-other-04`, `a11y-practice-1-06`, `a11y-practice-2-07`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges (`shell.tsx`). Words taken under the co-founder's ruling: ', switch practice', ', account and sign out', 'Current'. The phone truncation to nine characters is UX-021 (C-027); Escape and closing are UX-093 (C-023).

### UX-095 (C-040). Heading levels do not follow the page: every card title and empty state is an h2, and visual sub-headings are plain text

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.line.default.1280`, `p.reports.default.1280`, `p.packet-review.default.1280`, `p.coverage.default.1280`, `p.pricing-run.default.1280`, `p.reconciliation.default.1280`, `p.contract-version.default.1280`, `p.abstraction-ledger.default.1280`.
- **Routes:** `/p/[practiceId]/**`.
- **Evidence:** `CardTitle` is always an `<h2>` (`packages/ui/src/components/card.tsx:19-21`) and `EmptyState`'s title always an `<h2>` (`packages/ui/src/states/empty-state.tsx:33`), as is the uploader's drop-zone heading (`components/uploads/uploader.tsx:313`), so a state inside a titled card becomes its sibling: Reports reads h2 'Audit reports' > h2 'Generate an audit report' > h2 'No audit report yet'; 'Notes' then 'No notes yet'; 'Rate records' then 'Record 1: 97110…'. Text that looks like a heading is not one: each line-trace step title is a `<p className="font-medium">` (`lines/[lineId]/page.tsx:143`) on a 4,952 px page; the review's 'Evidence, with its SHA-256 and gaps' and 'Interest, line by line' (`cases/[caseId]/packet/[versionId]/review/page.tsx:233,237`); Reconciliation's column titles are styled `<p>` (`reconciliation/page.tsx:92,338,470`); the ROI statements table has no heading (`reports/roi/page.tsx:59-63`); the case ledger's h1 'Case ledger' names no case (`reconciliation/page.tsx:223`). axe's heading-order is best-practice, outside the gate's tags (`apps/web/e2e/a11y.ts:12`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships (A) and 2.4.6 Headings and Labels (AA)
- **Fix:** Give `CardTitle`, `EmptyState` and the uploader's heading a `level` prop (2 to 4, default 2), rendering that heading element with the same look, and pass 3 wherever they sit under a section heading and 4 inside a card. A context was weighed and rejected: these are server components, and React context is not available there. Mark as headings at the right level: the trace step titles, the review's sub-sections and a 'Calculation per line' heading over its second table, the packet's sources line, Reconciliation's column titles, and an h2 'Statements' over the ROI list; name the case in the case ledger's h1 ('Case ledger: SYNTHETIC PAYER Q, case 4'). Add a check to `a11y.ts` that heading levels never skip and a card's empty state sits below its card's title (enable axe's `heading-order`).
- **Size:** M.
- **Files:** `packages/ui/src/components/card.tsx`, `packages/ui/src/states/empty-state.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/e2e/a11y.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 24 `co-001/ux-headings-regions`.
- **Sources:** `a11y-practice-1-14`, `a11y-practice-2-12`.
- **Verification:** confirmed
- **Notes:** Settled: a `level` prop (a11y-practice-1-14) over a heading-level context (a11y-practice-2-12), because context does not work in server components. The forbidden page's missing h1 is UX-092 (C-019); region names that differ from visible titles are UX-096 (C-070). The line trace and packet pages are audit #38's (in flight): mark its new step titles as headings in that PR rather than twice. PR #51 changes the reconciliation page; whichever merges second keeps both.

### UX-096 (C-070). Cards are region landmarks named differently from their visible titles, and every empty state adds another region

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.home.default.1280`, `p.packet.default.1280`, `p.packet-review.default.1280`, `p.abstraction-version.default.1280`, `p.coverage.default.1280`, `p.contract-version.default.1280`, `p.packet-reviews.default.1280`, `p.reconciliation.default.1280`.
- **Routes:** `/p/[practiceId]/**`.
- **Evidence:** 117 `<Card role="region" aria-label>` sit in `apps/web/src`, and many labels differ from the card's visible title: home 'Dashboard' titled 'Where things stand' (`p/[practiceId]/page.tsx:279`); the packet's 'Line table' / 'Line schedule', 'Citation' / 'Contract citation', 'Export history' / 'Versions and export history' (`cases/[caseId]/packet/page.tsx:248-537`); 'Exports waiting' / 'Exports waiting for an attestation' (`packet-reviews/page.tsx:91`); 'Runs it would change' / 'Your runs' (`releases/page.tsx:62-64`); a 'Cited page' section nested in a 'Cited page' region titled 'The page' (`components/contracts/review.tsx:188`, `components/contracts/display.tsx:65`). Every `EmptyState` is one more named region (`packages/ui/src/states/empty-state.tsx:27-29`), so the packet builder exposes about 13 region landmarks. Confirmed at 4d99df8.
- **Rule:** ADR 0056:64 ('A region's accessible name carries the same words as its visible label'); WCAG 2.1 1.3.1 and 2.4.6; 2.5.3 Label in Name
- **Fix:** Name each region by its own heading: a `Card` with `role="region"` takes `aria-labelledby` pointing at its `CardTitle`'s id (a region card without a title is a type error), so the two can never drift. Drop `role="region"` from cards nobody navigates to by landmark (keep it on the page's main working areas) and from `EmptyState` (its heading stays), and remove the nested 'Cited page' section. Add a render test that a region's name equals its visible title.
- **Size:** M.
- **Files:** `packages/ui/src/components/card.tsx`, `packages/ui/src/states/empty-state.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/app/p/[practiceId]/packet-reviews/page.tsx`, `apps/web/src/app/p/[practiceId]/releases/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/components/contracts/display.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 24 `co-001/ux-headings-regions`.
- **Sources:** `a11y-practice-1-13`.
- **Verification:** corrected: 117 region cards in `apps/web/src` at 4d99df8 (the member counted 101 under two folders); the releases card is at `releases/page.tsx:62-64` (the member cited :38); other cited lines confirmed
- **Notes:** One sweep with UX-095 (C-040)'s heading levels (same components). The packet pages are audit #38's and audit #48's screens (in flight): coordinate. Open PRs #49 and #50 change the releases page; PR #49 the coverage page.

### UX-097 (C-072). The hidden file input is a tab stop with no visible focus beside 'Choose files'

- **Severity:** should fix. Harm area: accessibility. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.contracts.default.1280`, `p.contracts.layout.1280`, `p.uploads.default.1280`.
- **Routes:** `/p/[practiceId]/contracts`, `/p/[practiceId]/uploads`, `/p/[practiceId]/reconciliation`.
- **Evidence:** The uploader's `<input type="file" className="sr-only" aria-label="Choose files to upload">` (`apps/web/src/components/uploads/uploader.tsx:376-387`) has no `tabIndex={-1}`, so a keyboard user tabs onto a clipped 1 px control whose focus cannot be seen, then onto the visible 'Choose files' button that opens the same picker (`:388`); a screen reader announces two controls for one action. The same uploader serves Contracts, Uploads and Reconciliation. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 2.4.7 Focus Visible and 2.4.3 Focus Order
- **Fix:** Give the file input `tabIndex={-1}` and `aria-hidden="true"`; the 'Choose files' button stays the one control and opens the picker as now (and the drop zone keeps working).
- **Size:** S.
- **Files:** `apps/web/src/components/uploads/uploader.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 47 `co-001/ux-uploader`.
- **Sources:** `a11y-practice-1-20`.
- **Verification:** confirmed
- **Notes:** Lands with UX-049 (C-037) (same component).

### UX-098 (C-074). The six-digit code refuses a pasted code with a space and gives no format hint

- **Severity:** should fix. Harm area: accessibility. Reach: 2 routes, 1 roles.
- **Roles:** anyone signing in.
- **Screens:** `sign-in-mfa.default.1280`, `sign-in-mfa.error.1280`, `sign-in-enroll.default.1280`, `sign-in-enroll.error.1280`.
- **Routes:** `/sign-in/mfa`, `/sign-in/enroll`.
- **Evidence:** Both code fields are `<Field … inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />` with no hint (`apps/web/src/app/sign-in/mfa/page.tsx:24`, `sign-in/enroll/page.tsx:34`). Authenticator apps show and copy the code as '123 456'; pasted that way it fails the browser's pattern with the generic 'Please match the requested format.', and the server's `sixDigitCode` only trims the ends (`apps/web/src/lib/routes/schemas.ts:23`), so it would be refused there too. Confirmed at 4d99df8.
- **Rule:** WCAG 2.2 3.3.8 Accessible Authentication (Minimum) (AA, adopted by combined audit #103: paste must work so the code need not be transcribed); WCAG 2.1 3.3.2 and 3.3.3
- **Fix:** Accept the code however it is pasted: drop the `pattern` attribute; strip spaces and hyphens in the field's input handler and in `sixDigitCode` before the check (`z.string().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{6}$/, …))`); allow `maxLength={9}` for the spaced form; add the hint 'Six digits. Spaces are fine.' through `Field`'s `hint`. Keep `autoComplete="one-time-code"` and `inputMode="numeric"`. Add a sign-in e2e step that pastes '123 456'.
- **Size:** S.
- **Files:** `apps/web/src/app/sign-in/mfa/page.tsx`, `apps/web/src/app/sign-in/enroll/page.tsx`, `apps/web/src/lib/routes/schemas.ts`, `apps/web/e2e/sign-in.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 64 `co-001/ux-sign-in-words`.
- **Sources:** `a11y-other-05`.
- **Verification:** confirmed
- **Notes:** Words taken under the co-founder's ruling. The code step's refusal words are UX-054 (C-030)'s.

### UX-099 (C-044). The console's members table is broken by flex cells: 'End membership' sits under 'Account' and the 'Actions' column is empty

- **Severity:** should fix. Harm area: accessibility. Reach: 1 routes, 1 roles.
- **Roles:** operator.
- **Screens:** `console.organization.default.1280`, `console.organization.default.390`, `console.organization.firm.1280`, `console.organization.suspended.1280`, `console.organization.created.390`.
- **Routes:** `/console/organizations/[organizationId]`.
- **Evidence:** In Members each 'End membership' button is drawn under the 'active' badge in the Account column and the 'Actions' header has nothing under it, at 1280 and 390 px; the empty column also widens the table. Cause, confirmed at 4d99df8: both cells are `<td className="flex flex-wrap …">` (`apps/web/src/app/console/organizations/[organizationId]/page.tsx:147,153`); a `<td>` with `display:flex` leaves table-cell layout, the browser wraps the two adjacent boxes in one anonymous cell, and WebKit may drop the cell's role, so a screen reader can report the button under the wrong header. These are the only two flex cells in `apps/web/src`.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships (A) and 1.3.2 Meaningful Sequence (A)
- **Fix:** Keep both cells as table cells and put the flex layout on a wrapper inside: `<td className="py-1 pr-3"><div className="flex flex-wrap gap-1">…</div></td>` (and `gap-2` for the actions), as the users page does. Add a `no-restricted-syntax` rule in `eslint.config.js` that refuses a `td` or `th` whose `className` contains `flex` or `grid`. At phone width this table then stacks with the other record lists (UX-078 (C-034)).
- **Size:** S.
- **Files:** `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `eslint.config.js`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 57 `co-001/ux-console-records`.
- **Sources:** `a11y-other-11`, `narrow-other-11`.
- **Verification:** confirmed
- **Notes:** axe's table rules do not catch a layout change made by CSS. The console organization page's wider redesign is UX-203 (C-199).

### UX-100 (C-017). Stored codes are printed as they are stored: statuses ('new', 'active', 'open', 'active, no MFA'), access-log and support-grant names ('read (case_review)', 'service_line', 'ownership'), release record types ('pfs_rvu', 'carc') and evidence-gap kinds ('pursuit_settings')

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 11 routes, 5 roles.
- **Roles:** practice administrator, organization administrator, billing manager, platform operator, contract specialist.
- **Screens:** `p.access-log.default.1280`, `settings.users.default.1280`, `settings.billing-org.default.1280`, `p.home.default.1280`, `p.releases.default.1280`, `p.report.default.1280`, `p.support-access.default.1280`, `console.tickets.default.1280`.
- **Routes:** `/p/[practiceId]/settings/access-log`, `/p/[practiceId]/support-access/[supportGrantId]`, `/settings/organizations/[organizationId]/users`, `/settings/billing/[organizationId]`, `/p/[practiceId]`, `/p/[practiceId]/releases`, `/p/[practiceId]/reports/[reportId]`, `/console/prospects`, `/console/tickets`, `/console/organizations/[organizationId]`, `/console/status`.
- **Evidence:** Customer pages: access log prints via, action, purpose and object type as stored ('ownership', 'read (case_review)', 'service_line') (`apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx:62-75`), while the home words `ownership` as 'your practice group' (`apps/web/src/app/p/[practiceId]/page.tsx:28-33`); the support-grant record likewise (`support-access/[supportGrantId]/page.tsx:58-60`); 'Status active' on the practice record (`p/[practiceId]/page.tsx:424`); the plan's Stripe status raw (`apps/web/src/app/settings/billing/[organizationId]/page.tsx:108`, so past_due would show as is); 'active, no MFA' (`settings/organizations/[organizationId]/users/page.tsx:69`); release record types 'pfs_rvu', 'ncci_mue', 'carc' and 'The release's notes (`RELEASE.md`)' (`apps/web/src/components/releases/note.tsx:43`, :65, :93); evidence gap 'pursuit_settings' on screen while the PDF says 'pursuit settings' (`apps/web/src/components/reports/display.tsx:315` vs `apps/worker/src/report/html.ts:215`). Console: 'new' (`console/prospects/page.tsx:77`), filters 'open answered closed all' and 'screen: remittances' (`console/tickets/page.tsx:38-40`, :69, :77), 'active' (`console/organizations/page.tsx:70`), 'group · active' (`console/organizations/[organizationId]/page.tsx:50`, :148), impact 'minor' and raw component keys (`console/status/page.tsx:92`, :114). `labelOf()` exists for this (`apps/web/src/lib/copy/words.ts:27`).
- **Rule:** `apps/web/src/lib/copy/words.ts:1-5`, :22-26 (a code is shown as a label in sentence case, its initialisms in capitals); `docs/product/PRD.md:256` and PRD 6 (the access report answers 'who read claim X' for a practice administrator)
- **Fix:** One label module, `apps/web/src/lib/copy/labels.ts`, with a sentence-case map per stored enum and `labelOf()` as the fallback for anything unmapped (CARC and RARC added to `INITIALISMS`), used by both the screen and the PDF renderer. Words: 'ownership' -> 'Your practice group'; 'grant' -> 'A grant you approved'; 'support' -> 'Support grant'; 'read (case_review)' -> 'Read, reviewing a case'; 'read (packet_build)' -> 'Read, building a packet'; 'service_line' -> 'Claim line'; 'source_document' -> 'Uploaded document'; 'active' -> 'Active'; 'active, no MFA' -> 'Active, two-step verification not set up'; 'past_due' -> 'Past due'; 'pfs_rvu' -> 'Medicare fee schedule RVUs'; 'ncci_ptp' -> 'NCCI PTP code pairs'; 'carc' -> 'Claim adjustment reason codes (CARC)'; 'pursuit_settings' -> 'Pursuit cost not set'; 'The release's notes (`RELEASE.md`)' -> 'The release's notes'; console 'open answered closed all' -> 'Open, Answered, Closed, All'; 'group · active' -> 'Practice group · Active'; 'minor' -> 'Minor impact'. A unit test fails on any enum value shown without a label.
- **Size:** M.
- **Files:** `apps/web/src/lib/copy/labels.ts` (new), `apps/web/src/lib/copy/words.ts`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/components/releases/note.tsx`, `apps/web/src/components/reports/display.tsx`, `apps/worker/src/report/html.ts`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/organizations/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/console/status/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 19 `co-001/ux-labels` (outside #42's files); UX PR 75 `co-001/ux-users-page` (the users page); UX PR 76 `co-001/ux-support-access` (the support-access page); UX PR 77 `co-001/ux-access-log` (the access-log page).
- **Sources:** `words-other-22`, `words-practice-03`, `words-practice-24`, `words-practice-25`, `words-practice-26`.
- **Verification:** corrected: the plan's status badge is `settings/billing/[organizationId]/page.tsx:108` at 4d99df8 (words-other-22 cites :83 at 6ddd587; PR #47 moved it and left it raw); the rest confirmed
- **Notes:** #42 files: the support-access page and the users page. The label module and every other page land now; those two after #42 merges. Open PR #51 changes `components/reports/display.tsx` and `apps/worker/src/report/html.ts`, and PR #50 the releases page: the one merged second keeps both. 'two-step verification' is the one name for MFA (UX-166 (C-170)). Words chosen under the co-founder's ruling (above).

### UX-101 (C-053). Build references in text people read: '(milestone 12)', '(golden question Q34)', 'verified to level L2', '(CON-02)', 'DEADLINE_UNVERIFIED', 'for now', '(PRD 16)', 'recorded here once the database accepts this kind'

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 8 routes, 5 roles.
- **Roles:** practice administrator, billing manager, contract specialist, packet approver, platform operator.
- **Screens:** `p.agreements.empty.1280`, `p.data.default.1280`, `p.abstraction-regulations.default.1280`, `p.packet.error-export-blocked.1280`, `p.abstraction-version.default.1280`, `p.contract-version.default.1280`, `console.compliance.default.1280`, `p.abstraction-version.error-amend.1280`.
- **Routes:** `/p/[practiceId]/settings/agreements`, `/p/[practiceId]/settings/data`, `/p/[practiceId]/abstraction/regulations`, `/p/[practiceId]/abstraction/versions/[versionId]`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/cases`, `/p/[practiceId]/contracts/versions/[versionId]`, `/console/compliance`.
- **Evidence:** 'A billing firm reaches this practice only through a grant you approve (milestone 12).' (`apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx:90`); 'The export and deletion workflows arrive in a later release (milestone 12).' (`settings/data/page.tsx:31`); '... a product-wide question (golden question Q34) ...' and 'not verified to level L2' (`apps/web/src/lib/packets/view.ts:108`, :127, :129; `cases/[caseId]/packet/page.tsx:283-284`); '(..., DEADLINE_UNVERIFIED)' (`cases/page.tsx:102`); '(CON-02)', '(CON-03)' (`abstraction/versions/[versionId]/page.tsx:414`, :437) and '(CON-04)' (`apps/web/src/components/contracts/display.tsx:111`); '... only as calendar days after the payment date for now' (`apps/web/src/lib/contracts/display.ts:116`); console: '... named (PRD 16).' (`apps/web/src/app/console/compliance/page.tsx:143`) and '(recorded here once the database accepts this kind)' (`packages/compliance/src/controls.ts:312`). The copy lint has no rule for these.
- **Rule:** `docs/brand/BRAND.md:23` (serious, exact); the brief's plain-language rule (no internal codes in what a person reads); CO-11 (honest claims)
- **Fix:** Remove every build reference and say what the person can rely on: 'No billing firm can reach this practice. A firm reaches it only through a grant you approve.' (no 'here': approving a firm's grant is milestone 12's firm flow, not built, `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx:18`); data card title 'Export and deletion, by request' with 'Until these screens are built, PaidWhole's security official carries out an export or a deletion by hand, under the same policy.'; the Q34 notice shortened to 'No packet of a Medicare Advantage non-contracted line is exported yet: PaidWhole is confirming which dispute route such lines take. Until then, dispute them through the plan's own payment dispute policy, outside the product.'; 'verified to level L2' -> 'verified against Medicare's published rule'; the codes (CON-02, CON-03, CON-04, DEADLINE_UNVERIFIED, PRD 16) deleted; 'for now' deleted; '(recorded here once the database accepts this kind)' -> '(this screen cannot record it yet)'. Add a `tools/brand-copy` rule that fails on milestone N, golden question, Qnn, AAA-nn, Ln and CAPS_WITH_UNDERSCORES in read text, with the usual exemption comment.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/data/page.tsx`, `apps/web/src/lib/packets/view.ts`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`, `apps/web/src/components/contracts/display.tsx`, `apps/web/src/lib/contracts/display.ts`, `apps/web/src/app/console/compliance/page.tsx`, `packages/compliance/src/controls.ts`, `tools/brand-copy/scan.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 31 `co-001/ux-copy-lint`.
- **Sources:** `words-practice-12`, `words-other-45`.
- **Verification:** confirmed
- **Notes:** The data page's retention and certificate wording is unchanged (only the milestone reference goes), so no legal text moves. PR #52 (audit #38) changes the packet page: the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-102 (C-066). Leaving a practice for an account, organization, support or terms page drops it: the rail loses its screens and the switcher reads 'Choose a practice'

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 7 routes, 4 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator.
- **Screens:** `support.default.1280`, `support.help.1280`, `account.devices.default.1280`, `account.notifications.saved.1280`, `settings.billing-org.default.1280`, `settings.billing.default.1280`.
- **Routes:** `/support`, `/account/devices`, `/account/notifications`, `/settings/billing`, `/settings/billing/[organizationId]`, `/settings/organizations/[organizationId]/users`, `/terms`.
- **Evidence:** Every non-practice page renders the shell with `currentPracticeId` null: `run()` passes `running.practiceId`, which self, organization and platform routes leave null (`apps/web/src/lib/http/invoke.ts:220-227,265`), so `ShellNav` omits the whole Practice nav (`apps/web/src/components/shell.tsx:169`) and the switcher reads 'Choose a practice' (`shell.tsx:57`). A billing manager who opens 'Help with this screen' > 'Ask support about this screen' on Remittances lands on `/support?from=remittances` with four account links and no way back but the switcher. The practice administrator reaches Users and roles from the practice's Settings and arrives with no Settings or Practice nav and nothing marked current (section 'users' has no rail link; `settings/organizations/[organizationId]/users/page.tsx:35`). `/support` and `/terms` use section 'home' (`support/page.tsx:31`, `terms/page.tsx:27`). Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:260` (a left rail with the practice switcher at the top; one practice at a time) and `:256` (no screen depends on client-side state a refresh loses, so the fix is server-side)
- **Fix:** Keep the practice the person came from on every non-practice page. On a GET of a `/p/<id>` page, `apps/web/src/proxy.ts` (Next 16's middleware, `:23`) sets an HttpOnly, Secure, SameSite=Lax cookie holding that opaque practice ID (a server component cannot set a cookie while it renders; the proxy already sets the attribution cookie, authorizes nothing and touches no database, and its comment is updated to name the second cookie); `shellFor` reads it for self, organization and platform routes and uses it as the current practice only if the actor still reaches it (`practiceDirectory` already lists those), so the rail keeps the practice's screens, the switcher names the practice and a refresh keeps both; a revoked grant falls back to 'Choose a practice'. Give `/support` its own section so 'Help and support' is marked current, and have the ticket form name the screen it is about with a link back ('About: Remittances'). Users and roles' own rail place is UX-120 (C-067).
- **Size:** M.
- **Files:** `apps/web/src/proxy.ts`, `apps/web/src/lib/http/invoke.ts`, `apps/web/src/lib/http/next.ts`, `apps/web/src/components/shell.tsx`, `apps/web/src/app/support/page.tsx`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 69 `co-001/ux-shell-context`.
- **Sources:** `flows-other-04`.
- **Verification:** confirmed
- **Notes:** The cookie holds an opaque ID only (no PHI, per `CLAUDE.md`'s never-list) and access is re-checked on every request. SameSite=Lax rather than the member's Strict, so a link from an email still opens with the practice kept; it grants nothing either way. Lands after #42 merges (`shell.tsx`, the users page).

### UX-103 (C-033). Empty states name a next step on another screen without linking to it, or define a term instead of giving the step

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 8 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.claims.empty.390`, `p.anomalies.empty.390`, `p.remittances.empty.390`, `p.pricing-runs.empty.390`, `p.reconciliation.empty.390`, `p.cases.empty.1280`, `p.reports.empty.1280`.
- **Routes:** `/p/[practiceId]/claims`, `/p/[practiceId]/anomalies`, `/p/[practiceId]/remittances`, `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/cases`, `/p/[practiceId]/reports`, `/p/[practiceId]/contracts`.
- **Evidence:** 'No claims loaded yet. Upload 835 files on the Uploads screen…' (`p/[practiceId]/claims/page.tsx:126-130`), 'No anomaly. Triage a complete pricing run from the Cases screen…' (`anomalies/page.tsx:158`), 'Upload your first 835 files on the Uploads screen' (`remittances/page.tsx:62-67`) and 'Map every plan with lines, then create a run…' (`pricing-runs/page.tsx:143`) link nowhere, though `EmptyState` takes an action (`packages/ui/src/states/empty-state.tsx:11,35`) and the home and Mapping pass one for the same step; on a phone the person must open Menu and search fourteen items. Claims and Remittances also show live filters with nothing to filter. An empty Reconciliation stacks six $0.00 tiles (about 1,100 px at 390) and the uploader above 'Map the posting template', though nothing reads an export until a template exists (`reconciliation/page.tsx:234-275`). Cases and Reports say 'No pricing run in effect yet: a complete run, or a re-run once it is accepted.' (`cases/page.tsx:70`, `reports/page.tsx:91`; Contracts `:131`), which defines a term and gives no step; the home links Pricing runs for the same state. Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:260` (every screen has an empty state that says what to do next) and `:256`; `packages/ui/src/states/empty-state.tsx:8-11`
- **Fix:** Give each empty state its action, shown only to roles that can take it (others get the who-can sentence): Claims and Remittances 'Go to Uploads'; Anomalies 'Go to Cases'; Pricing runs 'Go to Payer and plan mapping'. Hide the Claims and Remittances filters and 'Find the claim' until something has loaded. On an empty Reconciliation, replace the six tiles with one line, 'No ledger entry yet.', and order the page template first, then the uploader. Words (taken under the co-founder's ruling): replace the 'in effect' sentence with 'No pricing run has priced this practice yet. Create one on Pricing runs; once it completes, you can triage it here.' (Reports: '…; once it completes, you can generate its audit report here.'), 'Pricing runs' a link, as on the home.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 26 `co-001/ux-empty-states`.
- **Sources:** `narrow-practice-1-19`, `narrow-practice-2-07`, `words-practice-55`.
- **Verification:** confirmed
- **Notes:** From narrow-practice-2-07: the filtered run's 'Show all lines' is UX-108 (C-032); the checklist's file links before the files exist are UX-196 (C-186); the settings overview for a billing manager is UX-177 (C-140). Collapsing the empty ledger's tiles changes only what an empty page shows, no figure or engine. Open PR #51 changes `reconciliation/page.tsx`; whichever merges second keeps both, or land after it.

### UX-104 (C-057). Figure tiles are drawn five ways: the audit report's headline has link-blue values and uppercase labels, and the specialist queue's counts are headings whose labels are plain text (the heading list reads '2, 0, 0, 0')

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 6 routes, 4 roles.
- **Roles:** billing manager, practice administrator, contract specialist, screening prospect.
- **Screens:** `p.report.default.1280`, `p.home.default.1280`, `console.specialist-queue.default.1280`, `screening-result.default.1280`, `p.reconciliation.default.1280-dark`, `p.compare.default.1280-dark`, `p.report.default.1280-dark`.
- **Routes:** `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]`, `/console/specialist-queue`, `/screening/results/[resultId]`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/pricing-runs/compare`.
- **Evidence:** The practice home follows the brand (label Slate 12 px, value medium, `apps/web/src/app/p/[practiceId]/page.tsx:21-23`). The audit report's headline does not: uppercase tracked semibold labels and `text-2xl font-semibold` values inside an `<a>` with no colour (`apps/web/src/components/reports/display.tsx:82-84`), so `a { color: var(--pw-link) }` (`apps/web/src/app/brand.css:27`) paints '$90.00' link blue. Others: the screening's `Stat` (`components/screening/result-summary.tsx:106-112`, a `<dl>` but a semibold `text-lg` value); the specialist queue's label in `CardDescription` over the figure as `CardTitle`, an `<h2>` (`apps/web/src/app/console/specialist-queue/page.tsx:38-62`), so headings read '2', '0', '0', '0'; reconciliation totals at `text-lg` (`components/reconciliation/display.tsx:89-104`); uppercase labels on Compare (`pricing-runs/compare/page.tsx:31`).
- **Rule:** `docs/brand/BRAND.md:125-126` and ADR 0056 (tiles: label Slate 12 px, value Plex Mono 500, note Slate); `BRAND.md:94` (totals at 500); WCAG 2.1 SC 2.4.6 and 1.3.1
- **Fix:** One `StatTile` beside the brand components, rendered as a `<dl>` group (label `<dt>`, value `<dd>`): label Slate 12 px weight 500 in sentence case; value Plex Mono 500 with tabular figures in the foreground colour at one size; note Slate 12 px; a linked tile keeps the foreground colour with a hover surface, as the home's does. Replace all five patterns with it (the specialist queue gets an `sr-only` h2 'Work waiting' over the group). Extend `apps/web/e2e/brand.spec.ts:347` to check the report headline's value colour and weight, as it checks the dashboard's.
- **Size:** M.
- **Files:** `apps/web/src/components/brand/stat-tile.tsx` (new), `apps/web/src/components/reports/display.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/e2e/brand.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 18 `co-001/ux-stat-tile`.
- **Sources:** `brand-08`, `a11y-other-17`.
- **Verification:** confirmed
- **Notes:** A `<dl>` StatTile closes both members' points at once. Brand choice under the co-founder's ruling: sentence-case labels (`BRAND.md` section 7 and the home have them; uppercase is not in the type table). Open PR #51 changes `components/reports/display.tsx`, `components/reconciliation/display.tsx`, the home and reconciliation pages: land after it.

### UX-105 (C-099). Plans are named by their raw remittance key ('CE:SYNPLAN-FIX-ONE') on screens, while the payer's copy already words them ('plan identifier SYNPLAN-FIX-ONE')

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 7 routes, 3 roles.
- **Roles:** billing manager, practice administrator, packet approver.
- **Screens:** `p.case.default.1280`, `p.cases.default.1280`, `p.packet.default.1280`, `p.contracts.default.1280`, `p.anomalies.default.1280`, `p.plan.default.1280`, `p.pricing-run.default.1280`, `p.packet-pdf.default.1280`.
- **Routes:** `/p/[practiceId]/cases`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/contracts`, `/p/[practiceId]/anomalies`, `/p/[practiceId]/mapping/[planId]`, `/p/[practiceId]/pricing-runs/[runId]`.
- **Evidence:** Headings and tables read 'SYNTHETIC PAYER Q, CE:SYNPLAN-FIX-ONE'; 'CE:' is the 835's REF qualifier, and a plan known only by its claim filing indicator shows as 'CLP06:12'. Causes: `coalesce(pl.name, pl.plan_key) AS plan` (`apps/web/src/lib/triage/queries.ts:149`, :366) and `planName ?? planKey` on the mapping, coverage, contract, regulations and line pages. The packet PDF for the same case prints 'plan identifier SYNPLAN-FIX-ONE' through `planName()`/`planText()` (`packages/packets/src/payer.ts:109`, :131).
- **Rule:** No written rule; recommended (the brief's goal: one product, and its words lens: plain language; one name for one thing across screens and the payer's copy)
- **Fix:** Name every plan on screen with the payer's-copy helper (`planName()` is pure; import it from `@tp/packets`): 'SYNTHETIC PAYER Q, CE:SYNPLAN-FIX-ONE' -> 'SYNTHETIC PAYER Q, plan SYNPLAN-FIX-ONE'; a filing-indicator plan 'CLP06:12' -> 'plan type Preferred Provider Organization (PPO)'. Keep the raw key only on the plan's mapping page, labelled 'Remittance key CE:SYNPLAN-FIX-ONE' for support. The audit report's tables take the same helper.
- **Size:** M.
- **Files:** `apps/web/src/lib/triage/queries.ts`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/regulations/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `packages/packets/src/payer.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 40 `co-001/ux-record-names`.
- **Sources:** `words-practice-47`.
- **Verification:** confirmed
- **Notes:** The PDF wording is the reference and is unchanged. PR #49 changes Coverage and PR #52 the line page: the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-106 (C-105). State badges come in three looks (filled, outline, borderless) and two radii, so the same kind of state looks different from screen to screen

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 8 routes, 2 roles.
- **Roles:** all signed-in roles, public status page reader.
- **Screens:** `status.default.1280`, `p.report.default.1280`, `console.organizations.default.1280`, `p.packet.default.1280`, `p.settings.default.1280-dark`, `account.devices.default.1280-dark`, `console.billing.default.1280-dark`, `console.status.default.1280`.
- **Routes:** `/status`, `/p/[practiceId]/reports/[reportId]`, `/console/organizations`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/settings`, `/account/devices`, `/console/support`, `/console/billing`.
- **Evidence:** ADR 0056 gives a system state one look, Ink text on the inset tint with its rule (Badge `default`, `packages/ui/src/components/badge.tsx:13`). In use: 'Operational' on the public status page is outline (`apps/web/src/app/status/page.tsx:40`), as are 'Done' (`settings/page.tsx:56`) and 'Ended' grants, while 'Open' grants are filled (`apps/web/src/app/p/[practiceId]/page.tsx:480`; `console/support/page.tsx:85`); 'This device' is borderless `secondary` (`account/devices/page.tsx:37`). Badge is `rounded-md` (`badge.tsx:7`) while StatusChip has the same neutral tone at `rounded-sm` (`apps/web/src/components/status.tsx:19`, :25), so on the packet 'Current' and 'Deadline verified' sit side by side in two shapes. Across 85 Badge uses the variant is chosen many ways.
- **Rule:** ADR 0056 (`docs/adr/0056-...md:89-90`: a system state is a neutral badge); `apps/web/src/app/brand.css:43-49` (status pills: radius-sm, 12 px, 500)
- **Fix:** One chip for every state: `StatusChip` (`apps/web/src/components/status.tsx`, moved into `packages/ui`) with the tones neutral, whole, short, unpriced and danger, radius-sm, 12 px, weight 500. Replace Badge wherever it shows a state; keep Badge `outline` only for tags that are not states ('admin', 'Proposed by the model', an organization's kind). Add a test that fails on Badge `secondary` or `outline` beside a state word.
- **Size:** M.
- **Files:** `packages/ui/src/components/badge.tsx`, `apps/web/src/components/status.tsx`, `apps/web/src/app/status/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/app/account/devices/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/console/support/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 21 `co-001/ux-status-chip` (outside #42's files); UX PR 74 `co-001/ux-console-support-page` (the console support page).
- **Sources:** `brand-07`.
- **Verification:** corrected: the status page's badge is at `status/page.tsx:40` (brand-07 cites :39); the rest confirmed
- **Notes:** Brand choice under the co-founder's ruling: one chip at radius-sm (4 px), as `brand.css` already sets for `.pw-status-*`. `console/support/page.tsx` is a #42 file: that page after #42 merges, the rest now. Lands with UX-018 (C-104).

### UX-107 (C-130). Read-only roles get the doer's card titles and instructions ('Create a run', 'Set the contact', 'queued when you save', 'Check the ZIP code'), then are told at the bottom that someone else does it

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 6 routes, 3 roles.
- **Roles:** viewer, billing manager, practice administrator.
- **Screens:** `p.pricing-runs.viewer.1280`, `p.correspondence.read-only.1280`, `p.proof-level.read-only.1280`, `p.pricing-settings.viewer.1280`, `p.case.viewer.1280`, `p.plan.viewer.1280`, `p.coverage.viewer.1280`, `p.contracts.viewer.1280`.
- **Routes:** `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/settings/correspondence`, `/p/[practiceId]/settings/proof-level`, `/p/[practiceId]/settings/pricing`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/mapping/[planId]`.
- **Evidence:** A viewer sees 'Create a run' with the release it would pin, ending 'Runs are created by the roles that map plans' (`apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx:57-59`, :96). A billing manager sees 'Set the contact' and its rules before 'The correspondence contact is set by the practice administrator' (`settings/correspondence/page.tsx:63`, :92). The proof level tells a role that cannot save what happens when it saves (`apps/web/src/lib/routes/settings.ts:353`). A viewer is told 'Check the ZIP code' (`packages/contracts/src/location.ts:65`). A viewer reads '... write the line off below ...' with no write-off form (`cases/[caseId]/page.tsx:175-183`). The plan page keeps its how-to-map paragraph above 'As Viewer, you cannot map payer plans' (`mapping/[planId]/page.tsx:142-150`). None names who can act.
- **Rule:** `docs/product/PRD.md:260` (a permission state that explains what the role cannot do); `PRD.md:256` (every error with a next step)
- **Fix:** Give each action card a read-only variant chosen from the permission: titled by what the reader sees ('Runs', 'The correspondence contact', 'Proof level: deposited'), with the imperative steps dropped and one line in their place naming who acts, by name where the practice has one ('Set by the practice administrator, Dana Admin.'). Status lines for roles that cannot act carry no command ('27601 is not on Medicare's ZIP list in force; the practice administrator or billing manager corrects it.').
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/correspondence/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/proof-level/page.tsx`, `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `packages/contracts/src/location.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 54 `co-001/ux-read-only-cards` (outside #42's files); UX PR 83 `co-001/ux-settings-words` (the proof-level sentence).
- **Sources:** `flows-practice-18`.
- **Verification:** confirmed
- **Notes:** `lib/routes/settings.ts` is a #42 file (the proof-level sentence): that part after #42 merges, the pages now. Naming the administrator reads the practice's own memberships. Pairs with UX-051 (C-020)'s permission words and UX-057 (C-052)'s ZIP sentence. Words chosen under the co-founder's ruling (above).

### UX-108 (C-032). Filtered empty lists say one generic sentence, never name the filter and offer no 'Clear filters' (Cases, Anomalies, a pricing run, console tickets and audit requests)

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 5 routes, 3 roles.
- **Roles:** billing manager, practice administrator, operator.
- **Screens:** `p.cases.empty-filtered.390`, `p.cases.empty-filtered.1280`, `p.anomalies.empty-filtered.1280`, `p.pricing-run.empty-filtered.390`, `console.tickets.empty.390`, `console.prospects.empty.1280`.
- **Routes:** `/p/[practiceId]/cases`, `/p/[practiceId]/anomalies`, `/p/[practiceId]/pricing-runs/[runId]`, `/console/tickets`, `/console/prospects`.
- **Evidence:** Cases and Anomalies end a filtered list in muted 14 px text, 'No case matches these filters.' and 'No cohort matches these filters.', with no heading, no next step and no way back but resetting four or two selects by hand (`p/[practiceId]/cases/page.tsx:243-244`, `anomalies/page.tsx:159-160`); at 390 px the Cases sentence is the last line of a 1,997 px page. A filtered pricing run says 'No line of this run matches.' at the foot of a long page (`pricing-runs/[runId]/page.tsx:232-233`). Both pages also draw Filter as a raw `<button className="h-9 rounded-md border px-3">` (`cases/page.tsx:237-239`, `anomalies/page.tsx:153-155`). Remittances, Claims and Contracts already do it right: an EmptyState titled for the filter, a next step and a 'Clear filters' link (`remittances/page.tsx:56-67`). The console's tickets and audit requests show their unfiltered sentence under any filter: 'No tickets here. Tickets opened from any screen's help appear here.' under 'answered' while an open ticket exists (`console/tickets/page.tsx:44`), 'No requests here. Requests from the public form at `/request-audit` appear here.' under 'contacted' (`console/prospects/page.tsx:48`). Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:260` (every screen has an empty state that says what to do next); `packages/ui/src/states/empty-state.tsx:8-11` (every empty state says what to do next)
- **Fix:** One `FilterBar` (the selects, `<Button type="submit" variant="outline">Filter</Button>`, and 'Clear filters' to the bare path while any filter is set) and one `FilteredEmpty` (an EmptyState, section level, no mark, titled for what is filtered, with 'Clear filters' as its action), used by all seven lists. Words (taken under the co-founder's ruling): Cases 'No open case for these filters' / 'Choose any state, every payer, anyone and any deadline, or clear the filters.' (the state's own label through `CASE_STATE_TEXT`); Anomalies 'No cohort for SYNTHETIC PAYER Q' or 'No cohort in this run' / 'Choose every run and every payer, or clear the filters.'; a pricing run 'No line of this run is <filter>' with 'Show all lines'; audit requests New 'No new requests' / 'Requests from the public audit form and from screenings appear here.', Contacted 'No contacted requests' / 'A request moves here when you mark it contacted.', Converted 'No converted requests' / 'A request moves here when you create its practice group.', Declined 'No declined requests' / 'A request moves here when you decline it with a reason.'; tickets open 'No open tickets' / 'Tickets people open from a screen's help, or by mail to <support address>, appear here.', answered 'No answered tickets' / 'A ticket moves here when you mark it answered.', closed 'No closed tickets' / 'A ticket moves here when you mark it closed.', each with 'Show all tickets'.
- **Size:** S.
- **Files:** `apps/web/src/components/filter-bar.tsx` (new), `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/app/p/[practiceId]/remittances/page.tsx`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/app/console/prospects/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 26 `co-001/ux-empty-states`.
- **Sources:** `retake-01`, `narrow-other-19`, `words-other-31`.
- **Verification:** confirmed
- **Notes:** The support engineer's home empty state with nothing to tap (part of narrow-other-19) is UX-052 (C-108) (console home). Retake-01 is new: the earlier shots of these two states were capture faults. The filtered Cases lede ('across 0 cases still being worked the filters admit') is UX-200 (C-168). Open PR #50 changes the run page; whichever merges second keeps both.

### UX-109 (C-046). Closed selects cut long option labels where the options differ (the run, the document, the release), and proof level hides its two choices in a select

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 6 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.pricing-runs.viewer.390`, `p.pricing-runs.default.390`, `p.cases.default.390`, `p.submissions.default.390`, `p.reports.default.390`, `p.proof-level.empty.390`, `p.plan.default.390`.
- **Routes:** `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/cases`, `/p/[practiceId]/cases/[caseId]/submissions`, `/p/[practiceId]/reports`, `/p/[practiceId]/settings/proof-level`, `/p/[practiceId]/mapping/[planId]`.
- **Evidence:** Compare two runs: both selects read '2026-03-01 to 2026-03-31, release 9000(' because the label puts period and release first and 're-run', 'in effect' and the completion time last (`p/[practiceId]/pricing-runs/page.tsx:35-36`), so on `p.pricing-runs.viewer.390` two March runs, one in effect and one not, look identical when closed. Triage a run (`cases/page.tsx:77-82`), the audit report's run (`reports/page.tsx:100-101`), the payer response's Document ('Payer letter, uploaded 2026-10-26 01:26 U(', `submissions/page.tsx:326`) and Mapping's Corrects (`mapping/[planId]/page.tsx:182`) are cut the same way. Proof level's two choices are long sentences in a select, cut to 'Deposited: recovered once the deposit is m' (`settings/proof-level/page.tsx:15-18,57`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 and 2.4.6 (a control's current value perceivable) and 3.3.2 Labels or Instructions; the rules are silent on option wording: recommended
- **Fix:** Lead each option with what tells it apart and keep it short. Words (taken under the co-founder's ruling): runs 'March 2026 · in effect · completed 01:25 UTC' and 'March 2026 · replaced · re-run'; documents 'Payer letter · 01:26 UTC · a80b2fd7'. Under each such select a hint line repeats the chosen option in full (the default rendered on the server, updated by a few lines of client code on change), so the whole value is readable at any width. Proof level becomes a radio pair, each choice with its one-line consequence under it (its words are UX-201 (C-169)'s).
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/proof-level/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 38 `co-001/ux-pricing-runs` (the run, document and release selects); UX PR 83 `co-001/ux-settings-words` (the proof-level choice as two radios).
- **Sources:** `narrow-practice-1-26`, `narrow-practice-2-11`.
- **Verification:** confirmed
- **Notes:** Kept at should_fix (one member said polish): with two same-period runs, one in effect and one replaced, a person can compare or triage the wrong run while the closed select shows the same text for both. PR #51 changes the submissions page; whichever merges second keeps both.

### UX-110 (C-051). Unpriced reasons and pricing methods reach the billing manager as codes or rules shorthand ('NO_AGREEMENT', 'FIXED_SCHEDULE', 'Claim status 2 or 3', 'Operator alert')

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 5 routes, 3 roles.
- **Roles:** billing manager, practice administrator, viewer.
- **Screens:** `p.claims.default.1280`, `p.coverage.default.1280`, `p.pricing-run.default.1280`, `p.compare.default.1280`, `p.line.default.1280`, `p.coverage.empty.1280`.
- **Routes:** `/p/[practiceId]/claims`, `/p/[practiceId]/coverage`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/pricing-runs/compare`, `/p/[practiceId]/lines/[lineId]`.
- **Evidence:** Bare codes: Claims and lines 'Unpriced / NO_AGREEMENT' (`apps/web/src/app/p/[practiceId]/claims/page.tsx:212`); pricing run 'FIXED_SCHEDULE' (`pricing-runs/[runId]/page.tsx:266`); compare 'NO_AGREEMENT' (`apps/web/src/components/pricing/diff.tsx:37`); Coverage 'left unpriced with NO_MAPPING, one by one' (`coverage/page.tsx:145`). The words exist and go unused (`apps/web/src/lib/contracts/display.ts:43` METHOD_NAMES; `apps/web/src/lib/contracts/remedies.ts:24-37`). Coverage's table shows the rules reference's shorthand verbatim ('Claim status 2 or 3' / 'Deferred release'; 'Specialist resolves scope'; 'Unexpected input' / 'Operator alert'), held word for word to `docs/product/rules-reference.md` by `remedies.test.ts:27-28`, under a lead-in that contradicts itself: 'Lines the runs in effect priced, each by the reason its pricing in effect left it unpriced.' (`coverage/page.tsx:234`).
- **Rule:** Combined audit #107 (unpriced reasons in words with their remedy); `apps/web/src/lib/copy/words.ts:22-26`; `docs/product/unpriced-reasons.md` is the closed list of codes, not a ban on plain words
- **Fix:** Render every reason and method through audit #38's one vocabulary (`@tp/packets/explain` words, viewer audience) on Claims and lines, the pricing run, Compare, Coverage and the line page, with the code kept as small secondary text only on Coverage's reference table. Add a plain customer wording per reason beside the reference meaning (which stays word for word, for specialists, so no content-pipeline change): 'SECONDARY_PAYER' -> 'The payer paid as secondary; PaidWhole does not price secondary claims'; 'AMBIGUOUS_RATE' -> 'More than one rate matches; the contract specialist decides which applies'; 'ENGINE_ERROR' -> 'PaidWhole could not read the line; we have been alerted and there is nothing for you to do'; 'NO_AGREEMENT' -> 'Unpriced: no agreement (out of network)'; 'FIXED_SCHEDULE' -> 'Fixed schedule'. Lead-in -> 'The lines the pricing runs in effect could not price, by reason, with what raises each.'
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`, `apps/web/src/components/pricing/diff.tsx`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/lib/contracts/remedies.ts`, `packages/packets/src/explain.ts` (from PR #52).
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 41 `co-001/ux-codes-in-words`.
- **Sources:** `words-practice-13`, `words-practice-32`.
- **Verification:** confirmed
- **Notes:** words-practice-32 would reword the doc and `remedies.ts`; that text is held to `docs/product/rules-reference.md` and its plan source under `content/`, and `docs/product/unpriced-reasons.md` is held by the engine-arithmetic check ('`docs/product/unpriced-reasons.md` and the engine's unpriced reason list are unchanged', `docs/product/reconciliation-001.md:448`), so rewording either is outside a UX PR (PR #52's design, section 12). A separate customer wording settles it without the freeze. PR #52 lists these bare codes as its own follow-up ('PR 13 or a small follow-up'): land after PR #52 merges, and after PR #49 (Coverage) and PR #50 (pricing run page, `components/pricing/display.tsx`), or the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-111 (C-068). 'Help with this screen' on Support, Terms and the support engineer's home shows the home help (the staff console to customers, a switcher to staff)

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 4 routes, 4 roles.
- **Roles:** billing manager, practice administrator, organization administrator, operator.
- **Screens:** `support.help.1280`, `terms.help.1280`, `home.help.1280`, `console.organization.help.1280`, `console.support.help.1280`.
- **Routes:** `/support`, `/terms`, `/`, `/console/organizations/[organizationId]`.
- **Evidence:** The help box prints `HELP[section]` (`apps/web/src/components/shell.tsx:335-338`). `/support` and `/terms` render with section 'home' (`apps/web/src/app/support/page.tsx:31`, `apps/web/src/app/terms/page.tsx:27`), so a billing manager on Support reads 'Your starting point: pick a practice in the switcher, or open the console if you work for PaidWhole.' (`apps/web/src/components/help.ts:9`), which describes neither page and names the internal console to a customer; on Support the box also offers 'Ask support about this screen' (`shell.tsx:339-342`) while the person is already there. The support engineer on `/` gets the same text with no switcher. The console organization page reuses the list's 'Directory records only.' (`help.ts:27`); for staff, 'Ask support about this screen' opens a customer ticket to their own desk. Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:256` (help that names steps the person cannot take misleads); silent on per-screen help: recommended
- **Fix:** Give each page its own help key and words (taken under the co-founder's ruling): 'support': 'Open a ticket about any screen, or write to support from the address you sign in with. Name the screen and the record's ID; never send a patient's name, date of birth, member ID or claim number.'; 'terms': 'Accepting records which version of the terms you accepted, and when. The document and its SHA-256 are on this page.'; 'home_internal' (staff with no practice): 'You work for PaidWhole. Your queues are in the rail.'; 'organization' (console): 'One organization's records: its practices, members, agreements and grants, and the actions a platform administrator takes on them.' Hide 'Ask support about this screen' on `/support` itself and for internal roles. Add a unit test that every `ShellSection` has its own entry and that no customer-facing entry names the console.
- **Size:** S.
- **Files:** `apps/web/src/components/help.ts`, `apps/web/src/components/shell.tsx`, `apps/web/src/app/support/page.tsx`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/help.ts`, `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 69 `co-001/ux-shell-context`.
- **Sources:** `flows-other-06`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges (`help.ts`, `shell.tsx`). The '`/support`' section is the same one UX-102 (C-066) adds so 'Help and support' is marked current. The 'record's ID' wording follows UX-191 (C-173) if that changes it.

### UX-112 (C-069). The rail is one flat list of 14 screens for every customer role, and the contract specialist's rail hides two of its three practice screens

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 4 routes, 4 roles.
- **Roles:** billing manager, packet approver, practice administrator, operator.
- **Screens:** `p.home.default.1280`, `p.settings.default.1280`, `p.uploads.viewer.1280`, `p.abstraction.default.1280`, `p.abstraction-ledger.default.1280`, `p.abstraction-regulations.default.1280`.
- **Routes:** `every practice route`, `/p/[practiceId]/abstraction`, `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/abstraction/regulations`.
- **Evidence:** `ShellNav` gives every customer role the same 14 links in data-pipeline order: Practice home, Uploads, Remittances, Claims and lines, Payer and plan mapping, Contracts, Coverage, Pricing runs, Anomalies, Cases, Reconciliation, Reports, Notifications, Settings (`apps/web/src/components/shell.tsx:185-228`). Cases, the billing manager's daily screen, is tenth; the practice administrator and the viewer see Uploads, Mapping and Cases they cannot act on. The contract specialist's practice rail holds only 'Contract abstraction' (`shell.tsx:169-174`); 'Regulations to confirm' and 'Ledger corrections', both its work, are reachable only from a small link row above the abstraction heading, and on those pages the rail still marks 'Contract abstraction' current. Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:260` (navigation is a left rail; each role sees what it cannot do explained); the brand fixes only the active item's underline (`docs/brand/BRAND.md:120-121`) and is silent on the rail's order: recommended
- **Fix:** Group the customer rail by job, with short group labels, ordered by use: 'Work' (Cases, Anomalies, Reconciliation), 'Results' (Practice home, Reports), 'Data' (Uploads, Remittances, Claims and lines), 'Set-up' (Contracts, Payer and plan mapping, Coverage, Pricing runs), then Notifications and Settings. Keep every screen reachable for every role (each has a read view), but list the role's own working group first and mark screens whose actions it lacks with 'view only' in text. Give the specialist's practice rail its three screens (Contract abstraction, Regulations to confirm, Ledger corrections) with the current one marked. The billing link's place is UX-120 (C-067)'s.
- **Size:** S.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/lib/http/route.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 68 `co-001/ux-skip-and-rail`.
- **Sources:** `flows-practice-17`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges (`shell.tsx`), in one shell PR with UX-093 (C-023) to UX-021 (C-027). Group names and order taken under the co-founder's ruling.

### UX-113 (C-103). Dollar amounts inside sentences render in Plex Sans: the digest, contract terms ('$50.00 per unit', '110% of Medicare'), and the screening's upload messages

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 4 routes, 4 roles.
- **Roles:** billing manager, practice administrator, contract specialist, screening prospect.
- **Screens:** `p.digest.default.1280-dark`, `p.contract-version.default.1280-dark`, `p.defaults.default.1280-dark`, `p.roi-statement.default.1280`.
- **Routes:** `/p/[practiceId]/digests/[digestId]`, `/p/[practiceId]/contracts/versions/[versionId]`, `/p/[practiceId]/settings/defaults`, `/screening`.
- **Evidence:** The digest page prints the email's sentences as plain strings (`apps/web/src/app/p/[practiceId]/digests/[digestId]/page.tsx:38-39`), so '$90.00 on 3 lines' is set in Plex Sans. Contract terms arrive as finished strings ('$50.00 per unit', `apps/web/src/lib/contracts/display.ts:151`, :158) and print in a plain table cell (`apps/web/src/components/contracts/review.tsx:248`). The screening's left-out sentence builds amounts into text with `formatUsd` (`apps/web/src/lib/screening/messages.ts:134`, :170). The materiality line's amounts are UX-002 (C-003)'s and the ROI's '0.00' hours UX-032 (C-087)'s.
- **Rule:** `.claude/rules/brand.md:36-37` (every money figure, code, unit count and rate in the mono font with tabular numerals); ADR 0056 (running text included, through `<Money/>`)
- **Fix:** Sentence builders return parts (text plus cents, counts and rates) instead of finished strings, so pages render `<Money/>` and mono counts. Where a string must stay shared with email (the digest's sentences), render it through a `<Figures>` component, the web twin of the PDF's `escapeWithFigures`, which sets each dollar amount, percent, rate and count in the mono face with tabular numerals. Add an e2e step that lays out the digest, contract-version and screening pages and finds no '$' amount outside IBM Plex Mono.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/digests/[digestId]/page.tsx`, `apps/web/src/lib/contracts/display.ts`, `apps/web/src/lib/contracts/review.ts`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/lib/screening/messages.ts`, `apps/web/src/components/figures.tsx` (new), `apps/web/e2e/brand.spec.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/screening/messages.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 51 `co-001/ux-contract-pages` (outside #42's files); UX PR 85 `co-001/ux-screening-messages` (the screening messages).
- **Sources:** `brand-10`.
- **Verification:** corrected: the contract terms render at `components/contracts/review.tsx:248` (`field.text`), not :247; the rest confirmed
- **Notes:** `lib/screening/messages.ts` is a #42 file: the screening part lands after #42 merges; the digest and contract parts now. The materiality line is fixed by PR #54 (`<Money>`).

### UX-114 (C-106). Figures are set in Plex Mono weights the brand does not ship (600, 700), so the browser fakes the bold on the most important numbers

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 4 routes, 4 roles.
- **Roles:** screening prospect, practice administrator, billing manager, contract specialist.
- **Screens:** `screening-result.default.1280`, `p.roi-statement.default.1280`, `p.report.default.1280`, `console.specialist-queue.default.1280-dark`.
- **Routes:** `/screening/results/[resultId]`, `/p/[practiceId]/reports/roi/[statementId]`, `/p/[practiceId]/reports/[reportId]`, `/console/specialist-queue`.
- **Evidence:** `apps/web/src/lib/fonts.ts:36-44` loads IBM Plex Mono at 400 and 500 only. The report headline's value is `font-semibold` (`apps/web/src/components/reports/display.tsx:84`); the screening stats too (`apps/web/src/components/screening/result-summary.tsx:110`), so '$11,716.59' reads heavy and smeared; every CardTitle that holds a figure inherits `font-bold` (`packages/ui/src/components/card.tsx:21`): the ROI cards' 'Recovered principal, net (deposited): $12.00' and the specialist queue's counts. `Money` sets no weight (`apps/web/src/components/remittances/display.tsx:17-18`), so it inherits whatever surrounds it.
- **Rule:** `docs/brand/BRAND.md:94` (money and tables: IBM Plex Mono 400 and 500; totals 500); `.claude/rules/brand.md:36`
- **Fix:** Make `Money` and every mono figure component set `font-medium` (500) explicitly, so a heading's or tile's weight never reaches the figure (`components/remittances/display.tsx:18` and its screening and monitoring twins). Remove `font-semibold` and `font-bold` from figure elements. Extend `apps/web/src/app/type-scale.test.ts` to fail on `font-mono` beside `font-semibold` or `font-bold`.
- **Size:** S.
- **Files:** `apps/web/src/components/remittances/display.tsx`, `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/components/reports/display.tsx`, `apps/web/src/components/reports/roi.tsx`, `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/app/type-scale.test.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/monitoring/display.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 18 `co-001/ux-stat-tile` (outside #42's files); UX PR 81 `co-001/ux-notification-words` (the monitoring twin).
- **Sources:** `brand-09`.
- **Verification:** confirmed
- **Notes:** `components/monitoring/display.tsx` is a #42 file: its twin after #42 merges, the rest now. UX-104 (C-057)'s StatTile sets its value at 500 too; land together. PR #51 changes `components/reports/display.tsx`: after it.

### UX-115 (C-054). Counts print '1 lines' and '1 cases': `counted()` is imported by two files and about 25 sites put a fixed plural after a number (the earlier tour's 'on 1 lines', still present)

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 4 routes, 3 roles.
- **Roles:** billing manager, practice administrator, platform operator.
- **Screens:** `p.home.default.1280`, `p.notifications.default.1280`, `p.home.error-last-run-failed.1280`, `console.compliance.default.1280`, `console.rule-releases.default.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/notifications`, `/console/compliance`, `/console/rule-releases`.
- **Evidence:** 'A payer took back -$18.00 on 1 lines of a case: the lines are reopened ...' and '1 cases nearing their deadline' come from notification text that puts a count before a fixed plural (`apps/web/src/components/monitoring/display.tsx:34-35`, :55, :67), while the worker's digest page pluralises the same figure right (`apps/worker/src/digest/view.ts:146`). The same pattern sits wherever a count can be 1: the packet's line schedule (`cases/[caseId]/packet/page.tsx:268`; `review/page.tsx:82`), the case summary (`cases/[caseId]/page.tsx:77`, :80), mapping (`mapping/page.tsx:141`), reports (`reports/page.tsx:148`), regulations (`abstraction/regulations/page.tsx:83`), contract windows (`components/contracts/review.tsx:31-40`), receipts (`components/uploads/receipts.tsx:197`), and the console's '{ready} controls ready' (`console/compliance/page.tsx:99`) and '{records} records' (`console/rule-releases/page.tsx:208`). `counted()` (`apps/web/src/lib/copy/words.ts:8`) is imported only by `components/reports/roi.tsx` and `components/screening/result-summary.tsx`.
- **Rule:** `apps/web/src/lib/copy/words.ts:2-3` (a count with its noun, singular for one); the 2026-10-25 tour's copy defect C1
- **Fix:** Use `counted()` at every site, and agree the rest of the sentence with the count: 'A payer took back $18.00 from 1 line of a case: the line is reopened, and recovered (deposited) drops by that amount.'; '1 case nearing its deadline'; 'validated $90.00 on 3 lines; 1 case opened; 0 lines flagged (investigatory)'; '1 control ready'; '1 record'. Add count-of-one cases to the display tests, and a `tools/brand-copy` rule that fails a JSX or template expression followed by a literal plural noun ('} lines', '} cases', '} claims', '} records', '} entries').
- **Size:** M.
- **Files:** `apps/web/src/components/monitoring/display.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/regulations/page.tsx`, `apps/web/src/components/contracts/review.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/app/console/rule-releases/page.tsx`, `tools/brand-copy/scan.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/monitoring/display.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 30 `co-001/ux-counts-and-units` (outside #42's files); UX PR 81 `co-001/ux-notification-words` (the notifications).
- **Sources:** `words-practice-01`, `words-other-33`.
- **Verification:** confirmed
- **Notes:** `components/monitoring/display.tsx` is a #42 file: every other site and the lint land now, the notifications after #42 merges. The '-$18.00' sign is UX-031 (C-081). PR #52 changes the packet pages and PR #54 the plural minutes: the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-116 (C-101). Records named by UUID and 835 segment codes where a name exists: 'Mapping d1cb53de-...', 'Rate record 86f15cfd-...', 'AMT B6', 'Code HC:97110', adjustments 'CO 45' with no words

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 4 routes, 3 roles.
- **Roles:** billing manager, packet approver, viewer.
- **Screens:** `p.line.default.1280`, `p.line.empty-not-priced.1280`, `p.pricing-run.default.1280`, `p.contract-version.default.1280`, `p.packet.default.1280`, `p.line.error.1280`.
- **Routes:** `/p/[practiceId]/lines/[lineId]`, `/p/[practiceId]/pricing-runs/[runId]`, `/p/[practiceId]/contracts/versions/[versionId]`, `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** Line page: 'Mapping d1cb53de-...', 'Contract version 11d8ad16-...' (a link whose text is a UUID), 'Rate record 86f15cfd-...' (`apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx:93-106`); 'AMT B6' as a row label (:184), 'Code' 'HC:97110' (:200), 'Plan key' (:207); adjustments 'CO 45 $80.00' with no reason words though the release carries the CARC table. Pricing run: 'rate record 86f15cfd-...' (`apps/web/src/components/pricing/display.tsx:177`). Packet citation: 'Document 5338e48f-..., page 2'.
- **Rule:** The brief's plain-language rule (no internal identifiers in what a person reads); PRD 7 (Claims and lines: reasons in words)
- **Fix:** Name each record as its own page titles it, the ID kept only as a copyable detail for support: 'Plan SYNPLAN-FIX-ONE mapped to SYNTHETIC FIXED SCHEDULE AGREEMENT from 2026-01-01'; 'SYNTHETIC FIXED SCHEDULE AGREEMENT, version 1' (same link); 'Record 1: 97110, $50.00 per unit'; pricing run 'record 1 (97110)'; 'Contract, uploaded 2026-10-26, page 2'. 835 fields in words with the code after: 'Payer's allowed amount (AMT B6)'; 'Procedure code 97110 (CPT/HCPCS)'; 'Contractual obligation (CO) 45: charge exceeds the fee schedule', from the release's CARC records.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`, `apps/web/src/components/pricing/display.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/components/contracts/display.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 40 `co-001/ux-record-names`.
- **Sources:** `words-practice-49`.
- **Verification:** confirmed
- **Notes:** PR #52 (audit #38) words the line page's method, adjustments and unrounded amount but not these record names or 835 labels (its section 12), so this is a follow-up after PR #52 merges, not a fold-in; the pricing run part also follows PR #50 (`components/pricing/display.tsx`). Words chosen under the co-founder's ruling (above).

### UX-117 (C-035). Native controls ignore the theme: no color-scheme and no accent-color, so dark fields keep light-scheme pickers and glyphs and both themes check boxes in the browser's blue

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.pricing-runs.default.1280-dark`, `p.remittances.default.1280-dark`, `p.contracts.default.1280-dark`, `p.template.default.1280-dark`, `account.notifications.default.1280-dark`, `p.packet.default.1280-dark`.
- **Routes:** `every route with a date, month, select, checkbox or radio control`.
- **Evidence:** Nothing sets `color-scheme` or `accent-color` anywhere (search of `apps/web/src`, `packages/brand/src`, `packages/ui/src` at 4d99df8; `packages/brand/src/tokens.css:7,72-74`). Light, live today: checked boxes and radios take the browser's default blue, a colour from no token, on notification preferences, users, console status, packet evidence and the posting template. Dark (tokens only, advisory): the calendar button of every month and date input is black on the #0B1626 field, 1.26:1; select chevrons are dark on dark; checkboxes render as light squares.
- **Rule:** `.claude/rules/brand.md:13-16` (colours come from tokens) and `:39` (dark mode through the semantic tokens); WCAG 2.1 1.4.11 Non-text Contrast (dark: advisory)
- **Fix:** In `packages/brand/src/tokens.css` set `color-scheme: light` on `:root` and `color-scheme: dark` in the `:root[data-theme="dark"], .dark` block, so every native glyph, picker and scrollbar follows the theme. In `apps/web/src/app/brand.css` set `accent-color: var(--pw-primary)` on `input[type=checkbox], input[type=radio], progress`, so checked controls are Ink in light and near-white in dark: never Brass (never a fill) or a status colour. In `apps/web/e2e/brand.spec.ts`, assert the root's computed `color-scheme` and a checkbox's `accent-color` follow the theme.
- **Size:** S.
- **Files:** `packages/brand/src/tokens.css`, `apps/web/src/app/brand.css`, `apps/web/e2e/brand.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 32 `co-001/ux-dark-tokens`.
- **Sources:** `brand-02`, `a11y-practice-1-23`, `a11y-practice-2-15`.
- **Verification:** confirmed
- **Notes:** Brand choice taken under the co-founder's ruling: native controls take Ink, an existing token (no palette change, which would be the brand owner's). The `color-scheme: dark` line changes nothing a user reaches while dark stays off (the founder's ruling, UX-118 (C-080)); it readies the tokens. Kept severity should_fix because the light half is live.

### UX-118 (C-080). How people reach dark mode: recommended a per-user Appearance setting, 'Match my device' by default, once the dark set is fixed (a founder decision: it reverses 'dark mode stays off')

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.home.default.1280-dark`, `p.claims.default.1280-dark`, `home.default.1280-dark`, `status.default.1280-dark`, `sign-in.default.1280-dark`.
- **Routes:** `every page`.
- **Evidence:** No user reaches dark today: nothing sets `data-theme`, and `tokens.css` has no `prefers-color-scheme` rule (ADR 0056:127-130: 'Nothing switches it on … Revisit with a setting'). The founder's recorded ruling is 'dark mode stays off' (`docs/product/reconciliation-001.md:309`, D9 item 3, accepted in ADR 0058:56-58). The dark set is close to ready: 76 of 82 dark shots apply cleanly; measured dark contrasts pass (text 16.8:1, muted 8.4:1, links 8.5:1, status text on tint 5.9 to 7.1:1, field outlines 3.5:1). Three gaps remain: the sign-in ground (UX-160 (C-047)), native controls (UX-117 (C-035)) and print (UX-164 (C-079)). The only dark check is a screenshot that is saved and never compared (`apps/web/e2e/brand.spec.ts:407-409`). A stored preference cannot go in the user's settings today: the database admits only the `notifications` key (`user_settings_valid`, migration `20261020090000_monitoring_digests_notifications.sql:144-150`; `packages/db/src/schema/tenancy.ts:60-73`).
- **Rule:** `docs/brand/BRAND.md:84-86` (defines dark mode); ADR 0056:127-130 and ADR 0058 D9 item 3 (`reconciliation-001.md:309`, 'dark mode stays off'); `docs/product/PRD.md:256` (accessibility on every screen; no state a refresh loses). The rules are silent on how a user reaches dark mode.
- **Fix:** Question for the founder, through the co-founder. Options: (a) keep light-only, as ruled; (b) follow the device's setting with no switch; (c) a per-user Appearance setting with 'Match my device' (the default), 'Light' and 'Dark'. Recommended: (c). Store the choice in the user's server-side settings so it follows the person across devices and survives a refresh; the server renders it into `<html data-theme>` so the page never flashes the wrong theme; 'Match my device' works through a `@media (prefers-color-scheme: dark)` block in `tokens.css` scoped to `:root:not([data-theme="light"])`; public and sign-in pages follow the device; print, PDFs, the payer's copy and email stay light; the viewport's theme colour gets light and dark variants. Gate it: UX-117 (C-035), UX-160 (C-047) and UX-164 (C-079) first, dark pixel baselines that are compared (header, sign-in, a tile row, a status table), and axe in both themes, before the setting appears. Why (c), as a judgement and not a measured fact (no user has asked, ADR 0056:129): billing staff work long days in dense tables, and a person who has set their device to dark, some for light sensitivity, gets it without asking; the switch lets the same person force Light to share a screen, take a screenshot for support or print, which (b) cannot; and the brand defines a dark set that nearly passes. The setting lives on its own account page, `/account/appearance`, linked from the account menu beside Notification preferences, not on the notifications page.
- **Size:** M.
- **Files:** `packages/brand/src/tokens.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/account/appearance/page.tsx` (new), `apps/web/src/lib/routes/account.ts`, `apps/web/src/components/shell.tsx`, `packages/db/src/schema/tenancy.ts`, `apps/web/e2e/brand.spec.ts`, `apps/web/e2e/a11y.ts`, `docs/adr/0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md`.
- **Migration:** yes, for Lane A: Widen `user_settings_valid` (migration `20261020090000`, recreated in a new migration) to admit an `appearance` key whose value is one of 'device', 'light' or 'dark', beside `notifications`; update `UserSettings` in `packages/db/src/schema/tenancy.ts` (a #42 file, so after #42 merges) and regenerate the domain model and the function files. Only if the founder chooses (c).
- **#42:** yes: `apps/web/src/components/shell.tsx`, `packages/db/src/schema/tenancy.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 91 `co-001/ux-appearance` (the tokens' device rule, the server-rendered theme, the setting page and the gate (Lane B)).
- **Sources:** `brand-04`.
- **Verification:** confirmed
- **Notes:** Founder-kept because it reverses a recorded founder ruling (D9 item 3); the brief's 'take the recommended option' does not reach a recorded ruling. Until the founder rules, Lane B lands only UX-117 (C-035), UX-164 (C-079) and UX-160 (C-047)'s static check, which change nothing a user sees in light; UX-160 (C-047)'s alias token waits for F3 and lands with the setting. If (c) is chosen, the stored preference is a migration and goes to Lane A under 'Handed to Lane A' (`tenancy.ts` is also #42's); the tokens, the gate, the baselines and the settings page stay in Lane B. Option (b) alone would need no migration.

### UX-119 (C-129). The practice home is one page for every role: a billing manager's queues come fourth at equal weight, and the administrator's own setup items live only on Settings

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 2 routes, 4 roles.
- **Roles:** billing manager, practice administrator, viewer, analyst.
- **Screens:** `p.home.default.1280`, `p.home.support-access.1280`, `p.home.tiles.1280`, `p.settings.default.1280`, `p.settings.mostly-done.1280`, `p.agreements.default.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/settings`.
- **Evidence:** `apps/web/src/app/p/[practiceId]/page.tsx` renders one fixed order for every customer role (headline, Data freshness, Where things stand, Queues, Notifications, Practice record, Agreements, Support access); only the subtitle changes (:160-162). For the billing manager 'Queues' is the fourth block (about y 1,030) with all seven queues at equal weight, zeros included. The practice administrator gets the billing headline and queues they cannot work, while their own open items ('Confirm the agreement chain', 'Check your billing ZIP') are only on Settings, and the home's Agreements card omits the two Missing. Before the first file every role gets 'Upload your first 835 files ... Go to Uploads' (:182-192), the administrator included.
- **Rule:** `docs/product/PRD.md:267` (jump to any queue); `PRD.md:260` (an empty state that says what to do next; a permission state); combined audit #90 (the checklist sends the administrator to an upload page they cannot use)
- **Fix:** One URL, its sections ordered by the viewer's permissions in the handler: those who work cases lead with 'Your work', the non-zero queues sorted by earliest filing deadline (with UX-008 (C-012)'s packet hand-offs), then the headline; the practice administrator leads with Getting started until it is complete (moved to a shared component), then missing agreements, grants and support access, then the headline read-only; a viewer leads with the headline, this quarter's recovered figure and the latest ROI statement, queues as counts without action links. The empty state names who uploads when the viewer cannot.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/lib/routes/practice.ts`, `apps/web/src/lib/dashboard/queries.ts`, `apps/web/src/app/p/[practiceId]/settings/page.tsx`, `apps/web/src/lib/routes/settings.ts`, `apps/web/src/components/settings/getting-started.tsx` (new).
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/practice.ts`, `apps/web/src/lib/routes/settings.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 82 `co-001/ux-home-by-role`.
- **Sources:** `flows-practice-16`.
- **Verification:** confirmed
- **Notes:** `lib/routes/practice.ts` (the home's handler) and `lib/routes/settings.ts` (the checklist) are #42 files: after #42 merges, and after PR #51 (home page). The combined admin-plus-biller role is audit #90 (Lane A's PR 14); this needs no role change. Section names chosen under the co-founder's ruling (above).

### UX-120 (C-067). The organization's administrator has no organization area: users hide in one practice's Settings, billing among the account links shown to everyone

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 3 routes, 2 roles.
- **Roles:** organization administrator, practice administrator.
- **Screens:** `settings.billing.default.1280`, `settings.billing.firm.1280`, `settings.users.default.1280`, `settings.users.notice-invited.1280`, `console.specialist-queue.default.1280`, `account.devices.internal-shell.1280`.
- **Routes:** `/settings/billing`, `/settings/billing/[organizationId]`, `/settings/organizations/[organizationId]/users`.
- **Evidence:** 'Users and roles' exists only as a Settings sub-link of whichever practice is open (`apps/web/src/components/settings/nav.tsx:23`), while 'Billing' is an account link shown to every signed-in person (`apps/web/src/components/shell.tsx:288-290`), viewers, contract specialists and platform administrators included, who reach only its empty state ('Billing is managed by your organization's administrator', `apps/web/src/app/settings/billing/page.tsx:31`). An administrator of one organization clicks Billing, gets a list of one card with no standing on it ('Plan, payment method, invoices and standing.', `billing/page.tsx:33-46`), and clicks again; PR #47 changed the organization's billing page but not this list (re-read at 4d99df8). On Users and roles the invite form, the task the page exists for, sits below every member row (`settings/organizations/[organizationId]/users/page.tsx:97-110`; with ten members about 1,400 px down), and 'Done: Invitation sent' shows at the top while the new invitation is listed at the foot.
- **Rule:** `docs/product/PRD.md:282` (Settings: users and roles, grants and agreements, billing; administrator-only actions marked); silent on where organization pages live: recommended
- **Fix:** Give an organization's administrator an 'Organization' group in the rail, headed by the organization's name, shown only to roles holding `user.invite` or `organization.billing`: 'Users and roles' and the billing page (and, for a firm, its clients); everyone else loses a billing link that leads nowhere. When the person administers one organization, `/settings/billing` opens that organization's page directly; with several, each card shows its standing ('In good standing', 'Payment failed on …') with the next step. On Users and roles, put an 'Invite someone' button at the top that opens the form, and after an invitation show the new row beside the notice. The shell gains the actor's organization roles, which the organization directory already resolves.
- **Size:** M.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/lib/http/route.ts`, `apps/web/src/lib/http/invoke.ts`, `apps/web/src/app/settings/billing/page.tsx`, `apps/web/src/lib/routes/billing.ts`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/components/settings/nav.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx`, `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 70 `co-001/ux-organization-area`.
- **Sources:** `flows-other-05`.
- **Verification:** confirmed
- **Notes:** PR #47 (audit #135, the bank account shown first) has merged (c5195ee), so this is no longer in flight; its proposal to show a bank account still waiting on micro-deposits is queued separately. What the billing link is called is UX-121 (C-090)'s (the word 'Billing' names two things); use its name. The suspended standing shown as 'In good standing' is UX-004 (C-010). Lands after #42 merges (`shell.tsx`, the users page).

### UX-121 (C-090). 'Billing' names two things: what the organization pays PaidWhole, and the billing manager's claims work, so a billing manager opens 'Billing' and is told it is not theirs

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 2 routes, 3 roles.
- **Roles:** billing manager, organization administrator, practice administrator.
- **Screens:** `settings.billing.empty.1280`, `settings.billing.default.1280`, `settings.billing-org.default.1280`, `settings.billing-org.error-forbidden.1280`.
- **Routes:** `/settings/billing`, `/settings/billing/[organizationId]`.
- **Evidence:** The account rail's 'Billing' (`apps/web/src/components/shell.tsx:288-290`) opens PaidWhole's own subscription and invoices. A billing manager, whose role name says billing, opens it and reads 'No organization's billing to manage / Billing is managed by your organization's administrator ...' (`apps/web/src/app/settings/billing/page.tsx:31`). The H1s 'Billing' and 'Billing: SYNTHETIC OTHER GROUP' (`billing/page.tsx:26`; `billing/[organizationId]/page.tsx:41`) do not say whose bill it is. Unchanged by PR #47.
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); the brief's plain-language rule
- **Fix:** Name the page for what it holds: rail item 'Billing' -> 'Subscription'; H1 'Billing' -> 'Subscription and invoices'; intro -> 'What each organization you administer pays PaidWhole: its plan, payment method and invoices. This page holds the organization's name and its invoices only, never a patient's or a claim's details.'; 'Billing: SYNTHETIC OTHER GROUP' -> 'Subscription: SYNTHETIC OTHER GROUP'; empty state -> 'No subscription to manage' with 'Your organization's administrator manages what it pays PaidWhole (a group's practice administrator, a firm's principal).'
- **Size:** S.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/app/settings/billing/page.tsx`, `apps/web/src/app/settings/billing/[organizationId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 70 `co-001/ux-organization-area`.
- **Sources:** `words-other-20`.
- **Verification:** confirmed
- **Notes:** `shell.tsx` is a #42 file: the rail label after #42 merges; the two billing pages can take their words now (PR #47 has merged). Name it once with UX-120 (C-067) (writer A's organization area), which moves this item into an Organization section. Words chosen under the co-founder's ruling (above).

### UX-122 (C-102). The screening's kept-data notices are run-on sentences: an 11-line paragraph before any figure on the result, a 110-word list in one sentence, and the same paragraph as a 12 px field hint

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 3 routes, 2 roles.
- **Roles:** screening prospect, audit requester.
- **Screens:** `screening-result.default.1280`, `screening.default.1280`, `request-audit.default.1280`, `screening-result.not-found.1280`.
- **Routes:** `/screening/results/[resultId]`, `/screening`, `/request-audit`.
- **Evidence:** The result page opens with an 11-line paragraph before any figure (`apps/web/src/lib/screening/retention.ts:23`, rendered at `apps/web/src/components/screening/result-summary.tsx:147`, `data-legal-surface='screening-kept-result'`); its record-of-counts list is one 110-word sentence (`KEPT_COUNTS`, `apps/worker/src/screening/wording.ts:24-25`, 'decision 7'). The Work email hint on `/screening` is the same paragraph in 12 px (`UPLOAD_EMAIL_HINT`, `retention.ts:37`; `apps/web/src/components/screening/upload-form.tsx:181`, a legal surface counsel reviews). The request-audit card says '... the campaign codes and kind of paid click of the link you came from ...' (`retention.ts:47`).
- **Rule:** `docs/brand/BRAND.md:23` (exact, warm); the brief's plain-language rule; `docs/product/legal-surfaces.md` (these are legal surfaces)
- **Fix:** Recommended to the founder: keep every clause and change only the shape: one lead sentence ('This link opens your result until 2026-11-25, or until a later screening for the same practice or from the same email address replaces it.'), then two short lists ('Then we delete:' the rows and figures; the practice name, ZIP code and email address you gave. 'We keep a record of counts that names no one:' `KEPT_COUNTS` as a list of its own clauses). A one-line summary at the top of the result ('This link opens until 2026-11-25. What we keep and delete is at the foot of the page.') with the full notice below the result; the email hint becomes a 'What we keep' disclosure at body size; 'kind of paid click' -> 'whether you came from a paid ad'.
- **Size:** M.
- **Files:** `apps/worker/src/screening/wording.ts`, `apps/web/src/lib/screening/retention.ts`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/components/screening/upload-form.tsx`, `apps/web/src/app/request-audit/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/screening/retention.ts`, `apps/web/src/components/screening/upload-form.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 89 `co-001/ux-screening-kept-notices`.
- **Sources:** `words-other-17`.
- **Verification:** confirmed
- **Notes:** Founder's: these are legal surfaces on `HANDOFF.md`'s counsel list (decision 7's kept-counts wording, the screening terms, the campaign-code wording), so even a reshaping goes to the founder through the co-founder for sign-off before counsel. Question: (a) leave as is until counsel; (b) the same clauses reshaped as above, sent to counsel as the proposed text (recommended: the prospect reads the result first and the notice stays whole). `retention.ts` and `upload-form.tsx` are #42 files: after #42 merges.

### UX-123 (C-127). After an upload the receipt says what loaded but never what it found or what happens next

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.uploads.default.1280`, `p.upload.default.1280`, `p.upload.export-receipt.1280`, `p.uploads.viewer.1280`, `p.remittance.default.1280`.
- **Routes:** `/p/[practiceId]/uploads`, `/p/[practiceId]/uploads/[documentId]`, `/p/[practiceId]/remittances/[remittanceId]`.
- **Evidence:** When a batch settles, 'This batch' reports 'N of N sent; N of N taken in' (`apps/web/src/components/uploads/uploader.tsx:410`) and refreshes its lists, with no next step. The 835 receipt shows Loaded, size, SHA-256, document id and a parse report whose only onward link is the remittance by an 8-character id (`apps/web/src/app/p/[practiceId]/uploads/[documentId]/page.tsx`); nothing says which service months the lines fall in, whether monitoring prices them or a person must create a run, how many plans now wait on a mapping, or what pricing found. A posting-export receipt reads only 'Loaded.' with no link to Reconciliation. The remittance lists charge, paid and patient share per claim, without expected or short.
- **Rule:** `docs/product/PRD.md:268` (Uploads: receipts with status and reasons) and :267 (jump to any queue); `PRD.md:260` (every screen says what to do next)
- **Fix:** Each settled 835 receipt (and the batch card) gets a 'What happens next' block computed from the loaded lines: the service months covered and, for each, the run that priced it (linked), 'Monitoring prices it' or 'Create the run'; plans now waiting on a mapping (linked to Mapping, filtered); and once priced, the validated shortfall and cases opened (linked). A posting or EFT export shows rows read, matched and unmatched with a link to Reconciliation's unmatched section. The remittance adds expected and short per claim where priced, in the brand's order (expected, paid, short).
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/uploads/[documentId]/page.tsx`, `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/lib/routes/uploads.ts`, `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 49 `co-001/ux-upload-next`.
- **Sources:** `flows-practice-14`.
- **Verification:** corrected: the batch line is at `components/uploads/uploader.tsx:410` at 4d99df8 (the finding cites :252-258 and :422-427, the refresh logic); the rest confirmed
- **Notes:** PR #54 changes the upload receipt page (the PLB total): land after it. Figures come from code (`CLAUDE.md` rule 1). Words chosen under the co-founder's ruling (above).

### UX-124 (C-050). The payer's copy opens on a cover that asks to 'reprocess underpaid claims' with no amount, no claim count, no service dates, no filing deadline and no reply contact

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** packet approver, packet reviewer, payer examiner (reader).
- **Screens:** `p.packet-pdf.default.1280`, `p.packet.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet/[versionId]/pdf`.
- **Evidence:** Page 1 of the exported packet is a Paper cover with the practice name, 'PAYMENT DISPUTE', 'Request to reprocess underpaid claims', the addressee, 'Dispute level 1; prepared 2026-10-26' and the reference, and nothing else. The meta is fixed to those three lines (`apps/worker/src/packets/html.ts:240`, in the cover at :234-243). The amount asked ($90.00 on 3 lines, on PACKETS), the claim count, the service dates and the correspondence contact (built at :233) appear only on later pages, so an examiner triaging mail, and the practice's reviewer attesting the PDF, see nothing on the cover to check.
- **Rule:** CO-06 (`docs/product/change-order-001.md:61`: the export's neutral language, "our review indicates a payment difference under the following terms"); Lane A's PR 12 rewrites the packet heading and requested action (`docs/product/reconciliation-001.md:201-209`; ADR 0058:53-54 gives the packet's neutral wording to that PR); no written rule on the cover's figures; recommended, with `docs/brand/BRAND.md:23` ('exact') and `CLAUDE.md` rule 1 (figures from code)
- **Fix:** Handed to Lane A's PR 12, which rewrites this cover once in CO-06's neutral words. The figures to add to the cover's meta, each built by code from the version's stored content (no typed figure): the payment difference and its lines and claims ('Payment difference: $90.00 on 3 lines of 3 claims'), the service-date span ('Service dates 2026-03-05 to 2026-03-07'), the filing deadline relied on with its source, and the reply-to contact with the reference to quote. Keep the Paper cover and the white-label rule. The packet cover has no committed baseline (ADR 0058's cover baselines are the ROI statement's), and the cover shares `apps/worker/src/report/brand.ts` with the ROI covers, so Lane A's PR 12 re-runs the ROI cover baselines if it touches that frame.
- **Size:** S.
- **Files:** `apps/worker/src/packets/html.ts`, `apps/worker/src/report/brand.ts`, `apps/worker/src/report/brand.test.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** none in Lane B; handed whole to Lane A's PR 12 (section 5), which rewrites the cover in CO-06's neutral words.
- **Sources:** `flows-practice-35`, `words-practice-52`.
- **Verification:** confirmed
- **Notes:** Both members marked it audit #38; audit #38's design (PR #52) does not touch the cover. Moved on review from a Lane B PR to Lane A's PR 12: the cover's heading and requested action ('Request to reprocess underpaid claims') are Lane A's PR 12's to rewrite under CO-06, in the same file (`apps/worker/src/packets/html.ts`), and two lanes rewriting one cover would conflict. 'Amount in dispute' is not CO-06's neutral wording; 'payment difference' is. The cover is rendered from the stored content at export, so no new packet format version. Not legal text.

### UX-125 (C-063). Cases puts the case list under four setup panels (about 1,340 px down at 1280, 1,980 px at 390), even from the home's deadline link; materiality is set in two places with different words

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.cases.deadline-14.1280`, `p.cases.deadline-14.390`, `p.cases.default.1280`, `p.cases.default.390`, `p.defaults.default.1280`, `p.cases.notice.390`.
- **Routes:** `/p/[practiceId]/cases`, `/p/[practiceId]/settings/defaults`.
- **Evidence:** Cases renders 'Triage a run' (`apps/web/src/app/p/[practiceId]/cases/page.tsx:61`), 'Patterns waiting for a case' (:91), 'Materiality' with its form (:162) and the reference search (:189) before the Case list (:190-192, table :247). From the home's 'Deadlines in 14 days' link the one case due sits at about y 1,340 of 1,406 at 1280x800, and the table starts about 1,980 px down on a phone. The Materiality card duplicates Settings > Defaults, which sets the same thresholds with other words ('Save the thresholds' vs 'Save materiality') and today other figures (UX-002 (C-003)).
- **Rule:** Combined audit #125 ('Put the case list first'); `docs/product/PRD.md:277` (Cases: list by stage, payer, owner, deadline); `PRD.md:282` (Settings: materiality defaults)
- **Fix:** Lead Cases with the filtered list: heading, filters (with 'Find a packet by its reference' as a compact field beside them), then the table. 'Triage a run' and 'Patterns waiting for a case' follow below the list in a 'Set up and triage' section with their counts in the headings. Drop the Materiality form from Cases: show the current thresholds read-only with 'Change them in Settings' linking to Settings > Defaults, the one place they are set. A deep link with filters lands with the list in view.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 35 `co-001/ux-cases-list-first`.
- **Sources:** `flows-practice-12`, `narrow-practice-1-14`.
- **Verification:** confirmed
- **Notes:** Combined audit #125 places 'case lines and layout' in Lane A's PR 13 ('Database: no'). The reorder needs no migration, so Lane B takes it now under 'improve as you go' and tells Lane A, so Lane A's PR 13 keeps only audit #125's bulk case work. Land after PR #54 (`co-001/materiality-cents`), which changes both materiality forms. audit #125 does not name the duplicate form; this adds it.

### UX-126 (C-078). Packet review: after downloading both files the reviewer must reload by hand, and on a phone the instruction sits about 4,000 px below the links

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 2 routes, 2 roles.
- **Roles:** packet approver, operator.
- **Screens:** `p.packet-review.error-needs-downloads.390`, `p.packet-review.default.390`, `p.packet.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review`, `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** On `p.packet-review.error-needs-downloads.390` (5,765 px tall) the two download links and their 'You have not downloaded it yet.' lines sit near the top; 'Attest the export' is a disabled button about 4,000 px further down, with 'Download … under Exported files first … Then reload this page.' (`…/packet/[versionId]/review/page.tsx:308`). Nothing changes after a download: the per-file lines (`:114-130`) and the button come from the server render only. The packet builder's countdown ends 'now (reload the page)' (`components/packets/countdown.tsx:25`). Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step; no screen depends on a refresh the person must know to make); WCAG 2.1 3.3.2 Labels or Instructions
- **Fix:** Make the page follow the downloads. A small client component around Exported files refreshes the page (`router.refresh()`, through audit #48's `useGuardedRefresh`) when a download link is clicked and when the tab regains focus, so the per-file lines change to 'You downloaded it …' and the attestation becomes live with no reload; the server stays the judge (it re-reads the downloads). Put the requirement beside the links too: 'Download both files to attest. 1 of 2 downloaded.' The countdown refreshes when it reaches zero, so the approval control appears instead of 'reload the page'. Words taken under the co-founder's ruling.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/components/packets/countdown.tsx`, `apps/web/src/components/packets/download-watch.tsx` (new).
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 45 `co-001/ux-packet-words`.
- **Sources:** `narrow-practice-1-15`.
- **Verification:** confirmed
- **Notes:** The review page is a audit #38 screen and audit #48 changes its refreshes, but neither covers this state; land after audit #48 and use its guarded refresh so a background refresh never renews an unattended session.

### UX-127 (C-113). SOC 2 evidence shows unexpanded '%s' test titles ('answers %s as the persona matrix says'), on the page and in the export the auditor reads

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** platform administrator, security official, auditor (reader).
- **Screens:** `console.compliance.default.1280`, `console.compliance.error.1280`.
- **Routes:** `/console/compliance`.
- **Evidence:** Three evidence lines read 'gives %s of another practice nothing of this practice, and changes nothing of it', 'answers %s as the persona matrix says' and 'never makes the internal %s a member of the practice's group': they are `it.each` title templates used as the evidence's words (`packages/compliance/src/controls.ts:109`, :156, :339). The same titles go into the JSON export and to the compliance platform.
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); the brief's plain-language rule
- **Fix:** Give each evidence item two strings: the template the existence check matches (`test`) and the words a person reads (`shown`), rendered on the page and in the export: 'gives every persona of another practice nothing of this practice, and changes nothing of it (one test per persona)'; 'answers every persona as the persona matrix says (one test per persona)'; 'never makes an internal role a member of the practice's group (one test per role)'. UX-129 (C-055)'s placeholder rule then guards it.
- **Size:** S.
- **Files:** `packages/compliance/src/controls.ts`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/lib/routes/compliance.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 58 `co-001/ux-soc2-todo`.
- **Sources:** `words-other-09`.
- **Verification:** confirmed
- **Notes:** `packages/compliance` is not frozen. Lands with UX-068 (C-112). Words chosen under the co-founder's ruling (above).

### UX-128 (C-042). Setting up two-step verification on a computer means typing a 32-character key into a phone: no QR code and no copy button

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 2 routes, 1 roles.
- **Roles:** anyone signing in.
- **Screens:** `sign-in-enroll.default.1280`, `sign-in-enroll.error.1280`, `sign-in-new-password.default.1280`.
- **Routes:** `/sign-in/enroll`, `/sign-in/new-password`.
- **Evidence:** The enrolment card offers the setup key as grouped text ('X3UZ 3MDW …', 32 characters) and the link 'Open in an authenticator app on this device' (`apps/web/src/app/sign-in/enroll/page.tsx:25-31`). That link helps only when the authenticator is on the same device; a person enrolling at a desk with the app on a phone must read and type 32 characters, a transcription task, with no QR code (none exists anywhere in `apps/web/src`) and no copy button. Enrolment is mandatory before anything else, and with UX-012 (C-007)'s three-minute window it is the step most likely to fail. The invited person is never told how many steps remain. Confirmed at 4d99df8.
- **Rule:** WCAG 2.2 3.3.8 Accessible Authentication (Minimum) (AA, adopted by combined audit #103): no step may require a cognitive function test such as transcription without a mechanism to help
- **Fix:** Show a QR code of the otpauth URI beside the key, rendered on the server as an inline SVG by a vetted, pinned QR library (no script, no third-party request; the page stays under the CSP; the secret never leaves the response it is already in and is never logged), with the alternative text 'QR code for your authenticator app. The setup key below is the same.' Keep the grouped key as text, add a 'Copy the setup key' button that copies it without spaces and says 'Copied' in a polite status, and keep the same-device link. Add a one-line step marker on the invited person's path: 'Step 1 of 2: choose a password' and 'Step 2 of 2: set up two-step verification'.
- **Size:** S.
- **Files:** `apps/web/src/app/sign-in/enroll/page.tsx`, `apps/web/src/app/sign-in/new-password/page.tsx`, `apps/web/src/components/copy-button.tsx` (new), `apps/web/package.json`, `pnpm-lock.yaml`.
- **Migration:** no.
- **#42:** yes: `apps/web/package.json`, `pnpm-lock.yaml` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 6 `co-001/ux-sign-in-time` (the step marker on the invited path); UX PR 20 `co-001/ux-sha256` (the copy button only); UX PR 86 `co-001/ux-enrol-qr` (the QR code and its dependency).
- **Sources:** `a11y-other-06`, `flows-other-18`.
- **Verification:** confirmed
- **Notes:** The new dependency changes `apps/web/package.json` (and the lockfile), both in #42's list, so this lands after #42 merges and goes through ci-deps' licence and age checks; the copy button (with the enrolment page, `apps/web/src/app/sign-in/enroll/page.tsx`, not a #42 file) and the step marker land first. Words taken under the co-founder's ruling. The copy button is the same component UX-075 (C-016) needs.

### UX-129 (C-055). The copy lint holds only CO-11's forbidden words: it does not read several files whose words the screens show, and has no rule for raw keys, placeholders, build references, codes, plurals after counts, '$' before a cents string or straight apostrophes

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 2 routes, 1 roles.
- **Roles:** every reader of the product's words (a guard, not a screen).
- **Screens:** `p.notifications.default.1280`, `p.defaults.default.1280`, `p.agreements.empty.1280`, `p.claims.default.1280`, `console.compliance.default.1280`, `console.billing.error.1280`, `p.plan.error.1280`.
- **Routes:** `/p/[practiceId]/**`, `/console/**`.
- **Evidence:** `tools/brand-copy/scan.ts:20-35` lists what it fails on: ProofPack, AI, intelligence, 'independent verification platform', an unlabelled 'recovered', the screening's owed/underpaid/recovered and the brand's words typed out (`FORBIDDEN_TERMS` :115, `SCREENING_TERMS` :123, `BRAND_WORDS` :130). `COPY_ROOTS` and `COPY_FILES` (:51-77) leave out `packages/db/src/authz/permissions.ts` (every permission state's reason), `packages/compliance/src/controls.ts` (the evidence titles) and `apps/worker/src/billing/account.ts` (the console billing refusal). So every fault class this review found passes: '1 cases' (UX-115 (C-054)), a key before a colon (UX-011 (C-002)), straight apostrophes (UX-168 (C-149)), '(milestone 12)', 'golden question Q34', '(PRD 16)' (UX-101 (C-053)), 'NO_AGREEMENT' (UX-110 (C-051)) and '$' typed before a cents string (`apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx:40`). CO-11's own required words hold on every screen reviewed.
- **Rule:** CO-11 acceptance (`docs/product/change-order-001.md`: a copy lint); ADR 0058 (words held by checks)
- **Fix:** Read the three files (add them to `COPY_FILES`) and add rules, each with a `scan.test.ts` case and the existing `brand-copy-exempt:` comment: plural-after-count (an expression or placeholder followed by lines, cases, claims, entries, files, days, payers, records, patients, unless built by `counted()`); straight-quote (a straight ' between letters, or a straight " in read text); build-reference (milestone N, golden question, Qnn, (AAA-nn), level Ln, (PRD|ADR|audit) N); code-in-copy (a capitals token with an underscore); dollar-literal ('$' immediately before a placeholder: money goes through `<Money>` or `formatUsd`); placeholder (%s, %d); camel-key (a camelCase token and a colon in read text). Pair the runtime cases with a test that renders a refusal for each route's schema keys and asserts no key text appears. Land each rule in the same PR as the fixes it guards, so `pnpm lint:copy` stays green.
- **Size:** M.
- **Files:** `tools/brand-copy/scan.ts`, `tools/brand-copy/scan.test.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 31 `co-001/ux-copy-lint`.
- **Sources:** `words-practice-56`, `words-other-23`.
- **Verification:** confirmed
- **Notes:** The two members agree; their rule lists are merged. A render-level check for codes in dynamic values (which a source lint cannot see) is PR #52's own proposal and joins this. The refusal-render test belongs with `co-001/ux-forms` (forms name the refused field), which is in flight; the lint rules do not.

### UX-130 (C-093). The packet's live check names a wrong figure in the verifier's terms ('a figure that is not in the packet's input records (amount) 1234.56') but not what to do

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.packet.error-live-check.1280`, `p.packet.error-live-check.390`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** 'Live check: 1 mismatch' then 'Sentence 4: a figure that is not in the packet's input records (amount) 1234.56', from `apps/web/src/lib/packets/view.ts:11` and `mismatchText` (:57-60). It gives no next step and no consequence, the figure prints without money formatting, and 'Save as a new version' stays enabled.
- **Rule:** `docs/product/PRD.md:256` (every error with a next step); PRD 12 (a narrative figure not in the input blocks approval)
- **Fix:** State the fix and the consequence for each mismatch code: 'Sentence 4: $1,234.56 is not one of this packet's figures. Use an amount from the line schedule or the contract citation, or remove it; a version with this sentence cannot be approved.'; 'sentence_without_citation' -> 'Sentence 2 cites no numbered source: add one, such as [3] for the line schedule.' The figure is formatted by the shared money formatter from the verifier's parsed amount.
- **Size:** S.
- **Files:** `apps/web/src/lib/packets/view.ts`, `apps/web/src/components/packets/version-form.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 45 `co-001/ux-packet-words`.
- **Sources:** `words-practice-22`.
- **Verification:** confirmed
- **Notes:** Not in audit #38's design (figures in the worksheet) or audit #48's (the narrative draft surviving sign-out), though audit #48 changes the narrative editor on this page: land after the narrative-draft PR, or offer it to that PR's fix round. Words chosen under the co-founder's ruling (above).

### UX-131 (C-114). An audit request that came from a screening arrives in the console without the screening, so the operator prepares the scoping call blind

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** platform operator, platform administrator.
- **Screens:** `console.prospects.default.1280`, `console.prospects.all.1280`, `screening-result.converted.1280`.
- **Routes:** `/console/prospects`.
- **Evidence:** The prospect list reads `prospect_request` alone (`apps/web/src/lib/routes/console-onboarding.ts:91-92`) and shows organization, contact, locations, payers, billing, received and status (`apps/web/src/app/console/prospects/page.tsx:53-60`). SYNTHETIC SCREENING CLINIC came from a screening whose kept summary is linked to the request (`screening_lead.prospect_request_id`, `packages/db/migrations/20261104090000_free_screening.sql:773`), and the prospect was told it is kept 'with your request', yet its row looks exactly like a form-only request: no source mark, no screened totals, no share needing a contract, no anomaly count, no referring firm. The app role reads no `screening_lead` today.
- **Rule:** `docs/product/PRD.md:260` (each screen shows what its role needs to act); `docs/product/legal-surfaces.md` screening-kept-convert (the summary is kept with the request for this purpose); no written rule on the console view; recommended
- **Fix:** Show each request's source and context: a 'From a screening' or 'From the form' label; for a screening, a row detail with the kept summary (screened date and release, totals by payer product, the share needing a contract, anomaly rows) with the heard-from and referring firm; state and ZIP when given; sort and filter by source. Read it through a console function that returns only what the request keeps (counts and totals, never rows), with an audit event on open.
- **Size:** M.
- **Files:** `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/lib/routes/console-onboarding.ts`.
- **Migration:** yes, for Lane A: A SECURITY DEFINER console read function over `screening_lead` (and its grant to the console's role) that returns only the kept summary's counts and totals for a request: Lane A.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 88 `co-001/ux-prospect-context`.
- **Sources:** `flows-other-22`.
- **Verification:** confirmed
- **Notes:** No PHI: the screening holds totals only. The Lane B part (the page) waits on Lane A's function; the source label alone could land first if the request records its source, otherwise it waits too. Words chosen under the co-founder's ruling (above).

### UX-132 (C-061). The screening result shows a prospect the raw reason code ENGINE_ERROR, and 'the engine', for a place of service the screening does not price

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.1280`, `screening-result.converted.1280`, `screening-result.error-name.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** The coverage table's Reason cell prints the code in mono above its words (`apps/web/src/components/screening/coverage.tsx:90-91`): 'ENGINE_ERROR' over 'The place of service is not in the approved place-of-service split' (`apps/web/src/lib/screening/labels.ts:175`, an internal setting's name). ENGINE_ERROR's meaning in the closed list is 'Unexpected input' with the remedy 'Operator alert', so a prospect deciding whether to trust PaidWhole reads that the product broke. The result's words also say 'Medicare rows the engine left without a price ...' (`apps/web/src/components/screening/result-summary.tsx:267`) and 'The engine left the row without a price, for the reason shown.' (`labels.ts:164`).
- **Rule:** `docs/product/unpriced-reasons.md` (a reason is shown with its meaning); `docs/brand/BRAND.md:23`; the brief's plain-language rule
- **Fix:** On the public result show the reason in words only (the code kept in `data-reason` and in the CSV), and say 'PaidWhole', not 'the engine': 'ENGINE_ERROR / The place of service is not in the approved place-of-service split' -> 'This place of service is in neither the facility nor the non-facility list a screening prices by, so the row has no Medicare figure.'; 'Medicare rows the engine left without a price, or whose rates change inside the quarter; the reasons are under coverage below.' -> 'Medicare rows PaidWhole could not price, or whose rate changes inside the quarter. Coverage, below, gives each reason.'; 'The engine left the row without a price, for the reason shown.' -> 'PaidWhole could not price the row, for the reason shown.' Customers' screens keep code and words.
- **Size:** S.
- **Files:** `apps/web/src/components/screening/coverage.tsx`, `apps/web/src/lib/screening/labels.ts`, `apps/web/src/components/screening/result-summary.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 4 `co-001/ux-screening-result-tables`.
- **Sources:** `flows-other-25`, `words-other-11`.
- **Verification:** confirmed
- **Notes:** Severity: should_fix (words-other-11) over polish (flows-other-25): the code tells a prospect the product failed. Whether a place of service outside the split should carry ENGINE_ERROR at all is an engine question under the freeze; this changes only what the page shows. None of the three files is in #42 (`lib/screening/labels.ts` is not on its list). The copy lint's screening rules apply to the new words (no owed, underpaid, recovered). Words chosen under the co-founder's ruling (above).

### UX-133 (C-064). A support grant's 'Records read' is about 80 unpaged, ungrouped rows of full UUIDs and code names (7,660 px at 390), with no way back

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** practice administrator.
- **Screens:** `p.support-access.default.1280`, `p.support-access.default.390`, `p.support-access.ended.1280`, `p.home.support-access.1280`.
- **Routes:** `/p/[practiceId]/support-access/[supportGrantId]`.
- **Evidence:** The page prints every read under the grant in one table (`apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx:36-60`; the query has no limit, `apps/web/src/lib/routes/practice.ts:196-199`): record type as a key ('contract_version'), the record as a full UUID in mono, purpose as a key ('rate_record_review'). On SYN-CON-E2E about 80 rows repeat the same four records (2,828 px at 1280, 7,660 px at 390). Nothing is linked or grouped, and there is no link back to the home or the access log.
- **Rule:** `docs/product/PRD.md:256` (every list paginated and filterable server-side); `PRD.md:251` (the practice-visible access report); `PRD.md:298` (support grants with expiry and reads)
- **Fix:** Group by record by default: one row per record with its kind in words (UX-100 (C-017)'s labels), a name the role may see (the contract's title and 'version 1', the document's kind and short id), the purposes in words, the count and first and last read, linked to the record. Keep the raw reads behind 'Every read', paged with the shared `Pager` (`components/remittances/display.tsx:94`). Add links back to the practice home and to the access log filtered to this grant.
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/lib/routes/practice.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`, `apps/web/src/lib/routes/practice.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 76 `co-001/ux-support-access`.
- **Sources:** `flows-practice-25`, `narrow-practice-2-15`.
- **Verification:** confirmed
- **Notes:** Both files are #42's: lands after #42 merges, together with UX-100 (C-017)'s support-access labels and UX-199 (C-151) (the page's way back and rail item), which change the same page.

### UX-134 (C-115). The screening result buries its answer and its next step: no summary at the top, the audit request at the foot of a 4,500 px page, and the confirmation where the person no longer is

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.1280`, `screening-result.converted.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** The page runs heading, a ten-line retention paragraph (`apps/web/src/components/screening/result-summary.tsx:138-152`), the totals, left-out rows, quarters, the Medicare-priced figures, contract-only dollars, anomalies, coverage, top rows, and only then 'Ask for a PaidWhole audit' (`apps/web/src/components/screening/result-view.tsx:23-29`), about 4,000 px down. The two facts that answer 'why an audit' ($7,321.09 of $11,716.59 cannot be priced without a contract; 1 group of 4 is an anomaly) sit in the fifth card. Submitting redirects to `?requested=1` with no anchor (`apps/web/src/lib/screening/routes.ts:1219`), the page reloads at its top, and 'Audit request received' replaces the form at the foot (`components/screening/convert-form.tsx:37-44`), so the person sees no sign it went through. The earlier tour's 1280 clipping of the anomalies badges and top rows' Difference column is still present.
- **Rule:** `docs/product/PRD.md:256` (every action shows its result and a next step); CO-11 (the screening never says owed, underpaid or recovered); no written rule on page order; recommended
- **Fix:** Lead with what the screening found: under the heading, three lines from the page's own figures (the share of allowed dollars priced under Medicare; the share, with dollars, that cannot be priced without a contract; how many groups are anomalies, investigatory, below their lowest Medicare figure by more than $5 a claim line), then one primary button 'Ask for an audit of the rows a contract prices' that jumps to the form. After a request, redirect to `#screening-convert` and show the confirmation at the top as well as in place of the form. The retention paragraph's placement follows the founder's answer to UX-122 (C-102).
- **Size:** M.
- **Files:** `apps/web/src/components/screening/result-view.tsx`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/components/screening/convert-form.tsx`, `apps/web/src/lib/screening/routes.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/screening/routes.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 63 `co-001/ux-screening-result-first` (the reorder and the summary (no redirect anchor)); UX PR 85 `co-001/ux-screening-messages` (the redirect's anchor).
- **Sources:** `flows-other-14`.
- **Verification:** confirmed
- **Notes:** The summary's words pass the screening copy lint. Only the redirect's anchor touches `lib/screening/routes.ts`, a #42 file: the reorder lands now, the anchor after #42 merges. The kept notice is a legal surface: moving it is UX-122 (C-102)'s founder question, not taken here. The earlier tour's clipping is writer A's table cluster. Words chosen under the co-founder's ruling (above).

### UX-135 (C-116). The screening asks for the practice's details before it says what file to make, and its 'sent' state repeats the file guide instead of the next step

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening.default.1280`, `screening.file-ready.1280`, `screening.sent-waiting.1280`, `screening.sent-minutes.1280`, `screening.sent-soon.1280`, `screening.sent-sent.1280`.
- **Routes:** `/screening`.
- **Evidence:** A prospect's real work is making a file of totals, but the page opens with 'About your practice' (name, state, ZIP, a work email whose 12 px hint runs to nine lines of retention terms, `apps/web/src/components/screening/upload-form.tsx:181-182`), then the file and 'Screen the file', and only below the button 'What the file holds' and 'What each payer product gets' (`apps/web/src/app/screening/page.tsx:68-118`). After sending, the form becomes one 'Check your email' paragraph whose first sentence is the only instruction (`page.tsx:42-55`), the reference cards stay below, and the only action is 'start again', which replaces the screening just sent.
- **Rule:** `docs/product/PRD.md:256` (every step shows its next step); no written rule on the screening's order; recommended
- **Fix:** Order the page as the task runs: (1) a three-step outline ('Make a file of totals (download the template); check it here: nothing leaves your browser until you send; get the result by email'); (2) 'What the file holds' and the template before the form, collapsed to its first lines with 'Show every column'; (3) the file chooser and its checks; (4) the practice and email last, beside 'Screen the file'. The sent state states the wait and offers next steps ('While you wait: request an audit'; 'Did not arrive? Check spam, then send again'), naming 'the work email you gave' (never the address in a URL); the reference cards drop away. The retention text's placement follows the founder's answer to UX-122 (C-102).
- **Size:** M.
- **Files:** `apps/web/src/app/screening/page.tsx`, `apps/web/src/components/screening/upload-form.tsx`, `apps/web/src/lib/screening/sent.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/screening/page.tsx`, `apps/web/src/components/screening/upload-form.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 84 `co-001/ux-screening-upload-page`.
- **Sources:** `flows-other-15`.
- **Verification:** confirmed
- **Notes:** `screening/page.tsx` and `upload-form.tsx` are #42 files: after #42 merges. The kept-notice text and placement are UX-122 (C-102)'s founder question; this leaves their words alone. Words chosen under the co-founder's ruling (above).

### UX-136 (C-121). The closed screening link buries its useful advice (copy the whole link; it may still be pricing) after a 13-line retention paragraph

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.not-found.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** The page leads with the kept paragraph and only then says 'A link may also be one whose screening is still being priced: the email with the link is sent once it is ready. Check that the whole link was copied.' (`apps/web/src/app/screening/results/[resultId]/not-found.tsx:20-25`). Someone who clicked too early or copied half a link reads 13 lines before either step.
- **Rule:** `docs/product/PRD.md:256` and PRD 7 (an error state with a next step)
- **Fix:** Change the non-legal sentences in place, without moving the kept paragraph: 'Check that you copied the whole link from the email. If you sent your file only a few minutes ago, the screening may still be pricing: the email with its link comes once the result is ready.' Whether the next steps then move ahead of the kept paragraph is the founder's, in F4 (6.2), before counsel.
- **Size:** S.
- **Files:** `apps/web/src/app/screening/results/[resultId]/not-found.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 63 `co-001/ux-screening-result-first` (the non-legal sentences, in place (the kept paragraph does not move: F4)); UX PR 89 `co-001/ux-screening-kept-notices` (the closed link's order (F4)).
- **Sources:** `words-other-16`.
- **Verification:** confirmed
- **Notes:** The kept paragraph is the legal surface `screening-kept-closed-link` (`docs/product/legal-surfaces.md:20`; counsel, with decisions 7 and 17), on `HANDOFF.md`'s counsel list. Moving it from first to third is a reshaping, which F4 reserves for the founder, as UX-134's and UX-135's Notes do for the other kept notices. Corrected on review: the earlier Notes called the move 'not the founder's' because the span's words were kept. The rewording of the non-legal sentences is chosen under the co-founder's ruling.

### UX-137 (C-135). Filtered to one record, the access log never says which record, and every row's Record link points back to the page itself

- **Severity:** should fix. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** practice administrator.
- **Screens:** `p.access-log.record-filter.390`, `p.access-log.record-filter.1280`.
- **Routes:** `/p/[practiceId]/settings/access-log`.
- **Evidence:** After a row's Record link, the page reads only 'Who acted on one case record. Show everything' (`apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx:34`) over 31 rows whose Record cell is the same underlined 'case', each linking to this same filtered URL (:73). The route returns only the type and id (`apps/web/src/lib/routes/settings.ts:832`), so nothing names the case or links to it.
- **Rule:** `docs/product/PRD.md:251` (who read claim X); WCAG 2.1 SC 2.4.4 (31 identical links to the current page); `PRD.md:260`
- **Fix:** The route names the filtered record with a non-PHI label through one small labeller per object type, reading each kind's own table under the practice's RLS: case -> 'the case SYNTHETIC PAYER Q, plan SYNPLAN-FIX-ONE'; packet version -> 'packet version 3 of that case'; contract version -> 'version 1 of SYNTHETIC PAYER C AGREEMENT'; a claim or line -> 'a claim line (ID 2ebf2bbe)', never a patient, claim number or date. The lede reads 'Who acted on the case SYNTHETIC PAYER Q, plan SYNPLAN-FIX-ONE: 31 entries, newest first.' with 'Open the case' (for roles that may) and 'Show everything'. The filtered view drops the Record column; the full view names each link by its record ('Reads of this case').
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/lib/routes/settings.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 77 `co-001/ux-access-log`.
- **Sources:** `retake-04`.
- **Verification:** confirmed
- **Notes:** `lib/routes/settings.ts` is a #42 file: after #42 merges, in one access-log PR with UX-071 (C-134) and UX-100 (C-017)'s labels. No DDL: the labeller reads under RLS in the handler. Words chosen under the co-founder's ruling (above).

### UX-138 (C-167). Units print as '1.000' and '2.000' on Claims and lines, '2' on the case and packet, and with 'x' on one page and '×' on another

- **Severity:** polish. Harm area: money or status. Reach: 4 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.claims.default.1280`, `p.claims.error.1280`, `p.case.default.1280`, `p.packet.default.1280`, `p.compare.default.1280`.
- **Routes:** `/p/[practiceId]/claims`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/pricing-runs/compare`.
- **Evidence:** Claims and lines prints the numeric column's text as is ('1.000', '2.000': `apps/web/src/lib/remittances/queries.ts:574` `l.units::text`, shown at `apps/web/src/app/p/[practiceId]/claims/page.tsx:190`). The case page writes '97110 x 2' with a letter x (`cases/[caseId]/page.tsx:167`), the packet's schedule '2', and Compare '97110 × 1' (`apps/web/src/components/pricing/diff.tsx:134`).
- **Rule:** `docs/brand/BRAND.md:94` (every unit count in the mono font, tabular); no written rule on the noun; recommended (the brief's goal: one product)
- **Fix:** One units formatter beside `counted()` in `apps/web/src/lib/copy/words.ts`, working on the numeric text (never a float): whole units without decimals ('1.000' -> '1'), fractional units to the decimals the 835 sent ('1.5'), and '×' as the multiplication sign everywhere ('97110 x 2' -> '97110 × 2'). Use it on Claims and lines, the case, the packet, the anomalies table and Compare.
- **Size:** S.
- **Files:** `apps/web/src/lib/copy/words.ts`, `apps/web/src/app/p/[practiceId]/claims/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/components/packets/display.tsx`, `apps/web/src/components/pricing/diff.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 30 `co-001/ux-counts-and-units`.
- **Sources:** `words-practice-46`.
- **Verification:** confirmed
- **Notes:** PR #52 changes `words.ts` and `components/packets/display.tsx`, PR #51 the case page: the one merged second keeps both. Style chosen under the co-founder's ruling: whole units without decimals, '×'.

### UX-139 (C-179). Coverage and Mapping state empty facts on a practice with no lines ('0 of 0 lines (0%)', 'every line counts as unpriced', 'Pricing can run', 'Every line has a mapping'), and shares print '0%' here but '0.0%' elsewhere

- **Severity:** polish. Harm area: money or status. Reach: 2 routes, 2 roles.
- **Roles:** practice administrator, billing manager.
- **Screens:** `p.coverage.empty.1280`, `p.mapping.empty.1280`, `p.mapping.default.1280`.
- **Routes:** `/p/[practiceId]/coverage`, `/p/[practiceId]/mapping`.
- **Evidence:** On a seeded practice with no lines: 'Priced: 0 of 0 lines (0%); $0.00 of $0.00 billed (0%)' (`apps/web/src/components/coverage/share.tsx:22-23`), 'No pricing run has priced this practice's lines yet, so every line counts as unpriced.' and the alert 'Pricing can run / Every plan with lines has a mapping.' (`apps/web/src/app/p/[practiceId]/coverage/page.tsx:119`, :144-145); Mapping '0 lines on 0 claims ... Every line has a mapping on its service date.' Shares read '0%' here and '0.0%' or '100.0%' on runs and the digest.
- **Rule:** `docs/product/PRD.md:260` (every screen has an empty state that says what to do next); `docs/brand/BRAND.md:23` ('exact')
- **Fix:** When the practice holds no lines, one empty state replaces the figures: 'No lines yet' with 'Coverage counts start once 835 files load and a pricing run prices them.' and 'Go to Uploads' (for roles that can upload; otherwise who does); hide 'Pricing can run' and the mapping sentence. Format every share with one helper at one decimal ('0.0%', '8.6%', '100.0%'). 'Every plan with lines has a mapping on their service dates' -> '... for its service dates'.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/coverage/page.tsx`, `apps/web/src/components/coverage/share.tsx`, `apps/web/src/app/p/[practiceId]/mapping/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 26 `co-001/ux-empty-states`.
- **Sources:** `words-practice-31`.
- **Verification:** confirmed
- **Notes:** PR #49 changes Coverage, and audit #32 (designing) changes Coverage and Mapping: land after PR #49 and offer the empty state to audit #32's design. Words chosen under the co-founder's ruling (above).

### UX-140 (C-183). The empty practice home says uploads open 'once the agreement chain below is on file' while Uploads is already open (it waits on the BAA alone)

- **Severity:** polish. Harm area: money or status. Reach: 2 routes, 2 roles.
- **Roles:** practice administrator, billing manager.
- **Screens:** `p.home.empty.1280`, `p.uploads.empty.1280`, `p.agreements.default.1280`.
- **Routes:** `/p/[practiceId]`, `/p/[practiceId]/uploads`.
- **Evidence:** On NORTH (BAA and engagement letter on file, two agreements missing) the home's empty state ends '... Uploads open once the agreement chain below is on file.' beside 'Go to Uploads' (`apps/web/src/app/p/[practiceId]/page.tsx:186`), while Uploads shows an open drop zone: uploads wait on the BAA alone (`apps/web/src/lib/routes/uploads.ts:110`, `baaOnFile`), and the home's table lists only signed documents, so 'the agreement chain below' is neither the gate nor what Settings calls the chain.
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); `docs/product/PRD.md:260` (an empty state that says what to do next)
- **Fix:** Choose the sentence from the gate, read from the agreements the page already holds: BAA on file -> 'Upload your first 835 files. Each file's receipt follows it from received to loaded, and this page counts what it finds.' with 'Go to Uploads'; BAA missing -> 'Uploads open once the business associate agreement is on file. A platform administrator records it.' with no Uploads link. UX-119 (C-129) adds who uploads when the viewer cannot.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 9 `co-001/ux-home-figures`.
- **Sources:** `words-practice-45`.
- **Verification:** corrected: the page already receives the agreements with their kinds (`page.tsx:155`, `AGREEMENT_NAMES` at :34-36), so `lib/routes/practice.ts` (a #42 file) need not change and the fix touches no #42 file
- **Notes:** PR #51 changes the home page: land after it. Words chosen under the co-founder's ruling (above).

### UX-141 (C-206). Data freshness's 'Last run' shows whatever job ran last (an ROI statement), not when the practice's lines were last priced

- **Severity:** polish. Harm area: money or status. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.home.default.1280`, `p.home.tiles.1280`.
- **Routes:** `/p/[practiceId]`.
- **Evidence:** `freshness()` takes the newest `job_run` of any type (`apps/web/src/lib/routes/practice.ts:108`, `ORDER BY started_at DESC, id DESC LIMIT 1`). On LEDGER the card reads 'Last run: ROI statement, 2026-10-26 01:27 UTC: Succeeded'; on PACKETS 'Monitoring of new files'. A billing manager reading 'Data freshness' wants which service months are priced and when pricing last ran; a statement print says nothing about that.
- **Rule:** `docs/product/PRD.md:267` (Practice dashboard: data freshness (last file, last run), last run status)
- **Fix:** Show the last pricing run explicitly ('Last priced: service 2026-07-01 to 2026-07-31, complete 2026-10-26 01:27 UTC', linked to the run), the last monitoring pass, and the latest service month with loaded lines; 'Last job' with its status becomes a secondary line; the failed-run banner stays.
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/practice.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/practice.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 82 `co-001/ux-home-by-role`.
- **Sources:** `flows-practice-28`.
- **Verification:** confirmed
- **Notes:** `lib/routes/practice.ts` is a #42 file: after #42 merges, with UX-119 (C-129) (the home by role). Words chosen under the co-founder's ruling (above).

### UX-142 (C-189). The console's billing table heads unpaid invoices 'Owed', the brand's word for what a payer owes a practice

- **Severity:** polish. Harm area: money or status. Reach: 1 routes, 1 roles.
- **Roles:** platform administrator.
- **Screens:** `console.billing.default.1280`, `console.billing.error.1280`.
- **Routes:** `/console/billing`.
- **Evidence:** Column 'Owed' (`apps/web/src/app/console/billing/page.tsx:46`). In PaidWhole's words 'owed' is what a payer owes a practice (the tagline, `docs/brand/BRAND.md:26`); here it is what a customer owes PaidWhole.
- **Rule:** `docs/brand/BRAND.md:26` (the tagline's 'owed'); no written rule beyond it; recommended (the brief's goal: one product)
- **Fix:** 'Owed' -> 'Unpaid invoices'.
- **Size:** S.
- **Files:** `apps/web/src/app/console/billing/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 57 `co-001/ux-console-records`.
- **Sources:** `words-other-40`.
- **Verification:** confirmed
- **Notes:** Words chosen under the co-founder's ruling (above).

### UX-143 (C-162). 'Revoke device' ends another browser's sessions on one click, between two cards both called 'Chrome on Windows'

- **Severity:** polish. Harm area: data or work. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `account.devices.default.1280`, `account.devices.internal-shell.1280`.
- **Routes:** `/account/devices`.
- **Evidence:** Each device card has a one-click outline button, 'Revoke device' or 'Revoke this device and sign out' (`apps/web/src/app/account/devices/page.tsx:44-50`), with no confirmation. The two cards the practice administrator sees are both titled 'Chrome on Windows' and differ only in first-seen and last-seen times, so the person picks the one to revoke by comparing timestamps. The title is the browser label, rewritten from the user agent at every sign-in (`apps/web/src/lib/auth/sessions.ts:47,70`), so it cannot hold a name the person gives. Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:302` (every destructive action, revoke named, confirms with the consequence stated)
- **Fix:** Confirm in place, stating the consequence (taken under the co-founder's ruling): 'Revoke Chrome on Windows, last used 2026-10-26 01:25 UTC? Its 1 open session ends now, and it must sign in again with a code.' Order devices by last use with 'This device' first and labelled so. Let the person name a device ('Office PC'), shown beside the browser label, so two of the same browser can be told apart.
- **Size:** S.
- **Files:** `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/lib/routes/account.ts`, `apps/web/src/lib/auth/sessions.ts`.
- **Migration:** yes, for Lane A: Add `name text` (nullable, length-checked, at most 60 characters) to `user_device`, with `GRANT UPDATE (name) ON user_device TO tp_app` under the existing self policy, for the person-given device name; the browser `label` keeps being rewritten at sign-in. Only the naming part needs it; the confirmation and order land in Lane B without it.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 60 `co-001/ux-account-pages` (the confirmation and the order).
- **Sources:** `flows-other-29`.
- **Verification:** corrected: the member assumed naming could write `user_device.label`; the label is rewritten from the user agent at every sign-in (`auth/sessions.ts:70`), so a kept name needs its own column (a migration)
- **Notes:** The naming part goes to Lane A under 'Handed to Lane A'; Lane B lands the confirmation and ordering first.

### UX-144 (C-159). Page titles do not name the record, so moving between two cases, packets or versions announces nothing

- **Severity:** polish. Harm area: accessibility. Reach: 6 routes, 4 roles.
- **Roles:** billing manager, packet approver, practice administrator, operator.
- **Screens:** `p.case.default.1280`, `p.packet.default.1280`, `p.contract-version.default.1280`, `p.plan.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/contracts/versions/[versionId]`, `/p/[practiceId]/contracts/[contractId]`, `/p/[practiceId]/mapping/[planId]`, `/p/[practiceId]/lines/[lineId]`.
- **Evidence:** Titles are fixed per route: 'Case' (`p/[practiceId]/cases/[caseId]/page.tsx:22`), 'Line trace' (`lines/[lineId]/page.tsx:15`), 'Packet builder', 'Rate record review', 'Plan mapping', 'Contract'. Two tabs on two cases read the same, and Next's route announcer, which speaks only a changed `document.title`, is silent when the person opens another version or plan. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 2.4.2 Page Titled (titles describe the page's topic)
- **Fix:** `generateMetadata` per record from facts the page already loads that are not PHI (payer, plan, contract and version names; a procedure code): 'SYNTHETIC PAYER Q, CE:SYNPLAN-FIX-ONE: case', 'Packet version 3: SYNTHETIC PAYER Q', 'Version 1 of SYNTHETIC PAYER C AGREEMENT', 'Line trace: 97110'. Never a patient, member ID, claim number or service date (`CLAUDE.md`'s never-list); a unit test fails on a title holding any field from the PHI list.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/versions/[versionId]/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 52 `co-001/ux-a11y-names`.
- **Sources:** `a11y-practice-1-27`.
- **Verification:** confirmed
- **Notes:** UX-158 (C-144) splits the visible h1; the document title keeps both names. PR #51 changes the case page; the packet and line-trace pages are audit #38's: coordinate.

### UX-145 (C-145). Some data tables have no header cells at all (the status components, compliance policies, the rate record's fields)

- **Severity:** polish. Harm area: accessibility. Reach: 5 routes, 3 roles.
- **Roles:** operator, practice administrator, screening prospect.
- **Screens:** `status.default.1280`, `console.status.default.1280`, `console.compliance.default.1280`, `p.contract-version.default.1280`, `p.abstraction-version.default.1280`.
- **Routes:** `/status`, `/console/status`, `/console/compliance`, `/p/[practiceId]/contracts/versions/[versionId]`, `/p/[practiceId]/abstraction/versions/[versionId]`.
- **Evidence:** The public Components table (`apps/web/src/app/status/page.tsx:34-35`), the console Components table (`console/status/page.tsx:60-61`) and the compliance Policies table (`console/compliance/page.tsx:159-160`) have a `<tbody>` and no `<th>` at all, so a screen reader cannot announce 'Status' or 'Version' with a cell, and axe treats them as layout tables. The rate record's Fields table has a row header per field but no header row (`components/contracts/review.tsx:241-265`), so the value, approval and Approve columns are read with no name. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships (A)
- **Fix:** Give each table a header row, visually hidden where the design shows none (`<thead className="sr-only">`): Components 'Component', 'Status'; Policies 'Policy', 'Version', 'Path'; Fields 'Field', 'As abstracted', 'Approval', and 'Approve' when the specialist's controls show. Make each row's first cell `<th scope="row">` (UX-073 (C-028)'s pattern).
- **Size:** S.
- **Files:** `apps/web/src/app/status/page.tsx`, `apps/web/src/app/console/status/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`, `apps/web/src/components/contracts/review.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 25 `co-001/ux-row-headers`.
- **Sources:** `a11y-other-21`, `a11y-practice-1-22`.
- **Verification:** confirmed
- **Notes:** The agreement forms with repeated labels and the notification checkboxes with no group (the rest of a11y-other-21) are UX-146 (C-155). Lands with UX-073 (C-028) (row headers).

### UX-146 (C-155). Related controls are not grouped: the attestation checkboxes, the pursuit-cost fields, the notification checkboxes and the two agreement forms

- **Severity:** polish. Harm area: accessibility. Reach: 4 routes, 4 roles.
- **Roles:** packet approver, billing manager, practice administrator, operator.
- **Screens:** `p.report-review.default.1280`, `p.defaults.default.1280`, `p.defaults.error.1280`, `account.notifications.default.1280`, `console.organization.default.1280`.
- **Routes:** `/p/[practiceId]/reports/[reportId]/review`, `/p/[practiceId]/settings/defaults`, `/account/notifications`, `/console/organizations/[organizationId]`.
- **Evidence:** The checklist's six required checkboxes and the attestation sentence have no fieldset or legend (`p/[practiceId]/reports/[reportId]/review/page.tsx:108-114`). The pursuit cost's rule 'All three together, or all blank to clear.' is the first field's hint only (`settings/defaults/page.tsx:70-72`), so it is heard on the staff rate and never on the two minute fields. The notification checkboxes sit under 'What reaches you' with no fieldset (`account/notifications/page.tsx:42-50`). On the console organization page the 'Record agreement' form has no heading of its own and the upload form below repeats Kind, Practice, Version, Signer and Signed on (`console/organizations/[organizationId]/page.tsx:265-293`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships (A) and 3.3.2 Labels or Instructions (A)
- **Fix:** Wrap each set in a `<fieldset>` whose `<legend>` carries its rule (taken under the co-founder's ruling): 'Confirm every item before you sign' (the attestation sentence as its description); 'Pursuit cost: all three together, or all blank to clear'; 'What reaches you'. Give the two agreement forms headings, 'Record a signed agreement' and 'Or upload the signed PDF', and name each form by `aria-labelledby` to its heading. The console status form's 'Components affected' fieldset (`console/status/page.tsx:115-122`) is the pattern.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/defaults/page.tsx`, `apps/web/src/app/account/notifications/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 52 `co-001/ux-a11y-names`.
- **Sources:** `a11y-practice-2-16`.
- **Verification:** confirmed
- **Notes:** Also takes a11y-other-21's notification and agreement-form parts (UX-145 (C-145) takes its tables). The defaults form is being changed by `co-001/materiality-cents` (in design; it owns the cents-as-dollars defect on the same form): fold the pursuit-cost fieldset into that PR if it has not merged.

### UX-147 (C-154). The rail is a complementary landmark ('aside' named 'Navigation') holding three navigation landmarks

- **Severity:** polish. Harm area: accessibility. Reach: 1 routes, 5 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator.
- **Screens:** `p.home.default.1280`, `p.abstraction.default.1280`.
- **Routes:** `every page in the app shell`.
- **Evidence:** `<aside aria-label="Navigation">` wraps the Practice, Internal console and Account `<nav>`s (`apps/web/src/components/shell.tsx:331`), so a landmark list reads 'Navigation, complementary' and then three navigations; the primary navigation is not complementary content. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships
- **Fix:** Make the rail a plain `<div>` holding the three named `<nav>` groups (keep their names), so the landmarks are the three navigations alone.
- **Size:** S.
- **Files:** `apps/web/src/components/shell.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 67 `co-001/ux-header-menus`.
- **Sources:** `a11y-practice-1-10`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges (`shell.tsx`), in the shell PR with UX-093 (C-023) to UX-021 (C-027) and UX-112 (C-069).

### UX-148 (C-157). The quoted words on the cited page are marked only visually

- **Severity:** polish. Harm area: accessibility. Reach: 2 routes, 2 roles.
- **Roles:** practice administrator, operator.
- **Screens:** `p.contract-version.default.1280`, `p.contract-version.notice.1280`, `p.abstraction-version.default.1280`.
- **Routes:** `/p/[practiceId]/contracts/versions/[versionId]`, `/p/[practiceId]/abstraction/versions/[versionId]`.
- **Evidence:** The quote is a `<mark>` with a faint inset tint and a thin underline inside the page text (`apps/web/src/components/contracts/display.tsx:94`). Most screen readers do not announce `<mark>`, so a screen-reader user cannot tell where the cited words start and end, the check this screen exists for; the record card repeats the quote but not its place. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships
- **Fix:** Put visually hidden 'Start of the cited words' and 'End of the cited words' around each marked segment, and a 'Go to the cited words' link above the text that moves focus to the first mark (`tabIndex={-1}`).
- **Size:** S.
- **Files:** `apps/web/src/components/contracts/display.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 52 `co-001/ux-a11y-names`.
- **Sources:** `a11y-practice-1-24`.
- **Verification:** confirmed
- **Notes:** The cited page's scroll box is UX-011 (C-002)'s. Words taken under the co-founder's ruling.

### UX-149 (C-143). Rule release notes give no sign of which release is shown: the chosen link carries aria-current with no style

- **Severity:** polish. Harm area: accessibility. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.releases.release.1280`, `p.releases.default.1280`, `p.releases.release.390`.
- **Routes:** `/p/[practiceId]/releases`.
- **Evidence:** `?release=900001` renders pixel-identical to the page without it: the chosen release's link carries `aria-current` but no visual style (`apps/web/src/app/p/[practiceId]/releases/page.tsx:130`), and the card title does not say it is the chosen one rather than the one in force. With one published release this is invisible; with two, a person comparing notes cannot tell which they are reading. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships (a state conveyed only programmatically) and 1.4.1; `.claude/rules/brand.md:32` (brass only for the single active-nav underline)
- **Fix:** Show the chosen row as text, not a link, in weight 600, with the word 'Showing' beside it (not brass), and name the release in the card heading. Words (taken under the co-founder's ruling): 'Rule release 900001 (in force)', or 'Rule release 900001 (shown; 900002 is in force)'.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/releases/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 56 `co-001/ux-release-pages`.
- **Sources:** `flows-practice-32`, `narrow-practice-2-23`.
- **Verification:** confirmed
- **Notes:** Open PRs #49 (release content checks) and #50 (a superseded re-run) both change this page: land after them or merge both. The pricing-run and compare filters' current mark is UX-084 (C-026) (same pattern).

### UX-150 (C-156). How the observed allowed was derived is shown only in a hover tooltip on Claims and lines

- **Severity:** polish. Harm area: accessibility. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.claims.default.1280`.
- **Routes:** `/p/[practiceId]/claims`.
- **Evidence:** The Observed allowed cell carries its basis ('AMT B6 (the payer's allowed amount)', 'Paid plus patient responsibility…') only as a `title` (`apps/web/src/app/p/[practiceId]/claims/page.tsx:197`): a mouse can hover it, a keyboard or touch user cannot reach it. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.1 and 2.1.1 (information available only on pointer hover)
- **Fix:** Show the basis as small Slate text under the amount, as 'allocated' already is, and drop the `title`.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/claims/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 39 `co-001/ux-line-to-case`.
- **Sources:** `a11y-practice-1-25`.
- **Verification:** confirmed
- **Notes:** Its words (the 'AMT B6' code) are UX-174 (C-184)'s (X12 words); audit #107 reworks this table's reasons in words.

### UX-151 (C-158). The narrative's live check re-announces its counts while the person types

- **Severity:** polish. Harm area: accessibility. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.packet.error-live-check.1280`, `p.packet.default.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** The whole check block (badge, counts and mismatch list) is `role="status" aria-live="polite"` and also the textarea's description (`apps/web/src/components/packets/narrative-editor.tsx:34-36`). Its counts ('4 sentences, 15 figures …') change whenever a sentence or figure is added, so a screen reader speaks over the typing. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 4.1.3 Status Messages (announce the status, not every recount)
- **Fix:** Keep the visible block as it is but not live; add a visually hidden polite region that announces only a change of verdict ('Live check: 1 mismatch', 'Live check passes'), one second after typing stops.
- **Size:** S.
- **Files:** `apps/web/src/components/packets/narrative-editor.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 45 `co-001/ux-packet-words`.
- **Sources:** `a11y-practice-1-26`.
- **Verification:** confirmed
- **Notes:** Checked audit #38's and audit #48's designs: neither changes the live check, but audit #48 changes `narrative-editor.tsx` (its draft copy). Land after audit #48, or ask that session to carry this small change. The live check's next step is UX-130 (C-093).

### UX-152 (C-153). The correspondence contact's fields carry no autocomplete purpose

- **Severity:** polish. Harm area: accessibility. Reach: 1 routes, 1 roles.
- **Roles:** practice administrator.
- **Screens:** `p.correspondence.default.1280`, `p.correspondence.error.1280`.
- **Routes:** `/p/[practiceId]/settings/correspondence`.
- **Evidence:** Name or office, phone, extension, email, street, suite, city and state have no `autoComplete`; only ZIP has `postal-code` (`apps/web/src/app/p/[practiceId]/settings/correspondence/page.tsx:73-86`). Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 1.3.5 Identify Input Purpose (AA), the contact being the administrator's own office details
- **Fix:** `autoComplete` values: `organization`, `tel-national`, `tel-extension`, `email`, `address-line1`, `address-line2`, `address-level2`, `address-level1` and `postal-code`.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/correspondence/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 53 `co-001/ux-settings-pages`.
- **Sources:** `a11y-practice-2-24`.
- **Verification:** confirmed
- **Notes:** With UX-001 (C-001) the nine fields also survive a refusal.

### UX-153 (C-146). In narrow cells and titles, dates and timestamps break at their hyphens ('2026-' over '06-10') and plan keys split mid-identifier

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 12 routes, 3 roles.
- **Roles:** billing manager, practice administrator, operator.
- **Screens:** `p.abstraction-ledger.default.390`, `p.access-log.default.390`, `p.contracts.layout.390`, `p.anomalies.cohort.390`, `p.roi.default.390`, `p.report.default.390`, `console.organizations.default.390`, `p.mapping.all-plans.390`.
- **Routes:** `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/anomalies`, `/p/[practiceId]/contracts`, `/p/[practiceId]/contracts/[contractId]`, `/p/[practiceId]/settings/access-log`, `/p/[practiceId]/reports`, `/p/[practiceId]/reports/roi`, `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]/mapping`, `/console/organizations`, `/console/terms`, `/console/support`.
- **Evidence:** `utc()` and `utcDate()` return plain strings (`apps/web/src/components/format.ts:2-12`), set in cells with no `whitespace-nowrap` and often not in the mono face, so a narrow column breaks them at each hyphen: the ledger's Money moved reads '2026-' over '06-10' on every row; the access log's When runs four lines ('2026-/10-26/01:42/UTC'); Effective reads 'from 2026-' over '01-01, open-' over 'ended'; the ROI period link '2026-/04-01/to/2026-/09-30'; titles such as 'Coverage report, 2026-/10-26'; on the console '2026-10-' over '26', 'SIM-' over '0001', 'SHA-' over '256'. Plan keys break as 'CE:SYNPLAN-' over 'FIX-ONE'. The compliance policy cells have no horizontal padding, so 'management' runs into '`management.md`' (`console/compliance/page.tsx:163-165`). Confirmed at 4d99df8.
- **Rule:** `.claude/rules/brand.md:36` and `docs/brand/BRAND.md:94` (codes and figures in the mono face with tabular numerals; a date reads as one figure); WCAG 2.1 1.3.2 (a value split across lines reads as two). Silent on wrapping: recommended
- **Fix:** One `<When>` component (and a `<Day>` for calendar dates) in `apps/web/src/components/when.tsx`, rendering each date or timestamp as a `<time>` in `whitespace-nowrap font-mono tabular-nums`, with the date and the time allowed to break only between them. Use it in every table and title. Short codes and identifiers (invoice numbers, 'SHA-256', ZIP+4, plan keys) take `whitespace-nowrap`, falling back to `overflow-wrap:anywhere` only when they cannot fit. Give the compliance policy cells `pr-3`. The format of the date itself is UX-027 (C-097)'s to decide; the same component carries it.
- **Size:** S.
- **Files:** `apps/web/src/components/when.tsx` (new), `apps/web/src/components/format.ts`, `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/anomalies/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`, `apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/[reportId]/page.tsx`, `apps/web/src/app/console/organizations/page.tsx`, `apps/web/src/app/console/compliance/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 29 `co-001/ux-dates`.
- **Sources:** `narrow-practice-1-18`, `narrow-practice-2-16`.
- **Verification:** confirmed
- **Notes:** Includes narrow-other-13's dates-at-hyphens part (that member's hash part is UX-075 (C-016)). Land with UX-027 (C-097) (the date format) so one component does both. UX-011 (C-002)'s scrollers and UX-079 (C-043)'s stacked rows give most cells the width they need. PR #51 changes the ledger page.

### UX-154 (C-141). Internal system names in what customers and prospects read: 'engine phase-two/2', 'the reconcile job', 'The database refuses your approval', 'the loaded content', 'the engine's' figure, 'PLB WO'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 8 routes, 4 roles.
- **Roles:** billing manager, packet approver, practice administrator, screening prospect.
- **Screens:** `p.pricing-runs.default.1280`, `p.reconciliation.default.1280`, `p.packet.default.1280`, `p.home.error-last-run-failed.1280`, `screening-result.default.1280`, `p.proof-level.empty.1280`, `p.roi-statement.default.1280`, `p.compare.default.1280`.
- **Routes:** `/p/[practiceId]/pricing-runs`, `/p/[practiceId]/pricing-runs/compare`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]`, `/p/[practiceId]/settings/proof-level`, `/screening/results/[resultId]`, `/screening`.
- **Evidence:** 'Release 900001, engine phase-two/2; created ...' (`apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx:160`; compare and line pages too); 'by the reconcile job' (`reconciliation/page.tsx:54`); 'The database refuses your approval: a second person who approves packets approves it.' (`cases/[caseId]/packet/page.tsx:388`); 'The database refused to record the export ...' (`apps/web/src/lib/packets/export-attempts.ts:65`); 'The operator has been alerted (job reference 1d574871).' (`p/[practiceId]/page.tsx:177`); 'PLB WO take-back' (`components/reconciliation/display.tsx:35`, :78); screening: '... under rule release 900001 (engine phase-two/2).' (`apps/web/src/components/screening/result-summary.tsx:145`), 'Not screened: quarters outside the loaded content' (:175; `apps/web/src/lib/screening/labels.ts:109`; `apps/web/src/lib/screening/messages.ts:169`), and '... the engine's before sequestration ...' (`apps/web/src/components/screening/anomalies.tsx:354`).
- **Rule:** The brief's plain-language rule (no internal jargon); `docs/brand/BRAND.md:23`
- **Fix:** Say who acts in the customer's terms and keep build strings for the trace and support: drop 'engine phase-two/2' from run lists, compare cards and the screening's first line (keep it labelled 'Pricing engine version' on the line trace and at the foot of the screening result); 'the reconcile job' -> 'PaidWhole (automatic match)'; 'The database refuses your approval: ...' -> 'You cannot approve a packet you drafted or edited. Ask another person who approves packets: use Request approval below.'; 'The database refused to record the export: ...' -> 'The export was not recorded: this version no longer meets the export checks. Reload the page to see which one.'; 'The operator has been alerted (job reference 1d574871).' -> 'PaidWhole support has been alerted (reference 1d574871; quote it if you contact support).'; 'PLB WO take-back' -> 'the payer took it back from a later payment (recoupment, PLB WO)'; 'quarters outside the loaded content' -> 'quarters without Medicare rates loaded'; 'PaidWhole has not loaded the Medicare content for it' -> 'PaidWhole has not loaded Medicare's rates for that quarter'; the top-rows description rewritten without 'the engine's' ('Each figure is Medicare's amount for one claim line, before sequestration and rounded once, times the row's claim lines.').
- **Size:** M.
- **Files:** `apps/web/src/app/p/[practiceId]/pricing-runs/page.tsx`, `apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/lib/packets/export-attempts.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`, `apps/web/src/lib/cases/timeline.ts`, `apps/web/src/components/screening/result-summary.tsx`, `apps/web/src/lib/screening/labels.ts`, `apps/web/src/lib/screening/messages.ts`, `apps/web/src/lib/screening/routes.ts`, `apps/web/src/components/screening/anomalies.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/screening/messages.ts`, `apps/web/src/lib/screening/routes.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 42 `co-001/ux-internal-names` (outside #42's files); UX PR 85 `co-001/ux-screening-messages` (the screening sentences).
- **Sources:** `words-practice-40`, `words-other-34`, `words-other-35`, `words-other-36`.
- **Verification:** confirmed
- **Notes:** `lib/screening/messages.ts` and `lib/screening/routes.ts` are #42 files: those sentences after #42 merges, the rest now. The screening's other 'the engine' sentences are UX-132 (C-061)'s. PR #51 changes the reconciliation page and display, PR #52 the packet page: the one merged second keeps both. Words chosen under the co-founder's ruling (above).

### UX-155 (C-196). The danger style on actions follows no rule: 'End membership' is red on Users and roles and plain on the console; comparable removals ('Revoke device', 'End now', 'Remove this record') are outline

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 7 routes, 4 roles.
- **Roles:** organization administrator, platform administrator, contract specialist, all users (devices).
- **Screens:** `settings.users.default.1280-dark`, `console.organization.default.1280-dark`, `account.devices.default.1280-dark`, `console.support.default.1280-dark`.
- **Routes:** `/settings/organizations/[organizationId]/users`, `/console/organizations/[organizationId]`, `/account/devices`, `/console/support`, `/p/[practiceId]/abstraction/versions/[versionId]`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/reconciliation`.
- **Evidence:** 'End membership' is `destructive` on Users and roles (`apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx:80`) but `outline` on the console (`console/organizations/[organizationId]/page.tsx:162`). Also outline: 'Revoke this device and sign out' (`account/devices/page.tsx:46`), 'End now' (`console/support/page.tsx:99`), 'Remove this record' and 'Withdraw the question' (`abstraction/versions/[versionId]/page.tsx:163`, :474). Meanwhile 'Write off', 'Reverse the match' and 'Adjust the amount' are destructive (`cases/[caseId]/page.tsx:202`; `reconciliation/page.tsx:36`; `abstraction/ledger/page.tsx:25`).
- **Rule:** No written rule on which actions take the danger style (`packages/ui/src/components/button.tsx:13-15` defines it); recommended, with the brief (buttons look and behave the same across screens)
- **Fix:** Write one rule in the Button's comment and hold it with a test: an action that removes access, removes or reverses a record, or writes money off takes the `destructive` variant; everything else is default or outline. Apply it to the call sites above ('End membership' destructive on both pages; 'Revoke device', 'End now', 'Remove this record', 'Withdraw the question' destructive).
- **Size:** S.
- **Files:** `packages/ui/src/components/button.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/console/support/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 23 `co-001/ux-buttons` (outside #42's files); UX PR 74 `co-001/ux-console-support-page` (End now).
- **Sources:** `brand-18`.
- **Verification:** confirmed
- **Notes:** Brand choice under the co-founder's ruling, the rules being silent: the rule above. Which of these also confirm first is UX-046 (C-058)'s. `console/support/page.tsx` is a #42 file: that button after #42 merges, the rest now.

### UX-156 (C-142). Public pages each build their own frame: four content widths, five different footer sentences ('Service status: status page.'), and a header whose lockup sends everyone, prospects included, to sign-in

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 6 routes, 4 roles.
- **Roles:** screening prospect, audit requester, public status page reader, signed-in customer on a public page.
- **Screens:** `request-audit.default.1280`, `screening.default.1280`, `screening-result.default.1280`, `status.default.1280`, `security.default.1280-dark`, `maintenance.default.1280-dark`, `request-audit.sent.1280`.
- **Routes:** `/request-audit`, `/screening`, `/screening/results/[resultId]`, `/status`, `/security`, `/maintenance`.
- **Evidence:** `PublicHeader` is the lockup alone, linked to `/sign-in` (`apps/web/src/components/public-header.tsx:5-13`), so a prospect on their result lands on a sign-in form they have no account for, and a customer on `/status` is sent to sign in again. Widths differ: `max-w-xl` (`request-audit/page.tsx:29`; `maintenance/page.tsx:16`), `max-w-3xl` (screening, status, security), `max-w-5xl` (`components/screening/result-view.tsx:21`). Each page closes with its own sentence of links, with link text that repeats its label: '. Service status: status page.' (`request-audit/page.tsx:75-78`; `screening/page.tsx:143`), 'Screen another file: free screening.' (`result-view.tsx:31-35`), 'Service status: status page. Customers: sign in.' (`security/page.tsx:123`). After 'Request received' the request page still offers 'Not ready for an audit? Try a free screening'.
- **Rule:** No written rule on the public frame (`docs/brand/BRAND.md:120-121` covers the app header only; ADR 0056 is silent); recommended, with WCAG 2.1 SC 2.4.4 for the link text
- **Fix:** One `PublicLayout`: a header with the lockup on the left (to `/screening` for a visitor without a session, to '/' with one) and on the right 'Free screening', 'Request an audit' and 'Sign in' (or 'Your workspace' when a session cookie is present), the current page marked; one reading width (`max-w-3xl`), the wide width only for the screening result's tables; one footer in Slate 14 px with Request an audit, Free screening, Service status, Security, Sign in and the support address. Each page keeps only its own call to action. The request page's sent state says what happens next and offers the screening as 'While you wait'. Sign-in keeps its own Paper frame (ADR 0058 D9 item 1); the screening keeps the lockup without the tagline (ADR 0062 D11).
- **Size:** M.
- **Files:** `apps/web/src/components/public-header.tsx`, `apps/web/src/components/public-layout.tsx` (new), `apps/web/src/app/request-audit/page.tsx`, `apps/web/src/app/screening/page.tsx`, `apps/web/src/components/screening/result-view.tsx`, `apps/web/src/app/status/page.tsx`, `apps/web/src/app/security/page.tsx`, `apps/web/src/app/maintenance/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/screening/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 61 `co-001/ux-public-frame` (outside #42's files); UX PR 84 `co-001/ux-screening-upload-page` (the screening page).
- **Sources:** `brand-14`, `flows-other-24`, `words-other-25`.
- **Verification:** confirmed
- **Notes:** Brand choice under the co-founder's ruling, the rules being silent: one public frame as above. The header reads only the session cookie's presence for its words, so public pages never depend on the session store. `screening/page.tsx` is a #42 file: the screening page after #42 merges, the rest now.

### UX-157 (C-192). Page headers have no single rhythm: a 40 px help-link band above every title, and ledes at two sizes and two distances

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 8 routes, 2 roles.
- **Roles:** all signed-in roles, public page readers.
- **Screens:** `account.devices.default.1280-dark`, `account.notifications.default.1280-dark`, `settings.billing.default.1280-dark`, `p.uploads.default.1280-dark`, `p.access-log.default.1280-dark`, `status.default.1280`, `console.status.default.1280`.
- **Routes:** `/account/devices`, `/account/notifications`, `/settings/billing`, `/p/[practiceId]/uploads`, `/p/[practiceId]/settings/access-log`, `/status`, `/maintenance`, `/console/status`.
- **Evidence:** Most pages set the lede at 16 px in a `gap-1` group under the H1; Devices, Notification preferences and Billing set a 14 px `max-w-prose` lede outside that group, 24 px below the title (`apps/web/src/app/account/devices/page.tsx:24`; `account/notifications/page.tsx:28`; `settings/billing/page.tsx:27`); the status and maintenance lines are 14 px under a 32 px title (`status/page.tsx:25`; `maintenance/page.tsx:18`). Every shell page opens with a band holding only a right-aligned 'Help with this screen' disclosure (`apps/web/src/components/shell.tsx:335-349`), while the console status page puts its 'Public status page' link on the title row.
- **Rule:** ADR 0056 (one type scale: page title 32/700, section 20/700, card title 18/700, running text such as a lede 16/24); `docs/brand/BRAND.md:92` (16/24 body)
- **Fix:** One `PageHeader` (breadcrumb; H1 with its state chips; a 16/24 Slate lede; a right-hand slot for the page's actions, the help disclosure and, where earned, the seal), used on every shell and public page. 'Help with this screen' moves into that slot, so the title starts at the top of the content. Extend `apps/web/src/app/type-scale.test.ts` so a page's lede must be the PageHeader's.
- **Size:** M.
- **Files:** `apps/web/src/components/page-header.tsx` (new), `apps/web/src/components/shell.tsx`, `apps/web/src/app/account/devices/page.tsx`, `apps/web/src/app/account/notifications/page.tsx`, `apps/web/src/app/settings/billing/page.tsx`, `apps/web/src/app/status/page.tsx`, `apps/web/src/app/maintenance/page.tsx`, `apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx`, `apps/web/src/app/type-scale.test.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 22 `co-001/ux-page-header` (outside #42's files); UX PR 69 `co-001/ux-shell-context` (the help link's move into the page header).
- **Sources:** `brand-12`.
- **Verification:** confirmed
- **Notes:** `shell.tsx` is a #42 file: the help band's move lands after #42 merges; the PageHeader and the pages' ledes can land first. UX-158 (C-144) (writer A's detail headings) uses the breadcrumb slot and UX-183 (C-195) the right-hand slot: build the slots once.

### UX-158 (C-144). Detail-page titles join the screen's name to the record's long name in one heading, running three or four lines at 390 px and splitting plan keys

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 6 routes, 3 roles.
- **Roles:** billing manager, packet approver, operator.
- **Screens:** `p.submissions.default.390`, `p.packet.default.390`, `console.practice.default.390`, `p.packet-review.error-needs-downloads.390`, `p.abstraction-version.error-amend.390`, `p.contract.layout.390`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/submissions`, `/p/[practiceId]/cases/[caseId]/packet`, `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review`, `/p/[practiceId]/abstraction/versions/[versionId]`, `/p/[practiceId]/mapping/[planId]`, `/console/practices/[practiceId]`.
- **Evidence:** At 390 px 'Submissions and responses: SYNTHETIC PAYER Q, CE:SYNPLAN-FIX-ONE' and 'SYNTHETIC OTHER PRACTICE LAYOUT: pricing and triage settings' take four lines of the 32 px title (about 150 px); 'Packet: …', 'Packet review: …, version 1' and the abstraction version's title take three; the plan key breaks at its hyphen ('CE:SYNPLAN-' over 'FIX-ONE'). With the badge and lede, the first card starts 330 to 490 px down. Each page puts the record's and the screen's names in one h1 (for example `cases/[caseId]/submissions/page.tsx:136`, `cases/[caseId]/packet/page.tsx:178`, `console/practices/[practiceId]/page.tsx:48`), and the console page's back link says only 'Organization' (`:45-47`). Confirmed at 4d99df8.
- **Rule:** ADR 0056:48 (a page's title 32 px/700: kept); WCAG 2.1 2.4.6 Headings and Labels and 1.4.10 Reflow. Silent on joining record and screen names: recommended
- **Fix:** Split each title: the record's name moves to a breadcrumb line above the h1, its last item ('Cases › SYNTHETIC PAYER Q, CE:SYNPLAN-FIX-ONE'; on the console 'SYNTHETIC GROUP › SYNTHETIC OTHER PRACTICE LAYOUT'), wrapping between words with identifiers kept whole (`whitespace-nowrap` on the key); the h1 is the screen's own short name ('Submissions and responses', 'Packet', 'Packet review, version 1', 'Pricing and triage settings'). Record pages whose title is the record (the contract, the plan, the case) keep it as the h1 and stop breaking keys. The document title keeps both names.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx`, `apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx`, `apps/web/src/app/console/practices/[practiceId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 22 `co-001/ux-page-header`.
- **Sources:** `narrow-other-15`, `narrow-practice-1-23`.
- **Verification:** confirmed
- **Notes:** Land with UX-157 (C-192) (page header), which builds the shared header with a breadcrumb slot. The packet pages are audit #38's and audit #48's screens; PR #51 changes the submissions page: coordinate. Titles taken under the co-founder's ruling.

### UX-159 (C-148). At 390 px empty states and the drop zone keep 32 px padding, and the upload kind select runs past its drop zone

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 5 routes, 4 roles.
- **Roles:** billing manager, practice administrator, organization administrator, operator.
- **Screens:** `p.uploads.empty.390`, `p.uploads.default.390`, `p.reconciliation.default.390`, `console.organization.empty.390`, `settings.billing-org.empty.390`, `p.notifications.empty.390`.
- **Routes:** `/p/[practiceId]/uploads`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/notifications`, `/console/organizations/[organizationId]`, `/settings/billing/[organizationId]`.
- **Evidence:** `EmptyState` pads `p-8` at every width (`packages/ui/src/states/empty-state.tsx:30`) inside the card's own padding, so 'No agreements yet: Record the signed BAA and engagement letter…' wraps in a column about 250 px wide and breaks 'e-' over 'signature'. The drop zone is a flex column with `items-start` and `p-8` (`components/uploads/uploader.tsx:311`), and the kind select has no width limit (`:330`), so its longest option crosses the dashed border and makes the page 393 px wide with no table (`p.uploads.empty.390`); inside the reconciliation card the zone leaves 262 px for content. Confirmed at 4d99df8.
- **Rule:** ADR 0056:51-52 (no page scrolls sideways at a phone's width) and :66-68 (an empty section inside a screen is its words alone). Silent on padding: recommended
- **Fix:** `EmptyState` pads `p-4 sm:p-8`, and a section-level empty state (no mark) drops its dashed box below `sm`, so the words sit in the card's own padding. The drop zone pads `p-4 sm:p-8`; the kind and system selects and their wrappers take `w-full max-w-full min-w-0`, as `SelectField` does (`components/field.tsx:75`).
- **Size:** S.
- **Files:** `packages/ui/src/states/empty-state.tsx`, `apps/web/src/components/uploads/uploader.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 47 `co-001/ux-uploader`.
- **Sources:** `narrow-other-22`, `narrow-practice-2-19`.
- **Verification:** confirmed
- **Notes:** Lands with UX-049 (C-037) and UX-097 (C-072) (same uploader).

### UX-160 (C-047). Dark (tokens only): every sign-in step keeps the light Paper ground, so the white wordmark, title and links all but vanish

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 6 routes, 1 roles.
- **Roles:** anyone signing in.
- **Screens:** `sign-in.default.1280-dark`, `sign-in-mfa.default.1280-dark`, `sign-in-enroll.default.1280-dark`, `sign-in-hardware-key.default.1280-dark`, `sign-in-new-password.default.1280-dark`, `sign-in-register-key.default.1280-dark`.
- **Routes:** `/sign-in`, `/sign-in/mfa`, `/sign-in/enroll`, `/sign-in/hardware-key`, `/sign-in/new-password`, `/sign-in/register-key`.
- **Evidence:** With `data-theme=dark` the card, fields and button turn dark but the ground stays Paper (#F6F4EE): the white wordmark is 1.10:1, the h1 #F4F6FA 1.02:1, links #8FB3F0 1.93:1, muted text #A7B1C2 1.97:1, so the lockup shows only its brass keystone. Cause, confirmed at 4d99df8: `apps/web/src/app/sign-in/layout.tsx:11` paints `bg-paper`, which reads the palette primitive `--pw-paper` (`packages/brand/src/tokens.css:12`), and the dark block (`tokens.css:72-100`) redefines no primitive. The public, status and app layouts use `bg-background` and switch correctly. No user reaches dark today (D9 item 3).
- **Rule:** `docs/brand/BRAND.md:84-86` (in dark mode the ground becomes a deeper ink, text near-white); `.claude/rules/brand.md:39` (dark mode uses the semantic tokens) and `:40`; WCAG 2.1 1.4.3 (advisory: dark is tokens only)
- **Fix:** Give the sign-in ground a semantic token instead of the Paper primitive: `--pw-bg-sign-in: var(--pw-paper)` in `:root` and `var(--pw-bg)` in the dark block of `tokens.css`, exposed in `tailwind-theme.css`, used as `bg-bg-sign-in` in `sign-in/layout.tsx:11`. Add a static check beside `tools/brand-colors` that component code outside `packages/brand` and `components/brand` uses no palette-primitive utility (`bg-paper`, `bg-ink`, `text-ink`, `text-slate`, `border-line`, `bg-white`), so no other surface can skip dark mode. Add the six sign-in steps to the dark pixel baselines in `apps/web/e2e/brand.spec.ts`.
- **Size:** S.
- **Files:** `packages/brand/src/tokens.css`, `packages/brand/src/tailwind-theme.css`, `apps/web/src/app/sign-in/layout.tsx`, `tools/brand-colors/scan.ts`, `apps/web/e2e/brand.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 32 `co-001/ux-dark-tokens` (the static check for palette primitives, with the sign-in layout exempted by name until the alias); UX PR 91 `co-001/ux-appearance` (the sign-in ground's alias token (`--pw-bg-sign-in`), after F3).
- **Sources:** `brand-01`, `a11y-other-19`.
- **Verification:** confirmed
- **Notes:** Severity polish (members said should_fix) because no user can reach it while dark stays off under the founder's ruling (UX-118 (C-080)); it becomes blocking the day dark reaches anyone, so it must land before or with any theme switch. The new token holds two existing colours (Paper stays the light sign-in ground, D9 item 1), but it is an alias, and ADR 0058:59-67 (D9 item 6) sent the alias `--pw-danger-bg` to the brand owner, 'who alone changes the palette'. So the alias is asked under F3 (6.2) as an alias with no new colour, and lands with the Appearance setting (`co-001/ux-appearance`) behind F1, since it matters only once dark is reachable. The static check lands now, with `sign-in/layout.tsx` exempted by name until the alias. The dark ground itself is ruled (`docs/brand/BRAND.md:84-86`). Corrected on review: the earlier Notes called it 'Not a palette change'. The native controls' light glyphs are UX-117 (C-035).

### UX-161 (C-164). On a phone text controls are about 20 px tall and buttons and fields 32 to 36 px: they pass 24 px but not a comfortable touch size

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 6 roles.
- **Roles:** billing manager, packet approver, practice administrator, organization administrator, operator, screening prospect.
- **Screens:** `console.prospects.default.390`, `console.tickets.default.390`, `console.specialist-queue.default.390`, `home.default.390`, `sign-in.default.390`, `console.organizations.default.390`.
- **Routes:** `every route, on touch screens`.
- **Evidence:** Measured at 390 px: 'Help with this screen' is a bare 14 px summary about 20 px tall (`apps/web/src/components/shell.tsx:336`); the console's status filters are 20 px text links 12 px apart (`console/prospects/page.tsx:40-42`, `console/tickets/page.tsx:36-38`); table links are 20 px; buttons are 36 px (`packages/ui/src/components/button.tsx:22`), small buttons 32 px (`:23`), inputs and selects 36 px. Each passes WCAG 2.2's 24 px minimum by size or spacing. Confirmed at 4d99df8.
- **Rule:** WCAG 2.2 2.5.8 Target Size (Minimum) is met; 2.5.5 (AAA, 44 px) and the platforms' 44 to 48 px guidance are recommendations. The brand and PRD are silent: recommended
- **Fix:** Under `@media (pointer: coarse)`, raise buttons, inputs and selects to 44 px (a `coarse:` variant on the shared Button, Input and control class), render the console's status filters as a segmented control of 44 px tabs (keeping `aria-current`), and pad the help summary and stacked table links to 44 px rows. The desktop's dense sizes stay unchanged.
- **Size:** S.
- **Files:** `packages/ui/src/components/button.tsx`, `packages/ui/src/components/input.tsx`, `apps/web/src/components/field.tsx`, `apps/web/src/app/console/prospects/page.tsx`, `apps/web/src/app/console/tickets/page.tsx`, `apps/web/src/components/shell.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 33 `co-001/ux-focus-touch` (outside #42's files); UX PR 68 `co-001/ux-skip-and-rail` (the help summary).
- **Sources:** `narrow-other-18`.
- **Verification:** confirmed
- **Notes:** Only the help summary is in `shell.tsx` (#42's); the rest lands first. UX-088 (C-041) handles the stacked links below 24 px (a WCAG failure); this is the comfort layer above it.

### UX-162 (C-165). Several primary actions are bare underlined words 16 to 20 px tall (Adjust, Write this line off, the review's PDF download)

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 4 routes, 3 roles.
- **Roles:** billing manager, packet approver, operator.
- **Screens:** `p.abstraction-ledger.error-adjust-zero.390`, `p.case.write-off-open.390`, `p.packet-review.error-needs-downloads.390`, `p.case.default.390`, `p.home.default.390`.
- **Routes:** `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review`, `/p/[practiceId]`.
- **Evidence:** The ledger's '▸ Adjust' summary is about 46 by 16 px in 12 px text (`p/[practiceId]/abstraction/ledger/page.tsx:24`), the screen's only action; '▸ Write this line off' about 125 by 20 px (`cases/[caseId]/page.tsx:201`); the review's 'PDF' download, a step the attestation requires, about 26 by 20 px (`…/packet/[versionId]/review/page.tsx:115-117`); the home's queue links are 20 px lines 8 px apart (`p/[practiceId]/page.tsx:373`). Each passes 2.5.8 only by its spacing; the app's own buttons are 36 px. Confirmed at 4d99df8.
- **Rule:** WCAG 2.2 2.5.8 Target Size (Minimum): met by spacing; 2.5.5 (AAA): not met. Silent in the brand and PRD: recommended
- **Fix:** Render actions as actions: the ledger's Adjust and the case's 'Write this line off' and 'Reopen' summaries take the outline button's look (`Button` `variant="outline" size="sm"` classes on the `<summary>`, 32 px, `text-sm`); the review's downloads become two outline buttons, 'Download the PDF' and 'Download the CSV schedule', each followed by its SHA-256 and status line; the home's queue list gets `py-1.5` per item for a 32 px row. Links inside sentences stay links.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 13 `co-001/ux-ledger-corrections`.
- **Sources:** `narrow-practice-1-22`.
- **Verification:** confirmed
- **Notes:** Open PR #51 changes the ledger, case and home pages: land after it. The ledger's Adjust also moves out of its cell under UX-078 (C-034); do both together. The review page is audit #38's and audit #48's screen; UX-126 (C-078) changes the same card.

### UX-163 (C-178). File sizes mix 'bytes', 'KiB' and 'GiB' ('up to 2.0 GiB' on one drop zone, '2 GiB' on another), and document labels start with a lower-case kind

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 5 routes, 2 roles.
- **Roles:** billing manager, contract specialist.
- **Screens:** `p.uploads.default.1280`, `p.upload.default.1280`, `p.abstraction.default.1280`, `p.contracts.default.1280`, `p.contract.default.1280`, `p.uploads.error-era-system.1280`.
- **Routes:** `/p/[practiceId]/uploads`, `/p/[practiceId]/uploads/[documentId]`, `/p/[practiceId]/abstraction`, `/p/[practiceId]/contracts`, `/p/[practiceId]/contracts/[contractId]`.
- **Evidence:** Receipts read '1000 bytes', '1.4 KiB'; drop zones 'up to 2.0 GiB each' (Uploads) and 'up to 2 GiB each' (`apps/web/src/app/p/[practiceId]/contracts/page.tsx:209`); labels 'contract, 1.9 KiB, received ...'. Causes: `apps/web/src/lib/uploads/receipt-labels.ts:207-216` (binary units, one decimal, 'bytes' under 1024); `apps/web/src/components/contracts/forms.tsx:18-19` (kind first, lower case).
- **Rule:** No written rule on file sizes; recommended (the brief's goal: one product), with `docs/brand/BRAND.md:23` ('exact')
- **Fix:** One `formatBytes` in decimal units labelled KB, MB and GB with no trailing '.0' ('1000 bytes' -> '1 KB', '1.4 KiB' -> '1.4 KB', '2.0 GiB' and '2 GiB' -> '2 GB'), used by every receipt and drop zone; document labels start with a capital ('Contract, 1.9 KB, received ...'). The label must say exactly what is enforced: set the limit to 2,000,000,000 bytes (`MAX_UPLOAD_BYTES`, `apps/web/src/lib/uploads/limits.ts:12-13`, today 2 GiB) and its refusal to '2 GB' (`apps/web/src/lib/routes/uploads.ts:181`), so '2 GB' is exact; the PRD's acceptance, 'a 2 GB zip of 835s uploads' (`docs/product/PRD.md:234`), still holds, and the smaller limit is the safer.
- **Size:** S.
- **Files:** `apps/web/src/lib/uploads/receipt-labels.ts`, `apps/web/src/lib/uploads/limits.ts`, `apps/web/src/lib/routes/uploads.ts`, `apps/web/src/components/contracts/forms.tsx`, `apps/web/src/app/p/[practiceId]/contracts/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 47 `co-001/ux-uploader`.
- **Sources:** `words-practice-23`.
- **Verification:** confirmed
- **Notes:** Style chosen under the co-founder's ruling: decimal units, as the label says what it means exactly. Corrected on review: the earlier fix labelled a 2 GiB limit '2 GB', so a 2.1 GB file was taken under a '2 GB' maximum. PR #54 changes `receipt-labels.ts` (the PLB total): land after it.

### UX-164 (C-079). Dark (tokens only): printing in dark keeps the dark tokens, because the print block loses to the dark selector

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 3 routes, 3 roles.
- **Roles:** billing manager, practice administrator, packet approver.
- **Screens:** `p.roi-statement.default.1280-dark`, `p.report.default.1280-dark`, `p.report-document.default.1280-dark`.
- **Routes:** `/p/[practiceId]/reports/roi/[statementId]`, `/p/[practiceId]/reports/[reportId]`, `/p/[practiceId]/reports/documents/[documentId]`.
- **Evidence:** From the code (print was not captured): the print block resets only `--pw-bg`, `--pw-fg` and `--pw-mark-ring` under `@media print { :root {…} }` (`packages/brand/src/tokens.css:102-109`). That selector (0,1,0) loses to `:root[data-theme="dark"]` (0,2,0, `tokens.css:73`), so with dark on, a printed ROI statement or audit report would keep #F4F6FA text (1.08:1 on paper, since backgrounds do not print by default), the muted grey, the light-blue links and the dark status tints. Confirmed at 4d99df8. No user reaches dark today (D9 item 3).
- **Rule:** `packages/brand/src/tokens.css:102` (the print block exists for reports and statements); `docs/brand/BRAND.md:68` (White is the report ground); WCAG 2.1 1.4.3 (advisory: dark is tokens only)
- **Fix:** In the print block, re-declare the whole light semantic set under `:root, :root[data-theme="dark"], .dark`, so print is light whatever the screen theme: bg, bg-raised, bg-inset, fg, fg-muted, fg-inverse, border, border-strong, input-border, primary, primary-fg, link, focus, the six status tokens, danger-bg, mark-ring, and `color-scheme: light`. Add a print check to `apps/web/e2e/brand.spec.ts` with `page.emulateMedia({ media: 'print' })` and `data-theme=dark` on the ROI statement.
- **Size:** S.
- **Files:** `packages/brand/src/tokens.css`, `apps/web/e2e/brand.spec.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 32 `co-001/ux-dark-tokens`.
- **Sources:** `brand-03`.
- **Verification:** confirmed
- **Notes:** Severity polish (the member said should_fix) because no user can reach it while dark stays off; it must land before any dark switch (UX-118 (C-080)). The worker's PDFs are printed from their own light HTML and are not affected.

### UX-165 (C-147). At 390 px figure tiles stack one per row (the specialist queue's four counts, the ledger's six stage tiles), filling the first screen

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 3 routes, 3 roles.
- **Roles:** operator, billing manager, practice administrator.
- **Screens:** `console.specialist-queue.default.390`, `p.abstraction-ledger.default.390`, `p.abstraction-ledger.empty.390`, `p.reconciliation.default.390`.
- **Routes:** `/console/specialist-queue`, `/p/[practiceId]/abstraction/ledger`, `/p/[practiceId]/reconciliation`.
- **Evidence:** The specialist queue's four count cards stack one per row below `sm` (`apps/web/src/app/console/specialist-queue/page.tsx:37`, `grid gap-4 sm:grid-cols-4`), about 620 px of single figures, so the practices list starts near y 990, below an 844 px screen. The ledger's six stage tiles do the same (`components/reconciliation/display.tsx:88`, `grid gap-3 sm:grid-cols-3 lg:grid-cols-6`), about 780 px before the shortfalls and entries the screen exists to correct; the same `LedgerTotals` serves Reconciliation. Confirmed at 4d99df8.
- **Rule:** `docs/brand/BRAND.md:125-126` (tiles: label in Slate 12 px, value in Plex Mono 500: kept). Silent on tile columns at phone width: recommended
- **Fix:** Two columns below `sm`: `grid grid-cols-2 gap-3 sm:grid-cols-4` on the specialist queue and `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6` on `LedgerTotals`. The Recovered tile, which carries its posted or deposited label, spans both columns (`col-span-2` below `sm`) so its stage-five wording is never squeezed. Each tile's note sits under its figure in the 12 px Slate the brand sets.
- **Size:** S.
- **Files:** `apps/web/src/app/console/specialist-queue/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 18 `co-001/ux-stat-tile`.
- **Sources:** `narrow-other-21`, `narrow-practice-1-21`.
- **Verification:** confirmed
- **Notes:** `components/reconciliation/display.tsx` is in open PR #51 (audit #12, ledger amounts in payment terms): land after it. UX-104 (C-057) rebuilds the tiles as one StatTile; land the grid with it. Layout only: no ledger figure changes.

### UX-166 (C-170). The second sign-in step has two names: 'two-step verification' on sign-in, 'MFA' on the users page and the console

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 3 routes, 3 roles.
- **Roles:** organization administrator, practice administrator, platform administrator.
- **Screens:** `settings.users.default.1280`, `console.organization.default.1280`, `sign-in-enroll.default.1280`.
- **Routes:** `/settings/organizations/[organizationId]/users`, `/console/organizations/[organizationId]`, `/sign-in/enroll`.
- **Evidence:** Sign-in says 'Set up two-step verification' (`apps/web/src/app/sign-in/enroll/page.tsx:18`); the users page says '... set their own password, and enroll MFA before they see anything.' (`apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx:100`) and 'active, no MFA' (:69); the console says 'no MFA yet' (`apps/web/src/app/console/organizations/[organizationId]/page.tsx:149`).
- **Rule:** No written rule; recommended (the brief's goal: one product; one term per thing)
- **Fix:** Use 'two-step verification' everywhere a person reads it: '... choose their own password, and set up two-step verification before they see anything.'; 'no MFA yet' -> 'Two-step verification not set up'; 'active, no MFA' -> 'Active, two-step verification not set up' (with UX-100 (C-017)'s labels).
- **Size:** S.
- **Files:** `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 19 `co-001/ux-labels` (the console page); UX PR 75 `co-001/ux-users-page` (the users page).
- **Sources:** `words-other-28`.
- **Verification:** confirmed
- **Notes:** The users page is a #42 file: after #42 merges; the console page now. Words chosen under the co-founder's ruling (above).

### UX-167 (C-181). The monthly summary puts the link text 'the ledger’s' where a dollar figure belongs, and writes months three ways ('September 2026', '2026-03', '2026-Q4')

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 4 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.monthly.default.1280`, `p.monthly.empty.1280`, `p.report-document.default.1280`, `p.home.default.1280`, `p.anomalies.default.1280`.
- **Routes:** `/p/[practiceId]/reports/monthly`, `/p/[practiceId]/reports/documents/[documentId]`, `/p/[practiceId]`, `/p/[practiceId]/anomalies`.
- **Evidence:** By stage, Dollars column: Payer approved and Recovered read 'the ledger’s' as a link (`apps/web/src/components/reports/documents.tsx:146-150`), a possessive with no noun, read aloud as 'link, the ledger’s'. Months: 'Monthly variance summary, September 2026' on the page but '2026-03' on the printed document, and 'No line has a service date in 2026-09.'; quarters as '2026-Q4' (home) and '2026-Q2' (anomalies).
- **Rule:** WCAG 2.1 SC 2.4.4 (link purpose); no written rule on the date words; recommended (the brief's goal: one product)
- **Fix:** 'the ledger’s' -> 'See the recovery ledger' (linked to Reconciliation for the month). Every month in screen text through UX-027 (C-097)'s formatter as 'September 2026', every quarter as 'Q4 2026 (Oct–Dec)'; ISO months stay in CSVs and URLs. 'Monthly variance summary, 2026-03' -> 'Monthly variance summary, March 2026'; 'No line has a service date in 2026-09.' -> '... in September 2026.'
- **Size:** S.
- **Files:** `apps/web/src/components/reports/documents.tsx`, `apps/web/src/app/p/[practiceId]/reports/monthly/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/documents/[documentId]/page.tsx`, `apps/web/src/components/format.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 29 `co-001/ux-dates`.
- **Sources:** `words-practice-41`.
- **Verification:** confirmed
- **Notes:** Lands with UX-027 (C-097) (the one formatter). Words chosen under the co-founder's ruling (above).

### UX-168 (C-149). Apostrophes and quotes switch between straight and curly, often in one message ('the practice’s workspace' above 'Ask the practice's administrator')

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 4 routes, 1 roles.
- **Roles:** all readers.
- **Screens:** `p.contracts.error-forbidden.1280`, `p.home.empty.1280`, `p.abstraction-ledger.default.1280`, `screening-result.default.1280`, `settings.billing-org.error-forbidden.1280`, `p.case.error.1280`.
- **Routes:** `/p/[practiceId]/**`, `/settings/billing`, `/settings/billing/[organizationId]`, `/screening/results/[resultId]`.
- **Evidence:** A permission reason with a curly apostrophe ('the practice’s workspace', from `packages/db/src/authz/permissions.ts`) sits above 'Ask the practice's administrator for access.' (straight, `apps/web/src/app/p/[practiceId]/page.tsx:153`); 'the contracts' own rules ... your practice's name' beside 'the screening’s totals' (`apps/web/src/components/screening/convert-form.tsx:50` with the kept text); 'say why for "other"' (`packages/triage/src/cases.ts:111`); 22 `&apos;` entities in the web app's JSX. The copy lint has no punctuation rule (`tools/brand-copy/scan.ts:20-35`).
- **Rule:** No written rule (`docs/brand/BRAND.md` is silent); recommended: the typographic apostrophe, which most of the copy and all the legal and screening wording already use
- **Fix:** Use ’ and “ ” in all product copy: convert the straight ones and the `&apos;` entities ('Ask the practice’s administrator for access.'; 'Say why when the reason is “Other”'), and add the copy-lint straight-quote rule (UX-129 (C-055)) with the existing exemption comment for code samples, so new ones fail.
- **Size:** M.
- **Files:** `tools/brand-copy/scan.ts`, `tools/brand-copy/scan.test.ts`, `apps/web/src/app/p/[practiceId]/page.tsx`, `apps/web/src/components/screening/convert-form.tsx`, `apps/web/src/components/shell.tsx`, `packages/triage/src/cases.ts`, `packages/db/src/authz/permissions.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 31 `co-001/ux-copy-lint` (outside #42's files); UX PR 68 `co-001/ux-skip-and-rail` (the strings in `shell.tsx`); UX PR 76 `co-001/ux-support-access` (the support-access strings).
- **Sources:** `words-other-32`, `words-practice-10`.
- **Verification:** corrected: the members' counts differ (660 and 656, or 620 and 70); the exact split is not load-bearing and is left out; both forms are common across the copy
- **Notes:** `shell.tsx` and the support-access page are #42 files: their strings after #42 merges; the lint and every other file now (land the rule with its fixes, or with listed exemptions, so `pnpm lint:copy` stays green). Style chosen under the co-founder's ruling: the curly apostrophe.

### UX-169 (C-150). The platform administrator's rail has three 'support' entries and a 'Terms of use' that is not the terms

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 4 routes, 1 roles.
- **Roles:** operator.
- **Screens:** `account.devices.internal-shell.1280`, `console.support.default.1280`, `console.tickets.default.1280`, `console.terms.default.1280`, `terms.internal.1280`.
- **Routes:** `/console/support`, `/console/tickets`, `/support`, `/console/terms`.
- **Evidence:** The rail lists 'Support' (support grants), 'Support tickets' (the desk) and, under Account, 'Help and support' (the customer's ticket form) (`apps/web/src/components/shell.tsx:238-240,264-268,291-293`). The page behind 'Support' is headed 'Support' (`console/support/page.tsx:32`) though it holds only grants. The console's 'Terms of use' opens the versions and the publish form, headed 'Terms of use' (`console/terms/page.tsx:27`), the same words as the customers' 'PaidWhole terms of use' page the administrator also reaches. Confirmed at 4d99df8.
- **Rule:** Silent in the PRD and brand rules on rail labels (`docs/product/PRD.md:298` names the screen 'Support: open support grants'): recommended
- **Fix:** Name rail items by what they hold (taken under the co-founder's ruling): 'Support grants' (page heading the same), 'Support tickets', and 'Terms versions' (heading 'Terms of use: versions'). Hide the customer 'Help and support' link for internal roles, who work the desk. Update the e2e specs that find the rail link by name.
- **Size:** S.
- **Files:** `apps/web/src/components/shell.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/app/console/terms/page.tsx`, `apps/web/src/components/help.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/components/shell.tsx`, `apps/web/src/app/console/support/page.tsx`, `apps/web/src/components/help.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 68 `co-001/ux-skip-and-rail`.
- **Sources:** `flows-other-28`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges (`shell.tsx`, `help.ts`, `console/support/page.tsx`). Whatever UX-026 (C-094) decides the customer-facing agreement is called ('Terms of use' or 'Terms of service'), the console label follows it.

### UX-170 (C-160). Staff sign-in takes two key ceremonies and a retyped email after registering a key, and every customer reads a staff-only card above the sign-in links

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 3 routes, 2 roles.
- **Roles:** operator, anyone signing in.
- **Screens:** `sign-in-register-key.default.1280`, `sign-in-hardware-key.reason-key-registered.1280`, `sign-in-hardware-key.reason-hardware-key-required.1280`, `sign-in.default.1280`.
- **Routes:** `/sign-in/register-key`, `/sign-in/hardware-key`, `/sign-in`.
- **Evidence:** After 'Register hardware key' the person is sent to `/sign-in/hardware-key?reason=key_registered`, and the pending sign-in that held the email is cleared (`apps/web/src/lib/routes/sign-in.ts:87-89`), so the Email field is empty and they type it and touch the key again; the same page still ends 'No key registered yet? Sign in with your password and code once to register it.' (`sign-in/hardware-key/page.tsx:28-34`) right under 'Your hardware key is registered'. Two notices stack above the form there (`:17-18`). On `/sign-in` the bordered 'PaidWhole staff sign in with a hardware key' card sits between the customer's sign-in card and the links (`sign-in/page.tsx:32`; `sign-in/notice.tsx:34-44`), as heavy as the form though it concerns four internal roles. Confirmed at 4d99df8.
- **Rule:** `docs/brand/BRAND.md:122` (Sign-in: stacked lockup, Paper ground, nothing else decorative); `PRD.md:266` (internal roles see the hardware-key requirement: one line meets it); silent on step count: recommended
- **Fix:** After registration, keep a short-lived sealed HttpOnly cookie naming the account (never the URL) instead of clearing it outright, so `/sign-in/hardware-key` opens with the Email filled and 'Sign in now' starting the key prompt; hide 'No key registered yet?' when the reason is `key_registered`. On `/sign-in`, replace the staff card with one line under the form: 'PaidWhole staff: sign in with a hardware key.' (a link). On `/sign-in/hardware-key`, show the staff note only when no reason notice is shown.
- **Size:** S.
- **Files:** `apps/web/src/app/sign-in/hardware-key/page.tsx`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/notice.tsx`, `apps/web/src/components/hardware-key.tsx`, `apps/web/src/lib/routes/sign-in.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 64 `co-001/ux-sign-in-words`.
- **Sources:** `flows-other-19`.
- **Verification:** corrected: the pending sign-in is cleared at `routes/sign-in.ts:87-89` (the member cited :86-88)
- **Notes:** Lands with UX-006 (C-005) and UX-066 (C-075) (the sign-in pages). Words taken under the co-founder's ruling.

### UX-171 (C-172). The published response target 'one business day, four hours in April to June' reads as a puzzle

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 3 roles.
- **Roles:** practice administrator, billing manager, support staff.
- **Screens:** `support.default.1280`, `support.error.1280`, `console.tickets.default.1280`.
- **Routes:** `/support`, `/console/tickets`.
- **Evidence:** 'We answer within one business day, four hours in April to June.' (`apps/web/src/app/support/page.tsx:43` with `RESPONSE_TARGET`, `apps/web/src/lib/routes/support.ts:40`); the console reads the same. The words come from `PRD.md:798,` which does not say whether the four hours are business hours.
- **Rule:** CO-11 and the brief's honest-claims rule (a published commitment a customer can hold us to); `docs/product/PRD.md:798`
- **Fix:** `RESPONSE_TARGET` -> 'one business day, and within four hours from April through June', so the page reads 'We answer within one business day, and within four hours from April through June.' The commitment itself (`PRD.md:798`) is unchanged.
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/support.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 80 `co-001/ux-support-tickets`.
- **Sources:** `words-other-26`.
- **Verification:** confirmed
- **Notes:** Wording only: the promise stays `PRD.md:798`'s. Whether 'four hours' means business hours is a product question the PRD leaves open; the co-founder may answer it (delegated), and if the answer is business hours, one word is added. Not on `HANDOFF.md`'s counsel list. Words chosen under the co-founder's ruling (above).

### UX-172 (C-174). The site-wide not-found speaks to an account and a workspace the visitor may not have

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 3 roles.
- **Roles:** signed-out visitor, screening prospect, any signed-in role.
- **Screens:** `not-found.public.1280`.
- **Routes:** `/console`, `(any unknown path)`.
- **Evidence:** Signed out at `/console`: 'Not found / This page does not exist, or your account has no current access to it. Access to a practice comes from your organization's membership or a grant the practice approved. / Go to your workspace' (`apps/web/src/app/not-found.tsx:14-18`).
- **Rule:** `docs/product/PRD.md:256` (an error with a next step that works for the reader)
- **Fix:** 'Not found / This page does not exist, or it needs an account with access to it. Check the address, or sign in and open it from your workspace.' with the link 'Sign in' when there is no session and 'Go to your workspace' when there is (a session-cookie presence check, as UX-156 (C-142)'s header).
- **Size:** S.
- **Files:** `apps/web/src/app/not-found.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 62 `co-001/ux-not-found`.
- **Sources:** `words-other-39`.
- **Verification:** confirmed
- **Notes:** `/console` itself gets a page in UX-052 (C-108). Words chosen under the co-founder's ruling (above).

### UX-173 (C-182). Confirmation checkboxes are labelled with an 80-word consequence ending in a bare command ('Adjust it.', 'Reverse it.', 'Write it off.')

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, contract specialist.
- **Screens:** `p.case.error.1280`, `p.reconciliation.error-reverse.1280`, `p.abstraction-ledger.error-adjust-zero.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`, `/p/[practiceId]/reconciliation`, `/p/[practiceId]/abstraction/ledger`.
- **Evidence:** The required checkbox's label is the whole consequence paragraph then an imperative: '{ADJUSTMENT_CONSEQUENCE} Adjust it.' (`apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx:39`), '{REVERSAL_CONSEQUENCE} Reverse it.' (`reconciliation/page.tsx:46`), '{WRITE_OFF_CONSEQUENCE} Write it off.' (`cases/[caseId]/page.tsx:222`). Ticking a command reads oddly, and a screen reader announces the full paragraph as the checkbox's name.
- **Rule:** `docs/product/PRD.md:302` (a destructive action confirms with the consequence stated); WCAG 2.1 SC 1.3.1 (the consequence tied to the control as its description); otherwise no written rule on a checkbox's label; recommended
- **Fix:** Label each box with what the person confirms, and keep the consequence as visible text above it, tied by `aria-describedby`: 'I understand this writes a new ledger entry in my name'; 'I understand this reverses the match and moves recovered back'; 'I understand the line leaves the actionable total'.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 37 `co-001/ux-reconciliation-order`.
- **Sources:** `words-practice-44`.
- **Verification:** confirmed
- **Notes:** 'moves recovered back' is a clause the copy lint reads; keep the proof label: 'moves recovered (posted or deposited) back'. PR #51 changes all three pages: land after it. Words chosen under the co-founder's ruling (above).

### UX-174 (C-184). Remittance and upload pages speak X12 ('The 835 transaction set 0001 of interchange 050080001', 'Trace (TRN02)', 'ST02 0001 (segment 3)', 'Receipt fcd812dc'), and 'Patient responsibility' here is 'Patient share' everywhere else

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 3 routes, 2 roles.
- **Roles:** billing manager, viewer.
- **Screens:** `p.remittance.default.1280`, `p.upload.default.1280`, `p.uploads.default.1280`, `p.remittances.default.1280`.
- **Routes:** `/p/[practiceId]/remittances/[remittanceId]`, `/p/[practiceId]/uploads/[documentId]`, `/p/[practiceId]/uploads`.
- **Evidence:** Remittance: 'The 835 transaction set 0001 of interchange 050080001.' (`apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx:63`), 'Trace (TRN02)' (:79), 'Payee 9950828159' with no word for the number, and a 'Patient responsibility' column (:155) while Claims and lines, the line page and the packet say 'Patient share'. Receipt: heading 'Receipt fcd812dc' (`uploads/[documentId]/page.tsx:243`) and 'ST02 0001 (segment 3)' (:102).
- **Rule:** No written rule; recommended (the brief's goal: one product, and its words lens: plain language)
- **Fix:** Lead with the billing manager's words and keep the X12 references as secondary detail: 'One payment from the 835 file received 2026-10-26 (envelope 050080001, set 0001).'; 'Trace (TRN02)' -> 'Check or EFT trace number'; 'Payee 9950828159' -> 'Payee NPI 9950828159' (or 'Payee tax ID', by the qualifier); 'Patient responsibility' -> 'Patient share'; 'Receipt fcd812dc' -> '835 remittance received 2026-10-26 01:25 UTC' with 'Document fcd812dc' under it; 'ST02 0001 (segment 3)' -> 'Payment 1 (transaction set 0001)'.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx`, `apps/web/src/app/p/[practiceId]/uploads/[documentId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 41 `co-001/ux-codes-in-words`.
- **Sources:** `words-practice-50`.
- **Verification:** confirmed
- **Notes:** Uploads keep no original filename (PHI may sit in it; `CLAUDE.md` Never-list), so a kind and a time are the honest name for a document. PR #54 changes the upload receipt page: land after it. Words chosen under the co-founder's ruling (above).

### UX-175 (C-187). Empty states describe the viewer's own role in the third person ('a billing manager can generate one') right under the form they can use

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 3 roles.
- **Roles:** billing manager, analyst, viewer.
- **Screens:** `p.roi.empty.1280`, `p.reports.empty.1280`, `p.reports.default.1280`.
- **Routes:** `/p/[practiceId]/reports/roi`, `/p/[practiceId]/reports`.
- **Evidence:** Shown to a billing manager, with the Generate form above: 'No ROI statement yet / The quarter’s statement is written once its quarter ends; a billing manager can generate one for any period now.' (`apps/web/src/app/p/[practiceId]/reports/roi/page.tsx:61`) and 'No audit report yet / A billing manager or analyst generates one from the pricing run in effect for its period.' (`reports/page.tsx:112`).
- **Rule:** `docs/product/PRD.md:260` (an empty state says what to do next); `docs/brand/BRAND.md:23` ('warm')
- **Fix:** Choose the sentence by whether the viewer can act (the pages already render the form only for those roles): to a role that can, 'No ROI statement yet. Choose a period above and generate one; the quarter's statement is written automatically once the quarter ends.' and 'No audit report yet. Choose a pricing run above and generate the report.'; to a role that cannot, keep naming who does it.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/reports/roi/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 55 `co-001/ux-roi-words`.
- **Sources:** `words-practice-54`.
- **Verification:** confirmed
- **Notes:** The ROI pages carry audit #46 (the seal), queued; this empty state is not the seal. Words chosen under the co-founder's ruling (above).

### UX-176 (C-194). The UI's greys and interaction colours sit outside `BRAND.md`'s palette and mix cool greys with the warm Line and Paper, and the primary button's hover is imperceptible (1.13:1 against Ink)

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 4 routes, 1 roles.
- **Roles:** all users (visual).
- **Screens:** `console.organizations.default.1280`, `p.home.default.1280`, `request-audit.default.1280`, `console.status.default.1280`.
- **Routes:** `/console/organizations`, `/p/[practiceId]`, `/request-audit`, `/console/status`.
- **Evidence:** `packages/brand/src/tokens.css:26-27`, :32 and :34 add cool greys (raised #F7F8FA, inset #EFF1F4, border-strong #B9BEC8, input-border #808996) beside the brand's warm Line (#DAD7CF, the card and table rules) and Paper; :39-42 add primary-hover #15284A, link #1F4E9A and focus #2F5DA8. `docs/brand/BRAND.md:64-71` lists none of them; ADR 0058 asked the brand owner only about input-border and danger-bg. On the console's organizations page beige table rules sit beside cool-grey rail and badge fills. primary-hover is about 1.13:1 against Ink (about 1.08:1 in dark), so a hovered primary button does not visibly change.
- **Rule:** `docs/brand/BRAND.md:59-71` (the palette); ADR 0058 D9 (the brand owner alone changes the palette)
- **Fix:** Recommended to the brand owner: adopt link, focus and the surface tokens into `BRAND.md` section 4; retune raised, inset, border-strong and input-border into the warm family of Line and Paper, keeping input-border at 3:1 or more on White, Paper and the raised surface; give primary-hover a visible step in both themes (1.5:1 or more against the resting fill). The colours change in `tokens.css` and `tokens.ts` only, with no component edit.
- **Size:** S.
- **Files:** `packages/brand/src/tokens.css`, `packages/brand/src/tokens.ts`, `docs/brand/BRAND.md`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 90 `co-001/ux-palette`.
- **Sources:** `brand-16`.
- **Verification:** confirmed
- **Notes:** Founder's (the brand owner, ADR 0058 D9): a palette change, through the co-founder. Question: (a) leave the palette as it is; (b) adopt link, focus and surfaces into `BRAND.md` as they are; (c) adopt them, retune the greys warm and give the hover a visible step (recommended: one quiet, warm family, and a hover a person can see). Passes the reviewer recorded: no raw colour in component code, brass never text, the mark and lockup right in every light shot. Observation for the synthesizer: the packet's 'Deadline verified' chip uses 'Verified', which the brand keeps for the ledger-gated seal (ADR 0056 renames the rate-record case 'Fields checked'); not raised as a finding here.

### UX-177 (C-140). The settings section nav: link-blue pills unlike the rail, six rows above every settings page at 390 px, and 10 px 'admin' badges explained only in a hover title

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.settings.default.1280`, `p.settings.empty.1280`, `p.settings.default.390`, `p.access-log.default.390`, `p.agreements.non-admin.390`, `p.correspondence.read-only.1280`, `p.settings.default.1280-dark`.
- **Routes:** `/p/[practiceId]/settings`, `/p/[practiceId]/settings/*`.
- **Evidence:** The section tabs are bordered pills whose text is link blue because they are links with no text colour (`apps/web/src/components/settings/nav.tsx:35-43`), while the rail's links are in the text colour; the active tab is marked by the inset fill (#EFF1F4 on white, 1.13:1) and weight 500. Seven tabs carry a 10 px 'admin' badge (`nav.tsx:44-48`, a size the type scale lacks, ADR 0056:48-50) whose meaning, 'Changes here are for the practice administrator', is only a `title`, and whose word joins the tab's name ('Proof level admin'). At 390 px the eleven pills wrap to six rows, about 230 px, before any content on every settings page. A billing manager's Settings overview shows the heading, 'Your role: Billing manager.', the tabs and nothing else, so it does not say what this person can change. Confirmed at 4d99df8.
- **Rule:** `docs/brand/BRAND.md:120-121` (one brass underline marks the active navigation item; Brass's only job); ADR 0056:48-50 (no 10 px size); WCAG 2.1 1.4.11 (the active cue), 2.1.1 and 2.4.6 (hover-only meaning); `docs/product/PRD.md:260`. Silent on sub-navigation: recommended
- **Fix:** Set the tabs in the text colour (`text-fg`, no underline); the current tab gets `aria-current`, weight 600 and a `border-fg` outline (15:1, not brass, which stays the rail's, and not the 1.13:1 fill alone). Drop the per-tab badges: list the administrator's sections after the others under a small heading, 'For the practice administrator'. Below `sm`, the sections fold into one 'Settings sections' disclosure with the current one first. The overview gets one line for roles that are not the practice administrator. Words (taken under the co-founder's ruling): 'The sections for the practice administrator are changed by that role. You can change Notification preferences, Materiality and pursuit and Pricing settings.' (checked against each route's permission when written).
- **Size:** S.
- **Files:** `apps/web/src/components/settings/nav.tsx`, `apps/web/src/app/p/[practiceId]/settings/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 53 `co-001/ux-settings-pages`.
- **Sources:** `brand-15`, `narrow-practice-2-21`, `a11y-practice-2-22`, `words-practice-43`.
- **Verification:** confirmed
- **Notes:** Settled: the active cue is an Ink outline with weight (a11y-practice-2-09's measure: the inset fill alone is 1.13:1); the admin marking is a grouping heading (narrow-practice-2-21), which removes the 10 px size and the hover-only meaning together. brand-15's rail half (the active item's second cue) is UX-084 (C-026). Not a #42 file. PR #51 changes the home, not these.

### UX-178 (C-152). A signed-in person who reaches a missing record gets the public not-found page: no Menu, no account, one link to the first practice

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** billing manager, packet approver, practice administrator.
- **Screens:** `not-found.signed-in.390`.
- **Routes:** `/p/[practiceId]/**`.
- **Evidence:** `not-found.signed-in.390` (a packet approver on `/p/<unknown>/cases`) shows the public header, then 'Not found … Go to your workspace', byte-identical to the signed-out page: no Menu, switcher or account. The link goes to '/' (`apps/web/src/app/not-found.tsx:16`), which opens the person's first practice, not the one they were in. The same page answers an unknown case, packet, line or contract inside a practice the person can open, so a stale link from a notification leaves them outside their practice. Cause: `not-found.tsx:6-22` renders `PublicHeader`, and the route wrapper turns `not_found` into Next's `notFound()` (`apps/web/src/lib/http/next.ts`). Confirmed at 4d99df8.
- **Rule:** `docs/product/PRD.md:256` (every error shown with a next step) and `:260` (the shell's navigation on every screen); WCAG 2.1 3.2.3 Consistent Navigation. Silent on the signed-in not-found: recommended
- **Fix:** Inside a practice the person can open, an unknown child record renders in the frame: the route result carries a `not_found` kind the page draws inside `AppShell` (as it draws 'forbidden'), an EmptyState with a link back to the parent list. Words (taken under the co-founder's ruling; the page's own words are UX-172 (C-174)'s): 'This case is not in this practice any more, or the link is wrong.' with 'Back to Cases' (Claims and lines, Contracts likewise). An unknown or unreachable practice keeps the root not-found's single answer, so whether a practice exists is never disclosed.
- **Size:** M.
- **Files:** `apps/web/src/app/not-found.tsx`, `apps/web/src/lib/http/next.ts`, `apps/web/src/lib/http/invoke.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 62 `co-001/ux-not-found`.
- **Sources:** `narrow-practice-1-17`.
- **Verification:** confirmed
- **Notes:** Keeps the rule at `not-found.tsx:5` (an unknown practice and an unreachable one look the same). The in-frame state reuses `AppShell` without changing `shell.tsx`, so it need not wait for #42. Land with UX-172 (C-174), which rewrites the root page's words.

### UX-179 (C-163). Notification preferences are one switch for every practice, and staff with no practice access are offered practice digests

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** billing manager, organization administrator, operator.
- **Screens:** `account.notifications.default.1280`, `account.notifications.internal-shell.1280`, `account.notifications.saved.1280`.
- **Routes:** `/account/notifications`.
- **Evidence:** The card offers two checkboxes 'For every practice you reach' (`apps/web/src/app/account/notifications/page.tsx:36-53`): a firm analyst or a group's billing manager cannot keep the digest for the practices they work and drop the others. The platform administrator, whose header reads 'No practice access', sees the same two practice digests, which can never reach them. The preferences are one object in the user's settings, whose database check admits only `notifications.digest_email` and `notifications.in_app` (`user_settings_valid`, migration `20261020090000_monitoring_digests_notifications.sql:144-150`; `packages/db/src/schema/tenancy.ts:66-73`). Confirmed at 4d99df8.
- **Rule:** Silent in the PRD on per-practice preferences (`docs/product/PRD.md:282` lists notification preferences under Settings): recommended
- **Fix:** List the practices the person reaches, each with its digest-by-email and in-app choices, plus 'All practices' to set them together; the digest job honours the per-practice choice. For a person with no practice access, say 'You reach no practice, so no digest is sent.' and offer only what applies to their role. Group the checkboxes in a fieldset (UX-146 (C-155)).
- **Size:** M.
- **Files:** `apps/web/src/app/account/notifications/page.tsx`, `apps/web/src/lib/routes/monitoring.ts`, `apps/worker/src/digest/job.ts`, `packages/db/src/schema/tenancy.ts`.
- **Migration:** yes, for Lane A: Widen `user_settings_valid` (migration `20261020090000`, recreated in a new migration) to admit `notifications.practices`, an object keyed by practice ID whose values hold optional `digest_email` and `in_app` booleans; update `UserSettings` in `packages/db/src/schema/tenancy.ts` (a #42 file, `pr42-files.txt` line 132, so after #42 merges) and regenerate the domain model and function files.
- **#42:** yes: `apps/worker/src/digest/job.ts`, `packages/db/src/schema/tenancy.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 60 `co-001/ux-account-pages` (the staff wording).
- **Sources:** `flows-other-26`.
- **Verification:** corrected: the member left open whether per-practice choices fit the settings JSON without DDL; the database check admits only the two booleans today (`user_settings_valid`), so it needs a migration
- **Notes:** The per-practice part goes to Lane A under 'Handed to Lane A' (it also touches #42's `digest/job.ts` and `tenancy.ts`); the staff wording ('You reach no practice, so no digest is sent.') lands in Lane B without it. Words taken under the co-founder's ruling.

### UX-180 (C-171). A failed hardware-key registration is titled 'Not signed in', and 'did not answer' also covers a cancelled prompt

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** platform administrator, contract specialist, support staff.
- **Screens:** `sign-in-register-key.error.1280`.
- **Routes:** `/sign-in/register-key`.
- **Evidence:** 'Not signed in / The hardware key did not answer. Connect it and try again.' on the registration step: the problem's title is fixed for both flows (`apps/web/src/components/hardware-key.tsx:31-32`), and registration's catch (:116) also covers a cancelled or timed-out prompt.
- **Rule:** `docs/product/PRD.md:256` (an error that says what happened, with a next step)
- **Fix:** Pass the title per flow. On `/sign-in/register-key`: 'Not signed in' -> 'Not registered'; 'The hardware key did not answer. Connect it and try again.' -> 'The key was not registered: it did not answer, or the request was cancelled. Connect it, press Register hardware key, and touch the key when it asks.'
- **Size:** S.
- **Files:** `apps/web/src/components/hardware-key.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 64 `co-001/ux-sign-in-words`.
- **Sources:** `words-other-30`.
- **Verification:** confirmed
- **Notes:** Words chosen under the co-founder's ruling (above).

### UX-181 (C-185). Upload refusals name the file by position ('File 1 is empty.') and give no next step; the template mapper calls an empty file 'not a CSV with a header row'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 3 routes, 1 roles.
- **Roles:** billing manager.
- **Screens:** `p.reconciliation.error-empty-file.1280`, `p.uploads.error-era-system.1280`, `p.template.error.1280`.
- **Routes:** `/p/[practiceId]/reconciliation`, `/p/[practiceId]/uploads`, `/p/[practiceId]/reconciliation/template`.
- **Evidence:** 'Nothing was uploaded / File 1 is empty.' and 'File 2 is larger than 2.0 GiB; split it or zip it.' (`apps/web/src/components/uploads/uploader.tsx:189-191`): in a batch of 40 the person cannot tell which file is meant, though the uploader holds the names in the browser. The template mapper calls an empty file 'That file is not a CSV with a header row.' (`apps/web/src/components/reconciliation/template-mapper.tsx:76`).
- **Rule:** `docs/product/PRD.md:256` (every error with a next step)
- **Fix:** Name the file as the browser knows it (the name never leaves the browser) and say what to do: 'remit-june.csv is empty (0 bytes). Export it again from the practice-management system and choose it again; the other files were not sent either.'; 'remit-2025.zip is larger than 2 GB. Split it into smaller files or zip it, then choose it again.'; mapper, for a 0-byte file: 'That file is empty. Choose a sample export with its header row and a few rows.'
- **Size:** S.
- **Files:** `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/components/reconciliation/template-mapper.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 47 `co-001/ux-uploader`.
- **Sources:** `words-practice-51`.
- **Verification:** confirmed
- **Notes:** The message is built client-side, as the uploader already does, so no file name reaches the server, a log or a URL (`CLAUDE.md` Never-list). Sizes follow UX-163 (C-178). Words chosen under the co-founder's ruling (above).

### UX-182 (C-193). The home page's title is the brand name: a second live-text 'PaidWhole' in the wordmark's face and weight but not its tracking, directly under the header lockup

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** platform administrator, support staff, any user with no practice.
- **Screens:** `home.default.1280`, `home.default.1280-dark`.
- **Routes:** `/`.
- **Evidence:** `apps/web/src/app/page.tsx:28` sets the H1 'PaidWhole' at 32 px in Schibsted Grotesk 700 with the headline tracking (-0.02em), right under the header's lockup: it reads as a second, off-spec wordmark (the wordmark is -0.03em) and names nothing about the screen, whose empty state says 'No practice to open'.
- **Rule:** `.claude/rules/brand.md:20-22` (the wordmark: display face, 700, -0.03em, never another tracking); `docs/brand/BRAND.md:3-6` (nothing brand-related hard-coded outside the brand's components)
- **Fix:** Title the screen for what it shows, 'Your workspace', with the empty state below it, and leave the name to the lockup.
- **Size:** S.
- **Files:** `apps/web/src/app/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 73 `co-001/ux-console-home`.
- **Sources:** `brand-13`.
- **Verification:** confirmed
- **Notes:** Brand choice under the co-founder's ruling, the rules being silent on page titles: a title names the screen, never the bare brand name. Internal roles go to `/console` instead (UX-052 (C-108)), and the empty state's words are UX-051 (C-020)'s.

### UX-183 (C-195). On the ROI statement the Verified seal floats alone at the right of an empty band, cut off from the title and the figure it attests

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** practice administrator, organization administrator, practice owner (reader).
- **Screens:** `p.roi-statement.default.1280`, `p.roi-statement.default.1280-dark`.
- **Routes:** `/p/[practiceId]/reports/roi/[statementId]`.
- **Evidence:** The seal and its definition sit alone, right-aligned (`apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx:50`, `className='self-end'`), in a band about 170 px tall whose left two-thirds are empty, above the 'Recomputed from its entries' notice and away from the Recovered card it attests.
- **Rule:** `docs/brand/BRAND.md:111-114` (the definition renders with the seal on the same page: met) and :140 (on a report cover, the seal sits bottom right when earned); the brand is silent on the seal's place on a web page; recommended
- **Fix:** Put the seal, with its definition under it, in the right-hand slot of the page header (UX-157 (C-192)'s `PageHeader`), beside the title and lede, so it reads as the statement's mark and leaves no empty band.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/components/brand/Verified.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** audit #46, `co-001/verified-seal`: the seal's place: #46 lands first, as queued, and the page-header PR then moves the seal into the header's right slot
- **Proposed PR:** none; folded into the in-flight item above.
- **Sources:** `brand-17`.
- **Verification:** corrected: the seal is at `reports/roi/[statementId]/page.tsx:50` at 4d99df8 (brand-17 cites :49); the rest confirmed
- **Notes:** Audit #46 owns `components/brand/Verified.tsx` and the ROI pages, so the seal's place folds into it. Brand choice under the co-founder's ruling: the page header's right slot. audit #46 lands first, as queued (`LANES.md` queue item 6, before any ROI statement reaches a customer), and places the seal in the ROI page's header area as today's markup allows; the page-header PR (`co-001/ux-page-header`) then moves it into the slot. So audit #46 does not wait on a PR that is not in flight.

### UX-184 (C-198). 'Find a packet by its reference': the Find button hangs beside the hint, about 20 px below the field it submits, and is a hand-drawn button

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.cases.empty-filtered.1280`, `p.cases.empty-filtered.390`.
- **Routes:** `/p/[practiceId]/cases`, `/p/[practiceId]/cases/by-reference`.
- **Evidence:** The row aligns `items-end` while the field's column ends in the hint paragraph (`apps/web/src/components/packets/reference-search.tsx:6-13`), so the button aligns to the hint, not the field; the button is a raw `<button className='h-9 rounded-md border px-3'>` (:14-16), not the app's `Button`, so it has regular weight and no hover. At 390 px it wraps under the hint.
- **Rule:** No written alignment rule; recommended (a control aligns with the field it acts on); the app's `Button` is the one button style (`packages/ui/src/components/button.tsx`)
- **Fix:** Field and button in one row, the hint under both: label; then a row of `<Input className='min-w-0 flex-1'/>` and `<Button type='submit' variant='outline'>Find</Button>`; then the hint, still tied by `aria-describedby`, so the button stays level with the field at every width.
- **Size:** S.
- **Files:** `apps/web/src/components/packets/reference-search.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 35 `co-001/ux-cases-list-first`.
- **Sources:** `retake-03`.
- **Verification:** confirmed
- **Notes:** UX-125 (C-063) moves this search beside the Cases filters; build it this way there.

### UX-185 (C-201). The audit-request field 'Locations' does not say it wants a number

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 2 roles.
- **Roles:** audit requester, screening prospect.
- **Screens:** `request-audit.default.1280`, `screening-result.default.1280`.
- **Routes:** `/request-audit`, `/screening/results/[resultId]`.
- **Evidence:** A number field labelled 'Locations' (`apps/web/src/app/request-audit/page.tsx:57`; `apps/web/src/components/screening/convert-form.tsx:60`) reads as 'list your locations'.
- **Rule:** WCAG 2.1 SC 3.3.2 (labels or instructions)
- **Fix:** 'Locations' -> 'Number of locations' on both forms.
- **Size:** S.
- **Files:** `apps/web/src/app/request-audit/page.tsx`, `apps/web/src/components/screening/convert-form.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 63 `co-001/ux-screening-result-first`.
- **Sources:** `words-other-24`.
- **Verification:** confirmed
- **Notes:** Words chosen under the co-founder's ruling (above).

### UX-186 (C-205). Reconciliation puts its work, the unmatched items, below totals, template, uploader and export history; the case ledger does not say which case it is, and links to itself

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, viewer.
- **Screens:** `p.reconciliation.default.1280`, `p.reconciliation.case-ledger.1280`, `p.reconciliation.reverse-open.1280`, `p.reconciliation.viewer.1280`.
- **Routes:** `/p/[practiceId]/reconciliation`, `/p/[practiceId]`.
- **Evidence:** The page runs Ledger totals, Posting template (`apps/web/src/app/p/[practiceId]/reconciliation/page.tsx:242`), Upload exports (:257), Exports (:280), then 'Unmatched: counted in no total' (:312-313), so the one row to act on ('Match to this remittance') starts about y 1,450. With `?case=` the heading becomes 'Case ledger' (:223) with no payer, plan or case named, and every entry's 'Case ledger' link points back to the same page (:122, :169). The home's 'Payments, postings and deposits matching nothing' queue lands at the top of the page, not the unmatched section.
- **Rule:** `docs/product/PRD.md:280` (Reconciliation: unmatched adjusted payments; match manually; reverse a match); `PRD.md:267` (jump to any queue)
- **Fix:** Order the page by work: Unmatched first (its count in the heading, an `#unmatched` anchor the home queue links to), then the case lines, then totals and entries; fold Posting template and the uploader into one 'Exports' card with its history. On the case ledger, title it with the case ('Case ledger: SYNTHETIC PAYER L, plan SYNPLAN-FIX-LED'), link back to the case, and drop the self-links.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/app/p/[practiceId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 37 `co-001/ux-reconciliation-order`.
- **Sources:** `flows-practice-21`.
- **Verification:** confirmed
- **Notes:** The member marked it audit #12; the page order is outside audit #12's scope (amounts in payment terms), so it lands after PR #51, which changes this page and the home. Words chosen under the co-founder's ruling (above).

### UX-187 (C-207). The monthly summary opens on last calendar month, which is usually empty because service months lag remittances; nothing lists the months that have lines

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.monthly.default.1280`, `p.monthly.month.1280`, `p.reports.default.1280`, `p.reports.audit-reports.1280`.
- **Routes:** `/p/[practiceId]/reports/monthly`, `/p/[practiceId]/reports`.
- **Evidence:** The summary and the Reports card's month field default to the previous calendar month (`apps/web/src/lib/routes/monitoring.ts:131`, :169, `params.month ?? lastMonth()`; `apps/web/src/app/p/[practiceId]/reports/page.tsx:198`). On MONITORING that is September 2026, all zeros with 'No line has a service date in 2026-09', though March 2026 holds $90.00 actionable on 3 lines. The person must guess which month to type, and 'Generate the month's PDF' would print an empty month.
- **Rule:** `docs/product/PRD.md:281` (Reports: monthly summary); `PRD.md:260` (an empty state that says what to do next)
- **Fix:** Default to the latest service month that has priced lines, and offer the months that have lines as a select with their actionable totals (newest first), so the month is chosen, not typed; when a chosen month is empty, name the nearest months that have lines ('No line has a service date in September 2026. Lines are in March 2026 and April 2026.').
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/monitoring.ts`, `apps/web/src/app/p/[practiceId]/reports/monthly/page.tsx`, `apps/web/src/app/p/[practiceId]/reports/page.tsx`, `apps/web/src/lib/routes/reports.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 29 `co-001/ux-dates`.
- **Sources:** `flows-practice-30`.
- **Verification:** confirmed
- **Notes:** Months are written per UX-027 (C-097) and UX-167 (C-181). Words chosen under the co-founder's ruling (above).

### UX-188 (C-208). 'The practice's own places of service are set by PaidWhole on request' gives no way to make the request

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 3 roles.
- **Roles:** billing manager, practice administrator, viewer.
- **Screens:** `p.pricing-settings.places.1280`, `p.pricing-settings.default.1280`, `p.pricing-settings.viewer.1280`.
- **Routes:** `/p/[practiceId]/settings/pricing`.
- **Evidence:** Places of service ends 'The practice’s own places of service are set by PaidWhole on request.' (`apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx:160`) with no link, while the card above offers 'Contact support' for a move.
- **Rule:** `docs/product/PRD.md:256` (every error with a next step); `PRD.md:260`
- **Fix:** Link the sentence to a pre-filled request, 'Ask PaidWhole to set a place of service', opening `/support` with the practice and the topic chosen, for the roles that hold `pricing_settings.set`; name who asks for the others ('Your billing manager or practice administrator asks PaidWhole to set it.').
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 53 `co-001/ux-settings-pages`.
- **Sources:** `flows-practice-31`.
- **Verification:** confirmed
- **Notes:** Words chosen under the co-founder's ruling (above).

### UX-189 (C-161). Password fields have no 'Show password'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 1 roles.
- **Roles:** anyone signing in.
- **Screens:** `sign-in-new-password.default.390`, `sign-in-new-password.error-mismatch.390`, `sign-in-new-password.error-policy.390`, `sign-in.default.390`.
- **Routes:** `/sign-in/new-password`, `/sign-in`.
- **Evidence:** The new password must be at least 12 characters with a lowercase and an uppercase letter, a digit and a symbol, typed twice and masked on a phone keyboard (`apps/web/src/app/sign-in/new-password/page.tsx:28-29`); the sign-in password is masked too (`sign-in/page.tsx:28`). The mismatch and policy refusals are the ones a phone produces most. Confirmed at 4d99df8.
- **Rule:** WCAG 2.2 3.3.8 Accessible Authentication (Minimum) is met (a password manager can fill the field); otherwise silent: recommended
- **Fix:** A `PasswordField` in `components/field.tsx` with a 'Show password' button (`aria-pressed`, `aria-controls`) that switches the input's type, the text staying in the field, used on sign-in and both new-password fields; autocomplete unchanged. After a refusal the fields still clear on purpose (UX-001 (C-001)'s security exception), and the toggle returns to hidden.
- **Size:** S.
- **Files:** `apps/web/src/components/field.tsx`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/new-password/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 64 `co-001/ux-sign-in-words`.
- **Sources:** `narrow-other-23`.
- **Verification:** confirmed
- **Notes:** Words taken under the co-founder's ruling: 'Show password' / 'Hide password'.

### UX-190 (C-166). The case summary card opens with a 48 px empty band and stacks eleven facts and a second Owner control into an 865 px card at 390 px

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.case.default.390`, `p.case.error.390`, `p.case.write-off-open.390`, `p.case.viewer.390`, `p.case.empty.390`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`.
- **Evidence:** On `p.case.error.390` the summary card runs from about y=300 to y=1,165: its first 48 px are empty, then eleven label-over-value facts, then 'Owner' again as a select with Assign under 'Owner Unassigned'; 'Lines (3)' begins near y=1,560. Causes, confirmed at 4d99df8: the card's own padding plus `CardContent className="pt-6"` with no header (`p/[practiceId]/cases/[caseId]/page.tsx:70-71`); the definition list is one column below `sm` (`:72`); the Owner fact and the Assign form's Owner select repeat each other (`:101-124`).
- **Rule:** ADR 0056:53 (a definition list stacks its terms over their values: kept); the spacing tokens (`packages/brand/src/tokens.css:64-69`). Silent on density at phone width: recommended
- **Fix:** Drop `pt-6` from the summary's `CardContent` (or give the card a header with the case's state), so the band goes. Below `sm`, set the short money and date facts in a two-column grid of label-over-value pairs (Actionable | Written off; Payer approved | Recovered; Deadline | Materiality; Opened | Closed), keeping long-text facts full width. Where the person can assign, the Owner fact is the select itself, labelled 'Owner', with Assign beside it; viewers see the plain fact.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 12 `co-001/ux-case-summary`.
- **Sources:** `narrow-practice-1-20`.
- **Verification:** confirmed
- **Notes:** Open PR #51 (audit #12) changes the case page: land after it. Combined audit #89 (one case status) and audit #125 (case lines and layout, Lane A's PR 13) will touch this page; fold in there if Lane A's PR 13 is near. Layout only: no figure or stage changes.

### UX-191 (C-173). The ticket's no-PHI refusal asks for 'the record's opaque ID'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** practice administrator, billing manager.
- **Screens:** `support.error.1280`.
- **Routes:** `/support`.
- **Evidence:** '... and name the screen and the record’s opaque ID instead' (`apps/web/src/lib/routes/support.ts:243`): 'opaque' is engineering language, while the card above says 'the record's ID from its address'.
- **Rule:** The brief's plain-language rule; `docs/brand/BRAND.md:23`
- **Fix:** 'A ticket takes no patient information. Remove names, dates of birth, member IDs, claim numbers, other identifiers and phone numbers, and name the screen and the record’s ID from the page address instead.'
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/support.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 80 `co-001/ux-support-tickets`.
- **Sources:** `words-other-27`.
- **Verification:** confirmed
- **Notes:** UX-058 (C-109)'s context link makes the copying unnecessary once it lands. The 'subject:' key prefix is the field-key defect owned by `co-001/ux-forms`. Words chosen under the co-founder's ruling (above).

### UX-192 (C-175). An out-of-range document page reads 'page 99 of 2' and offers only 'Previous page' (to page 98, also missing)

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, contract specialist.
- **Screens:** `p.contract-version.error-page-missing.1280`.
- **Routes:** `/p/[practiceId]/contracts/versions/[versionId]`.
- **Evidence:** Heading 'Document 0e0335da, page 99 of 2', red 'The document has no such page', and a 'Previous page' link to page 98. Cause: `apps/web/src/components/contracts/display.tsx:66-76` prints the requested page and the previous link whatever the count; the message is `apps/web/src/lib/contracts/display.ts:79`.
- **Rule:** `docs/product/PRD.md:256` (an error with a next step that works)
- **Fix:** When the page is outside 1..pageCount: 'Document 0e0335da has 2 pages; page 99 is not one of them.' with 'Show page 1' and 'Show the cited page (page 2)', and no Previous or Next links.
- **Size:** S.
- **Files:** `apps/web/src/components/contracts/display.tsx`, `apps/web/src/lib/contracts/display.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 51 `co-001/ux-contract-pages`.
- **Sources:** `words-practice-18`.
- **Verification:** confirmed
- **Notes:** Words chosen under the co-founder's ruling (above).

### UX-193 (C-176). The case timeline says 'reopened from Actionable to Actionable, with a reason' and never gives the reason

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, practice administrator.
- **Screens:** `p.case.default.1280`, `p.case.error.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]`.
- **Evidence:** 'Line 1: reopened from Actionable to Actionable, with a reason' then 'Line 1: reopened into the case, with a reason'; the first reads as nothing happening and neither gives the reason, which the line card above shows. Cause: `apps/web/src/lib/cases/timeline.ts:55` always prints from and to; :61 the line reopen.
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); the brief's plain-language rule
- **Fix:** When the stage does not change, say what the reopen undid: 'Line 1: write-off undone; the line stays Actionable (reason on the line)'; 'Line 1: back in the case (reason on the line)'. Show the reason text itself to the roles that read PHI, as Notes do.
- **Size:** S.
- **Files:** `apps/web/src/lib/cases/timeline.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 42 `co-001/ux-internal-names`.
- **Sources:** `words-practice-20`.
- **Verification:** confirmed
- **Notes:** UX-154 (C-141) changes the same file's actor names: one change. Words chosen under the co-founder's ruling (above).

### UX-194 (C-177). Packet lists read '[4] an evidence item 1' and 'Row 1: due —, paid 2026-04-08, —; interest not computed'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.packet.default.1280`, `p.packet.error-export-blocked.1280`.
- **Routes:** `/p/[practiceId]/cases/[caseId]/packet`.
- **Evidence:** Numbered sources: '[4] an evidence item 1 [5] an evidence item 2 ...' (`apps/web/src/lib/packets/view.ts:83`; `apps/web/src/components/packets/display.tsx:397-398`). Interest rows: 'Row 1: due —, paid 2026-04-08, —; interest not computed' (`display.tsx:357`), two dashes standing for unknown values inside a sentence.
- **Rule:** `docs/brand/BRAND.md:23` ('exact'); the brief's plain-language rule
- **Fix:** Sources name the item's kind: '[4] evidence 1: the contract document'. An interest row without a due date: 'Row 1: paid 2026-04-08; interest not computed: the remittance does not say when the payer received the claim.' (the reason from the row's evidence gap, the 835 segment code kept in the trace, not on screen); with a due date it keeps 'Row 1: due 2026-05-11, paid 2026-06-08, 28 days late; interest $1.23'.
- **Size:** S.
- **Files:** `apps/web/src/lib/packets/view.ts`, `apps/web/src/components/packets/display.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 45 `co-001/ux-packet-words`.
- **Sources:** `words-practice-21`.
- **Verification:** confirmed
- **Notes:** The member marked it audit #38; PR #52's design does not touch the sources list or the interest rows, so this follows PR #52 (same `display.tsx`). Words chosen under the co-founder's ruling (above).

### UX-195 (C-180). 'No approved packet version of this practice has this reference.' gives no next step, under the title 'Reference ZZZZZ-ZZZZZ'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** billing manager, packet approver.
- **Screens:** `p.by-reference.empty.1280`.
- **Routes:** `/p/[practiceId]/cases/by-reference`.
- **Evidence:** The no-match card is titled with the reference and says only 'No approved packet version of this practice has this reference.' (`apps/web/src/app/p/[practiceId]/cases/by-reference/page.tsx:49`).
- **Rule:** `docs/product/PRD.md:256` (every error with a next step)
- **Fix:** Title 'No packet found'; body 'No approved packet of this practice has reference ZZZZZ-ZZZZZ. Check it against the payer's letter (two groups of five, such as SK6CS-K6CSK), or switch practice if the letter is for another of yours.'
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/by-reference/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 26 `co-001/ux-empty-states`.
- **Sources:** `words-practice-35`.
- **Verification:** confirmed
- **Notes:** Words chosen under the co-founder's ruling (above).

### UX-196 (C-186). A queued report's checklist says 'windows judged on —' and tells the reviewer to read a PDF and CSV that do not exist yet

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** packet reviewer, reimbursement reviewer.
- **Screens:** `p.report-review.empty.1280`.
- **Routes:** `/p/[practiceId]/reports/[reportId]/review`.
- **Evidence:** 'Service 2026-04-01 to 2026-04-30; windows judged on —. Read the report, its PDF and its line CSV (line-level PHI: the download is recorded), check each finding ..., then sign.' sits above 'The report is not generated yet; the checklist opens once it is ready.', and the PDF and CSV links lead to files not generated (`apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx:42-51` renders the intro and links whatever the report's state).
- **Rule:** `docs/product/PRD.md:260` (a loading or waiting state that says what to do next); `docs/brand/BRAND.md:23`
- **Fix:** While the report is queued, one sentence and no file links: 'Service 2026-04-01 to 2026-04-30. The report is being generated; its PDF, line CSV and this checklist open here once it is ready. Reload in a few minutes.'
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/reports/[reportId]/review/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 27 `co-001/ux-job-status`.
- **Sources:** `words-practice-53`.
- **Verification:** confirmed
- **Notes:** Words chosen under the co-founder's ruling (above).

### UX-197 (C-188). The drop zone tells a phone user to 'Drop 835 files or ERA exports here', and the receipts' empty state says 'drop ... above'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 2 routes, 1 roles.
- **Roles:** billing manager.
- **Screens:** `p.uploads.empty.390`, `p.uploads.default.390`, `p.reconciliation.empty.390`.
- **Routes:** `/p/[practiceId]/uploads`, `/p/[practiceId]/reconciliation`.
- **Evidence:** The zone's heading is 'Drop 835 files or ERA exports here' (`apps/web/src/app/p/[practiceId]/uploads/page.tsx:39`, the default 'Drop 835 files here' at `apps/web/src/components/uploads/uploader.tsx:313`), and the empty state reads '... drop single files, a batch, or a zip of them above.' (`apps/web/src/components/uploads/receipts.tsx:138`): a phone has no drag and drop, and the working control, Choose files, comes last.
- **Rule:** `docs/product/PRD.md:260` (an empty state says what to do next, and it must be doable); no written rule otherwise; recommended
- **Fix:** Head the zone 'Upload 835 files or ERA exports' with the line 'Choose files, or drop them here'; the empty state reads 'Choose your first 835 files or ERA exports above: single files, a batch, or a zip of them.'
- **Size:** S.
- **Files:** `apps/web/src/components/uploads/uploader.tsx`, `apps/web/src/components/uploads/receipts.tsx`, `apps/web/src/app/p/[practiceId]/uploads/page.tsx`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 48 `co-001/ux-uploads-every-kind`.
- **Sources:** `narrow-practice-2-22`.
- **Verification:** confirmed
- **Notes:** Lands with UX-062 (C-138) (the universal Uploads). Words chosen under the co-founder's ruling (above).

### UX-198 (C-191). The console's Incidents card says it lists incidents, and shows nothing at all when there are none

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 2 roles.
- **Roles:** platform administrator, platform operator.
- **Screens:** `console.status.default.1280`.
- **Routes:** `/console/status`.
- **Evidence:** 'Open ones and those resolved in the last 14 days; each update is posted on the public page as written.' is followed directly by the Open incident form, with no list and no sentence when the list is empty (`apps/web/src/app/console/status/page.tsx:82-86`).
- **Rule:** `docs/product/PRD.md:260` (every screen has an empty state that says what to do next)
- **Fix:** Before the form, when the list is empty: 'No open incidents, and none resolved in the last 14 days. Open one below when customers are affected.'
- **Size:** S.
- **Files:** `apps/web/src/app/console/status/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 59 `co-001/ux-maintenance`.
- **Sources:** `words-other-43`.
- **Verification:** confirmed
- **Notes:** UX-047 (C-122) (maintenance) changes the same page: one change. Words chosen under the co-founder's ruling (above).

### UX-199 (C-151). Support access marks 'Practice home' as the current page and has no way back

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** practice administrator.
- **Screens:** `p.support-access.default.1280`, `p.support-access.ended.1280`, `p.support-access.error-forbidden.1280`.
- **Routes:** `/p/[practiceId]/support-access/[supportGrantId]`.
- **Evidence:** The page renders `AppShell` and `Forbidden` with `section="practice"` (`apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx:18,22`), so the rail gives 'Practice home' `aria-current="page"` and the brass underline (`components/shell.tsx:116-119`) on a page that is not the practice home, and screen readers announce 'current page' on the wrong link. The page is the access log's detail for administrators but links back to nothing. Confirmed at 4d99df8.
- **Rule:** WCAG 2.1 4.1.2 Name, Role, Value (a state the element does not have) and 1.3.1
- **Fix:** Render the page with `section="settings"` (it is reached from the access log and the support-grant notices), and add a back link 'Back to the access log' above the h1.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 76 `co-001/ux-support-access`.
- **Sources:** `a11y-practice-2-17`.
- **Verification:** confirmed
- **Notes:** Lands after #42 merges (the support-access page is #42's). UX-072 (C-136) covers the open grant's dead end on this page; UX-133 (C-064) its records list.

### UX-200 (C-168). Filtered, the Cases lede reads 'Actionable: $0.00 across 0 cases still being worked the filters admit'

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** billing manager.
- **Screens:** `p.cases.empty-filtered.1280`, `p.cases.empty-filtered.390`.
- **Routes:** `/p/[practiceId]/cases`.
- **Evidence:** With any filter set the first sentence becomes '... across 0 cases still being worked the filters admit, as of 2026-10-26.', a relative clause bolted on after 'worked' (`apps/web/src/app/p/[practiceId]/cases/page.tsx:51` appends `{filtered ? ' the filters admit' : ''}`). The figure itself is right.
- **Rule:** `docs/brand/BRAND.md:23` and the brief's plain-language rule (short, plain sentences)
- **Fix:** Word the filtered case as its own sentence: unfiltered stays 'Actionable: $0.00 across 2 cases still being worked, as of 2026-10-26.'; filtered reads 'In the cases these filters show: actionable $0.00 across 0 cases still being worked, as of 2026-10-26.', the count through `counted()`.
- **Size:** S.
- **Files:** `apps/web/src/app/p/[practiceId]/cases/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 35 `co-001/ux-cases-list-first`.
- **Sources:** `retake-02`.
- **Verification:** confirmed
- **Notes:** Lands with UX-125 (C-063) (the Cases page's order). Words chosen under the co-founder's ruling (above).

### UX-201 (C-169). Proof level states the rule for both directions in one 70-word sentence, then says 'Changing to posted would move 0 lines' without saying from which stage to which

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** practice administrator.
- **Screens:** `p.proof-level.default.1280`, `p.proof-level.default.390`, `p.proof-level.default.1280-dark`.
- **Routes:** `/p/[practiceId]/settings/proof-level`.
- **Evidence:** On LEDGER (Now: deposited) the card's body is one sentence of about 70 words covering raising and lowering, though only one direction is on offer, then 'Changing to posted would move 0 lines.' with no stage named (`apps/web/src/app/p/[practiceId]/settings/proof-level/page.tsx:49-52`); the heading prints the stored value 'Now: deposited' (:44). The route returns the fixed `PROOF_LEVEL_RULE` for both levels (`apps/web/src/lib/routes/settings.ts:352-353`, :387), though its query already knows the direction (:364-378). At 390 px the sentence runs ten lines.
- **Rule:** `docs/brand/BRAND.md:23` and the brief's plain-language rule; ADR 0053 (the effect is stated before it is saved)
- **Fix:** Word the card from the current level, in short sentences about the one change on offer, the count naming both stages through `counted()`: at deposited, 'Now: Deposited. Recovered (deposited) counts a line once its deposit is matched in your bank export. Change to posted: a line then counts as recovered (posted) once its payment is posted in your practice-management system. 0 lines would move from Payer approved to Recovered. Statements already printed keep the level they were printed at.'; at posted, '... 3 lines would move from Recovered back to Payer approved; their cases stay as they are.' plus the existing no-bank-export sentence. Keep the confirm box.
- **Size:** S.
- **Files:** `apps/web/src/lib/routes/settings.ts`, `apps/web/src/app/p/[practiceId]/settings/proof-level/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/settings.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 83 `co-001/ux-settings-words`.
- **Sources:** `retake-05`.
- **Verification:** confirmed
- **Notes:** Every 'recovered' carries its proof label, so the copy lint passes. `lib/routes/settings.ts` is a #42 file: after #42 merges, in one proof-level PR with UX-109 (C-046)'s radio pair (writer A) and UX-154 (C-141)'s 'the next reconcile'. Words chosen under the co-founder's ruling (above).

### UX-202 (C-190). The model features card's sentences read awkwardly ('On, it turns every model feature off ...'; 'every feature is on (but the letter reader), with the default budget')

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** platform administrator.
- **Screens:** `console.models.default.1280`.
- **Routes:** `/console/models`.
- **Evidence:** 'On, it turns every model feature off for everyone; the product keeps working on hand-entered records.' (`apps/web/src/app/console/models/page.tsx:54`); 'No model flag is set: every feature is on (but the letter reader), with the default budget.' (:91), which names no figure though the page has `defaultBudgetCents` (`apps/web/src/lib/routes/console-models.ts:109`).
- **Rule:** The brief's plain-language rule
- **Fix:** 'When on, it turns every model feature off for everyone; the product keeps working on hand-entered records.'; 'No model flag is set: every feature except the letter reader is on, with the default budget of $5.00 a day per practice.', the amount rendered from `DEFAULT_DAILY_BUDGET_CENTS` through `<Money>` (never typed).
- **Size:** S.
- **Files:** `apps/web/src/app/console/models/page.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 57 `co-001/ux-console-records`.
- **Sources:** `words-other-41`.
- **Verification:** confirmed
- **Notes:** Lands with UX-038 (C-059) after PR #54 (same page). Words chosen under the co-founder's ruling (above).

### UX-203 (C-199). The console's organization page is a 4,000 px stack of forms in which the records are hard to find; the Members table's Actions column stands over nothing; a firm's agreement hides the practice its grant names

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** platform administrator.
- **Screens:** `console.organization.default.1280`, `console.organization.firm.1280`, `console.organization.suspended.1280`, `console.organization.created.1280`, `console.organization.help.1280`.
- **Routes:** `/console/organizations/[organizationId]`.
- **Evidence:** The page runs Suspension, Practices with its create form, Members with its invite form, Invitations, Agreements with two five-field forms, then Grants (`apps/web/src/app/console/organizations/[organizationId]/page.tsx`; 4,068 px at 1280) with no in-page links. The Members table's Account and Actions cells are flex boxes (`<td className='flex ...'>`, :147, :153), which takes them out of table layout, so End membership renders under 'Account' and 'Actions' heads nothing. A firm's engagement letter lists its practice as 'Another organization's practice' (:252) while the Grants card names it. A suspended firm's grant still reads 'in force'.
- **Rule:** `docs/product/PRD.md:295` (Organizations and practices: records, agreements, grants, billing status); WCAG 2.1 SC 1.3.1 (the action cells lose their column header)
- **Fix:** Lead with the records: a short summary (kind, status, billing standing linked to Billing status, practices, members, open invitations, grants) with in-page links, then each card's table first and its create form behind a button below it ('Add a practice', 'Invite a member', 'Record an agreement' as one form with 'by reference' or 'upload the PDF' as a choice); Suspension last (UX-046 (C-058)). Wrap the cells' contents in a `div` so each `td` stays a table cell. Name the practice on a firm's agreement from the grant it rests on, and mark a suspended organization's grants 'in force; runs refused while suspended'.
- **Size:** M.
- **Files:** `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/routes/console.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/routes/console.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 79 `co-001/ux-console-org-page`.
- **Sources:** `flows-other-27`.
- **Verification:** confirmed
- **Notes:** Naming another organization's practice to the platform administrator is within `organization.manage` (the console already lists every practice). `lib/routes/console.ts` is a #42 file (the agreement's practice name): after #42 merges, with UX-046 (C-058) and UX-004 (C-010) on the same page. The table-cell fix overlaps UX-099 (C-044) (writer A's members table): one change. Words chosen under the co-founder's ruling (above).

### UX-204 (C-200). The console's Billing status lists organizations as dead text: no way to open one, see its invoices, or act on a past-due standing; 'Practices (granted, active)' reads '—' on every row

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** platform administrator.
- **Screens:** `console.billing.default.1280`.
- **Routes:** `/console/billing`.
- **Evidence:** Each row prints the organization's name and kind, a standing badge, the plan, the open amount and 'Practices (granted, active)' (`apps/web/src/app/console/billing/page.tsx:51-67`); the name links nowhere, there is no link to the invoices, and a past-due or suspended row offers no next step, though those actions live on the organization page. 'Practices (granted, active)' reads '—' on every row with no word that it fills only after the nightly count.
- **Rule:** `docs/product/PRD.md:295` (billing status; suspend); `PRD.md:256` (every state with a next step)
- **Fix:** Link each organization's name to its console page and its open amount to its invoices; for past due show 'since 2026-10-01; new runs stop 2026-10-31' and a link to the organization's Suspension card; replace '—' with 'After tonight's count' until the first count exists; sort past due and suspended first.
- **Size:** S.
- **Files:** `apps/web/src/app/console/billing/page.tsx`, `apps/web/src/lib/routes/billing.ts`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 57 `co-001/ux-console-records`.
- **Sources:** `flows-other-30`.
- **Verification:** confirmed
- **Notes:** PR #47 (merged as c5195ee) changed `lib/routes/billing.ts` but not this page or its rows, so the finding stands; the member's in-flight note is out of date. The 'Owed' column is UX-142 (C-189) (same table). Words chosen under the co-founder's ruling (above).

### UX-205 (C-202). The screening's left-out line reads as three separate things ('2 rows of fewer than 11 claim lines each, 11 claim lines and $436.84 allowed')

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening.error-no-phi.1280`, `screening.error-zip.1280`.
- **Routes:** `/screening`.
- **Evidence:** 'Left out: 2 rows of fewer than 11 claim lines each, 11 claim lines and $436.84 allowed in your file.' (`apps/web/src/lib/screening/messages.ts:134`).
- **Rule:** The brief's plain-language rule
- **Fix:** 'Left out: 2 rows with fewer than 11 claim lines each (11 claim lines and $436.84 allowed in all).', with the amount in the mono face (UX-113 (C-103)).
- **Size:** S.
- **Files:** `apps/web/src/lib/screening/messages.ts`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/lib/screening/messages.ts` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 85 `co-001/ux-screening-messages` (the left-out sentence, by the founder's answer (F5)).
- **Sources:** `words-other-37`.
- **Verification:** confirmed
- **Notes:** `lib/screening/messages.ts` is a #42 file: after #42 merges. The line states the 11-claim-line floor and the left-out total, which `HANDOFF.md:92` puts on counsel's list ('the 11-claim-line floor (the number, lines or patients, a left-out total under 11, ...)'), so the rewrite goes to the founder in F5 (6.2) with the screening's other held sentences, as the proposed text for counsel. Moved on review from the co-founder's ruling.

### UX-206 (C-203). '1 group of 4 is an anomaly.' puts the count on the wrong noun

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening-result.default.1280`.
- **Routes:** `/screening/results/[resultId]`.
- **Evidence:** '1 group of 4 is an anomaly.' and 'No group of 4 is an anomaly.' (`apps/web/src/components/screening/anomalies.tsx:180`).
- **Rule:** The brief's plain-language rule; `apps/web/src/lib/copy/words.ts:2-3` (a count with its noun)
- **Fix:** '1 of 4 groups is an anomaly.'; '2 of 4 groups are anomalies.'; 'None of the 4 groups is an anomaly.'
- **Size:** S.
- **Files:** `apps/web/src/components/screening/anomalies.tsx`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 4 `co-001/ux-screening-result-tables`.
- **Sources:** `words-other-38`.
- **Verification:** confirmed
- **Notes:** Lands with UX-042 (C-118) and UX-043 (C-119) (same file). Words chosen under the co-founder's ruling (above).

### UX-207 (C-204). The screening never says how soon the result comes until after the file is sent

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 1 routes, 1 roles.
- **Roles:** screening prospect.
- **Screens:** `screening.default.1280`.
- **Routes:** `/screening`.
- **Evidence:** The lede and cards give no time (`apps/web/src/app/screening/page.tsx:38`); only the sent page says 'usually within a minute of when you sent it' (`apps/web/src/lib/screening/sent.ts:28`, the founder's Q12 wording, for counsel to confirm). The promise is backed: production opens the screening only after the release's capacity run passes with time enforced (ADR 0062), and the waiting tier is what 'usually' covers.
- **Rule:** CO-11 and the brief's honest-claims rule (the screening's 60-second promise); `PRD.md:260`
- **Fix:** Add to the lede, after UX-041 (C-117)'s text: 'The result comes to your email as a link, usually within a minute.' No figure beyond that ('60 seconds' is the measured line for a 50,000-row file, not a promise for every visit).
- **Size:** S.
- **Files:** `apps/web/src/app/screening/page.tsx`.
- **Migration:** no.
- **#42:** yes: `apps/web/src/app/screening/page.tsx` (that part after #42 merges)
- **In flight:** no.
- **Proposed PR:** UX PR 84 `co-001/ux-screening-upload-page`.
- **Sources:** `words-other-44`.
- **Verification:** confirmed
- **Notes:** The member sent it to the founder. It repeats the founder's ruled sent-page claim (Q12) before sending and changes no ruled words, so it is wording under the co-founder's ruling; counsel's review of the screening wording should read the two together, and if counsel changes the sent sentence this one follows. `screening/page.tsx` is a #42 file: after #42 merges.

### UX-208 (C-197). The brand's `.pw-status-unpriced` class sets 12 px text at 3.34:1 (unused today, but the documented status class)

- **Severity:** polish. Harm area: clarity, consistency or brand. Reach: 0 routes, 1 roles.
- **Roles:** none today (a trap for the next screen).
- **Screens:** none (a code finding).
- **Routes:** none.
- **Evidence:** `apps/web/src/app/brand.css:42` colours `.pw-status-unpriced` text `--pw-unpriced` (#7A8594) on `--pw-unpriced-bg` (#F0F2F5), about 3.34:1, for 12 px text (:43-48). No component uses the class today (no reference outside `brand.css`); `StatusChip` already solved it with Slate text and the unpriced hue on the border (`apps/web/src/components/status.tsx:18`).
- **Rule:** WCAG 2.1 SC 1.4.3 (contrast minimum); `.claude/rules/brand.md:40` (text at least 4.5:1); ADR 0056 (an unpriced chip's text is Slate and its hue is the border)
- **Fix:** Make `.pw-status-unpriced` match `StatusChip` and ADR 0056: `color: var(--pw-fg-muted)` with a 1 px `var(--pw-unpriced)` border, keeping the tint. Keep the class (it is the documented one) rather than delete it.
- **Size:** S.
- **Files:** `apps/web/src/app/brand.css`.
- **Migration:** no.
- **#42:** no.
- **In flight:** no.
- **Proposed PR:** UX PR 32 `co-001/ux-dark-tokens`.
- **Sources:** `a11y-practice-2-20`.
- **Verification:** confirmed
- **Notes:** The token `--pw-unpriced` itself is open with the brand owner (ADR 0058 D9 item 2) and is not changed here; this applies the rule ADR 0056 already states.

### Dropped

No canonical finding was dropped whole: every one holds at 4d99df8. These parts of members' fixes were not taken, each for its reason:
- **UX-035 (C-065)**: The member's 'required amount for accepted and partial' already holds in `apps/web/src/lib/routes/submissions.ts:235-238`.
- **UX-029 (C-125)**: The member's main fix, triage enqueued for every run, would reverse ADR 0039 (no automatic triage of a person's run); its fallback, the visible state and a button, is taken.
- **UX-073 (C-028)**: Three tables the members listed already have row headers (`packets/pricing.tsx:115`, `models/display.tsx:104`, `contracts/review.tsx:245`).
- **UX-009 (C-006)**: Serving the old storage reference as a link meanwhile: nothing checks that the stored file matches the hash.
- **UX-092 (C-019)**: A forbidden page's title derived from its rail section: one section serves several screens (the packet builder and its review).
- **UX-001 (C-001)**: Returning the typed values in the action state (two members): it sends the person's text, possibly what the no-PHI check refused, back through the server.
- **UX-110 (C-051)**: Rewording `docs/product/unpriced-reasons.md`'s reference meanings: the engine-arithmetic check holds that file unchanged (`docs/product/reconciliation-001.md:448`), and the remedies are held to the rules reference and its content source; a separate customer wording is added instead.
- **UX-143 (C-162)**: Writing a person's device name into `user_device.label`: the label is rewritten from the user agent at every sign-in (`auth/sessions.ts:70`), so a kept name needs its own column (Lane A).
- **UX-042 (C-118)**: 'Expected less allowed' as the column words: 'expected' is the product's word for a contract amount, which a screening never has.

Parts of this review's own fixes removed on review (section 10 gives each reason):
- **UX-124 (C-050)**: A Lane B cover PR and 'Amount in dispute': the cover is Lane A's PR 12's to rewrite in CO-06's neutral words, and no packet-cover baseline exists (ADR 0058's covers are the ROI statement's).
- **UX-014 (C-083)**: Renaming 'Short (variance)' to 'Short', a glossary in `BRAND.md` and a lint on the word 'Variance': against ADR 0056:55-58 and the brand journey, ADR 0058:243-244 and CO-06's own label.
- **UX-007 (C-011)**: Taking every payer letter out of abstraction by its kind: a payer's terms letter is a designed contract source.
- **UX-006 (C-005)**: A hardware-key credential table and an administrator's key reset: neither exists (Cognito passkeys).
- **UX-012 (C-007)**: Stating 15 minutes before Cognito allows it, and calling 15 minutes the safer.
- **UX-136 (C-121)**: Moving the closed link's kept paragraph without the founder.
- **UX-026 (C-094)**: Renaming the two agreements before their documents' titles exist.
- **UX-004 (C-010)**: The claim that the console card's 'with the reason' is false.
- **UX-163 (C-178)**: Labelling a 2 GiB limit '2 GB'.

## 8. The earlier tour's five defects, re-checked

The screen tour of 2026-10-25 (`lanes/lane-b.md`, ~15:40 UTC, 30 screens of 9c57d2d) found five defects. All five still hold at 4d99df8; each is now part of a wider finding.

1. **At 390 px the ROI statement's PDF SHA-256 does not wrap, so the page renders 489 px wide.** Now UX-075 (C-016). Still present: `apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx:74` prints the whole hash in one unbroken span. The same cause sits on eleven screens. Fixed by UX PR 20 (`co-001/ux-sha256`): one shared component shows the whole value, 16 characters to a line, with a copy button.
2. **At 390 px the practice home's agreements table and the free screening's file-template table cut off their last column.** Now UX-011 (C-002). The agreements table still has a bare wrapper with no keyboard-reachable scroller (one of fifteen); UX PR 3 (`co-001/ux-table-scroll`). Updated for the screening template: it is not cut off but scrolls with no sign that it does (UX-079 (C-043)); UX PR 3 (`co-001/ux-table-scroll`) adds the cue and UX PR 85 (`co-001/ux-screening-messages`) stacks the reference on a phone.
3. **At 1280 px two wide tables on the screening result run past the right edge.** Now UX-005 (C-008). Still present at 1280 px (the anomalies badges and the top rows' Difference column, UX-134 (C-115)'s evidence), and at 390 px the same tables clip Allowed, Difference and Status with no cue. One layout fixes both widths: UX PR 4 (`co-001/ux-screening-result-tables`).
4. **The practice home shows Actionable $0.00 while the ROI statement lists 'Actionable in open cases: $30.00' for the same practice.** Now UX-003 (C-009). Still present. The tour wrote 'To check' and 'none blocks' (`lanes/lane-b.md:442-447`); this review re-ranked it to blocking (UX-003) on what it found: the two read different definitions, and the home tile pairs $0.00 with '1 line'. UX PR 9 (`co-001/ux-home-figures`) gives every screen and the statement one definition of the actionable figure and a test that they agree.
5. **A notification reads 'on 1 lines'.** Now UX-115 (C-054). Still present (`apps/web/src/components/monitoring/display.tsx:55`), and about 25 other sites put a fixed plural after a number. UX PR 30 (`co-001/ux-counts-and-units`) fixes every site outside #42's files and adds a copy-lint rule; the notifications, a #42 file, follow in UX PR 81 (`co-001/ux-notification-words`).

## 9. Limits

**States synthetic data cannot show.** 36 states were left out at both widths rather than faked, and 6 route-map entries have no page; `designs/lane-b-ux-review/coverage.md` gives each reason. In short:
- States the populate specs never leave: the closed screening, the specialist's questions to the practice, a draft or approved-awaiting-sign-off contract version, struck-through window-passed case lines, a stale unattested export, months waiting on a ZIP, a held file in a zip, the past-due billing layout, the terms accept form, the console's empty lists (organizations, billing, support grants, terms, screening split, specialist queue, rule releases), the locked member badge, populated model flags.
- States that need a write the capture would not make: an open incident or a degraded component, an unfinished or incomplete pricing run, a tampered ledger (the ROI mismatch), a PLB-only remittance, more than 50 anomaly groups (the screening pager).
- States no screenshot can hold: the browser's file reading, a native select's open list, the loading state of a plain GET form (by-reference, Compare), the review checklist and an abstraction version reached only while unattested or unsigned.
- Route-map entries with no page at 6ddd587: `/console` (UX-052 (C-108)'s page), a run line's own trace URL, per-remittance reconciliation, the monitoring and scorecard reports.

**What axe misses.** The three accessibility reviewers each listed the gap for their routes (a11y-practice-1-28, a11y-practice-2-19, a11y-other-24; all in UX-085 (C-029), for Lane A's PR 7):
- `expectAccessible` is called in 12 specs and runs on 10 of 28, 11 of 21 and 15 of 34 of their routes; after a refusal on only two forms (`apps/web/e2e/onboarding.spec.ts:542`, `screening.spec.ts:727`), and never on a permission state, with a header menu open or in dark.
- `apps/web/e2e/a11y.ts:5-7` says the gate checks landmarks and headings, but their rules are tagged `best-practice`, so they never run.
- `apps/web/e2e/a11y.ts:12` runs only the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags, so `target-size`, `heading-order`, `page-has-heading-one`, `region`, `landmark-unique`, `empty-table-header`, `label-content-name-mismatch` and `td-has-header` never run.
- `tabTo` accepts any outline style other than none, so a transparent ring passes, and nothing checks that the focused element is on screen (2.4.11).
- axe does not test placeholder contrast, non-text contrast of a current-item cue, a layout change made by CSS inside a table, or a region that overflows only at another width.
- No tool sees: values kept after a refusal (3.3.7), paste into the code field (3.3.8), visible words in the accessible name (2.5.3), step time limits (2.2.1), status messages announced (4.1.3), focus return after menus, link purpose in context and format instructions. These need a person or a scripted interaction, and were judged by hand here.

**What this review did not judge.**
- Real assistive technology: the accessibility lens read the code, the DOM and axe; no screen reader or switch device was run.
- Real phones: 390 px is Chromium's emulation. iPhone Safari's zoom on 14 px controls (UX-089 (C-045)) is inferred from Safari's documented behaviour, not seen.
- Dark mode as a product: dark was judged from the tokens only, as advisory, because no user reaches it.
- The email templates and the PDFs beyond what their HTML and the payer's copy cover show (ADR 0058's baselines hold those), and the screens #42 adds (the console mail page, the 84th route).
- Whether legal text is right: that is counsel's. This review only says where it is unreadable or missing (F2, F4, F5).
- Performance, load and real data: everything here is synthetic.

## 10. Review dispositions

The adversarial review of the rules (`scratchpad/ux/synth/review-rules.md`: 5 blocking, 13 should fix, 12 nits) and the fact check (`scratchpad/ux/synth/review-facts.md`: 1 blocking, 11 should fix, 14 nits) were each verified against the code at 4d99df8 (`git show 4d99df8:<path>`), the rules they cite and GitHub (GET only). "R" is the rules review, "F" the fact check. The PR numbers the reviews cite are the reviewed numbering; each line names the revised UX PR. Where the two reviews raised the same point, one line carries the change and the other points to it.

- **R-B1**: Applied (with F-B1). The reviewed PR 8 (`co-001/ux-second-factor-reset`) was marked now but needed #42 files. Split: UX PR 8 (`co-001/ux-account-security`) now (`/account/security` with a re-authentication step, and the four `lib/auth` files); UX PR 65 (`co-001/ux-second-factor-reset`) after #42 (the console reset beside `unlockUser`, `lib/routes/console.ts:579`, `AdminSetUserMFAPreference` on the narrowest role, the security reviewer choosing the web task or a worker job, `mfa_enrolled` set false, the email through #42's mail). Cognito offers no administrator path for a passkey, so a second key or a re-invitation is the recovery, and the help line promises no key reset. The IAM trade-off is named in 6.1.
- **R-B2**: Applied. The reviewed PR 46 (`co-001/ux-payer-copy-cover`) is dropped. UX-124 is handed whole to Lane A's PR 12 (section 5), which rewrites the cover's heading and requested action under CO-06 (`change-order-001.md:61`; `reconciliation-001.md:201-209`; ADR 0058:53-54), with the figures worded 'payment difference'. No packet-cover baseline exists (ADR 0058's are the ROI statement's), so Lane A's PR 12 re-runs the ROI cover baselines only if it touches `apps/worker/src/report/brand.ts`.
- **R-B3**: Applied. The closed link's kept paragraph is the legal surface `screening-kept-closed-link` (`legal-surfaces.md:20`). F4 gains its order as a third part; UX PR 63 (`co-001/ux-screening-result-first`) rewords the non-legal sentences in place and moves nothing; UX PR 89 (`co-001/ux-screening-kept-notices`) applies the answer. UX-136's Notes corrected.
- **R-B4**: Applied. 'Short (variance)' kept, as ADR 0056:55-58 records and `brand.spec.ts:371` pins; the other four names fold into it with their stage; 'Short (insurer payment)' reserved for D31 (`reconciliation-001.md:412-415`) and told to Lane A's PR 13; the lint refuses only the retired exact labels, never 'variance'; the vocabulary goes in `lib/copy/words.ts` and the reviewer checklist, not `BRAND.md` (ADR 0058:243-244). UX PR 36 (`co-001/ux-short-one-name`) retitled.
- **R-B5**: Applied. Only payer letters that a payer response links (`payer_response.document_id`) leave the tagging and abstraction lists, in the web queries now; a payer's terms letter stays abstractable (`contract_version_documents_ok()`, `20261016160000:291-297`); the same exclusion in `console_contract_queue()`, a SECURITY DEFINER function, goes to Lane A as a fourteenth migration part (section 5).
- **R-S1**: Applied. 'UX PR n', 'Lane A's PR n', 'PR #n' and 'audit #n' throughout the document, `prs.json` and the canonical findings; UX PR numbers are generated from the landing order, so they cannot drift (section 2, Numbers).
- **R-S2**: Applied (with F-S8). Every 'Depends on' cell regenerated from the open PRs' file lists at their current heads: 107 overlap lines added in 50 UX PRs, naming each file, among them PR #53's files (merged at 09:50 UTC, after the evidence). UX PR 1's session should hear now of its overlaps with PR #50's `lib/http/next.ts`, PR #51 and PR #52 (section 4).
- **R-S3**: Applied in part. Applied: UX-024, UX-020, UX-035 and UX-039 re-graded to blocking (ids kept), and their PRs, UX PR 12 (`co-001/ux-case-summary`) and UX PR 13 (`co-001/ux-ledger-corrections`), join the blocking group (UX-035 was already in UX PR 10 (`co-001/ux-payer-response`)); the harm classes renamed to harm areas, which only order findings within a severity, so UX-083's area no longer claims a block. Rejected: UX-005's down-grade. Coverage's wrapper has no tab stop (`coverage.tsx:61-62`, a 2.1.1 failure at both widths), the same tables run past the edge at 1280 px (the earlier tour's item 3), and on a phone the lede's one claim, which group is the anomaly, cannot be checked on screen.
- **R-S4**: Applied. The 11 Rule lines that cited 'the brief's consistent-terms rule' now read 'No written rule; recommended (the brief's goal: one product)' (the brief has only the brand lens's 'consistency across screens'); 6.1 splits brand choices into ruled (ADR 0056:89-92, `brand.md:26-28`, `BRAND.md:120-121`, `BRAND.md:84-86`) and chosen; UX-003 cites `PRD.md:242`, `:331` and `:520`, and UX-015's and UX-023's `PRD.md:258` (a heading) are corrected.
- **R-S5**: Applied (with F-S6, F-N12). UX PR 6 states and times the 3 minutes that bind today (`identity.ts:14`) from one constant; UX PR 66 (`co-001/ux-sign-in-session`) moves Cognito and the cookie to 15 together, with `identity.test.ts`; UX-012's Rule line states what 2.2.1 leaves unmet as a known limit for audit #103; the 15 minutes is named in 6.1 as the less strict setting, for the security reviewer; the reviewed PR 85 (`co-001/ux-enrolment`) is split into UX PR 66 (`co-001/ux-sign-in-session`) and UX PR 86 (`co-001/ux-enrol-qr`).
- **R-S6**: Applied (with F-S11). UX-003's shared module is `packages/triage/src/actionable-sql.ts` (both apps import `@tp/triage`); UX PR 9 (`co-001/ux-home-figures`) takes the payment-engine review and an LED-11-unchanged test, lands before the first production deploy (or dates the change by `generated_at`) and names Lane A's PR 11. UX-032's rule is code-side: a statement generated before the time log's release reads 'not tracked', since `pursuit_hours` is NOT NULL and `roi_statement` is frozen.
- **R-S7**: Applied (with F-S9). A checked `page_path` column joins UX-058's Lane A part (`support_ticket.screen` admits a key only, `20261030090000:368`); UX PR 80 (`co-001/ux-support-tickets`) shows the page on the form and the ticket's age, and is retitled.
- **R-S8**: Applied. One stacked-row primitive in UX PR 3 (`co-001/ux-table-scroll`), which now lands before UX PR 4 (`co-001/ux-screening-result-tables`) and is used by UX PR 34 (`co-001/ux-phone-record-lists`); the blocking group uses today's `Alert` and prints dates through `utc()`, `utcDate()` and one quarter helper (section 3); UX PR 10 (`co-001/ux-payer-response`) changes `uploader.tsx` only to pass the kind.
- **R-S9**: Applied. UX PR 67 (`co-001/ux-header-menus`) regenerates and inspects `header-390` (and `header-1280` if the switcher's text moves) under ADR 0058:225-228.
- **R-S10**: Applied. UX PR 12 (`co-001/ux-case-summary`) builds the dispute figures in one helper that Lane A's PR 13's Overview tab reuses, keeps Lane A's PR 13's stage labels, and section 5 tells Lane A.
- **R-S11**: Applied. UX-101's sentence drops 'here': 'A firm reaches it only through a grant you approve.' (`settings/agreements/page.tsx:18`: approving a firm's grant is milestone 12's flow).
- **R-S12**: Applied. The left-out line joins F5 (`HANDOFF.md:92`); UX PR 85 (`co-001/ux-screening-messages`) waits for the answer.
- **R-S13**: Applied. `--pw-bg-sign-in` moves to UX PR 91 (`co-001/ux-appearance`) behind F1 and is asked under F3 as an alias with no new colour (ADR 0058:59-67); UX PR 32 (`co-001/ux-dark-tokens`) keeps the static check, with the sign-in layout exempted by name; UX-160's 'Not a palette change' corrected.
- **R-N1**: Applied (with F-N7). 11 findings fold into in-flight work, whole or in part; the count is computed.
- **R-N2**: Applied (with F-N8). 'after PR #n merges' for a wait; 'PR #54 (merged)' for a fact.
- **R-N3**: Applied. UX-110's drop names the engine-arithmetic check (`reconciliation-001.md:448`).
- **R-N4**: Applied. UX PR 33 (`co-001/ux-focus-touch`), UX PR 34 (`co-001/ux-phone-record-lists`) and UX PR 91 (`co-001/ux-appearance`) add dated '*Amended ...*' lines to ADR 0056, as ADR 0056:104 does.
- **R-N5**: Applied. F3 says #5F6A79 is 1.17:1 from Slate (#526070, computed), so the hue's job is the border.
- **R-N6**: Applied. F1 and UX-118 give the reason as a judgement and cite ADR 0056:129 (no user has asked).
- **R-N7**: Applied. UX-163 sets the upload limit to 2,000,000,000 bytes so '2 GB' is exact (`limits.ts:12-13`; the safer, and `PRD.md:234`'s 2 GB acceptance holds); UX-110 drops 'yet'.
- **R-N8**: Applied (with F-S5). The reset uses the `sign_in` bucket (`rate-limit.ts:39`) and records `password_reset_requested` and `password_reset_completed` through `record_security_event()` (`20261015180000_tenancy_hardening.sql:90`; the purpose CHECK is a pattern, so no DDL).
- **R-N9**: Applied. Audit #46 lands first, as queued; UX PR 22 (`co-001/ux-page-header`) then moves the seal into the header's right slot (UX-183, section 4).
- **R-N10**: Applied. UX-026 keeps today's labels with a line saying who accepts each; the names come from audit #51's titles, in UX PR 87 (`co-001/ux-terms-text`).
- **R-N11**: Applied (with F-N13). Appearance gets its own page, `/account/appearance`; UX PR 91 (`co-001/ux-appearance`) is marked after #42; UX-118's and UX-179's Lane A parts say `tenancy.ts` waits for #42.
- **R-N12**: Applied (with F-N11). The kept-practice cookie is set in `apps/web/src/proxy.ts:23`, Next 16's middleware, not #42's; added to UX-102 and UX PR 69 (`co-001/ux-shell-context`).
- **F-B1**: Applied (see R-B1). Also: the four `lib/auth` files in the now part, `user.mfa_enrolled` set false under `20261015140000_tenancy.sql:599` and :509, and the credential-table sentence dropped from UX-006 and UX PR 7 (`co-001/ux-sign-in-recovery`).
- **F-S1**: Applied. UX-085, section 5's hand-over to Lane A's PR 7 and section 9 say 12 specs (66 calls) and name the two refused states already checked (`onboarding.spec.ts:542`, `screening.spec.ts:727`); `a11y.ts:5-7`'s comment noted.
- **F-S2**: Applied. UX-011 lists the five `atPhoneWidth` specs and the three that visit its routes in states where the wide tables fit.
- **F-S3**: Applied. UX-004 drops the 'promise is false' argument (`organization_run_refusal.sql:14-18`, `next.ts:170-171`); the Lane A part rests on what the customer needs; `console.ts:107`.
- **F-S4**: Applied. UX PR 5 (`co-001/ux-download-refusals`) lists `lib/http/route.ts`, `lib/http/invoke.ts` and a new `download-refusal.test.ts`, clear of #42's `http.test.ts`.
- **F-S5**: Applied (see R-N8). UX PR 7 (`co-001/ux-sign-in-recovery`) lists `provider.ts`, `cognito-provider.ts`, `dev-provider.ts` and `sign-in.ts`.
- **F-S6**: Applied (see R-S5). UX PR 6 leaves the cookie lengths alone; UX PR 66 (`co-001/ux-sign-in-session`) lists `pending.ts` and `infra/test/identity.test.ts`.
- **F-S7**: Applied. Every listed file absent at 4d99df8 is marked '(new)' or with the PR that adds it, in the findings, the PRs and `prs.json` (the eleven named, plus UX-002's two from PR #54, UX-058's thread page and UX-091's test).
- **F-S8**: Applied (see R-S2). Regenerated at the current heads, including PR #50's `ed85bcf3`.
- **F-S9**: Applied (see R-S7). Writing the path into the free-text message is not taken: nothing would check it.
- **F-S10**: Applied. `apps/web/src/app/sign-in/enroll/page.tsx` added to UX PR 20 (`co-001/ux-sha256`).
- **F-S11**: Applied (see R-S6). `packages/triage/src/actionable-sql.ts` (new) is in UX-003's files and UX PR 9 (`co-001/ux-home-figures`).
- **F-N1**: Applied. UX-001: 112 uses in 60 files.
- **F-N2**: Applied. UX-001: the comment says only that success redirects; PR #50's new comment noted for UX PR 1.
- **F-N3**: Applied. UX-004: `console.ts:107`.
- **F-N4**: Applied. UX-008's Lane A part builds on #42's `notification_kind_check` (`20261107090000_mail_streams.sql:797-800`).
- **F-N5**: Applied. UX-020 cites `packages/db/functions/case_rules.sql:59-60`.
- **F-N6**: Applied. UX-011: 89 `<table` elements.
- **F-N7**: Applied (see R-N1). 11, computed from the plan.
- **F-N8**: Applied (see R-N2). Every 'PR #n merged' dependency rewritten.
- **F-N9**: Applied. Section 1 names the hardware-key form's field (`hardware-key.tsx:79`) and the password form's (`sign-in/page.tsx:27`).
- **F-N10**: Applied. Section 8, item 4 says the tour wrote 'To check' and 'none blocks' (`lanes/lane-b.md:442-447`) and that this review re-ranked it.
- **F-N11**: Applied in part (see R-N12). Applied: the cookie's place is named. Rejected: 'there is no middleware at 4d99df8'. `apps/web/src/proxy.ts:23` is Next 16's middleware and already sets the attribution cookie; `lib/http/next.ts` is not on a page render's path, so it cannot set the cookie there.
- **F-N12**: Applied (see R-S5). `infra/test/identity.test.ts` is in UX PR 66 (`co-001/ux-sign-in-session`).
- **F-N13**: Applied (see R-N11). Section 5 says the `tenancy.ts` hand-overs land after #42.
- **F-N14**: Applied. UX-005 and UX PR 4 (`co-001/ux-screening-result-tables`) say the PR merged second updates the new spec if a helper in `e2e/screening.ts` changed.

**Counts.** 56 points: 54 applied, 2 applied in part with one part rejected on the evidence (R-S3's UX-005 down-grade; F-N11's "no middleware"), none rejected whole.

**Completeness, checked by the generator.** Every one of the 208 canonical findings is listed once in section 7 and has a home: 161 are in one UX PR (any migration part is in section 5), 36 are split across UX PRs with each part named, 8 fold whole into in-flight work, 2 fold in part and keep a UX PR part, and 1 is handed whole to Lane A (UX-124 (C-050)). No finding is closed whole twice, and none is both handed and in a UX PR. `prs.json` carries the same 91 pull requests, their findings and their parts.

