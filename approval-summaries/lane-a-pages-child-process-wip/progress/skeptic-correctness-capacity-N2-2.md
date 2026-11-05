# Skeptic 3/3, correctness-capacity N2 ("bounded thread" comments)
Clone at origin/co-001/wip-pages-child-process c369bc77..., read only, removed after.
Reproduced: `grep -rn 'bounded thread'` lists the four cited lines, and pages.ts now spawns a child process (spawn(process.execPath, ...)), so they are stale.
Also stale and missed by the finding: apps/worker/src/intake/intake.ts:50 ("read in a bounded thread") and packages/model-gateway/eval/sets.ts:290 ("its own bounded reading thread").
Leave alone: packages/db/migrations/20261017120000_document_page_text.sql:8 (an applied migration, never edited by hand); ADR 0033/0028/0051 titles and filenames (history; 0033's amendment already says a child process).
Verdict: not refuted, severity nit. Fix: reword all six comments to "in a child process of its own (docs/adr/0033)". Comments only, no behaviour change.
