# Release capacity: fail

Commit `unknown`, release 900110 (4172393 records), the worker at 0.5 vCPU and 1024 MiB running `node --max-old-space-size=560 --enable-source-maps dist/main.js` on CPUs 3; process runtime on 4 CPUs.

Failing checks:

- A price (price) logged no job heap line (concurrent phase)
- B audit report (audit_report) logged no job heap line (concurrent phase)
- C parse 1 (parse_835) logged no job heap line (concurrent phase)
- C parse 2 (parse_835) logged no job heap line (concurrent phase)
- C parse 3 (parse_835) logged no job heap line (concurrent phase)
- C parse 4 (parse_835) logged no job heap line (concurrent phase)
- A triage (triage) ended failed, not completed (the chain)
- A audit report (audit_report) ended failed, not completed (the chain)
- A reconcile (reconcile) logged no job heap line (A’s reconcile)
- A audit report 2 (audit_report) ended failed, not completed (the large jobs together)
- D triage (triage) ended failed, not completed (the large jobs together)
- E price (price) logged no job heap line (the large jobs together)
- C parse 5 (parse_835) logged no job heap line (the large jobs together)
- C parse 6 (parse_835) logged no job heap line (the large jobs together)
- C parse 7 (parse_835) logged no job heap line (the large jobs together)
- C parse 8 (parse_835) logged no job heap line (the large jobs together)
- a backend held 13703 advisory locks at once, above 64 (a lock per line or per row is back)
- the worker logged JOB_FAILED 4 times

Advisory:

- the windows query took 10407 ms cold, above its 5000 ms budget (advisory)

| Job | Phase | State | Attempts | Live heap | Time |
| --- | --- | --- | --- | --- | --- |
| B price | setup | completed | 1 | none | 22.6 s |
| B triage | setup | completed | 1 | none | 10.0 s |
| D price | setup | completed | 1 | none | 87.7 s |
| A price | concurrent | completed | 1 | none | 102.2 s |
| B audit report | concurrent | completed | 1 | none | 49.0 s |
| C parse 1 | concurrent | completed | 1 | none | 9.3 s |
| C parse 2 | concurrent | completed | 1 | none | 7.1 s |
| C parse 3 | concurrent | completed | 1 | none | 7.1 s |
| C parse 4 | concurrent | completed | 1 | none | 7.1 s |
| A triage | chain | failed | 3 | none | 39.1 s |
| A audit report | chain | failed | 3 | none | 38.1 s |
| A reconcile | reconcile | completed | 1 | none | 0.1 s |
| A audit report 2 | together | failed | 3 | none | 41.3 s |
| D triage | together | failed | 3 | none | 41.1 s |
| E price | together | completed | 1 | none | 110.1 s |
| C parse 5 | together | completed | 1 | none | 6.1 s |
| C parse 6 | together | completed | 1 | none | 9.6 s |
| C parse 7 | together | completed | 1 | none | 9.6 s |
| C parse 8 | together | completed | 1 | none | 6.1 s |

Run: complete; priced lines 100000 of 100000; parsed claims 16000 of 16000; A’s posted entries 0 of 0.

Memory: peak 744.8 MiB over the run, of 1024 MiB; 596.6 MiB over the concurrent phase (105 samples), 599.8 MiB over A’s triage (291 samples), 599.8 MiB over A’s audit report (257 samples), 599.5 MiB over A’s reconcile (4 samples), 731.3 MiB over the large jobs together (333 samples); OOM kills 0, restarts 0.

Advisory locks: at most 13703 held by one backend (1785 samples), of 64.

Windows query: 10407 ms cold, 10193 ms warm, 18 contents.

Times (advisory):

- release build: 0.0 s
- migrate: 1.4 s
- release load: 605.3 s
- seed: 65.8 s
- worker start: 3.0 s
- setup: B priced and triaged, D priced: 126.3 s
- concurrent phase: 104.6 s
- A triage: 290.6 s
- A audit report: 256.5 s
- A reconcile: 2.0 s
- large jobs together: 333.8 s
- windows query: 31.1 s
