export const meta = {
  name: 'acting-s4-pricing-run-cutoff-finish',
  description: 'pricing-run-cutoff (#118): review the unpushed fix-round delta 82bafc0a..bf33d5b9 with a skeptic, full suite once, push, description, verification on CI',
  phases: [
    { title: 'Delta review', detail: 'adversarial review of the six fix-round commits; skeptics' },
    { title: 'Finish', detail: 'apply confirmed, full suite once, push, description' },
    { title: 'Verify', detail: 'fresh clone, CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/prc2'
const PRC = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/prc'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/pricing-cutoff'
const BR = 'co-001/pricing-run-cutoff'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}). PR #118, pricing-run-cutoff (money code). Branch ${BR}, worktree ${WT}. Origin's head is 82bafc0a (base 35422a92 merged), CI is green on it, and both reviews reported only nits. The fix round left SIX UNPUSHED commits, 82bafc0a..bf33d5b9: b51a2614 and 022bd261 (console: the suspension in force found by status_since in Postgres, a sweep fix), 488a07f3 and 93998d27 (rerunReasons fails closed for a run not found), 61480939 (the location's millisecond updatedAt dropped), and bf33d5b9 (docs on the cut-off when a load commits after it). Its suite died after typecheck. The earlier records are in ${PRC}: check.md, progress/, logs/, pr-body.md, suite.sh; the reviews are in progress/review-*.progress.md. Status: /home/user/ops/approval-summaries/lane-a-pricing-run-cutoff-status.md. FREEZE: packages/pricing/src stays untouched. Required checks: all green, mutation, screening-capacity gate, approval-of-record; the head must contain the current base.
The local test databases: use PostgreSQL 18.4 on localhost:5433 (postgres:test) for test:db, as CI does. The 5432 server is PostgreSQL 16, which fails three version-specific tests.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify. No model identifier in any text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; the PR body only through mcp__github__update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, then wait for the notification. Never return while a background command you started is still running; a result of "waiting on the background suite" is a failure. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Delta review')
const review = await agent(`${COMMON}

The ADVERSARIAL REVIEWER of the delta 82bafc0a..bf33d5b9 (read ${WT}/.claude/agents/payment-engine-reviewer.md and ${WT}/.claude/agents/security-reviewer.md as your briefs). Read only, in ${WT}: do not commit or edit. Check:
- that each fix is correct and scoped, and that console.ts's suspension query keeps RLS, practice scoping and authorization in the handler;
- that rerunReasons fails closed without leaking whether another practice's run exists;
- that dropping updatedAt breaks no consumer (grep it);
- that every new test fails without its fix (mutate in a scratch copy);
- that nothing touches packages/pricing/src;
- that the docs are true.
Run the touched test files under the lock (db on 5433). Findings B/S/N; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE('review.progress.md', 'findings')}`, { label: 'review:delta', phase: 'Delta review', schema: FINDINGS })
const all = review ? review.findings : []
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this finding on the delta 82bafc0a..bf33d5b9. It is real only if you confirm it. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Delta review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Finish')
const fin = review ? await agent(`${COMMON}

FINISH #118. Confirmed delta findings: ${JSON.stringify(confirmed, null, 1)}
1. Apply the confirmed B and S findings in small commits, red then green (nits if they are cheap).
2. git fetch origin claude/build-platform. If it moved past 35422a92, merge it once (git merge --no-ff FETCH_HEAD, a merge commit with the attribution lines).
3. Run the FULL local suite once, on the final tree, under the lock (adapt ${PRC}/suite.sh, with db on 5433). Run each step in the foreground or wait for it, and record its counts in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test; test:golden; db:migrate then test:db (4 shards); build and the stamp; test:e2e (whole, E2E_PREBUILT=1); synth --all and watched.ts --write (clean); actions:check; the engine-freeze check; tools/stryker/affected.ts, running any shard it selects. If a test fails, root-cause it: fix it if it is this PR's, or show that it is not (it fails the same way on the base, or it is the known apps/worker/src/screening/threads.test.ts 5 s timeout), and record it.
4. Push (git push origin ${BR}).
5. Update #118's description: read it first, then cover both reviews' findings with dispositions (including the reviews' "Not run yet" rows), the fix-round commits, the delta review, the suite counts, the sweep table (console.ts fixed; the access-log cursor left to #49), and the head and base. Keep the exact footer. Read it back and compare.
6. Write /home/user/ops/approval-summaries/lane-a-pricing-run-cutoff-{review-payment-engine,review-correctness,review-delta,fix-round}.md (short; do not commit).
${SAVE('finish.progress.md', 'each step and the pushed head')}
Return the pushed head, the base, the dispositions, the suite counts and the readback.`, { label: 'finish', phase: 'Finish' }) : 'delta review returned nothing: NOT RUN'

phase('Verify')
const ver = review ? await agent(`${COMMON}

VERIFIER of #118. Finish: ${fin}
1. git ls-remote: the head is as reported (it must not be 82bafc0a, unless the finish says nothing changed), and the base tip is the merged base (otherwise write "RE-MERGE NEEDED").
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, with a background "sleep 240" between checks (wait for each), for up to 100 minutes. The required checks must all be success. List every run.
3. Fresh clone at the head: install under the lock; db:migrate on 5433; the cut-off regression test 20 times (counts); the engine-freeze check; git diff --stat against the merge base (nothing in packages/pricing/src).
4. The description's claims are true and the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-pricing-run-cutoff-verification.md (overwrite it; do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict and the CI table.`, { label: 'verify', phase: 'Verify' }) : 'NOT RUN'
return { findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => f.id), fin, ver }
