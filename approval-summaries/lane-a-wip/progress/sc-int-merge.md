# sc-int-merge progress
- step 1: fetched 1b; starting merge of ce408d2f into co-001/ledger-interest-once (head e0646746)
- step 2: git merge --no-ff --no-commit ce408d2f (merge-base 358dc53f, 174 commits in). Only textual conflict: docs/product/domain-model.md (generated) -> took ours, regenerated.
  Auto-merged: remittances.ts (1b split chainContext into chainMatches/claimReversals/practiceChains; interest's CHAIN_ORDER ORDER BY m.seq kept, used by chainMatches - verified by meaning), reconciliation-001, test-matrix, synth matrix/registry, watched-paths.txt.
- step 3: pnpm install --frozen-lockfile OK; watched.ts --write: no change (550 lines); fresh tp_intmerge_1 migrated (48, head 20261110090000); db:domain-model --out --strict: only provenance line changed, 382 function files 0 written 0 removed. Staged. NOT committed yet.
- next: typecheck, lint, unit, commit, test:db 4 shards, synth --all + fixtures check, domain-model --check, push
- typecheck pass (22 projects); lint pass (1,729 files 0/0)
- unit run 1: 2 failed (tools/test/workflows.test.ts: orphan playwright-core@1.56.1 in node_modules, env) | 7237 passed | 4 skipped; fixed by pnpm install --frozen-lockfile --config.modules-cache-max-age=0; workflows.test.ts rerun 116/116 pass
- merge committed: c18a847e (not pushed). next: full unit rerun, db shards, synth, dm check, push
- domain-model --check pass (SHA-256 3083defa33a3...; approval line blank, --require-approval exit 1 as expected: founder's)
- unit run 2 (after orphan fix): 2 failed | 7237 passed | 4 skipped; failures = 5 s timeouts under load in 1b's image-id.test.ts and csv-arena.test.ts (passed in run 1; rerun alone 16/16 pass). workflows.test.ts passed in run 2.
- db shard 1 (run A): 4 files failed / 31 passed; 15 failed tests. Causes:
  (a) merge by meaning: 1b's streamed.db.test.ts LEDGER_MATCHES_SENT phrase 'ORDER BY m.matched_at, m.id' -> 'ORDER BY m.seq' (interest's ledgerMatches). EDITED.
  (b) pre-existing on interest branch: route-tests world ledger-world.ts inserted a one-record interest match (claim only), which 20261110 skips (RETURN NULL) -> undefined.id. EDITED: PLB L6 (-50, ref SYNCCNROUTE0003) on adjusted remittance, claim match no_change of case line to interest claim, interest match with both records, entry evidence provider_adjustment.
  restore-drill skipped (pg_dump 16) -> rerun with PG_BIN_DIR=/opt/pg18/bin.
  Shards 2-4 of run A ran partly during the edits: rerun all 4 after committing the fix.
