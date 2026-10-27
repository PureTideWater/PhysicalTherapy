# fix-integrate progress (PR #75 fix round, integrate part)

Started 2026-10-27 20:41 UTC (no earlier progress file).

## Steps
- [ ] 0. Read part notes (tokenizer, records, gateway, ux), requests.md, *-docs.md
- [x] 0. Read part notes, requests.md, *-docs.md (20:41-20:50)
- [x] 1a. Requests applied (20:50-21:05):
  - tokenizer 1 (patient-records.ts via apply.py): applied
  - gateway 1 (contract-terms.ts doc), 2 (spec.ts doc), 3 (patient-records.ts docblocks): applied
  - records 2 (default: comment): applied; records 3: specs frozen at definition (4 spec files) + Object.freeze(ModelGateway.prototype) + Object.freeze(this) in constructor; tests added in specs.test.ts; PROMPTS deep-freeze NOT done (gate's, not this PR's; provider paths untested)
  - ux 1 (era-exports.spec.ts), 2 (models-routes screen_failed), 3 (contract-proposals SCREEN_LIMITED_PROBLEM=screen_limited, comments, :731 redirect), 4 (gateway sentences + their tests in contract-terms.test.ts, path.test.ts): applied
  - records 1 / 4: already done by gateway part (verify)
  - gateway 5-7, records 6, ux 5: out of PR (after #42 / Lane A / UX PR 24)
- [x] 1b. tsc gateway/web/worker clean; narrow unit (gateway, synth screen, web models/routes/uploads, worker models) 765/765 (20:49)
- [x] 1c. freeze tests: before 2 failed/4 (integ/freeze-before.log), after 6/6
- [x] 1d. Adversarial diff review: found I1 = beforeScreen (new this round) could change context.practiceId so the screen held the check to another practice than the call was recorded under (proved: call sent, ModelCallFailedError from provider). Fixed: gateway.ts callContext() snapshot+freeze in run(); test gateway.test.ts "reads the caller's context once" before 1 failed (integ/context-before.log), after 60/60 with specs.
  - reviewed: redact.ts streaming/ring/hash logic (sound), patient-records caps (sound), contract-proposals limits/remembered (sound), uploader (sound), lint guards (sound)
- [ ] 2. Docs
- [x] 2. Docs (21:05-21:40): ADR 0070 Part 3 rewritten via scratchpad/phi/integ/adr_part{1,2,3}.py (before copy integ/adr0070-before.md); ADR 0054 amendment (order, bound race); runbook model-evaluation.md refusal bullet (+MODEL_SCREEN_LIMITED); PRD 575; test-matrix MOD-12 + matrix.ts word for word; registry MOD-12 assertedBy + specs.test.ts; reconciliation-001 item 16
- [ ] 3. synth --all x2, eval gate, gitleaks dir eval, watched-paths
- [x] 3. synth --all run 1: 237 cases, 1 written (MOD-12/expected.json: assertion + assertedBy), 636 unchanged, 0 removed; EMR 16 unchanged. Run 2: 0 written, 637 unchanged, 0 removed; EMR 16 unchanged.
  - eval (pnpm --filter @tp/model-gateway eval): gate: passed (contracts 63 docs P/R 0.996941; narratives 300/300); set unchanged -> no re-record
  - gitleaks dir packages/model-gateway/eval: ~543 KB, no leaks found
  - watched.ts --write: 531 lines, unchanged
- [ ] 4. full suite
  - typecheck: passed, 22 projects, 47.5 s wall
  - lint: passed, 1,623 files in 3 groups, 0 errors, 0 warnings
  - lint:logs: 1058 files scanned; every log call allowlisted
  - lint:copy: 514 files read; passes
  - [ ] pnpm test (running in background)
  - pnpm test: 383 files passed; 6384 passed | 4 skipped (6388); exit 0 (coverage on)
  - test:golden: 5 files, 381 passed
  - test:oracle: pyx12 4.0.0 agrees with all 688 (677 valid, 11 malformed rejected); edi835 agrees on every segment
  - [ ] test:db 4 shards (background; logs integ/db-shard-N.log)
  - test:db shard 1/4 (fresh phi_integ_shard_1, migrated): 32 files passed; 3155 passed | 1 skipped (3156)
- test:db shard 2 interrupted at 21:19 (session stop; no exit line); rerunning shards 2-4 from 21:23 via integ/dbshards2.sh
