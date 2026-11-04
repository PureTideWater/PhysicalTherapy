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

## Waiting on someone
- None.

## Next step
The workflow, then ready and merge, then tell S1, S2, S3 and the schema chain.
