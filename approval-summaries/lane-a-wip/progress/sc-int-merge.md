# sc-int-merge progress
- step 1: fetched 1b; starting merge of ce408d2f into co-001/ledger-interest-once (head e0646746)
- step 2: git merge --no-ff --no-commit ce408d2f (merge-base 358dc53f, 174 commits in). Only textual conflict: docs/product/domain-model.md (generated) -> took ours, regenerated.
  Auto-merged: remittances.ts (1b split chainContext into chainMatches/claimReversals/practiceChains; interest's CHAIN_ORDER ORDER BY m.seq kept, used by chainMatches - verified by meaning), reconciliation-001, test-matrix, synth matrix/registry, watched-paths.txt.
- step 3: pnpm install --frozen-lockfile OK; watched.ts --write: no change (550 lines); fresh tp_intmerge_1 migrated (48, head 20261110090000); db:domain-model --out --strict: only provenance line changed, 382 function files 0 written 0 removed. Staged. NOT committed yet.
- next: typecheck, lint, unit, commit, test:db 4 shards, synth --all + fixtures check, domain-model --check, push
- typecheck pass (22 projects); lint pass (1,729 files 0/0)
