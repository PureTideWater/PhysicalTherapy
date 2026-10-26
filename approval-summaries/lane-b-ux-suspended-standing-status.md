# Status: a suspended organization never reads "In good standing" (`co-001/ux-suspended-standing`)

*Handoff, written 10:11 UTC (date -u) on the orchestrator's wind-down of 10:09 UTC (weekly usage at 90%; Lane B hands over
to Lane A tomorrow morning). Nothing is running and no check-in is scheduled.*

## Where it stopped
**Stopped at design reviewed (SS-01 to SS-14 accepted), with the build already committed; next step: the build's check
stage, then the draft PR.** The builders had started (wf_c4497dcf-2f8, from ~09:36) before the wind-down arrived and had
finished their three steps when the run was stopped at ~10:10; only its second agent, the checker, was cut off mid-run.

- **Design:** `designs/lane-b-ux-suspended-standing.md` (its "After the design review" section wins), review
  `designs/lane-b-ux-suspended-standing-review.json` (wf_dc42b346-7e7; build with changes, no migration).
- **Branch:** `co-001/ux-suspended-standing`, pushed, head **938f9916**, on base 7ef421b:
  - 057d4d9 tests first: one account standing on the billing page (BIL-05, BIL-06);
  - 01f290d the fix;
  - 938f991 BIL-05 and BIL-06 in the test matrix, matrix.ts and registry.ts.
- **No PR opened.**
- **Reserved IDs:** test-matrix BIL-05 and BIL-06; `packages/synth` BIL-05 and BIL-06 (module 15; no-file entries). No ADR.

## What the build did (the builder's report, `approval-summaries/lane-b-ux-suspended-standing-build-progress.md`; NOT yet checked by the check stage)
- `standingKind` in `packages/billing/src/standing.ts`, exported as `@tp/billing/standing`. It is not in
  `@tp/worker/billing`, because `public.ts` and `account.ts` sit in the screening import closure: a new file there
  would change #42's watched-paths.txt, and apps/worker/package.json is #42's.
- `accountStanding` in `lib/routes/billing.ts` returns kind, label, tone, notice, next steps, billing hold, forms note
  and plan refusal. It is rendered by `components/billing/account-standing.tsx` with `data-standing`.
- The holding invoice, `subscribe` refusing a closed organization, the console billing page's Standing cell and sort,
  the practice home's sentence, and the support page preselecting Billing for `from=billing`.
- Firms: a firm's billing suspension reads past due, and no words claim runs stopped for a firm.
- A seeded persona `suspended-admin` and its group "SYNTHETIC SUSPENDED GROUP", held suspended by `seed.ts`
  (packages/db untouched).
- **The builder's own checks on 938f991:** unit 493 passed; db (billing-routes, seed, onboarding, worker billing) 42
  passed; route tests 4, 5, 8, 11: 2,298 passed; typecheck, eslint, lint:copy and verify-content clean; synth unchanged.
  **e2e not run.**
- **A process note:** the builder once ran prettier by mistake (the repository has no prettier config). It restored the
  files and amended its own unpushed commit, so 057d4d9 is the corrected version.

## Next steps, in order (for Lane A or the next session)
1. **The check stage:** read the diff against the design; run pnpm typecheck, lint, lint:copy, lint:logs, test, synth
   --all and the db tests the diff touches; confirm that tools/screening-capacity/watched.test.ts passes (the new
   `packages/billing/src/standing.ts` must not enter the screening closure).
2. **A draft PR into claude/build-platform** from the template, and the after shots.
   - The before shots are taken: 12, at 7ef421b, good / suspended / closed at 1280 and 390, light and dark.
   - The capture spec is `workflow-scripts/lane-b-ux-suspended-standing-capture.spec.ts`. Its states are set through the
     database; the PNGs were not published.
3. **Two adversarial reviews:**
   - the UX and brand review (`.claude/agents/ux-brand-reviewer.md` from PR #55);
   - correctness against the database's refusal, with the security checklist for the `subscribe` refusal and the
     seeded persona (design SS-13).
4. **The rest of the pipeline:** the fix round with the full suite (e2e included: BIL-06), the fresh-clone verification
   reading CI, then the merge.

## Handed to Lane A (from the design review)
- A firm's suspension should refuse work on its granted practices: a migration to `organization_run_refusal` /
  `practice_run_refusal`. This is a blocking product defect (SS-01), and the console card's claim changes with it.
- The stored suspension reason, note and time, and the console's reason form (a migration; `lib/routes/console.ts` is #42's).
- The database refusal's words ("PaidWhole", not "a platform administrator").
- #42's `dunning.ts` sends "New runs have started again" while PaidWhole's suspension lasts (SS-08).
- The UX review document (`designs/lane-b-ux-review.md`) had not landed by 10:10, so §3.2 PR 2 and UX-004 were not
  re-read (SS-14).
