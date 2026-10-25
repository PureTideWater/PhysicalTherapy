## Screening capacity: fail (time advisory)

Commit `unknown`, process runtime, runner 4 CPUs and 16091 MiB (Intel(R) Xeon(R) Processor @ 2.10GHz), load average 2.95 2.68 2.14. Screening consumer: 1 task of 2 vCPU and 4096 MiB, 3 screenings at once each. Images: web `none (process runtime)`, worker `none (process runtime)`. Release 900100 (2247791 records; ZIP9: 2546 records of 40 ranges, 101840 lines and 7.9 MiB a year).

Layout: shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the screening consumer, the web and the platform share CPU 3); the harness ran on CPUs 0-1.

Screening mail: every upload's address checks answered after 2.0 s, inside its time to email (G1); the screening stream was seeded sending and ready, and 0 run lines waited on the mail gate.

Measured outside GitHub Actions (no GITHUB_WORKFLOW_REF).

Time mode: advisory. The time verdicts are warnings on this run and do not fail it (a pull request's, the build branch's or the weekly run; the founder's ruling of 2026-10-23, time advisory). A release's capacity run is binding, and production's screening opens only on its pass (decision 13).

| Upload | Shape | Rows | Seconds to email | Logged (TimeToEmailMs) | Tier | Shared load | Keyed read (records) | Pricing | Recording | Queue wait | Job queued, started | Time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1-1 | worst | 50000 | 27.5 | 27.4 | normal | 0.0 | 2.3 (150423) | 14.9 | 3.8 | 5.7 | 8.9, 8.9 | pass |
| S1-2 | small | 25 | 2.6 | 2.5 | normal | 0.0 | 0.0 (49) | 0.0 | 0.0 | 2.5 | 11.3, 11.3 | pass |
| S4#1 S4-1 | worst | 50000 | 34.1 | 33.8 | normal | 0.0 | 2.6 (119063) | 18.5 | 4.2 | 7.3 | 12.4, 12.4 | pass |
| S4#1 S4-2 | worst | 50000 | 32.8 | 32.5 | normal | 0.1 | 2.6 (119063) | 17.5 | 4.0 | 7.5 | 12.5, 12.5 | pass |
| S4#1 S4-3 | worst | 50000 | 31.4 | 31.1 | normal | 0.0 | 2.1 (119063) | 18.7 | 4.2 | 5.8 | 10.8, 10.9 | pass |
| S4#1 S4-4 | small | 25 | 23.5 | 23.4 | normal | 0.0 | 0.0 (47) | 0.0 | 0.0 | 23.5 | 15.5, 36.6 | pass |
| S4#2 S4-1 | worst | 50000 | 33.3 | 32.6 | normal | 0.0 | 2.4 (119063) | 18.2 | 4.1 | 7.7 | 13.0, 13.0 | not judged (S4#1 is the middle run) |
| S4#2 S4-2 | worst | 50000 | 29.4 | 29.3 | normal | 0.1 | 2.2 (119063) | 16.4 | 4.3 | 5.8 | 11.1, 11.1 | not judged (S4#1 is the middle run) |
| S4#2 S4-3 | worst | 50000 | 32.6 | 31.9 | normal | 0.0 | 2.2 (119063) | 18.5 | 4.1 | 6.8 | 12.1, 12.1 | not judged (S4#1 is the middle run) |
| S4#2 S4-4 | small | 25 | 21.1 | 21.1 | normal | 0.0 | 0.0 (47) | 0.0 | 0.0 | 21.1 | 16.1, 34.8 | not judged (S4#1 is the middle run) |
| S4#3 S4-1 | worst | 50000 | 36.8 | 36.1 | normal | 0.1 | 2.4 (119063) | 21.3 | 4.3 | 7.8 | 13.1, 13.1 | not judged (S4#1 is the middle run) |
| S4#3 S4-2 | worst | 50000 | 33.6 | 33.5 | normal | 0.0 | 2.2 (119063) | 19.9 | 4.5 | 6.1 | 11.3, 11.3 | not judged (S4#1 is the middle run) |
| S4#3 S4-3 | worst | 50000 | 34.1 | 33.5 | normal | 0.0 | 2.4 (119063) | 19.3 | 4.2 | 7.0 | 12.2, 12.2 | not judged (S4#1 is the middle run) |
| S4#3 S4-4 | small | 25 | 25.3 | 25.3 | normal | 0.0 | 0.0 (47) | 0.0 | 0.0 | 25.3 | 16.1, 38.9 | not judged (S4#1 is the middle run) |

S4 ran three times (the founder's ruling of 2026-10-23): S4#1 34.1, 32.8, 31.4 and 23.5 s; S4#2 33.3, 29.4, 32.6 and 21.1 s; S4#3 36.8, 33.6, 34.1 and 25.3 s. Ordered by each run's worst upload, the small one included, the middle run is S4#1 (34.1 s): its four uploads are judged against the 48-s line and the 44-s question, and every other check holds in all three runs.

| Scenario | Container | Anonymous peak (MiB) | Limit (MiB) | memory.peak (MiB) | Limit reached | OOM kills | Throttled periods |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | web | 246.2 | 1024 | 261.1 | 0 | 0 | 78 of 202 |
| S1 | platform | 91.3 | 512 | 94.1 | 0 | 0 | 43 of 214 |
| S1 | screening-1 | 711.9 | 4096 | 733.2 | 0 | 0 | 0 of 272 |
| S4#1 | web | 326.1 | 1024 | 342.8 | 0 | 0 | 98 of 279 |
| S4#1 | platform | 91.4 | 512 | 94.1 | 0 | 0 | 41 of 256 |
| S4#1 | screening-1 | 1000.1 | 4096 | 1032.2 | 0 | 0 | 3 of 365 |
| S4#2 | web | 311.4 | 1024 | 327.5 | 0 | 0 | 103 of 286 |
| S4#2 | platform | 91.7 | 512 | 94.4 | 0 | 0 | 42 of 268 |
| S4#2 | screening-1 | 978.9 | 4096 | 1007.5 | 0 | 0 | 5 of 360 |
| S4#3 | web | 313.2 | 1024 | 329.2 | 0 | 0 | 107 of 301 |
| S4#3 | platform | 91.5 | 512 | 94.1 | 0 | 0 | 43 of 284 |
| S4#3 | screening-1 | 1150.3 | 4096 | 1184.7 | 0 | 0 | 9 of 411 |

Failing checks:
- partial run: measured S1, S4#1, S4#2, S4#3; a verdict needs S1, S2, S3, S4#1, S4#2, S4#3, S5 (asked for S1, S4)
- limit not applied: postgres: CPU quota none, not 2000000000
- limit not applied: postgres: memory null and memory with swap null, not both 4294967296
- limit not applied: postgres: cpuset null, not 0-1
- limit not applied: postgres: io.max not set, not 3000 IOPS and 131072000 bytes a second each way
- limit not applied: postgres: median round trip 0.15 ms, under 2 ms
- cold start not applied: S1 (Postgres restarted: no, page cache dropped: no)
- cold start not applied: S4#1 (Postgres restarted: no, page cache dropped: no)
- cold start not applied: S4#2 (Postgres restarted: no, page cache dropped: no)
- cold start not applied: S4#3 (Postgres restarted: no, page cache dropped: no)
- oracle not compared: S2-1
- oracle not compared: S3-1
