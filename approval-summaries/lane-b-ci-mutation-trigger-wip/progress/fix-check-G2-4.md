# Fix check G2, round 4 (S1, C-G1, S2, C-G2): the round-3 verification, run

Head under check: f23850fa… expected. Clone /home/user/fx-p4-G2-4 (read only, removed at end).
Logs: scratchpad p4/logs/integrate/G2-4/; scripts copied from p4/g2adv3/ to p4/g2adv4/ with paths moved to the new clone and log dir (no other change).

## Progress
- Started; no earlier run of round 4. Round 3 (fix-check-G2-3.md) was interrupted before any run.
- Clone at f23850fa… = origin/co-001/wip-ci-mutation-trigger; descends from 50029e64…; co-001/ci-mutation-trigger still 50029e64… on origin.
- Wrapper g2adv4/run-all.sh takes the heavy lock once and runs: pnpm install --frozen-lockfile, batch1.sh (its own flock line removed, the wrapper holds it), e2e.sh, scan.py over the e2e outputs, mut.py (fast two-file suite), then Y5, Y7 and every survivor again against the whole tools/stryker + tools/test suite (MUT_ALL). Started in background.
- Lock taken 14:04:32 UTC at once; pnpm install --frozen-lockfile exit 0 (G2-4/install.log). Batch 1 running.
- Static reading of the leads: the only test that runs the command line as a child process (affected.test.ts, "starts no workflow command ... run as the changes job runs it") imports the module and calls m.cli directly via tsx --eval, so the entry line (Y7) is not on its path; and the runGit test only takes the failure path (rev-parse of a bad name), and the child-process case's git show of the gitlink fails and is caught, so no test drives git writing stderr on success (Y5).

## Batch 1 (head suite, 50029e64's tests at head, affected() dump)
- Head suite `vitest run --project unit tools/stryker tools/test`: exit 0, 35 files, 499 tests passed (G2-4/suite-head.log).
- 50029e64's tests (affected, manifests, runtime, stryker, workflows) at the head: exit 1, 2 failed / 455 passed (G2-4/old-tests-at-head.log). Both failures are in workflows.test.ts and come from one intended change outside G2 (repair 1/2 G1 scope): the changes job's runtime step is now `runtime.ts --pnpm "$(pnpm --version)" --commit "$GITHUB_SHA"` and the gate job gained the same step; the old exact-command list and the old Dependabot-rewrite copy expect the bare `runtime.ts`. No affected/manifests/runtime/stryker test from 50029e64 fails at the head: no G2 behaviour regressed.
- affected() dump, 80 paths, head vs 50029e64 (same set as rounds 2/3): 49 differ, 31 same.
  - Every path holding a control character (C0, DEL, C1 incl. NEL and CSI, U+2028/9, NUL, lone LF/CR, CRLF+command) now affects all four packages with the reason JSON-quoted, e.g. `"docs/x\n::add-mask::secret" (a path holding a control character, every package)`. 44 of them changed from 0 packages (or one, for the two under packages/money/src); the 2 that were already every-package at the base (`apps/site\n/package.json`, `packages/a\n::warning::x/package.json`) are unchanged and quoted at both.
  - C-G1: `.gitattributes`, `packages/money/.gitattributes`, `docs/.gitattributes`, `a/b/c/.gitattributes`, `.github/.gitattributes` now every package ("a global input"); look-alikes `.gitattributes.bak`, `docs/x.gitattributes`, `docs/gitattributes`, `.gitattributes/x`, `.gitmodules`, `.gitignore`, `.git-blame-ignore-revs` unchanged (0 packages).
  - Every harmless variant (NBSP, U+2027, U+202E, U+202F, U+3000, U+FEFF, U+200B, U+FFFD, `%0A`, a literal backslash-n, `::warning::` inline, quotes, é) identical to 50029e64 (0 packages); packages/money/src/cents.ts identical (4, imported).

