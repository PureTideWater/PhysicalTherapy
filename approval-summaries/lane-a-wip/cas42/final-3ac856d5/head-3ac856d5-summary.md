# Release capacity: pass

Commit `unknown`, release 900110 (4172393 records), the worker at 0.5 vCPU and 1024 MiB running `node --max-old-space-size=560 --enable-source-maps dist/main.js` on CPUs 3; process runtime on 4 CPUs.

Every check passed.

Advisory:

- the windows query took 8383 ms cold, above its 5000 ms budget (advisory)

Known gap: reconcile at full size is SUITE-CAP-3’s tracked item. Step 7b reconciles F, a practice of its own at CAS-42.3’s 2,000 lines (fewer at the smoke size), while A keeps its full month for triage and reports: the reconcile pass’s last measured figure at size is 10,000 lines in 3,412 s, far past a job’s 15-minute attempt. Revisit when SUITE-CAP-3 lands: moving step 7b back to A’s full month is its acceptance step (docs/adr/0083).

| Job | Phase | State | Attempts | Live heap | Time |
| --- | --- | --- | --- | --- | --- |
| B price | setup | completed | 1 | 122 of 560 MiB | 22.6 s |
| B triage | setup | completed | 1 | 90 of 560 MiB | 11.8 s |
| D price | setup | completed | 1 | 138 of 560 MiB | 82.1 s |
| F price | setup | completed | 1 | 110 of 560 MiB | 7.0 s |
| F triage | setup | completed | 1 | 86 of 560 MiB | 2.6 s |
| A price | the concurrent phase | completed | 1 | 239 of 560 MiB | 105.4 s |
| B audit report | the concurrent phase | completed | 1 | 198 of 560 MiB | 36.8 s |
| C parse 1 | the concurrent phase | completed | 1 | 146 of 560 MiB | 6.3 s |
| C parse 2 | the concurrent phase | completed | 1 | 146 of 560 MiB | 6.5 s |
| C parse 3 | the concurrent phase | completed | 1 | 146 of 560 MiB | 6.3 s |
| C parse 4 | the concurrent phase | completed | 1 | 146 of 560 MiB | 7.8 s |
| A triage | the chain | completed | 1 | 210 of 560 MiB | 55.9 s |
| A audit report | the chain | completed | 1 | 209 of 560 MiB | 87.8 s |
| F reprocessing parse 1 | F’s reconcile | completed | 1 | 165 of 560 MiB | 3.0 s |
| F reconcile | F’s reconcile | completed | 1 | 165 of 560 MiB | 730.8 s |
| A audit report 2 | the large jobs together | completed | 1 | 281 of 560 MiB | 132.8 s |
| D triage | the large jobs together | completed | 1 | 281 of 560 MiB | 88.7 s |
| E price | the large jobs together | completed | 1 | 281 of 560 MiB | 101.8 s |
| C parse 5 | the large jobs together | completed | 1 | 205 of 560 MiB | 8.9 s |
| C parse 6 | the large jobs together | completed | 1 | 205 of 560 MiB | 8.9 s |
| C parse 7 | the large jobs together | completed | 1 | 205 of 560 MiB | 8.9 s |
| C parse 8 | the large jobs together | completed | 1 | 205 of 560 MiB | 8.9 s |

Run: complete; priced lines 100000 of 100000; A’s lines actionable after its triage 30795 (30795 of them expected) of 30795 expected, of its 100000 lines; parsed claims 16000 of 16000; F’s lines posted 2000 (2000 in full) of 2000 actionable, of its 2000 lines.

Memory: the 90% line (921.6 MiB of 1024 MiB) judges the worker’s working set (memory.current less inactive_file, sampled each second), the measure the kubelet and cAdvisor evict on: at most 708.2 MiB over the whole run (2393 samples); memory.peak 823.3 MiB over the run, page cache included (reported, not judged); OOM kills 0; memory.events oom not counted (cgroup v1), oom_kill +0 between the worker’s start and the end; restarts 0.

Memory by kind at each period’s working-set peak (memory.stat; reported beside the working set, which the line judges): the page cache counts shared memory, and its inactive part is what the working set leaves out; memory.peak, read at each period’s end, counts the run so far, page cache included.

| Period | Working set | memory.current | Anonymous | Page cache | Inactive page cache | Shared memory | Kernel | memory.peak at its end | Samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| the whole run | 708.2 MiB | 808.4 MiB | 571.2 MiB | 216.8 MiB | 100.2 MiB | 1 MiB | — | 823.3 MiB | 2393 |
| the concurrent phase | 501.9 MiB | 600.3 MiB | 417.4 MiB | 171.8 MiB | 98.4 MiB | 0 MiB | — | 612.9 MiB | 108 |
| A’s triage | 506.6 MiB | 605 MiB | 421.1 MiB | 171.8 MiB | 98.4 MiB | 0 MiB | — | 612.9 MiB | 58 |
| A’s audit report | 584.6 MiB | 704.4 MiB | 495.9 MiB | 193.7 MiB | 119.8 MiB | 0 MiB | — | 752.8 MiB | 91 |
| F’s reconcile | 600.4 MiB | 678.6 MiB | 471.9 MiB | 193.8 MiB | 78.2 MiB | 0 MiB | — | 752.8 MiB | 738 |
| the large jobs together | 651 MiB | 729.2 MiB | 520.9 MiB | 193.8 MiB | 78.2 MiB | 0 MiB | — | 823.3 MiB | 135 |

Advisory locks: at most 22 held by one backend (first during F’s reconcile; 1919 samples), of 64.

Windows query: 8383 ms cold, 9953 ms warm, 18 contents.

Times (advisory):

- release build: 0.0 s
- migrate: 1.5 s
- release load: 588.5 s
- seed: 68.4 s
- worker start: 2.5 s
- setup: B priced and triaged, D priced, F priced and triaged: 134.3 s
- concurrent phase: 107.6 s
- A triage: 57.2 s
- A audit report: 90.2 s
- F reconcile: 737.2 s
- large jobs together: 134.7 s
- windows query: 28.0 s
