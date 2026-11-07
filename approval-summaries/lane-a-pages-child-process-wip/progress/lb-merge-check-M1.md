# lb-merge check M1 (conflict resolutions and generated files)
Started 2026-11-06. Clone /home/user/mx-pcp-M1. Logs: scratchpad/pcp/logs/m1/
## Checks
- Clone at 7ce6c8b5 (= origin co-001/wip-pages-child-process); parents 28cde98d, cc3dd7f6 (= origin claude/build-platform); merge base 0f4a5ed5; base 29 commits ahead. PASS
- git show --remerge-diff 7ce6c8b5: empty (merge tree = git's automatic merge, no hand edits). PASS
- Files only one side changed (36 ours, 60 theirs): each blob in merge equals that side's blob; no file changed outside either side. PASS
- 4 two-sided files: diff(28cde98d->merge) == diff(base->cc3dd7f6) and diff(cc3dd7f6->merge) == diff(base->28cde98d), line for line. PASS
- SEC-24, CAS-55, MOD-15, MOD-16 each exactly once in test-matrix.md, matrix.ts, registry.ts. PASS
- watched-paths: page-reader.ts (l.293), page-thread.ts gone, fact-catalog.ts/fact-words.ts/render.ts (l.440,441,451) present; no duplicate lines. PASS
- domain-model.md, packages/db/migrations and pnpm-lock.yaml: same blob at base, both parents and merge (no generator input changed). PASS
- Under /tmp/laneb-heavy.lock 19:45:13-19:46:37 UTC: pnpm install --frozen-lockfile exit 0; pnpm synth --all exit 0 (319 cases: 0 written, 720 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged); watched.ts --write exit 0 (578 lines); git status clean after both; check:fixtures exit 0; vitest --project unit packages/synth tools/screening-capacity tools/stryker: 36 files, 617 passed, 0 failed, 0 skipped (includes fixtures.test.ts "holds every row of test-matrix.md, word for word"). PASS
- Nit: the merger's report says synth "left 16 unchanged"; that is only the EMR-format line; the cases line is 720 unchanged. No effect.
- Verdict: merge correct for lens M1. Clone removed.
