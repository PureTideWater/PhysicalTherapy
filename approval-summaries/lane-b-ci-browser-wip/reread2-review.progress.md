# review progress (ci-browser reread2 adversarial review)

Started 2026-10-27. Status: reading section 3.3.

## Findings so far
(none yet)

(02:3x) Findings drafted:
- B: phase-2 list omits acceptance 3's two failing-first runs at the new merge base e908c21 (phase 1 recorded only watched.test's; build summary :20, :111).
- S: step 7 says synth --all is a no-op, but §3.5's new CI-18/CI-20 text changes matrix.ts/test-matrix.md and CI-18/CI-20 expected.json (fixture holds assertion text); CI-18's row (test-matrix :278, matrix.ts :418) missing from step 6 / 3.3.2 row.
- S: release-capacity setup-node has cache: pnpm (release-capacity.yml:72); §3.3.3 rule "each --image job with setup-node 24 and both cache inputs off" conflicts or needs scoping.
- S/B: unit +55 is a `vitest list` delta, which lists it.each once; the run delta measured on the subset is +66 (e908c21 631 -> 2ab2b15 697; browser-build it.each x3, browser-version it.each x10). Evidence: scratchpad/reread2/review/{base,head}-subset.json.
- B: release-capacity capacity kept on 24.04 departs from F5's letter ("every other job moves", reconciliation :646) and its recorded reason (binding measurement only; release-capacity is advisory, never attested, release-capacity.yml:3-13, :56-59); failing checks are not timing (times advisory :11-12). Founder ruling = founder's (brief §6). Fix: move to 26.04 (RELEASE_CHAIN 8, 22 move), or record as founder's.
- N: comparator path is verifiable: playwright-core 1.64.1 exports ./lib/coreBundle; utils.getComparator (coreBundle.js:8506, :11494, :77995).
- N: 2ab2b15 is pushed (origin/co-001/ci-browser = 2ab2b15 by ls-remote), §3.3.7 says local.
- N: release-capacity dispatch "not verified" is answerable: workflow exists on default branch claude/build-platform (gh api repo default_branch).
- checked OK: runs-on 30 (18 on 26.04, 12 other), content-calendar :26-32/:67, #42 intersect = 7 files (matches), reconciliation hunks disjoint, ADR 0066 cites, containers.ts :379/:661/:671, Dockerfile :21/:34-36, rc run.ts :20/:359.
- S: mirror-differs contingency adopts CI's values with no independent check now no local layout exists; propose a CI step fetching Google's zips (zipSha256 + tree).
- S: get_job_logs default tail_lines 500; plan must set it and check every chunk.
- S: local unit runs after bump skip printing tests (ci-chromium.ts: off CI skip); fix round's full suite can't run e2e; Chrome fallback risk.
- S: --image jobs' setup-node "no cache" rule (3.3.1) vs cache: pnpm at screening-capacity.yml:201, release-capacity.yml:72.
- S: A9 note: where the side-by-side PNGs live/commit not named; attribution shell vs browser.
- N: pnpm trust verified (pnpm.cjs:67240 truthiness; all five have _npmUser.trustedPublisher).
- N: baseline written set still parsed from message text (ci.yml:611), claim "not by a message text" inaccurate; 1.64.1 message verified expect.js:12484-12486.
- N: launch-check.ts RELEASE_RUNNER is :107 at 2ab2b15 (:104 at e908c21).
- N: §3.5 rows carry design cross-refs; §3.3.3 worktree command copies deferred files; dry-run --image contradiction.
Status: writing review.
Status: review written to designs/lane-b-ci/ci-browser-reread2-review.md and scratchpad/reread2/review.md (done).
