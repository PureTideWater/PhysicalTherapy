# Skeptic 3/3, correctness-capacity S1 (reply bound untested)
- Clone /home/user/sk-pcp-correctness-capacity-S1-2 at c369bc77 (origin/co-001/wip-pages-child-process).
- Read: only the 'flood' stand-in (1000-char pages, maxPages 5, maxTextCharacters 3000) touches the bound; the page/character re-check in onFrame also refuses it, so the bound is not uniquely covered. No stand-in sends a header with a large length.
- Next: pnpm install in clone, mutate bound, run pages.test.ts, add bigframe probe.
- Added (clone only) a 'bigframe' stand-in: one page header claiming 1 GiB, then 1 MiB chunks; plus a scratch test.
- As committed: pages.test.ts + scratch 13/13 green; bigframe rejected with PageReadError (malformed reply).
- Mutation bound = Number.MAX_SAFE_INTEGER (both guards): pages.test.ts 12/12 green (mutant survives); bigframe crashes the parent with unhandled ERR_STRING_TOO_LONG at pages.ts:410 (body.toString in onFrame), from the stdout data handler, i.e. an uncaught exception that would take down the worker process.
- Logs: /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp/logs/sk-s1-2-*.log. Clone removed.
- VERDICT: not refuted; severity should. Fix: bigframe stand-in case end to end (PageReadError, reader gone) plus a direct FrameReader unit case (header length bound+1 -> onMalformed, push false, no body allocated), since Buffer.allocUnsafe is off-heap and a heapUsed assertion would not catch a frame-only widening.
