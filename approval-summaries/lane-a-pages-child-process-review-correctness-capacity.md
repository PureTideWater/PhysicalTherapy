# pages-child-process: adversarial review, correctness and capacity

Reviewed: `co-001/wip-pages-child-process` at c369bc77… (base 7fb3e102…), from a fresh clone. Node v24.22.0, Linux, 4 CPUs.
Every document used was SYNTHETIC and built in the probe (syntheticPdf, syntheticXlsx, deflateBombPdf). Logs:
`/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp/logs/rv-cc/`. Probe
scripts: `.../scratchpad/pcp/rv-cc-scripts/`. Every probe file placed in the clone was untracked and removed afterwards.
The clone has been deleted.

**Verdict: one blocking finding, three should, three nits.** The heap fix works under the task's real command and in
the bundle. But once the child has sent its reply, nothing bounds it any more: no deadline, no memory poll. A child
that sends done or refused and then stays alive keeps the worker's only reader slot forever, and its memory grows
without a limit.

## Blocking

### B1. After a done or refused frame the child has no deadline and no memory bound, and it holds the only reader slot

- **Where:** `packages/contracts/src/evidence/pages.ts`, `runReader`'s `onFrame`. On `FRAME.done` and `FRAME.refused`
  it sets `reply` and calls `stop()`, which clears both the deadline and the poll. The poll also returns early while
  `reply !== undefined`. After that, the promise settles only on `close`. `readInChild` releases the
  `MAX_READERS = 1` slot only after that.
