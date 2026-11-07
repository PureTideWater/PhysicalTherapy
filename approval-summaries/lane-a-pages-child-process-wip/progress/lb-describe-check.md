# pages-child-process: PR description checker (lb-describe-check)

Started 2026-11-06 (Lane B subagent). Checks /tmp/claude-0/-home-user-PhysicalTherapy/88c94db6-fc7b-5c57-a2b7-5dda4f5b392f/scratchpad/pcp/pr-body.md (34,289 bytes at start) against origin/claude/build-platform...origin/co-001/wip-pages-child-process (43a81626), the template, progress files, reviews, design. Read-only on the repo.

## Claims checked
- Head/base/commits: base cc3dd7f6, head 43a81626 (= origin wip), merge base cc3dd7f6; 37 commits = 35 non-merge + 2 merges (28cde98d #125, 7ce6c8b5 #128). OK.
- Files: 39 changed, +1,948/-137 (git diff --shortstat). No migration/lockfile/workflow in the diff. OK.
- Template: every section present, in order (What changes, Why, What it does not change with its 6 lines, Checks with required-checks line and table, Reviewer agents' findings table, Freeze exception, Domain model, The founder's approval verbatim). OK.
- Every commit hash quoted (26) exists on the head with the subject the text says. OK.
- Measurements (240/608/384 MiB, 752, 1,500 pages, 985 of 1,000, 139-146, 224, 2,357, ~267, 226-261 ms, 60 ms, 2.1 s, 15-16 vs 18 MiB, 300 ms, 3920, Node v24.22.0): design + ADR 0033 + build.md. OK.
- Code claims (env {}, cwd /, shell script, flags, MAX_READERS 1, READER_EXIT_GRACE_MS 1,000, 224 MiB baseline, 1 KiB stderr tail, ps 100 ms, PAGE_READ_LIMITS values, PAGE_READER_ISOLATION, guard flag list, withHeapFlag move + re-export, ulimits core 0/0 on every container and test): pages.ts, heap.test.ts, heap.ts, compute.ts at head. OK.
- Checks table and mutation table/gate: every count = lb-suite.md. OK.
- SEC-24 asserted in 5 test files by name (bundle, compute, heap, evidence, pages). OK.
- No model identifier; 34,289 chars < 60,000; ending lines exact. OK.

## Errors found (to fix in the description)
1. WRONG "evidence.test.ts: the 20 existing cases are unchanged apart from the import rename": diff also rewords two titles (thread -> process) and adds a SEC-24 assertion (CSV past the char cap refused by the reader).
2. WRONG "Earlier run. A full suite at 28cde98d ... also passed": status RESUME-BLOCK / fix-integrate.md say it stopped part-way (no build, stamp, e2e, mutation, gate, actions/toolchain checks).
3. OVERSTATED "It is live in the weekly real-size test": design's F6 correction and critic: the weekly run reads its SYNTHETIC PDF in the harness's own process (scenario.ts mapPlans from run.ts), not in the worker that runs under heapFlag('worker').
4. WRONG date "found by ... (#119) on 2026-11-05": status says decided 2026-11-04 23:58 UTC from that sweep (#119 merged 2026-11-05).
5. WRONG label "Fixed in 5dcc760b (the security G1 row above)": G1 is the critic's row.
6. IMPRECISE "5.2 GB measured": review-security.md: RSS 5,220,292 kB at 8 s = 4.98 GiB.
7. IMPRECISE "5efc739c ... killed eight mutants": fix-build F4: of the ten, eight now fail, one of them (any SIGABRT refused) already by eba1bc3e's core test.
8. MISPLACED "(with the money-lint fix 497f8f8b)" on critic G2: 497f8f8b fixes the F3/F4 stand-ins and tests (fix-build F5b), not G2's.
9. MISSING rows: fix check round 2 (whole) nits Q4 (design lacked repair 1: ops file updated, no commit) and Q5 (bomb peak flake watch: no change, the message prints both peaks).

## Fixes applied (description file only)
All 9 errors above fixed in place in pr-body.md (one python replace each, each matched exactly once). Size now 35,302 characters (< 60,000); ending lines unchanged and exact; no model identifier. Repo untouched (read only); no commit, no push.

## DONE 2026-11-06.
