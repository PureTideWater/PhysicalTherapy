# Release capacity: fail (smoke size)

Commit `unknown`, release 900110 (11247 records), the worker at 0.5 vCPU and 1024 MiB running `node --max-old-space-size=560 --enable-source-maps dist/main.js` on CPUs 3; process runtime on 4 CPUs.

Failing checks:

- A price (price) logged no job heap line (concurrent phase)
- B audit report (audit_report) logged no job heap line (concurrent phase)
- C parse 1 (parse_835) logged no job heap line (concurrent phase)
- C parse 2 (parse_835) logged no job heap line (concurrent phase)
- C parse 3 (parse_835) logged no job heap line (concurrent phase)
- C parse 4 (parse_835) logged no job heap line (concurrent phase)
- A triage (triage) logged no job heap line (the chain)
- A audit report (audit_report) logged no job heap line (the chain)
- A reconcile (reconcile) logged no job heap line (A’s reconcile)
- A audit report 2 (audit_report) logged no job heap line (the large jobs together)
- D triage (triage) logged no job heap line (the large jobs together)
- E price (price) logged no job heap line (the large jobs together)
- C parse 5 (parse_835) logged no job heap line (the large jobs together)
- C parse 6 (parse_835) logged no job heap line (the large jobs together)
- C parse 7 (parse_835) logged no job heap line (the large jobs together)
- C parse 8 (parse_835) logged no job heap line (the large jobs together)

| Job | Phase | State | Attempts | Live heap | Time |
| --- | --- | --- | --- | --- | --- |
| B price | setup | completed | 1 | none | 0.7 s |
| B triage | setup | completed | 1 | none | 0.5 s |
| D price | setup | completed | 1 | none | 1.5 s |
| A price | concurrent | completed | 1 | none | 2.7 s |
| B audit report | concurrent | completed | 1 | none | 3.3 s |
| C parse 1 | concurrent | completed | 1 | none | 0.4 s |
| C parse 2 | concurrent | completed | 1 | none | 0.4 s |
| C parse 3 | concurrent | completed | 1 | none | 0.4 s |
| C parse 4 | concurrent | completed | 1 | none | 0.4 s |
| A triage | chain | completed | 1 | none | 0.8 s |
| A audit report | chain | completed | 1 | none | 2.9 s |
| A reconcile | reconcile | completed | 1 | none | 0.0 s |
| A audit report 2 | together | completed | 1 | none | 2.8 s |
| D triage | together | completed | 1 | none | 1.2 s |
| E price | together | completed | 1 | none | 1.4 s |
| C parse 5 | together | completed | 1 | none | 0.7 s |
| C parse 6 | together | completed | 1 | none | 0.7 s |
| C parse 7 | together | completed | 1 | none | 0.7 s |
| C parse 8 | together | completed | 1 | none | 0.7 s |

Run: complete; priced lines 2000 of 2000; parsed claims 400 of 400; A’s posted entries 0 of 0.

Memory: peak 398.8 MiB over the run, of 1024 MiB; 283.3 MiB over the concurrent phase (5 samples), 277.6 MiB over A’s triage (3 samples), 299.3 MiB over A’s audit report (6 samples), 290 MiB over A’s reconcile (4 samples), 382.6 MiB over the large jobs together (6 samples); OOM kills 0, restarts 0.

Advisory locks: at most 1 held by one backend (34 samples), of 64.

Windows query: 41 ms cold, 24 ms warm, 18 contents.

Times (advisory):

- release build: 0.8 s
- migrate: 1.2 s
- release load: 2.7 s
- seed: 3.3 s
- worker start: 2.5 s
- setup: B priced and triaged, D priced: 7.1 s
- concurrent phase: 4.0 s
- A triage: 2.0 s
- A audit report: 5.0 s
- A reconcile: 2.0 s
- large jobs together: 5.0 s
- windows query: 0.1 s
