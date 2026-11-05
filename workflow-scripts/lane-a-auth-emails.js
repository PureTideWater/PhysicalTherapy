export const meta = {
  name: 'acting-s4-auth-emails',
  description: 'auth emails: the branded Cognito code email and a "password changed" email; design, build red first with shots, draft PR, security and UX/brand reviews with skeptics, one fix round with the full suite, verification on CI',
  phases: [
    { title: 'Design', detail: 'the mechanism, the words, the job' },
    { title: 'Build', detail: 'red first; renders; draft PR' },
    { title: 'Review', detail: 'security and UX/brand; skeptics' },
    { title: 'Fix', detail: 'one fix round, full suite once, base merge, one push' },
    { title: 'Verify', detail: 'CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/mail'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/auth-emails'
const BR = 'co-001/auth-emails'
const DESIGN = '/home/user/ops/designs/lane-a-auth-emails.md'
const STATUS = '/home/user/ops/approval-summaries/lane-a-auth-emails-status.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}) on Lane A's account. Item: the branded code email and the "password changed" email, one UX item. Branch ${BR} (local only so far), worktree ${WT} (base f185655c, installed). Status: ${STATUS} (read it first). Read ${WT}/CLAUDE.md (the four rules and the Never list bind you: no PHI in an email body, job payload, log, URL or error; log IDs; every mutation with a Zod schema, role check, practice-scoped transaction and an audit event; models never involved).
Sources, read them:
- /home/user/ops/designs/lane-b-ux-sign-in-recovery.md: section 2.5 (the proposed code-email words: subject "Your PaidWhole code"; body "Your code to choose a new PaidWhole password is {####}. Enter it on the page that sent it within 15 minutes. If you did not ask for it, ignore this email: your password is unchanged."), the "Lane A or the founder" handoffs (a "your password was changed" email: a worker job carrying user_id only), and the note that without a CustomMessage trigger Cognito's forgot-password email shares the pool's verification template, so reset-specific words must be checked against the other verification messages (invitation, attribute verification, admin-created user).
- The code: infra/lib/constructs/identity.ts (the user pool; Cognito mail through SES on the transactional stream), apps/web/src/lib/auth/ (provider.ts, cognito-provider.ts, dev-provider.ts and its outbox; the reset flow's confirmPasswordReset and any settings password change), apps/worker/src/platform/ (mail-events.ts, support-notices.ts, wiring.ts), the mail outbox and templates (find where branded transactional email is rendered and sent; ADR 0065 three SES streams and the outbox; ADR 0058 email art from the static host, the brand's colors, fonts and words held by checks, the header compared with baselines; ADR 0081 sign-in step limits), packages/brand, tools/brand-copy (COPY_ROOTS / COPY_FILES), .claude/rules/brand.md, docs/brand/BRAND.md, docs/runbooks/support-mail.md.
The best option rule (CLAUDE.md conventions): choose on accuracy, security, privacy, UX, reliability and maintainability, never on build effort. Anything that is the founder's or the brand owner's decision (a new domain-model table or migration, a new AWS resource class with a cost, a change to words the co-founder already ruled on) is NOT decided by you: design it, record it as an open question for the orchestrator in the design, and build the part that needs no such decision. A migration needs the founder's domain-model approval (CO-02), so if the best design needs one, say so plainly and propose the no-migration path for this PR.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Database: postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18.4, as CI). Heavy commands (install, tests, e2e, synth, build, cdk synth) under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators (pnpm db:domain-model, synth, brand baselines' own update command, cdk snapshots' own update). Never edit LANES.md, lanes/*.md, HANDOFF.md, content/releases/** or an applied migration. No model identifier and no PHI in any text; synthetic data only. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; the PR body only through mcp__github__create_pull_request / update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it. Do not return until your task is complete; never return with a background job of yours still running.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Design')
const design = await agent(`${COMMON}

DESIGN ${DESIGN} (new file; do not commit). Decide and record, with file:line evidence:
1. The code email's mechanism: (a) the pool's verification template in identity.ts (one shared text for every verification code), or (b) a CustomMessage Lambda trigger giving each trigger source its own words (CustomMessage_ForgotPassword, _AdminCreateUser invitation, _ResendCode, _UpdateUserAttribute, _VerifyUserAttribute, _Authentication if MFA email is off), or another. Which messages this pool actually sends (self sign-up is off; recovery by email only; email MFA off). Whether HTML with the brand header (ADR 0058) or plain text is right for a code email (deliverability, the code as the first readable thing, the brand checks). The cost, latency and failure mode of each (a Lambda failure blocks the code). Pick the best and say why; if it needs a new AWS resource class or cost the founder has not approved, record it as an open question and say what this PR builds meanwhile.
2. The words for every message the pool sends, from section 2.5 for the reset code, and branded words for the others in the same voice (BRAND.md's voice; no PHI; no link in a code email unless the brand rules say so). The dev twin's outbox must use the same words, so the e2e reads the code as production delivers it.
3. The "password changed" email: what triggers it (the reset's confirm, and any other password change path), how it is enqueued (a pg-boss job carrying user_id only, singleton key; or the outbox of ADR 0065), how the worker looks up the address under RLS, which stream and template it uses, its words (what changed, when in UTC words, what to do if it was not you: the support route from docs/runbooks/support-mail.md), the audit event, the log line (IDs only), retries and idempotency, and what happens if sending fails (never block or undo the reset). Whether it needs a migration (it should not); if the best design needs one, say so and give the no-migration path.
4. Tests, each failing first: the words (a unit or snapshot test of every template, held by tools/brand-copy if it reads those files), the CDK assertion for the template or trigger, the job enqueue on confirm (db test), the worker job (db test: looks up under RLS, sends once, records delivery, no PHI in payload or log; tools/lint-logs), the e2e reset journey reading the code from the twin's outbox with the new words, and the password-changed message in the outbox.
5. What to render for the review: each email as HTML and text in ${SP}/renders/ (and a PNG of each HTML at 600 and 390 px wide in light; the email client's dark rendering is out of scope unless the brand says otherwise).
6. Risks: the shared-template trap, the code placeholder Cognito requires ({####}), length limits on Cognito templates, SES configuration set, and anything that changes for invited users.
${SAVE('design.progress.md', 'findings and decisions')}
Return the decision, the words, the job design, the open questions for the orchestrator, the test plan and the file list.`, { label: 'design', phase: 'Design' })

phase('Build')
const build = await agent(`${COMMON}

BUILD from the design (${DESIGN}):
${design}
Build only what needs no founder or brand-owner decision; leave any open question in the design and the PR description.
1. Failing-first: for each behaviour, commit its test, run it red for the stated reason (logs in ${SP}/logs/), then commit the change and run it green. One concern per commit.
2. Run under the lock: typecheck; lint; lint:copy; lint:logs; verify-content; the unit tests of what you touched; the touched db tests on 5433; the infra tests (cdk assertions, snapshot update only by its own command); the e2e reset journey and any mail spec as CI runs them.
3. Render every email (HTML and text) into ${SP}/renders/ with INDEX.md, and PNGs of each HTML at 600 and 390 px (Playwright; synthetic data).
4. Push: git push -u origin ${BR}. Open a DRAFT PR, head ${BR}, base claude/build-platform, title "Sign-in: Cognito's code email in PaidWhole's words, and a \\"password changed\\" email". Write the description from ${WT}/.github/pull_request_template.md, every section included: the design decision, the words of every message, the job, the red-then-green evidence, the checks, the renders index, the open questions, and what it does not change (no migration unless stated, no PHI). Read it back and compare; restore the footer once if it was rewritten.
${SAVE('build.progress.md', 'each step, head and PR number')}
Return the PR number, the head, the red/green evidence, the checks, the renders index and the open questions.`, { label: 'build', phase: 'Build' })

phase('Review')
const reviewSpecs = [
  { key: 'security', brief: `${WT}/.claude/agents/security-reviewer.md`, focus: 'tenant isolation and RLS in the worker lookup; PHI or an address in a job payload, log, error, URL, S3 key or email subject; the code email cannot leak whether an account exists (the reset request resolves the same for every address); the password-changed email cannot be triggered by another user or replayed; a send failure never blocks or undoes the reset; idempotency and singleton keys; the audit event; the Lambda or template cannot be abused (injection into the template from user attributes); the CDK change does not widen IAM; secrets and the SES identity.' },
  { key: 'ux-brand', brief: `${WT}/.claude/agents/ux-brand-reviewer.md`, focus: `the words of every message against BRAND.md's voice and the design's section 2.5 (the 15 minutes; never the provider's hour); the code as the first thing read; no PHI; the support route; the renders in ${SP}/renders/ (LOOK at each PNG with Read); plain text and HTML agree; the brand checks (tools/brand-copy) hold the new words; the invited user's and the other verification messages still make sense.` },
]
const reviews = await parallel(reviewSpecs.map(r => () => agent(`${COMMON}

You are the ${r.key.toUpperCase()} ADVERSARIAL REVIEWER of the PR (${build}). First read ${r.brief} and follow it as your brief. Read the diff (git -C ${WT} diff origin/claude/build-platform...HEAD), read only; run tests if you need evidence (under the lock). Focus: ${r.focus} Findings B/S/N with a concrete failing scenario each; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE(`review-${r.key}.progress.md`, 'findings')}`, { label: `review:${r.key}`, phase: 'Review', schema: FINDINGS }).then(x => (x ? x.findings.map(f => ({ ...f, id: `${r.key}-${f.id}` })) : []))))
const all = reviews.filter(Boolean).flat()
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this finding on the PR (${build}). It is real only if you confirm it from the code (and the renders, for words). You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Fix')
const fix = await agent(`${COMMON}

The FIX ROUND for the PR (${build}). Confirmed findings (nits included; apply each nit that is cheap and right, record the rest with a reason): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, why: f.verdict && f.verdict.reason })))}
1. Apply the confirmed findings in small commits, red then green where testable. Re-render any email that changed.
2. Merge the base ONCE: git fetch origin claude/build-platform; git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines); skip it only when FETCH_HEAD is already contained in HEAD.
3. Run the FULL local suite once on that final tree, under the lock, with each step's result in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test; test:golden; db:migrate then the db project in 4 shards (pnpm exec vitest run --project db --shard=i/4); the infra tests; synth --all and tools/screening-capacity/watched.ts --write (tree clean after); actions:check; build and the stamp (apps/web scripts/build-stamp.ts --write <head>); test:e2e whole with E2E_PREBUILT=1 E2E_DATABASE=tp_mail_e2e E2E_PORT=3153 E2E_ADMIN_URL=<db url> --workers=2. A failure you can tie to this change: fix and re-run that step. A failure you cannot (a known flake): re-run that step once and record both. THE SUITE MUST FINISH BEFORE YOU RETURN: run it in the background and wait for its completion notice.
4. Push once.
5. Update the description: every finding with its disposition, the suite results and the head. Read it back.
6. Write /home/user/ops/approval-summaries/lane-a-auth-emails-{review,fix-round}.md (short; do not commit).
${SAVE('fix.progress.md', 'each step')}
Return the head, the base merged, the dispositions, the suite results and the readback.`, { label: 'fix', phase: 'Fix' })

phase('Verify')
const ver = await agent(`${COMMON}

VERIFIER of the PR. Fix round: ${fix}
1. git ls-remote: the head is as reported (and contains every local commit in ${WT}), and the base tip is still the merged base (otherwise write "RE-MERGE NEEDED" and the new base).
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, with a background "sleep 240" between checks, for up to 90 minutes. The required checks (all green, mutation, screening-capacity gate, approval-of-record) must all be success. List every run; for a failure, the failing test and whether it is this PR's.
3. Fresh clone at the head into ${SP}/verify-clone: install under the lock; the touched unit, infra and db tests; git diff --stat against the merge base. Remove the clone afterwards.
4. The description's claims are true and the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-auth-emails-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict and the CI table.`, { label: 'verify', phase: 'Verify' })
return { design, build, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => f.id), fix, ver }
