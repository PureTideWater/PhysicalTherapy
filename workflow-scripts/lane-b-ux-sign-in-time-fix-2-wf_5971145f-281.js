export const meta = {
  name: 'lane-b-ux-sign-in-time-fix-2',
  description: 'PR #92: apply UXR2-01, merge the latest base (#83), run the checks both touch, a skeptic',
  phases: [{ title: 'Fix' }, { title: 'Check' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4a9d4438-0635-51b1-98ea-4663abfca5c5/scratchpad'
const WT = '/home/user/ux-sign-in-time'
const NORETURN = `CRITICAL: your final message ends your run and kills every background process you started; never end your turn while a command runs in the background: wait on its notification or a blocking until-loop.`
const COMMON = `PR #92 of the PaidWhole build, branch co-001/ux-sign-in-time at b8654622 (worktree ${WT}), base claude/build-platform (now 43565235, #83 merged since bce57f16). UX PR 6: each sign-in step states its limit, warns before it closes, and starts again with the email kept (ADR 0081; SGN-01..04). Design /home/user/ops/designs/lane-b-ux-sign-in-time.md (section 9 wins). Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock; PostgreSQL 18 on 5433 (postgres:test). No migration, no #42 file except the three shared documents and generated files; words within .claude/rules/brand.md. No model name or identifier anywhere. ${NORETURN} Report every command with its result.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it exists, continue from it.`
phase('Fix')
const fix = await agent(`${COMMON}
${SAVE('sgn-fix2.md', 'each step and result')}
1. UXR2-01 (should-fix, upheld): once enrolment has closed, the setup key and its authenticator link still look usable directly under "This step has closed."; the words saying the key is dead sit below the fold. Apply the skeptic's fix: StepTimerProps gains cue?: { readonly closed?: string } (components/step-timer.tsx), limitPhrases uses cue?.closed ?? 'This step has closed.', and enroll/page.tsx passes cue={{ closed: 'This step and its setup key have closed.' }} (one line at 390 and 1280; the reserved cell must not grow a blank line in the open state: check). Tests in step-timer.test.tsx and the harness if the cell sizing is asserted there; the e2e enrolment closed state if it asserts the cue. Add the string to design 6.1 and a section 9 row for the second UX review (UXR2-01 applied; UXR2-02 refuted: dark has no switch, ADR 0056, an advisory for the dark-mode work).
2. Commit that fix in ${WT} (message: a short title, a body, then a blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: https://claude.ai/code/session_01FcouKNxVRK8x6iV52PfxXz").
3. Merge the latest base with a merge commit: git fetch origin claude/build-platform && git merge --no-ff origin/claude/build-platform (expected clean; if a shared document conflicts, keep both sides, LANES.md rule 6; generated files are regenerated, never hand-merged). Then pnpm install --frozen-lockfile; tsx tools/screening-capacity/watched.ts --write and pnpm synth --all, and commit anything they change in a follow-up commit (same trailer lines).
4. Checks on the merged tree: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm verify-content; pnpm check:fixtures; pnpm test (whole unit project); the db tests sign-in-routes.db.test.ts, sign-in.db.test.ts, scripts/seed.db.test.ts and whatever #83 changed under db tests (git diff --name-only bce57f16 origin/claude/build-platform); the browser harness step-timer.browser.test.tsx; then build and the e2e specs sign-in-time.spec.ts and every spec #83 touched (own database E2E_DATABASE=tp_e2e_fix2 E2E_PORT=3193, admin URL postgres://postgres:test@localhost:5433/postgres; drop it after). Root-cause and fix any failure.
Do NOT push. Return the commits made and the checks.`, { label: 'fix2', phase: 'Fix' })
phase('Check')
const check = await agent(`${COMMON}
${SAVE('sgn-fix2-check.md', 'each point checked')}
Adversarial checker, read only. Read git -C ${WT} log --oneline b8654622..HEAD and the diff b8654622..HEAD (excluding what the base brought in: compare with git diff b8654622^2... where useful; the merge's own resolution matters). Check: UXR2-01 applied as specified and tested; the merge is a real merge commit with the base as second parent, no hand-edited generated file, both sides kept in any shared document, nothing of #83 lost or reverted; the checks the fixer reports cover what the merge touched. The fixer reported: ${String(fix).slice(0, 5000)}
Return the real problems with evidence and fix, or "none".`, { label: 'fix2-check', phase: 'Check' })
return { fix, check }
