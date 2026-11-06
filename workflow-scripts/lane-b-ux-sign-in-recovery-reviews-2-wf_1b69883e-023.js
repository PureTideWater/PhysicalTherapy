export const meta = {
  name: 'acting-s4-ux-sign-in-recovery-reviews-2',
  description: 'UX PR 7 (#108) at 0bd5721a: the two reviews (security; UX and brand on the existing before/after shots), each B/S finding checked by a skeptic; a fix round only if confirmed (targeted re-check, one push); verification',
  phases: [
    { title: 'Review', detail: 'security; UX and brand' },
    { title: 'Skeptic', detail: 'refute each B/S finding' },
    { title: 'Fix', detail: 'only if confirmed findings' },
    { title: 'Verify', detail: 'CI on the head' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7d'
const S7B = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7b'
const S7C = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ux-sign-in-recovery'
const BR = 'co-001/ux-sign-in-recovery'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}). UX PR 7, sign-in recovery: draft PR #108, branch ${BR}, worktree ${WT}, head 0bd5721a (base 24531dc2 merged). CI is green on it; the full local suite ran on it (${S7C}/suite.md). The design is /home/user/ops/designs/lane-b-ux-sign-in-recovery.md, with -review.md beside it. The build checker's record is ${S7B}/check.md. The first review round FAILED to report (both agents ended without output). Partial security notes are in ${S7C}/progress/review-security.progress.md and ${S7C}/proposals.md (P-1: Cognito's public client and EMAIL_ONLY recovery let ForgotPassword be called directly, past the app's SEC-B1 gate; P-2). Before shots: ${S7B}/shots-before/ (INDEX.md, png/). After shots on 0bd5721a: ${S7C}/shots-after/ (INDEX.md, png/; 96). The fix round's records: /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-{fix-round,review-security,review-ux-brand}.md. Sign-in is security: two adversarial reviews, each B/S finding checked by a skeptic. Scope rule: infra/lib (Lane A's identity construct) and migrations are out of this PR; a finding there becomes a Lane A proposal, plus the text this PR must carry (ADR "Not covered", PR body).
Rules: CLAUDE.md's rules. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands under flock /tmp/laneb-heavy.lock. Commits in ${WT} only, one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify. No model identifier in any file. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; never write files through the connector; the PR body only through mcp__github__update_pull_request, and it must end exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Review')
const LENSES = [
  { key: 'security', brief: '.claude/agents/security-reviewer.md', focus: `SECURITY (sign-in), on head 0bd5721a: enumeration by answer, status, timing, cookies, redirects and every error path, S-3 as built included; code guessing and the rate-limit keys; the SEC-B1 gate. For P-1, decide whether the app's gate is bypassable through Cognito's public client (read infra/lib/constructs/identity.ts and the Cognito docs as you know them), whether that is new with this PR or already on the base, and what this PR must say or do. Also: sessions after a reset; the Pending step's sealing, expiry and binding; CSRF and server actions; audit; logging (no address, code or provider message); the dev twin vs production; authorization in the handler; no PHI or address in a URL.` },
  { key: 'ux-brand', brief: '.claude/agents/ux-brand-reviewer.md', focus: `UX AND BRAND from the shots that already exist: compare ${S7B}/shots-before/INDEX.md with ${S7C}/shots-after/INDEX.md, screen by screen, and LOOK at the PNGs yourself (Read them): 1280 and 390 light, 1280 dark. Check the new /sign-in/forgot-password phases, notices and refusals; the help list; the lost-factor lines; the locked words; the UXS-01 redirect. Review against .claude/rules/brand.md, CO-11, WCAG 2.1 AA with 2.2's additions (read the markup for focus, labels, error association, target size, redundant entry), what a refusal or a refresh keeps, and the words against the design (D-1 to D-4). Do not run the screen tour again unless a needed state has no shot; then take only that shot.` },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are the ${l.key.toUpperCase()} ADVERSARIAL REVIEWER of #108. First read ${WT}/${l.brief} and follow it as your brief. Read the head in ${WT} (read only: do not commit or edit there). Focus: ${l.focus}
Findings B/S/N with where, a concrete scenario, evidence and the fix; "sound" lists what you checked and found sound. You MUST finish by calling the StructuredOutput tool with your findings, even if there are none.
${SAVE(`review-${l.key}.progress.md`, 'findings and what you checked')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
const failed = LENSES.filter((l, i) => !reviews[i]).map(l => l.key)
if (failed.length) log(`review(s) returned nothing: ${failed.join(', ')}`)
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))

