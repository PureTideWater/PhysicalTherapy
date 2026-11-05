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

*(Corrected in the fix round, F6:)* the weekly release-capacity run reads its PDF through `documentPages` in the
harness's own process, from the source tree (`tools/release-capacity/scenario.ts`), not through the image's
`dist/page-reader.js`; the entry path is proved by `apps/worker/src/bundle.test.ts`, which builds the bundle as
`build.ts` does and reads a SYNTHETIC PDF, workbook and CSV through the bundled reader under the image's argv.
Test-matrix row: **SEC-24** (allocated by the orchestrator 2026-11-05 02:09 UTC; added in the fix round, F9): "An
untrusted document is read in its own process" covering T1 to T8 and the guard.

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
  the URL rule, and the bundle test reads SYNTHETIC documents through the built bundle (fix round F6; the weekly run
reads its PDF in the harness, not through it). The permission model's single allowed file is that
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

## Fix round

The two reviews, their skeptics and the critic (2026-11-05), each confirmed finding fixed on the WIP ref, failing first
(logs `pcp/logs/fix/<id>-red.log` and `-green.log`). Correctness S2 and N1 were refuted and are left.

- **F1, security S1 = correctness B1 (blocking): a reader that replies and then lingers or grows.** After a done or
  refused frame the deadline and the memory poll were stopped, and the read settled only on `close`, so a compromised
  reader held the one reader slot for good and grew without bound. Resolution: the deadline and the poll stay armed
  until `close`; a well-formed last frame starts `READER_EXIT_GRACE_MS` (1 s), past which the child is killed and the
  read is `PageReadError` ("the page reader did not exit after its reply"); growth past the cap after the reply is
  `unsupported_document`. Stand-ins done-hang, refused-hang and done-grow, each with a SYNTHETIC CSV queued behind it.
- **F2, critic G1 (blocking): a crashed reader's core file.** Verified first: this container's core_pattern is
  `core` (relative), soft limit 0, hard unlimited; under `ulimit -c unlimited` the segv and abort stand-ins left a
  `core` in the reader's cwd (test-support/) at c369bc77. Resolution: the reader is spawned as `/bin/sh -c 'ulimit -c 0
  && unset PWD && exec "$@"' page-reader <node> <readerArgv> <entry>` (RLIMIT_CORE 0 soft and hard; the same pid,
  argv and empty environment after exec), with cwd `/`; every ECS container carries `ulimits core 0/0`
  (infra/lib/constructs/compute.ts, asserted in infra/test/compute.test.ts). Test: a parent under `ulimit -c
  unlimited` crashes the reader with SIGSEGV and SIGABRT and finds no core in the scratch dir, test-support/, the
  evidence dir, the repository or `/`, after a control (a plain node under the same limit) proves this host dumps;
  where the host writes no core (a piped pattern) the file check is skipped with its reason.
- **F3, correctness S1 (should): the two reply bounds untested.** A stand-in sends one page frame whose header claims
  the room left plus one byte, 1 GiB, or 0xFFFFFFFF: each is `PageReadError` (malformed reply) within seconds, the child
  gone, this process's RSS up by under 64 MiB and no uncaught exception; a frame of exactly the room left is read and
  refused at the character cap. Mutants: the per-frame bound removed, and both bounds removed, are killed; the stdout
  total alone removed survives as an equivalent mutant (FrameReader's cumulative check bounds the same total, and a
  reply within the page and character caps cannot reach it), recorded in the code's comment. No production change.
- **F4, correctness S3 and critic G5 (should): surviving mutants.** New stand-ins and tests: `stub-fat.ts` (240 MiB
  before ready: `PageReadError` "started too large"), done-exit-1 (`PageReadError` exit code 1, never pages),
  page-done-extra (a frame after the reply: malformed), abort (SIGABRT without V8's line: `PageReadError` signal
  SIGABRT), `exit-probe.ts` (a worker that exits mid-read: its reader, with no orphan check of its own, is gone within
  500 ms), an orphaned real reader under a killed shell (stops itself within 5 s), a damaged SYNTHETIC PDF read by the
  real reader directly (its stderr holds only the fixed load-time lines and nothing of the document; its frames are
  ready, page, done), many-then-exit (4,000 pages written and an exit at once, ten runs with this loop held up), and
  readPagesHere past the character cap with pages to spare. Mutants killed: the baseline ceiling, the exit handler's
  kill, `code === 0`, the child's text cap, the orphan check, a frame after the reply, the SIGABRT stderr check, and the
  console left loud with pdf.js at verbosity 5. Two survive, recorded: the console silencing alone (pdf.js at
  verbosity 0 logs nothing of a document, so it is the second guard), and settling on `exit` (not reproducible on
  Linux: the last bytes, written before the exit, are read in the same turn; the critic found the same; the test stays
  as the guard).
- **F5, critic G2 (should): the measurement refused the command it measures.** `infra/test/heap.test.ts` required the
  worker's exec line to carry no heap flag, so ADR 0071's later pull request (adding `heapFlag('worker')` to the
  command) would turn it red before it measured anything. Resolution: `withHeapFlag` moves to `infra/lib/heap.ts` (one
  spelling; `tools/release-capacity/scenario.ts` re-exports it); the test takes the command as it ships when it carries
  exactly `heapFlag('worker')`, inserts it with `withHeapFlag` when it carries none, and refuses any other heap flag.
  Checked with the command mutated to carry the flag (green, reader 240 MiB) and to carry `--max-old-space-size=600`
  (red).
