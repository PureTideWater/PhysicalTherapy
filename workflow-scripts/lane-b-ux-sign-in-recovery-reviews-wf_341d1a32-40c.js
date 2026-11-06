export const meta = {
  name: 'acting-s4-ux-sign-in-recovery-reviews',
  description: 'UX PR 7 (#108): security review and UX/brand review with after shots, skeptic per B/S finding, one fix round (S-3 ruling, base merge, full suite once, one push), verification on CI',
  phases: [
    { title: 'Review', detail: 'security; UX and brand with after shots' },
    { title: 'Skeptic', detail: 'refute each B/S finding' },
    { title: 'Fix', detail: 'one fix round: S-3, findings, base merge, full suite once, one push' },
    { title: 'Verify', detail: 'fresh clone, CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c'
const BSP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7b'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ux-sign-in-recovery'
const BR = 'co-001/ux-sign-in-recovery'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}) on Lane A's account. UX PR 7, sign-in recovery: draft PR #108, branch ${BR}, worktree ${WT}, head 6b25ed60, built on base df4daff7 (the base is now 881e2bbd or later). The design is /home/user/ops/designs/lane-b-ux-sign-in-recovery.md and its review is -review.md beside it. The build's records are in ${BSP}: check.md (the checker: S-1 and S-2 fixed, S-3 open, N-1 to N-7) and the progress/ and logs/ folders. The before shots are in ${BSP}/shots-before/ (INDEX.md; the tour spec patch tour-spec-locked-reason.diff; the TOUR_ONLY list in progress/before-tour-only.txt). The PR touches capacity-watched paths, so its screening-capacity gate measures; the repository is public again, so the runner has 4 CPUs and the gate can pass. The repository's rules require the required checks on a head that contains the current base (a merge was refused otherwise today). Sign-in is security: two adversarial reviews (security; UX and brand with shots), each B/S finding checked by a skeptic.
SESSION RULINGS (S4, as the design's owner):
(1) S-3 is TAKEN. In requestPasswordReset, catch a provider-send or audit-insert failure, log "password reset request failed" at error with { request_id, error_code } only, and answer code_sent like every other path. The floor still applies. Amend ADR 0081 A2 and design row 3.2 (3) to match. Write the tests red first: a throwing provider and a throwing audit insert each get the same answer and status as an unknown address, plus one error log with IDs only.
(2) N-1 is TAKEN: a test that tells timingSafeEqual from === in the dev twin, e.g. by spying on crypto.timingSafeEqual or checking equal-length mismatches through the comparison helper.
(3) The PR body's footer must end exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Write it only with mcp__github__update_pull_request, never gh; that path kept the footer on #106 and #107.
(4) N-7: the merge no longer waits on #102; it waits on the capacity gate's own result.
Rules: CLAUDE.md's rules (synthetic data only; no PHI or address in logs, URLs or errors). Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, typecheck, lint, tests, e2e, browser, build, synth, the screen tour) only under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators. No model identifier in any file or text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; never write files through the connector. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Review')
const LENSES = [
  { key: 'security', agentType: 'security-reviewer', focus: `SECURITY (sign-in): enumeration by answer, status, timing, cookies, redirects and error paths (including S-3 as built); code guessing and the rate-limit keys; the SEC-B1 gate; sessions after a reset (app sessions, the provider's global sign-out, in-flight auth); the Pending step's sealing, expiry and binding; CSRF and server-action protection; the audit events; logging (no address, code, masked destination or provider message); the dev twin not weaker than production in a way tests would miss; authorization in the handler; no PHI or address in a URL. Read CI on the head as far as it has run.` },
  { key: 'ux-brand', agentType: 'ux-brand-reviewer', focus: `UX AND BRAND with AFTER shots. Capture after shots on the PR head the same way the before shots were taken (/home/user/ops/tools/lane-b-screen-tour/README.md, "From another lane"; apply ${BSP}/shots-before/tour-spec-locked-reason.diff locally; the same TOUR_ONLY list, plus the new screens: /sign-in/forgot-password in both phases with each refusal and notice, the password_reset and password_reset_locked notices, and sign-in-hardware-key.key-step-closed), at 1280 and 390 light and 1280 dark, into ${SP}/shots-after/ with INDEX.md. Compare before with after, screen by screen. Review against .claude/rules/brand.md, CO-11, WCAG 2.1 AA with 2.2's additions (focus order and visibility, errors, labels, target size, redundant entry), what a refusal or a refresh keeps, and the words against the design (D-1 to D-4 included). Look at the PNGs yourself.` },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are the ${l.key.toUpperCase()} ADVERSARIAL REVIEWER of #108. Work in a fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git ${SP}/clone-${l.key}, then check out ${BR}'s head. Install under the lock for anything you run. Read only; remove the clone when done (keep shots). Focus: ${l.focus}
Findings B/S/N with where, a concrete scenario, evidence and the fix; "sound" lists what you checked and found sound.
${SAVE(`review-${l.key}.progress.md`, 'findings and what you checked')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS, agentType: l.agentType }).then(r => r ? { ...r, lens: l.key } : null)))
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))