phase('Skeptic')
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this review finding on #108 at 0bd5721a. It is real only if you confirm it against the code (read only). Give correctedFix if its fix is wrong, unsafe or outside this PR's scope (then the in-scope part only, plus the Lane A proposal). You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Skeptic', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`reviews: ${all.length} findings, ${confirmed.length} confirmed; failed lenses: ${failed.join(',') || 'none'}`)

phase('Fix')
let fix = 'no fix round: nothing confirmed'
if (failed.length) {
  fix = `NOT RUN: review lens(es) ${failed.join(', ')} returned nothing`
} else if (confirmed.some(f => f.severity !== 'N') || confirmed.length) {
  fix = await agent(`${COMMON}

You run #108's SECOND FIX ROUND. Confirmed findings (use correctedFix where one is given): ${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, title: f.title, why: f.verdict && f.verdict.reason })))}
Sound: ${JSON.stringify(reviews.filter(Boolean).map(r => ({ lens: r.lens, sound: r.sound })))}
1. Apply each confirmed finding in small commits, red then green (nits too, if cheap and in scope). Anything out of scope goes to ${S7C}/proposals.md as a Lane A proposal, with the text this PR carries.
2. git fetch origin claude/build-platform. If it moved past 24531dc2, merge it once (a merge commit), resolve and regenerate.
3. Targeted re-check under the lock of what changed (the full suite already ran on 0bd5721a): typecheck; lint; lint:copy; lint:logs; check:fixtures; the touched unit, browser and db files; the e2e sign-in specs and axe if pages or words changed; synth --all and watched.ts --write (clean). Counts in ${SP}/recheck.md.
4. Push once (git push origin ${BR}).
5. Update #108's description: read it first, then record both reviews' findings with dispositions, the re-check and the new head; keep the exact footer. Read it back.
6. Overwrite /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-review-{security,ux-brand}.md with these reviews' real records, and append the round to -fix-round.md (do not commit).
${SAVE('fix.progress.md', 'each step and the pushed head')}
Return: the pushed head sha, the base, each finding's disposition, the re-check counts and the readback result.`, { label: 'fix', phase: 'Fix' })
}

phase('Verify')
const ver = failed.length ? 'NOT RUN' : await agent(`${COMMON}

VERIFIER of #108 after the reviews. Fix round: ${fix}
1. git ls-remote: the head (0bd5721a if no fix round ran), and the base tip. If the base moved past the head's merged base, say "RE-MERGE NEEDED".
2. If a new head was pushed, wait for CI on it to FINISH: pull_request_read get_check_runs, re-checked with a background "sleep 240" (run_in_background), for up to 90 minutes. List every run; the required checks (all green, mutation, screening-capacity gate, approval-of-record) must all be success. Quote the capacity job's verdict and its O9 note.
3. If a fix round ran, take a fresh clone at the head: install under the lock, then run the touched tests.
4. Check the description: the head, both reviews' findings, and the footer exact.
Write /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-verification-2.md (do not commit), ending "VERDICT: VERIFIED" or "VERDICT: NOT VERIFIED: <reasons>".
${SAVE('verify.progress.md', 'each step')}
Return the verdict, the CI table and any corrections.`, { label: 'verify', phase: 'Verify' })
return { failed, findings: all.map(f => `${f.id} ${f.severity} ${f.title}`), confirmed: confirmed.map(f => `${f.id} ${f.severity} ${f.title} :: ${f.verdict.correctedFix || ''}`), fix, ver }
