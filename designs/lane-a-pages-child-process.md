# Contract-page extraction in its own process (`co-001/pages-child-process`): design

Lane A, acting session S3. WIP ref `co-001/wip-pages-child-process`, cut at `claude/build-platform` 7fb3e102… (#84);
worktree /home/user/pages-child-process. Measured first on this machine: Node v24.22.0 (V8 13.6.233.17-node.57),
`/opt/node24/bin/node`, 4 CPUs, 16 GiB. Probes and raw numbers: the session scratchpad's `pcp/proto/` and `pcp/logs/`
(probe.json, proto-560.json, footprint.json, calibrate.json, calibrate-2.json, calibrate-2-noflag.json,
permission.json). Every document in every probe is SYNTHETIC, built in the probe (`syntheticPdf`, `syntheticXlsx`, a
deflate bomb of spaces).

## 1. The defect, measured

`packages/contracts/src/evidence/pages.ts` reads an untrusted PDF, workbook or CSV in a worker thread
(`page-thread.ts`) under `resourceLimits` (old 192 MiB, young 32, stack 4), a 25 ms poll of the thread's heap plus
external memory against `maxMemoryBytes` (256 MiB), a 60 s deadline, and caps on pages, text and a workbook's
inflation (ADR 0033). `infra/lib/heap.ts` (ADR 0071, audit #31) plans `--max-old-space-size=560` on the worker task's
command (`heapFlag('worker')`). V8's heap flags are process-wide, and Node 24 lets them override a thread's
`resourceLimits`:

| Where | Flags | `heap_size_limit` |
| --- | --- | --- |
| worker thread, `resourceLimits` 192 / 32 | parent: none | **240 MiB** (today's bound) |
| worker thread, `resourceLimits` 192 / 32 | parent: `--max-old-space-size=560` | **608 MiB** (old 560, young 48) |
| worker thread, `resourceLimits` 192 / 32 | parent: `--max-old-space-size=560 --max-semi-space-size=16` | 608 MiB |
| worker thread, `resourceLimits` 192 / 32, thread `env.NODE_OPTIONS=--max-old-space-size=192` | parent: `--max-old-space-size=560` | 608 MiB (a thread's env is not re-read) |
| worker thread, `execArgv: ['--max-old-space-size=192']` | any | throws `ERR_WORKER_INVALID_EXEC_ARGV` |
| main thread | `--max-old-space-size=560` (this host) | 752 MiB |
| child process | `--max-old-space-size=192` | **384 MiB**: young is sized from the host (192 MiB on 16 GiB), so the old flag alone does not bound it |
| child process | `--max-old-space-size=192 --max-semi-space-size=16` | **240 MiB**, equal to today's thread, on any host |
| child process | `--max-old-space-size=192 --max-semi-space-size=8` | 216 MiB |
| child process `--max-old-space-size=192 --max-semi-space-size=16`, parent under `--max-old-space-size=560 --enable-source-maps` | | **240 MiB** (proto-560.json: the parent's flag never reaches a spawned child) |
| child `--max-old-space-size=192`, `NODE_OPTIONS=--max-old-space-size=560` inherited | | 384 MiB (argv wins; the design passes no NODE_OPTIONS anyway) |

So under the planned command the page thread would hold up to 608 MiB of heap beside a 752 MiB main thread in a
1,024 MiB task: one hostile document could take the task down (every practice's jobs on it) instead of being refused.
The defect is latent in production (`COMMANDS.worker` has no flag yet) and **live in the weekly real-size test**
(`tools/release-capacity/run.ts` line 322 runs the worker image under `heapFlag('worker')` and its scenario reads a PDF
through `documentPages`). The screening consumer already relies on the same override, deliberately and tested
(`apps/worker/src/screening/threads.ts`): its pricing threads read no document.

What else the probes showed, which shapes the design:

- **A V8 heap flag does not bound buffers.** A 1 GiB deflate bomb (one FlateDecode stream of spaces) read in a child
  with `heap_size_limit` 240 MiB and no memory poll ran to the end: **peak RSS 2,357 MiB**, 26 s (proto-560.json). A
  child needs its own memory bound, as the thread has its heap-plus-external poll.
- **The child's RSS is not the thread's heap plus external.** On legitimate documents (150 lines a page) the child's
  RSS was the thread's heap+external plus 127 to 148 MiB (250 pages 92 vs 219, 500 p 133 vs 264, 750 p 167 vs 305,
  1,000 p 194 vs 342; calibrate.json): the child's runtime and the reader's code. An idle child with the reader
  imported holds **139 MiB** RSS (a bare `node -e 0` 42). A flat 256 MiB RSS cap would refuse a 500-page contract the
  thread reads today, so the bound is measured as growth over the child's own idle footprint (section 3.5).
- **Idle heap:** the reader imported in a child's main thread uses 15.4 to 16.4 MiB of heap and 17.1 MiB external; in a
  worker thread 18.3 and 20.8. The child carries no more heap than the thread, so equal V8 limits keep equal results.
- **Reply shape matters.** A 2,000-page document replied as one `JSON.stringify` string died of V8 heap exhaustion
  (SIGABRT) in a child whose limit equals the thread's (footprint.json); the reply goes page by page (section 3.4).
- **Startup:** a bare child spawns in 37 to 85 ms (median about 45). A 2-page PDF: child 2,103 ms cold (first run,
  disk cache), then 377 to 394 ms; thread 266 to 353 ms: about +60 ms a document warm. 200 pages: child 858 ms, thread
  696 ms. Under the permission model (section 3.2) 294 to 345 ms (permission.json; noise is wider than the difference).
- **Kill latency:** a 160 MiB bomb was SIGKILLed by a 256 MiB poll at a 258 MiB peak in 1,238 ms, and by a 64 MiB
  poll at 74 MiB in 149 ms; a 1 ms deadline killed the child in 56 ms.
- **Calibration against today's limits** (calibrate-2): section 3.5's table: the child at today's heap gives today's
  result for every size measured.

## 2. Where the reader sits (read for this design)

- `packages/contracts/src/evidence/pages.ts`: `documentFormat`, `readInThread`, `readDocumentPages`, `documentPages`,
  `PAGE_READ_LIMITS`, `PageReadError`. `page-thread.ts`: `readPagesHere` and the PDF, workbook and CSV readers; it
  imports nothing of the repository, so Node runs it by type stripping in the source tree and esbuild bundles it as
  `dist/page-thread.js`. `resolve.ts` and `scan.ts` (Textract) are unchanged by this design: an image and a PDF's
  empty pages still go to the scan reader in the parent, after the child's reply, exactly as now.
- Run-time callers: `apps/worker/src/intake/pages.ts` (`readAndStorePages`), from `intake.ts`; the intake job is in
  the `practice` group (`WORKER_JOBS.worker`), batch size 1, local concurrency 1: one document at a time per worker
  task. Tests and tools call `readDocumentPages`/`documentPages` directly: the contracts tests, `packages/model-gateway`
  eval sets, `apps/web` e2e journeys, `tools/release-capacity/scenario.ts`. `apps/worker/src/models/permitted.ts` reads
  stored page text, never bytes.
- The image (`apps/worker/Dockerfile`): `node:24-trixie-slim`, node at `/usr/local/bin/node` (`process.execPath`),
  WORKDIR `/app`, `dist/` from `apps/worker/build.ts` (one ESM bundle per entry, with a `createRequire` banner), USER
  node, CMD `node --enable-source-maps dist/main.js`. The task's command is `launchScript(...)`, whose last line is
  `exec node ...`, so node is the container's first process: when it dies the container stops and every child with it.
- The worker task's environment holds `DATABASE_URL` and the queue URL (built in the container from secrets),
  `KMS_KEY_ID`, `DOCUMENTS_BUCKET`, mail and model settings, `NODE_EXTRA_CA_CERTS`, and ECS's credential endpoint
  variable. Its security group allows HTTPS anywhere and PostgreSQL to the database (infra/lib/constructs/network.ts).
- ADR 0033 owns the reader (its alternatives table rejected a child process: "no better bound than the thread's
  polled cap"). ADR 0071 owns `heap.ts` ("The heap limits"; "The split" puts the heap flags in the task commands in a
  later pull request).

## 3. The design

### 3.1 Shape

- `page-thread.ts` becomes `page-reader.ts` (`git mv`, so its history follows): `readPagesHere` and every format
  reader unchanged, still importing nothing of the repository. Its worker-thread tail (`isMainThread`/`parentPort`) is
  replaced by the child's main loop, run only when the file is the process's entry (`import.meta.main`, Node 24), so
  the tests' import of `readPagesHere`, `csvRows` and the rest starts nothing.
- `pages.ts`: `readInThread` becomes `readInChild(request, limits)` with the same reply type; `readDocumentPages`,
  `documentPages`, `documentFormat`, `PAGE_READ_LIMITS`' fields and `PageReadError` keep their signatures. New:
  `PAGE_READER_ISOLATION = 'process' as const` (what the infra guard reads), and the child's flags as one exported
  function `readerArgv(limits)` so the tests and the guard check the argv the code really uses.
- `apps/worker/build.ts`: the entry `'page-thread'` becomes `'page-reader'` (`dist/page-reader.js`); the doc comment
  says the worker spawns it. The Dockerfile needs no change (`dist/` is copied whole).

### 3.2 Spawning

`spawn(process.execPath, [...readerArgv(limits), entryPath], { env: {}, stdio: ['pipe', 'pipe', 'pipe'], cwd: entryDir,
shell: false, detached: false, serialization: n/a (no IPC channel) })`, where `readerArgv(limits)` is exactly:

1. `--max-old-space-size=<limits.maxHeapMb>` (192) and `--max-semi-space-size=16`: `heap_size_limit` 240 MiB, today's
   thread's, on any host. **Headroom, stated:** none is added to the heap, because the child's idle heap (15 to 16 MiB)
   is below the thread's (18 MiB) and replies page by page; the room the child needs beyond the thread is native and
   lives in the memory bound (3.5), measured. A larger heap would accept documents the thread refuses today, which
   changes a result's meaning.
2. `--stack-size=3920` (KiB): the thread runs with `stackSizeMb: 4`; a child's main thread defaults to V8's 984 KiB,
   which would turn a deeply nested document that reads today into `document_unreadable`. The main thread's OS stack is
   8 MiB (the container's default), so 3,920 KiB leaves V8 its guard space.
3. `--permission` with `--allow-fs-read=<the entry file>` in the image (one file: the bundle reads nothing else), or
   `--allow-fs-read=<the workspace root>` in the source tree (the reader's `pdfjs-dist` and `yauzl` resolve through
   `node_modules/.pnpm` there). Measured (permission.json): the reader reads the same pages; the child cannot write a
   file, read `/etc` or `/proc/*/environ`, spawn a process, start a thread or load a native addon (pdf.js's optional
   `@napi-rs/canvas` binding, which today loads into the worker process, no longer loads). Not refused: TCP (Node 24
   has no network permission; section 6).
4. `--disallow-code-generation-from-strings`: pdf.js's `new Function` paths (PostScript functions, never text) fall
   back; measured the same pages.
5. No `--enable-source-maps`, no inherited `execArgv`, no `NODE_OPTIONS` (the env is empty), no loader: the entry is
   TypeScript run by type stripping in the source tree and the bundle's JavaScript in the image.

**The entry is found** as the thread's is now: `new URL(import.meta.url.endsWith('.ts') ? './page-reader.ts' :
'./page-reader.js', import.meta.url)`, which is `packages/contracts/src/evidence/page-reader.ts` in the source tree and
vitest, and `/app/dist/page-reader.js` beside `/app/dist/main.js` in the image. `readerEntry(moduleUrl)` is the pure
function the bundle test calls with `file:///app/dist/main.js`.

**The environment is `{}`.** The child needs no variable: no AWS credentials or ECS credential endpoint, no
`DATABASE_URL` or queue URL, no `KMS_KEY_ID`, no bucket, no `NODE_OPTIONS`, no `NODE_EXTRA_CA_CERTS` (it opens no
connection), no `PATH`, no `HOME`, no `TZ` (it formats no date). **The argv carries flags and the entry path only:**
no document identifier, practice, name, hash or size. No file is written: the bytes go over stdin, the pages come back
over stdout.

### 3.3 The child's loop (`page-reader.ts`, as entry)

1. Silence the console before importing pdf.js (`console.log/info/warn/error/debug` and `process.emitWarning` become
   no-ops): pdf.js's warnings can quote document text, and with them gone fd 2 carries only the runtime's own fatal
   lines.
2. Write the **ready** frame.
3. Read the request: a 4-byte big-endian header length, the header JSON (`format`, `byteLength`, `maxPages`,
   `maxTextCharacters`, `maxInflatedBytes`: an enum and numbers, no document data), then exactly `byteLength` bytes,
   copied into one `Buffer.allocUnsafe(byteLength)` as they arrive (one copy, as the thread's `postMessage` made; a
   chunk list then `Buffer.concat` would hold two, 128 MiB for a 64 MiB document). A header past 1 KiB, a length past
   `maxBytes`, or more bytes than declared exits 2 (protocol).
4. `readPagesHere(request)`, unchanged.
5. Reply: one **page** frame per page, then **done** (carrying `heap_size_limit`, a number, for the measurement test),
   or one **refused** frame (`unsupported_document` | `document_unreadable`). Each write awaits `drain`. Then exit 0.
6. Backstops for an orphan (the parent killed without its exit handler): a self-deadline (`timeoutMs` + 5 s) and a
   check every second that `process.ppid` is unchanged, either exiting 3. They run only when the loop is free; the
   parent's SIGKILL is the bound, and in the image the container's stop is the last one.

Frames: 1 byte type (0 ready, 1 page, 2 done, 3 refused), 4 bytes big-endian length, then UTF-8. **Bounded reply:** the
parent counts bytes and pages as they arrive and kills the child (`unsupported_document`) past
`maxTextCharacters x 4 + (maxPages + 2) x 5 + 64` bytes (64 Mi characters' worth at 16 Mi characters), past `maxPages`
page frames, or past `maxTextCharacters` characters decoded: it re-applies the caps the child should have applied,
because the child is the part reading hostile bytes. A frame of an unknown type or a length past what remains of the
bound is the reader's own failure (`PageReadError`). An IPC channel was rejected: Node buffers a whole IPC message
before delivering it, so a misbehaving child could make the parent hold an unbounded message, and a channel puts
`NODE_CHANNEL_FD` in the child's env.

### 3.4 Results: every path keeps its meaning

| What happens | Result (as now) |
| --- | --- |
| Done frame after the page frames, exit 0 | `{ ok: true, pages }`; empty PDF pages then go to the scan reader in the parent, unchanged |
| Refused frame, exit 0 | `unsupported_document` or `document_unreadable`, as the reader said |
| Over `maxBytes`, or no supported format | `unsupported_document` before any child starts (unchanged) |
| RSS growth over `maxMemoryBytes` (3.5) | SIGKILL; `unsupported_document` (today: the heap+external poll) |
| Deadline (`timeoutMs`, from spawn, as the thread's from `new Worker`) | SIGKILL; `unsupported_document` (`timeoutMs: 0` refuses at once, as now) |
| V8 heap out of memory (SIGABRT with V8's fixed "heap out of memory" line in the last 1 KiB of stderr) | `unsupported_document` (today: `ERR_WORKER_OUT_OF_MEMORY`) |
| Reply past its bound, more pages than `maxPages`, more characters than `maxTextCharacters` | SIGKILL; `unsupported_document` |
| Exit without a done or refused frame (any code or signal: a crash, SIGSEGV, exit 2 or 3), a malformed frame, a spawn error (`ENOENT`, `EAGAIN`), idle baseline over its ceiling (3.5), no RSS source | `PageReadError` naming only the code or signal (`the page reader stopped with exit code 3`, `... with signal SIGSEGV`): the job retries, as now |

`PageReadError`'s message never carries stderr, a path, or anything of the document. stderr is read into a ring of its
last 1 KiB, consulted only for V8's fixed out-of-memory line, and dropped; stdout is parsed and dropped; nothing from
the child is logged, and the parent adds no log line (`pnpm lint:logs` unchanged). A crafted document that prints V8's
line itself can at worst turn its own crash into its own refusal.

### 3.5 Memory: the bound and its headroom

- **Hard V8 limit:** 240 MiB `heap_size_limit` (3.2).
- **Process bound, polled from the parent every `pollMs` (25 ms):** the child's RSS from `/proc/<pid>/status`
  (`VmRSS`, in kB, so the page size never matters: arm64 kernels may use 64 KiB pages). The parent records the
  child's **baseline** when the ready frame arrives (the reader imported, no document byte read yet: 139 to 146 MiB
  measured) and kills the child when `RSS - baseline > maxMemoryBytes` (256 MiB). This keeps today's meaning: the
  thread's cap counts what reading the document takes (its heap and buffers), not the runtime under it.
  - The baseline itself has a ceiling, `READER_BASELINE_MAX_BYTES` (224 MiB, the measured 139 to 146 plus about 80 MiB of
    headroom for another image or Node patch): a child heavier than that before reading anything is the reader's own
    failure (`PageReadError`), never a silent widening of the bound. Before ready, the same ceiling applies to the
    child's absolute RSS.
  - So the child holds at most baseline + 256 MiB + one poll's growth: about 146 + 256 + one poll's overshoot (measured
    up to 18 MiB at 25 ms) = about 420 MiB, against today's thread at heap+external 256 MiB plus its isolate's own runtime
    inside the worker process.
  - Calibration against today's reader (calibrate-2; parent under `--max-old-space-size=560 --enable-source-maps` and
    again without it):

    | SYNTHETIC PDF (150 lines a page) | Today's thread, no parent flag | Child old 192 + semi 16 | Child old 224 + semi 16 |
    | --- | --- | --- | --- |
    | 1,000 pages, 11.0 MiB | pages (4,832 ms) | pages; growth 198 to 199 MiB; 5,203 to 5,262 ms | pages; growth 205 to 207 |
    | 1,250 pages, 13.8 MiB | pages (6,268 ms) | pages; growth 226; 6,436 to 6,926 ms | pages; growth 234 to 237 |
    | 1,500 pages, 16.6 MiB | unsupported_document | V8 heap OOM (SIGABRT) at growth 238 -> unsupported_document | growth cap (SIGKILL at 256) -> unsupported_document |
    | 1,750 and 2,000 pages | unsupported_document | OOM at growth 244 to 250 | growth cap at 256 to 258 |
    | 160 MiB deflate bomb | unsupported_document | growth cap: SIGKILL at growth 274 (one poll's overshoot, 18 MiB), 1,340 ms | |
    | 1 GiB deflate bomb | unsupported_document | growth cap: SIGKILL at growth 267, 1,699 ms (2,357 MiB with no poll) | |

    The child at old 192 accepts and refuses exactly the documents today's thread does, its boundary between 1,250
    and 1,500 pages like the thread's; a child at 224 reaches the same results through the memory cap instead of the
    heap, so the larger heap buys nothing and is not taken. Ready baseline 144 to 146 MiB; ready after 268 to 454 ms.
    Under the planned parent flag the thread read the 1,500-page document (its heap 608 MiB): the defect, at size.
    **A measured trap:** resolving on the child's `exit` lost the last frames (985 of 1,000 and 1,237 of 1,250 pages
    received, no done frame): `exit` can fire before stdout is drained. The parent resolves on `close` (3.7).

- **Off Linux** (a developer's Mac; no `/proc`): the parent reads the child's RSS with `ps -o rss= -p <pid>` every
  100 ms. Deployed tasks and CI are Linux; the memory tests run there.
- **Why no kernel limit:** `RLIMIT_AS` breaks V8 (its pointer-compression cage reserves 4 GiB of address space at
  start); a child cgroup needs root, which the task does not have; `prlimit` is not in Node. The poll plus SIGKILL is
  what the thread has today, now with the kernel's own count of the process.

**The worker task's budget** (1,024 MiB; ADR 0071 holds the main thread to 560 MiB old generation): one child at a time
(3.6) at about 420 MiB worst case. ADR 0033's consequence "the intake concurrency times the thread's cap must fit the
worker task" now reads "times the reader's process bound", and the weekly real-size test (`memory.peak` under 90% of
the task, cgroup-wide, so the child counts) proves it at real size.

### 3.6 Concurrency

At most **one reader process per worker process** (`MAX_READERS = 1`): a module-level FIFO semaphore in `pages.ts`.
Intake already reads one document at a time; the semaphore makes it a property of the reader, so a second caller (the
eval sets, e2e, a future job) queues instead of doubling the task's worst case. The deadline starts at spawn, not while
queued. The slot is released on the child's `close`, not on the decision, so a killed child's memory is gone before the
next starts. **One child per document, never reused:** a warm pool would save about 300 ms a document but let a
compromised reader see the next practice's document; isolation per document is the point.

### 3.7 Cleanup on every path

One `finish(outcome)` per child: clear the poll and the deadline, SIGKILL the child if it has not exited, destroy its
three pipes once read, ignore `EPIPE` on stdin (a child that died before reading), then resolve or reject on `close`
(every pipe drained and the process exited; never on `exit`, which can come before stdout's last frames: measured,
calibrate-2) or on the spawn `error`, when no process started, release the semaphore, and remove the child from the set a
`process.on('exit')` handler SIGKILLs (a worker stopping mid-read leaves no child). Every test asserts the child's pid
is gone afterwards (`process.kill(pid, 0)` throws `ESRCH`).

## 4. The guard and the order

- **ADR that owns `heap.ts`: ADR 0071.** Amended ("The heap limits" and "The split"): *the worker task's heap flag
  lands only after the page reader runs in its own process (ADR 0033, `co-001/pages-child-process`); a process-wide
  heap flag overrides a worker thread's `resourceLimits` on Node 24 (608 MiB measured for a thread asking 192 under
  560), so the flag must not ship before this; `infra/test/heap.test.ts` refuses it otherwise.* `heap.ts`'s comment
  says the same.
- **ADR 0033** amended, not replaced: the decision's bullet reads "in its own child process" with the bounds of
  section 3; the alternatives row "A child process" is reversed with the measurement (a thread's bound does not survive
  the task's heap flag; the child's does, and the process boundary adds the empty env and the permission model); a new
  row "A worker thread under the task's heap flag"; consequence and revisit lines as in 3.5 and 6. No new ADR number.
- **The guard** (`infra/test/heap.test.ts`, synthesized stacks, every environment): every container of the worker image
  whose command or `NODE_OPTIONS` carries a V8 heap flag (`--max-old-space-size`, `--max-semi-space-size`,
  `--max-heap-size`, `--max-young-generation-size`) is refused unless `PAGE_READER_ISOLATION` (imported from
  `packages/contracts/src/evidence/pages.ts`, as `infra/test/screening.test.ts` imports the worker's constants) is
  `'process'`. The screening task's existing flag passes once this lands; any task that later parses documents is
  covered without naming it.
- **The measurement** (same file): the worker container's real command from the synthesized task definition (the
  `exec node ...` line of its launch script), with `heapFlag('worker')` inserted after `node` when it has none
  (`withHeapFlag`, the weekly test's own), its node flags run as a parent process that reads a SYNTHETIC PDF through
  `readInChild` and prints its own `heap_size_limit` and the reader's. Expected: the parent's is the flag's, the
  reader's is V8's answer for `readerArgv(PAGE_READ_LIMITS)`'s heap flags (240 MiB here), and the reader's is below
  `maxHeapMb + 64`.

## 5. Test plan (failing first)

Each test is written and run red on the WIP ref before the code changes, its red output kept in the logs.

| # | Test (file) | Asserts | Red before the change because |
| --- | --- | --- | --- |
| T1 | The reader's heap under the planned flag (`packages/contracts/src/evidence/pages.test.ts`) | a parent run as `node --max-old-space-size=560 --enable-source-maps` reads a SYNTHETIC PDF; the reader reports `heap_size_limit` 240 MiB, equal to V8's answer for `readerArgv`'s flags | the thread reports 608 MiB |
| T2 | The guard and the measurement (`infra/test/heap.test.ts`) | section 4 | `PAGE_READER_ISOLATION` does not exist; the measured reader is 608 MiB |
| T3 | A bomb past the memory cap (`pages.test.ts`) | `deflateBombPdf(160)` with `maxMemoryBytes` 64 MiB is `unsupported_document`, the child's pid is gone, the parent's heap untouched; the 1 GiB bomb with the default limits is refused within the deadline and the child's peak growth stays under 256 MiB plus one poll | no child exists (red on the pid assertion) |
| T4 | Timeout (`pages.test.ts`) | `timeoutMs: 0` and a 50 ms deadline on a 200-page SYNTHETIC PDF are `unsupported_document`, the child gone | as T3 |
| T5 | A crashing reader (`pages.test.ts`, test-only entries in `src/evidence/test-support/`) | an entry that exits 3, one that kills itself with SIGSEGV, one that writes a malformed frame, one that never says ready past the deadline (`unsupported_document`), one that exhausts its heap (`unsupported_document`), one that floods past the reply bound (`unsupported_document`, killed); `PageReadError` messages hold only a code or signal | `readInChild` and its entry option do not exist |
| T6 | Env, argv, files (`pages.test.ts`) | with `AWS_ACCESS_KEY_ID`, `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`, `DATABASE_URL`, `NODE_OPTIONS` set in the parent, an echo entry sees no variable at all, `process.argv` = [execPath, entry], `process.execArgv` = `readerArgv(limits)`; no file is created in the temp directory or the cwd during a read | as T5 |
| T7 | Permission (`pages.test.ts`) | an entry under `readerArgv` cannot write a file, read `/proc/self/environ`, spawn, start a worker or load an addon (`ERR_ACCESS_DENIED`), and the real reader still reads | as T5 |
| T8 | One at a time (`pages.test.ts`) | three reads at once: their children never overlap (spawn and exit times), each result equals its sequential one | as T5 |
| T9 | Every existing test in `evidence.test.ts` (20 cases: the bounded reader's 8, page text, Textract, evidence resolution) | unchanged assertions, the import renamed to `./page-reader` | green before and after (the regression net) |
| T10 | The bundle's entry (`apps/worker/build.test.ts` or the existing build check) | `build.ts` has the `page-reader` entry from the reader's file; `readerEntry(new URL('file:///app/dist/main.js'))` is `/app/dist/page-reader.js` | the entry is `page-thread` |
| T11 | Closure (`packages/contracts/src/index.test.ts`) | the package index never reaches `evidence/page-reader.ts` | it names `page-thread.ts` |
| T12 | Logs and suite | `pnpm lint:logs`, `pnpm typecheck`, `pnpm lint`, the unit suite, `pnpm test:db` once, unchanged | |

The weekly release-capacity run keeps reading a PDF through `documentPages` in the real image under
`heapFlag('worker')`: it is the end-to-end proof of the entry path and the cgroup's peak, with the child in it.
Test-matrix row: **SEC-<n>** (placeholder; COUNTER REQUEST in the status file): "An untrusted document is read in its
own process" covering T1 to T8 and the guard.

## 6. Alternatives, and why they lose

| Option | Why not |
| --- | --- |
| Keep the thread and drop the flag | Gives up ADR 0071's explicit heap (audit #31); leaves the bound one flag or one `NODE_OPTIONS` from silently becoming 608 MiB; keeps hostile bytes in the process that holds the database login, the practice keys' KMS access and the task role, with pdf.js's native canvas binding loaded into it |
| `NODE_OPTIONS` or `execArgv` per thread | Measured: a thread's `execArgv` refuses V8 heap flags (`ERR_WORKER_INVALID_EXEC_ARGV`), and a thread's `env.NODE_OPTIONS` is never read (608 MiB). V8 flags are per process |
| `vm` contexts | Share the isolate's heap (2,240 MiB here): no limit of their own, no isolation of memory or of a crash |
| `isolated-vm` (separate isolates in-process) | A native addon to maintain across Node majors; its isolates have no Node APIs pdf.js and yauzl use; memory corruption still shares the worker's address space |
| A reader pool of warm children | About 300 ms a document saved; a compromised reader sees the next practice's document |
| An IPC channel for the reply | Unbounded buffering of one message in the parent; `NODE_CHANNEL_FD` in the child's env (3.3) |
| A temp file for the bytes | A path to name and clean up; a file of PHI on the task's disk; the permission model would have to allow reading it |
| A separate parsing task or Lambda with no egress | The one bound this design cannot give: network. It moves PHI through another service, adds a hop and its key handling to ADR 0033's intake, and costs a cold start a document. Recorded as the revisit below; Node's own network permission (Node 25's `--allow-net`, in the next LTS) closes the same gap with no new service |

## 7. Risks

- **Startup cost per document:** about +60 ms warm, 2.1 s for the first read after a cold start (measured); intake is
  one document at a time and not latency-bound. Recorded in ADR 0033.
- **The image's entry path:** `dist/page-reader.js` must sit beside `dist/main.js`; T10 checks the build's entry and
  the URL rule, the weekly real-image run reads a PDF through it. The permission model's single allowed file is that
  path, so a moved entry fails closed (`PageReadError`), never open.
- **Network:** the child can still open TCP (Node 24 has no network permission) and the worker's group allows HTTPS
  anywhere: a reader compromised by a document could send that document out. It holds no credential, no other
  document and no key; today's thread is worse on every count. Revisit at Node 26 LTS (`--permission` without
  `--allow-net`) or with a no-egress parsing task.
- **Baseline drift:** a heavier Node or pdf.js raises the child's idle RSS; past 224 MiB the reader fails closed
  (`PageReadError`, the job retries and then fails visibly) instead of widening the bound.
- **Off-Linux development:** the `ps` poll is slower (100 ms); the memory tests' timing assertions run on Linux.
- **The permission model's surface:** `--permission` is stable in Node 24; a future Node that refuses a path the
  reader needs fails closed in T7 and T9 first.
