# Skeptic 3 of 3, correctness-capacity N3
- Clone /home/user/sk-pcp-correctness-capacity-N3-2 at c369bc77... Static: design T3 (designs/lane-a-pages-child-process.md:275) promises peak growth < 256 MiB + one poll; pages.test.ts:128-135 asserts result, time, inItsOwnProcess; watched() samples pids only. Confirmed.
- Next: mutation `> limits.maxMemoryBytes * 2` at pages.ts:356, run the 1 GiB test.
- Mutation `bytes - baseline > limits.maxMemoryBytes * 2` (pages.ts:356): `vitest run src/evidence/pages.test.ts -t "1 GiB"` passes, 1 passed (logs/sk-n3-2-mut.log). The 1 GiB test does not bound growth.
- Verdict: not refuted, nit (latent test gap; the cap itself works, measured peak ~230-240 MiB growth). Fix: watched() keeps max VmHWM per reader pid from /proc/<pid>/status (Linux only, skip otherwise); 1 GiB test asserts peak - baseline < maxMemoryBytes + a fixed poll margin; the `* 2` mutation must go red.
- Clone removed. Done.
