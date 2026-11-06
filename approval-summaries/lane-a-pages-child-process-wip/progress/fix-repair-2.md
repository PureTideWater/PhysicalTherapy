# pages-child-process: fix-repair round 2

Worktree /home/user/pages-child-process, ref `co-001/wip-pages-child-process`, started at a46473fd… (= origin; tree clean). Logs in the session scratchpad `pcp/logs/fix/repair2/`.

## Started 2026-11-05 (fresh: no earlier fix-repair-2.md)
Order: Q1 K1 should (deadline after the last frame untested), Q2 K2 nit (deadline deferral untested), Q3 whole nit (held-loop test 6 runs to 3), Q4 whole nit (design Fix round lacks repair 1), Q5 whole nit (bomb peak headroom: no change).

## Q1 K1 should (deadline after the last frame): 782fb33b…
Stand-in late-done-hang (done 1.5 s into a 2 s deadline, then a hang); test expects unsupported_document before deadline + grace/2, queued CSV read, reader gone. Red: Q1-red.log (mutant clearTimeout(deadline) in awaitExit: PageReadError "did not exit after its reply"). Green: Q1-green.log (pages.test.ts 25 passed).

## Q2 K2 nit (deadline deferral untested): found a defect; fixed, 515046e5…
New test: stand-in late-done-exit 2500 on a 3 s deadline, this process held 2.4 s to 3.3 s; expects the pages. Red at a46473fd… + test (Q2-red.log: unsupported_document; diagnostic Q2-diag.log at the deadline: reply in, exited, not settled: the pipes close in the close phase after the deferred turn). Fix: the deadline gives an exited reader one more turn (setImmediate) before refusing. Red with the deadline's afterPendingInput removed (Q2-red-nodefer.log). Green: Q2-green-repeat-1..5.log, Q2-green.log (evidence dir 46 passed). ADR 0033 bullet extended.

## Q3 whole nit (held-loop test 6 runs): 6f002b37…
Cut to 3 runs: 7,237 ms (was 14,467). The grace-without-deferral mutant still fails it, at run 1, 3 of 3 (Q3-red-gracenodefer-1..3.log). Green: Q3-green.log.

## Q4 whole nit (design Fix round lacks repair 1): done (ops file, no commit)
/home/user/ops/designs/lane-a-pages-child-process.md: "Fix round, repair 1" (R1 deferral, R2 /proc limits+cwd test and V8 OOM crash case and the piped residual, R3/R4, R5-R7) and "Fix round, repair 2" (Q1-Q3, Q5).

## Q5 whole nit (bomb peak headroom): no change, as the verifier advised
The failure message already prints the peak and the small read's peak; watch CI.

## Final checks (one lock hold): all exit 0
typecheck, lint, lint:logs, @tp/worker build; vitest packages/contracts, packages/synth, apps/worker bundle.test.ts, infra: 53 files, 1,097 passed; pages.test.ts 2x 26/26 (core test ran). Logs final-*.log.
Pushed fast-forward a46473fd…..6f002b37… to co-001/wip-pages-child-process (pre-push hook ran). Base not merged; co-001/pages-child-process not pushed. Done.
