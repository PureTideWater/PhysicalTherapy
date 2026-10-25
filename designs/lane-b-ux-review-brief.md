# Lane B: the UX/UI and brand review (brief for the next Lane B session's first task)

Asked for by the co-founder on 2026-10-25 (who decides for the founder on Lane B's work: LANES.md delegation of
2026-10-25), after the screen tour (https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c) showed real defects. It is a
review, not a pull request: it changes no product code. Its output is a ranked list of findings, grouped into proposed
pull requests. They join Lane B's queue, or go to Lane A under "Handed to Lane A" when they need a migration. A
no-migration PR that touches a file #42 changes stays in Lane B's queue, marked "after #42 merges", as LANES.md items 8
and 15 to 17 are. Take #42's files from `gh api 'repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=1'
--jq '.[].filename'` and `page=2` (143 files), not from LANES.md's summary list.

## Goal
Every screen of PaidWhole reads, looks and behaves as one product, on brand, accessible, clear to each role, and right
at 1280 px and at 390 px. The standing rule applies: recommend only the best option, never weighted by build effort.

## What it judges against (read these first; they win over taste)
- `.claude/rules/brand.md` (the brand's binding rules: colours, the mark, status colours for data only, brass never
  text on white, copy rules).
- `docs/brand/BRAND.md`, `packages/brand/README.md`, `packages/brand/src/tokens.css` (light and dark), `mark.ts`.
- ADR 0056 (one token source, self-hosted fonts, status as text on tint) and ADR 0058 (email art, colours, fonts and
  words held by checks, the header and cover baselines).
- The copy: `apps/web/src/lib/copy/words.ts` and its test, `tools/brand-copy` (`pnpm lint:copy`), CO-11 in
  `docs/product/change-order-001.md`, and `apps/worker/src/screening/wording.ts`.
- PRD's cross-cutting requirements (`docs/product/PRD.md:256`: keyboard, labels, contrast, every error with a next
  step, no state a refresh loses, money from cents in the practice's locale) and WCAG 2.1 AA, with combined audit #103's
  WCAG 2.2 rules where they add to it (the e2e journeys already run axe through `apps/web/e2e/a11y.ts`).
- The combined audit (`/home/user/ops/audits/combined/combined-report.md`), cited by item number:
  - its experience items: #48, #89, #90, #103 (every route's accessibility under WCAG 2.2's rules, which lands in Lane A's PR 7), #107 and #125;
  - #102, the Approve button, which already landed in PR 5;
  - Lane B's visible-screen items: #38, #46, #49, #52 and #135;
  - the final pass's 390 px screens.
- The screen tour's five defects (lanes/lane-b.md, 2026-10-25 ~15:40 UTC).
- The founder's own screenshot tour of 2026-10-17 and its fixes (`workflow-scripts/co-001-fix-screen-tour-wf_0291578a-a18.js`, merged from `co-001/fix-screen-tour`), so findings already fixed are not raised again.

## Method (one workflow; the usage reading first)
**Cost:** estimate it once the capture is done, from the image count, at about 0.7M subagent tokens per 1% of the
weekly allowance (lanes/lane-b.md's readings), and tell the co-founder before the reviewers start.

0. **The route map, before any capture.** A scout lists every route (`find apps/web/src/app -name page.tsx`: 83 at
   6ddd587, 84 once #42 merges). For each it records:
   - the persona that may open it (`apps/web/scripts/synthetic-personas.ts`, and the route's permission in `apps/web/src/lib/routes/*.ts`);
   - the record its dynamic segments need;
   - which `apps/web/e2e/*.spec.ts` creates that record.

   A route no spec reaches is recorded as "not reachable on synthetic data", never faked. Error states: not-found by an
   unknown ID; loading by delaying the page's data with `page.route`.
1. **Capture every page**, each as the role that uses it, at 1280 px and 390 px, plus the empty, loading and error
   states the map names.
   - **Dark:** the app has dark tokens (`packages/brand/src/tokens.css:73`) but no theme switch and no `prefers-color-scheme` rule, so no user reaches dark today.
     - Capture dark by setting `data-theme="dark"` on `document.documentElement` after each load, as `apps/web/e2e/brand.spec.ts:407` does.
     - Label those shots "dark (tokens only)" and judge their contrast as advisory.
     - Make the choice (follow the device's setting, offer a switch, or stay light-only) on the evidence, take the recommended option, and report it (the co-founder's ruling of 2026-10-25 ~21:50 UTC: wording and visible changes without asking).
   - **The tool:** `tools/lane-b-screen-tour`, following its README's Set-up (`TOUR_DIR` in the new session's scratchpad; `TOUR_MINUTES=90`).
     - Populate with the specs the map names. Each capture starts from a fresh prepare, because the platform administrator's key registers once per database.
     - Synthetic data only, and one heavy command at a time under the lock.
   - **The spec:** extend `tools/lane-b-screen-tour/capture/tour.spec.ts` on claude/build-ops, not the copy in `$TOUR_DIR`, and push it with the review.
   - **The record:** keep the PNGs and a manifest of route, role, width and theme. The manifest comes from `shots.json`, plus the theme.
   - **Give each lens only its images:**
     - the 390 px reviewer: the 390 px and state shots;
     - the brand reviewer: one shot per layout, and the dark set;
     - the flows reviewer: each role's path.

     Give every reviewer the manifest and exact file sections, never whole large documents.
2. **Five expert reviewers in parallel**, each with its own lens, each reading the screenshots and the code behind them:
   - brand and visual design (tokens, type scale, spacing, the mark, status colours, consistency across screens);
   - information hierarchy and flows per role (billing manager, packet approver, practice administrator, the
     organization's administrator, the operator on the console, the screening's prospect): what each must do, in how
     many steps, what they see first, dead ends;
   - words: plain language, the brand's voice, CO-11, honest claims (no figure or promise the product cannot prove),
     every error with its next step;
   - accessibility: WCAG 2.1 AA by hand as well as axe (keyboard order, focus, contrast in both themes, labels, tables);
   - 390 px and states: overflow, tables, touch targets, loading, empty and error states, what a refresh loses.
   Each finding: the screen (PNG and route), severity (blocking, should fix, polish), evidence, the best fix, its size,
   the files it would touch, and whether it needs a migration or touches #42's files.
3. **A synthesizer** removes duplicates, ranks the findings, and groups them into proposed pull requests in landing
   order, each small enough to review well.
4. **One adversarial reviewer** checks the proposals against the brand rules, the freezes (no engine, ledger or
   content-pipeline change), the lanes' rules and the PRD, and checks that nothing is taste presented as a rule.
5. **Output:**
   - **The findings:** `designs/lane-b-ux-review.md`, with the findings, their evidence and the proposed PRs in landing order.
   - **The screenshots:** the repository is public, so they never go on a branch whole. Publish the PNGs, their manifest and a findings page as a private artifact gallery, as on 2026-10-25. Commit only the manifest and any small crop a finding needs. Record the gallery's URL in lanes/lane-b.md; the next re-tour reads its files to compare.
   - **The queue:** the proposed PRs join Lane B's work in landing order under the co-founder's standing direction "improve as you go" (2026-10-25 ~21:45 UTC). Each is claimed in LANES.md's Claims table as "queued (UX baseline review)" and reported to him; he may reorder or drop any. Anything needing a migration goes under "Handed to Lane A".
   - **Wording and brand choices:** each takes its recommended option without asking. All are listed for the co-founder in one report afterwards (his ruling of 2026-10-25 ~21:50 UTC).
   - **The founder's, through the co-founder:** a choice that changes legal text (the terms, the cookie notice, the screening terms, the AMA notice, or anything on HANDOFF.md's counsel list), or that reverses a recorded founder ruling.

## Not in it
No product code, no migration, no pull request (but for the checklist below). Taste never outranks the brand's
written rules; where the rules are silent, the reviewer says so and recommends.

## Then: a UX/UI and brand review of every screen as it is built (the co-founder, 2026-10-25 ~17:00 UTC)
The baseline review above covers what is built today. From then on the review runs with the build, not after it:
1. **The checklist.** The baseline review's first deliverable is `.claude/agents/ux-brand-reviewer.md`, a reviewer
   checklist in the form of the repository's other reviewer files (`security-reviewer.md`,
   `payment-engine-reviewer.md`), distilled from the brand's rules and the baseline's findings. It lands in its own
   small Lane B pull request (no migration), so both lanes' sessions read the same checklist. As with the other
   checklists, reviews run on the default workflow agent given this file (custom agent types twice stopped without a
   result; HANDOFF.md "How this session worked").
2. **In every pull request that changes something a person sees** (anything under `apps/web/src/app`,
   `apps/web/src/components`, the copy in `apps/web/src/lib/copy` or `apps/worker/src/screening/wording.ts`, the
   report, packet and payer's-copy renderers, or the email templates), one of the two adversarial reviews is the UX and
   brand review. Its reviewer gets before and after screenshots of the changed screens at 1280 px and 390 px (light
   and dark where offered), taken with `tools/lane-b-screen-tour` on the routes the diff touches (`TOUR_REF` set to the
   PR's base, then its head), and reviews them
   against the checklist and the baseline's open findings. A pull request with no visible change keeps its two
   reviews as they are.
3. **At each milestone** (each merge of a Lane B queue item that changed screens, and at the latest weekly), one light
   whole-app re-tour at both widths, compared with the previous tour, to catch screens drifting apart. Its findings
   join the queue the same way.
4. **Lane A.** Lane B applies this to its own pull requests. Lane A's pipeline is the founder's: the handoff asks the
   founder whether Lane A's screen-changing pull requests take the same reviewer.
