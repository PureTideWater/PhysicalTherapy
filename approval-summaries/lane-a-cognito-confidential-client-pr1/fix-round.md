# #113 fix round (one round), 2026-11-04

- **Pushed head:** `ed4318e884569bf66ae3dcbe9e195df2ced8de5f`, 13 new commits on `1234a47c`. The pre-push hook passed (fixture check and gitleaks clean). Nothing was forced or amended, and `.gitleaksignore` is untouched.
- **Base:** `origin/claude/build-platform` is still `c4941291`, which the head already contains. The merge was a no-op: no merge commit and no migrations came in.
- **Dispositions:**
  - Fixed, red first, in PR 1: S1, N1, N2, N3, N4, N7, IA-1, IA-2 and IA-3.
  - N5: the classifier was widened and the staging gate added. The probe's positive control is deferred to PR 2.
  - N6: fixed in the docs.
  - IA-4: a PR 2 matter.
  - Both PR 2 items are recorded in proposals.md. See review-security.md and review-infra-auth.md.
- **S1 follow-through:** the seed now records each invited persona's invitation, and the tests that enrol an invitee give it one. The e2e invitee journeys passed.
- **Full suite:** recorded in the scratchpad file cc2/suite.md. Everything passed except one unit timeout in `apps/worker/src/screening/threads.test.ts`, a file this PR does not touch. Rerun alone, it passed 3 of 3 times. The e2e suite passed 77 of 77.
- **Templates:** the three platform stacks each add 14 resources (6 filters, 7 alarms, 1 insight rule). Staging also changes its diff-role policy. The address-validation stacks are unchanged.
- **PR body:** updated through the connector, read back and matched, with the exact footer. The PR is still a draft, and nothing was commented, reviewed or merged.
