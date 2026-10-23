This is a fail, for one fixable gap. Every test passes and CI is green.

Your "Free: time advisory" ruling works as intended on pull requests. A pull request now fails on any correctness problem (wrong prices, missing emails, stalls, queue order, memory, crashes) in all three S4 runs. Only slowness becomes a warning. I tried about 60 ways to break this and none got through.

The gap is in the production launch check. It accepts any report marked "binding", not only the one your release workflow produces, and anyone can mark a report binding with a command-line flag. Someone could re-measure the release's exact images on a fast machine of their own and open production with that report. A hand-edited report would also open it. The docs say only the release's report can do this. The 48-second line was set for GitHub's slower machine, so a pass on a faster one does not show the promise holds on AWS. The fix is to have the release sign its report with GitHub's free artifact attestation and have the launch check verify it. The alternative is to correct the docs.

Three small doc errors:
- PRD 19's ten-customer total is $15 high at the low end and $5 high at the top: the rows add to $1,361–$2,021, not $1,376–$2,026.
- One sentence claims "two of three slow runs still fail", which isn't strictly true.
- The ADR gives the wrong time for your second ruling.

Two things need your decision:
- Today's measurement on this pull request put the middle S4 run at 51.1 s. A release built now would fail the binding check, so the screening could not open on this code on the free runner.
- That 51.1 s is above 44 s, so under your earlier rule the consumer's size (the 4 vCPU / 8 GiB option) comes back to you before merge.

## CI on 848841b

Head 848841b3c9d700020b52d63bb5dc49cd73da8c46, PR #39 (draft, open). Every check run completed:
- check (ci.yml): success, 13:05–13:45. Covered fixtures, typecheck, lint and lint:logs, verify-content, releases immutable, engine freeze (no pricing src change), synth --all with no diff, unit 298 files / 4505 passed and 1 skipped, golden, oracle, db 105 files / 9041 passed and 1 skipped (domain-model.db.test.ts 2/2, the approval case included), e2e 51 passed, build and cdk:diff. The skipped unit test is workflows.test.ts's actionlint case, skipped because actionlint is not on the runner; this predates the delta, and actionlint passes locally.
- capacity: success, 13:05–13:22.
- screening-capacity gate: success.
- changes: success.
- images (web), images (worker), licenses: success.
- mutation: success.
- approval-of-record: success, two runs.
- notify: skipped (a pull request).

The capacity run:
- Mode: advisory ('time mode advisory'). Runner: 4 CPUs, 15989 MiB, load 1.67 1.04 0.42; harness on CPUs 0-1.
- Layout: shared CPUs. Postgres on CPUs 0-1, the consumer on 2-3, the web and the platform on 3, the harness with Chromium on 0-1.
- Release 900100 (2,247,791 records) loaded in 266.2 s, from the cached scale release. Image config digests from buildx: web sha256:40f0b1d9…, worker sha256:3fe534d9….
- Uploads (seconds to email, logged time in parentheses):
  - S1-1 25.9 (25.8); S1-2 0.7.
  - S2-1 7.4; S3-1 6.8.
  - S4#1: 52.7, 52.8, 49.5, 38.3.
  - S4#2: 48.1, 48.7, 46.1, 34.7.
  - S4#3: 50.4, 51.1, 48.3, 37.3.
  - S5: 19.5, 19.7, 19.9, 8.9.
  - Every run was complete in the normal tier. Each S4 run and S5 started from a cold Postgres. The oracles compared S1-1, S1-2, S2-1 and S3-1.
- Middle run: S4#3, the worst large uploads being 52.8, 48.7 and 51.1 s.
- Warnings: three Time (advisory) warnings, S4#3 S4-1 50.4 s, S4-2 51.1 s and S4-3 48.3 s, each 'fail (allowance: above 48 s on the runner)'. One Sizing question (O9): 51.1 s is above 44 s.
- Verdict: 'pass (time advisory)'. The gate printed both warnings and passed.

A binding run on the same measurement would fail. I could not download the screening-capacity artifact (the agent proxy refused the blob host), so the harness-recorded image IDs were not compared with the buildx digests independently.
