# Skeptic 3 of 3, security finding S4 (stale intake comment)

Clone: /home/user/sk-pcp-security-S4-2 at origin/co-001/wip-pages-child-process c369bc77... (read only; removed).

## Reproduction
- apps/worker/src/intake/pages.ts:11-16 still says "read in a bounded thread (@tp/contracts/pages)" and "A thread that fails for its own reasons throws". Not in the branch's diff against 7fb3e102.
- packages/contracts/src/evidence/pages.ts on the branch spawns a child process (spawn(process.execPath, ...), env NO_ENVIRONMENT, PAGE_READER_ISOLATION = 'process'), so the comment is wrong.
- The same stale wording is in two more places the finding missed: apps/worker/src/intake/intake.ts:50 ("read in a bounded thread") and packages/contracts/src/evidence/resolve.ts:10 ("reads a document's bytes in a bounded thread").
- The ADR 0033 file name says "bounded-thread". It is an accepted ADR's title, so leave it as is. The branch's ADR 0071 order note covers the change.

## Verdict
Not refuted. Real, severity nit: comment only, no behaviour or security effect. Fix: reword all three comments, e.g. "read in a child process of its own (@tp/contracts/pages)" and "A reader that fails for its own reasons throws, and the job retries".
