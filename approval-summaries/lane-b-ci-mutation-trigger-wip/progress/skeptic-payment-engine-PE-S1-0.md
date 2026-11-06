# Skeptic 1 for PE-S1 (#96 payment-engine review)
Status: done. Verdict: not refuted; severity should (conditional on #84 merging into claude/build-platform before #96).

## Reproduction (fresh clone at 50029e64…, removed after)
- #84's head e3299ea2… is not an ancestor of origin/claude/build-platform (4846f043…) nor of 50029e64…: not yet merged.
- Trial `git merge --no-commit refs/x84` (aborted, nothing committed or pushed): one conflict, docs/runbooks/ci.md
  shard table (HEAD seven rows on push runs 40324477819 to 41348076075; #84 eight rows on another basis, with
  packets-roles 6 min 47 s and packets-words 22 min 42 s, both dated 2026-10-28, and no packets-explain row).
- Merged stryker/shards.json holds nine shards: money-ledger, packets-scan, packets-roles, packets-words,
  packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest. roles.ts and roles-words.ts are
  new files in #84, so the seven old shards keep their files; a full run grows by about 29.5 runner-minutes
  (53.4 to about 83).
- affected.test.ts:380 is toHaveLength(7) at P4 and auto-merges to #84's toHaveLength(9). No P4 source file
  (tools/stryker/*.ts, mutation.yml) names a shard; the classifier reads shards.json, so no money path is misrouted.
- Stale without a conflict: ci.md:194 ("every shard, about 54 runner-minutes"), ci.md:524-525 (53.4 / 54.2),
  ADR 0066 Part 7 shard means and totals (about lines 1843-1856: 53.36, 54.24, packets 31.68, 53.88 projections,
  about 296.9 / 294.3 saved), ADR 0066 :1704 ("seven since #52").
- Vitest not re-run (no install in the fresh clone); the finding is documentation, the count assertion was checked textually.

## Refined fix
At the base merge that brings #84: one nine-row table; keep P4's measured rows and add packets-roles and
packets-words measured on the same basis (push runs since shards.json last changed, i.e. after #84's merge), or
mark those two rows "2026-10-28, co-001/packet-day-counts, not yet on push runs" until measured. Re-date or
re-measure ci.md:194, :524-525, ADR 0066 Part 7 (totals, by-package packets figure, week projections, savings,
"seven since #52"). Run tools/stryker tests on the merged tree (9-shard assertion) and the replay. If #96 merges first,
the same resolution is #84's at its base merge.
