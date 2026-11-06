export const meta = {
  name: 'acting-s4-cognito-cc-pr1-reviews',
  description: 'cognito-confidential-client PR 1 (#113): security review and infra/auth correctness review in fresh clones, skeptic per B/S finding, one fix round (base merge once, full suite once, infra tests, cdk synth, one push), verification on CI',
  phases: [
    { title: 'Review', detail: 'security; infra and auth correctness' },
    { title: 'Skeptic', detail: 'refute each B/S finding' },
    { title: 'Fix', detail: 'one fix round' },
    { title: 'Verify', detail: 'fresh clone, CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/cc2'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/cognito-cc-pr1'
const BR = 'co-001/cognito-confidential-client-pr1'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}), a Lane A item at security priority: cognito-confidential-client, PR 1 of 2. It is draft PR #113, branch ${BR}, worktree ${WT}, head 1234a47c on base c4941291. #112 is closed and superseded: never touch its branch co-001/cognito-confidential-client. The design is /home/user/ops/designs/lane-a-cognito-confidential-client.md (with -review.md and scouts beside it). The build's checker record is /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-pr1/check.md, with proposals.md beside it. Status: /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-status.md. PR 1 changes no Cognito client and sets no secret. It carries: the enrolment rule (MFA_SETUP only inside a live invitation, matched by sub and email), the invitation rule, SecretHash support that is inactive without a secret, the credential probe, the staging diff role's deny, the R-11 alarms, ADR 0088 (proposed) and SEC-20..23. Required checks: all green, mutation, screening-capacity gate, approval-of-record. The repository's rules require them on a head that contains the current base.
GITLEAKS RULE (the orchestrator, 2026-11-04): an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: CLAUDE.md's rules. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify. No model identifier in any text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; the PR body only through mcp__github__update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Review')
const LENSES = [
  { key: 'security', brief: '.claude/agents/security-reviewer.md', focus: 'SECURITY: Can any route still enrol a factor outside a live invitation? Check the sub and email match, orphan users, a lapsed or locked account, and a sealed step from the previous release. Check the invitation rule, and whether any refusal (Settings, console, sign-in) reveals that Cognito knows an address. Check SecretHash (the username form per call, inactive with no secret) and secret handling (never logged, serialised, bundled or put in an error). Check the credential probe and /api/health: what they reveal, and whether they fail open or closed. Check the diff-role deny list, and the R-11 filters for fields that could carry PHI or an address. Check authorization in the handlers and the audit events.' },
  { key: 'infra-auth', brief: '.claude/agents/security-reviewer.md', focus: 'INFRA AND AUTH CORRECTNESS: the CDK changes (metric filters matching the real log lines and fields, alarm thresholds and periods, the insight rule, the topic, the diff role\'s policy), the IAM pin tests, cdk synth of every stack against the base (no Cognito or identity resource changes), the auth flow\'s correctness for every Cognito challenge path (NEW_PASSWORD_REQUIRED then MFA_SETUP, SOFTWARE_TOKEN_MFA, the WebAuthn and hardware-key steps), the dev twin\'s fidelity, the deploy order for release N, and anything in PR 1 that a rollback from N to N-1 would break.' },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are the ${l.key.toUpperCase()} ADVERSARIAL REVIEWER of #113. First read ${WT}/${l.brief} and follow it as your brief. Work in a fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-${l.key}, then check out ${BR}'s head. Install under the lock for anything you run. Read only; remove the clone when done. Focus: ${l.focus}
Findings B/S/N with where, a concrete scenario, evidence and the fix; "sound" lists what holds. You MUST finish by calling StructuredOutput, even with no findings.
${SAVE(`review-${l.key}.progress.md`, 'findings and what you checked')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
const failed = LENSES.filter((l, i) => !reviews[i]).map(l => l.key)
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))

phase('Skeptic')
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on #113. It is real only if you confirm it against the head (read only: in the worktree or a fresh clone). Give correctedFix if its fix is wrong, unsafe or belongs in PR 2. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Skeptic', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`reviews: ${all.length} findings, ${confirmed.length} confirmed; failed lenses: ${failed.join(',') || 'none'}`)

phase('Fix')
const fix = failed.length ? `NOT RUN: review lens(es) ${failed.join(', ')} returned nothing` : await agent(`${COMMON}

You run #113's FIX ROUND (one round). Confirmed findings (use correctedFix where one is given): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, title: f.title, why: f.verdict && f.verdict.reason })))}
Sound: ${JSON.stringify(reviews.filter(Boolean).map(r => ({ lens: r.lens, sound: r.sound })))}
1. Apply each confirmed finding in small commits, red then green. A PR 2 matter, or one that needs a migration, goes to /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-pr1/proposals.md (do not commit).
2. Merge the base ONCE now: git fetch origin claude/build-platform; git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines); resolve and regenerate; then pnpm db:migrate if migrations came in.
3. The FULL local suite once on this final tree, under the lock, with counts in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test (whole unit project); test:golden; db:migrate then test:db (all shards, in order); pnpm --filter @tp/infra test; pnpm cdk:diff (no credentials: every stack synthesizes; compare the templates with the base's and record the resource differences); build and the build stamp; test:e2e (whole, E2E_PREBUILT=1 as CI runs it); synth --all and watched.ts --write (clean); actions:check; tools/stryker/affected.ts (run any shard it selects).
4. Push once (git push origin ${BR}). On a gitleaks refusal, follow the GITLEAKS RULE.
5. Update #113's description: read it first, then record both reviews' findings with dispositions, the suite counts, the synth differences, the head and the base, and the founder's items. Those are F0 (on staging running release N: invite a synthetic account, set its password, enrol a factor and sign in, before release N reaches production; it checks that Cognito's challenge names the user's sub), F1 to F5 and ruling 16 before PR 2, all with exact steps from the design. Keep the exact footer. Read it back and compare.
6. Write /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-pr1/{review-security,review-infra-auth,fix-round}.md (short; do not commit).
${SAVE('fix.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, the base merged, each finding's disposition, the suite counts, the synth differences and the readback result.`, { label: 'fix', phase: 'Fix' })

phase('Verify')
const ver = failed.length ? 'NOT RUN' : await agent(`${COMMON}

FRESH-CLONE VERIFIER of #113. Fix round: ${fix}
1. git ls-remote: the head is as reported; note the base tip. If the base moved past the head's merged base, write "RE-MERGE NEEDED".
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, re-checked with a background "sleep 240" (run_in_background), for up to 90 minutes. Do not return before every check run has finished or the time is up. List every run. The required checks must all be success. Quote the capacity job's verdict and its O9 note.
3. Fresh clone at the head: install under the lock; the auth unit and db tests (pnpm db:migrate first); pnpm --filter @tp/infra test; gitleaks the way the hook runs it over the PR's commits (none found); git diff --stat against the merge base; .gitleaksignore equal to the base's.
4. Check the description's claims, and that the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-pr1/verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>". Remove the clone.
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table and any corrections.`, { label: 'verify', phase: 'Verify' })
return { failed, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => `${f.id} ${f.severity} ${f.title}`), fix, ver }
