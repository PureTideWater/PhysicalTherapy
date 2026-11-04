# Skeptic 2 of 3: PE-S1 (#84's packets-roles / packets-words vs P4's seven-shard text)

Status: DONE (2026-11-04). Clone /home/user/sk-p4-payment-engine-PE-S1-1 removed.

## Reproduction
- Fresh clone at 50029e64…; fetched e3299ea2… (#84 head). Merge base 56ed6279… (#81). #84 is not an ancestor of P4 and not in origin/claude/build-platform (4846f043…).
- `git merge --no-commit e3299ea2`: one conflict, docs/runbooks/ci.md shard table (P4's 7 CI-measured rows vs #84's 9 locally-timed rows). affected.test.ts, shards.test.ts, synth registry auto-merge. Merge aborted, nothing committed.
- Lines that do not conflict but go stale if #84 lands first: ci.md:194 ("every shard, about 54 runner-minutes"), ci.md:457 ("every shard (seven today)", P4's own line, also missed by the finding), ci.md:524-525 (53.4 / 54.2), ADR 0066 Part 7 savings.
- Code is unaffected: mutation.yml's matrix is fromJSON(changes.outputs.shards), shards come from stryker/shards.json, so the two new shards run; money-ledger still holds money+ledger, RUNNER_PROOF_SHARD stands.
- #84 (GitHub, read only): open, draft, last updated 2026-10-28, base 56ed6279.

## Verdict
Real but conditional on merge order: not refuted. #84 is unmerged, so P4 cannot cite its shards today. Whichever PR merges second has to reconcile, and the table conflict forces that by hand. Only the figures that do not conflict can go stale without notice. Docs and figures only; no gating effect. Severity: nit.

## Refined fix
Add a merge-order note to #96's description now. Whichever of #96 and #84 merges second must: (1) keep P4's table with nine rows, on one timing basis (CI push-run means, with packets-roles and packets-words marked as not yet measured on CI or dated local times; never mix the two bases in one column); (2) update ci.md:457 "seven today" to nine, and re-date or re-measure ci.md:194, :524-525 and Part 7's figures; (3) re-run the shard-count assertions (9) and the replay on the merged tree. If #96 merges first, the duty moves to #84's base merge.
