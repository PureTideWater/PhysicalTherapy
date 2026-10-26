# Lane B superseded-rerun: PR #50 fix round (wf_11fa7137-42b), dispositions of every review finding

Commit 81b7b0c (41 files, +2,191/-475), then the base merge a3c583d (4d99df8: #46 and #47; clean). Full local suite on 81b7b0c: every step passed on its first run (fix-suite section below).

## Worker and service fixer (PR #50 fix round)

- **Payment-engine F1 (completed_at stamped before the execution lock): fixed.** I did not add a session-level lock before BEGIN. Instead, apps/worker/src/price/execute.ts checks under the execution lock, after lockRun and before it reads anything: if a complete run of the practice has completed_at > now(), it throws a private PricedOutOfOrder, the transaction rolls back and pricing starts again with a later now(). That happens at most PRICING_TRANSACTIONS = 5 times, then the attempt fails and the job retries it. The check uses the partial index pricing_run_complete_by_practice.
  - Why not the session lock: it would need the shared, security-sensitive withJobScope or transaction helper in packages/db to hold a lock across its transaction on a pooled connection, and it leaks unless the connection is destroyed when unlock fails. It would also need a change to the JobContext API, and every job context and test double (price.db.test's failing and moving wrappers, pricing-world) would have to pass it on or silently lose the ordering. The check tests the exact property on committed rows at READ COMMITTED, under the lock the job already holds, for any caller.
  - No migration. The trigger's completed_at = now() rule is unchanged.
  - Model: test-support/rerun-model.ts now prices in separate steps (start, begin with the stamp, read under the lock with readAt, commit), allows executions at once, and has an orderGuard option. Invariant (ii) and liveness are now judged by readAt and the pinned inputs, not by completedAt.
  - Property test: new begin, read and price steps; a pinnedStep property (6000 runs); a named counter-example (without the restart, invariant ii fails).
  - DB test: "PRC-27: two executions at once" uses a gated context. It shows transactions == 3, the February run's completed_at > the re-run's, the re-run refused superseded, and February's lines on the February run.
  - The ADR's residual-window paragraph is replaced by "The execution order, closed". What is left is a worker of the previous version during the deploy that ships this.
- **Payment-engine F2 (split and triage date fixed at creation): split fixed; triage date not taken, with evidence.**
  - Split: NEWER_PRICING now also counts X as newer when X pinned a split approved later by (approved_at, id), or X pinned a split and R pinned none. It reads splits through pricing_run_split(), the practice-scoped definer, because tp_app cannot read place_of_service_split.
  - Triage date: as_of only sets the trace's window status label. window_ends_on, which is stored, does not depend on it (packages/pricing/src/windows.ts), no amount does, and triage judges WINDOW_PASSED on its own date (packages/triage/src/actionable.ts:154). This is recorded in the in-effect.ts doc, the ADR and the alternatives table.
  - Model: FIXED_AT_CREATION = [release, split]. The regression invariant now uses olderPricing, which is independent of the rule. A named counter-example (a rule without the split fails ii).
  - DB tests: "a run pinned to a later place-of-service split" (S1 then S2; X priced first; R refused; a later re-run accepted) and tie Sequence E.
- **Payment-engine F3 (untested clauses): fixed.**
  - New DB cases:
    - tie Sequence D (the cut-off alone decides)
    - PRC-27 (g) (the later release alone decides; set up under 900001, priced after 900004)
    - the split cases
    - tie Sequence F (non-overlapping April runs, using PRC-19's 835 moved to April)
    - first runs priced out of order (the took-effect-after-the-original tuple)
    - a running re-run does not block acceptance or creation
    - completions meanwhile that do not count (an unaccepted re-run, other dates)
    - a queued first run in the parity practice
  - I mutated every clause of SUPERSEDES_RERUN, NEWER_PRICING, RERUN_SUPERSEDED, OVERLAPPING_FIRST_RUN, NEWER_RUN_RUNNING/PENDING, TOOK_EFFECT_MEANWHILE and RERUN_ACCEPTANCE in place, plus the not_in_effect, create-pending, accept-pending, changed_meanwhile and diff_changed refusals and the execute.ts restart. Each mutant was run against rerun.db.test.ts and restored. All are killed except these, which are equivalent:
    - M01 x<>o: (since,id) > (since,id) is false for x = o.
    - M02 and M19 x<>rr: rr is an unaccepted re-run, so it is not eligible wherever it is judged.
    - M13 x<>r in OVERLAPPING_FIRST_RUN: r is always complete, and only queued or running statuses count.
    - M22 >= versus > now(): a difference needs an equal microsecond transaction start. >= is kept as the safe side.
  - The script and log are in scratchpad/mut/.
- **Payment-engine F6 (withdrawn re-run shown as 'awaiting'): service side fixed; the web must adopt it.** in-effect.ts exports RERUN_ACCEPTANCE(r), a CASE returning NULL, release_withdrawn, superseded, newer_run_pending or awaiting in acceptRun's order, plus RERUN_ACCEPTANCES and the RerunAcceptance type, also through public.ts. The parity test now checks RERUN_ACCEPTANCE, read in each practice's scope, against rerunBlock, with withdrawn re-runs as release_withdrawn. It asserts that awaiting, release_withdrawn and superseded are all reached.
- **Payment-engine F4, F5: not in my share** (the web fixer's).
- **Security F1 (acceptance not bound to the reviewed diff): service side fixed.**
  - AcceptRunInput.replacesId is REQUIRED for every caller. That is the safer option: an optional field would let a caller accept a change nobody saw.
  - It is checked after changed_meanwhile. The new reason is diff_changed: "was not accepted, because the run it would replace has changed since its changes were shown; check the changes again and accept it if it is still offered".
  - An already-recorded acceptance stays idempotent whatever replacesId says (tested).
  - The worker callers and tests now pass the original, or the run the page would show.
  - DB test: the reviewer's sequence (`two`'s page against N; `one` accepted; accepting `two` naming N gives diff_changed and nothing accepted; naming `one` is accepted). PRC-26 (ii): the retry naming the first run gives diff_changed, and naming r1 succeeds. (iii) passes r1.
- **Build proposals (message wording): taken.** Every refusal now reads after "This re-run: " or "This run: ". The design's §8.2 and the ADR are updated.
  - not_found: "is not one of the practice’s runs"
  - not_rerun: "is a first run of its service dates, in effect once it completes; only a re-run is accepted"
  - not_complete (accept): "has not completed yet; a re-run is accepted once it is complete and its changes can be read"
  - not_complete (create): "has not completed, and only a complete run is priced again"
  - release_withdrawn: "is pinned to a withdrawn rule release, so it is not accepted; re-run the run in effect under the release in force"
  - not_in_effect: "is not the run in effect for its service dates, so it is not priced again; re-run the run in effect instead" (accurate for a re-run nobody accepted)
  - create newer_run_pending: "...; once it finishes, re-run the run in effect" (UX-7's point on the service side)
  - superseded, same period: "...; the page is updated to name it" (UX-3's service wording)
  - superseded, other period: "can no longer be accepted, because a run of some of these service dates holds newer pricing; re-run the run in effect for these service dates". "Priced after it" is no longer always true with the release and split clauses.
- **Test matrix:** PRC-26 gains the diff_changed sentence. PRC-27 gains "or a later place-of-service split", "Of two runs priced at once, the one that read its inputs last counts as priced last." and "under the same release and split". docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts are identical, and the PRC-26 and PRC-27 expected.json files are regenerated.

## Web fixer (PR #50 fix round)

- **Security F1, routes and forms: fixed.** Both Accept forms (run page, compare page) post `replacesId` (the run the diff was against: `acceptance.replaces.id` / `before.id`) and `heldByIds[]` (see F4). The accept route's Zod input takes `replacesId: opaqueId` and `heldByIds` (comma list of opaqueIds, at most 200, default none) and passes both to `acceptRun`; `refusal()` maps `diff_changed` to the run field ("This re-run: ..."). reruns-routes.db.test: a page of `two` read before `one` is accepted is refused `diff_changed` with no `pricing_run_accepted` event, and accepting from the refreshed page succeeds; a form naming runs its diff did not read is refused; a form without `replacesId` is invalid.
- **Payment-engine F4 (diff under overlapping periods): fixed exactly, not by naming runs.** `apps/worker/src/price/diff.ts` gains `compareAcceptance` (ACCEPTANCE_SIDES: before = each line's pricing in effect now via PRICED_IN_EFFECT, for every line the re-run or the replaced run priced; after = the re-run's line, or for a replaced-run-only line the pricing in effect of runs not of the re-run's period) and `acceptanceHeldBy` (the runs of other dates either side reads). `compareRuns` and it share one core (`diffOf`); causes are read per line under each side's own release; `DiffSide.pricingRunId` added. The run page and the compare page's Accept mode show it ("In effect now" / "Once accepted", "From [run]", a held-by sentence). Binding, the safer option: `acceptRun` requires `heldByIds` and, under the lock, refuses `diff_changed` when `acceptanceHeldBy` now differs (covers a re-run of other dates accepted meanwhile that is not newer, so not superseding); message now "the pricing it would replace has changed". Tests: rerun.db.test 'PRC-27: what accepting a re-run changes' (3 cases; `expectExact` accepts and checks the listed lines equal exactly the lines whose pricing in effect changed; the reviewer's sequence lists 0 where compareRuns lists 4; a sides case lists the February run's NO_AGREEMENT pricing as before; no other run = compareRuns). Not taken: "name the other runs and show their diffs too" (still not the lines that change) and binding by page-read time (refuses for runs holding none of the lines) — both in the ADR alternatives.
  - Outside the PR's files, with reason: `apps/worker/src/price/causes.test.ts` (its DiffSide fixture needs `pricingRunId`).
- **Payment-engine F5: fixed by the condition.** `nothingMoreToAccept`: only when the named run is the run in effect, was priced after the re-run (`NEWER_BECAUSE` = priced_after) and its `rerun` reasons are empty; otherwise the Re-run of the run in effect is offered. New `NEWER_BECAUSE`/`NEWER_REASONS` in in-effect.ts (NEWER_PRICING split into its three clause fragments, same SQL), read by `rerunAcceptance` as `newerBy`.
- **Payment-engine F6, web: fixed.** RUN_COLUMNS reads `RERUN_ACCEPTANCE('r')`; `RunSummary.acceptance` is `RerunAcceptance` (web `RunAcceptance` removed); badge "Can no longer be accepted" with `data-state="rerun-withdrawn"`, list text "can no longer be accepted, its rule release withdrawn".
- **UX-1: fixed.** Card description: "Nothing of it is in effect until a person accepts it." only while acceptable/waiting; "It was never accepted, and it is not in effect." when superseded or withdrawn; nothing once accepted.
- **UX-2: fixed.** `runName` adds "priced YYYY-MM-DD HH:MM:SS UTC" (seconds: runs of one minute in the shots), "created ..." for a run not complete; used by every RunLink and the held-by names.
- **UX-3: fixed in this PR, for every form, safely.** `next.ts` marks the generic line (`invalid: true`); `ActionForm` (layout effect, before paint) shows "Check the fields marked below." only when an issue marked a visible control, else "Not done" and the issues alone. Other forms with visible fields are unchanged; forms rendering `state.error` themselves (screening upload, packet version, export status) are unchanged. Service wording "the page is updated to name it" (worker fixer).
- **UX-4: fixed.** On a superseded re-run's page the button reads "Re-run the run in effect under release N", the sentence names that run, refusals read after "The run to re-run".
- **UX-5: fixed.** NotInEffectAlert, PendingRunsAlert, RerunBlockedAlert are `role="status"`; compare page explanations are Cards (regions); the refused form's own summary stays `role="alert"`.
- **UX-6: fixed.** `refreshOnError` is now the form's key; `RefusalTakeover` (focusable wrapper, no live role) around each explanation that can replace a form takes the focus when it mounts within 15 s of that form's refusal and the focus fell to the body (the refused form is gone); first taker ends the hand-off. e2e asserts the focus lands on it.
- **UX-7: fixed.** Pending note: "Once it finishes, re-run the run in effect for these service dates." (correct for a pending run of the same or other dates). An acceptable re-run with queued first runs now says "This re-run can be accepted now, and that run takes effect after it once priced."
- **UX-8: fixed.** Each body says which condition holds (priced after / later release / later split / later lines; other dates: priced after / later release / later split), links by run name (no "the earlier run"), "the lines both runs price" / "it shares with them".
- **UX-9: fixed.** Compare page: a Card (region, title "This re-run can no longer be accepted" / "Wait for the newer run", description the run page's title) with the run page's body, naming "the first run" when it is the first run shown; "Compare with the run in effect" is a Card too.
- **Build proposal (unit tests): taken.** display.test.tsx covers every badge, list text, run name, note and explanation variant (singular/plural, each reason, nothing-more vs re-run, run in effect ≠ newer, original never in effect, roles); diff.test.tsx the acceptance mode; new action-form.test.tsx the first-line rule and focus hand-off.

## Suite runner (PR #50 fix round): consistency pass
- Test matrix and synth mirror: PRC-25, PRC-26 and PRC-27 identical in docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts; the three expected.json files carry the same text.
- Design §8.2's `diff_changed` line still had the worker fixer's "the run it would replace has changed"; brought to the code's message ("the pricing it would replace has changed") and its reason widened to the heldByIds check (payment-engine F4). ADR 0037 already matched.
- PR #42 overlap: only the three shared documents; nothing under packages/pricing or packages/db.

## Full local suite (on 81b7b0c)
