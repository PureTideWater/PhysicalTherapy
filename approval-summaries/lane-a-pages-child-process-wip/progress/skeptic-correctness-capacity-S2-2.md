# Skeptic 3 of 3, correctness-capacity S2: verdict REFUTED (nit at most)

Clone /home/user/sk-pcp-correctness-capacity-S2-2 at c369bc77… (origin/co-001/wip-pages-child-process), read only,
removed after. SYNTHETIC documents only (deflateBombPdf, syntheticPdf). Probe: skeptic 2's peak.mts pointed at my clone,
each run inside a fresh cgroup-v1 memory group with limit 1,024 MiB and no swap, the parent under
`--max-old-space-size=560 --enable-source-maps`, run from a private copy of the node binary evicted from page cache
before each run, so the binary's mapped pages are charged to the test group as they would be in the task.
Logs: scratchpad/pcp/logs/sk-s2-2-cg1.log, sk-s2-2-cg2.log.

| main used heap | document | result | cgroup max usage | failcnt / oom_kill |
|---|---|---|---|---|
| 12 MiB | 1 GiB bomb | unsupported_document | 434 MiB | 0 / 0 |
| 466 MiB | 1 GiB bomb | unsupported_document | 895 MiB | 0 / 0 |
| 498 MiB | 1 GiB bomb | unsupported_document | 918 MiB | 0 / 0 |
| 537 MiB | 160 MiB bomb | unsupported_document | 960 MiB | 0 / 0 |
| 536 MiB | 1 GiB bomb | unsupported_document | 961 MiB | 0 / 0 |
| fill 990 | (none) | parent's own JS heap OOM before the read | 653 MiB | 0 / 0 |

Why the reviewer's 1,041 is not the cgroup's number: (1) it sums VmRSS, double counting file pages parent and child
share (skeptic 1); (2) the reviewer's parent ran outside a 1 GiB cgroup, so V8 sized the young generation from host
memory (heap_size_limit 752); inside a 1,024 MiB group, as on the task, it is 608, so the main thread's RSS at the
same used heap is lower. Under real accounting the worst is 961 MiB with the main heap at its own ceiling (one step more
and the main thread dies of its own flag, reader or not), about 63 MiB under the limit; at the scenario's ~450 MiB
main heap, about 890 MiB. No run touched the limit (failcnt 0), every hostile document was refused.

Not introduced by this branch: 560 is Node's automatic old space at 1,024 MiB today, so the thread reader had the
same sum (reviewer's peak-base.log, 1,001 VmRSS); ADR 0033 Consequences already defers the task-level sum to milestone 11.

Severity: nit. Optional: record the measured cgroup peak (about 960 MiB at a 536 MiB main heap, one reader, 1,024 MiB
task) in ADR 0033's amendment as milestone 11's sizing input, noting the headroom is thin (about 60 MiB) when the main
heap is at its ceiling and excludes the real worker's other native memory (pg pool, sockets). No code change, no
lowering of the flag or maxMemoryBytes in this branch.
