export const meta = {
  name: 'lane-b-unmapped-plan-base-merge',
  description: 'PR #95: merge base 88708069 (#92, #93 home figures, #90) into co-001/unmapped-plan, resolve the home headline conflicts keeping both PRs, targeted checks, adversarial check of the resolution, home shots and a UX check',
  phases: [{ title: 'Merge' }, { title: 'Verify' }, { title: 'Home' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/aa4b05fd-cf7b-57fe-8086-b5b14b24e00e/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/unmapped-plan'
const RULES = `Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, build, typecheck, lint, vitest, test:db, e2e, the screen tour's build and server) only under flock /tmp/laneb-heavy.lock, one at a time, long ones with run_in_background and waited on by notification. PostgreSQL 18 on port 5433. No migration, no non-test change under packages/pricing, no #42 file except the shared documents. Synthetic data only. No model name or identifier in any file. Never pkill -f a pattern your own shell matches. Never push the branch, never force, never comment on GitHub. The pacing call: spend nothing that does not change the outcome (no full suite here: CI runs everything on the pushed head).`
const S = r => (typeof r === 'string' ? r : JSON.stringify(r))

phase('Merge')
const merge = await agent(`Context: PaidWhole monorepo, Lane B PR #95 (combined audit #32, "one unmapped plan no longer freezes a whole month"), branch co-001/unmapped-plan, worktree ${WT}, HEAD 4748481f (the fix round, committed, not pushed; also on co-001/wip-unmapped-plan-4). ${RULES}
YOUR TASK: merge the latest claude/build-platform (origin, now 88708069 or later: #92 UX PR 6 sign-in time, #93 UX PR 9 home figures, #90 the Anthropic SDK bump) into the branch with a merge commit (LANES.md rule 6: this PR merges second, so it resolves, keeping BOTH PRs' changes). The trial merge conflicts in apps/web/src/app/p/[practiceId]/page.tsx and apps/web/src/lib/dashboard/queries.ts: both PRs changed the home headline.
- Read both sides' intent first: UX PR 9's design /home/user/ops/designs/lane-b-ux-home-figures.md (D10 and its findings F1-F13) and its merged diff (git -C ${WT} show 877e662f --stat, and git diff of those two files between 43565235 and origin/claude/build-platform); and this PR's: design /home/user/ops/designs/lane-b-unmapped-plan.md §5.7 and its review dispositions /home/user/ops/designs/lane-b-unmapped-plan/pr95-dispositions.md (UX-1: the Actionable count uses ACTIONABLE_NOW_LINES, the same predicate as its cents, with a server-computed notCurrentLines note "N lines in cases are out of the Actionable figure: their pricing is no longer current ... Review them on Cases"; the two new home Alerts for unmapped plans and mapped-not-priced lines).
- Resolve so that every rule of both holds: if UX PR 9 already fixed the count/cents mismatch another way, keep one predicate (never two figures that can disagree) and keep this PR's note only if it still says something true and needed; record exactly what you kept and why. Generated files (pnpm-lock.yaml, watched-paths.txt) are regenerated with their generators, never hand-merged; shared documents (test-matrix, synth matrix and registry) keep both sides.
- The merge commit message: "Merge claude/build-platform (<sha>: #90, #92, #93) into co-001/unmapped-plan; the home headline keeps UX PR 9's figures and #32's ..." (say what), then a blank line and:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKNB2TyuPCAha9BaEjQ
- Then, under the lock: pnpm install --frozen-lockfile; pnpm synth --all (keep output; say what it wrote); pnpm exec tsx tools/screening-capacity/watched.ts --write (keep output; if it changed, commit it in a follow-up commit with the same two trailer lines); pnpm typecheck; pnpm lint; pnpm lint:copy; vitest for the dashboard, home and headline tests (apps/web/src/components/dashboard/*.test.tsx, any dashboard db test, the home page tests) and for the PR's own changed tests that import dashboard queries; the db tests that read headlineOf; pnpm vitest run packages/synth. Fix anything the merge broke (commit each fix with the trailer lines).
${SAVE('merge2.md', 'the merge, the resolution decisions, each command and result')}
Return: the base sha merged, the resolution of each conflicted hunk and why, commits made (shas), each check with its result.`, { label: 'merge2', phase: 'Merge' })
if (!merge) throw new Error('merge agent returned nothing: stop')

phase('Verify')
const VERDICT = { type: 'object', properties: { sound: { type: 'boolean' }, problems: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'title', 'evidence', 'fix'] } }, summary: { type: 'string' } }, required: ['sound', 'problems', 'summary'] }
const v = await agent(`Context: PaidWhole monorepo; ${RULES}
You adversarially check a merge resolution in ${WT} (branch co-001/unmapped-plan; read only). The merging agent reported: ${S(merge)}
Read the merge commit (git -C ${WT} show --cc HEAD~0 or the merge sha it names; git diff between its two parents for apps/web/src/app/p/[practiceId]/page.tsx and apps/web/src/lib/dashboard/queries.ts). Try to break it: a line lost from either side (UX PR 9's figures and wording from designs/lane-b-ux-home-figures.md, #32's home Alerts and the UX-1 count fix), a home figure and its count computed with different predicates, a number computed in the client, wording outside .claude/rules/brand.md, a test that no longer asserts what its row says, a generated file hand-edited. Write nothing except ${SP}/progress/merge2-verify.md. Return sound or not with each problem.`, { label: 'merge2-verify', phase: 'Verify', schema: VERDICT })
let fix = null
if (v && v.problems.filter(p => p.severity !== 'nit').length) {
  fix = await agent(`Context: PaidWhole monorepo; ${RULES}
Fix these problems in the merge resolution in ${WT} (commit each fix on the branch with a message ending in a blank line and:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKNB2TyuPCAha9BaEjQ
), re-run the affected tests under the lock, and record each: ${JSON.stringify(v.problems)}
${SAVE('merge2-fix.md', 'each problem and its fix')}
Return what you changed and the test results.`, { label: 'merge2-fix', phase: 'Verify' })
}

phase('Home')
const home = await agent(`You retake the home screenshots of PR #95 after the base merge and check them. ${RULES}
${SAVE('merge2-home.md', 'each command and result')}
Push a WIP ref of the branch head (committed, clean): GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C ${WT} push origin HEAD:refs/heads/co-001/wip-unmapped-plan-5 (if it exists, -6; never force). Then follow /home/user/ops/tools/lane-b-screen-tour/README.md exactly as ${SP}/progress/fix-capture.md did: pull claude/build-ops first; TOUR_DIR=${SP}/screens-after3 (fresh), TOUR_REF=<the head sha>; TOUR_ONLY='p.home.unmapped-plan*'; setup.sh, build.sh under flock, run.sh with populate, touch stop, check 'server stopped' and fuser 3297/tcp, drop tp_e2e_screens, rm the temp dirs, then /usr/bin/python3 -I /home/user/ops/tools/lane-b-screen-tour/tile.py ${SP}/screens-after3 p.home.unmapped-plan.
Then look at the tiles (Read tool) at 1280 light, 1280 dark and 390, against .claude/agents/ux-brand-reviewer.md in ${WT} and the earlier after shots ${SP}/screens-after2 (the same ids): does the home read true and consistent (each figure and its count agree; #32's Alerts and UX PR 9's figures both present; nothing overlaps at 390)? Return: the WIP ref and sha, the shot count, and any defect as a finding (shot id, evidence, fix), or "none".`, { label: 'merge2-home', phase: 'Home' })

return { merge, verify: v, fix, home }