# fold progress (reread2 review into §3.3.7), 2026-10-27
- Scout reports copied (unchanged, cmp ok). Backup of design: scratchpad/reread2/lane-b-ci.before-fold.md
## Dispositions
(none yet)
Verified 02:20-02:25 UTC (all findings real):
- B1 real (build summary :20 only watched.test red; :111 to-do). Fix: step before push.
- B2 real (reconciliation :646 letter; release-capacity.yml:3-13,:56-59). Take move to 26.04; chain 8; :429 18->22; CI-20 reverts to repo text (no change).
- S1 real: 631->697 = +66 (apt 5, browser-build 19, image-id 6, measure 6, browser-version 16, no-dup 1, workflows 13). 6,331.
- S2 real; with B2 only CI-18 changes (test-matrix :278, matrix.ts :418, fixture CI-18/expected.json:5).
- S3 real -> CI one-off Google zip check (CFT_BASE setup-container.sh:969).
- S4 real (tool default tail_lines 500).
- S5 real (ci-chromium.ts off CI no-op; playwright.config.ts:30,:93 channel chrome fallback).
- S6 real (3.3.1 :1851 "no cache"; screening :201, release-capacity :72 cache pnpm).
- S7 real; dir designs/lane-b-ci/ci-browser-a9/ on claude/build-ops (pushed, 60b09c67).
- N1..N10 all real (N1 npm view 02:23; N2 package.json exports ./lib/coreBundle; N3 default branch + file sha 486e36f5; N4 ls-remote 2ab2b15, 0 runs; N5 ci.yml:611; N6 :107; N7; N8 image-archive.ts not measurements.ts; N9 dry-run builds web only :81; N10).
- extra: /opt/pw-browsers holds 1194 and 1243 (design said 1243 only).
Status: editing design.
- 02:3x edit1 applied (in-place 3.3.1-3.3.4, §1 A8/A9): B2 runner counts, S6 rule, N8 cmd, N9, N5, B1 acc3, S1 count, S7 acc8. Next: edit2 (3.3.7 body), §3.5, 3.3.8.
- edit2 (3.3.7 table, new workflows, dispatch N3, N4, N1 row) and edit3 (phase 2 list, waits, S5, baselines S3/S4, A9 S7/N2, counts S1) applied. Next: choices/security/P14/P16, §3.5, 3.3.8.
- edit4 (choices, security, P14 withdrawn, P16+N10) and edit5 (§3.5 CI-18, CI-20 = repo text, N7 note) applied. Next: stale-text sweep, 3.3.8.
- 3.3.8 appended (:3075); report written to scratchpad/reread2/fold.md. Status: DONE.
