# Skeptic 2 of 3, ci-infra N1 (no exact-bound case for notify/handoff's file check)
- Clone /home/user/sk-cft-ci-infra-N1-1 at 1322c7cf... (WIP head, newer than b9a83bd3...), installed offline with the frozen lockfile; removed after.
- The tests: workflows.test.ts has only one over-bound case per job (about 220 bytes against MAX_FILE_BYTES=100, notify and handoff). No case at exactly the bound or one byte past it.
- Baseline: 12 content-calendar cases in workflows.test.ts pass (logs .../scratchpad/cft/logs/skN1-1-base.log).
- W3 (-le changed to -lt at content-calendar.yml:114 and :189): 12/12 pass; all of content-calendar.test.ts plus workflows.test.ts: 177/177 pass (skN1-1-W3-all.log). The mutant survives.
- Probe (temporary, not kept): MAX_FILE_BYTES=100 with a 100-byte list and a 101-byte list, run in notify and in handoff. Under W3 it fails: notify files "Content calendar check failing" for the 100-byte list that findingsJson accepts (skN1-1-probe-W3.log). On the original code it passes (skN1-1-probe-orig.log).
- Verdict: not refuted. This is a gap in test coverage only; the shipped code is right (-le). Severity nit.
- Fix: add the 100/101-byte pair to both jobs' cases (shown below).
