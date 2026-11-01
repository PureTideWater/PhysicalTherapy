# critic-2: completeness critic for PR #86's reviews at WIP head b2a41a00…

Started 2026-11-01 (first run; no earlier critic-2 file). critic-1.md exists (its F1-F3 are C1-F1..F3 in the list).
Clone: /home/user/critic-imgdigest-2 (read only, removed after).

## Gaps checked
(starting)
- G0 heads (ls-remote, about 20:45 UTC): claude/build-platform is now **43565235** (#83 UX PR 4 merged 20:40 UTC on top
  of bce57f16), not bce57f16; #42 refs/pull/42/head is **6c28d6a2** (the staged merge, pushed); 90 co-001 refs (was 79).
  #83: 27 files, apps/web, docs/adr 0078, test-matrix, fixtures TBL-*, packages/synth, watched-paths.txt (+2); none of
  #86's 9 files. merge-tree b2a41a00 + 43565235: clean, tree 6e91b893. To check: T1-T6 + T6 citations on that tree,
  watched-paths regen, synth.
- G1 read: workflow/doc hunks of the 9-file diff (bce57f16..b2a41a00, +738/-18) and the N32 describe block (2835-3390),
  identity-step test (1924-1990). workflowFiles reads .yml and .yaml. The one skip is the rewritten-copy self test
  (skipIf CI_TREE), not T1-T6.
- G2 R2's unit job (122700187684) read whole (1,433 lines): tools/test/workflows.test.ts ran in CI, "119 tests | 1
  skipped" (the skip is actionlint's, absent on CI; the rewritten-copy self test ran), 401 files / 6,805 passed. T1-T6 ran
  on CI at 83167b8f. Not a gap.
- G3 other branches (90 co-001 refs): unmerged ones touching .github or workflows.test.ts are only #42's
  (pr-06b-mail-streams = wip-pr42-integrate-3 = 6c28d6a2, c65f9cf2, be63bdc2), main-dependabot-template (main, old),
  dependabot-group-routing (dependabot.yml only). T6-producer files: suite-cap-1-triage-locks **ce408d2f** (20:18 UTC,
  merge base bce57f16, NOT stale, contains SS-01 efb20704) changes tools/release-capacity/checks.ts (advisories now
  :302-306, cited :181-195) and run.ts (GITHUB_OUTPUT write now :696, cited :535-536), plus SS-01's report.ts/run.ts;
  merge-tree with b2a41a00 clean (tree d5794c95). Bound unchanged (still one advisory line). Extends S1's stale list by
  two more rows (release-capacity advisories x2); same fix (P6). Critic-1 had called suite-cap-1 stale: no longer.
  Design §3 says "at most two lines" for advisories; the T6 row and checks.ts say one (design stale, code+row right).
- G4 mutation m-a (content-calendar.yml notify: one more step with env FINDINGS_COPY: needs.check.outputs.findings,
  and an upload-artifact step with path: the same): N32 describe "4 passed" (green). T6 keys rows by (file, job,
  value), so the one value admitted OVER the limit can reach any number of further env strings/inputs in its job; the
  FINDINGS_B64 assertion names one env key only. CANDIDATE FINDING (new: not N1/N4's per-scalar sum, not S2's bound
  drift). Whole-file run on m-a: running.
- G5 third-party exportVariable/GITHUB_ENV route: actions in use (13): attest-build-provenance, cache, checkout,
  download/upload-artifact, setup-node/python, trivy-action, build-push-action, login-action, setup-buildx-action,
  pnpm/action-setup. None exports event text; route not an instance today (noted, no finding).
- G4 done. m-a (steps inserted before notify's first step, one with uses:) is caught by OTHER tests (notifyStep is
  steps[0]; notify runs no action; pin consistency): 6 failed, none of them N32's. m-a2 (one step appended to notify:
  env FINDINGS_COPY: needs.check.outputs.findings, a run with no expression, if: always()): WHOLE workflows.test.ts
  121 passed (exit 0). FINDING N (new): the over-limit value is held per (file, job, value), not per site; a second
  E2BIG site joins with CI green, and when ci-findings-transport rewrites FINDINGS_B64 the leftover use keeps the same
  key, so the row could be rewritten as bounded while a whole copy still reaches a process. Restored, tree clean.
- G6 buildx v0.38.1 util/confutil/metadata.go fetched (raw.githubusercontent, 1,529 bytes): ParseMetadataProvenance is
  an exact `switch inp` ("disabled"), then strconv.ParseBool false -> disabled, else min. T5's comment "(Disabled would
  be min)" is right. Sound.
- G7 new base 43565235 (#83): worktree /home/user/critic-imgdigest-2-merge = b2a41a00 + merge --no-commit 43565235:
  clean; pnpm install frozen ok; `pnpm exec tsx tools/screening-capacity/watched.ts --write` -> 541 lines, equal to the
  merged index (539 + #83's 2); workflows.test.ts 121/121 passed. #83 touches no T6-cited file. So the new base needs
  only a merge commit (and the status/plan naming bce57f16 as base is stale). #42 now 6c28d6a2: merge-tree with
  b2a41a00 clean (tree 6c626606, as critic-1). No new defect; record-keeping only (C1-F2 covers #42's movement).
- G8 the base's push runs: ci on claude/build-platform push all success (#82's 41330911483, #83's 41348075952). #83's
  images job 124972092340 (original_length 5,184; last 5,000 read, both Metadata groups inside): Metadata 43,239 and
  43,245 bytes, event push, 16 commits, payload JSON 33,313; 0 "Argument list too long", 0 ##[error]. Push events are
  far from the limit today; the old form still on the base. No finding.
- G9 trial merge b2a41a00 + suite-cap-1-triage-locks ce408d2f (tree d5794c95), checked out in the scratch worktree,
  pnpm install frozen, WHOLE workflows.test.ts: 121 passed. On that tree release-capacity checks.ts:181-195 is the
  `job heap` log parser (advisories now :302-306), run.ts:535-536 is the B price/triage enqueue (the advisories
  GITHUB_OUTPUT write now :696); report.ts sizingQuestion :932, time-warnings join :964 (SS-01's shift). Rows stale:
  release-capacity capacity advisories, notify advisories, plus the four screening-capacity rows. FINDING N (new
  facts beyond S1/C1-F2: two more rows, a live branch critic-1 called stale).
- G10 doc mentions of the metadata outside the 9 files (ADR 0062:1429, ADR 0066:845, image-id.ts, launch-check.ts,
  run.ts:823): all name the config digest, none the old METADATA form. Not stale.
- G11 T6 bound semantics spot-checked: steps.range.outputs.base (ci.yml:56-75), release image origin (vars, 48 KB),
  screening-capacity sizing/time-warnings producers, release-capacity advisories (one line): bounds as stated.
- G12 buildx CLI comes from the runner image (setup-buildx-action has no version:, only the BuildKit image pinned);
  "buildx v0.38.1" is R2's. Noted (c2 protects regardless).

## Findings (final)
- F1 (N) The one value admitted over the limit is held per (file, job, value), not per site: m-a2 adds a second
  process site in notify with the whole file green (G4).
- F2 (N) suite-cap-1-triage-locks (ce408d2f, live, base bce57f16) stales two more T6 rows (release-capacity
  advisories) beyond S1's four; critic-1 had dismissed it as stale; with the base now 43565235 the fix round's trial
  set should be the live heads (G0, G3, G7, G9).
## DONE: clone /home/user/critic-imgdigest-2 and its worktree removed; nothing pushed, commented or reviewed.
