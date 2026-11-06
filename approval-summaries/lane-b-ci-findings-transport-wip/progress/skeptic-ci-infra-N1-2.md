# Skeptic 3/3, ci-infra N1 (no exact-bound case for notify/handoff)
- Clone /home/user/sk-cft-ci-infra-N1-2 at 1322c7cf... (branch head, newer than b9a83bd3...).
- Read: workflows.test.ts has only the over case (MAX_FILE_BYTES=100, ~220-byte file) for notify (1415) and handoff (1503); no 100/101 pair. Workflow lines 114 and 189 use -le.
- Next: run mutation W3 (-le -> -lt) against the content-calendar workflow cases.
- Baseline (content-calendar cases of workflows.test.ts): 12 passed (logs/sk-N1-2-base.log).
- W3 (-le -> -lt at both sites, 2 replacements): 12 passed; whole workflows.test.ts + tools/content-calendar: 177 passed, 0 failed (logs/sk-N1-2-W3-full.log). Mutation survives; reproduced.
- Verdict: real, not refuted. Severity nit (code is correct today; test gap only). Fix: test-only, a 100/101-byte pair at MAX_FILE_BYTES='100' in both the notify and the handoff case.
- Clone removed.
