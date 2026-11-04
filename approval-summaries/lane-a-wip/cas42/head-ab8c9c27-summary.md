# Release capacity: pass

Commit `unknown`, release 900110 (4172393 records), the worker at 0.5 vCPU and 1024 MiB running `node --max-old-space-size=560 --enable-source-maps dist/main.js` on CPUs 3; process runtime on 4 CPUs.

Every check passed.

Advisory:

- the windows query took 11061 ms cold, above its 5000 ms budget (advisory)

| Job | Phase | State | Attempts | Live heap | Time |
| --- | --- | --- | --- | --- | --- |
| B price | setup | completed | 1 | 122 of 608 MiB | 22.9 s |
| B triage | setup | completed | 1 | 97 of 608 MiB | 9.2 s |
| D price | setup | completed | 1 | 139 of 608 MiB | 79.9 s |
| A price | concurrent | completed | 1 | 243 of 608 MiB | 87.7 s |
| B audit report | concurrent | completed | 1 | 196 of 608 MiB | 42.2 s |
| C parse 1 | concurrent | completed | 1 | 106 of 608 MiB | 6.5 s |
| C parse 2 | concurrent | completed | 1 | 106 of 608 MiB | 6.6 s |
| C parse 3 | concurrent | completed | 1 | 106 of 608 MiB | 6.8 s |
| C parse 4 | concurrent | completed | 1 | 106 of 608 MiB | 8.3 s |
| A triage | chain | completed | 1 | 207 of 608 MiB | 43.6 s |
| A audit report | chain | completed | 1 | 206 of 608 MiB | 95.4 s |
| A reconcile | reconcile | completed | 1 | 164 of 608 MiB | 0.0 s |
| A audit report 2 | together | completed | 1 | 339 of 608 MiB | 139.6 s |
| D triage | together | completed | 1 | 339 of 608 MiB | 79.9 s |
| E price | together | completed | 1 | 339 of 608 MiB | 102.7 s |
| C parse 5 | together | completed | 1 | 205 of 608 MiB | 8.2 s |
| C parse 6 | together | completed | 1 | 205 of 608 MiB | 6.1 s |
| C parse 7 | together | completed | 1 | 205 of 608 MiB | 6.1 s |
| C parse 8 | together | completed | 1 | 205 of 608 MiB | 6.1 s |

Run: complete; priced lines 100000 of 100000; parsed claims 16000 of 16000; A’s posted entries 0 of 0.

Memory: peak 721.6 MiB over the run, of 1024 MiB; 474 MiB over the concurrent phase (90 samples), 471.4 MiB over A’s triage (46 samples), 569.9 MiB over A’s audit report (98 samples), 521.2 MiB over A’s reconcile (4 samples), 679.4 MiB over the large jobs together (142 samples); OOM kills 0, restarts 0.

Advisory locks: at most 1 held by one backend (1181 samples), of 64.

Windows query: 11061 ms cold, 9263 ms warm, 18 contents.

Times (advisory):

- release build: 0.0 s
- migrate: 1.4 s
- release load: 620.7 s
- seed: 66.0 s
- worker start: 2.5 s
- setup: B priced and triaged, D priced: 117.3 s
- concurrent phase: 89.5 s
- A triage: 45.1 s
- A audit report: 97.2 s
- A reconcile: 2.0 s
- large jobs together: 141.8 s
- windows query: 30.9 s
