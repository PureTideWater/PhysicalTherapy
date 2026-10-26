# Status: a suspended organization never reads "In good standing" (`co-001/ux-suspended-standing`)

**MERGED** as PR #56, merge commit **0e28f9b** (12:12 UTC), with method merge and expectedHeadSha bffe291. The fresh-clone verification passed on dedd735, and every required check was green on bffe291. Nothing is running, and no check-in is scheduled.

- **Fix round (wf_01c39982-072, ~10:45-11:15):** all 13 review findings fixed (5380543, eca5f05).
  - Full local suite on a141023: unit 337 files 5,276 passed 3 skipped; db 120 files 9,077 passed 1 skipped; e2e 52/52 (BIL-06 included); golden 221; oracle 637; lint 1,520 files 0/0; no money package affected (`approval-summaries/lane-b-ux-suspended-standing-fix-suite.md`).
- **Base merges, each without conflicts:** a1c4185 (#53), a141023 (#55), dedd735 (#50), bffe291 (#52). After the last one: typecheck, synth (0 written), 608 unit tests and the billing db test re-run and passed.
- **Fresh-clone verification (wf_3df9abd9-3e0):** pass on dedd735; CI totals unit 5,325, db 9,115, e2e 52 (`approval-summaries/lane-b-ux-suspended-standing-verify.md`).
- **CI on bffe291 (final):** every check green. Push runs on 0e28f9b: ci, mutation and screening-capacity all success.
- **After the merge:** unsubscribed; check-in deleted; main checkout at 0e28f9b; worktrees removed. PostgreSQL was down again from a machine restart, so tp_e2e_screens could not be dropped (harmless, synthetic).
- **Proposals:**
  - list every invoice the hold counts when one falls outside the newest 24;
  - reopening a closed organization (Lane A: console + migration) if wanted, before any copy promises it.


*Handoff, written 10:11 UTC (date -u) on the orchestrator's wind-down of 10:09 UTC (weekly usage at 90%; Lane B hands over
to Lane A tomorrow morning). Nothing is running and no check-in is scheduled.*

## Resumed (2026-10-26 10:13 UTC, the orchestrator's change of plan: up to 98% weekly usage allowed; take it to the merge, lean)
- 10:14: worktree restored from origin at 938f991; check stage running (wf_49f58d38-036), with the base merge (88a0e4e, PR #53); draft PR #56 opened and subscribed; safety-net check-in 12:15 (trig_01Vph3iWdjHuPwC75hFwAxNC).

- 10:27: the check stage passed (wf_49f58d38-036; base 88a0e4e merged at a1c4185; unit 337 files 5,274 passed 3 skipped; lint 1,520 files 0/0; db 42/42; route tests 4,600; no money package affected); pushed a1c4185; PR #56's description written from the template and read back byte for byte.
- ~10:35: after shots (12, a1c4185) and the gallery, private: https://claude.ai/artifact/CxnGySfnkDBPfMHbSZJFib
- ~10:40: the two adversarial reviews, both "merge after fixes", none blocking; all accepted (`approval-summaries/lane-b-ux-suspended-standing-review-findings.json`):
  - correctness against the database's refusal (wf_122b0c50-2d7): SSC-01 several invoices held 30 days (paying the named one does not restart runs); SSC-02 no reopen path exists, so no reopen promise for a closed organization; SSC-03 the ACH caveat on past due; SSC-04 the closed check in the claim insert;
  - UX and brand with PR #55's checklist (wf_43a5eb15-8b4): UX-1 the past-due hold's wording while suspended; UX-2 the price footnote; UX-3 the closed invoices empty state (no reopen, per SSC-02); UX-4 closed in a neutral tone; UX-5 the Pay anchor under the sticky header; UX-6 one name in the console; UX-7 the console's firm-aware hold; UX-8 "reinstates"; UX-9 the plan refusal's wording.
- Fix round running (wf_01c39982-072): every finding, then the full local suite once; then one push.

## Where it stopped (wind-down, 10:10)
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
