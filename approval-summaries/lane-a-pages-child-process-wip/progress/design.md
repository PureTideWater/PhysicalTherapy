# pages-child-process: design progress (measured first)

Worktree /home/user/pages-child-process at 7fb3e102 (claude/build-platform, #84), clean. Logs in the session scratchpad `pcp/logs/`.

## Step 1: measurements (2026-11-05)

Machine: 4 CPUs, 16 GiB. Node v24.22.0 (V8 13.6.233.17-node.57), /opt/node24/bin/node. Probe: `pcp/probe.mjs`, output `pcp/logs/probe.json`. heap_size_limit from `v8.getHeapStatistics()`.

| Where | Flags | heap_size_limit |
| --- | --- | --- |
| main thread | none | 2,240 MiB |
| worker thread, resourceLimits old 192 / young 32 | parent: none | **240 MiB** (today's bound) |
| worker thread, no resourceLimits | parent: none | 2,240 MiB |
| main thread | `--max-old-space-size=560` | 752 MiB (560 + 192 young on this host) |
| worker thread, resourceLimits old 192 / young 32 | parent: `--max-old-space-size=560` | **608 MiB** (the defect: old gen 560, young 48) |
| worker thread, resourceLimits old 192 / young 32 | parent: `--max-old-space-size=560 --max-semi-space-size=16` | 608 MiB (semi-space flag overrides too) |
| child process | none | 2,240 MiB |
| child process | `--max-old-space-size=192` | **384 MiB** (young defaults to 192 MiB on this host: the old flag alone is not enough) |
| child process | `--max-old-space-size=192 --max-semi-space-size=16` | **240 MiB** (equals today's thread) |
| child process | `--max-old-space-size=192 --max-semi-space-size=8` | 216 MiB |
| child process | `--max-old-space-size=224` / `256` / `560` | 416 / 448 / 752 MiB |
| child `--max-old-space-size=192`, parent under `--max-old-space-size=560`, env {} | | 384 MiB (a parent's flag never reaches a spawned child) |
| same, parent's flag in NODE_OPTIONS, child env {} | | 384 MiB |
| child argv `--max-old-space-size=192` with NODE_OPTIONS=`--max-old-space-size=560` inherited | | 384 MiB (argv wins over NODE_OPTIONS, but the env allowlist drops NODE_OPTIONS anyway) |

Bare child spawn (`node --max-old-space-size=192 -e 0`, env {}), 10 runs: 37 to 85 ms, median about 45 ms.

Decision from step 1: the child's command carries BOTH `--max-old-space-size=<old>` and `--max-semi-space-size=<semi>`; the old flag alone leaves the young generation host-sized (192 MiB here).

## Step 2: reading (done)
- Only runtime caller: apps/worker/src/intake/pages.ts (readAndStorePages), via intake.ts, intake job batchSize 1, default localConcurrency (1): one document at a time per worker task. Tests and eval call readDocumentPages/documentPages directly (packages/model-gateway eval, apps/web test-support, e2e, tools/release-capacity/scenario.ts).
- tools/release-capacity already runs the worker image under heapFlag('worker') (run.ts line 322), and its scenario reads a PDF through documentPages: the defect is live in the weekly real-size test, not in production (COMMANDS.worker has no heap flag yet).
- COMMANDS.worker (infra/lib/constructs/compute.ts) = node --enable-source-maps dist/main.js, used by the worker AND platform tasks. Worker env holds DATABASE_URL, queue URL, KMS_KEY_ID, DOCUMENTS_BUCKET, the task role's credentials (ECS metadata endpoint var AWS_CONTAINER_CREDENTIALS_RELATIVE_URI).
- Bundle: apps/worker/build.ts bundles page-thread.ts as dist/page-thread.js beside dist/main.js; pages.ts finds it by import.meta.url (.ts in source, .js in the bundle). Image: node:24-trixie-slim, /usr/local/bin/node, WORKDIR /app, dist/ copied, USER node.
- page-thread.ts imports no repository code, so Node runs it as TypeScript by type stripping (no tsx): the child can run the same file.
- ADR 0033 owns the reader (its alternatives table rejected a child process: "no better bound than the thread's polled cap"); ADR 0071 owns heap.ts ("The heap limits", and "The split" lists the heap flags in the task commands as a later PR).

## Decisions
- D1 ADR: amend 0033 (reader in a child process; the alternative row reversed) and 0071 (the order: heap flags in task commands only after this merges). No new ADR number needed. No test-matrix row decided yet (see design).

## Resumed run (2026-11-05, second run)
Found from the interrupted run, not yet recorded here (scratchpad `pcp/proto/`, `pcp/logs/`; the prototypes imported the reader from the main checkout at the same commit 7fb3e102, since the worktree had no install):
- `proto-560.json` (parent under `--max-old-space-size=560 --enable-source-maps`, child `--max-old-space-size=192 --max-semi-space-size=16`, reader page-thread.ts imported in the child's main thread, bytes over stdin, one JSON reply on stdout): child heap_size_limit **240 MiB** under the planned parent flag. Small 2-page PDF: child 2,103 ms cold then 377 to 394 ms; thread 266 to 353 ms (about +60 ms a document). 200 pages: child 858 ms, thread 696 ms. PDF bomb (one FlateDecode stream inflating to 160 MiB): child SIGKILLed by a 256 MiB RSS poll at 258 MiB peak (1,238 ms). Same bomb at 1 GiB with the RSS poll off: child read it to the end, **peak RSS 2,357 MiB, heap_size_limit 240**: the V8 flags do not bound buffers, so the process needs its own memory bound (the thread has one today: the heap+external poll). Deadline 1 ms: SIGKILL in 56 ms.
- `footprint.json`: idle bare child RSS 42 MiB; idle child with the reader imported **139 MiB**. 2,000-page PDF (22.2 MiB, about 7,500 characters a page): thread peak heap+external 368 MiB (above today's 256 MiB cap, so today's poll would refuse it; the probe did not apply the cap); child (old 192, semi 16, whole reply as one JSON string) **SIGABRT** (V8 heap out of memory). xlsx 20 sheets x 5,000 rows (2.1 MiB): thread heap+external 105, child RSS 223, reply 3.44 MiB.
- `calibrate.json` (150 lines a page): heap+external in the thread vs RSS of the child: 250 p 92 vs 219; 500 p 133 vs 264; 750 p 167 vs 305; 1,000 p 194 vs 342 (child RSS = thread heap+external + 127 to 148 MiB: the child's runtime and the reader's code). A flat 256 MiB RSS cap on the child would refuse a 500-page document the thread accepts: the cap must be measured over the child's own baseline, not absolute.
- `calibrate-2.json` empty: interrupted there.

### Second run: install and new measurements
- `pnpm install --frozen-lockfile` in the worktree under the lock: done (26 s, exit 0), worktree still clean.
- `permission.json` (Node's permission model, `--permission --allow-fs-read=<checkout>` on the child, reader page-thread.ts in the child's main thread, 2-page PDF): reads the same pages (294 to 345 ms vs 341 to 468 plain). Refused in the child: fs write, read of /etc and /proc/1/environ, child_process, worker threads, native addons (pdf.js's optional @napi-rs/canvas binding no longer loads: its warning goes to the drained stderr). **Not refused: TCP** (connected to 127.0.0.1:5433; Node 24 has no network permission). `--disallow-code-generation-from-strings` too: same pages.
- `calibrate-2` (running): today's readInThread with real limits vs child (old 192 or 224, semi 16), the child's memory bound being RSS growth over its own ready baseline (256 MiB) from /proc/<pid>/statm, page-by-page framed reply; 1,000 to 2,000 pages; bombs 160 MiB and 1 GiB.

### Reading, more
- Callers of readDocumentPages/documentPages at run time: apps/worker/src/intake/pages.ts only (permitted.ts reads stored page text, not bytes). Intake jobs are the `practice` group (WORKER_JOBS.worker), so only the worker task's command matters for the guard; platform (259) and screening (896, its pricing threads trusted and sized for the override, apps/worker/src/screening/threads.ts) parse no document.
- The screening consumer already documents and tests the override (threads.test.ts "Node gives every worker thread the process's --max-old-space-size"): the defect is known behaviour, applied to the page thread only by heap.ts's plan.
- Thread today: stackSizeMb 4. A child's main thread defaults to V8's ~984 KiB stack, so the child needs `--stack-size` to keep a deeply nested document's result the same.
- Worker image: node:24-trixie-slim, `/usr/local/bin/node` (= process.execPath), WORKDIR /app, dist/ from esbuild (entry 'page-thread' -> dist/page-thread.js beside dist/main.js). NODE_EXTRA_CA_CERTS, NODE_ENV in the task env; neither needed by the child.

## Decisions (continued)
- D2 child flags: `--max-old-space-size=<old> --max-semi-space-size=16 --stack-size=<KiB>` plus `--permission --allow-fs-read=<the child's entry only in the image>` and `--disallow-code-generation-from-strings`; no `--enable-source-maps`, no inherited execArgv, NODE_OPTIONS never passed.
- D3 env: `{}` (nothing; the child needs no variable). Bytes and the request over stdin as one framed message; reply page by page on stdout as length-prefixed frames, bounded.
- Idle heap (reader imported): child main thread 15.4 to 16.4 MiB used, 17.1 external; worker thread 18.3 and 20.8. No heap headroom needed for equal results.
- Worker `execArgv: ['--max-old-space-size=192']` throws ERR_WORKER_INVALID_EXEC_ARGV; worker `env.NODE_OPTIONS=--max-old-space-size=192` under a 560 parent: 608 MiB (not read).
- Bundle-like ESM entry with no package.json, `--permission --allow-fs-read=<that one file>`: runs as ESM, `import.meta.main` true, heap 240 with the flags; `env -i`: 0 variables.
- Design file drafted: /home/user/ops/designs/lane-a-pages-child-process.md (calibration table pending calibrate-2, which waits on the heavy lock behind another session's suite).

## Decisions (continued, 2)
- D4 heap: old 192 + semi 16 = 240 MiB (today's); no heap headroom (measured idle heap lower than the thread's); headroom in the memory bound: RSS growth over the ready baseline <= maxMemoryBytes, baseline ceiling 224 MiB (139 measured + 85).
- D5 VmRSS from /proc/<pid>/status (kB), not statm (page size); `ps` fallback off Linux at 100 ms.
- D6 one reader process per worker process (FIFO), one child per document, never reused; slot released on exit.
- D7 stderr: last 1 KiB ring, only V8's OOM line consulted, never logged; console silenced in the child before pdf.js loads.
- D8 frames on stdin/stdout, no IPC channel (unbounded message buffering); input copied once into a preallocated buffer.
- D9 test-matrix row needed: SEC-<n> placeholder, COUNTER REQUEST in the status file.
- calibrate-2 first attempt: killed by the 30 min background limit while still queued on the heavy lock (another session's suite); re-run queued with a 2 h limit.
- calibrate-2 done (calibrate-2.json, calibrate-2-noflag.json). No parent flag: thread reads 1,000 and 1,250 pages, refuses 1,500/1,750/2,000; child old 192 the same (1,500+ by V8 OOM, SIGABRT), child 224 the same (1,500+ by the 256 MiB growth cap). Growth over ready baseline: 198 (1,000 p), 226 (1,250 p). Baseline 144 to 146 MiB, ready 268 to 454 ms. Bombs 160 MiB and 1 GiB: killed at growth 274 and 267 (1.3 s, 1.7 s). Under the 560 parent flag the thread READ the 1,500-page document (heap 608): the defect at size.
- Trap found: resolving on `exit` lost the last frames (985/1,000, 1,237/1,250); resolve on `close`.
- D4 confirmed: old 192 (no heap headroom); worst case child about 146 + 256 + 18 = 420 MiB.
- Design file complete: /home/user/ops/designs/lane-a-pages-child-process.md.
