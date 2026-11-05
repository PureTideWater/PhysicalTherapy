# pages-child-process: build progress

Worktree /home/user/pages-child-process, ref `co-001/wip-pages-child-process` (base 7fb3e102…, #84). Logs in the session scratchpad `pcp/logs/`.

## Started 2026-11-05 (fresh: no earlier build.md; worktree clean at 7fb3e102…)
- Plan: red commit (T1 heap under the planned flag, T2 infra guard and measurement, T3 to T5 overrun/timeout/crash), then the rename, the child entry, the parent's spawn and limits, the result mapping and cleanup, the infra guard, the bundle entry, the documents.

## Commit 1: 1af0ca00… red (pushed)
`test(contracts, infra): the page reader keeps today's heap under the worker task's planned flag, failing first`. New: packages/contracts/src/evidence/pages.test.ts (9 tests), test-support/{documents,stub-reader,stub-silent,reader-heap}.ts; infra/test/heap.test.ts (+5 tests).
Red (pcp/logs/red.log; vitest unit, 13 failed, 12 passed, every failure an AssertionError):
- reader heap under `node --max-old-space-size=560 --enable-source-maps`: expected 637534208 (608 MiB) to be 251658240 (240 MiB), in both pages.test.ts and the infra measurement (the worker container's real command + heapFlag('worker')).
- guard, dev/staging/production: `a heap flag on these containers needs PAGE_READER_ISOLATION 'process' (it is undefined): expected [ 'screening' ] to deeply equal []`.
- normal read, 160 MiB bomb under a 64 MiB cap, 1 GiB bomb, 150 ms deadline: `the document was read in a process of its own: expected 0 to be greater than or equal to 1`; one at a time: `expected [] to have a length of 3`.
- exit 3 / SIGSEGV / malformed frame, heap exhaustion / flood, env-argv-permission: `pages.ts reads a document in a child process (readInChild): expected undefined to be type of 'function'`.
