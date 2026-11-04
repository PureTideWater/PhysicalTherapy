# PR #117 (test-flakes-5): fix round

Head bb01093d, base 00fd2906 merged once. The base has since moved to 30871f72 and was not merged again. Still draft.

- B1 fixed (d5de98aa): synth copy matches the row, assertedBy names a11y-title.spec.ts, fixture regenerated with pnpm synth. fixtures.test.ts went red then green.
- N1 documented (929d9d2f): the wait guards axe's document-title rule; steps that need the new page's own head name its title.
- N2 shown red in a one-off local run (received the stale title), not committed.
- N3 no change: CI e2e (1/2) and (2/2) passed on 9575c2c9.
- Local suite: all green except one unit test, apps/worker threads.test.ts:143, a 5 s timeout under load. Nothing in apps/worker changes here, it fails the same way on another branch, and alone it passes 9/9. e2e whole 80/80. Repeat x10: the formerly flaky test 10/10; :310 8/10, failing at the password step after the invite retries, before axe.
- To decide: approve the latest commit once CI on bb01093d is green.
