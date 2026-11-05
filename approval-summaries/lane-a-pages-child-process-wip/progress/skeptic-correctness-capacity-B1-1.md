# Skeptic 2 of 3, correctness-capacity B1 (done/refused frame disarms deadline and poll)

Clone: /home/user/sk-pcp-correctness-capacity-B1-1 at origin/co-001/wip-pages-child-process c369bc77... (read only; node_modules symlinked from the worktree for the probe; removed after).

## Reproduction
- Code: pages.ts onFrame, FRAME.done and FRAME.refused set `reply` and call stop() (clears deadline and poll); the poll also returns early once reply is set; no kill; settle only on 'close'; readInChild releases the MAX_READERS=1 slot only after settle.
- Probe (scratchpad pcp/skB1-2/probe.mts + hang.mts, log pcp/logs/skB1-2-probe.log): stand-in speaks ready, page, done (or refused document_unreadable), then idles. Parent under --max-old-space-size=560, timeoutMs 1000.
  - done then idle: first read still pending after 8 s; second read still queued.
  - refused then idle: the same.
- Reachability: the real page-reader.ts calls process.exit(0) right after writing done/refused (process.exit ignores open handles, so the "pdf.js or yauzl handle left open" path does not apply). Reachable only by a reader a document compromised, which is the threat this item's process isolation exists for: such a reader can send done first and then run with no deadline and no RSS poll.

## Verdict
Not refuted. Severity: blocking (a hole in the bound the change exists to give; regression from the thread code, which terminated on the reply; single-slot queue makes intake stop for the worker process).
Fix: on a well-formed done/refused, store the reply and SIGKILL the child at once (do not clear the deadline; leave it as the backstop); on close, resolve the stored reply when no verdict was set, whatever the exit code or signal; any frame after the reply still fails. Stand-in tests 'done then hang' and 'refused then hang': settle within the deadline, child gone, a queued second read runs.

## Resumed run (2026-11-05)
Head still c369bc77...; code re-checked at that ref: done/refused branches (pages.ts ~416-421) set reply and call stop() with no kill; close handler resolves the reply only when code === 0, so a fix that SIGKILLs must also change that branch (signal SIGKILL with reply set means resolve the reply). Verdict unchanged: not refuted, blocking. Clone already removed.
