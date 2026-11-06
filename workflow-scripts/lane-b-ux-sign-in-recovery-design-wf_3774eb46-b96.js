export const meta = {
  name: 'acting-s4-ux-sign-in-recovery-design',
  description: 'UX PR 7 (sign-in recovery) design: three scouts, writer, security and UX design reviews, skeptic per B/S finding, fold',
  phases: [
    { title: 'Scout', detail: 'code, provider and security, findings and copy' },
    { title: 'Write', detail: 'the design' },
    { title: 'Review', detail: 'security reviewer and UX reviewer at design; skeptics' },
    { title: 'Fold', detail: 'apply confirmed findings' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ux-sign-in-recovery'
const DESIGN = '/home/user/ops/designs/lane-b-ux-sign-in-recovery.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}) on Lane A's account. Item: UX PR 7, "Forgot your password: a way back in from the sign-in page". Branch co-001/ux-sign-in-recovery, worktree ${WT} (at base df4daff7, installed, no commits). Status file /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-status.md.
Sources (read them):
- /home/user/ops/designs/lane-b-ux-review.md "#### UX PR 7" (around line 254; file list, tests, what it leaves to others) and the findings it closes: UX-006 (C-005) parts (1), (5) and (2)'s line, and UX-066 (C-075). Grep the file for "UX-006" and "UX-066" and read each finding whole.
- #92 (UX PR 6, merged as 4eaf7124): its design (grep /home/user/ops/designs for "sign-in-time"), /home/user/ops/approval-summaries/lane-b-ux-sign-in-time-status.md, its review records, and /home/user/ops/lanes/lane-b-item-prompts-2026-11-01/ux-sign-in-time.md (the shared sign-in files). #92 left UXS-01 (the hardware-key step's redirect to the key surface) to this PR: find its text.
- docs/adr/0081* (shared with PR 6, amended here), the sign-in code under apps/web/src/app/sign-in, apps/web/src/lib/auth, apps/web/src/lib/routes/sign-in.ts, apps/web/src/lib/rate-limit.ts, the audit-event code, the e2e sign-in.spec.ts, .claude/rules (brand.md, edi or security rules, copy rules), the UX baseline review, docs/product/test-matrix.md (SGN rows; SGN-05 to SGN-08 are reserved for this PR) and LANES.md's claim row (the ux-forms row).
Constraints: CLAUDE.md's four rules and the never-list (no PHI or email address in a log, URL, job payload or error; log IDs; authorization in the handler and Postgres, not middleware alone; every mutation through a Zod schema, a role check, a practice-scoped transaction where it applies, and an audit event). Account-enumeration resistance: a known and an unknown address get the same answer and the same timing class. The rate limit uses the sign_in bucket. MFA is still required after a reset. Cognito ForgotPassword and ConfirmForgotPassword are public client calls (no IAM change); the dev provider mirrors them. The screening-capacity gate: this PR touches watched paths, so its merge waits on the founder (#102). Build it anyway, and don't try to avoid watched files at the cost of the right design.
Rules: read only, except the files your task names. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH. No model identifier in any file. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); continue from it if it exists.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Scout')
const SCOUTS = [
  { key: 'code', task: 'THE CODE: map the sign-in flow end to end as it is at df4daff7 (pages, server actions, routes, the provider interface and its two implementations, dev-store, pending-step sealing, step limits, sessions, rate-limit buckets, audit events, notices, copy keys, the hardware-key surface and UXS-01). Give file:line for every place PR 7 must change or add, plus existing tests (unit, browser, e2e, axe) to extend.' },
  { key: 'provider', task: 'THE PROVIDER AND SECURITY: Cognito ForgotPassword / ConfirmForgotPassword semantics (code delivery, expiry, attempts, the error codes, UserNotFoundException vs PreventUserExistenceErrors, the client settings the infra sets in infra/lib for the user pool client), what the dev provider must mirror, how a reset interacts with MFA and existing sessions (global sign-out? token revocation?), enumeration and timing, rate limits, audit events (names: password_reset_requested, password_reset_completed), logging, and where the email of the code is sent (Cognito, not our mail stream?). Read infra/lib for the user pool settings.' },
  { key: 'copy', task: 'THE FINDINGS AND COPY: quote UX-006 (all parts, mark which this PR closes), UX-066 and UXS-01 whole; the help line and lost-factor lines asked for; the brand and copy rules that apply (.claude/rules/brand.md, CO-11, words.ts, lint:copy); the screens to add or change and the states each needs (empty, refused, sent, code wrong, code expired, password rules, done); the accessibility needs (axe, focus, labels, error summary via ux-forms); the before-shots the UX review will need (tools/lane-b-screen-tour/README.md).' },
]
const scouts = await parallel(SCOUTS.map(s => () => agent(`${COMMON}

You are the ${s.key.toUpperCase()} SCOUT. ${s.task}
Write ${SP}/scout-${s.key}.md and return it.
${SAVE(`scout-${s.key}.progress.md`, 'what you read and found')}`, { label: `scout:${s.key}`, phase: 'Scout' })))

phase('Write')
const design = await agent(`${COMMON}

You WRITE the design ${DESIGN} (new file). Scouts:
${scouts.filter(Boolean).join('\n\n=====\n\n')}
Sections:
1. Scope and what this PR closes (UX-006 parts, UX-066, UXS-01), and what it leaves (UX PR 8, 65, 67, 75).
2. The flow, screen by screen, with each state and its exact words (brand rules).
3. The provider interface additions and both implementations, with Cognito's exact calls and error mapping.
4. Security: enumeration, timing, rate limit, codes, attempts, MFA still asked, sessions after a reset, audit events, logging, no PHI or address in a URL or log, CSRF or server-action protection.
5. The ADR 0081 amendment text.
6. Tests: unit, browser, e2e, axe, copy, with the SGN-05 to SGN-08 rows written in test-matrix style, and synth cases if the matrix needs them.
7. Files and slices for the builders, in order, each with its failing-first test.
8. The screening-capacity note (watched files; the merge waits on #102).
9. Risks and open questions, each with a recommended answer (take the safer option).
Keep it tight.
${SAVE('write.progress.md', 'sections written')}
Return a summary of the design.`, { label: 'write', phase: 'Write' })

phase('Review')
const LENSES = [
  { key: 'security', focus: 'SECURITY at design (the review asks for the security reviewer at design): enumeration and timing, code brute force and the rate limits, reset without MFA, session fixation and live sessions after a reset, the pending step, audit and logging, PHI or address in URLs or logs, CSRF, Cognito settings (PreventUserExistenceErrors, the code lifetime), the dev provider not weaker than production in a way tests miss, and authorization in the handler.' },
  { key: 'ux', focus: 'UX AND BRAND at design: the flow and words against UX-006, UX-066 and UXS-01, the brand and copy rules, WCAG 2.1 AA with 2.2 additions (focus, errors, labels, target size, redundant entry), what a refusal or a refresh keeps (ux-forms), mobile at 390 px, and whether the help line and lost-factor lines lead somewhere real.' },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are the ${l.key.toUpperCase()} REVIEWER of the design ${DESIGN} (read it whole, and the code it cites). Focus: ${l.focus}
Findings B/S/N with where, scenario, evidence and fix; "sound" lists what holds.
${SAVE(`review-${l.key}.progress.md`, 'findings')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this design finding on ${DESIGN}. It is real only if you confirm it against the design and the code; give correctedFix if its fix is wrong.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`design reviews: ${all.length} findings, ${confirmed.length} confirmed`)

phase('Fold')
const fold = await agent(`${COMMON}

FOLD the confirmed findings into ${DESIGN}. Use correctedFix where one is given.
${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, title: f.title, why: f.verdict && f.verdict.reason })))}
Write the review record /home/user/ops/designs/lane-b-ux-sign-in-recovery-review.md: each finding, its verdict and how the design takes it. Copy the scouts to /home/user/ops/designs/lane-b-ux-sign-in-recovery/scout-*.md. Do not commit.
${SAVE('fold.progress.md', 'findings applied')}
Return: the design's final summary, each finding's disposition, and any open question that needs a person (with the recommended answer).`, { label: 'fold', phase: 'Fold' })
return { design, findings: all.length, confirmed: confirmed.map(f => `${f.id} ${f.severity} ${f.title}`), fold }
