export const meta = {
  name: 'lane-b-ci-mutation-build',
  description: 'Lane B ci-mutation (audit #54): M1 runner and configs first, then M1 tooling plus four survivor builders in parallel, integrator with a full local run and draft PR, two adversarial reviews',
  phases: [
    { title: 'Runner', detail: 'M1: Stryker 10.1.1, per-package configs, aliases, seed, shards (first commit)' },
    { title: 'Build', detail: 'M1 gate/affected/canary/workflow/docs; M2 pricing+golden; M3 money+ledger; M4a/M4b packets' },
    { title: 'Integrate', detail: 'merge, equivalents confirmed, all six shards and the gate, push, draft PR' },
    { title: 'Review', detail: 'payment-engine review; CI tooling and security review' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/ci-mutation'
const DESIGN = '/home/user/ops/designs/lane-b-ci.md'
const ATTRIB = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4'

const EQUIV_FORMAT = `Equivalent-mutant records (the only form; the freeze forbids "// Stryker disable" comments): tools/stryker/equivalent/<package>.json, a JSON array sorted by file then original then occurrence, each entry exactly
{ "file": "<repo-relative source path>", "mutator": "<Stryker mutator name>", "original": "<the exact original source text Stryker replaced>", "occurrence": <1-based index of that text among the file's occurrences of it>, "replacement": "<the mutant's replacement text>", "reason": "<why no test can tell them apart, in one or two sentences>", "proposedBy": "<builder id>", "reviewedBy": "", "reviewedOn": "" }
reviewedBy/reviewedOn stay empty from builders; the integrator fills them only after confirming the entry independently. Record an entry only for a true equivalent (no input can tell the mutant from the original); everything else is killed by a test.`

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo PureTideWater/PhysicalTherapy; claude/build-platform at 49514e8. CLAUDE.md is in your context; follow it.
- You build part of Lane B's PR "co-001/ci-mutation" (combined audit #54: mutation testing that really runs on the money code), PR 4 of the four-PR CI series. Design contract: ${DESIGN}; read section 3.4 (all of it: 3.4.1 what changes, 3.4.2 files, 3.4.3 tests, 3.4.4 acceptance), section 1's A7, section 4's ci-mutation rows (builders M1-M4 and their file ownership), section 6 (local limits: one Stryker shard at a time, never two), section 7's F6 and notice N4, and section 13 for the review's fixed dispositions. The mutation scout's report is /home/user/ops/designs/lane-b-ci/scout-mutation.md (cited [S2]; section 8 lists the survivors per file); its 10.1.1 reports are under ${SP}/ci-design/mutation-reports/10.1.1/ and a survivor lister is ${SP}/ci-design/tools/survivors.mjs (node survivors.mjs <mutation.json>).
- The founder's rulings that apply (2026-10-25, relayed by the co-founder): F6 yes: the 2026-10-20 adoption of the combined audit covers #54's 85% exit for milestone 6 and Gate 1, so PRD 17's milestone 6 check is amended and reconciliation-001's milestone check (line ~459) gains that exception; Lane A's PR 7 writes Gate 1's line in gates.md (hand it over in the build summary). The founder's standing rule: only the best option, never weighted by build effort, never sacrificing quality.
- This PR is built on 49514e8 BEFORE ci-speed (PR 1, co-001/ci-speed, still open) merges; the files both change (vitest.config.ts, tools/test/workflows.test.ts, package.json, pnpm-lock.yaml, ADR 0066's file, docs/runbooks/ci.md, docs/product/test-matrix.md's CI heading, packages/synth's registry and CASE_MODULES) are reconciled later under LANES rule 6 when this branch merges claude/build-platform. So: create ADR 0066 at the exact file name the design gives, holding only its Part 4 under the ADR's header; create docs/runbooks/ci.md holding only its mutation section; add the test-matrix rows CI-15 to CI-17 under a heading "Continuous integration (CI)"; add 'CI' to CASE_MODULES. Keep each of those self-contained so the later merge is mechanical.
- Hard rules: no migration; no non-test change under packages/pricing/src (any non-*.test.ts file there, test helpers included, is an engine change: tools/engine-freeze/check.ts) and nothing under packages/pricing outside src; under packages/ledger/src only NEW it blocks or NEW test files (git diff --numstat 49514e8 -- packages/ledger/src must show 0 deletions on every file); LED-01 to LED-11 and the ledger oracle unchanged and passing; fixtures/golden and synthetic releases 900001-900004 unchanged; the one non-test money change in the whole PR is packages/money/src/cents.ts:85 (the unreachable "?? '0'"), behaviour unchanged; no test weakened or deleted except the moves the design names; no PHI; no model identifier in any repository file or commit other than the attribution lines.
- ${EQUIV_FORMAT}
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 at localhost:5433 (postgres:test), DATABASE_URL=postgres://postgres:test@localhost:5433/postgres. Playwright's Chromium 1194 is in /opt/pw-browsers. The machine has 4 CPUs and 15 GB shared with another workflow's agents: wrap EVERY heavy command in the shared lock, flock /tmp/laneb-heavy.lock <command> (any stryker run, pnpm typecheck, pnpm lint, pnpm test, pnpm test:golden, vitest db runs, pnpm synth --all). Iterate on narrow Stryker runs (--mutate <file> or <file>:<lines>) and run whole shards only to confirm; never two Stryker runs at once; keep each locked run under about 15 minutes.
- Commits: in your own worktree on your own branch, in the repository's commit style (git log --format=%B -5 origin/claude/build-platform), ending with exactly:
${ATTRIB}
- Never push (except the integrator), never force, never --no-verify, never post on GitHub (except the integrator's draft PR); never change /home/user/PhysicalTherapy's or /home/user/ops's working trees.
- Report: write your full report to the file named below; return the structured summary (short; every check with its command and result).`

const BUILDER_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' }, branch: { type: 'string' }, head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    files_changed: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    scores: { type: 'string', description: 'mutation scores and survivor counts before and after, per package or file, with the commands' },
    equivalents_recorded: { type: 'number' },
    requests_for_integrator: { type: 'array', items: { type: 'string' } },
    deviations_from_design: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' } }, required: ['what', 'why'] } },
    open_items: { type: 'array', items: { type: 'string' } },
    report_path: { type: 'string' },
  },
  required: ['role', 'branch', 'head', 'commits', 'files_changed', 'checks', 'scores', 'equivalents_recorded', 'requests_for_integrator', 'deviations_from_design', 'open_items', 'report_path'],
}

phase('Runner')
const m1a = await agent(`${CTX}

You are builder M1, first step ("lands the 10.1.1 bump and the configs as its first commit, so M2 to M4 can measure"). Worktree /home/user/ci-mutation-m1, branch co-001/ci-mutation-m1 (at 49514e8, installed). In ONE commit: @stryker-mutator/{api,core,vitest-runner} to 10.1.1 (pnpm, lockfile updated, pnpm install --frozen-lockfile clean afterwards); the patch patches/@stryker-mutator__vitest-runner@10.0.0.patch and its patchedDependencies entry deleted; stryker.config.mjs and stryker.verifier.config.mjs deleted and replaced by stryker/base.mjs and stryker/{money,pricing,ledger,packets}.config.mjs with the design's mutate sets (packets includes windows.ts; pricing excludes testing.ts) and per-package JSON report paths (state them: other builders read them); stryker/shards.json with the six shards (money+ledger, packets-scan, packets-rest, pricing-engine, pricing-recompute, pricing-rest; every mutate file in exactly one shard; choose the file split from [S2]'s measured costs); vitest.mutation.config.ts (generated aliases for every workspace package's exports to the sandbox's files, the fast-check seed setup file for mutation runs only, the exclusion list with reasons, pricing's test set adding tools/golden-worksheet/engine*.test.ts) replacing vitest.stryker.config.ts and vitest.stryker.packets.config.ts; the "stryker" script kept working. Keep tools/stryker/runner.test.ts and the old canary working or remove them only if the design's new canary replaces them in M1's next step (say which). Prove it: under the lock, run the money shard's config in full and one narrow run on a pricing file and a packets file; give the scores and confirm they match [S2]'s 10.1.1 numbers (money 93.22) within reason. Write a short note of the exact commands other builders use (full package run, narrow run, where the JSON report lands, how to list survivors) into the report. Report: ${OUT}/m1-runner.md. Return the structured summary; head must be the commit SHA.`, { label: 'build:m1-runner', phase: 'Runner', schema: BUILDER_SCHEMA })
if (!m1a) throw new Error('M1 (runner) returned nothing; the survivor builders cannot measure.')
log(`Runner commit ${m1a.head.slice(0, 7)}`)

const START = `First: cd into your worktree, git merge --ff-only ${m1a.head} (M1's runner commit on co-001/ci-mutation-m1), then pnpm install --frozen-lockfile --prefer-offline. M1's commands (full run, narrow run, report paths, survivor listing) are in ${OUT}/m1-runner.md.`

const BUILDERS = [
  {
    key: 'm1-tooling', wt: '/home/user/ci-mutation-m1', branch: 'co-001/ci-mutation-m1', start: 'Continue on your branch after your runner commit (already there).',
    brief: `You are builder M1, second step: everything else M1 owns in the design's section 4 table, except the equivalents files. The canary (tools/stryker/canary: five cases, each held to an expected status per mutant in expected.json; the private workspace package @tp/stryker-canary at tools/stryker/canary/lib with "typecheck": "tsc --noEmit", added to pnpm-workspace.yaml; case 1 replaces tools/stryker/runner.test.ts), run as the first step of every shard; the gate tools/stryker/gate.ts with gate.test.ts (every rule in section 3.4.1, reading the equivalents format above, requiring reviewedBy and reviewedOn on every entry of a fully-run package, keeping equivalents in the denominator as Survived, "above 85%" strictly); tools/stryker/affected.ts with affected.test.ts (the closure rules; on synthetic graphs and on the repository's own graph with the results the design lists); tools/screening-capacity/watched.ts's includeTests option (off by default) and watched.test.ts proving the watched list unchanged; the shard partition test; .github/workflows/mutation.yml rewritten (triggers push to claude/build-platform, pull_request default types, the weekly schedule, workflow_dispatch; mutation's own concurrency group form; jobs changes, stryker (<shard>), mutation with the design's ifs and timeouts; overwrite: true on reports; verdicts printed to the log; contents: read); tools/test/workflows.test.ts's mutation block rewritten (only that block); vitest.config.ts's BRANCH_GATED gains packages/money/src/** (only that change); the documents: ADR 0066 Part 4, ADR 0064 and 0047 amendments, PRD 18's mutation row and CI line and PRD 17's milestone 6 check (F6), reconciliation-001's milestone-check exception (F6, with the ruling recorded: the founder, relayed by the co-founder, 2026-10-25), docs/runbooks/ci.md's mutation section, test-matrix CI-15 to CI-17, packages/synth registry and matrix CI-15 to CI-17 (module CI) with pnpm synth --all's fixtures. Failing first per section 3.4.3. Checks: your tests; actionlint; pnpm exec vitest run tools/stryker tools/test tools/screening-capacity packages/synth; pnpm typecheck; pnpm lint; the canary under 10.1.1 (5 of 5 as expected) and under 10.0.0 with the patch or without aliases/seed (cases 2-5 fail as they should: show it); the gate over the money shard's report. Report: ${OUT}/m1-tooling.md.`,
  },
  {
    key: 'm2-pricing', wt: '/home/user/ci-mutation-m2', branch: 'co-001/ci-mutation-m2', start: START,
    brief: `You are builder M2: pricing survivors and the golden test. You own packages/pricing/src/**/*.test.ts (test files only: no other file under packages/pricing), tools/golden-worksheet/engine.golden.test.ts, tools/stryker/equivalent/pricing.json. (1) The golden engine test priced per test: each claim priced inside its own test with no memo shared across tests, assertions moved unchanged, a test requiring the set of claim ids priced to equal the set under fixtures/golden, each in exactly one test; record the git diff --color-moved=plain evidence and the new test:golden count with its arithmetic. (2) Kill pricing's survivors (about 162: recompute 84, engine 39, release 18, trace 13, dates 6, reasons 2; [S2] section 8) with tests only: error classes and messages, boundary values, fixed examples of property counterexamples, table tests for regular expressions; record only true equivalents. Measure with the pricing shards (pricing-engine, pricing-recompute, pricing-rest), one at a time under the lock; iterate narrow. Checks: the three pricing shards' final scores and survivor counts (target: no unexplained survivor); pnpm test:golden; pnpm exec vitest run --project unit packages/pricing; the engine freeze, PR_NUMBER unset: pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8 shows no non-test engine change; pnpm typecheck; pnpm lint. Report: ${OUT}/m2-pricing.md.`,
  },
  {
    key: 'm3-money-ledger', wt: '/home/user/ci-mutation-m3', branch: 'co-001/ci-mutation-m3', start: START,
    brief: `You are builder M3: money and ledger survivors. You own packages/money/src/** (cents.ts's one change at :85 and the money tests), packages/ledger/src/**/*.test.ts by NEW it blocks and NEW test files only (0 deletions; never edit an existing line, a toThrow() included), tools/stryker/equivalent/{money,ledger}.json. (1) cents.ts:85: make the unreachable "match[2] ?? '0'" branch-free with behaviour unchanged (the regex at :73 requires the group); money's tests prove the formatting; money reaches 100% branch coverage. (2) Kill money's 16 and the ledger's about 130 survivors ([S2] section 8: templates 32, totals 17, roi 16, allocation 12, csv 12, stages 12, pairing 10) with tests only; record only true equivalents (for example min/max at equality). Measure with the money+ledger shard under the lock. Checks: the shard's final scores and survivor counts; git diff --numstat 49514e8 -- packages/ledger/src (0 deletions; only *.test.ts); the ledger db tests and the ledger oracle (find them through packages/synth/src/cases/registry.ts LED rows; run under the lock with DATABASE_URL) all passing; pnpm exec vitest run --project unit --coverage packages/money packages/ledger (money 100% branches, ledger still 100%); pnpm typecheck; pnpm lint. Report: ${OUT}/m3-money-ledger.md.`,
  },
  {
    key: 'm4a-packets-scan', wt: '/home/user/ci-mutation-m4a', branch: 'co-001/ci-mutation-m4a', start: START,
    brief: `You are builder M4a: packets survivors in the scanner, the reading of a narrative and the verifier (the design's M4, split in two by file for speed). You own these test files only: packages/packets/src/{scan,readable,placeholders,verifier,check,reference,index}.test.ts and any NEW test file whose subject is scan.ts, readable.ts, placeholders.ts, check.ts, reference.ts or verifier/**; and the entries of tools/stryker/equivalent/packets.json for those source files only (M4b writes the others in the same file name; the integrator merges the two arrays). Kill their survivors (scan 154, mismatches 33 and the rest of [S2] section 8 for your files): table tests of the inputs each regex quantifier or anchor separates, error classes and messages, boundaries; ADR 0047 records most of the verifier's survivors as regex survivors. Measure with the packets-scan shard (and the packets-rest shard where your files sit there), under the lock, narrow while iterating. Checks: final scores and survivor counts for your files; pnpm exec vitest run --project unit packages/packets; pnpm typecheck; pnpm lint. Report: ${OUT}/m4a-packets-scan.md.`,
  },
  {
    key: 'm4b-packets-rest', wt: '/home/user/ci-mutation-m4b', branch: 'co-001/ci-mutation-m4b', start: START,
    brief: `You are builder M4b: packets survivors in assembly, facts, calculation, interest, payer, dates and windows (the design's M4, split in two by file for speed). You own these test files only: packages/packets/src/{assemble,facts,calculation,interest,payer,windows,correspondence}.test.ts and any NEW test file whose subject is assemble.ts, facts.ts, calculation.ts, interest.ts, payer.ts, dates.ts, windows.ts, format.ts, hash.ts, draft.ts or correspondence.ts; and the entries of tools/stryker/equivalent/packets.json for those source files only (M4a writes the others in the same file name; the integrator merges). Kill their survivors (assemble 65, facts 43, calculation 17, interest 12 and the rest for your files; [S2] section 8): assertions on every field of a line's interest and calculation summary and on the packet totals, boundary values, error classes and messages. Measure with the packets-rest shard, under the lock, narrow while iterating. Checks: final scores and survivor counts for your files; pnpm exec vitest run --project unit packages/packets; pnpm typecheck; pnpm lint. Report: ${OUT}/m4b-packets-rest.md.`,
  },
]

phase('Build')
const built = await parallel(BUILDERS.map(b => () =>
  agent(`${CTX}\n\nWorktree ${b.wt}, branch ${b.branch}. ${b.start}\n\n${b.brief}\n\nReturn the structured summary.`, { label: `build:${b.key}`, phase: 'Build', schema: BUILDER_SCHEMA })))
const missing = BUILDERS.filter((b, i) => !built[i]).map(b => b.key)
if (missing.length) throw new Error('A builder returned nothing: ' + missing.join(', ') + '. Not integrating a partial build.')
log('Builders done: ' + built.map(b => `${b.role} ${b.head.slice(0, 7)}`).join('; '))

const INTEGRATOR_SCHEMA = {
  type: 'object',
  properties: {
    pr_number: { type: 'number' }, pr_url: { type: 'string' }, head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    scores: { type: 'string', description: 'per package and per shard: score, killed, survived, equivalents, with the gate verdict' },
    equivalents: { type: 'string', description: 'how many recorded per package, how many the integrator rejected and had killed instead' },
    seams_fixed: { type: 'array', items: { type: 'string' } },
    deviations_from_design: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' } }, required: ['what', 'why'] } },
    open_items: { type: 'array', items: { type: 'string' } },
    summary_path: { type: 'string' },
  },
  required: ['pr_number', 'pr_url', 'head', 'commits', 'checks', 'scores', 'equivalents', 'seams_fixed', 'deviations_from_design', 'open_items', 'summary_path'],
}

phase('Integrate')
const integ = await agent(`${CTX}

You are the integrator of co-001/ci-mutation. Worktree /home/user/ci-mutation, branch co-001/ci-mutation (at 49514e8, installed, no upstream). The builders finished on local branches co-001/ci-mutation-{m1,m2,m3,m4a,m4b}; their reports are in ${OUT}/ and their summaries:
${JSON.stringify(built, null, 1)}

1. Merge co-001/ci-mutation-m1 first, then m2, m3, m4a, m4b (git merge --no-ff), merging tools/stryker/equivalent/packets.json's two arrays into one sorted array; then pnpm install --frozen-lockfile. Fix every seam and request.
2. Confirm every equivalent record yourself, independently of its proposer: read the mutant against the original and try to construct an input that tells them apart. If you can, the record is wrong: write the killing test in the right owner's file set and delete the record. If it holds, fill reviewedBy "integrator (Lane B, ci-mutation)" and reviewedOn "2026-10-25". Count both outcomes.
3. Checks on the merged head, each heavy one under flock /tmp/laneb-heavy.lock, each recorded: pnpm typecheck; pnpm lint; actionlint .github/workflows/*.yml; pnpm test (the unit suite with coverage: money 100% branches, the other BRANCH_GATED globs still 100%); pnpm test:golden (the new count, every claim, the claim-set test); the ledger db tests and the ledger oracle with DATABASE_URL (LED-01 to LED-11 passing, unchanged); pnpm stryker run tools/stryker/canary/stryker.config.mjs (5 of 5 as expected); ALL SIX shards one after another (each under the lock) and then the gate over their reports: it must pass with every package above 85% and no unexplained survivor (if it does not, kill the survivors, by tests, before pushing); the gate's negative proof (delete one killing assertion in a scratch copy, rerun that package's narrow run and the gate: it fails naming the survivor; restore); the freeze (pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8: no non-test engine change); the scope checks of section 3.4.4 step 1 (pricing src only tests; ledger 0 deletions and only *.test.ts; money non-test diff exactly cents.ts:85; fixtures/golden unchanged); pnpm synth --all && git diff --exit-code -- fixtures/synthetic.
4. Push once: git push -u origin co-001/ci-mutation (the pre-push hook runs the fixture check and gitleaks; if it refuses, rewrite only unpushed commits; never force, never --no-verify).
5. Open the draft PR into claude/build-platform with the GitHub MCP tool create_pull_request (load with ToolSearch "select:mcp__github__create_pull_request"; owner PureTideWater, repo PhysicalTherapy, head co-001/ci-mutation, base claude/build-platform, draft true). Title: "CI 4 of 4, ci-mutation: mutation testing on every money package, gated above 85% with no unexplained survivor (audit #54; ADR 0066)". Body: every section of .github/pull_request_template.md filled (What changes; Why: audit #54, the founder's F6 ruling, Lane B's claim, designs/lane-b-ci.md; What it does not change: each line, naming the one non-test money change cents.ts:85; Checks: every command above with its result and the per-package scores; Reviewer agents' findings: "Two adversarial reviews (payment-engine; CI tooling and security) run next; findings and resolutions follow in the fix round"; Freeze exception: "No: tests only under packages/pricing/src; the ledger by additions only"; Domain model: "No migration; the document is unchanged."; The founder's approval: as the template says). Add a note: built on 49514e8 ahead of PR 1 (ci-speed); it merges claude/build-platform after ci-speed under LANES rule 6. End the body with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4
6. Build summary to ${OUT}/build-summary.md in the house format of /home/user/ops/approval-summaries/pr6b4-build-summary.md, with the hand-over line for Lane A's PR 7 (Gate 1 in gates.md).
Return the structured summary.`, { label: 'integrate', phase: 'Integrate', schema: INTEGRATOR_SCHEMA })
if (!integ) throw new Error('The integrator returned nothing.')
log(`Draft PR #${integ.pr_number} at ${integ.head.slice(0, 7)}`)

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    reviewer: { type: 'string' }, head_reviewed: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, file: { type: 'string' }, line: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'line', 'issue', 'evidence', 'fix'] } },
    checks_done: { type: 'array', items: { type: 'string' } },
    ci_read: { type: 'string' },
  },
  required: ['reviewer', 'head_reviewed', 'findings', 'checks_done', 'ci_read'],
}

