# pages-child-process: fix-repair round 1

Worktree /home/user/pages-child-process, ref `co-001/wip-pages-child-process`, started at 7027cddd… (= origin; tree clean). Logs in the session scratchpad `pcp/logs/fix/repair1/`.

## Started 2026-11-05 (fresh: no earlier fix-repair-1.md)
Order: R1 whole blocking (exit grace on a stalled parent loop), R2 K1/whole should (core limit and cwd asserted on every host; piped core_pattern residual named), R3 K2 pagecap-parent, R4 K2 baselinecap ready check, R5 K2 G2 order (nit), R6 N2 thread comments + whole comment nits, R7 whole SEC-24 wording (nit) + synth.

## R1 whole blocking (exit grace on a stalled loop): 4e675ee8…
Grace and deadline defer through setImmediate (afterPendingInput); grace fails only if no 'exit'. Red: R1-red.log (run 0: 'did not exit after its reply'). Green: R1-green.log (evidence 42 passed), R1-green-repeat.log (3x). ADR 0033 amended.

## R2 K1 + whole should, K1 nit (core guard on every host; piped residual): 5dcc760b…
New /proc limits+cwd test. Red: R2-red.log (cwd mutant and no-ulimit mutant each fail). Green: R2-green.log (core tests 2 passed, crash test ran with segv/abort/oom). Docs: ADR 0033, readerCommand comment, SEC-24 (matrix + test-matrix); synth R2-synth.log, check:fixtures 0.

## R3 K2 pagecap-parent: 6f2ef532…
New test (many 10/11 at maxPages 10; many 4/5 at maxTextCharacters 5,000). Red: R3-red.log (3 mutants: whole check, pages alone, characters alone, each KILLED). Green: R3-green.log (44 passed).

## R4 K2 baselinecap: 8809d656…
stub-fat with pollMs 30,000 (ready check alone); new stub-fat-unready.ts (poll check alone). Red: R4-red.log (both single-check mutants KILLED). Green: R4-green.log.

## R5 K2 G2 order (nit): 9b89f0b9…
heap.test.ts compares node flags sorted. Red: R5-red.log (old test, flag after --enable-source-maps). Green: R5-green.log (both orders green, 600 red, as shipped 16 passed).

## R6 N2 + whole comment nits: 476aa126…
sets.ts:290, pages.test.ts:178, page-reader.ts:454, bundle.test.ts top comment. R6-red.log / R6-green.log (git grep before/after; the 3 remaining 'thread' words are accurate).

## R7 whole SEC-24 wording (nit): a46473fd…
test-matrix, synth matrix, ADR 0033 results bullet. R7-synth.log wrote expected.json; R7-synth2.log clean after.

## Final checks (one lock hold): all exit 0 (repair1/final.log)
typecheck, lint, lint:logs, @tp/worker build; vitest unit packages/contracts, packages/synth, infra, worker bundle + intake, tools/release-capacity, model-gateway/eval: 63 files, 1,180 passed; pages.test.ts 3x 24/24 (core test ran); synth --all, tree clean after.
Pushed fast-forward 7027cddd…..a46473fd… to co-001/wip-pages-child-process. Base not merged; co-001/pages-child-process not pushed. Done.
