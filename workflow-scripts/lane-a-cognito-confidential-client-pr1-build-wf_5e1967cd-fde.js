export const meta = {
  name: 'acting-s4-cognito-cc-pr1-build',
  description: 'cognito-confidential-client PR 1: slices 1-5 red first (enrolment rule, invitation rule, SecretHash support, diff-role deny, R-11, ADR 0088, SEC-20..23), integration incl. infra tests and cdk synth, adversarial checker, push and draft PR',
  phases: [
    { title: 'Build', detail: 'slices 1, 2, 3, 3b, 4, 5 in order' },
    { title: 'Integrate', detail: 'checks, infra tests, cdk synth' },
    { title: 'Check', detail: 'adversarial checker' },
    { title: 'Open', detail: 'push, draft PR' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/cc1'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/cognito-cc'
const BR = 'co-001/cognito-confidential-client'
const DESIGN = '/home/user/ops/designs/lane-a-cognito-confidential-client.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}) on Lane A's account, a Lane A item at security priority. Branch ${BR}, worktree ${WT} (base 45d7d0c1, installed). The design is ${DESIGN} (folded, final; read it whole; its review is -review.md beside it, and the scouts are in /home/user/ops/designs/lane-a-cognito-confidential-client/). Status: /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-status.md. This branch is PR 1 ONLY (design section 9, slices 1 to 5): no change to the Cognito client, no secret, no rotation, no custom resource. Those are PR 2. Counters: ADR 0088 and test-matrix SEC-20 to SEC-23 (and synth matrix cases if the matrix needs them). No migration (if one turns out to be needed, stop that part and record it).
Rules: CLAUDE.md's rules (synthetic data only, no PHI or address in logs or URLs, Zod, role checks, audit events). Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, typecheck, lint, tests, synth, cdk synth, build, e2e) only under flock /tmp/laneb-heavy.lock. Commit in ${WT} only, one concern each; every message ends with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
Never amend, rebase, reset --hard, force or --no-verify; generated files only by their generators (synth, watched.ts --write). No model identifier in any file or text. Never comment, review, approve, mark ready or merge on GitHub; gh only for search; never write files through the connector. Long waits: run_in_background, no foreground sleep. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, continue from it.`

phase('Build')
const SLICES = ['1 (the enrolment rule)', '2 (the invitation rule)', '3 (SecretHash and credential errors, inactive without a secret; the start-up probe skipped while no secret is set)', '3b (the staging diff role denied DescribeUserPoolClient and ListUserPoolClientSecrets)', '4 (R-11: the log line, metric filters, alarms, the insight rule, the incident-response SQL)', '5 (ADR 0088 proposed, the ADR 0081 edits that hold now, SEC-20 to SEC-23 in the test matrix and its synth copy)']
let prev = 'none yet'
const built = []
for (const s of SLICES) {
  const r = await agent(`${COMMON}

You BUILD slice ${s} of the design (section 9, with the sections it points to). Slices before you: ${prev}
Failing-first: commit the slice's test first and run it red for the stated reason (save the log in ${SP}/logs/), then make it green. Run what the slice touches: the unit, db or infra test files, tsc on the touched projects, eslint on changed files, lint:copy when words change, lint:logs when log lines change, and for infra, pnpm --filter @tp/infra test. Do not push.
${SAVE(`slice-${s.split(' ')[0]}.progress.md`, 'commits and checks')}
Return the commits (sha and subject), the red/green evidence, the checks, and any deviation from the design with its reason.`, { label: `build:${s.split(' ')[0]}`, phase: 'Build' })
  built.push(r); prev = built.map((b, i) => `slice ${SLICES[i].split(' ')[0]}: ${b}`).join('\n')
}

phase('Integrate')
const integ = await agent(`${COMMON}

INTEGRATION of PR 1 (${prev}). Under the lock: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; pnpm synth --all and watched.ts --write (commit generator output if the matrix needs it; the tree must be clean after); pnpm exec vitest run --project unit apps/web (counts); pnpm db:migrate, then the db tests the design names (sign-in.db.test.ts, the invite routes, the console routes; counts); pnpm --filter @tp/infra test (counts); cdk synth as the repo runs it (pnpm cdk:diff with no credentials synthesizes every stack; record that each stack synthesizes, and the template differences against the base for the monitoring and diff-role changes); pnpm build; the e2e sign-in specs and the onboarding/invite specs the rules touch (as CI runs them). Fix any failure in small commits, red then green. List the changed files and which are capacity-watched. Do not push.
${SAVE('integrate.progress.md', 'each check and fix')}
Return the head sha, the counts, the synth result and the watched files.`, { label: 'integrate', phase: 'Integrate' })

phase('Check')
const chk = await agent(`${COMMON}

ADVERSARIAL CHECKER of the unpushed PR 1 in ${WT} (git log 45d7d0c1..HEAD). Integration: ${integ}
Do not commit. Try to break it against the design.
- The enrolment rule: can an active account with no factor, an orphan Cognito user, a lapsed invitation, a locked account, or a mismatched sub or email still reach a factor? Does a live invitation still work end to end?
- The invitation rule: can it re-invite onto a Cognito user that ever signed in?
- SecretHash: known-answer vectors, the username form per call, inactive when no secret is set, the secret never logged or serialised, and credential errors classified apart from a wrong password.
- The diff-role deny: is the action list literal and complete?
- R-11: do the metric filters match the real log fields, and do the alarms go to the existing topic?
- Enumeration through new refusals; the words; ADR 0088 vs the code; SEC-20..23 vs the tests.
Mutate the key guards in a scratch copy (the enrolment check, the sub match, the invitation check, the hash) and confirm a test fails each time. Report B/S/N with evidence and fix in ${SP}/check.md.
${SAVE('check.progress.md', 'what you checked')}
Return the review ending "VERDICT: clean" or "VERDICT: defects".`, { label: 'check', phase: 'Check' })

phase('Open')
const open = await agent(`${COMMON}

OPEN the draft PR. Integration: ${integ}
Checker: ${chk}
1. Fix every real checker defect (verify each) in small commits, red then green; re-run what each touches. A defect needing a design change outside PR 1 goes to ${SP}/proposals.md.
2. git push -u origin ${BR} (do not merge the base now).
3. Draft PR (ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): head ${BR}, base claude/build-platform, draft true, title "Sign-in: a second factor is enrolled only inside a live invitation, and the app is ready for a confidential Cognito client (PR 1 of 2)". Description from ${WT}/.github/pull_request_template.md, every section ("None" rather than omitted; the required-checks markers exact), under 65,536 characters: the threat (routes A1 to E1) and which PR 1 closes vs PR 2; the rules with their words; the SecretHash support (inactive until PR 2); the diff-role deny; R-11; ADR 0088 (proposed) and the 0081 edits; the tests red first and SEC-20..23; the synth results and template differences; the two-PR plan and why; the founder's items (F1 to F5 and rulings 13 to 16, needed before PR 2, not this PR); the design and review links on claude/build-ops; the screening-capacity note (watched files; the gate measures; the repository is public). Write it only with mcp__github__create_pull_request and update_pull_request, never gh. It must end exactly with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write ${SP}/pr-body.md, create the PR, read it back with pull_request_read and compare. If the footer was rewritten, restore it once with update_pull_request.
${SAVE('open.progress.md', 'each step, head and PR number')}
Return the PR number, the pushed head sha, the readback result and the checker's dispositions.`, { label: 'open', phase: 'Open' })
return { built, integ, chk, open }
