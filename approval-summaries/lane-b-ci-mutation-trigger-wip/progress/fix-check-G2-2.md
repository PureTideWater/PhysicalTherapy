# Fix check G2, round 2 (S1, C-G1, S2, C-G2) after repair 1

Head under check: 05d3291b… (co-001/wip-ci-mutation-trigger = origin). Clone /home/user/fx-p4-G2-2 (read only, removed at end).
Logs: scratchpad p4/logs/fix/G2-2/; adversarial scripts in scratchpad p4/g2adv2/.

## Progress
- Clone at 05d3291b…; co-001/ci-mutation-trigger still 50029e64… on origin. Installing.
- pnpm install --frozen-lockfile exit 0 (G2-2/install.log).
- Read repair-1 source diff (30efef6d..05d3291b): closureProblemsMessage factored out with the same quoting; lockfile moved keys quoted when holding a control character; global reason relabelled. affected() still checks hasControlCharacter before any glob; classifyManifests fails closed on a control path before reading texts; every key printed via quoted()/field(). Only throws in affected.ts: closureProblemsMessage and two fixed-text CLI errors.
- Open lead: stderr not written by affected.ts itself (git's own stderr from execFileSync, Node ENOENT from readFileSync on a dangling tracked symlink) could print a raw path. Testing end to end.
- LEAD CONFIRMED in a scratch repo (scratchpad p4/g2adv2/gl): a gitlink added at `packages/a<LF>::warning::x/package.json` makes `git show HEAD:<path>` fail with stderr `fatal: bad object HEAD:packages/a` then a line `::warning::x/package.json`. changeSince calls git show for every changed */package.json and execFileSync inherits stderr, so that raw line reaches the job log. Verdict still fails closed (undefined text -> classifyManifests global). Node's own open errors (e.g. EACCES on a tracked symlink to an unreadable file on a non-root runner) also print the joined path raw. To confirm end to end with the CLI.
- Head suite tools/stryker + tools/test: 35 files, 495/495 (G2-2/suite-head.log).
- 50029e64's tests (affected, manifests, runtime, stryker, workflows) against head source: 455/457; both failures are workflows.test.ts's old changes-job command list (runtime.ts gained `--pnpm "$(pnpm --version)" --commit "$GITHUB_SHA"` in N2/N3; the Dependabot-rewrite test re-runs that same test in its copy). Nothing in G2 loosened (G2-2/old-tests-at-head.log). Clone restored clean.
- affected() dump, head vs 50029e64 (scratchpad p4/g2adv2/{head,base}.json, 80 paths): all 46 control-character paths (LF, CR, CRLF+::warning, U+2028/2029 incl. at start, NUL, NUL+LF+::error, lone U+0001, lone LF, ESC[31m, TAB, VT, FF, DEL, U+0080/0085/009B/009F, ::add-mask/::set-output/::stop-commands/::error/##[group], manifest-, workspace-, workflow- and .gitattributes-shaped) give all four, no raw control character in any reason or inert line. 21 harmless variants (%0A, ::warning:: without a break, é, NBSP, NBSP+::warning::, U+2027, U+202E, U+202F, U+3000, U+FFFD, U+200B, U+FEFF, quotes, literal backslash-n, docs, apps/web, README, money source) identical to 50029e64. C-G1: .gitattributes at root, packages/money/, docs/, a/b/c/, .github/ give all four; .gitattributes.bak, docs/x.gitattributes, docs/gitattributes, .gitattributes/x, .gitmodules, .gitignore (root and nested), .git-blame-ignore-revs unchanged (none).
- End to end, affected.ts CLI on synthetic local commits in the clone (never pushed; scratchpad p4/g2adv2/e2e.sh, {ctl,gitlink,attr,docs}.{out,stdout,stderr,sum}):
  - ctl (LF+::warning, U+2028 in money src, CR+::error, U+0085+::notice): all four, 7 shards; stdout/summary JSON-quoted; stderr empty; no forged line.
  - attr (packages/pricing/.gitattributes alone): all four, 7 shards. docs edit: none. Harmless stays harmless.
  - gitlink at `packages/a<LF>::warning title=forged::gitlink/package.json`: verdict all four (fails closed), stdout quoted, BUT stderr holds `fatal: bad object HEAD:packages/a` then the raw line `::warning title=forged::gitlink/package.json` (changeSince's git show inherits stderr). SHOULD: N52's "no path starts a workflow command in the changes job's log" is false via stderr.
  - Clone back at 05d3291b…, clean, temp branches deleted.
- Mutant re-run starting (mut.py: S2 M01–M05, M08–M16; C-G2 C01, C02, C04–C07, C13; own X1–X13).
- Mutants M01, M02, M03 killed. Per-mutant lock waits (other sessions' runs) were ~7 min each, which would overrun the 2-hour background limit; stopped the runner by PID, restored tools/stryker with git checkout (clean), and rerun M04 onward with one heavy lock held for the batch.
- M04, M05, M08–M15 killed (G2-2/mutants.txt, mut-*.log).
- M16, C01, C02, C04, C05, C06, C07, C13, X1, X2 killed.
- X3, X3b, X4, X4b, X6 (now killed: 2 tests), X7, X8, X9 killed; X5 survives, equivalent (**/ compiles to (?:[^/]+/)*, which holds the root file).
- X10 (lockfile moved key unquoted), X11 (old label), X12 (classifyManifests' control-path rule dropped), X13 (TAB to CR exempted from hasControlCharacter) killed.
- Mutant summary: all S2 (M01–M05, M08–M16) and C-G2 (C01, C02, C04–C07, C13) mutants killed; own X1–X4b, X6–X13 killed; X5 equivalent.
- Docs: ADR Part 7 bullet, N52, N56, ci.md and CI-27 (test-matrix, matrix.ts, CI-27/expected.json) match the code, except N52/Part 7's "no path ... starts a workflow command in the changes job's log", which the gitlink case's git stderr breaks.
- Result: 1 should (git stderr carries a raw control-character path into the log), 1 nit (uncaught Node open errors print a joined path raw; same fix). S1 verdict, C-G1, S2 and C-G2 hold. Nothing loosened.
- Clone /home/user/fx-p4-G2-2 removed (clean at 05d3291b… beforehand). Done.
