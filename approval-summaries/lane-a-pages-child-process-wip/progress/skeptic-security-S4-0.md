# Skeptic 1 of 3, finding S4 (security review, pages-child-process)

Clone /home/user/sk-pcp-security-S4-0 at origin/co-001/wip-pages-child-process (c369bc77…), read only, removed after.

Reproduction: apps/worker/src/intake/pages.ts lines 11-16 still say "read in a bounded thread (@tp/contracts/pages)" and
"A thread that fails for its own reasons throws"; the file is not in the diff stat from 7fb3e102…. packages/contracts/src/evidence/pages.ts
now spawns a child process (page-reader.ts), so the comment is stale. Same stale wording also at
apps/worker/src/intake/intake.ts:50, apps/web/src/lib/contracts/evidence.ts:9, packages/contracts/src/evidence/resolve.ts:10,
packages/model-gateway/eval/sets.ts:41. Comment-only; no behaviour or isolation effect.

Verdict: not refuted. Severity nit. Fix: reword all five comments ("read in a child process of its own (@tp/contracts/pages)";
"A reader that fails for its own reasons throws"), and a grep in the same commit for "bounded thread"/"thread that fails".
