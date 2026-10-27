export const meta = {
  name: 'lane-b-test-flakes-reviews',
  description: 'Two adversarial reviews of PR #76 (test infrastructure; correctness of what each test still proves) in fresh clones, plus the payment-engine reviewer on the packets test',
  phases: [{ title: 'Review', detail: 'test infrastructure, correctness, payment-engine (packets test file)' }],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/908cdf80-b74d-5a46-a9bb-4f85bd47f11f/scratchpad'
const HEAD = '0577b73f'
const RULES = `Context: you work for Lane B of the PaidWhole build (lane rules /home/user/ops/LANES.md). PR #76 (branch co-001/test-flakes, head ${HEAD}) into claude/build-platform fixes three flaky tests and two siblings; tests only. Its design: /home/user/ops/designs/lane-b-test-flakes.md; its description: ${SP}/pr-body.md.
Rules for you:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH (the default node is 22).
- Work in your own fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy <dir> && git -C <dir> checkout -q co-001/test-flakes && confirm HEAD is ${HEAD}; then (cd <dir> && flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile --prefer-offline). If <dir> already exists from an earlier interrupted run of yours, reuse it.
- Heavy commands (install, tests, typecheck, lint, Stryker) only under the shared lock: flock /tmp/laneb-heavy.lock <command>, one at a time. Another workflow may share this 4-CPU machine.
- Never commit, push or comment on GitHub. Never change files outside your clone. Probe files you add in your clone end in -probe-tmp.test.ts.
- No model name or identifier in anything you write. Synthetic data only.
- Improve as you go: a better fix goes in your findings with the concrete change.
- Long commands: run_in_background and wait for the notification; the Bash tool refuses a long foreground sleep.`
const SAVE = (file) => `Save as you go: keep ${SP}/progress/${file} up to date with what you have checked and found. If it exists when you start, an earlier run of yours was interrupted: read it and continue from where it stopped.`

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'pass-with-findings', 'fail'] },
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
      where: { type: 'string' },
      claim: { type: 'string' },
      evidence: { type: 'string' },
      fix: { type: 'string' },
    }, required: ['severity', 'where', 'claim', 'evidence', 'fix'] } },
    checked: { type: 'array', items: { type: 'string' }, description: 'each thing verified, with the command or file:line' },
    summary: { type: 'string' },
  },
  required: ['verdict', 'findings', 'checked', 'summary'],
}

const LENSES = [
  { key: 'infra', clone: '/home/user/review-flakes-infra', prompt: `You are adversarial review 1 of 2: TEST INFRASTRUCTURE. Attack the mechanics:
- vi.setConfig({ testTimeout }) at module top of tools/test/workflows.test.ts in vitest 5.0.5: does it apply to every test of the file, including the nested run the simulated Dependabot test starts, and is it reset so no other file in the same worker inherits it (check pool isolation in vitest.config.ts and vitest's source)? Is 30 s justified by the measurements, and would a smaller or per-describe bound be better? Can the outer Dependabot test's 300 s budget now be exceeded where it was not before?
- The rerun property's examples: entry, counted apart by identity, with fast-check 4.10.2: does shrinking or replay (a failing seed with path) still work; does the example count within numRuns; does anything about vitest's module-level 'seen' map shared across the three properties break?
- CI: will the unit job (pnpm test = vitest run --project unit --coverage) behave the same; run the four changed files with --coverage under the lock and report their durations.
- Reproduce flake 1 yourself: run the nested-run's file on one CPU shared with eight busy loops (taskset -c 0 for the vitest and for 8 'while :; do :; done' loops, CI_TREE set to the clone so the Dependabot test skips), on the PR head (should pass) and with the vi.setConfig line removed (should time out). Kill the loops after.
- Sweep for anything this PR missed of the same patterns that a CI run could plausibly hit.
${SAVE('review-infra.md')}` },
  { key: 'correctness', clone: '/home/user/review-flakes-correct', prompt: `You are adversarial review 2 of 2: CORRECTNESS: what each changed test still proves. For each of the four files diffed against origin/claude/build-platform:
- State precisely what the test proved before and what it proves now. Does any change exclude a value the property should still be tested on, or let a real defect through? (CLAUDE.md: never loosen a test.)
- verifier.test.ts: the two preconditions against packages/packets/src/scan.ts (what reads as a code, a number, a date), facts.ts (what fills numbers and codes) and verifier/mismatches.ts (inInputs). Construct the boundary cases: a count of 10000, 99999, 100000, a count equal to a quoted code (the citation's quote text), a count equal to a year, in each alphabet kind. Run probes under the lock.
- denial-letter.test.ts: is excluding names 'Patient' and 'Name' exactly what the property cannot hold (packages/model-gateway/src/redact.ts order of redaction)? Probe with injected names.
- rerun-rule.property.test.ts: does EVERY_OUTCOME reach each outcome for the reason its comment says (play it step by step)? Does the pair step leave the invariants checked after every step? Is the random-run coverage claim (each outcome >= 28 per 3,000) right? Measure over at least 20 seeds.
- workflows.test.ts: does the timeout change what any test asserts?
${SAVE('review-correctness.md')}` },
]

phase('Review')
const reviews = await parallel(LENSES.map((lens) => () =>
  agent(`${RULES}\n\nYour clone: ${lens.clone}.\n\n${lens.prompt}`, { label: `review-${lens.key}`, phase: 'Review', schema: SCHEMA })))

const engine = await agent(`${RULES}

You are the payment-engine reviewer (.claude/agents/payment-engine-reviewer.md) for the one money-package file this PR touches: packages/packets/src/verifier.test.ts (a test file only; the verifier is a hard gate: any figure, date, code, count or identifier not in the input fails). Read it with packages/packets/src/verifier/*.ts, scan.ts and facts.ts in your clone /home/user/review-flakes-engine. Judge whether the two narrowed preconditions keep the gate's proof whole: is every count the verifier must flag still generated and checked? Then run the packets mutation shard and the gate as the repository runs them (read stryker/shards.json, package.json scripts and tools/stryker to find the commands; run under the lock, in the background, waiting for completion) on the PR head and report the shard's score and whether the gate passes; compare with the score on origin/claude/build-platform if the gate's baseline file records one. ${SAVE('review-engine.md')}`, { label: 'payment-engine', phase: 'Review', schema: SCHEMA, agentType: 'payment-engine-reviewer' })

return { reviews, engine }