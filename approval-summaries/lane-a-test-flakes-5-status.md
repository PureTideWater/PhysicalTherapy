ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-04T18:45Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 18:34Z, ahead of the contrast work.

# Item: test-flakes-5 (`co-001/test-flakes-5`), tests only

The flake (from #108): apps/web/e2e/sign-in-time.spec.ts:213, the step "a valid code pressed on a closed step starts
again…". Axe's document-title rule (serious) ran before the restarted page's <title> was set. It hit #115's e2e (2/2) on
83414ebd, run 41885977909, which S1 re-ran once. Under CI-07's failOnFlakyTests it fails other PRs' e2e jobs.
The fix is at the class: the shared helper apps/web/e2e/a11y.ts (expectAccessible) waits for a non-empty title, or the
expected title, before axe runs, plus a sweep of e2e/ for other axe calls right after a navigation or restart.
Pipeline: tests only; failing-first proof; draft PR; one review with skeptics; one fix round with the full suite once;
verification; the up-to-date rule; merge. When it merges, tell S1, S2, S3 and the schema chain.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text and never touches .gitleaksignore.

## Log (UTC)
- 2026-11-04T18:45:00Z: branch on origin at 9c6bb102 through the hook; worktree /home/user/test-flakes-5, installed. Workflow
  wf_1d563237-2f6 launched (build with the root cause from the CI log, failing-first proof, the helper fix and sweep, draft
  PR; review and skeptics; fix round with the full suite; verification); script archived. The dark-frame item
  (wf_85a93b20-bdd) keeps running alongside; this flake fix merges first.

- 2026-11-04T21:40:00Z: **draft #117**, head **bb01093d** (base 00fd2906 merged once). Root cause (from job 126772943409 and
  a MutationObserver on the real restart): the closed-step press is a server-action redirect, a client-side navigation;
  the notice renders and takes focus while the <title> is still empty, and "Sign in | PaidWhole" lands a mutation later. So axe
  ran in that window once on CI. Fix: expectAccessible and atPhoneWidth wait for a non-empty title (or the given one; 10 s
  cap) before axe; explicit titles at the restart and the forgot-password steps; a red-first proof spec
  (e2e/a11y-title.spec.ts); CI-19 amended (no new ID). Sweep: every axe call in e2e/ goes through the helper (179 calls
  on the head). Review: B1 (CI-19's mirror and fixture not updated, which failed the unit job) fixed; N1 documented; N2 shown red;
  N3 no change. Full suite once: green apart from the known threads.test.ts timeout (not this PR's). **NOT VERIFIED:** CI
  db (2/4) failed in route-tests.8.db.test.ts > practice.reports.documents.pdf (PricingRunInputError in
  seedMappedNotPriced), probably not this PR's (the base is green; 3/3 locally). Root-cause investigation wf_458de122-b65.
  Also owed: a base re-merge (30871f72) and the description's sweep count (176 to 179). Subscribed to #117.

- 2026-11-04T22:10:00Z: **db (2/4) root cause** (wf_458de122-b65; skeptic UPHELD with corrections; record
  `lane-a-test-flakes-5/db-flake-root-cause.md`). A product timing bug on the base, not #117's: createPricingRun
  (apps/worker/src/price/create.ts:121) reads its `now()` cut-off as a millisecond JS Date; the job reads it to the
  microsecond (execute.ts:243). So a line committed in the same millisecond is missed by the creation check only. The effect is false
  refusals ("a period that holds at least one service line"; MAP-07), never a wrong allow, no amount changed. Seen 1 in 30
  ci runs. Fix (its own PR, money code, two reviews): read it as text, plus a regression test that fails first. Reported to
  Lane A's orchestrator, with an offer to take it. #117: one comment posted (the red check is not this PR's); base
  30871f72 merged (aaaaf5c2: same 7-file diff, typecheck, synth and watched clean, synth tests 192); pushed; CI running;
  the description's sweep count (179 + 3) and head are being corrected by an agent.

- 2026-11-04T22:15:00Z: **#117 MERGED as c7bed0f7** (merge commit; expectedHeadSha aaaaf5c2; base 30871f72). CI green on
  aaaaf5c2 (22 runs; db 2/4 green this time); description corrected (179 calls + 3); ready 22:08Z; approval-of-record
  success 22:08:27Z. S1, S2, S3 and the schema chain told. Unsubscribed. Next: #116's base merge, then the pricing-run cut-off.

## Waiting on someone
- None.

## Next step
Merged (c7bed0f7); others told.
