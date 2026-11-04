export const meta = {
  name: 'acting-s4-pricing-run-cutoff',
  description: 'pricing-run-cutoff (money): full-precision cut-off in createPricingRun, class sweep, red-first db test, checker, draft PR, two reviews (payment engine; correctness) with skeptics, one fix round with the full suite, verification on CI',
  phases: [
    { title: 'Build', detail: 'red-first test, the fix, the sweep, the reproduction rates' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Open', detail: 'push, draft PR' },
    { title: 'Review', detail: 'payment engine; correctness; skeptics' },
    { title: 'Fix', detail: 'one fix round, base merge, full suite once, one push' },
    { title: 'Verify', detail: 'CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/prc'
const DBF = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dbflake'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/pricing-cutoff'
const BR = 'co-001/pricing-run-cutoff'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}), a Lane A item in money code: pricing-run-cutoff, branch ${BR}, worktree ${WT} (base c7bed0f7, installed, no commits). Status: /home/user/ops/approval-summaries/lane-a-pricing-run-cutoff-status.md (read it). Root cause: /home/user/ops/approval-summaries/lane-a-test-flakes-5/db-flake-root-cause.md. The reproduction scripts (gap.mjs, sametx.mjs) and logs are in ${DBF}/ and its scripts/ folder; read them as data and copy any you reuse into ${SP}. createPricingRun (apps/worker/src/price/create.ts:120-126) reads SELECT now() as a JS Date (milliseconds) and passes it as loadedBy to runPlans (lines.ts:39-46: l.created_at <= $4). The job reads the same cut-off as coalesce(lines_loaded_by, created_at)::text (execute.ts:241-243, :381; impact.ts:82). So a line committed within the same millisecond is missed only at creation, which gives false refusals ("a period that holds at least one service line", MAP-07 PricingRunNothingMapped). There is never a wrong allow, and no amount changes. Scope (orchestrator): keep the cut-off at full precision end to end. Compare against now() in SQL, or carry it as text, never as a JS Date, so the creation check and the job use the same value. Sweep the class: any other place in apps/ or packages/ that reads a timestamptz into a JS Date and then compares it with database timestamps (pass it back as a query parameter, or compare in JS against DB values). FREEZE: packages/pricing/src stays untouched (the engine freeze, tools/engine-freeze). If the fix needs the engine, stop and record it. CLAUDE.md's four rules hold: code computes every number; money is integer cents; pricing_run and priced_line are immutable. Test-matrix PRC-32 if a row is needed (the synth matrix copy and its fixture by the generator). Required checks: all green, mutation (Stryker runs on money packages; read tools/stryker/affected.ts to see which shards this touches), screening-capacity gate, approval-of-record. The up-to-date rule: the head must contain the current base.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: synthetic data only. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, tests, db, e2e, Stryker, build) under flock /tmp/laneb-heavy.lock; another agent shares it. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators. No model identifier in any text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; the PR body only through mcp__github__create_pull_request / update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Build')
const build = await agent(`${COMMON}

BUILD:
1. Failing-first db regression test in apps/worker/src/price: a service line whose created_at equals the creating transaction's instant (insert it in the same scope, or use the transaction's now()) must be among createPricingRun's lines. Also: what creation's runPlans sees must equal what execute reads for the same run. Commit it, run it red for the stated reason (log in ${SP}/logs/), and record how often it fails on the current code.
2. The fix, keeping the cut-off at full precision end to end. Prefer comparing against now() in SQL inside the same transaction, or reading now()::text and passing the text. The creation check and the job's cut-off must be provably the same value: the run's created_at is that transaction's now(). Keep pricing_run immutable and leave packages/pricing/src unchanged (check with the engine-freeze tool).
3. The sweep: search apps/ and packages/ for timestamptz values read into a JS Date (query<{...: Date}>, rows[0].x used as a parameter, new Date(row.x) compared with DB values) and then compared with database timestamps. Fix each real instance in its own commit with a test, red first. List every site checked and why each is safe or fixed.
4. Rates: rerun the synthetic reproduction (gap.mjs-style, 5000 iterations) against the old and the new cut-off reads, under the lock, and record "before 0.46% (23/5000), after 0%" or the new numbers. Commit no script outside tests, unless the repo has a place for such tools.
5. A PRC-32 matrix row if the new test needs one (test-matrix.md, synth's matrix.ts and registry.ts, the fixture by pnpm synth --all).
6. Under the lock: typecheck; lint; lint:logs; the touched unit and db test files (counts); the engine-freeze check; tools/stryker/affected.ts on the diff (which shards).
Do not push.
${SAVE('build.progress.md', 'each commit and check')}
Return: the head, the commits, the red/green evidence, the sweep table, the rates, and the checks.`, { label: 'build', phase: 'Build' })

phase('Check')
const chk = await agent(`${COMMON}

ADVERSARIAL CHECKER of the unpushed commits in ${WT}. Builder: ${build}
Do not commit. Break it. Does the regression test fail on the old code for the stated reason, and does it pass after? Mutate the fix back to a Date in a scratch copy. Is the creation cut-off now identical to the job's, the same transaction's now()? Could the change alter which lines any existing run prices, or the stored lines_loaded_by and created_at? Is packages/pricing/src untouched? Is the sweep complete? Grep yourself, and read each site. Are the rates measured, not assumed? Report B/S/N with evidence and the fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the review ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check', phase: 'Check' })

phase('Open')
const open = await agent(`${COMMON}

OPEN the draft PR. Builder: ${build}
Checker: ${chk}
1. Fix each real checker defect (verify it first) in small commits, red then green.
2. git push -u origin ${BR}.
3. Open a DRAFT PR, head ${BR}, base claude/build-platform, title "Pricing: a run's creation check reads the same full-precision cut-off as the job (a line loaded in the same millisecond is no longer missed)". Write the description from ${WT}/.github/pull_request_template.md, every section included. Cover: the defect and its effect (false refusals only, no amount), the callers, the CI flake that found it (run 41914482949) with a link to the root-cause record, the fix, the sweep table, the red-first test, the rates (0.46% before, 0% after), that the engine freeze holds, the Stryker shards, and the matrix row. Read it back and compare; restore the footer once if it was rewritten.
${SAVE('open.progress.md', 'each step, PR number')}
Return the PR number, the head and the readback result.`, { label: 'open', phase: 'Open' })

phase('Review')
const LENSES = [
  { key: 'payment-engine', brief: '.claude/agents/payment-engine-reviewer.md', focus: 'MONEY: arithmetic, rounding, windows and trace; the immutability of pricing_run and priced_line; what a run prices before and after the change (the same lines for the same cut-off); lines_loaded_by and created_at semantics, re-runs (create.ts:172) and impact.ts; the four rules; the engine freeze; and the Stryker shards and their scores on CI.' },
  { key: 'correctness', brief: '.claude/agents/security-reviewer.md', focus: 'CORRECTNESS AND CLASS SWEEP: timestamp precision end to end (node-pg Date parsing, text parameters, comparisons in SQL, the transaction instant); concurrency (a line committed between creation and the job); every other Date-from-timestamptz-to-query site in apps/ and packages/; the regression test\'s determinism; RLS and practice scoping unchanged; and the callers (routes/pricing.ts:438 and monitor/plan.ts:327) behaving correctly.' },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are the ${l.key.toUpperCase()} ADVERSARIAL REVIEWER of the PR (${open}). First read ${WT}/${l.brief} and follow it as your brief. Use a fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-${l.key}, then check out ${BR}'s head. Read only; remove the clone when done. Focus: ${l.focus}
Findings B/S/N; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE(`review-${l.key}.progress.md`, 'findings')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
const failed = LENSES.filter((l, i) => !reviews[i]).map(l => l.key)
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on the PR (${open}). It is real only if you confirm it against the head. Give correctedFix if the proposed fix is wrong. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Fix')
const fix = failed.length ? `NOT RUN: lens(es) ${failed.join(',')} returned nothing` : await agent(`${COMMON}

The FIX ROUND for the PR (${open}). Confirmed findings (use correctedFix where one is given): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, why: f.verdict && f.verdict.reason })))}
1. Apply them in small commits, red then green.
2. Merge the base ONCE: git fetch origin claude/build-platform; git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines).
3. Run the FULL local suite once, under the lock, with counts in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test; test:golden; db:migrate then test:db (all shards); build and the stamp; test:e2e (whole, E2E_PREBUILT=1); synth --all and watched.ts --write (clean); actions:check; the engine-freeze check; tools/stryker/affected.ts, running every shard it selects as CI does, with the mutation gate.
4. Push once.
5. Update the description: the findings with dispositions, the counts, the Stryker scores and the head. Read it back.
6. Write /home/user/ops/approval-summaries/lane-a-pricing-run-cutoff-{review-payment-engine,review-correctness,fix-round}.md (short; do not commit).
${SAVE('fix.progress.md', 'each step')}
Return the head, the base, the dispositions, the counts and the readback.`, { label: 'fix', phase: 'Fix' })

phase('Verify')
const ver = failed.length ? 'NOT RUN' : await agent(`${COMMON}

VERIFIER of the PR. Fix round: ${fix}
1. git ls-remote: the head is as reported, and the base tip is the merged base (otherwise write "RE-MERGE NEEDED").
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, with a background "sleep 240" between checks, for up to 100 minutes. The required checks must all be success. List every run, and quote the mutation gate's scores.
3. Use a fresh clone at the head: install under the lock; db:migrate; the regression test 20 times (counts); the engine-freeze check; git diff --stat against the merge base (nothing in packages/pricing/src).
4. The description's claims are true and the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-pricing-run-cutoff-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict and the CI table.`, { label: 'verify', phase: 'Verify' })
return { build, chk, open, failed, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => f.id), fix, ver }
