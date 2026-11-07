# pages-child-process: base-merge repair (lb-merge-repair)

Started 2026-11-06 (Lane B subagent). Worktree /home/user/pages-child-process, from WIP 7ce6c8b5 (= origin/co-001/wip-pages-child-process), tree clean, no earlier repair file. Logs /tmp/claude-0/-home-user-PhysicalTherapy/88c94db6-fc7b-5c57-a2b7-5dda4f5b392f/scratchpad/pcp/logs/lbr/

## M2 should: the plan counts 16 mutation shards, affected.ts selects 17 -- REAL
- Reproduced at 7ce6c8b5 under the lock: `pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base cc3dd7f6` (logs/lbr/affected.log): pricing and packets affected via packages/contracts/src/evidence/resolve.ts; 17 shards: packets-scan, packets-roles, packets-roles-cues, packets-roles-numbers, packets-words-labels, packets-words-amounts, packets-words-days, packets-words-dates, packets-words-prose, packets-verifier, packets-facts, packets-rest, packets-explain, packets-figures, pricing-engine, pricing-recompute, pricing-rest. stryker/shards.json: 17 shard entries at 28cde98d, 18 at cc3dd7f6 (packets-figures added by #128).
- Fix (plan, not code; nothing in the tree is wrong): the status file's line 1 and RESUME-BLOCK now say 17 and to take the shard list from affected.ts at the head, never from a stored note. The shard step of workflow wf_cb013d2b-2e3 (step 4) already says "Run EVERY affected shard" from affected.ts; only its description and parenthetical say 16 (not edited: a running workflow's script). The PR description is not written yet (no PR): it must say 17 shards; the shards themselves (one at a time, then the gate) are the suite step's work, not run here.

## M1 nit: the merger's synth count -- REAL (report only)
- logs/lbm/synth-all.log has two lines: 319 cases, 0 written, 720 unchanged, 0 removed; 8 EMR export formats, 0 written, 16 unchanged, 0 removed. lb-merge.md reported only the second. Nothing in the tree changes; corrected here.

## M2 nit: stale "bounded thread/Worker" wording -- REAL, fixed
- `git grep -n -i 'bounded thread\|bounded Worker'` at 7ce6c8b5: ADR 0028:3 (status), 0051:51, 0066:87 describe the reader as a thread/Worker, contradicting ADR 0033's amendment of 2026-11-05 (made stale by this item). Other "worker thread" hits (0014, 0049, 0062, reconciliation-001) are the screening threads, unrelated. Applied migration 20261017120000 left alone; ADR 0033's filename (bounded-thread) kept, links depend on it.
- Commit 43a81626 docs(adr): each names the child process and links the amendment (0066's measurement kept in the past tense). Docs only, no behaviour, so no test.
- Checks under the lock at 43a81626: lint 0, lint:copy 0, verify-content 0, vitest unit tools/test + tools/required-checks 21 files 319 passed.
- Pushed fast-forward 7ce6c8b5..43a81626 to co-001/wip-pages-child-process through the pre-push hook (fixture guard, X12 search, gitleaks no secret); remote confirms 43a81626d310450eba77d17bc9651df53d992965.

## DONE. New WIP head 43a81626d310450eba77d17bc9651df53d992965.
