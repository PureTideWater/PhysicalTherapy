# sc-m2-1b progress (SUITE-CAP-1b merge of SS-01 efb20704)
- start head 358dc53f; no leftover marker
## steps
- fetched efb20704; merge --no-ff --no-commit started; conflicts: domain-model.md, test-matrix.md, ci.md, synth matrix.ts, registry.ts
- resolved: test-matrix/matrix.ts/registry.ts kept both (CAS-39,41,40,42); ci.md release-capacity row = 1b's row + base's browser-build clause; domain-model.md took theirs (to regenerate)
- step 2 (meet check) done: 1b changes no workflow file; release-capacity.yml = base (runs-on ubuntu-26.04 x2, browser-build --image). 1a has no migration; claim_by_superseded only in 1b's 20261109090000 + schema/remittances.ts. 1a readers (judgedCandidates/candidateRows, gatherReport/runLines, advanceStages LATERAL via line_status_by_line) read line_status by seq DESC; 1b keeps line_status_by_line, head row internal (design 'elsewhere' item). No file overlap between 1a and 1b worker code; heap.ts (prod D19) != 1a test-support/memory.ts.
- next: regenerate (install, watched, domain-model on fresh db, synth), then checks
- regenerated: install no change; watched 548 lines no change; domain-model regenerated on tp_sc1b_m2_1 (47 migrations, 100 tables, 230 div rows, 0 fn written)
- synth 272 cases 0 written; check:fixtures pass; verify-content pass; merge committed ce408d2f (not pushed yet)
- typecheck/lint/lint:copy/lint:logs pass; pnpm test 418/419 files, 7150 passed 2 failed 4 skipped: workflows.test.ts orphan playwright-core@1.56.1 in node_modules -> pruning per ci.md
- workflows.test.ts rerun after prune: 116/116 pass. next test:db shards
- shard 1 done
- shard 2 done
- shard 3 done
- shard 4 done
- test:db shards pass: 35/3316+1skip, 35/2179, 34/3115, 34/990 = 138 files 9600 passed 1 skipped
- domain-model --check pass (sha 81d0ac76..., approval line 7458, unapproved as expected); pushed ce408d2f. DONE
