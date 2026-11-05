# Skeptic 1 of 3: correctness-capacity N2 ("Comments still say 'bounded thread'")

Clone: /home/user/sk-pcp-correctness-capacity-N2-0 at origin/co-001/wip-pages-child-process c369bc77... (read only; removed after).

## Reproduction
`grep -rn 'bounded thread'` (excluding node_modules/.git) lists the four cited lines, none touched by the branch:
- apps/worker/src/intake/pages.ts:12
- packages/contracts/src/evidence/resolve.ts:10
- packages/model-gateway/eval/sets.ts:41
- apps/web/src/lib/contracts/evidence.ts:9
Also stale and not in the finding:
- apps/worker/src/intake/intake.ts:50 ("read in a bounded thread")
- apps/web/src/lib/routes/test-support/contract-world.ts:40 ("the reader's worker thread")
- packages/contracts/src/evidence/pages.ts:149 ("the thread's stack"; 115 reads as the old thread's 4 MiB, should say so)
Not to edit: packages/db/migrations/20261017120000_document_page_text.sql:8 (applied migration; CLAUDE.md), the ADR 0033
filename/title (accepted ADR; amended in body), ADR 0051:51 (accepted ADR; at most a dated amendment note, optional).

## Verdict
Real, not refuted. Severity: nit (comments only; behaviour unchanged).
Fix: in the six code comments, say "in a child process of its own (docs/adr/0033)"; pages.ts:115/149 say
"the old worker thread's 4 MiB stack". Leave the applied migration and accepted ADR titles alone.

## Re-check (resumed run, 2026-11-05)
Head still c369bc77...; `git grep` on it confirms the same lines. The apps/worker/src/screening/* and jobs/screening.ts
"worker thread" comments are about the screening consumer (ADR 0062), still true, and not to change.
Verdict unchanged: real, nit.
