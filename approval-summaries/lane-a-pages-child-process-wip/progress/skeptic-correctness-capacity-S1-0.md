# Skeptic 1, correctness-capacity S1 (reply bounds untested)
- Clone /home/user/sk-pcp-correctness-capacity-S1-0 at c369bc77 (origin/co-001/wip-pages-child-process), read only.
- Step 1: read pages.ts FrameReader (length > bound - consumed) and stdout (received > bound); tests: flood case is caught by the page/character re-check in onFrame first, so neither bound is the guard any test needs. Next: run mutations + a bigframe stand-in.
- Step 2 (logs in scratchpad pcp/logs/sk-cc-S1-0/): added a stand-in 'bigframe' (page frame header claiming 1 GiB, then 1 GiB of body, then done) and a case asserting PageReadError, child gone, parent RSS < +64 MiB.
  - As committed: the case passes.
  - Bound set to Number.MAX_SAFE_INTEGER (removes both the total and the per-frame check), suite as committed: every stand-in case (exit, segv, malformed, oom, flood, inspect) still green. (6 real-reader cases fail in this clone only: node_modules symlinked from the worktree, outside the reader's allowed paths; same in all three runs, unrelated.)
  - Same mutation with the case: red. Uncaught ERR_STRING_TOO_LONG at pages.ts:410 (in the worker that is a process crash), and worse, the read then RESOLVES { kind: 'pages', pages: [] } because the done frame still parses after the throw: a silent empty document, not a refusal.
- Verdict: NOT refuted. Real test gap; severity should. Clone removed.
- Resumed run (2026-11-05): ref still c369bc77; logs re-read (committed 7 passed incl. stand-ins; mutated suite 6 stand-ins green; mutated + case red). Verdict stands.
