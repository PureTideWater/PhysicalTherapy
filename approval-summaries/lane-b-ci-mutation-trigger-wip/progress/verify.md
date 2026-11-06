# Lane B P4 (#96) fresh-clone verification at 0a750dd4… — progress

## Step 0 (start)
- Draft scratchpad/p4/pr-body-new.md is 51,308 characters (51,484 bytes) now, not the 49,961 the task and integrate.md step 6 record (file modified 20:01 UTC, after step 6).

## Step 1 clone (fresh, blobless) /home/user/vf-p4
- origin/co-001/ci-mutation-trigger = refs/pull/96/head = 0a750dd4… (ls-remote and fetched refs); origin/claude/build-platform = 00fd2906…; merge base 00fd2906…. PASS.
- Install: pnpm install --frozen-lockfile under the lock (running).

## Step 2 merges
- Four merges since the base: 0a750dd4… (base 00fd2906…), a08ab953… (base c4941291…), 19af33ea… (-b2), ca1fe552… (-b1). git show --remerge-diff: 0a750dd4…, 19af33ea…, ca1fe552… empty (clean); a08ab953… only the two recorded conflicts resolved (ADR 0066 Date line: both N32 and Part 7 kept; reconciliation-001: #86's paragraph kept, then #96's P4). PASS.
- Diff 00fd2906…..0a750dd4…: 34 files, +3,615 −148 (no .gitattributes file in the diff; the root .gitattributes is a classifier input).
- Install under the lock (20:51 UTC): pnpm install --frozen-lockfile exit 0, pnpm v10.34.8.

## Step 3 CI (read-only)
- Runs ci 41902747142 (run 300), mutation 41902746999 (241), screening-capacity 41902747011 (249), approval-of-record 41902746982 (485): each event pull_request, attempt 1, head_sha 0a750dd4… exactly, completed success.
- Required jobs: all green 126835162872 success (20:12:50–54); mutation gate 126837977074 success (20:17:47–20:18:11); screening-capacity gate 126839588100 success (20:20:38–42); approval-of-record job 126829208857 success (20:02:33–42). Check runs on the PR head: 28, none failed (notify skipped).
- changes 126829209013 (20:02:33–20:03:17): checkout of pull/96/merge e1d30ae5… ("Merge 0a750dd4… into 00fd2906…"); action-setup "Switching pnpm from v11.25.0 to v10.34.8"; setup-node 24.22.0; install 501 packages, pnpm v10.34.8. Runtime step after install, before affected: "runtime: Node v24.22.0 (Unicode 17.0, ICU 78.3) and pnpm 10.34.8", "runtime: pnpm --version prints 10.34.8", "checkout: commit e1d30ae5…", "runtime: the pinned one (…), at the commit tested". What the change affects (BASE 00fd2906…): diffed from the merge base; each of money, pricing, ledger, packets "affected by .github/workflows/mutation.yml "jobs"."changes"."steps", "jobs"."stryker"."steps".4."run", "jobs"."mutation"."steps" (a workflow change other than step pins, every package); stryker/{ledger,money,packets,pricing}.config.mjs (a global input, every package)"; shards: all 7. NOTE: the reason lines name no tools/stryker/** file (the draft says they do).
- gate mutation 126837977074: needs step "changes: success; stryker: success; any: true; packages: [money,pricing,ledger,packets]; shards: all 7"; checkout e1d30ae5…; action-setup "Switching pnpm from v11.25.0 to v10.34.8"; node v24.22.0; install; runtime step (line 299) after install and before download-artifact (309): the same four lines, checkout e1d30ae5…, pinned, at the commit tested. gate.ts --expected the seven: money 96.58% (226/234, 8 undetected all recorded equivalents, 7 load failures left out); pricing 98.67% (1,934/1,960; 26; 12 lf); ledger 98.48% (2,018/2,049; 31; 0 lf); packets 97.75% (4,310/4,409; 99; 2 lf); "mutation gate: passed". Equal to the integrator's local gate at a08ab953….
- Shards vs base push mutation 41898815408 (push, 00fd2906…, success; the merge commit's first parent, per checkout "Merge 0a750dd4… into 00fd2906…"):
  - money-ledger 126829642121 (20:03:19–20:08:01, 4 min 42 s): switch v11.25.0→v10.34.8; canary by path (stryker.ts), 5 of 5; "canary: on Node v24.22.0 (Unicode 17.0, ICU 78.3) and pnpm 10.34.8, at commit e1d30ae5…"; no banner; shard view first line names runtime + e1d30ae5…; 15 files, 2,244 detected of 2,283 (money 226/234, ledger 2,018/2,049); per file equal to base job 126815662890 (no moves). Base shows the "> therapy-platform@ stryker" banner and a verdict without pnpm/commit, as expected.
  - packets-explain 126829642403 (20:03:19–20:15:50, 12 min 31 s): same checks hold; 8 files 2,006/2,006; equal to base job 126815662833.
  - pricing-rest 126829642259 (20:03:19–20:09:41, 6 min 22 s): checks hold; 5 files 441/443; equal to base 126815662914.
  - pricing-recompute 126829642104 (20:03:19–20:06:47, 3 min 28 s): checks hold; 1 file 649/662; equal to base 126815662953.
  - packets-scan 126829642119 (20:03:20–20:12:09, 8 min 49 s): checks hold; 1 file 995/1,059; equal to base 126815662970.
  - pricing-engine 126829642107 (20:03:19–20:12:43, 9 min 24 s): checks hold; 1 file 844/855; equal to base 126815663057.
  - packets-rest 126829642027 (20:03:19–20:17:45, 14 min 26 s): checks hold; 11 files 1,309/1,344 (the table's "verifier" directory row not counted); equal to base 126815663187.
  - Acceptance 4: every file of all seven shards (42 files) equal in mutants and detected to base run 41898815408; no mutant moved even between Killed and Timeout (each per-file row identical). Every head shard: action-setup switch, canary by path 5 of 5, verdict "on Node v24.22.0 (Unicode 17.0, ICU 78.3) and pnpm 10.34.8, at commit e1d30ae5…" (the merge commit, GITHUB_SHA), "stryker (<shard>): <pkg>" with no "> therapy-platform@ stryker" banner, shard view first line runtime + commit. Base jobs all show the banner (base runs the root script), as expected.
- unit 126829210125 (20:02:33–20:11:13): Test Files 452 passed (452); Tests 7,774 passed | 1 skipped (7,775); 473.51 s; coverage statements 67.93%, branches 65.22%, functions 62.34%, lines 68.08%. Equals the integrator's expectation (452, 7,774 + 1). PASS.
- static 126829210296: actions:check "against the merge base 00fd2906…", "no pin is new or used with changed inputs", builder moby/buildkit:v0.34.1 index 99368f3e…, no newer release three days old, Trivy v0.70.0 and gitleaks v8.24.3 as the base, "age: no pin new against the base, nothing read"; toolchain:check vs 00fd2906…: passed, 0 errors, 1 warning (pnpm 10.34.9 newer than packageManager 10.34.8, the weekly triage's), "the lockfile adds no version against the base". PASS.
- images 126829209679: success, no ##[error] line. PASS.

## Step 2 code (local, clone at 0a750dd4…)
- vitest --project unit tools/stryker tools/test under the lock (20:51–20:53 UTC): 35 files, 522/522 passed. pnpm typecheck: passed, 22 projects (106.3 s, cold). Tree clean after. PASS.
- Diff checks: TEST_TOOLING includes 'typescript' (affected.ts:133) with the guard test (affected.test.ts:654–667); '.gitattributes' and '**/.gitattributes' in GLOBAL_INPUTS; control-character fail-closed in affected() and tests; stryker.ts requires <root>/node_modules/@stryker-mutator/core as the direct link (realpath equal), bin.stryker inside the package; mutation.yml: "The runtime is the pinned one" between install and "What the change affects" in changes (l.73–74), and in the gate after install, before download-artifact, with if: steps.needs.outputs.run == 'true' (l.199–201), both with --pnpm "$(pnpm --version)" --commit "$GITHUB_SHA"; canary line by path (l.108); runtime.ts ::error:: for a missing flag on a runner. ADR 0066: N43–N56 each defined exactly once. test-matrix CI-27–CI-29 rows; synth matrix and registry CI-27–CI-29; fixtures/synthetic/CI-2{7,8,9}/expected.json. PASS.
- affected.ts locally vs 00fd2906…: identical to CI's lines. The reason lines name mutation.yml's steps and the four stryker/*.config.mjs only, because note() keeps at most five reasons per package (affected.ts:715–719); tools/stryker/** files are global inputs but are not printed. The draft's "and tools/stryker/** as global inputs" in what the line names is inaccurate (problem, wording only).

## Step 4
- 20:56 UTC: ls-remote claude/build-platform = 00fd2906…, co-001/ci-mutation-trigger = refs/pull/96/head = 0a750dd4…; origin/claude/build-platform is an ancestor of 0a750dd4…. PASS.

## Step 5 description
- Template headings (.github/pull_request_template.md at 00fd2906…): What changes, Why, What it does not change, Checks, Reviewer agents' findings, Freeze exception, Domain model, The founder's approval: all present in order. Every commit hash the draft names exists; 34 fix commits 6ab288d2…..a614a4b2… confirmed; #42's 22789493… is in the head.
- Problems in the draft, each corrected in pr-body-final.md:
  1. Why table row "Every pull request since #95 (#95 to #117, 21) … full 7, partial 3, none 11" counts #95 twice (it is also in "#90 to #95"): 58 + 6 + 21 = 85, not 84, and partial would sum to 13, not 12. Corrected to "#96 to #117, 20 … full 7, partial 2, none 11" (sums: full 23+0+7 = 30, partial 8+2+2 = 12, none 27+4+11 = 42).
  2. "Against the base c4941291 the pull request is 34 files": against c4941291… it is 129 files; 34 files (+3,615 −148) is against 00fd2906…. Corrected.
  3. The affected line "names … tools/stryker/** as global inputs" (local-suite row and CI section): the lines keep at most five reasons and print mutation.yml's steps and the four stryker/*.config.mjs only. Reworded in both places.
  4. The draft is 51,308 characters, not the 49,961 the task and integrate.md record (the file changed at 20:01 UTC).
- CI section replaced by "What CI proved on this head" with the step-3 facts (runs and jobs, unit counts, each shard's time and counts, the gate scores, acceptance 4, static, images, the base now).
- Final: scratchpad/p4/pr-body-final.md, 55,197 characters, headings kept, no model identifier, hashes 8 hex, ends with the attribution line, a blank line, the session URL.

## Cleanup
- /home/user/vf-p4 removed.
