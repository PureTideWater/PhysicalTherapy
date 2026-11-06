# Completeness critic: pages-child-process (c369bc77…)
Started 2026-11-05. Clone /home/user/rv-pcp-critic (read only).
## Checked
## Gaps
- Clone at c369bc77…, pnpm install --frozen-lockfile, worker bundle built (logs critic-install.log, critic-build.log).
- Bundled reader dist/page-reader.js under production argv (allow-fs-read = that file only): pdf and csv read, heap 240 MiB (critic-bundled.log). Works.
- Merge trial (git merge-tree) vs origin/claude/build-platform af3e79f3… and live co-001 heads: ADR 0071 Status line conflicts with build-platform (ci-findings-transport merged), brand-settle, ci-findings-transport, suite-cap-1-triage-locks. No conflict in packages/contracts or infra/lib/heap.ts.
- tools/release-capacity: the synthetic PDF is read in the harness process (scenario.ts mapPlans, source tree via tsx), not by the image's dist/page-reader.js; bundle.test.ts:9-10 claims otherwise.
- fd inheritance: parent holding a TCP socket and an open file; stand-in child fstat 3..255 saw only its own anon/fifo fds, no socket or file (critic-paths.log). OK.
- Other paths (critic-paths.log): double ready -> PageReadError; trailing partial header after done + exit 0 -> pages (tolerated, harmless); close stdout early -> refused at deadline; exit 0 no reply -> PageReadError. As designed.
- G-guard (should): with heapFlag('worker') added to COMMANDS.worker (what ADR 0071's later PR does), infra/test/heap.test.ts's measurement goes red at `expect(heapFlagsIn(words)).toEqual([])` (critic-guard-mut.log). Design section 4 says the flag is inserted "when it has none"; code requires none, so the measurement cannot run against the command once it carries the flag.
- G-bundle (should): no automated test runs dist/page-reader.js. Mutation: yauzl made external in build.ts -> every bundled read PageReadError exit 1, bundle.test.ts 2/2 green (critic-bundle-mut.log). The weekly real-size test reads its PDF in the harness (scenario.ts mapPlans), so bundle.test.ts:9-10 and design 3.5's "weekly test proves it" are wrong.
- Mutations surviving (critic-mutations.log, evidence/ 32/32 green): settle on 'exit' instead of 'close' (design's measured trap; could not reproduce frame loss at 1,000 pages x3, critic-m4-big.log); frames after the reply accepted; any SIGABRT refused without V8's line.
- G-core (blocking): with RLIMIT_CORE soft > 0, the 1,500-page SYNTHETIC PDF's V8 heap OOM (a routine refusal) aborted the reader and wrote an 858 MB core into the reader's cwd (packages/contracts/src/evidence/core; /app/dist in the image, chowned node:node, USER node) holding 90,134 copies of the document's lines (critic-core.log). Core deleted. No ulimits or readonlyRootFilesystem in infra/lib. The thread's OOM never aborted the process.
- Infra guard reach: covers the four worker-image containers (worker, platform, screening, migrate incl. logins) through command and NODE_OPTIONS; no container overrides in infra/lib. Holds the real task definition. Gap is only G-guard above.
- G-merge (should): ADR 0071 Status line conflicts with origin/claude/build-platform af3e79f3… (ci-findings-transport's "Amended 2026-11-05" sentence on the same line); resolve with a merge from claude/build-platform, never a rebase.
## Done
Clone /home/user/rv-pcp-critic removed. Probe sources: scratchpad/critic/. Logs: scratchpad/pcp/logs/critic-*.log.
