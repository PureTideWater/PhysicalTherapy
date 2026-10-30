## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

Local, on the final tree 46974a2, the pushed head (the pre-push hook found every commit already checked: each had gone to the backup branch `co-001/wip-pr42-integrate` through the same hook as it was made), each command once, one at a time under one lock (PostgreSQL 18.4; Node 24.22; pnpm 10.34.8). Each result is the run's own total. How it got there: a first pass stopped at its lint step (`packages/db/src/mail-address.ts:32`, `no-control-regex`), fixed in ffb27b1; the whole suite then passed on ffb27b1 (the same counts as below but for #79's additions: unit 394 files and 6,603 tests, e2e 56 journeys, mutation and capacity as below); then claude/build-platform took #79, merged as 46974a2 (rule 6), and the whole suite ran again on it.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed: 22 projects |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm lint` | Passed: 1,661 files in 3 groups, 0 errors, 0 warnings |
| `pnpm lint:copy` | Passed: 526 files read |
| `pnpm lint:logs` | Passed: 1,076 files scanned; every log call uses allowlisted fields (the five new probe-event fields among them) |
| `pnpm check:fixtures` | Passed: 333 files read by the guard, 3,886 text files searched |
| `pnpm synth --all` then `git diff --exit-code fixtures/synthetic` | Passed: 250 cases, 0 files written, no difference |
| `PR_NUMBER=42 pnpm -s exec tsx tools/engine-freeze/check.ts a6e754fc` | Passed: no non-test file under `packages/pricing/src` changes; the exception is not used |
| `CI=true ENGINE_FREEZE_BASE=a6e754fc pnpm test` | Passed: 397 files, 6,644 tests, 1 skipped (`packages/rules` content.test.ts, which cannot make a file unreadable to root). On ffb27b1 its first run had failed 2 tests of `tools/test/workflows.test.ts` on the checkout's `node_modules`, not the tree: an orphaned `playwright-core@1.56.1` from the install before #77, pruned as the test's message says (`pnpm install --frozen-lockfile --config.modules-cache-max-age=0`, the lockfile unchanged) |
| `pnpm test:golden` | Passed: 5 files, 376 tests |
| `TP_ORACLE_PYTHON=/opt/py312-ci/bin/python pnpm test:oracle` | Passed: pyx12 and `packages/edi835` agree on all 687 synthetic 835 fixtures (676 valid, 11 malformed and rejected as expected) |
| `pnpm verify-content` | Passed: every content set |
| `pnpm test:db --shard=1/4` on a fresh PostgreSQL 18 database migrated from empty | Passed: 33 files, 3,269 tests, 1 skipped (the restore drill's pg_dump path, skipped by the test itself where the client tools are PostgreSQL 16, as on CI's runner; its server-side restore ran) |
| `pnpm test:db --shard=2/4` | Passed: 33 files, 2,657 tests |
| `pnpm test:db --shard=3/4` | Passed: 32 files, 2,547 tests |
| `pnpm test:db --shard=4/4` | Passed: 32 files, 965 tests (the four shards: 130 files, 9,438 tests passed and 1 skipped, the catalog, cross-tenant, hardening and access suites among them, the canonical rule against TypeScript's on every code point, and the domain model's drift case; the approval half is the `domain model` job's `--require-approval`, which awaits the founder) |
| `pnpm -s db:domain-model --check` on a fresh PostgreSQL 18 database migrated from empty | Passed: the document and the 375 function files match the schema; 98 tables, 1 view, 47 registered, 226 divergence rows (23 to approve), 0 explanation problems |
| `pnpm build` | Passed |
| `vitest run --project unit infra` | Passed: 26 files, 700 tests |
| `cdk synth` | Passed: 6 stacks (tp-dev, tp-staging, tp-production and each one's `-address-validation`) |
| `actionlint` (1.7.7) `-ignore 'label "ubuntu-26\.04" is unknown'` | Passed: no finding. The ignored message is the one the repository's own workflow test ignores (actionlint does not know GitHub's ubuntu-26.04 label yet, which #77 moved the jobs to); run plain on ffb27b1, that label was its only message |
| Mutation: the shards this change affects (`tools/stryker/affected.ts` against a6e754fc: packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest, through `packages/db`'s runtime and `mail-address.ts`), each with its canary, then the gate | Passed: each shard's canary 5 of 5 cases as expected; the gate passed with pricing at 98.67% (1,934 detected; the 26 undetected are all recorded equivalents; 12 load failures) and packets at 97.75% (4,310 detected; the 99 undetected are all recorded equivalents; 2 load failures); money and ledger not affected |
| `pnpm screening:capacity --runtime process --time-mode binding --scenarios S1,S4` (indicative only; CI's is the record) | Every judged upload within the 48-s line: S1-1 34.2 s, S1-2 2.7 s; S4#1 40.1, 40.2, 39.3 and 30.3 s; S4#2 37.1, 39.0, 38.5 and 28.3 s (the middle run, 39.0 s, under the 44-s question); S4#3 38.2, 37.2, 38.6 and 28.0 s. The web measured the address checks of 14 of 14 uploads at 2.0 to 2.3 s (M4). The run's verdict reads "fail" for what a process runtime cannot give (no container limits, no cold start, S2 and S3 not run), as every local smoke does. A first run on this tree reused the `--out` directory of the ffb27b1 run (S1-1 32.1 s, middle S4#3 38.4 s there) and read that run's outbox (negative times, the old links 404): a harness gap, an open item below; this row is the run with a fresh directory |
| `pnpm test:e2e` with Playwright 1.64.1's pinned Chromium (build 1248) | Passed: 58 tests (#79's table journeys at 390 px among them), 2 workers, 9.7 min, no retry |

CI on this head, 46974a2, starts with its push and tests it merged with claude/build-platform at 165c5993, which took #74 (UX PR 1, the forms) at 03:08 UTC, after the suite above had started; a local probe of that merge (reset afterwards) passed typecheck (22 projects) and the web's unit tests (77 files, 931 tests). #74 is merged into this branch, rule 6, before the founder's approval. Its checks report above. The `domain model` job is expected red until the founder's approval line names them (the document and the 375 function files match the schema; `--require-approval` asks for the approval), and `all green` red from it alone.

CI on the previous head, 6f23c42: every check green but `domain model` (the same expected case) and `all green`, red from it alone; `mutation`, the `screening-capacity gate` and `approval-of-record` green. CI on the base merge 098636e: red `unit` (`apps/worker/src/web-entries.test.ts:77`, fixed in 15189a5) and `domain model` (expected), the rest green.