- **F6, critic G3 (should): no test ran the bundled reader.** `apps/worker/src/bundle.test.ts` now builds the worker's
  bundle as `build.ts` does, into a directory of its own (`build.ts` takes an optional outdir, 2.4 s), and reads a
  SYNTHETIC PDF, workbook and CSV through the bundled `page-reader.js` with `readInChild` (the image's argv: it may read
  only that file), each at a 240 MiB heap. The critic's mutant (yauzl made external) left the old test 2/2 green and
  now fails it (`PageReadError` exit code 1). The wording that the weekly real-size test reads through the image's
  reader is corrected here (T-section note, risks) and in the test's comment.
- **F7, critic G4 (should): ADR 0071's Status line conflicted** with claude/build-platform (af3e79f3…) and three live
  co-001 heads (ci-findings-transport's own "Amended 2026-11-05" on the same line). Resolution without a base merge
  (the base merge comes once, before the PR branch): the Status line is back to the base's text and this branch's
  amendment is a bullet of its own after the PRD sections; `git merge-tree` against all four is now clean, and the
  merged Status block holds both amendments.
- **F8, nits.** Security S4 and correctness N2: seven comments that still said "bounded thread" now say a child process
  of its own (the applied migration's comment and the screening consumer's real threads are left). Security S3:
  pages.ts's and page-reader.ts's comments say the reader can still open a network connection. Security S2:
  READER_EXIT, LIVE and ADR 0033 say the orphan backstops run only when the reader's loop is free and that a killed or
  aborted worker leaves the container's end (the init process exiting) as the last bound. Correctness N3 (T3's peak):
  `watched()` keeps each reader's VmHWM, and the 1 GiB bomb test asserts its growth over a small read's peak stays
  under maxMemoryBytes + 96 MiB (261 MiB measured; the cap doubled gives 517 and fails). Two comment rewraps besides.
- **F9, SEC-24** (the orchestrator's allocation): the row in `docs/product/test-matrix.md` (and its note),
  `packages/synth/src/cases/matrix.ts` and `registry.ts` (`none(1, …)`, asserted by pages.test.ts, evidence.test.ts,
  infra/test/heap.test.ts, infra/test/compute.test.ts and apps/worker/src/bundle.test.ts, each naming the row);
  `pnpm synth --all` wrote `fixtures/synthetic/SEC-24/expected.json`. The design's placeholder now reads SEC-24.

### Fix round, repair 1 (the fix check's first round)

- **R1 (blocking): the exit grace on a held loop.** A worker loop held past `READER_EXIT_GRACE_MS` by other work failed a
  reader that had exited at once (14 of 15 reads under a 1.2 s hold). The grace and the deadline now decide through
  `afterPendingInput` (a `setImmediate` after the loop's poll for input), and the grace fails only a reader with no
  `exit` yet. Test: many 20 under a 1.2 s hold from the check phase (4e675ee8…).
- **R2 (should, extends F2): the core guard on every host.** A test reads the running reader's `/proc/<pid>/limits`
  (Max core file size 0, soft and hard) and its cwd (`/`), so the guard is asserted where the host writes no core
  file. The crash test also kills the real reader by a V8 heap out-of-memory on a SYNTHETIC PDF, beside SIGSEGV and
  SIGABRT. ADR 0033 and SEC-24 name the residual of a piping core_pattern (a host's handler that ignores
  RLIMIT_CORE) (5dcc760b…).
- **R3 and R4 (should, extend F3 and F4): the parent's own caps and the two baseline checks.** The parent's page and
  character caps on the reply, each tested alone (6f2ef532…); the ready-frame baseline check and the poll's, each
  with a stand-in of its own (`stub-fat.ts` with a 30 s poll, `stub-fat-unready.ts`) (8809d656…).
- **R5 to R7 (nits):** heap.test.ts compares the worker command's node flags in any order (9b89f0b9…); the last
  "thread" comments (476aa126…); SEC-24's wording on an oversized frame against a reply past its bound (a46473fd…).

### Fix round, repair 2 (the fix check's second round)

- **Q1 (should): the deadline after the last frame.** A stand-in sends done 1.5 s into a 2 s deadline and hangs: the
  read is refused at the deadline, before the grace, with a CSV queued behind it. Clearing the deadline at the reply
  turns it red (782fb33b…).
- **Q2 (nit, found a defect): the deadline on a held loop.** With the worker held from 2.4 s to 3.3 s on a 3 s
  deadline, a reader that replied and exited at 2.5 s was refused: one deferred turn has its exit in but not its
  close (the pipes close in the loop's close phase, after that turn). The deadline now gives an exited reader one
  turn more. Red at the earlier head and with the deadline's deferral removed (515046e5…).
- **Q3 (nit):** the held-loop grace test reads three times, not six (7.2 s; its mutant still fails at run 1)
  (6f002b37…).
- **Not changed:** the 1 GiB bomb's peak-growth bound (about 90 MiB of headroom over the 261 MiB measured) stays; its
  failure message prints both peaks, so a CI flake can be told from a regression.
