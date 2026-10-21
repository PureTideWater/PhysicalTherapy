export const meta = {
  name: 'co-001-ci-pin-runner',
  description: 'Pin every CI job to ubuntu-24.04 before GitHub moves ubuntu-latest to Ubuntu 26.04; test that refuses unpinned runners; two reviews, fix, fresh-clone verify',
  phases: [
    { title: 'Build' },
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'Verify' },
  ],
}

const WT = '/home/user/pr-ci-pin'
const BR = 'co-001/ci-pin-runner'
const SCRATCH = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/ci-pin'
const ACTIONLINT = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/gov-build/actionlint/actionlint'
const ENV = `Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. gitleaks is /tmp/claude-0/gitleaks/gitleaks. actionlint 1.7.7 is ${ACTIONLINT}. Postgres 18 is at postgres://postgres:test@localhost:5433/postgres (never stop either Postgres server). Logs go in ${SCRATCH}/.`
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`

const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT} on branch ${BR}, created from origin/claude/build-platform at fe470c1. GitHub's runner-images issue #14748 (announced 2026-09-17) moves the 'ubuntu-latest' label to Ubuntu 26.04 over several weeks starting 2026-10-19, finishing by 2026-11-19; 'ubuntu-24.04' stays available. Every job in .github/workflows/*.yml (ci.yml has 2, supply-chain.yml 2, large-zip.yml, publish-content.yml and release.yml 1 each) runs on 'ubuntu-latest'. The repo pins Playwright 1.56.1, which predates Ubuntu 26.04, and CI's unit tests print reports through Chromium, so a job that lands on 26.04 is likely to fail for a reason unrelated to the code, and every PR (PR 5 and PR 6 among them) would go red. The founder's audit (item #19) chose: today, pin every job to 'ubuntu-24.04', with a test that refuses 'ubuntu-latest'; the deliberate move to 26.04 together with the Playwright upgrade comes later in its own CI PR, NOT in this one. This PR changes workflows and their test only: no application code, no migration, no content, no pricing, no lockfile change. Main is the launch branch: never push to it or open a PR into it.`

const RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    head: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'head', 'checks'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
      severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
      failure_path: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'failure_path', 'fix'] } },
    verdict: { type: 'string' },
  },
  required: ['findings', 'verdict'],
}

phase('Build')
const build = await agent(`${CONTEXT}

${ENV}

Your task: build this pull request's change in ${WT}.
1. Replace every 'runs-on: ubuntu-latest' in .github/workflows/*.yml with 'runs-on: ubuntu-24.04'. Look for any other runner label too (a matrix, an include list, an expression, a reusable workflow or composite action under .github/) and pin it the same way. Add one short comment above the first runs-on in ci.yml saying why it is pinned and that the move to Ubuntu 26.04 comes with the Playwright upgrade in its own PR. Match the file's comment style.
2. Read tools/test/workflows.test.ts and extend it in its own idiom with a test that reads every file in .github/workflows (yml and yaml) and fails when any job's runs-on is missing, uses a '-latest' label, or is an expression that is not one this test can resolve to a pinned label. Parse the YAML the way the file already does, not with a regex over raw text, if it already parses YAML. Cover arrays and matrix values. Make sure the test fails on the base (prove it by running it against a copy with one 'ubuntu-latest' put back) and passes after.
3. Search docs/ (ADRs, runbooks), README and CLAUDE.md for statements about the CI runner that this makes untrue, and correct them in one line each if any exist. Add nothing else.
4. Run: pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint (use NODE_OPTIONS=--max-old-space-size=8192 if it runs out of heap); vitest run for tools/test/workflows.test.ts (find how the repo runs that project); pnpm test; ${ACTIONLINT} on every workflow file; gitleaks git --log-opts=origin/claude/build-platform..HEAD -c .gitleaks.toml (after committing). Fix anything this change broke.
5. Commit with a message in the repository's style (look at git log on origin/claude/build-platform: a lowercase area prefix and a sentence that says what changes and why, naming audit item #19). ${ATTR}
6. Push: git push -u origin ${BR}, retrying on network failure after 2, 4, 8 and 16 s. Do not open a pull request.
Return the summary, the pushed head SHA, every check with pass or fail, and anything left open.`, { label: 'build: pin runners and test', phase: 'Build', schema: RESULT })
if (!build) throw new Error('build failed')