phase('Skeptic')
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on #108. It is real only if you confirm it against the head (read it in the worktree, read only, or in a fresh clone). Give correctedFix if its fix is wrong or unsafe.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Skeptic', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`reviews: ${all.length} findings, ${confirmed.length} confirmed`)

phase('Fix')
const fix = await agent(`${COMMON}

You run #108's FIX ROUND (one round).
Confirmed findings (use correctedFix where one is given): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, title: f.title, why: f.verdict && f.verdict.reason })))}
Sound: ${JSON.stringify(reviews.filter(Boolean).map(r => ({ lens: r.lens, sound: r.sound })))}
1. Apply the session rulings (S-3, N-1) and every confirmed finding, in small commits, red then green. A finding that needs a migration or another lane's file becomes a proposal in ${SP}/proposals.md, not a change. A wording change follows brand.md; list each word change for the PR body.
2. Merge the base ONCE now: git fetch origin claude/build-platform, then git merge --no-ff FETCH_HEAD (a merge commit with the attribution lines). Resolve any conflict keeping both sides, regenerate with the generators, install if the lockfile moved.
3. Run the FULL local suite once on this final tree, under the lock, with counts in ${SP}/suite.md: pnpm typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test (whole unit project, browser included); pnpm test:golden; pnpm db:migrate then pnpm test:db (all shards, in order); pnpm build and the build stamp as CI writes it; pnpm test:e2e (whole, E2E_PREBUILT=1 as CI runs it); the axe specs; pnpm synth --all and watched.ts --write (clean); actions:check; tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform (run any shard it selects, as CI does). Fix any failure, red then green, and re-run it.
4. Push once: git push origin ${BR}.
5. Rewrite #108's description with mcp__github__update_pull_request: read it first, then fill every template section, the findings table with dispositions (the checker's, both reviews', S-3 and N-1 as the session's rulings), the word changes, the suite with counts, the before and after shots (index and paths), the head and the base, the screening-capacity note per ruling (4), and the exact footer (ruling 3). Read it back with pull_request_read and compare.
6. Write /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-{review-security,review-ux-brand,fix-round}.md (short; do not commit).
${SAVE('fix.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, the base merged, each finding's disposition, the suite counts, the readback result.`, { label: 'fix', phase: 'Fix' })

phase('Verify')
const ver = await agent(`${COMMON}

FRESH-CLONE VERIFIER of #108. Fix round: ${fix}
1. git ls-remote: the head is as reported; note the base tip. If the base moved past the merged base, say so (a re-merge is needed before the merge).
2. Wait for CI on the head to FINISH: pull_request_read get_check_runs, re-checked every few minutes with a background "sleep 240" (run_in_background), for up to 90 minutes. Do not return before every check run has finished or the time is up. List every run. Required, all must be success: all green, mutation, screening-capacity gate (it measures; quote the capacity job's runner line, verdict and S4 middle-run worst time, with any O9 sizing note), and approval-of-record. Read the unit, e2e and db logs for the SGN-05 to SGN-08 tests.
3. Fresh clone at the head: install under the lock; the sign-in unit and db tests (pnpm db:migrate first); the e2e sign-in spec; git diff --stat against the merge base.
4. Check the description's claims (head, counts, findings, footer exact); list stale sentences with exact replacements.
Write /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-verification.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>". Remove the clone.
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table, the capacity result and the corrections.`, { label: 'verify', phase: 'Verify' })
return { findings: all.length, confirmed: confirmed.map(f => `${f.id} ${f.severity} ${f.title}`), fix, ver }
