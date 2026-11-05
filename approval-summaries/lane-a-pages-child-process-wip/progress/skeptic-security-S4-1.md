# Skeptic 2 of 3, security finding S4 (stale "bounded thread" comment in intake)

Clone: /home/user/sk-pcp-security-S4-1 at origin/co-001/wip-pages-child-process (c369bc77…), read only; removed after.

## Reproduction
- apps/worker/src/intake/pages.ts:11-16 still says "read in a bounded thread (@tp/contracts/pages)" and "A thread that fails for its own reasons throws".
- packages/contracts/src/evidence/pages.ts now spawns a child process (spawn(process.execPath, ...), env NO_ENVIRONMENT); its header says "read in a child process of its own (page-reader.ts)".
- `git diff --stat 7fb3e102 HEAD -- apps/worker/src/intake/` is empty: neither intake file was touched.
- Also stale, not named in the finding: apps/worker/src/intake/intake.ts:50 "read in a bounded thread and sealed beside it".

## Verdict
Not refuted. Real, documentation only: no behaviour, no PHI path, no isolation weakness. Severity nit.

## Fix
pages.ts:11-16: "The document is read in a child process of its own (@tp/contracts/pages), under its own heap limit and deadline, ..." and "A reader that fails for its own reasons (PageReadError) throws, and the job retries."
intake.ts:50: "read in a child process of its own and sealed beside it ...". Comment-only; no test change.