phase('Review')
const reviews = await parallel([
  () => agent(`${CONTEXT}

${ENV}

You are an independent adversarial reviewer. The builder pushed ${BR} at ${build.head}. Builder's summary (a claim, not proof): ${build.summary}

Review the diff (git -C ${WT} diff origin/claude/build-platform...${build.head}) for correctness and completeness. Do not edit, stage or commit anything in ${WT}; work in a scratch copy under ${SCRATCH}/review-a if you need to run something.
- Is every runner under .github/ pinned, including any in a matrix, include list, expression, reusable workflow or composite action? Is anything else under .github that resolves to a moving image (container images, setup actions' defaults) relevant to this change? Report only what this PR should change.
- Does the new test actually fail when an unpinned label comes back, in every shape (plain, quoted, array, matrix, expression, a new workflow file, a .yaml file)? Prove it by running the test against modified copies. Does it pass vacuously if it finds no files or misparses a file?
- Does ubuntu-24.04 match what CI ran on before 2026-10-19 (ubuntu-latest was 24.04 then), so nothing else changes? Do the jobs' tool assumptions (Postgres 18 service container, Python 3.12 with pyx12, Node 24, Playwright 1.56.1's Chromium dependencies, docker buildx in supply-chain) still hold on 24.04?
- Are any doc statements now untrue, or was anything added beyond the founder's chosen scope?
Report each finding with file, line, a concrete failure path, and a fix. If nothing is wrong, say so with what you checked.`, { label: 'review: completeness and test strength', phase: 'Review', schema: FINDINGS }),
  () => agent(`${CONTEXT}

${ENV}

You are an independent adversarial reviewer. The builder pushed ${BR} at ${build.head}. Builder's summary (a claim, not proof): ${build.summary}

Review it from the angle "what would make GitHub CI reject this, now or when the open branches merge it". Do not edit, stage or commit anything in ${WT}; clone what you need into ${SCRATCH}/review-b.
- Re-read the diff adversarially: YAML validity, actionlint, comments in the wrong place, a test that depends on the working directory or on files outside the repo, Windows/macOS line endings, the repo's lint rules on the test file.
- The open branches will merge claude/build-platform after this lands: co-001/pr-05-packet-deadline (/home/user/pr5), co-001/pr-06-free-screening (/home/user/pr6) and co-001/governance (/home/user/governance, which adds .github/workflows/approval-of-record.yml with 'runs-on: ubuntu-latest' at line 27). For each, say exactly what the merge will need (a conflict, or the new test failing on a file that branch adds) so it can be handled there. Read only; do not edit those worktrees.
- Do the two existing tests that pin exact action versions, or anything in tools/test/workflows.test.ts, interact badly with the change?
- Is the commit message accurate, does it carry the attribution lines, and does gitleaks pass over the new commits?
Report each finding with file, line, a concrete failure path, and a fix. If nothing is wrong, say so with what you checked.`, { label: 'review: CI rejection and open branches', phase: 'Review', schema: FINDINGS }),
])
const all = reviews.filter(Boolean).flatMap(r => r.findings)
log(`${all.length} review findings`)

phase('Fix')
const fix = await agent(`${CONTEXT}

${ENV}

You are the fix round for ${BR} (head ${build.head}) in ${WT}. Two independent reviewers reported the findings below. Each is a claim to verify, not an order: reproduce it or trace a realistic path; fix the real ones in proportion; for each one you do not fix, say why. Findings about the OTHER branches (pr5, pr6, governance) are not fixed here: list them in open_items exactly as the merge into each branch will need them.

Findings:
${JSON.stringify(all, null, 2)}

Reviewers' verdicts: ${reviews.filter(Boolean).map(r => r.verdict).join(' | ')}

After fixing, rerun every check from the build (pnpm typecheck, pnpm lint, the workflows test, pnpm test, actionlint on every workflow, gitleaks over origin/claude/build-platform..HEAD). Commit in the repository's style with the attribution lines (${ATTR}) and push with the 2/4/8/16 s retry. If nothing needed fixing, push nothing. Do not open a pull request. Return the summary, the head SHA, every check, and the open items.`, { label: 'fix review findings', phase: 'Fix', schema: RESULT })
if (!fix) throw new Error('fix failed')

phase('Verify')
const verify = await agent(`${CONTEXT}

${ENV}

You are the fresh-clone verification for ${BR}. Expected head: ${fix.head}. Do not use or edit ${WT}.
1. git clone the repository from the remote URL that 'git -C ${WT} remote get-url origin' prints into ${SCRATCH}/verify (remove any old copy first), check out origin/${BR}, and confirm HEAD is ${fix.head}.
2. Confirm the diff against origin/claude/build-platform touches only .github/workflows, tools/test and, if any, one-line doc corrections; no lockfile, application, migration, content or pricing change.
3. Run, from the clean clone: pnpm install --frozen-lockfile; pnpm typecheck; pnpm lint (NODE_OPTIONS=--max-old-space-size=8192 if needed); pnpm test; the workflows test on its own; ${ACTIONLINT} over every workflow file; gitleaks git --log-opts=origin/claude/build-platform..HEAD -c .gitleaks.toml; grep that no 'ubuntu-latest' or other '-latest' runner label remains under .github.
4. Prove the guard: in the clone, put 'ubuntu-latest' back in one job, run the workflows test and confirm it fails with a clear message, then restore.
5. Delete ${SCRATCH}/verify when done.
Return the summary, the head you verified, and every check with pass or fail.`, { label: 'fresh-clone verification', phase: 'Verify', schema: RESULT })

return { build, reviews, fix, verify }
