export const meta = {
  name: 'acting-s4-ux-sign-in-recovery-delta-ux',
  description: 'UX PR 7 (#108) at e156d948: after shots of the round-2 word and colour changes, a UX/brand delta check (skeptic per B/S), and the description updated with the delta result and the O9 note',
  phases: [
    { title: 'Delta', detail: 'shots of the changed states; UX and brand delta check' },
    { title: 'Skeptic', detail: 'refute each B/S finding' },
    { title: 'Record', detail: 'description: delta result and the O9 note' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7e'
const S7B = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7b'
const S7C = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c'
const S7D = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7d'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ux-sign-in-recovery'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}). UX PR 7, #108, branch co-001/ux-sign-in-recovery, worktree ${WT}, head e156d948, VERIFIED with CI green (record /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-verification-2.md). The second fix round (${S7D}/progress/fix.progress.md and the round 2 section of /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-fix-round.md) changed visible words and one colour: UXB-S1 (a fifth "No email?" item with a support mailto, confirm phase), UXB-S2 ("enter an email address"), UXB-N1 (the .pw-link-button colour, phase 2's "Back to sign in" in light and dark), UXB-N2 (the list order), UXB-N4 ("is still locked", titled "Password changed, account still locked"); departures D-5 to D-8. The earlier after shots (on 0bd5721a) are in ${S7C}/shots-after/ (INDEX.md, shots.json; the TOUR_ONLY list and the tour-spec patch are in ${S7B}: progress/before-tour-only.txt and shots-before/tour-spec-locked-reason.diff). The tour tool is /home/user/ops/tools/lane-b-screen-tour/README.md ("From another lane").
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands (the tour, builds) under flock /tmp/laneb-heavy.lock. Do not commit to ${WT} or change code. No model identifier in any text. Never comment, review, approve, mark ready or merge; gh only for search; the PR body only through mcp__github__update_pull_request (ToolSearch "select:mcp__github__pull_request_read,mcp__github__update_pull_request"). Long waits: run_in_background. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' }, shots: { type: 'string' } }, required: ['findings', 'sound', 'shots'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] }

phase('Delta')
const delta = await agent(`${COMMON}

First read ${WT}/.claude/agents/ux-brand-reviewer.md and follow it as your brief. Take AFTER SHOTS on e156d948 of only the states the round-2 changes touch: /sign-in/forgot-password phase 2 (the No-email list, the support line, Back to sign in) at 1280 and 390 light and 1280 dark; phase 1's malformed-email refusal at 1280 and 390 light; the password_reset_locked notice at 1280 and 390 light and 1280 dark; plus /sign-in default at 1280 light as a control. Put them in ${SP}/shots-delta/ with INDEX.md, and name them to match ${S7C}/shots-after/ where a state exists there. Then LOOK at each PNG (Read them) and compare with its 0bd5721a counterpart. Check that each fix does what its finding asked; that the words follow .claude/rules/brand.md and CO-11; contrast (both themes); focus and labels in the markup; and that nothing else changed. Findings B/S/N; "shots" is the index; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE('delta.progress.md', 'shots and checks')}`, { label: 'delta:ux', phase: 'Delta', schema: FINDINGS })

phase('Skeptic')
const fs = delta ? delta.findings.filter(f => f.severity !== 'N') : []
const judged = await parallel(fs.map(f => () => agent(`${COMMON}

Try to REFUTE this UX delta finding on #108 at e156d948 (read the shots in ${SP}/shots-delta/ and the code). It is real only if you confirm it. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Skeptic', schema: VERDICT }).then(v => ({ ...f, verdict: v }))))
const blocking = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)

phase('Record')
const rec = delta ? await agent(`${COMMON}

Update #108's description; do not change code. Read the live body with pull_request_read first and keep every section and the exact footer ("🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, ${SESSION}). Make these changes:
(1) In the screening-capacity section: on e156d948 the gate passed with "verdict: pass (time advisory)", the S4 middle-run times 50.1, 52.1 and 51.4 s against the 48 s line, and the O9 sizing note (52.1 s above 44 s). Add: "O9 is the consumer's size, a standing founder item (issue #41). Under Lane B's orchestrator's ruling of 2026-11-02 01:02 UTC it blocks the screening's launch, not a merge, as recorded on #90, #94 and #106; this PR changes neither the consumer nor the harness."
(2) In "What waits on a person": add the founder's O9 item, which does not block this PR.
(3) Replace the "after shots owed on e156d948" line with the delta result: the ${SP}/shots-delta/INDEX.md path and count, plus the delta findings (${JSON.stringify(delta.findings.map(f => ({ id: f.id, sev: f.severity, title: f.title })))}) and skeptic verdicts (${JSON.stringify(judged.filter(Boolean).map(f => ({ id: f.id, real: f.verdict && f.verdict.real })))}). For confirmed B/S, write "open, fixed before merge"; nits are recorded as follow-ups.
Write the new body to ${SP}/pr-body.md, update it, read it back and compare (it must be identical, under 65,536 characters). Then append the delta round to /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-review-ux-brand.md (do not commit).
${SAVE('record.progress.md', 'each step')}
Return the readback result and the body's length.`, { label: 'record', phase: 'Record' }) : 'delta agent returned nothing'
return { delta, blocking: blocking.map(f => `${f.id} ${f.severity} ${f.title} :: ${f.fix}`), rec }
