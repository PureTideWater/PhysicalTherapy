export const meta = {
  name: 'acting-s4-email-lockup-plate',
  description: 'email-lockup-plate: a fixed White plate behind the lockup in every worker email (O-5) and "If you asked more than once, use the newest code." in the reset email (O-8); build red first with inverted-client shots, draft PR, one UX/brand review with skeptics, one fix round with the full suite, verification on CI',
  phases: [
    { title: 'Build', detail: 'red first; renders; draft PR' },
    { title: 'Review', detail: 'UX and brand; skeptics' },
    { title: 'Fix', detail: 'one fix round, full suite once, base merge, one push' },
    { title: 'Verify', detail: 'CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/plate'
const MAIL = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/mail'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/email-plate'
const BR = 'co-001/email-lockup-plate'
const STATUS = '/home/user/ops/approval-summaries/lane-a-email-lockup-plate-status.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}) on Lane A's account. Item: email-lockup-plate, a small UX and brand PR. Branch ${BR} (local only so far), worktree ${WT} (base 0f4a5ed5, #125 merged, installed). Status: ${STATUS}. Read ${WT}/CLAUDE.md, .claude/rules/brand.md, docs/brand/BRAND.md (sections 3 and 7), ADR 0058 (email art from the static host; the header compared with baselines) and ADR 0081's code-email amendment (from #125).
LANE A'S ORCHESTRATOR DECIDED (2026-11-05 06:40 UTC, as the brand owner's delegate); do not re-open:
1. O-5: every worker email's lockup sits on a fixed White plate: a White (--pw-white, from packages/brand tokens; no new hex outside the token files) rounded rectangle behind the full-colour lockup, NOT a reversed variant. Email clients' forced inversion is undetectable and inconsistent, so a plate is the only rendering that holds in all of them. This covers every variant of apps/worker/src/mail/template.ts (customer, prospect, account) and any other worker email header that draws the lockup (check apps/worker/src/screening/message.ts and any other caller). Choose the plate's padding and corner radius from BRAND.md's spacing and radius tokens; build it with table/td markup and inline styles that survive Outlook, Gmail and Apple Mail (bgcolor attribute as well as background-color), and give the lockup img an explicit width and a White background too, so a client that inverts the cell still leaves the art legible.
2. O-8: the reset code email (packages/auth-mail, the CustomMessage_ForgotPassword words) adds the sentence "If you asked more than once, use the newest code." It is true whether or not Cognito invalidates earlier codes; "A new request replaces this code" is NOT verified and must not be written. Place it where it reads best (after "Enter it on the page that sent it within 15 minutes."), keep the plain-text and HTML parts equal, keep within Cognito's length limits, update every place that quotes the words (tests, snapshots by their own update command, ADR 0081's amendment, the dev twin's outbox, the test matrix's SGN-13/15 wording if it quotes them, and the design note /home/user/ops/designs/lane-a-auth-emails.md), and add to ADR 0081's staging smoke list: "request two reset codes and confirm whether the first still works; the email's words hold either way".
The earlier renders and their method are in ${MAIL}/renders/ (INDEX.md) and ${MAIL}/scripts/ (render-build.mts); reuse that method.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Database: postgres://postgres:test@localhost:5433/postgres. Heavy commands (install, tests, e2e, build) under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators (brand baselines by their own update command as docs/runbooks/ci.md describes; vitest snapshots with -u only after reading the diff). Never edit LANES.md, lanes/*.md, HANDOFF.md. No model identifier and no PHI; synthetic data only. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; the PR body only through mcp__github__create_pull_request / update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it. Do not return until your task is complete; never return with a background job of yours still running.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Build')
const build = await agent(`${COMMON}

BUILD:
1. BEFORE renders on the base tree: every worker email variant and the reset code email, HTML at 600 and 390 px, in a light client, a dark-preferred client and a forced-inversion client (say how each is emulated), into ${SP}/renders-before/ with INDEX.md. Reuse ${MAIL}/renders where it already is the base state.
2. Failing-first, one concern per commit: (a) a test that the header's lockup sits on the White plate (markup and inline styles, including bgcolor), red then green; (b) a test for the new sentence in the reset email (both parts, the length limit), red then green. Logs in ${SP}/logs/.
3. Run under the lock: typecheck; lint; lint:copy; lint:logs; the brand tests (packages/brand, tools/brand-copy, tools/brand-colors); the worker mail and screening message tests; packages/auth-mail; the infra tests if a snapshot carries the words; the e2e brand spec and the email-header baseline exactly as CI runs them (if the header baseline changes, regenerate it only by the repo's own command and commit it separately); the e2e reset journey.
4. AFTER renders of the same states into ${SP}/renders-after/ with INDEX.md, plus a pixel-change table.
5. Push: git push -u origin ${BR}. Open a DRAFT PR, head ${BR}, base claude/build-platform, title "Email: the lockup on a White plate in every worker email, and the reset email's newest-code line (O-5, O-8)". Description from ${WT}/.github/pull_request_template.md, every section: the two decisions and who made them, the markup, the red-then-green evidence, the checks, both render indexes with the inverted-client comparison, and what it does not change. Read it back; restore the footer once if it was rewritten.
${SAVE('build.progress.md', 'each step, head and PR number')}
Return the PR number, the head, the red/green evidence, the checks and both render indexes.`, { label: 'build', phase: 'Build' })

phase('Review')
const review = await agent(`${COMMON}

You are the UX AND BRAND ADVERSARIAL REVIEWER of the PR (${build}). First read ${WT}/.claude/agents/ux-brand-reviewer.md and follow it as your brief. Compare ${SP}/renders-before/ with ${SP}/renders-after/, LOOKING at each PNG (Read them), above all the forced-inversion ones. Read the diff (git -C ${WT} diff origin/claude/build-platform...HEAD), read only. Check: the lockup legible on its plate in every client; the plate's size, padding and radius from the brand's tokens; no new hex outside the token files; every worker email variant covered; the header baseline; the new sentence reads well, is in both parts, and nothing claims a replaced code; ADR 0081 and the design note quote the words exactly. Findings B/S/N; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE('review.progress.md', 'findings')}`, { label: 'review:ux-brand', phase: 'Review', schema: FINDINGS })
const all = review ? review.findings : []
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this UX/brand finding on the PR (${build}). It is real only if you confirm it from the renders and the code. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Fix')
const fix = await agent(`${COMMON}

The FIX ROUND for the PR (${build}). Confirmed findings (nits included; apply each nit that is cheap and right, record the rest with a reason): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, why: f.verdict && f.verdict.reason })))}
1. Apply the confirmed findings in small commits, red then green where testable. Re-render what changed.
2. Merge the base ONCE: git fetch origin claude/build-platform; git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines); skip it only when FETCH_HEAD is already contained in HEAD.
3. Run the FULL local suite once on that final tree, under the lock, with each step's result in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test; test:golden; db:migrate then the db project in 4 shards (pnpm exec vitest run --project db --shard=i/4); the infra tests; synth --all and tools/screening-capacity/watched.ts --write (tree clean after); actions:check; build and the stamp (apps/web scripts/build-stamp.ts --write <head>); test:e2e whole with E2E_PREBUILT=1 E2E_DATABASE=tp_plate_e2e E2E_PORT=3163 E2E_ADMIN_URL=<db url> --workers=2. A failure you can tie to this change: fix and re-run that step. A failure you cannot: re-run that step once and record both. THE SUITE MUST FINISH BEFORE YOU RETURN: run it in the background and wait for its completion notice.
4. Push once.
5. Update the description: the findings with dispositions, the suite results and the head. Read it back.
${SAVE('fix.progress.md', 'each step')}
Return the head, the base merged, the dispositions, the suite results and the readback.`, { label: 'fix', phase: 'Fix' })

phase('Verify')
const ver = await agent(`${COMMON}

VERIFIER of the PR. Fix round: ${fix}
1. git ls-remote: the head is as reported (and contains every local commit in ${WT}), and the base tip is still the merged base (otherwise write "RE-MERGE NEEDED" and the new base).
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, with a background "sleep 240" between checks, for up to 90 minutes. The required checks (all green, mutation, screening-capacity gate, approval-of-record) must all be success. List every run.
3. The description's claims are true and the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-email-lockup-plate-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict and the CI table.`, { label: 'verify', phase: 'Verify' })
return { build, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => f.id), fix, ver }
