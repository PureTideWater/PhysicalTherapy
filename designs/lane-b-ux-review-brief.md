# Lane B: the UX/UI and brand review (brief for the next Lane B session's first task)

Asked for by the co-founder on 2026-10-25 (who decides for the founder on Lane B's work: LANES.md delegation of
2026-10-25), after the screen tour (https://claude.ai/artifact/3WudgKdMPDcRik4Z5bxU3c) showed real defects. It is a
review, not a pull request: it changes no product code. Its output is a ranked list of findings, grouped into proposed
pull requests that join Lane B's queue (no-migration ones) or go to Lane A under "Handed to Lane A" (anything that
needs a migration, or touches #42's files while #42 is open).

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
  step, no state a refresh loses, money from cents in the practice's locale) and WCAG 2.1 AA (the e2e journeys already
  run axe through `apps/web/e2e/a11y.ts`).
- The combined audit's user-experience items (`/home/user/ops/audits/combined/combined-report.md`; for example #61, no
  dead Approve button, and the final pass's 390 px screens) and the screen tour's five defects (lanes/lane-b.md,
  2026-10-25 ~15:40 UTC).

## Method (one workflow; about 3 to 4% of the weekly allowance; the usage reading first)
1. **Capture every page**: all 83 `page.tsx` routes under `apps/web/src/app`, each as the role that uses it, at
   1280 px and 390 px, in light and dark where the app offers a theme, plus empty, loading and error states where a
   journey can reach them. Reuse `tools/lane-b-screen-tour` (point its scratchpad paths at the new session's first;
   synthetic data only; the five e2e journeys fill the screens; one heavy command at a time under the lock). Keep the
   PNGs and a manifest of route, role, width and theme.
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
5. **Output**: `designs/lane-b-ux-review.md` (findings, evidence and proposed PRs), the screenshots kept beside it if
   they are needed to read it, and the proposed PRs added to Lane B's queue in LANES.md. Wording and brand choices the
   proposals raise go to the co-founder in one batch, each with the recommended option first.

## Not in it
No product code, no migration, no pull request. Taste never outranks the brand's written rules; where the rules are
silent, the reviewer says so and recommends.
