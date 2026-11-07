# pages-child-process: base-merge checker M2 (semantic interaction)

Started 2026-11-06 (Lane B subagent). Read-only fresh clone /home/user/mx-pcp-M2. Logs /tmp/claude-0/-home-user-PhysicalTherapy/88c94db6-fc7b-5c57-a2b7-5dda4f5b392f/scratchpad/pcp/logs/m2/

## Checks
- Clone at origin/co-001/wip-pages-child-process = 7ce6c8b521d19b9a8846b4d4bb80b63a0b308429, parents 28cde98d + cc3dd7f6 (= origin/claude/build-platform, an ancestor). Proved.
- Overlap of base (0f4a5ed5..cc3dd7f6, 60 files) and item (0f4a5ed5..28cde98d, 36 files): only test-matrix.md, synth matrix.ts/registry.ts, watched-paths.txt. No base change to packages/contracts, infra, apps/worker/src/intake, ADR 0033/0071.
- pnpm install --frozen-lockfile (lock) rc 0, tree clean.
- MUTATION SHARDS: base #128 added shard packets-figures (stryker/shards.json; affected.test/shards.test now 18 total). tools/stryker/affected.ts --event pull_request --base cc3dd7f6 at 7ce6c8b5: pricing + packets affected (via contracts/evidence/resolve.ts), 17 shards (packets-scan..packets-explain, packets-figures, pricing-engine..pricing-rest). The RESUME-BLOCK and the merger's "Still to run" say 16: the plan must run 17 (packets-figures added). Finding (should).
- Base additions grep (worker_threads, new Worker, resourceLimits, child_process, execPath, heapFlag, max-old-space, readDocumentPages, documentPages, @tp/contracts): none. Base relies on nothing of the reader; base changed nothing in contracts, infra, intake, ADR 0033/0071.
- PAGE_READ_LIMITS values unchanged by the item (model-gateway screen-bound.ts reads maxTextCharacters): no interaction.
- Denial-letter (base redact) is not wired to intake page text at run time (only gateway + web contract-proposals comment): no interaction with the reader's text.
- test-matrix/synth: SEC-24 row 205 and note 214, CAS-55 150, MOD-15/16 274-275 and note 288; matrix.ts and registry.ts hold each once, no duplicate ids. OK.
- Screening watched-paths: page-reader.ts listed, page-thread.ts gone, base's 3 packets lines kept.
- Stale docs not touched by base or item (pre-existing): ADR 0066:87 "readDocumentPages starts a bounded Worker for every read"; ADR 0051:51 "in its bounded thread"; ADR 0028:3 status text. Nit (applied migration comment 20261017120000 cannot change).
- Pricing/packets reach contracts only via @tp/contracts index (types and parseRateTerms); no mutation test spawns the reader.
- Suite running (lock): typecheck, unit (contracts, infra, worker, model-gateway, packets, synth, money, stryker, screening-capacity, release-capacity, web contracts+packets components), golden, db subset on fresh PG18 tp_m2_db. Script logs/m2/suite.sh.
- Merge exactness: diff(28cde98d..7ce6c8b5) == diff(0f4a5ed5..cc3dd7f6) (60 files, +6629/-170) and diff(cc3dd7f6..7ce6c8b5) == diff(0f4a5ed5..28cde98d) (36 files, +1941/-134); per-file changed-line sets equal on both sides for the 4 overlap files. Merge keeps both sides exactly.
- Suite at 7ce6c8b5 under the lock, 19:46:37-19:56:52 UTC (logs/m2/summary.txt), all rc 0: typecheck 23 projects; unit (contracts, infra, worker, model-gateway, packets, synth, money, stryker, screening-capacity, release-capacity, web contracts lib + packets components) 226 files 5,712 passed 0 skipped; golden 5 files 381 passed (model-gateway eval gate reads contracts through the child reader with the base's gateway); db on fresh PG18 tp_m2_db (47 migrations): contracts, model-gateway (gateway.db reads PDFs through the reader), worker intake/packets/report, web audit-e2e: 20 files 257 passed 0 skipped. DB dropped.
- Clone tree clean, clone removed.

## Verdict
Merge semantically correct; no silently broken assumption found. One should: the remaining plan says 16 mutation shards; at 7ce6c8b5 affected.ts selects 17 (base #128 added packets-figures). Nit: pre-existing stale "bounded thread/Worker" wording in ADR 0066:87 and ADR 0051:51 (not changed by the item or the base).