const REVIEWS = [
  { key: 'payment-engine', lens: `The money paths, with the checklist in .claude/agents/payment-engine-reviewer.md. Specifically: (1) do the new tests really kill what they claim (sample at least 20 previously-surviving mutants across the four packages, apply each by hand in your clone, and show the named test fails; a test that passes under the mutant is a finding); (2) every equivalent record: try to construct an input that tells mutant and original apart; one you can is blocking; (3) cents.ts:85: behaviour unchanged for every input the regex at :73 admits, and the differential test's result; (4) the freeze: no non-test change under packages/pricing (any file), test helpers only inside *.test.ts; the golden restructure moves assertions unchanged (git diff --color-moved=plain) and prices every claim in exactly one test, fixtures/golden unchanged; (5) the ledger: additions only, 0 deletions, LED-01 to LED-11 and the oracle unchanged and passing; (6) tests that assert implementation details instead of behaviour, or that would break on a correct refactor; (7) money is integer cents everywhere in the new tests (no float on an amount).` },
  { key: 'ci-tooling-security', lens: `The mutation tooling, its workflow and security. Specifically: (1) the gate: strictly above 85%, equivalents kept in the denominator as Survived, an unexplained survivor fails, a stale equivalent fails, a missing canary verdict fails, a partly-run package fails, reviewedBy/reviewedOn required; try to make it pass when it should fail; (2) affected.ts: can any change to code a money package's tests depend on (source, a workspace package, a fixture or content file a test reads, a third-party package in the closure, the test tooling, a lockfile move) skip mutation? Try concrete diffs; (3) the canary proves the runner selects tests by name, kills import-time mutants as errors not survivors, resolves workspace aliases to the sandbox, and seeds fast-check; (4) mutation.yml: triggers exactly as designed, the gate job named "mutation" (a required check), if/needs/always correct so a skipped or cancelled shard cannot pass, timeouts, concurrency group prefixed by the workflow's own name, permissions contents: read, no pull_request_target, artifacts overwrite: true, nothing a PR can poison for a push run; (5) workflows.test.ts's mutation block asserts what the design says; (6) the documents (ADR 0066 Part 4, ADR 0064/0047, PRD 17/18, reconciliation-001's F6 exception, the runbook) say exactly what the code does; (7) the rule-6 merge with ci-speed: list each shared file and whether its later merge is mechanical.` },
]

