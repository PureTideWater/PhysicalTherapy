# Skeptic 1 of 3, correctness-capacity N3 (done)
Clone at c369bc77... (removed after).
- Design T3 (ops/designs/lane-a-pages-child-process.md:275) promises "the child's peak growth stays under 256 MiB plus one poll"; the 1 GiB test (pages.test.ts:128) asserts only result, time and pid gone. `watched()` samples pids only.
- Mutation `bytes - baseline > limits.maxMemoryBytes * 2` in pages.ts poll: 1 GiB test passes (sk-n3-mut.log). `* 4`: whole src/evidence suite 32/32 green (sk-n3-mut4-all.log). Removing the poll is caught (review mutations.txt memcap), a loosened cap is not.
- Verdict: not refuted, nit. Fix: in watched(), read each reader pid's VmHWM (Linux /proc only) each tick, keep the max; in the 1 GiB test assert peak < READER_BASELINE_MAX_BYTES + maxMemoryBytes + a fixed poll margin (e.g. 64 MiB), skipped where /proc is absent. Mutation `* 2` should go red.
Logs: scratchpad/pcp/logs/sk-n3-*.log
