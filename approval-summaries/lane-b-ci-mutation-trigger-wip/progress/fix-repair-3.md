# Lane B P4 ci-mutation-trigger: repair round 3 (G2 round-4 leads)

Start: WIP head c97f02d2… equalled origin/co-001/wip-ci-mutation-trigger; PR branch untouched at 50029e64…; base not merged.
End: WIP head a614a4b2…, fast-forward push c97f02d2…..a614a4b2… through the pre-push hook (fixture guard, gitleaks: no secret). PR branch still 50029e64…; base not merged.

| Issue | Severity | Result |
|---|---|---|
| Y8: runGit failure test did not test printable | nit | fe2e13df…: the test runs merge-base with a forged base (git repeats it); asserts the line is JSON-quoted and no command line. Red under Y8. |
| Y5: runGit success-path stderr not covered | should | 972ccc6a…: new test, GIT_TRACE=1 rev-parse --sq-quote on a forged argument, spies process.stderr.write; asserts the argument quoted, no command line. Red under Y5. |
| Y7: no test runs the entry line | should | a614a4b2…: new test runs `tsx tools/stryker/affected.ts` by path with an output path under a missing directory holding a command; asserts exit 1, the `tools/stryker/affected.ts: ENOENT` prefix, path quoted, no command line. Red under Y7. |
| X5: root .gitattributes duplicates **/.gitattributes | nit | No change: equivalent mutant ('**/' compiles to (?:[^/]+/)*, which matches the root); the entry is kept for readability, as G2 suggested. No rule loosened. |

All the tests are in tools/stryker/affected.test.ts. Red/green: the 'every git the changes job runs' block passed 6/6 at the head and failed exactly the new test under each of Y8, Y5 and Y7.
Checks (one lock hold, 15:58:20 to 16:06:04 UTC): unit tools/stryker + tools/test 35 files 502/502; typecheck passed (22 projects); lint passed (1,686 files, 0 errors, 0 warnings).
Script: scratchpad p4/repair3-checks.sh. Logs: scratchpad p4/logs/integrate/repair3/ (status.log, git-{head,Y8,Y5,Y7}.log, vitest.log, typecheck.log, lint.log, push.log).
Note: the first local commits were rebuilt before the push (a subject missing its blank line). Nothing pushed was rewritten.
