# Skeptic 3/3, PE-S1 (payment-engine review of #96)

Status: done. Verdict: not refuted; severity should (doc and cost figures only; no gate-safety effect).

## Reproduction (fresh clone at 50029e64…, removed after)
- #84 is open, draft, base claude/build-platform, head e3299ea2…; not an ancestor of the base or of 50029e64…. Merge-order risk is real.
- Trial merge of e3299ea2… into 50029e64… (no commit): one conflict, docs/runbooks/ci.md 515-535 (the shard table). affected.test.ts, shards.test.ts, registry.ts, watched-paths.txt auto-merge.
- Merged stryker/shards.json: nine shards (money-ledger, packets-scan, packets-roles, packets-words, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest). P4 has seven. affected.test.ts on the merge asserts toHaveLength(9).
- packages/packets/src/roles.ts and roles-words.ts are absent at 50029e64…: #84's two shards are new files, so they add to a full run (about 6 min 47 s + 22 min 42 s, #84's local Stryker times of 2026-10-28, about 29.5 min), not moved out of packets-rest.
- The conflict hunk carries only the table and the 53.4/54.2 line (:524-525). These auto-merge silently and stay stale: ci.md:194 ("every shard, about 54 runner-minutes") and ADR 0066 Part 7 (:1704 "seven since #52, 52.0 to 57.8", :1843-1854 saved 296.9 / 294.3 and the 53.88 per-run figures).
- #84's table has eight rows (no packets-explain; #84 is cut before #51's explain shard) and uses a different basis (local Stryker time). Taking either side whole is wrong.

## Why the gate stays safe
- mutation.yml's matrix is fromJSON(changes.outputs.shards), and affected.ts reads shard names from shards.json; only RUNNER_PROOF_SHARD = 'money-ledger' is named in code. manifests.ts:504-507 re-checks that money-ledger holds money and ledger whole and fails closed to global otherwise. On the merge it still holds both whole, so the runner proof stands. No classifier verdict changes.

## Refined fix
At whichever of #84 / #96 merges second (the conflict is forced only on the table):
1. Resolve the table to nine rows in P4's form and on P4's basis (mean CI job time over push runs since shards.json last changed). Until push runs exist after the nine-shard shards.json lands, show packets-roles and packets-words on #84's local basis, marked and dated, rather than mixing bases unmarked.
2. Re-measure or re-date ci.md:524-525 (shard total; with changes and mutation) and :194 ("every shard, about N runner-minutes"), and ADR 0066 Part 7 :1704, :1843-1854 (the per-run full figure and the saved minutes, which grow by about 29.5 min per avoided full run). Restate the Thursday-batch range at ci.md:198 if it rests on the full figure.
3. On the merged tree re-run vitest tools/stryker (shard-count assertion 9, the manifests runner-proof tests) and the replay, from a worktree with its own node_modules (a symlinked node_modules makes stryker.ts refuse the core, a false failure).
4. Record the merge-order dependency in #96's description so the reviewer of the second PR checks the silently auto-merged figures, not only the conflicted table.
