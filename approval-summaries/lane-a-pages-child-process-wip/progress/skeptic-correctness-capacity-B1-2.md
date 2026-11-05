# Skeptic 3 of 3, correctness-capacity B1 (done/refused frame leaves the child unbounded)

Target: origin/co-001/wip-pages-child-process at c369bc77... (fresh clone, read only, removed after; node_modules symlinked from the worktree).

## Reproduction (independent stand-in, scratchpad pcp/sk-b1-2/probe.mts; log logs/sk-b1-2/probe.log)
readInChild with timeoutMs 1000, parent NODE_OPTIONS=--max-old-space-size=560, a second read queued behind the first:
- ok: both reads resolve (control).
- done-hang (done frame, then idle with an open interval): first STILL PENDING after 12 s, second STILL QUEUED after 3 s.
- refused-hang (refused frame, then idle): same.
- done-grow (done frame, then Buffer.alloc 64 MiB every 50 ms): pending, queued, child peak RSS 5788 MiB (no cap; the old-space flag does not bound Buffers).
No stand-in left after the parent exited (LIVE kill on exit).

## Code
pages.ts onFrame: FRAME.done / FRAME.refused set reply and call stop() (clears deadline and poll); the poll also returns early once reply is set; nothing kills the child; settle only on close; readInChild frees the MAX_READERS slot only after that.

## Reachability
The real page-reader.ts calls process.exit(0) right after the last frame, so a left-open pdf.js/yauzl handle does not hold it. Reachable by a reader a document compromised (the threat model this item exists for) or a future reader bug. Its orphan timer (deadline + 5 s) can end an idle hang, but not a busy one.

## Verdict
Not refuted. Severity: blocking (breaks the item's own bound: killed and refused on overrun or timeout; regresses the thread code's terminate-on-reply).
Fix: keep the deadline and the memory poll armed after a done or refused frame (drop stop() there and the poll's reply early-return); give a short exit grace after the reply (the remaining deadline, at most 2 s), then SIGKILL and settle as the reader's own failure (PageReadError, or refused if the memory cap fired); resolve the stored reply only on close with code 0. Tests: done-then-hang, refused-then-hang, done-then-grow: each settles within the deadline, the child is gone, a queued second read runs.
