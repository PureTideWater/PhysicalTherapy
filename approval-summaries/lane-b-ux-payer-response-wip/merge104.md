# merge104: claude/build-platform (e084da22, #104 SS-01) into co-001/ux-payer-response

## Result
- Merge commit: 1f7b82b2d376a7d3e9900fed3fb8168c03d90f01. Parents: 03db7092 (the PR head) and e084da2256b1bf966b1eaa68a557012e42fd17f4. Not pushed. Nothing was rebased, amended or forced. The tree is clean.
- Base: origin/claude/build-platform at e084da22. Everything that arrived after 45d7d0c1 is #104 (SS-01, ADR 0080) and its own merges of the base: 93 files, including migration 20261108090000 (from the base; this merge adds no migration).
- WHAT-CHANGED: yes. Compared with 03db7092, a person now sees different words on upload panels:
  - A suspended or closed organization's panel shows the database's own SS-01 sentence, whole, as its body. Before, it showed #85's rewording of the old texts, which the database no longer produces.
  - A grantee's held people get a closed upload gate, because the hold is now decided per permission. #104 brings this.
  - The empty home titles a closure "Uploads are closed" where #104 said "No new uploads start".
  - Everything else from #104 comes in as it is: the home's hold notice, the billing page, the console's suspension card, the grants' state and the refused-export words.

## Conflicts and their resolution
1. **apps/web/src/lib/routes/uploads.ts.** The two sides now share one gate, `uploadGate` (ADR 0085). Its state comes from SS-01's model:
   - It checks the BAA first. Without the BAA, the panel reads "Uploads are not open yet" over the NO_BAA sentence. Only the missing BAA uses that title.
   - It then calls `workPause(scope, practiceId, 'file.upload')`, the hold that `practice_run_refusal_for` decides for this person. That is either the owner's hold or a grantee's hold through its grant.
   - Where #85 called `practiceRunRefusal`, the gate now calls `workPause`.
   - I dropped #85's keyed map of the old organization_run_refusal texts, because the database no longer says them.
   - `suspendedGate` now takes the WorkPause and words it through SS-01's `uploadsHeld`. `uploadsPage`, Contracts, Reconciliation and the payer's letter on Submissions all read `uploadGate`.
   - Nothing either side refused is now allowed. A refusal for file.upload always closes the gate.
2. **apps/web/src/components/uploads/uploader.tsx.** I kept #85's required `title: string | null`. SS-01 had made it optional with a fallback, but every caller passes the gate's title.
3. **apps/web/src/lib/routes/uploads.db.test.ts.** Both sides asserted the same gate, so I kept #85's line, with its `as string`.
4. **apps/web/src/lib/routes/billing-routes.db.test.ts.** I kept every test from both sides, including SS-01's `home.hold` assertions.
   - The two sides asserted contradictory upload words:
     - SS-01: "Uploads are not open yet" over "Uploads are paused: <reason>."
     - #85: "Uploads are paused" over its own rewording of the old texts.
   - The merged code decides, and both sets of tests now assert it exactly:

     | State | Title | Body |
     |---|---|---|
     | Nonpayment | "Uploads are paused" | "An invoice of your organization has been unpaid for 30 days since its payment failed, so no new work starts at this practice until it is paid; everything here stays readable." |
     | Suspended by PaidWhole | "Uploads are paused" | R1, whole |
     | Closed | "Uploads are closed" | "The practice's organization is closed, so no new work starts here; everything here stays readable." |

   - #85's unknown case is now a hold whose cause the words do not know (`restarts: null`). It shows "Uploads are stopped" over the sentence whole ("The organization is SYNTHETIC: a reason not known here.").

## Changed to agree, outside the conflicts (no assertion weakened)
- **lib/billing/suspension-words.ts `uploadsHeld`:**
  - The titles are now "Uploads are paused" (a hold that lifts), "Uploads are closed" (a closure; it was "No new uploads start") and "Uploads are stopped" (an unknown cause).
  - The body is the database's sentence whole: first letter capitalized, one full stop. It used to start "Uploads are paused: " or "Uploads have stopped: ", which repeated the title.
  - `FIRST_UPLOAD_HELD` gains `unknown`, and its `stopped` title is now "Uploads are closed".
- **`WorkPause.restarts` is now `boolean | null`.** In lib/billing/hold.ts, `workPause` returns null for any cause outside suspended, nonpayment, on_hold and closed. The mapping screens and the Export card already read null as "no restart promised". The home gate in dashboard/headline.tsx gains an `'unknown'` state.
- **Tests:**
  - suspension-words.test.ts: the property now asserts that the body is the sentence whole and that no title says "not open yet". There is a new unknown-cause case.
  - headline.test.tsx: the closure title is now "Uploads are closed", and there is a new unknown case.
  - suspension-refusal.db.test.ts: R4 shows under "Uploads are paused" and R5 under "Uploads are closed", each sentence whole.
  - contracts-routes.db.test.ts and reconciliation-routes.db.test.ts: R1, whole, under "Uploads are paused".
  - e2e billing.spec.ts: the title and the grantee's sentence are each matched exactly.
- **Docs and fixtures:** ADR 0085's gate paragraph now gives the merged titles, the ADR 0080 hold and the single gate. BIL-09 is updated the same way in docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts. `pnpm synth --all` regenerated fixtures/synthetic/BIL-09/expected.json.

## Other files both sides changed since 45d7d0c1 (checked; they merged cleanly)
docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and packages/synth/src/cases/registry.ts. #85 adds CAS-45 to CAS-48 and #104 adds BIL-07 to BIL-10. Neither overlaps the other, apart from the BIL-09 wording above. apps/web/src/lib/uploads/gate.ts changed only on the base, and its comment already points to workPause.

## Regenerated
- `pnpm install --frozen-lockfile`: 0.
- `watched.ts --write`: 553 lines, no diff.
- `pnpm synth --all`, run twice: 0 both times. Only the BIL-09 fixture changed.

## Checks
- `pnpm typecheck`, `pnpm lint`, `pnpm lint:copy`, `pnpm lint:logs` and `pnpm check:fixtures`: all 0.
- vitest unit and browser tests (components/uploads, packets, reconciliation, dashboard and mapping; lib/billing and lib/packets): 15 files, 200 passed.
- Route db tests on a fresh database, tp_paymerge104_2637 (PG 5433; migrated, then dropped): uploads, billing-routes, contracts-routes, reconciliation-routes, unattested-submission-routes and workbench-routes, plus #104's suspension-refusal, console-routes, export-attempts-routes, mapping-routes and home-figures. 11 files, 145 passed.
- `pnpm build`: 0. I stamped the build with 1f7b82b2 (`build-stamp.ts --write`).
- `E2E_PREBUILT=1` e2e (E2E_DATABASE=tp_e2e_paymerge104, E2E_PORT=3491, admin at 5433): uploads, contracts, packets, reconciliation and #104's billing.spec. 13 passed.
- Afterwards I dropped the e2e database and removed its /tmp directories. 5433 now holds only postgres, template0 and template1.
- apps/worker/src/intake/scan.test.ts was not in the targeted set, so the known flake did not come up.

## Files
- /home/user/ux-payer-response (worktree; commit 1f7b82b2)
- /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/progress/merge104.md