phase('Review')
const reviews = await parallel(REVIEWS.map(r => () =>
  agent(`${CTX}

You are an adversarial reviewer of draft PR #${integ.pr_number} (co-001/ci-mutation, head ${integ.head}) against claude/build-platform (49514e8). Assume it is wrong somewhere and find where. Work in your own fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${OUT}/review-${r.key} && cd ${OUT}/review-${r.key} && git checkout -q ${integ.head}, then pnpm install --frozen-lockfile --prefer-offline; remove the clone when you finish. Read-only: no commit, no push, no GitHub comment. The build summary is ${OUT}/build-summary.md. Verify claims yourself.

Your lens: ${r.lens}

Every finding with evidence (file:line, a command and its output, or a CI job id) and a concrete fix. Severity: blocking, should_fix, nit. Write your full review to ${OUT}/review-${r.key}.md and return the structured result.`,
    { label: `review:${r.key}`, phase: 'Review', schema: FINDINGS_SCHEMA })))
const missingR = REVIEWS.filter((r, i) => !reviews[i]).map(r => r.key)
if (missingR.length) throw new Error('A review returned nothing: ' + missingR.join(', ') + '. Refusing to report an unreviewed PR as reviewed.')

return {
  pr: { number: integ.pr_number, url: integ.pr_url, head: integ.head, scores: integ.scores, equivalents: integ.equivalents, checks: integ.checks, deviations: integ.deviations_from_design, open_items: integ.open_items, summary_path: integ.summary_path },
  builders: built.map(b => ({ role: b.role, head: b.head, scores: b.scores, deviations: b.deviations_from_design, open_items: b.open_items })),
  reviews: reviews.map(r => ({ reviewer: r.reviewer, head: r.head_reviewed, ci_read: r.ci_read, counts: { blocking: r.findings.filter(f => f.severity === 'blocking').length, should_fix: r.findings.filter(f => f.severity === 'should_fix').length, nit: r.findings.filter(f => f.severity === 'nit').length }, findings: r.findings })),
}
