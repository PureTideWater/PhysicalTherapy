# Fix check, whole diff, round 2

Head a46473fd… (origin/co-001/wip-pages-child-process, 22 commits over c369bc77…). Base build-platform f7d609cc…
(106 commits past the cut 7fb3e102…). Clone /home/user/fx-pcp-whole-2, removed at the end.

## Checked
- `git merge-tree --write-tree` with origin/claude/build-platform f7d609cc…: clean.
- pages.ts runReader read whole: deadline and poll armed until close; grace 1 s after done/refused, deferred one
  turn (setImmediate) and failing only a child with no 'exit'; first decision stands; settle on close only; a late
  poll or deferred timer after settle is guarded (settled / exited checks; kill on an exited ChildProcess is a no-op).
  No bound loosened: the deferral can only let input already waiting be read first.
- readerCommand: /bin/sh -c 'ulimit -c 0 && unset PWD && exec "$@"', cwd /; a failed ulimit does not exec (fails
  closed, PageReadError). The image's /bin/sh is dash (node:24-trixie-slim), as here, so the env test (env = []) holds.
- No new path for document text to disk or log: stderr only tail-scanned, messages fixed strings, core 0/0 + cwd /.
- infra: Ulimits core 0/0 on every container; withHeapFlag moved to infra/lib/heap.ts, re-exported by
  tools/release-capacity/scenario.ts; not in the screening-capacity closure.
- ADR 0033/0071, test matrix SEC-24, synth matrix/registry, expected.json agree with the code.
- Under the lock: pnpm install, typecheck (exit 0); vitest unit packages/contracts, infra/, apps/worker/src/intake,
  apps/worker/src/bundle.test.ts: 44 files, 916 passed, 0 skipped (97 s); pages.test.ts again: 24/24 (44 s). The core
  crash test ran (not skipped). Logs: scratchpad/pcp/logs/fix/whole2/.

## Found (all nits; nothing blocking or should)
- The design's "## Fix round" does not record repair 1 (afterPendingInput, the /proc core-limit test, the OOM crash,
  the cap and baseline-check tests); fix-repair-1.md has them.
- Runtime: the held-loop grace test takes 14.5 s (6 runs x 1.2 s holds), the file's longest test.
- Flake watch: the 1 GiB bomb's peak assertion (261 MiB measured vs a 352 MiB bound) leans on the parent's 25 ms
  poll keeping up on a contended runner.
