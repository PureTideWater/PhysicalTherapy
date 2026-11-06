# pages-child-process (`co-001/pages-child-process`): the fix round

Lane A, acting session S3 (https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3). Workflow wf_db697f40-fa2. WIP ref
`co-001/wip-pages-child-process`, cut at base 7fb3e102… (#84); worktree /home/user/pages-child-process. Design:
`designs/lane-a-pages-child-process.md` ("## Fix round" and its repairs). Reviews:
`lane-a-pages-child-process-review-{security,correctness-capacity}.md`, critic `…-wip/progress/critic.md`. Logs: the
session scratchpad's `pcp/logs/fix/` (with `repair1/`, `repair2/`, `K1-1/`…`k1-3/`) and `pcp/logs/suite/`.

Every finding taken in its recommended option (security and PHI the safer), as the skeptics refined it.

## Findings, verdicts and resolutions

| Finding | Severity | Skeptics | Resolution |
| --- | --- | --- | --- |
| Security S1 = correctness B1: after done or refused, the child is untimed, unbounded and holds the reader slot | blocking | 3 of 3 real (each), blocking | Fixed, F1 ed69f919…: deadline and poll until close; 1 s `READER_EXIT_GRACE_MS`, then SIGKILL and `PageReadError`; growth after the reply `unsupported_document`. Hardened in R1 4e675ee8…, Q1 782fb33b…, Q2 515046e5… |
| Critic G1: a crashed reader's core holds the document's text | blocking | critic (verified first: core_pattern `core`, relative; a crashed stand-in wrote test-support/core) | Fixed, F2 eba1bc3e…: `/bin/sh -c 'ulimit -c 0 && unset PWD && exec "$@"'`, cwd `/`, `ulimits core 0/0` on every ECS container; R2 5dcc760b…: `/proc/<pid>/limits` and cwd on every host, V8 OOM crash case, piped core_pattern residual recorded |
| Correctness S1: reply bounds untested; an oversized frame could crash the worker | should | 3 of 3 real | Fixed, F3 a4078dd6…; stdout-total-only mutant equivalent, recorded in the code |
| Correctness S2: 1,024 MiB may not hold with the main heap busy | should | 3 of 3 refuted | Left |
| Correctness S3 + critic G5: surviving mutants (incl. settle on exit) | should | 3 of 3 real | Fixed, F4 5efc739c…: eight killed; two survive, recorded (console silencing alone; settle on exit not reproducible, test kept as guard). R3 6f2ef532…, R4 8809d656… |
| Correctness N1: lone surrogates become U+FFFD | nit | 1 real, 2 refuted | Left (refuted) |
| Correctness N2 + security S4: comments say thread | nit | 3 of 3 real | Fixed, F8 8c6aaf65…, R6 476aa126… |
| Correctness N3: T3 peak-growth assertion missing | nit | 3 of 3 real (one as should) | Fixed, F8 535651b7… (VmHWM; 261 MiB measured, doubled cap 517 fails) |
| Security S2: orphan backstops during synchronous work | nit | 3 of 3 real | Fixed, F8 1a4490fa… (pages.ts, page-reader.ts, ADR 0033) |
| Security S3: module comment omits the network | nit | 3 of 3 real | Fixed, F8 e0829c18… |
| Critic G2: the measurement refuses its own command | should | critic | Fixed, F5 d60105ad… (+ 497f8f8b… lint), R5 9b89f0b9… |
| Critic G3: no test runs dist/page-reader.js | should | critic | Fixed, F6 6acbbd90…, wording corrected |
| Critic G4: ADR 0071 Status line conflicts | should | critic | Fixed, F7 04513eaa…; base merge clean |
| SEC-24 (orchestrator's allocation) | | | F9 7027cddd…, R7 a46473fd…: test matrix row and note, synth matrix and registry `none(1, …)`, five asserting tests, `fixtures/synthetic/SEC-24/expected.json` |

Comment rewraps: d078608f…, 9819838a….

## Check rounds and repairs

| Round | Verifiers | Found | Repair |
| --- | --- | --- | --- |
| 1 at 7027cddd… | K1 security and PHI, K2 correctness and capacity, whole-diff adversary | whole: blocking, the exit grace failed an exited reader on a held loop (14 of 15 reads); K1 + whole: should, the core guard proved only where cores are files; K2: the parent caps and the two baseline checks untested alone; nits (flag order, four comments, SEC-24 wording) | Repair 1, 7 commits to a46473fd… (4e675ee8…, 5dcc760b…, 6f2ef532…, 8809d656…, 9b89f0b9…, 476aa126…, a46473fd…); 63 files, 1,180 passed |
| 2 at a46473fd… | K1, K2, whole | K1 should: no test of the deadline after the last frame; K2 nit: the deadline on a held loop (found a defect: an exited reader refused while its pipes close); nits: held-loop test time, design lacked repair 1 | Repair 2, 3 commits to 6f002b37… (782fb33b…, 515046e5…, 6f002b37…); 53 files, 1,097 passed; pages.test.ts 26/26 twice |
| 3 at 6f002b37… | K1 | resolved, not loosened; 3 nits, all optional (partial frame after done ignored; a pipe held by an outside process; Fargate's acceptance of the core ulimit) | None: recorded as the PR's proposals P1 to P3 |

## The base merge

{{MERGE}}

## The full suite (once, on the merged tree)

{{SUITE}}

## Failing first

| Change | Red | Green |
| --- | --- | --- |
| Build 1af0ca00… | 13 failed: reader heap 608 MiB (expected 240) in pages.test.ts and the infra measurement; the guard (PAGE_READER_ISOLATION undefined) x3; no child for read/bomb/deadline/one-at-a-time; readInChild missing | 25e4e27f…: 39 files, 868 passed |
| F1 ed69f919… | done-hang, refused-hang, done-grow timed out at 60 s (F1-sec-S1-cc-B1-red.log) | green |
| F2 eba1bc3e… | core written by a crashed stand-in; compute.test without the ulimit (F2-G1-red.log, F2-G1-infra-red.log) | green, control dumps |
| F3 a4078dd6… | frame-bound and both-bounds mutants | green |
| F4 5efc739c… | eight surviving mutants | killed |
| F5 d60105ad… | measurement refused heapFlag('worker') | green; 600 red |
| F6 6acbbd90… | yauzl-external mutant green | red |
| F7 04513eaa… | merge-tree conflicts | clean |
| F8 535651b7… | doubled cap 517 MiB | 261 MiB |
| F9 7027cddd… | SEC-24 missing | five tests name it |
| R1 4e675ee8… | "did not exit after its reply" under a 1.2 s hold | 4 × 6 reads |
| R2 5dcc760b… | limits 0/unlimited; cwd the reader's dir | 0/0, `/` |
| R3 6f2ef532…, R4 8809d656… | page/character and each baseline-check mutant | killed |
| R5 9b89f0b9… | flag after --enable-source-maps | either order |
| Q1 782fb33b… | clearTimeout(deadline) at the reply: PageReadError (Q1-red.log) | 25/25 |
| Q2 515046e5… | previous head refused (Q2-red.log); deferral removed red (Q2-red-nodefer.log) | 5 of 5 |
| Q3 6f002b37… | grace-without-deferral mutant red at run 1, 3 of 3 | 7.2 s |

## Push

{{PUSH}}
