export const meta = {
  name: 'acting-s4-ux-sign-in-recovery-build',
  description: 'UX PR 7 build: before shots on the base; slices A-E failing-first; integration checks; adversarial checker; push and draft PR',
  phases: [
    { title: 'Before', detail: 'before shots through the screen tour' },
    { title: 'Build', detail: 'slices A to E in order' },
    { title: 'Integrate', detail: 'all touched checks, e2e, axe' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Open', detail: 'push, draft PR' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7b'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/ux-sign-in-recovery'
const BR = 'co-001/ux-sign-in-recovery'
const DESIGN = '/home/user/ops/designs/lane-b-ux-sign-in-recovery.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting Lane B session S4 (${SESSION}) on Lane A's account. Item: UX PR 7, sign-in recovery. Branch ${BR}, worktree ${WT} (base df4daff7, installed). The design is ${DESIGN} (folded, final; read it whole). Its review is /home/user/ops/designs/lane-b-ux-sign-in-recovery-review.md; the scouts are in /home/user/ops/designs/lane-b-ux-sign-in-recovery/. Status: /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-status.md. Reserved: SGN-05 to SGN-08; ADR 0081 is amended, not a new number; synth module 19 (SGN) if needed. No migration (if one turns out to be needed, stop that part and record it "for Lane A"). The merge waits on the founder's runner (#102), since the PR touches capacity-watched paths. Run watched.ts --write whenever imports change.
Rules: CLAUDE.md's rules apply: synthetic data only, no PHI or email address in logs, URLs, errors or test names (use packages/synth twins), Zod, a role check where it applies, audit events. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, typecheck, lint, tests, e2e, browser, synth, build, the screen tour) only under flock /tmp/laneb-heavy.lock. Commit in ${WT} only, one concern each; every message ends with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators. No model identifier in any file, commit or PR text. Never comment, review, approve, mark ready or merge on GitHub; never write files through the connector. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Before')
const before = agent(`${COMMON}

BEFORE SHOTS for the UX and brand review. Read /home/user/ops/tools/lane-b-screen-tour/README.md, the "From another lane" section. Capture, on the BASE tree (a separate checkout or worktree at df4daff7 under ${SP}/base; do not touch ${WT}), the screens this PR changes: /sign-in (with each existing notice reason the design changes), /sign-in/mfa, /sign-in/hardware-key, and the locked notice. Shoot at 1280 px and 390 px light, and 1280 px dark. Name the files so the after shots can match them. Write ${SP}/shots-before/INDEX.md (screen, state, file). Remove the base checkout when done (keep the shots).
${SAVE('before.progress.md', 'shots taken')}
Return the index.`, { label: 'shots:before', phase: 'Before' })

phase('Build')
const SLICES = ['A (UXS-01 and the UX-066 locked words)', 'B (provider: interface, Cognito, dev twin, outbox)', 'C (flow and routes: Pending reset step, actions, rate limit, audit, sessions)', 'D (pages and words: /sign-in help list and link, /sign-in/forgot-password phases, StepTimer words prop, notices)', 'E (docs: ADR 0081 amendment, test-matrix SGN-05..08 and matrix.ts, synth cases, support-mail runbook section; the remaining tests)']
let prev = 'none yet'
const built = []
for (const s of SLICES) {
  const r = await agent(`${COMMON}

You BUILD slice ${s} of the design, exactly as section 7 orders it. The slices before you: ${prev}
Failing-first: commit the slice's test first. Run it red, for the stated reason (save the log to ${SP}/logs/), then make it green. Run what the slice touches (the unit files, tsc on the touched projects, eslint on changed files, lint:copy when words change). Do not push.
${SAVE(`slice-${s[0]}.progress.md`, 'commits and checks')}
Return: the commits (sha and subject), the red/green evidence, the checks, and any deviation from the design with its reason.`, { label: `build:${s[0]}`, phase: 'Build' })
  built.push(r); prev = built.map((b, i) => `slice ${SLICES[i][0]}: ${b}`).join('\n')
}

phase('Integrate')
const integ = await agent(`${COMMON}

INTEGRATION of slices A to E (${prev}). Under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; pnpm synth --all and watched.ts --write (commit their output if the design's matrix rows need it; the tree must be clean after); pnpm exec vitest run --project unit apps/web (counts); the db tests the design names (pnpm db:migrate first); pnpm build; the e2e sign-in spec and the axe specs for /sign-in and /sign-in/forgot-password (E2E as CI runs them; read package.json); the browser tests for step-timer and action-form. Fix any failure in small commits (red, then green). List the changed files and which are capacity-watched. Do not push.
${SAVE('integrate.progress.md', 'each check and fix')}
Return: the head sha, the counts, and the watched files.`, { label: 'integrate', phase: 'Integrate' })

phase('Check')
const chk = await agent(`${COMMON}

ADVERSARIAL CHECKER of the unpushed build in ${WT} (git log df4daff7..HEAD). Integration: ${integ}
Do not commit. Try to break it against the design and the security rules. Do a known and an unknown address answer alike (words, status, timing class: run both)? Does a code reach an account with no second factor (SEC-B1)? Can the confirm step's email be swapped to dodge the rate limit? Is the second factor asked after a reset? Do sessions end? Is there any address, code or Cognito message in a log, URL or error? Does the Pending step expire correctly, and do "Use a different email" and "Back to sign in" end it? Are the words exactly the design's, and does focus move as designed? Are the SGN-05..08 rows and tests consistent? Mutate key guards in a scratch copy (the SEC-B1 gate, the floor, the email match) and confirm a test fails each time. Report B/S/N with evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the review ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check', phase: 'Check' })

phase('Open')
const shots = await before
const open = await agent(`${COMMON}

OPEN the draft PR. Integration: ${integ}
Checker: ${chk}
Before shots: ${shots}
1. Fix every real checker defect (verify each) in small commits, red then green; re-run what each touches.
2. git fetch origin claude/build-platform. Do NOT merge it now (the base is merged once, before the final push). Push: git push -u origin ${BR}.
3. Draft PR (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): head ${BR}, base claude/build-platform, draft true, title "Sign-in: forgot your password, a way back in from the sign-in page (UX PR 7)". Description from ${WT}/.github/pull_request_template.md, every section ("None" rather than omitted; required-checks markers exact), under 65,536 characters: what changes per screen, with the words; the security design (enumeration, timing floor, SEC-B1 gate, rate limit, sessions, MFA, logging); the provider calls (no IAM change); the tests (red first) and the SGN rows; ADR 0081 amendment; the design and its review (22 findings) as links on claude/build-ops; the departures D-1 to D-4 for the co-founder; the screening-capacity note (watched files; the merge waits on #102); what waits on a person (the founder's runner; Lane A's R-11 alarms and the email wording, which do not block). End exactly with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write ${SP}/pr-body.md, create it, read it back with pull_request_read, compare (restore the footer if rewritten).
${SAVE('open.progress.md', 'each step, head and PR number')}
Return the PR number, the pushed head sha, the readback result and the checker's dispositions.`, { label: 'open', phase: 'Open' })
return { shots, built, integ, chk, open }
