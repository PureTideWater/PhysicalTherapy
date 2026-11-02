# SC-1b builder G: measurement gate + CAS-42.1/.2 + ADR 0083 1b section
Worktree /home/user/sc1b, start ce408d2f (pull: already up to date).
## Steps
- [ ] read code (era-export.large, price.large, reconcile.large, CAS-41 tests, vitest.config, db-shards.test, ADR 0083)
- [ ] write triage.large.db.test.ts (CAS-42.1, .2)
- [ ] gate run on base efb20704 scratch worktree $P/b1b-gate
- [ ] run on head
- [ ] SLOW_FIRST + db-shards count; registry assertedBy + synth
- [ ] ADR 0083 1b section
- [ ] checks, commit, push
## Peaks and times
## Open items
