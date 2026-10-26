# Release capacity: fail

Commit `unknown`, release 900110 (4172393 records), the worker at 0.5 vCPU and 1024 MiB running `node --max-old-space-size=560 --enable-source-maps dist/main.js` on CPUs 3; process runtime on 4 CPUs.

Failing checks:

- A triage (triage) ended failed, not completed
- A audit report (audit_report) ended failed, not completed
- the worker logged JOB_FAILED 2 times

Advisory:

- the windows query took 10125 ms cold, above its 5000 ms budget (advisory)

| Job | Phase | State | Time |
| --- | --- | --- | --- |
| B price | setup or chain | completed | 25.0 s |
| B triage | setup or chain | completed | 10.4 s |
| A price | concurrent | completed | 111.1 s |
| B audit report | concurrent | completed | 103.2 s |
| C parse 1 | concurrent | completed | 9.7 s |
| C parse 2 | concurrent | completed | 9.8 s |
| C parse 3 | concurrent | completed | 9.8 s |
| C parse 4 | concurrent | completed | 10.3 s |
| A triage | setup or chain | failed | 48.1 s |
| A audit report | setup or chain | failed | 47.2 s |

Run: complete; priced lines 100000 of 100000; parsed claims 8000 of 8000.

Memory: peak 803.9 MiB over the run, 556.7 MiB over the concurrent phase (112 samples), of 1024 MiB; OOM kills 0, restarts 0.

Windows query: 10125 ms cold, 10888 ms warm, 18 contents.

Times (advisory):

- release build: 0.0 s
- migrate: 1.6 s
- release load: 691.3 s
- seed: 27.0 s
- worker start: 2.5 s
- setup: B priced and triaged: 39.1 s
- concurrent phase: 112.6 s
- A triage: 265.5 s
- A audit report: 309.7 s
- windows query: 32.4 s