## End to end (e2e.sh, the CLI as the changes job runs it, `tsx tools/stryker/affected.ts`; outputs in scratchpad p4/g2adv4/)
- ctl (six docs files with LF, CR, NEL, U+2028, LF+NBSP+`::`, LF+NBSP+`##[`): exit 0, any=true, all four packages, all seven shards; each path printed JSON-quoted in stdout and summary.
- gitlink (seven gitlinks at package.json paths under LF, CR, U+2028, LF+NBSP, LF+spaces+`##[`, LF+U+3000+`::add-mask::`, LF+BOM): exit 0, every package, each path quoted; stderr empty (git show's failure caught, its stderr dropped).
- gitplain (gitlink at packages/h/package.json): exit 0, every package, "not read on one side": fails closed, nothing forged.
- attr (packages/pricing/.gitattributes added): exit 0, every package, "a global input" (C-G1).
- docs (docs/product/domain-model.md only): exit 0, any=false, no shard (the narrowing still narrows).
- badbase LF / CR / U+2028: exit 1, nothing written to stdout or the output file; stderr `tools/stryker/affected.ts: git merge-base "nowhere\n::error title=forged::x" HEAD failed (exit 128):` then git's own line, with the command line `"::error title=forged::x"` quoted (LF case), git's `?` (CR case), the whole line quoted (U+2028 case).
- scan.py over all 32 outputs (stdout, stderr, output file, summary): 0 lines the runner would read as a command after .NET TrimStart (incl. NEL, NBSP, U+2028/9, U+3000, BOM) and 0 raw control characters in every file.
- Clone clean after (git status empty, HEAD f23850fa…, no g23-* branch left).

## Mutants (mut.py, each applied alone, suite manifests.test.ts + affected.test.ts, 120 tests; logs G2-4/mut-<id>.log)
- S2: M01, M02, M03, M04, M05, M08, M09, M10, M11, M12, M13, M14, M15, M16 all KILLED.
- C-G2: C01, C02, C04, C05, C06, C07, C13 all KILLED.
- X1–X13 and Y1–Y10 running (about 2.5 min each).
- Own X: X1, X2 (** across a line break), X3, X3b, X4, X4b, X6–X13 KILLED; X5 (drop root `.gitattributes` alone) SURVIVES, equivalent as in rounds 1–2 (`**/` compiles to `(?:[^/]+/)*`, which matches the root file).
- Y1, Y2, Y3, Y4, Y6 KILLED; Y5 (success stderr written raw) SURVIVES 120/120. Y7–Y10 running; then Y5, Y7 and survivors against the whole tools/stryker + tools/test suite.
- Y7 (entry line calls main, not cli) SURVIVES, Y8 (runGit's thrown message not through printable) SURVIVES, Y9, Y10 KILLED.
- Against the whole tools/stryker + tools/test suite (499 tests; G2-4/mut-<id>-all.log): X5, Y5, Y7, Y8 each still SURVIVE 499/499. Batch lock released 15:48:41 UTC; clone clean (git status empty) at f23850fa….
- Next: lead probes (g2adv4/zz-g2-leads.test.ts via leads.sh, one lock hold): Y5 with GIT_TRACE making git write its argv on stderr while exiting 0; Y7 by running the file as the job does with an output path whose directory does not exist and names a command; Y8 with git merge-base echoing a forged base.

## Lead probes (leads.sh, one lock hold 15:54 UTC; g2adv4/zz-g2-leads.test.ts placed in tools/stryker only for the run; logs G2-4/leads-*.log)
- At the head all three probes pass (3/3).
- Y5 (runGit's success path): no repository test covers it (Y5 survives 120/120 and 499/499). The path is reachable: with GIT_TRACE=1, `git rev-parse --sq-quote "a\n::warning title=forged::b"` exits 0 and writes its argv to stderr. At the head runGit writes it quoted; with Y5 the probe fails: `expected [ '::warning title=forged::b\'' ] to deeply equal []`. No input a pull request controls was found that makes the git commands runGit runs write a path to stderr while exiting 0 (a checkout-index of an unwritable name exits 1, which is the covered failure path), so this is a coverage gap on a guard, not an open injection.
- Y7 (the CLI entry line): not exercised by any test (Y7 survives 120/120 and 499/499; the child-process test imports the module and calls m.cli). Run as the job runs it (`tsx tools/stryker/affected.ts --event push --github-output "<tmp>/none\n::warning title=forged::x/output"`): head exit 1, stderr `tools/stryker/affected.ts: ENOENT ...` with the line quoted, scan 0 command lines; with Y7 exit 1 but Node's uncaught-error print, scan 1 command line `::warning title=forged::x/output'` (G2-4/y7-head.stderr, y7-Y7.stderr). The probe test fails under Y7 on the errorText prefix.
- Y8 (runGit's thrown message without printable): survives the repository suite because the existing runGit test uses `rev-parse --verify`, whose git message does not echo the argument, and cli's errorText applies printable again. With `git merge-base "nowhere\n::error title=forged::x" HEAD` (git echoes the name) the probe fails under Y8: `expected [ '::error title=forged::x' ] to deeply equal []`. Safe on the job's path today (errorText), but the test named "a failure throws it through printable" does not pin what it names.
- Clone /home/user/fx-p4-G2-4 clean (git status empty, f23850fa…) and removed.

## Verdict for G2
- S1 resolved: every control-character path fails closed (all four packages) and prints JSON-quoted in reasons, stdout, output file, summary and stderr, end to end; `**` matches across a line break (X2 killed); bad bases with LF, CR, U+2028 fail with git's words quoted.
- C-G1 resolved: root and nested .gitattributes are global inputs; look-alikes are not.
- S2 and C-G2 resolved: M01–M05, M08–M16, C01, C02, C04–C07, C13 all killed.
- Nothing loosened: every harmless path decides exactly as at 50029e64; the 2 old tests failing at the head fail only on the intended runtime-step command change.
- Open, not blocking: should Y7 (no test runs the entry line), should Y5 (no test drives runGit's success-path stderr), nit Y8 (the runGit failure test does not use an echoing git message), nit X5 (equivalent, the root `.gitattributes` entry is redundant with `**/.gitattributes`).

## Note: the WIP ref moved during this run
- At the start origin/co-001/wip-ci-mutation-trigger was f23850fa…; at the end it is c97f02d2…, three commits on top (12c372f2… ADR 0066 wording, 0841b12a… runbook wording, c97f02d2… runtime.ts quoting a pnpm that is not a plain version, with runtime.test.ts). They touch only docs/adr 0066, docs/runbooks/ci.md, tools/stryker/runtime.ts and runtime.test.ts: nothing in affected.ts, manifests.ts or their tests, so the G2 results above carry to c97f02d2… for affected.ts/manifests.ts. The runtime.ts change is G1 scope and was not checked here. co-001/ci-mutation-trigger is still 50029e64….