- **Scenario:** a reader that a document has compromised (the threat model ADR 0033's amendment names), or any pdf.js
  or yauzl bug that leaves a handle open after the last write, sends its done or refused frame and then does not
  exit. The old thread code called `worker.terminate()` as soon as the reply arrived.
- **Evidence** (probes1.log: `after-done.mts` with a stand-in that speaks the real frames, `timeoutMs: 1000`, parent
  under `--max-old-space-size=560`):
  - done, then idle: `"outcome":"STILL PENDING after 15 s (deadline was 1 s)"` and `"second":"second read STILL QUEUED after 5 s"`.
  - refused, then idle: the same result.
  - done, then allocating 32 MiB every 20 ms: still pending, `"childPeakRssMiB":1349`. That is more than 5 times the
    256 MiB cap, and more than the whole 1,024 MiB task.
  - So one hostile document stops intake on that worker process for good (every later document waits behind it). It
    can also take the task's cgroup to an OOM kill, which stops every practice's jobs. That is the failure the item
    exists to prevent.
- **Fix:**
  - Treat done or refused as the decision. Kill the child at once (SIGKILL), or keep the deadline and poll armed until
    `close`.
  - Then resolve on `close` with the stored reply, keeping the drain-on-close behaviour the design measured.
  - Add a stand-in test, "done then hang" and "refused then hang": it must settle within the deadline, the child must
    be gone, and a queued second read must run.

## Should

### S1. Neither reply bound is tested; with both removed, one oversized frame crashes the worker process

- **Where:** `pages.ts`: the `received > bound` check on stdout, and `FrameReader`'s `length > this.bound - this.consumed` check.
- **Evidence:**
  - Mutations `replybound-total`, `replybound-frame` and `replybound-both` (bound set to `MAX_SAFE_INTEGER`) all leave
    pages.test.ts 12 of 12 green (mutations.txt). The flood test is caught by the parent's page and character re-check
    instead.
  - Removing the reply bound and the page/character re-check together does go red (the runner aborts with SIGABRT;
    mut-bound-and-pagecap.log). So each guard is covered only by the other.
  - With the bound removed, a stand-in that sends one page frame whose header claims 1 GiB and then streams it crashes
    the parent: an uncaught `ERR_STRING_TOO_LONG` at `pages.ts:410` (bigframe-mutated.log). In production the parent
    is the worker process.
  - As committed, the same stand-in is rejected in 122 ms, with the parent's RSS going from 100 to 104 MiB
    (probes1.log). The code is right; the test doesn't pin it.
- **Fix:** add a stand-in case "one frame past the bound" (and one header whose length passes the bound). Assert a
  PageReadError or refusal, the child gone and the parent's heap unchanged.

### S2. Measured: the task's 1,024 MiB does not hold with the main heap busy and the reader at its worst

- **Evidence:** `peak.mts`, parent `node --max-old-space-size=560 --enable-source-maps`, polling both processes' VmRSS every 1 ms:
  - Child peak RSS: 371 to 387 MiB for the 160 MiB and 1 GiB bombs (5 runs), and 329 to 339 MiB for 1,250 and
    1,500-page PDFs (peak.log). That is below the design's "about 420".
  - Main heap holding 453 MiB of live data (under its 560 flag; RSS 659), plus the 1 GiB bomb: **parent and child
    together peak at 1,041 MiB, more than the task's 1,024** (peak-full.log).
  - The same load on the base thread reader (no flag) peaks at 1,001 MiB for the process, a growth of 330 to 340 MiB
    (peak-base.log). So the child costs about 40 to 50 MiB more at worst than the thread did.
- **Why it matters:** ADR 0033's amended consequence says "one reader at a time, about 420 MiB at worst" and that
  this "must fit the worker task". ADR 0071's guard only checks that the heap is at most 60% of task memory. Nothing
  checks the heap plus the reader, and the weekly real-size test reads a small PDF, not a bomb, so it can't show the
  worst case. This was tight before the change, and the change makes it worse.
- **Fix:** record the measured sum in ADR 0033/0071. Then do one of these:
  - lower the worker's heap flag so that heap + about 100 MiB of native memory + about 390 MiB of reader fits 1,024;
  - lower `maxMemoryBytes` for the child;
  - add a budget assertion: `HEAP_MIB.worker` plus the reader's measured worst, under the task memory.

### S3. Several load-bearing branches survive their mutation (no test notices)

These went green when removed (mutations.txt):

- `READER_BASELINE_MAX_BYTES`: the baseline ceiling, which the design calls the guard against a silently wider bound.
- The `LIVE` exit handler's kill.
- `code === 0` on the success path: a child that sends done and then exits 1, or crashes, is returned as pages, not
  PageReadError.
- The child's own page cap.
- The child's orphan backstop.

**Fix:** add stand-in cases for a baseline over the ceiling (a stand-in that allocates before ready) and for "done then
exit 1". Add one test that the child's own caps refuse when the parent's re-check is lenient.

## Nits

### N1. Page text changed for lone surrogates

UTF-8 framing turns a lone surrogate into U+FFFD, where the thread's structured clone kept it.

- **Evidence:** a SYNTHETIC workbook whose cell holds `&#xD800;` (`decodeXml` gives a lone surrogate):
  - `readPagesHere` in-process ends `d800`, and so does a structured clone of it;
  - through the child it ends `fffd`, with `equal:false` (probes1.log).
- **Why it matters:** "every result keeps its meaning" holds for the result kinds, but the page text of such a document
  differs from the thread's. A quote hash taken on re-read would differ.
- **Fix:** make `decodeXml` map surrogate code points to U+FFFD itself, so the reader is the same in-process and in the
  child. Or record the change in ADR 0033.

### N2. Comments still say "bounded thread"

`apps/worker/src/intake/pages.ts:12`, `packages/contracts/src/evidence/resolve.ts:10`,
`packages/model-gateway/eval/sets.ts:41`, `apps/web/src/lib/contracts/evidence.ts:9` (grep).

### N3. The design's T3 promised a peak-growth assertion

The design says "the child's peak growth stays under 256 MiB plus one poll". The 1 GiB bomb test asserts only the
result and time. I measured it by hand: a peak of 371 to 387 MiB RSS, about 230 to 240 MiB over a ready baseline of
about 145 MiB. It passes today, but no test pins it.

## What holds (checked, with evidence)

- **Heap under the real command:** the reader's `heap_size_limit` is 240 MiB.
  - Bundled: a probe built beside `dist/main.js` (same esbuild format and banner), run as `node
    --max-old-space-size=560 --enable-source-maps`, found `dist/page-reader.js` and reported 240 MiB, against the
    parent's 752. Also 240 with `NODE_OPTIONS=--max-old-space-size=900` set on the parent (bundle-probe.log).
  - `@tp/worker build` emits `dist/page-reader.js` with `import.meta.main` kept (worker-build.log).
- **Result meanings:**
  - The deadline (150 ms, 0, and a silent stand-in), the memory cap, a V8 OOM, the flood and an over-size request all
    give `unsupported_document`.
  - Exit 3, SIGSEGV and a malformed frame give `PageReadError` naming only the code or signal.
  - The scan path is unchanged (it runs after the reply in the parent).
- **Mutations that the tests catch** (mutations.txt):
  - removing the SIGKILL (5 tests red, by timeout);
  - the old-space flag (3, including the infra measurement);
  - the semi-space flag (9);
  - the env allowlist (`process.env`) (1);
  - `--permission` (10);
  - the deadline (1);
  - the memory cap (2);
  - the OOM mapping, removed and widened (1 each);
  - `MAX_READERS = 3` (1).
- **Infra guard:**
  - `PAGE_READER_ISOLATION = 'thread'` turns dev, staging and production red, with the screening container refused.
  - Weakening `refused()` turns the unit cases red.
  - The guard trusts the constant, not the code path. pages.test.ts's "read in a process of its own" assertions are
    what tie the constant to reality.
- **Startup and throughput:**
  - Bundled child, spawn to close for a 2-page PDF under the 560 flag: 255 to 372 ms (18 runs).
  - Source tree: child median 343 to 356 ms, against the base thread's 259 to 267 (startup-compare.log), about 85 ms
    more per document.
  - With intake at one document at a time, the floor is about 3 documents a second per worker task. That is not a
    constraint at intake volumes.
- **Flakiness:** pages.test.ts passed 12 of 12 five times in a row and 4 of 4 times run concurrently under CPU
  contention (flake.log). The timing assertions (deadline/4 for the 1 GiB bomb, a 2 ms process sampler) have wide
  margins here.
