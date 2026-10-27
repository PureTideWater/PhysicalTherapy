export const meta = {
  name: 'lane-b-test-flakes-design',
  description: 'One design reviewer for the test-flakes item: the three flaky-test fixes and the sweep, against the worktree diff',
  phases: [{ title: 'Review', detail: 'one adversarial design reviewer reads the design, the diff and the code each fix rests on' }],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/908cdf80-b74d-5a46-a9bb-4f85bd47f11f/scratchpad'
const RULES = `Context: you work for Lane B of the PaidWhole build (CLAUDE.md is in your context; lane rules /home/user/ops/LANES.md). The item: three flaky tests on claude/build-platform and their siblings, tests only.
Rules for you:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH (the default node is 22).
- Heavy commands (tests, typecheck, lint) only under the shared lock: flock /tmp/laneb-heavy.lock <command>, one at a time; keep any run small (a single test file).
- Change no tracked file anywhere. Never run git add, commit, push, checkout, reset or stash. Temporary test files you create to probe go in the worktree only with a name ending -probe-tmp.test.ts and you delete them before you finish.
- No model name or identifier in anything you write.
- Improve as you go: if you see a better fix, say so concretely in your result.
- Save as you go: keep ${SP}/progress/design-review.md up to date with what you have checked and found, so an interruption loses nothing. If it already exists when you start, read it and continue from where it stopped.`

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'approve-with-changes', 'rework'] },
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
      where: { type: 'string' },
      claim: { type: 'string' },
      evidence: { type: 'string' },
      fix: { type: 'string' },
    }, required: ['severity', 'where', 'claim', 'evidence', 'fix'] } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'findings', 'summary'],
}

phase('Review')
const review = await agent(`${RULES}

You are the design's one reviewer. Read /home/user/ops/designs/lane-b-test-flakes.md whole, then the diff: git -C /home/user/test-flakes diff (four test files). Read the code each fix rests on: tools/test/workflows.test.ts (the nested run assertionsOn and the Dependabot test near line 2240, runScript, runNotify), vitest.config.ts, apps/worker/src/price/rerun-rule.property.test.ts and apps/worker/src/price/test-support/rerun-model.ts, packages/packets/src/verifier.test.ts with packages/packets/src/scan.ts, packages/packets/src/facts.ts and packages/packets/src/verifier/mismatches.ts, packages/model-gateway/src/functions/denial-letter.test.ts with packages/model-gateway/src/redact.ts.

Attack it adversarially. For each fix ask:
- Is it at the root?
- Does the test still prove everything it proved, and no precondition exclude more than the values the property genuinely cannot hold?
- Is the timeout justified by the measurements and does vi.setConfig({ testTimeout }) at module top level really apply to every test of the file in vitest 5 (check vitest's source under node_modules/vitest), including inside the nested run, and not leak to other files?
- Does the examples: entry really reach fast-check's predicate by identity (check fast-check's source for whether examples are cloned)?
- Does EVERY_OUTCOME still satisfy what the arbitrary allows, and does the pair step change what the second or third property explores in a harmful way?
- Is the random-run coverage check now sound (the claimed rates)?
- Are the denial-letter and the any-other-digits preconditions exact, missing no value they should exclude and excluding none they should not? Verify claims by reading code and, where cheap, by a small probe run under the lock.
- Is anything in the sweep's proposals actually provably flaky and should be fixed in this PR instead?

Return blocking findings only for real defects.`, { label: 'design-review', phase: 'Review', schema: SCHEMA })
return review