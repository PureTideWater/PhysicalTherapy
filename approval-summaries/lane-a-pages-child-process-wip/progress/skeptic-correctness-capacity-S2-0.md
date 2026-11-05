# Skeptic 1 of 3, correctness-capacity S2: verdict REFUTED (nit at most)

Clone at origin/co-001/wip-pages-child-process c369bc77..., removed after. Reviewer's peak.mts re-run with an
RssAnon+RssShmem sampler added (SYNTHETIC documents only), parent under --max-old-space-size=560 --enable-source-maps
(heap_size_limit 752 = old 560 + host-sized young). Log: scratchpad/pcp/logs/sk-s2-0-peak.log.

Reproduced: VmRSS sum 1,024 and 1,048 MiB with the main heap at about 455 MiB used and the 1 GiB bomb.
But the VmRSS sum double counts file-backed pages (the node binary, tsx and pdf.js source in page cache) that parent
and child share and the cgroup charges once: child RssFile is about 64 MiB (child RSS 375-392, child anon 310-328).
Anonymous sum at the same load: 901 and 925 MiB; plus one copy of the shared file pages, about 990 MiB, the same as
the base thread reader's 1,001 MiB under the same load (reviewer's peak-base.log). The child's real added cost is
about zero, not 40-50 MiB.

Not introduced by this branch or by the flag: 560 is Node's automatic old-space size at 1,024 MiB today (heap.ts), so
a main heap at 455 MiB plus a reader at its worst is reachable today with the thread. Per reader, the worst measured
(392 MiB RSS) is inside ADR 0033's "about 420 MiB at worst". ADR 0033 Consequences already defers the task-level sum to
milestone 11 ("The intake concurrency times the reader's process bound must fit the worker task (milestone 11 sizes it)").

Optional nit: record in ADR 0033's amendment the measured sum (anon about 925 MiB, about 990 with shared pages, at a
455 MiB main heap) as an input for milestone 11's sizing; no code change and no budget assertion in this branch.

Resumed run (2026-11-05): progress file and log re-checked against origin head c369bc77...; ADR 0033 lines 106-107 still defer the task-level sum to milestone 11. Clone already removed. Verdict unchanged: refuted, nit.
