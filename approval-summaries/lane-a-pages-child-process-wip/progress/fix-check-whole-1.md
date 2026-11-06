# Fix check, whole-diff adversary, round 1

Clone /home/user/fx-pcp-whole-1 at 7027cddd… (origin/co-001/wip-pages-child-process); base origin/claude/build-platform f7d609cc…; merge-base 7fb3e102….

## Checked
- See the notes below.

## Found
- (1) blocking, (2) should, (3) and two nits: below.

## Notes as of the first pass (05:xx UTC)
- Read c369bc77..7027cddd whole (27 files) and the item's diff against the merge-base 7fb3e102 (35 files).
- merge-tree with origin/claude/build-platform f7d609cc… (106 commits past the merge-base): clean (tree 1cb1ae34…). The base has no SEC-24; its 0071 Status line carries ci-findings-transport's amendment, and this branch's bullet sits beside it.
- Suite (install, typecheck, worker build, vitest contracts + infra + worker intake + bundle + release-capacity scenario, pages.test.ts x3) running under the lock: logs/fix/whole1-*.log.
- Candidate findings being checked: (1) the exit-grace timer vs a parent loop stalled past 1 s (timers run before the poll phase that delivers close); (2) a piped core_pattern ignores RLIMIT_CORE, and the core test skips there (CI), so the no-core guard is unproven off this host; (3) SEC-24's text says a reply past the reply bounds is unsupported_document, but a frame header past it is PageReadError.
- (1) confirmed in principle with plain node (scratchpad/pcp/whole1-exp/order.mjs): a child that writes and exits at once, the parent's loop then held 1.5 s inside the data handler: in 10 of 10 runs a 1 s timer set on the data fires before `close`. In pages.ts that is fail('did not exit after its reply') for a reader that exited at once: a good read becomes PageReadError and the job retries. Through readInChild: scratchpad/pcp/whole1-exp/stall.ts, run after the suite.
- Suite (logs/fix/whole1-summary.log, 05:19 to 05:24 UTC): install 0, typecheck 0 (22 projects), worker build 0, vitest contracts + infra + worker intake + bundle + release-capacity scenario 45 files / 923 passed (82.7 s), pages.test.ts 3 repeats 21/21 each (25.5 to 25.8 s; slowest the 1 GiB bomb 5.3 s, the post-reply bounds 3.8 s). The core-file test ran here (not skipped); the clone's tree stayed clean (no core).
- (1) CONFIRMED through readInChild (scratchpad/pcp/whole1-exp/stall2.mts, logs/fix/whole1-stall2.log): the parent's loop held 1.2 s from the check phase (a job's I/O-side work), the stand-in sending 20 pages and exiting at once: 14 of 15 reads failed "the page reader did not exit after its reply", 1 gave its pages. Timer-phase stalls (stall.mts) gave 15/15 pages, so it is the I/O-side stall that hits. BLOCKING (a regression of F1: a good read on a busy worker becomes PageReadError and the job retries).
- (2) RLIMIT_CORE is ignored by the kernel when core_pattern pipes to a program (core(5)); the helper decides from %c. The test skips on such a host (as CI runners commonly are), so the no-core guard is asserted only by the file check on hosts that write core files. SHOULD: assert the reader's own limit (/proc/<pid>/limits "Max core file size 0 0") on any host, and name the piped-pattern residual in ADR 0033.
- (3) nit: SEC-24's text and the ADR group the reply bound with the refusals, but a frame header past it is PageReadError (malformed), only the stdout total is unsupported_document.
- nits: bundle.test.ts's comment says the weekly test reads "in the harness's own process"; it reads in a child the harness starts from the source tree. page-reader.ts:454 still says "as the thread's message made".
- Clone /home/user/fx-pcp-whole-1 removed. Done.
