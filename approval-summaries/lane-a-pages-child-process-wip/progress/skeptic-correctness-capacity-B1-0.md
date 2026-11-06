# Skeptic 1 of 3: correctness-capacity B1 (done/refused leaves the child unbounded and the slot held)

Ref: origin/co-001/wip-pages-child-process at c369bc77... (fresh clone, read only, removed after; modules linked from the main checkout).

## Reproduction (logs: scratchpad pcp/logs/sk-b1-0-probe.log)
A stand-in (.mjs, speaks the real frames) sends ready, reads the request, sends done (or refused), then idles or allocates
16 MiB Buffers every 100 ms. readInChild with timeoutMs 1000, parent under --max-old-space-size=560; a second read queued.
- done then idle: first STILL PENDING after 6 s (deadline 1 s); second STILL PENDING (queued behind MAX_READERS=1).
- refused then idle: the same.
- done then allocating: the same; child RSS 4,675,076 KiB (~4.5 GiB) after ~6 s; its --max-old-space-size=192 does not
  bound Buffers (off-heap), and the parent's RSS poll returns early once `reply` is set.

## Code
pages.ts onFrame: FRAME.done / FRAME.refused set `reply` and call stop() (clears deadline and poll); the poll skips when
`reply !== undefined`; settlement only on 'close'. page-reader.ts's own backstops (orphan interval, deadline+grace
timeout) live inside the child and are unref'd and in-process, so a compromised child defeats them.

## Not reachable by the honest reader
page-reader.ts calls process.exit(0) right after the last frame; open pdf.js/yauzl handles do not keep it alive. So the
"handle left open" variant is not real; the "compromised reader" variant is, and it is exactly the threat the child
process exists for.

## Verdict
Not refuted. Severity: blocking (one hostile document halts intake on that worker for good and can OOM the task's cgroup).
Fix: on a valid done/refused frame, keep the reply and SIGKILL the child at once (do not wait for it to exit by itself),
leave the deadline armed until 'close'; on close resolve with the stored reply regardless of the SIGKILL signal (a
`replied` flag rather than requiring code 0). Tests via a stand-in: done-then-hang, refused-then-hang, done-then-allocate:
each settles within the deadline with its reply, the pid is gone, and a queued second read runs.

## Resumed run (2026-11-05)
Re-checked origin/co-001/wip-pages-child-process, still c369bc77...: pages.ts L416-421 (done/refused set `reply`, stop()),
L343 (poll skips once `reply` is set), L464 (`reply` honoured only on close with code 0). The probe log still shows all three
cases pending past the deadline with the second read queued. Clone already removed. Verdict unchanged: not refuted, blocking.
