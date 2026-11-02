# fin-int-web (builder W, interest fix slice 4: screens)
Worktree /home/user/interest, branch co-001/ledger-interest-once, base 379fed9f.
## Steps
- [x] pulled (already up to date at 379fed9f); read design 6.3, 7, 8.3, 13, 16
- [ ] tests first (routes db test, e2e spec)
- [ ] implement queries/page/display/roi/specialist
- [ ] checks, commit, push
## Notes
- web ledger-world.ts already reseeded as PLB L6 in d39b72c0 (on base)
- worker exports reportedInterest/chainRoots via @tp/worker/ledger
- [x] routes db test written (new describe, 5 cases); on base 379fed9f: 5 failed / 12 skipped (-t filter), for the right reasons (no takesBack, no reportedInterest, old note, old consequence). log logs/fin-int-web-routes-base.log
- [x] implemented queries (takesBack, reportedInterest, ORDER BY m.seq), display (interestWords, ReportedInterest, totals note), page, ROI note, ADJUSTMENT_CONSEQUENCE; registry assertedBy + pnpm synth --all (2 files written: LED-23/24 expected.json)
- [x] after: typecheck pass (22 projects); routes db test 17/17 pass (fresh migrated db); lint pass 1,738 files 0/0; lint:copy pass 552 files; unit apps/web+synth 105 files 1421 tests pass
- [x] e2e failing-first: base+spec on 4981: 2 tests, 2 failed (log logs/fin-int-web-e2e-base.log); stash popped, impl restored
- [ ] e2e after: build with impl, run on 4981
