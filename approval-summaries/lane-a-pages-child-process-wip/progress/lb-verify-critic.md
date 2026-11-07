# lb-verify-critic: completeness critic of lb-verify (PR #130 at 43a81626)

Updated 2026-11-06 (Lane B, read only on GitHub and the repository; clone /home/user/cx-pcp made and removed).

Verdict: lb-verify holds; nothing blocking. The gaps it left, each checked here:

- Required checks and ruleset: read from rules/branches/claude/build-platform (one ruleset 25837331): required
  `all green`, `mutation`, `screening-capacity gate`, `approval-of-record`, strict (up to date) = true; required
  approving reviews 0, thread resolution not required. All four success on 43a81626; 38 check runs, only `notify`
  skipped. Workflow runs on the sha: ci, mutation, screening-capacity, approval-of-record x2, all success. No legacy
  commit statuses. Branch protection API: none (ruleset only).
- approval-of-record logs opened (jobs 128189508865, 128190304661): APPROVAL_REVIEW_REQUIRED unset; "changes neither
  the approval line ... nor approvers.json, so it needs no review of record". It re-runs on ready_for_review (passes
  while the variable is unset). CLAUDE.md: until the agent has its own account, merge on green checks.
- Up to date: claude/build-platform still cc3dd7f6 (= PR base, ancestor of head). mergeable true, mergeable_state clean.
- Reviews/threads: 0 reviews, 0 review comments, 0 issue comments, ccr/review_threads = [].
- Draft: PR is still a draft; must be marked ready before merge (ci.yml does not re-run on ready_for_review).
- Ordering (heap.ts's flag before this): at base, infra/lib/heap.ts defines heapFlag but COMMANDS.worker is
  ['node','--enable-source-maps','dist/main.js'] (no flag); the task commands take it "in the later pull request".
  No open PR adds it (open: #126, #129, #122-#124 Dependabot). So the constraint holds; the PR adds the synth-time
  guard. Note: COMMANDS.screening already carries SCREENING_MAIN_HEAP_FLAG at base, but the screening consumer runs
  screening jobs only and no capacity scenario reads pages (tools/screening-capacity: no documentPages/intake/reader).
- Conflicts with other open PRs: #126 (LED-23..25) and #129 (SGN-13) touch test-matrix.md, matrix.ts, registry.ts,
  watched-paths.txt in different hunks; git merge-tree of #130 with each, and with #126+#129 together: clean. Either
  merging first forces a base merge (strict) and a CI re-run on #130.
- Image not exercised: no CI step runs the reader inside the built worker image (images job builds, scans, checks the
  headless shell only); bundle.test runs dist/page-reader.js on the host. Docker daemon not available here, so not
  run. Mitigated: image is node:24-trixie-slim (/bin/sh = dash; `ulimit -c 0` checked under dash here), dist copied
  whole to /app/dist, readerEntry('file:///app/dist/main.js') -> /app/dist/page-reader.js tested. Nit.
- Weekly release-capacity (scenario.ts now re-exports withHeapFlag from infra/lib/heap.ts) is schedule/dispatch only;
  not run on the PR (typecheck and unit cover the re-export). Post-merge item, not a merge gate.
