export const meta = {
  name: 'acting-s4-ux-sign-in-dark-frame',
  description: 'Dark sign-in frame links (UXD-N1): design with measured ratios, build red first, before/after shots, draft PR, one UX/brand review with skeptics, one fix round with the full suite, verification on CI',
  phases: [
    { title: 'Design', detail: 'the token choice with measured ratios' },
    { title: 'Build', detail: 'red first; shots; draft PR' },
    { title: 'Review', detail: 'UX and brand; skeptics' },
    { title: 'Fix', detail: 'one fix round, full suite once, base merge, one push' },
    { title: 'Verify', detail: 'CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dark'
const S7C = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c'
const S7E = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7e'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ux-dark-frame'
const BR = 'co-001/ux-sign-in-dark-frame'
const DESIGN = '/home/user/ops/designs/lane-a-ux-sign-in-dark-frame.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}) on Lane A's account. Item: the dark sign-in frame's links. Branch ${BR}, worktree ${WT} (base 9b237a93, installed). Status: /home/user/ops/approval-summaries/lane-a-ux-sign-in-dark-frame-status.md. The finding is UXD-N1 in /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-review-ux-brand.md: with data-theme="dark", the sign-in frame stays Paper (#F6F4EE) while --pw-link turns #8FB3F0, so the frame's links are about 1.9:1 and its h1s, lockup and Help heading are faint. It was so on the base before #108. Fix it within .claude/rules/brand.md and packages/brand's BRAND.md, using EXISTING tokens only (packages/brand/src/tokens.css, apps/web/src/app/brand.css). No new palette value: that is the brand owner's (ADR 0056, ADR 0058). Every text and link in the frame must meet 4.5:1 (large text 3:1) and focus indicators 3:1, in light and dark. Light must not change. Read ADR 0056's dark-mode notes (dark is tokens-only and advisory) and the e2e brand baselines (apps/web/e2e/brand*). The screen tour is /home/user/ops/tools/lane-b-screen-tour/README.md ("From another lane"). Earlier after shots of these screens are in ${S7C}/shots-after/ and ${S7E}/shots-delta/ (with INDEX.md), and the tour setup is in ${S7E}/tour-delta (reuse it).
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text in a new commit and NEVER adds to or changes .gitleaksignore.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, tests, e2e, the tour, build) under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators (brand baselines by their own update command, if the repo has one). No model identifier in any text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; the PR body only through mcp__github__create_pull_request / update_pull_request, ending exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Design')
const design = await agent(`${COMMON}

DESIGN ${DESIGN} (new file; do not commit). Find where the sign-in frame gets its Paper ground in dark (the layout and CSS selectors), and every element in the frame: links, link-buttons, headings, lockup, body text, field borders, focus ring, notices. Compute the contrast ratio of each element against its ground, before and after, for each option: (a) give the frame the dark ground (--pw-bg or the token BRAND.md pairs with Paper in dark) so everything reads together; (b) keep the Paper ground and use the light link and text tokens inside the frame in dark. Show the WCAG relative-luminance arithmetic. Pick the option that meets every threshold with existing tokens and matches BRAND.md's intent, and record why. Give the exact selectors, a failing-first test (an automated contrast check or a token-pair assertion; reuse the repo's contrast tooling if it has one, e.g. a brand test or axe color-contrast in an e2e dark run), the screens to shoot (the /sign-in states, /sign-in/forgot-password both phases, /sign-in/mfa, /sign-in/hardware-key, and the locked notice, at 1280 and 390 dark and 1280 light as controls) and the risks.
${SAVE('design.progress.md', 'measurements and decision')}
Return the decision, the ratio table and the plan.`, { label: 'design', phase: 'Design' })

phase('Build')
const build = await agent(`${COMMON}

BUILD from the design (${DESIGN}):
${design}
1. Take BEFORE shots on the base tree, in a separate checkout (${SP}/base) or by reusing the earlier shots where the state exists. Put them in ${SP}/shots-before/ with INDEX.md.
2. Failing-first: commit the test and run it red for the stated reason (log in ${SP}/logs/). Make the change, then run it green.
3. Run under the lock: typecheck; lint; lint:copy; the brand tests; the e2e brand and sign-in specs (as CI runs them, regenerating brand baselines only by the repo's own command and only if the design says they change); the tokens or CSS unit tests.
4. Take AFTER shots of the same states into ${SP}/shots-after/ with INDEX.md.
5. Push: git push -u origin ${BR}. Open a DRAFT PR, head ${BR}, base claude/build-platform, title "Sign-in: the frame reads in dark: links and headings meet contrast with existing tokens". Write the description from ${WT}/.github/pull_request_template.md, every section included: the finding, the ratio table, the decision, the test, the before and after shot indexes, and what is not changed (light, the palette). Read it back and compare; restore the footer once if it was rewritten.
${SAVE('build.progress.md', 'each step, head and PR number')}
Return the PR number, the head, the red/green evidence, the checks and both shot indexes.`, { label: 'build', phase: 'Build' })

phase('Review')
const review = await agent(`${COMMON}

You are the UX AND BRAND ADVERSARIAL REVIEWER of the PR (${build}). First read ${WT}/.claude/agents/ux-brand-reviewer.md and follow it as your brief. Compare ${SP}/shots-before/ with ${SP}/shots-after/, screen by screen, LOOKING at each PNG (Read them). Check the markup and CSS in the head (read only). Recompute the key ratios yourself. Check that light is unchanged, that nothing outside the sign-in frame moved, the focus ring in both themes, the hover and visited states, and brand.md. Findings B/S/N; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE('review.progress.md', 'findings')}`, { label: 'review:ux-brand', phase: 'Review', schema: FINDINGS })
const all = review ? review.findings : []
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this UX finding on the PR (${build}). It is real only if you confirm it from the shots and the code. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Fix')
const fix = review ? await agent(`${COMMON}

The FIX ROUND for the PR (${build}). Confirmed findings: ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, why: f.verdict && f.verdict.reason })))}
1. Apply the confirmed findings in small commits, red then green. Re-shoot any state that changed into ${SP}/shots-after/.
2. Merge the base ONCE: git fetch origin claude/build-platform; git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines).
3. Run the FULL local suite once, under the lock, with counts in ${SP}/suite.md: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test; test:golden; db:migrate then test:db (all shards); build and the stamp; test:e2e (whole, E2E_PREBUILT=1); synth --all and watched.ts --write (clean); actions:check.
4. Push once.
5. Update the description: the review's findings with dispositions, the suite counts and the head. Read it back.
6. Write /home/user/ops/approval-summaries/lane-a-ux-sign-in-dark-frame-{review,fix-round}.md (short; do not commit).
${SAVE('fix.progress.md', 'each step')}
Return the head, the base merged, the dispositions, the counts and the readback.`, { label: 'fix', phase: 'Fix' }) : 'review returned nothing: NOT RUN'

phase('Verify')
const ver = review ? await agent(`${COMMON}

VERIFIER of the PR. Fix round: ${fix}
1. git ls-remote: the head is as reported and the base tip is still the merged base (otherwise write "RE-MERGE NEEDED").
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, with a background "sleep 240" between checks, for up to 90 minutes. The required checks (all green, mutation, screening-capacity gate, approval-of-record) must all be success. List every run.
3. Fresh clone at the head: install under the lock; the brand tests; git diff --stat against the merge base (CSS, tests and docs only).
4. The description's claims are true and the footer is exact.
Write /home/user/ops/approval-summaries/lane-a-ux-sign-in-dark-frame-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict and the CI table.`, { label: 'verify', phase: 'Verify' }) : 'NOT RUN'
return { design, build, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => f.id), fix, ver }
