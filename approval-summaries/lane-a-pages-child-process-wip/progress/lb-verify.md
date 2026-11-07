# lb-verify: fresh-clone verification of PR #130 @ 43a81626
Started 2026-11-06.
## Step 1 clone: DONE
- /home/user/vx-pcp, FETCH_HEAD = 43a81626d310450eba77d17bc9651df53d992965; origin/claude/build-platform = cc3dd7f6 is an ancestor. 37 commits on top.
## Step 2 CI: DONE
- 38 check runs on 43a81626, all completed success except `notify` skipped (by design: `if: failure() && event != pull_request`).
- Required: all green, mutation, screening-capacity gate, approval-of-record (x2 runs) all success on this sha. Mutation/gate ran on PR merge commit b15fbab (43a81626 into cc3dd7f6; tree equal since base is contained).
- unit: 479 files, 9,948 tests: 9,946 passed, 2 skipped (workflows.test.ts 1 = it.skipIf(CI_TREE); pages.test.ts 1 = the core-crash test, context.skip when the host core_pattern pipes). Local claimed 9,947 passed / 1 skipped (root-only). => pages.test.ts core-crash test skipped in CI only; undisclosed. Mitigated: the /proc core-limit test runs everywhere; OOM/abort classification tested elsewhere.
- db: 3291+2256+3311+1006 = 9,864 passed, 0 skipped (local 9,863 + 1 skipped). OK.
- e2e: 41 + 40 = 81 passed, + 5 brand. Matches local 81 / 5.
- mutation gate: passed; pricing 98.67% 1934/1960 (26 eq), packets 99.11% 9895/9983 (88 eq) == PR body. 17 shards == PR body.
- capacity: verdict pass (time advisory); S1-S5 with S4 x3; consumer 1 task 2 vCPU/4096 MiB; no OOM line in log. Peak MiB figures only in the job summary/artifact; artifact blob host blocked (403), so the worker-consumer peak could not be read. Gate: no SIZING / TIME warnings.
- Note: capacity scenarios are screening uploads; they do not read contract pages through the new reader.

## Step 3 diff: DONE
- 39 files, +1,948/-137 (== PR body). No migration, no lockfile, no .github/, no .gitleaksignore, no content/. No model id added. PHI scan: only SYNTHETIC stand-ins (AKIASYNTHETIC..., postgres://synthetic).
- pages.ts / page-reader.ts read in full; every behaviour claim checked (spawn via /bin/sh ulimit -c 0 + exec, env {}, cwd /, argv flags, stdin framing, frame bound before body, close-not-exit, VmRSS poll 25ms / ps 100ms, baseline 224 MiB, 256 MiB growth, deadline + 1 s exit grace until close, afterPendingInput, MAX_READERS=1 FIFO, exit-handler SIGKILL, V8 OOM tail match, PageReadError messages code/signal only, console silenced). All match.
- page-reader.ts imported only as `import type` by pages.ts, so import.meta.main serve() never runs in main.js. Image Node 24.22.1 (ADR 0066), /bin/sh present (trixie-slim), no package.json above /app/dist (same as bundle test's tmpdir).
- SEC-24 in test-matrix.md, synth matrix.ts + registry.ts, fixtures/synthetic/SEC-24/expected.json; asserted by 5 test files (all contain "SEC-24").

## Step 4 re-run: DONE (all under flock /tmp/laneb-heavy.lock, Node v24.22.0, as root, core_pattern "core")
- pnpm install --frozen-lockfile: exit 0.
- pnpm --filter @tp/worker build: exit 0; dist/page-reader.js beside main.js.
- vitest --project unit packages/contracts: 10 files, 135 passed, 0 skipped (contracts.db.test.ts is the db project). pages.test.ts verbose: 26/26 passed incl. the core-crash test (which CI skips).
- pnpm --filter @tp/infra test: 29 files, 798 passed (== PR body).
- apps/worker/src/bundle.test.ts: 1 file, 3 passed (== PR body).
- pnpm typecheck: exit 0, 23 projects.
- Adversarial probe (own design, parent under --max-old-space-size=560 --enable-source-maps, via documentPages, SYNTHETIC): 1,000,000-deep nested-array PDF -> document_unreadable 292 ms; 64 MiB CSV of 3-byte chars (~21 Mi chars) -> unsupported_document 839 ms; 2,001-page CSV -> unsupported_document 354 ms; 60 MiB unterminated-quote CSV -> unsupported_document 691 ms; 64 MiB + 1 -> unsupported_document 11 ms. Parent RSS 282 -> 283 MiB throughout; 0 readers left after each; no core file written.
## Step 5: DONE
- Clone /home/user/vx-pcp removed.
- Issues: 1 nit (core-crash test skipped on CI runners whose core_pattern pipes; PR body's skip accounting does not say so). No blocking, no should. PASS.
- Not verifiable here: the capacity job's per-container memory peaks (job summary/artifact only; the artifact blob host returns 403 through the proxy). The gate passed with no SIZING or time warnings, and the capacity scenarios do not exercise the contract page reader.
