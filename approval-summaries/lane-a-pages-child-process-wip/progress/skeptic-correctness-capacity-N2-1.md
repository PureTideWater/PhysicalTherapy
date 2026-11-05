# Skeptic 2 of 3: correctness-capacity N2 (comments still say "bounded thread")

Clone /home/user/sk-pcp-correctness-capacity-N2-1 at origin/co-001/wip-pages-child-process c369bc77... (removed after).

## Reproduction
- packages/contracts/src/evidence/pages.ts now spawns a child process (spawn(process.execPath, ...), env NO_ENVIRONMENT); no page-thread.
- `grep -rn 'bounded thread'` (excluding node_modules, .git) still hits:
  - apps/worker/src/intake/pages.ts:12, packages/contracts/src/evidence/resolve.ts:10,
    packages/model-gateway/eval/sets.ts:41, apps/web/src/lib/contracts/evidence.ts:9 (the four named)
  - apps/worker/src/intake/intake.ts:50 (missed by the finding)
  - packages/db/migrations/20261017120000_document_page_text.sql:8 (applied migration: must not be edited)
  - docs/adr/0051:51 (accepted ADR prose) and ADR 0033's title/filename (historical; 0033 already carries the 2026-11-05 amendment)
- None of these files changed on the branch since 7fb3e102.

## Verdict
Not refuted. Severity nit (comments only; no behaviour). Fix: in the four named files plus apps/worker/src/intake/intake.ts:50,
say "in a child process of its own (docs/adr/0033)"; leave the applied migration, ADR 0033's title/filename and accepted ADR 0051's
text alone (optionally a dated note in 0051 is not needed since 0033's amendment is the record).

## Rerun (resumed)
Re-cloned at c369bc77..., re-ran the grep: same hits, plus packages/model-gateway/eval/sets.ts:290 ("each in its own bounded
reading thread"), which the fix should also cover. Verdict unchanged: not refuted, nit. Clone removed.
