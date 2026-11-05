# Skeptic 2 of 3: correctness-capacity S2 (main heap + reader worst vs 1,024 MiB)
Clone: /home/user/sk-pcp-correctness-capacity-S2-1 at c369bc77… (origin/co-001/wip-pages-child-process), read only; tree clean, removed after.
Status: done. Verdict: REFUTED (severity nit at most).

## Reproduction (in a real 1,024 MiB memory cgroup, no swap)
- The reviewer's peak.mts, pointed at this clone, plus RssAnon per process; each run in a fresh cgroup v1 with memory.limit_in_bytes 1 GiB, parent `node --max-old-space-size=560 --enable-source-maps`, recording memory.max_usage_in_bytes, failcnt and oom_kill. Script and runner: scratchpad pcp/sk-s2-1/ (peak.mts, cg-run.sh). Logs: pcp/logs/sk-s2-1-cg1..cg4.log.
- Inside the 1 GiB cgroup Node sizes the parent's heap_size_limit at 608 MiB (560 old + smaller young), not the 752 MiB the reviewer saw on the unconstrained host.
- 1 GiB bomb, parent used heap 456 / 502 / 538 MiB: cgroup peak 842 / 883 / 899 MiB; refused (unsupported_document); failcnt 0, oom_kill 0. Summed VmRSS 945 / 985 / 1,000 (file-backed pages of the node binary counted twice; the cgroup counts them once).
- 160 MiB bomb at used heap 509 / 539: cgroup peak 900 / 911, refused, no OOM.
- 1,250 pages (read) and 1,500 pages (refused) at used heap up to 437: cgroup peak 757-845, no OOM.
- One step more fill (used heap past about 540 MiB) and the PARENT itself dies of its own V8 heap limit (exit 134, cgroup peak about 600) before the reader matters: the 560 flag caps the main heap first.
- So at the most the main heap can hold, parent plus the reader at its worst peaks about 911 MiB in the cgroup, about 113 MiB under 1,024; never an OOM kill. The finding's 1,041 is summed VmRSS (double-counted shared file pages) of a parent sized for the host, not the task.
- Also: heap.ts states 560 is Node's automatic old-generation size at 1,024 MiB today, so the flag does not enlarge the main heap; the ADR 0033 amendment's "about 420 MiB at worst" holds (child peak 375-397 measured) and its sizing sentence defers the fit to milestone 11.

## Optional (nit)
Record the measured cgroup peak (about 900-910 MiB at the main heap's ceiling, 1 GiB bomb) in the ADR 0033 amendment; no code change.
