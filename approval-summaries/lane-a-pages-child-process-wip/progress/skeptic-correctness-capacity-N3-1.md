# Skeptic 2 of 3, finding N3 (correctness-capacity review)

- Clone /home/user/sk-pcp-correctness-capacity-N3-1 at c369bc77 (origin/co-001/wip-pages-child-process).
- Read: design T3 (designs/lane-a-pages-child-process.md:275) promises "the child's peak growth stays under 256 MiB plus one poll".
  pages.test.ts:128-135 asserts result, elapsed < timeout/4 and inItsOwnProcess only; watched() samples pids, not memory. No other test asserts growth.
- Next: mutation (disable the growth refusal in pages.ts) and run the bomb test, to show it still passes.
- Reproduced (logs in scratchpad pcp/logs: sk-n3-mutant.log, sk-n3-mutant-poll.log, sk-n3-hwm.txt). Child VmHWM sampled every 2 ms by a local, uncommitted change to watched():
  - unchanged c369bc77: peak 375 / 381 / 379 MiB, test passes.
  - pollMs 25 -> 1000: peak 441 / 516 / 487 MiB, test passes.
  - cap compared to 2 x maxMemoryBytes: peak 628 / 633 MiB (growth about 480 MiB, almost twice the cap), test passes.
  - growth check removed entirely: the bomb is read to `ok: true`, test fails (so only removal is caught, not a loosened cap or slow poll).
- Verdict: real, not refuted. Severity: should (the property this item exists for, a 1,024 MiB task budget, is unpinned; design T3 promised it).
- Fix: in the 1 GiB bomb test, read a small SYNTHETIC PDF first under watched() to take the reader's ready peak, then assert the bomb's child VmHWM minus that is < maxMemoryBytes + 32 MiB (one poll's measured overshoot 18 MiB, plus margin); watched() reads VmHWM from /proc/<pid>/status for each reader pid it sees; skip only that assertion where /proc is absent.
- Clone removed.
